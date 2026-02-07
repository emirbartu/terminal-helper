import si from 'systeminformation';
import os from 'os';

/**
 * System information object
 */
export interface SystemInfo {
  platform: string;
  distro: string;
  arch: string;
  hostname: string;
  username: string;
}

/**
 * Gets system information
 * @returns {Promise<SystemInfo>}
 */
export async function getSystemInfo(): Promise<SystemInfo> {
  try {
    const osInfo = await si.osInfo();
    return {
      platform: osInfo.platform,
      distro: osInfo.distro,
      arch: osInfo.arch,
      hostname: os.hostname(),
      username: os.userInfo().username,
    };
  } catch (error) {
    console.error("Could not get system info:", error);
    return {
      platform: 'unknown',
      distro: 'unknown',
      arch: 'unknown',
      hostname: 'unknown',
      username: 'unknown',
    };
  }
}
