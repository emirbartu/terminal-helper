/**
 * Shell History Management Module
 * 
 * Provides utilities for reading and interacting with the user's shell command history.
 * Includes functions to fetch recent commands, find the last relevant command,
 * and present an interactive selection interface. This module enables the application
 * to reference and reuse previous terminal commands.
 */

import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// CHECK

/* ───────────────────────── Shell History Reader ────────────────────────────── */
/**
 * Reads the shell history based on the detected shell type.
 * Supports fish, zsh, and bash shells.
 * @returns {Promise<string[]>} - Array of command strings.
 */
export async function readHistory(): Promise<string[]> {
   const shell = process.env.SHELL || '';
   const hist  = shell.includes('fish')
     ? join(homedir(), '.local/share/fish/fish_history')
     : shell.includes('zsh')
       ? join(homedir(), '.zsh_history')
       : join(homedir(), '.bash_history');
   try {
     const raw = await fs.readFile(hist, 'utf8');
     if (hist.endsWith('fish_history')) {
       return raw.split('\n- cmd:').slice(1).map(l => l.split('\n')[0].trim());
     }
     if (hist.endsWith('zsh_history')) {
       return raw
         .split('\n')
         .filter(Boolean)
         .map(l => l.replace(/^.*?;/, '').trim());
     }
     return raw.split('\n').filter(Boolean);
   } catch {
     return [];
   }
 }

/* ───────────────────────── Last Command Retrieval ────────────────────────────── */
/**
 * Finds the most recent command in history that isn't a call to figai itself.
 * @returns {Promise<string | null>} - The last relevant user command, or null if none found.
 */
export async function lastRealCommand(): Promise<string | null> {
  const h = await readHistory();
  return [...h]
    .reverse()
    .find(c => !/cloi|node .*cloi/i.test(c) && c.trim())
    || null;
}

/* ───────────────────────── Interactive History Selector ────────────────────────────── */
/**
 * Displays the command history using the interactive picker UI and returns the selected command.
 * @param {number} [limit=15] - Number of recent history items to display.
 * @returns {Promise<string | null>} - The selected command string, or null if cancelled.
 */
export async function selectHistoryItem(limit = 15): Promise<string | null> {
  const history = (await readHistory()).slice(-limit);
  const items   = history.map((cmd,i) => `${history.length - limit + i + 1}: ${cmd}`);
  
  // Dynamic import to avoid circular dependencies
  const { makePicker } = await import('../ui/terminalUI.js');
  const choice  = await makePicker(items, 'Command History')();
  
  if (!choice) return null;
  // Extract command after the first colon+space
  return choice.replace(/^\d+:\s*/, '');
}
