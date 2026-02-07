/**
 * UI Box Display and Interactive Prompt Module
 * 
 * Provides utilities for:
 * 1. Creating consistent, styled terminal boxes for various UI elements
 * 2. Interactive terminal UI components for user input
 * 
 * This module contains predefined box styles, helper functions for boxed content,
 * readline management, yes/no confirmations, and an interactive item picker.
 * It enhances the terminal UI by providing visually distinct areas and intuitive
 * ways for users to interact with the application.
 */

import boxen, { Options as BoxenOptions } from 'boxen';
import chalk from 'chalk';
import readline from 'readline';

/* ─────────────────────────────  Boxen Presets  ──────────────────────────── */

/**
 * Interface for box preset configuration
 */
export interface BoxPreset {
  padding: number;
  margin: number;
  borderStyle: BoxenOptions['borderStyle'];
  width: number;
  title?: string;
}

/**
 * Interface for the BOX presets object
 */
export interface BoxPresets {
  WELCOME: BoxPreset;
  PROMPT: BoxPreset;
  OUTPUT: BoxPreset;
  ERROR: BoxPreset;
  ANALYSIS: BoxPreset;
  CONFIRM: BoxPreset;
  PICKER: BoxPreset;
  OUTPUT_DARK: BoxPreset;
}

export const BOX: BoxPresets = {
  WELCOME:  { padding: 0.5, margin: 0.5, borderStyle: 'round', width: 75 },
  PROMPT:   { padding: 0.2, margin: 0.5, borderStyle: 'round', width: 75 },
  OUTPUT:   { padding: 0.5, margin: 0.5, borderStyle: 'round', width: 75, title: 'Output' },
  ERROR:    { padding: 0.5, margin: 0.5, borderStyle: 'round', width: 75, title: 'Error' },
  ANALYSIS: { padding: 0.5, margin: 0.5, borderStyle: 'round', width: 75, title: 'AI Error Analysis' }, 
  CONFIRM:  { padding: 0.5, margin: 0.5, borderStyle: 'round', width: 75, title: 'Confirm' },
  PICKER:   { padding: 0.2, margin: 0.5, borderStyle: 'round', width: 75 },   // generic picker box
  OUTPUT_DARK: { padding: 0.5, margin: 0.5, borderStyle: 'round', width: 75, title: 'Reasoning' }
};

/* ─────────────────────────  Command Display Utilities  ─────────────────────────── */
/**
 * Prints a shell command styled within a box for visual clarity.
 * @param {string} cmd - The command string to display.
 */
export async function echoCommand(cmd: string): Promise<void> {
  console.log('');
  // Add a tiny pause to make the output feel more natural
  await new Promise(resolve => setTimeout(resolve, 150));
  console.log(`  ${chalk.blueBright.bold('$')} ${chalk.blueBright.bold(cmd)}`);
  console.log('');
}

/**
 * Creates a string for displaying a command with a $ prefix.
 * @param {string} cmd - The command to display.
 * @param {object} [options] - Additional options (kept for backward compatibility).
 * @returns {string} - A formatted string containing the command.
 */
export function createCommandBox(cmd: string, options: Record<string, unknown> = {}): string {
  // Return just styled text, no boxen
  return `  ${chalk.blueBright.bold('$')} ${chalk.blueBright.bold(cmd)}`;
}

/**
 * Truncates a multi-line string to a maximum number of lines,
 * showing the last few lines prefixed with an ellipsis if truncated.
 * @param {string} output - The string to truncate.
 * @param {number} [maxLines=2] - The maximum number of lines to keep.
 * @returns {string} - The potentially truncated string.
 */
export function truncateOutput(output: string, maxLines: number = 2): string {
  const lines = output.trimEnd().split(/\r?\n/);
  if (lines.length <= maxLines) return output;
  return lines.slice(-maxLines).join('\n');
}

/* ─────────────────────────  Event Listener Management  ─────────────────────────── */

/**
 * Interface for storing active listener references
 */
interface ListenerEntry {
  event: string;
  handler: (...args: any[]) => void;
}

let activeListeners: Set<ListenerEntry> = new Set();
let rl: readline.Interface | null = null;

function addListener(event: string, handler: (...args: any[]) => void): void {
  activeListeners.add({ event, handler });
  process.stdin.on(event, handler);
}

function removeListener(event: string, handler: (...args: any[]) => void): void {
  process.stdin.removeListener(event, handler);
  activeListeners.delete({ event, handler });
}

function cleanupAllListeners(): void {
  activeListeners.forEach(({ event, handler }) => {
    process.stdin.removeListener(event, handler);
  });
  activeListeners.clear();
}

/**
 * Ensures stdin is in a clean state by removing all listeners and resetting raw mode.
 * This should be called before and after any stdin operations.
 */
export function ensureCleanStdin(): void {
  if (rl) {
    rl.close();
    rl = null;
  }
  cleanupAllListeners();
  process.stdin.setRawMode(false);
  process.stdin.pause();
  while (process.stdin.read() !== null) { /* flush */ }
}

function checkForActiveListeners(): void {
  const listeners = process.stdin.listeners('keypress').length + 
                   process.stdin.listeners('data').length;
  if (listeners > 0) {
    console.warn(`Warning: Found ${listeners} active listeners`);
    cleanupAllListeners();
  }
}

/* ─────────────────────────  Readline Management  ─────────────────────────── */
/**
 * Lazily creates and returns a singleton readline interface instance.
 * Ensures that only one interface is active at a time.
 */
export function getReadline(): readline.Interface {
  ensureCleanStdin(); // Ensure clean state before creating new readline
  if (rl) return rl;
  rl = readline.createInterface({ 
    input: process.stdin, 
    output: process.stdout,
    terminal: true
  });
  rl.on('close', () => { 
    rl = null;
    ensureCleanStdin();
  });
  return rl;
}

/**
 * Closes the active readline interface and performs necessary cleanup.
 */
export function closeReadline(): void {
  if (rl) {
    rl.close();
    rl = null;
  }
  ensureCleanStdin();
}

/* ─────────────────────────  Yes/No Prompt  ─────────────────────────── */
/**
 * Prompts the user for a yes/no confirmation in the terminal.
 * Uses raw mode to capture single key presses (y/n).
 * @param {string} [question=''] - The question to display before the prompt.
 * @param {boolean} [silent=false] - If true, don't print the question text.
 * @returns {Promise<boolean>} - Resolves true for 'y'/'Y', false for 'n'/'N'.
 */
export async function askYesNo(question: string = '', silent: boolean = false): Promise<boolean> {
  closeReadline();
  if (!silent) process.stdout.write(`${question} (y/N): `);
  process.stdout.write('> ');
  
  return new Promise(res => {
    const cleanup = () => {
      ensureCleanStdin();
    };

    const onKeypress = (str: string) => {
      if (/^[yYnN]$/.test(str)) {
        const response = /^[yY]$/.test(str);
        // Echo the user's response and add a newline for proper spacing
        process.stdout.write(response ? 'y' : 'N');
        process.stdout.write('\n');
        cleanup();
        res(response);
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    readline.emitKeypressEvents(process.stdin);
    addListener('keypress', onKeypress);
  });
}

/* ─────────────────────────  Generic Picker UI  ─────────────────────────── */

/**
 * Interface for keypress event from readline
 */
interface KeypressEvent {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

/**
 * Interface for picker render function with prevLines property
 */
interface PickerRenderFunction {
  (): void;
  prevLines: number;
}

/**
 * Factory function to create an interactive terminal picker UI.
 * Allows selecting an item from a list using arrow keys/vim keys.
 * @param {string[]} items - The list of strings to choose from.
 * @param {string} [title='Picker'] - The title displayed on the picker box.
 * @returns {function(): Promise<string|null>} - An async function that, when called,
 * displays the picker and returns the selected item or null if cancelled.
 */
export function makePicker(items: string[], title: string = 'Picker'): () => Promise<string | null> {
  return async function picker(): Promise<string | null> {
    closeReadline();
    if (!items.length) return null;
  
    let idx = items.length - 1;
    const render: PickerRenderFunction = () => {
      const lines = items.map((it, i) => `${i === idx ? chalk.cyan('➤') : ' '} ${it}`);
      const help  = chalk.gray('\nUse ↑/↓ or k/j, Enter to choose, Esc/q to cancel');
      const boxed = boxen([...lines, help].join('\n'), { ...BOX.PICKER, title });
  
      if (render.prevLines) {
        process.stdout.write(`\x1B[${render.prevLines}F`);
        process.stdout.write('\x1B[J');
      }
      process.stdout.write(boxed + '\n');
      render.prevLines = boxed.split('\n').length;
    };
    render.prevLines = 0;
    render();
  
    return new Promise(resolve => {
      const cleanup = () => {
        ensureCleanStdin();
        process.stdout.write('\x1B[J');
      };
  
      const onKey = (str: string, key: KeypressEvent) => {
        if (key.name === 'up'   || str === 'k') { idx = Math.max(0, idx - 1); render(); }
        if (key.name === 'down' || str === 'j') { idx = Math.min(items.length - 1, idx + 1); render(); }
        if (key.name === 'return') { cleanup(); resolve(items[idx]); }
        if (key.name === 'escape' || str === 'q') { cleanup(); resolve(null); }
      };
  
      process.stdin.setRawMode(true);
      process.stdin.resume();
      readline.emitKeypressEvents(process.stdin);
      addListener('keypress', onKey);
    });
  };
}

/**
 * Prompts for input (API Key) with optional masking for sensitive data
 * @param {string} prompt - The prompt to display
 * @param {boolean} [mask=false] - Whether to mask the input
 * @returns {Promise<string>} - The user's input
 */
export async function askInput(prompt: string, mask: boolean = true): Promise<string> {
  closeReadline();
  return new Promise((resolve) => {
    const rl = getReadline();
    
    if (mask) {
      const stdin = process.stdin;
      const stdout = process.stdout;
      let input = '';
      
      const cleanup = () => {
        removeListener('data', onData);
        stdin.setRawMode(false);
        stdin.pause();
      };
      
      const onData = (data: Buffer) => {
        const char = data.toString();
        
        switch (char) {
          case '\u0003': // Ctrl+C
            cleanup();
            stdout.write('\n');
            process.exit();
            break;
          case '\u000D': // Enter
            cleanup();
            stdout.write('\n');
            resolve(input);
            break;
          case '\u007F': // Backspace
            if (input.length > 0) {
              input = input.slice(0, -1);
              stdout.write('\b \b');
            }
            break;
          default:
            if (char >= ' ') { // Printable characters
              input += char;
              stdout.write('*');
            }
        }
      };
      
      stdin.setRawMode(true);
      stdin.resume();
      addListener('data', onData);
    } else {
      rl.question(prompt, (answer) => {
        resolve(answer);
      });
    }
  });
}

/**
 * Factory function to create an interactive terminal picker UI with section headers.
 * Allows selecting an item from a list using arrow keys/vim keys, with support for
 * non-selectable section headers and spacers.
 * @param {string[]} items - The list of strings to choose from (including headers/spacers)
 * @param {Map<string, string | null>} modelMapping - Map of display names to model names (null for non-selectable)
 * @param {string} [title='Picker'] - The title displayed on the picker box.
 * @returns {function(): Promise<string|null>} - An async function that, when called,
 * displays the picker and returns the selected item or null if cancelled.
 */
export function makeSegmentedPicker(
  items: string[], 
  modelMapping: Map<string, string | null>, 
  title: string = 'Picker'
): () => Promise<string | null> {
  return async function picker(): Promise<string | null> {
    closeReadline();
    if (!items.length) return null;
  
    // Find first selectable item
    let idx = 0;
    while (idx < items.length && modelMapping.get(items[idx]) === null) {
      idx++;
    }
    if (idx >= items.length) return null; // No selectable items
    
    const render: PickerRenderFunction = () => {
      const lines = items.map((item, i) => {
        // Handle special display items
        if (item === 'OLLAMA_HEADER') {
          return chalk.cyan.bold('Ollama Models:');
        }
        if (item === 'SPACER') {
          return '';
        }
        
        // Regular model items
        const isSelected = i === idx;
        const isSelectable = modelMapping.get(item) !== null;
        
        if (!isSelectable) {
          return chalk.gray(item); // Non-selectable items in gray
        }
        
        return `${isSelected ? chalk.cyan('➤') : ' '} ${item}`;
      });
      
      const help = chalk.gray('\nUse ↑/↓ or k/j, Enter to choose, Esc/q to cancel');
      const boxed = boxen([...lines, help].join('\n'), { ...BOX.PICKER, title });
  
      if (render.prevLines) {
        process.stdout.write(`\x1B[${render.prevLines}F`);
        process.stdout.write('\x1B[J');
      }
      process.stdout.write(boxed + '\n');
      render.prevLines = boxed.split('\n').length;
    };
    render.prevLines = 0;
    render();
  
    return new Promise(resolve => {
      const cleanup = () => {
        ensureCleanStdin();
        process.stdout.write('\x1B[J');
      };
      
      const findNextSelectable = (currentIdx: number, direction: number): number => {
        let newIdx = currentIdx;
        do {
          newIdx += direction;
          if (newIdx < 0) newIdx = items.length - 1;
          if (newIdx >= items.length) newIdx = 0;
        } while (modelMapping.get(items[newIdx]) === null && newIdx !== currentIdx);
        return newIdx;
      };
  
      const onKey = (str: string, key: KeypressEvent) => {
        if (key.name === 'up' || str === 'k') { 
          idx = findNextSelectable(idx, -1); 
          render(); 
        }
        if (key.name === 'down' || str === 'j') { 
          idx = findNextSelectable(idx, 1); 
          render(); 
        }
        if (key.name === 'return') { 
          if (modelMapping.get(items[idx]) !== null) {
            cleanup(); 
            resolve(items[idx]); 
          }
        }
        if (key.name === 'escape' || str === 'q') { 
          cleanup(); 
          resolve(null); 
        }
      };
  
      process.stdin.setRawMode(true);
      process.stdin.resume();
      readline.emitKeypressEvents(process.stdin);
      addListener('keypress', onKey);
    });
  };
}
