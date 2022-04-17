import assert from 'assert';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const appPath = fs.realpathSync(process.cwd());
const join = (realactivePath: string) => path.join(appPath, realactivePath);

const checkRequired = (config: Config) => {
  const { appId, clusterName, configServerUrl } = config;
  assert(appId, 'appId is required');
  assert(clusterName, 'clusterName is required');
  assert(configServerUrl, 'configServerUrl is required');
};

const getRemoteUrls = (config: Config) => {
  checkRequired(config);
  const {
    appId,
    isCache,
    clientIp,
    releaseKey,
    clusterName,
    namespaceName,
    configServerUrl,
  } = config;
  const nameSpace = namespaceName
    ? Array.isArray(namespaceName)
      ? namespaceName
      : [namespaceName]
    : ['application'];

  if (nameSpace.length === 0) nameSpace.push('application');

  return nameSpace.reduce((pre, item) => {
    let url = `${configServerUrl}/configs/${appId}/${clusterName}/${item}`;
    let query = '';
    if (isCache && releaseKey) query += `&releaseKey=${releaseKey}`;
    if (clientIp) query += `&ip=${clientIp}`;
    if (query) url = `${url}?${query.slice(1)}`;
    pre.push(url);
    return pre;
  }, [] as string[]);
};

export const createEnvFile = (
  envFileName: string,
  data: Record<string, string>,
  clear = true
) => {
  const envFilePath = join(envFileName);
  if (fs.existsSync(envFilePath) && clear) fs.unlinkSync(envFilePath);
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = data[key];
      fs.appendFileSync(envFilePath, `${key}=${value}\n`);
    }
  }
};

export const setEnv = (envFileName: string) =>
  dotenv.config({ path: join(envFileName) });

export default async (config: Config) => {
  const remoteUrls = getRemoteUrls(config);
  try {
    const response = await Promise.all(remoteUrls.map(url => axios.get(url)));
    const envData = response.reduce((pre, cur) => {
      const result = {};
      const { status, data } = cur;
      if (status === 200 && data) {
        const { configurations } = data;
        Object.assign(result, configurations || data);
      }
      return { ...pre, ...result };
    }, {});

    if (config.createEnv === true) {
      const { isSetEnv = true, envFileName, beforeClear = true } = config;
      createEnvFile(envFileName, envData, beforeClear);
      isSetEnv && setEnv(envFileName);
    }

    return envData;
  } catch (error) {
    assert(false, error as any);
  }
};

interface FetchRemoteConfig {
  /** @description apollo 上的 appId */
  appId: string;
  /** @description 客户端 ip 地址 */
  clientIp?: string;
  /** @description 是否开启缓存 */
  isCache?: boolean;
  /** @description 缓存的 key */
  releaseKey?: string;
  /** @description 组名称 */
  clusterName: string;
  /** @description apollo config 服务的 url */
  configServerUrl: string;
  /** @description 应用名称 */
  namespaceName?: string | string[];
}
interface BaseConfig extends FetchRemoteConfig {
  createEnv?: false;
}
interface EnvConfig extends FetchRemoteConfig {
  createEnv: true;
  isSetEnv?: boolean;
  envFileName: string;
  beforeClear?: boolean;
}
type Config = BaseConfig | EnvConfig;
