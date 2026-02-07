const DANGEROUS_COMMANDS = ['rm -rf /', 'mkfs', ':(){:|:&};:']; // Bir "fork bomb" örneği de ekleyelim

/**
 * Checks if a command is safe to execute
 * @param {string} command - The command to check
 * @returns {boolean} True if the command is safe
 */
export function isCommandSafe(command: string): boolean {
  if (command.trim().startsWith('sudo')) {
      console.warn("Warning: This plan includes a 'sudo' command. Please review carefully.");
  }

  for (const dangerous of DANGEROUS_COMMANDS) {
    if (command.includes(dangerous)) {
      return false;
    }
  }
  return true;
}
