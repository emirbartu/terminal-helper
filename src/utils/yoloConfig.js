/**
 * YOLO Mode Configuration Module
 * 
 * Manages YOLO (You Only Live Once) mode settings for unrestricted AI access.
 * When enabled, the AI can run commands with elevated privileges (sudo).
 * WARNING: Use with extreme caution!
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.cloi');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/**
 * Gets the current configuration object
 * @returns {Promise<Object>} Configuration object
 */
async function getConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = await fs.readFile(CONFIG_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    // Config doesn't exist yet, return defaults
  }
  
  return {
    yolo: {
      enabled: false,
      confirmed: false
    }
  };
}

/**
 * Saves the configuration object
 * @param {Object} config Configuration object to save
 * @returns {Promise<boolean>} True if successful
 */
async function saveConfig(config) {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Error saving config: ${error.message}`);
    return false;
  }
}

/**
 * Checks if YOLO mode is enabled
 * @returns {Promise<boolean>} True if YOLO mode is enabled
 */
export async function isYOLOEnabled() {
  const config = await getConfig();
  return config.yolo?.enabled === true;
}

/**
 * Checks if user has confirmed YOLO mode risks
 * @returns {Promise<boolean>} True if user has confirmed
 */
export async function hasYOLOConfirmed() {
  const config = await getConfig();
  return config.yolo?.confirmed === true;
}

/**
 * Enables YOLO mode with confirmation
 * @returns {Promise<boolean>} True if successful
 */
export async function enableYOLO() {
  const config = await getConfig();
  
  if (!config.yolo) {
    config.yolo = {};
  }
  
  config.yolo.enabled = true;
  config.yolo.confirmed = true;
  config.yolo.enabledAt = new Date().toISOString();
  
  return saveConfig(config);
}

/**
 * Disables YOLO mode
 * @returns {Promise<boolean>} True if successful
 */
export async function disableYOLO() {
  const config = await getConfig();
  
  if (!config.yolo) {
    config.yolo = {};
  }
  
  config.yolo.enabled = false;
  config.yolo.disabledAt = new Date().toISOString();
  
  return saveConfig(config);
}

/**
 * Gets YOLO status information
 * @returns {Promise<Object>} YOLO status object
 */
export async function getYOLOStatus() {
  const config = await getConfig();
  return {
    enabled: config.yolo?.enabled === true,
    confirmed: config.yolo?.confirmed === true,
    autoApprove: config.yolo?.autoApprove === true,
    enabledAt: config.yolo?.enabledAt || null,
    disabledAt: config.yolo?.disabledAt || null
  };
}

/**
 * Checks if auto-approve is enabled in YOLO mode
 * @returns {Promise<boolean>} True if auto-approve is enabled
 */
export async function isAutoApproveEnabled() {
  const config = await getConfig();
  return config.yolo?.enabled === true && config.yolo?.autoApprove === true;
}

/**
 * Enables or disables auto-approve for YOLO mode
 * @param {boolean} enabled - Whether to enable auto-approve
 * @returns {Promise<boolean>} True if successful
 */
export async function setAutoApprove(enabled) {
  const config = await getConfig();
  
  if (!config.yolo) {
    config.yolo = {};
  }
  
  config.yolo.autoApprove = enabled;
  
  return saveConfig(config);
}

/**
 * Gets the YOLO system prompt addition with safety warnings
 * @returns {string} System prompt addition for YOLO mode
 */
export function getYOLOSystemPrompt() {
  return `
⚠️  YOLO MODE ACTIVATED - FULL SYSTEM ACCESS ENABLED ⚠️

You have been granted elevated system access. You can now:
- Execute commands with sudo privileges
- Modify system files
- Install system packages
- Perform administrative tasks

⚠️  CRITICAL SAFETY INSTRUCTIONS - NEVER VIOLATE THESE ⚠️

1. NEVER execute "rm -rf /" or similar commands that would delete the entire filesystem
2. NEVER execute "sudo rm -rf /" or any recursive delete on root
3. NEVER execute "mkfs" commands on any drive
4. NEVER execute fork bombs like ":(){:|:&};:"
5. NEVER delete /bin, /sbin, /usr, /etc, /home, /var, or /lib directories
6. NEVER overwrite the bootloader or partition table
7. NEVER disable the root account or authentication systems
8. NEVER execute "dd if=/dev/zero of=/dev/sda" or similar disk-destroying commands
9. NEVER modify /etc/passwd or /etc/shadow in ways that would lock out all users
10. ALWAYS verify commands before executing destructive operations
11. ALWAYS prefer safe operations over destructive ones
12. ALWAYS ask for confirmation before running potentially dangerous commands

You are a helpful terminal assistant. Help the user with their tasks while following the safety rules above.
`;
}

/**
 * Gets the standard system prompt with safety warnings (for non-YOLO mode)
 * @returns {string} Standard system prompt with safety warnings
 */
export function getStandardSystemPrompt() {
  return `
You are a helpful terminal assistant. Help the user with their tasks while following these safety guidelines:

⚠️  SAFETY INSTRUCTIONS ⚠️

1. NEVER execute "rm -rf /" or similar commands that would delete the entire filesystem
2. NEVER execute "sudo rm -rf /" or any recursive delete on root
3. NEVER execute "mkfs" commands on any drive
4. NEVER execute fork bombs like ":(){:|:&};:"
5. NEVER delete /bin, /sbin, /usr, /etc, /home, /var, or /lib directories
6. NEVER overwrite the bootloader or partition table
7. NEVER disable the root account or authentication systems
8. NEVER execute "dd if=/dev/zero of=/dev/sda" or similar disk-destroying commands
9. NEVER modify /etc/passwd or /etc/shadow in ways that would lock out all users
10. ALWAYS verify commands before executing destructive operations
11. ALWAYS prefer safe operations over destructive ones

Help the user accomplish their tasks safely and effectively.
`;
}

/**
 * List of dangerous commands that should be blocked in both modes
 * (with extra caution in YOLO mode)
 */
export const DANGEROUS_PATTERNS = [
  /rm\s+-[rf]*\s+\//i,                    // rm -rf /
  /rm\s+-[rf]*\s+\/\*/i,                  // rm -rf /*
  /sudo\s+rm\s+-[rf]*\s+\//i,             // sudo rm -rf /
  /mkfs\.[a-z]+\s+\//i,                   // mkfs.* /
  /mkfs\.[a-z]+\s+\/dev\/sda/i,           // mkfs on sda
  /mkfs\.[a-z]+\s+\/dev\/nvme/i,          // mkfs on nvme
  /dd\s+if=.*\s+of=\/(dev\/sd|dev\/nvme|dev\/hd)/i, // dd to disk
  /:\(\)\{\s*:\|:&\s*\};:\s*\)/,         // Fork bomb
  /mv\s+.*\/bin\s+\//i,                   // Moving /bin
  /mv\s+.*\/sbin\s+\//i,                  // Moving /sbin
  /mv\s+.*\/usr\s+\//i,                   // Moving /usr
  /mv\s+.*\/etc\s+\//i,                   // Moving /etc
  /mv\s+.*\/lib\s+\//i,                   // Moving /lib
  /mv\s+.*\/home\s+\//i,                  // Moving /home
  /rm\s+-[rf]*\s+\/(bin|sbin|usr|etc|lib|home|var)\b/i, // rm critical dirs
  />\s*\/etc\/passwd/i,                   // Overwriting passwd
  />\s*\/etc\/shadow/i,                   // Overwriting shadow
];

/**
 * Checks if a command matches dangerous patterns
 * @param {string} command - The command to check
 * @returns {boolean} True if command is dangerous
 */
export function isDangerousCommand(command) {
  if (!command || typeof command !== 'string') {
    return false;
  }
  
  const normalizedCmd = command.trim().toLowerCase();
  
  return DANGEROUS_PATTERNS.some(pattern => pattern.test(normalizedCmd));
}

/**
 * Validates a command for safety
 * @param {string} command - The command to validate
 * @param {boolean} isYOLO - Whether YOLO mode is enabled
 * @returns {{safe: boolean, reason: string|null}} Validation result
 */
export function validateCommandSafety(command, isYOLO = false) {
  // Always block extremely dangerous commands, even in YOLO mode
  if (isDangerousCommand(command)) {
    return {
      safe: false,
      reason: 'This command matches a known dangerous pattern that could destroy the system. It has been blocked for safety.'
    };
  }
  
  // In non-YOLO mode, warn about sudo
  if (!isYOLO && command.trim().startsWith('sudo')) {
    return {
      safe: true,
      reason: 'Warning: This command requires sudo. Enable YOLO mode (/yolo) to execute commands with elevated privileges.',
      requiresSudo: true
    };
  }
  
  return { safe: true, reason: null };
}
