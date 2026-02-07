import readline from 'readline';

/**
 * Prompts the user for a yes/no confirmation in the terminal.
 * Uses readline to capture user input.
 * @param {string} question - The question to display before the prompt.
 * @returns {Promise<boolean>} - Resolves true for 'y'/'Y', false otherwise.
 */
export function askYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(`${question} (y/n) `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}
