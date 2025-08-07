const DANGEROUS_COMMANDS = ['rm -rf /', 'mkfs', ':(){:|:&};:']; // Bir "fork bomb" örneği de ekleyelim

export function isCommandSafe(command) {
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