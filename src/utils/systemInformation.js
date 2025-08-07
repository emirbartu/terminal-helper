import si from 'systeminformation';
import os from 'os';

export async function getSystemInfo() {
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
    // Hata durumunda bile programın çökmemesi için varsayılan değerler dön
    return {
      platform: 'unknown',
      distro: 'unknown',
      arch: 'unknown',
      hostname: 'unknown',
      username: 'unknown',
    };
  }
}