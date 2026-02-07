/**
 * Terminal Logger Module (Revised)
 *
 * Provides functionality to set up automatic terminal output logging by modifying
 * the user's .zshrc file (with explicit user permission). This enables capturing
 * runtime errors even when the application is not running, while attempting
 * to preserve terminal formatting and colors.
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import boxen from 'boxen';

/**
 * UI Tools interface for terminalLogger
 */
export interface UITools {
  askYesNo: (prompt: string, defaultValue?: boolean) => Promise<boolean>;
  askInput?: (prompt: string) => Promise<string>;
  closeReadline?: () => void;
}

// Markers used to identify the code block in .zshrc
const START_MARKER = '# >>> cloi initialize >>>';
const END_MARKER = '# <<< cloi initial <<<';

// Generate the ZSH script for terminal logging (Revised)
function generateZshLoggingScript(): string {
  return [
    START_MARKER,
    '_cloi_log_file_path="$HOME/.terminal_helper/terminal_output.log"',
    '_cloi_log_dir_path="$HOME/.terminal_helper"',
    '',
    '# Ensure log directory and file exist',
    'mkdir -p "$_cloi_log_dir_path"',
    'touch "$_cloi_log_file_path"',
    '',
    '_cloi_rotate_logs() {',
    '  if [[ ! -f "$_cloi_log_file_path" ]]; then',
    '    return 0',
    '  fi',
    '',
    '  local file_size',
    '  if command -v stat &>/dev/null; then',
    '    if [[ "$(uname)" == "Darwin" ]]; then # macOS',
    '      file_size=$(stat -f%z "$_cloi_log_file_path")',
    '    elif [[ "$(uname)" == "Linux" ]]; then # Linux',
    '      file_size=$(stat -c%s "$_cloi_log_file_path")',
    '    else',
    '      return 0',
    '    fi',
    '  else',
    '    return 0',
    '  fi',
    '',
    '  if (( file_size > 102400 )); then',
    '    local lines=$(wc -l < "$_cloi_log_file_path" | tr -d \' \')',
    '    if (( lines > 10 )); then',
    '        local half=$((lines / 2))',
    '        tail -n "$half" "$_cloi_log_file_path" > "${_cloi_log_file_path}.tmp" && \\',
    '        mv "${_cloi_log_file_path}.tmp" "$_cloi_log_file_path" && \\',
    '        printf "[%s] === Log file rotated by Cloi ===\\n" "$(date \'+%Y-%m-%d %H:%M:%S\')" >> "$_cloi_log_file_path"',
    '    fi',
    '  fi',
    '}',
    '',
    '_cloi_current_command_string=""',
    '',
    '_cloi_log_preexec() {',
    '  _cloi_current_command_string="$1"',
    '',
    '  if [[ -z "$_cloi_current_command_string" ]] ||',
    '     [[ "$_cloi_current_command_string" == *"_cloi_"* ]] ||',
    '     [[ "$_cloi_current_command_string" == "cloi"* ]] ||',
    '     [[ "$_cloi_current_command_string" == "source "*".zshrc"* ]] ||',
    '     [[ "$_cloi_current_command_string" == *"$_cloi_log_file_path"* ]]; then',
    '    return',
    '  fi',
    '',
    '  {',
    '    printf "===================================================\\n"',
    '    printf "[%s] COMMAND: %s\\n" "$(date \'+%Y-%m-%d %H:%M:%S\')" "$_cloi_current_command_string"',
    '    printf "[%s] DIRECTORY: %s\\n" "$(date \'+%Y-%m-%d %H:%M:%S\')" "$(pwd)"',
    '    printf "[%s] OUTPUT BEGINS BELOW:\\n" "$(date \'+%Y-%m-%d %H:%M:%S\')"',
    '    printf -- "---------------------------------------------------\\n"',
    '  } >> "$_cloi_log_file_path"',
    '}',
    '',
    '_cloi_log_precmd() {',
    '  if [[ -z "$_cloi_current_command_string" ]]; then',
    '    return',
    '  fi',
    '',
    '  local last_cmd_status=$?',
    '  local output',
    '',
    '  # Execute the previous command and capture its output',
    '  output=$(eval "$_cloi_current_command_string" 2>&1)',
    '',
    '  # Append the output to the log file',
    '  printf "%s\\n" "$output" >> "$_cloi_log_file_path"',
    '',
    '  # Log command footer (status)',
    '  {',
    '    printf -- "---------------------------------------------------\\n"',
    '    printf "[%s] EXIT STATUS: %s\\n" "$(date \'+%Y-%m-%d %H:%M:%S\')" "$last_cmd_status"',
    '    printf "===================================================\\n\\n"',
    '  } >> "$_cloi_log_file_path"',
    '',
    '  _cloi_current_command_string=""',
    '  _cloi_rotate_logs',
    '}',
    '',
    'typeset -ga preexec_functions precmd_functions',
    'preexec_functions=("${preexec_functions[@]}")',
    'precmd_functions=("${precmd_functions[@]}")',
    '',
    'if ! (($preexec_functions[(Ie)_cloi_log_preexec])); then',
    '  preexec_functions+=(_cloi_log_preexec)',
    'fi',
    'if ! (($precmd_functions[(Ie)_cloi_log_precmd])); then',
    '  precmd_functions+=(_cloi_log_precmd)',
    'fi',
    END_MARKER
  ].join('\n');
}

/**
 * Gets the path to the user's .zshrc file
 * @returns {string} Path to the user's .zshrc file
 */
export function getZshrcPath(): string {
  return join(homedir(), '.zshrc');
}

/**
 * Gets the path to the terminal output log file
 * @returns {string} Path to the terminal output log file
 */
export function getTerminalLogPath(): string {
  return join(homedir(), '.terminal_helper', 'terminal_output.log');
}

/**
 * Checks if the automatic logging function is already present in .zshrc
 * @returns {Promise<boolean>} True if the logging function exists
 */
export async function isLoggingEnabled(): Promise<boolean> {
  const zshrcPath = getZshrcPath();
  
  // Check if .zshrc exists
  if (!existsSync(zshrcPath)) {
    return false;
  }
  
  try {
    const content = await fs.readFile(zshrcPath, 'utf8');
    return content.includes(START_MARKER) && content.includes('_cloi_log_preexec');
  } catch (error) {
    console.error(`Error checking .zshrc: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Adds the logging function to the user's .zshrc file
 * @returns {Promise<boolean>} True if the function was added successfully
 */
export async function enableLogging(): Promise<boolean> {
  const zshrcPath = getZshrcPath();
  
  try {
    let content = '';
    // Check if .zshrc exists, create it if it doesn't
    if (existsSync(zshrcPath)) {
      content = await fs.readFile(zshrcPath, 'utf8');
      
      // Remove existing block if present
      const startIndex = content.indexOf(START_MARKER);
      const endIndex = content.indexOf(END_MARKER);
      if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        content = content.substring(0, startIndex) + 
                 content.substring(endIndex + END_MARKER.length);
        // Clean up excessive newlines
        content = content.replace(/\n\s*\n/g, '\n').trim();
      }
    }
    
    // Generate the zsh logging script and append it
    const zshScript = generateZshLoggingScript();
    const finalContent = (content ? content + '\n\n' : '') + zshScript;
    await fs.writeFile(zshrcPath, finalContent, 'utf8');
    return true;
  } catch (error) {
    console.error(`Error modifying .zshrc: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Prompts the user for permission to enable automatic terminal output logging
 * @param {UITools} uiTools - Object containing UI tools (askYesNo, askInput, etc.)
 * @param {boolean} showModelSelection - Whether to show model selection (default: false)
 * @returns {Promise<boolean>} True if the user granted permission and logging was enabled
 */
export async function setupTerminalLogging(uiTools: UITools, showModelSelection = false): Promise<boolean> {
  // Dynamic import to avoid circular dependencies and get BOX
  const { BOX } = await import('../ui/terminalUI.js');
  
  // Use provided UI tools or import them if not provided
  const { askYesNo } = uiTools;
  
  const alreadyEnabled = await isLoggingEnabled();
  
  if (alreadyEnabled) {
    console.log(boxen(
      chalk.gray('Terminal logging is already enabled.'),
      { ...BOX.OUTPUT, title: 'Status' }
    ));
    return true;
  }
  
  console.log(boxen(
    [
      '',
      'This will add a small script to your .zshrc file that automatically logs terminal commands and their output.',
      'This helps Terminal Helper detect and diagnose errors even when not explicitly running with `/debug`.',
      '',
      'How it works:',
      '- Creates a log file at ~/.terminal_helper/terminal_output.log',
      '- Logs all commands and their output',
      '- Automatically rotates logs to save disk space',
      '',
      'Would you like to enable this feature? (y/N):',
    ].join('\n'),
    { ...BOX.CONFIRM, title: 'Terminal Logging' }
  ));
  
  const response = await askYesNo('', true);
  console.log(response ? 'y' : 'N');
  
  if (!response) {
    return false;
  }
  
  const success = await enableLogging();
  
  if (success) {
    console.log(boxen(
      chalk.green('Terminal logging setup successful.\nPlease restart your terminal or run `source ~/.zshrc` to activate.'),
      { ...BOX.OUTPUT, title: 'Success' }
    ));
    
    // After successful logging setup, ask user to set default model only if showModelSelection is true
    if (showModelSelection) {
      console.log(boxen(
        'Would you like to set a default model to use? (y/N):',
        { ...BOX.CONFIRM, title: 'Default Model Setup' }
      ));
      
      const setModelResponse = await askYesNo('', true);
      console.log(setModelResponse ? 'y' : 'N');
      
      if (setModelResponse) {
        // Import the necessary functions to select a model
        const { setDefaultModel } = await import('./modelConfig.js');
        
        // Import the selectModelFromList function
        const { selectModelFromList } = await import('../cli/index.js');
        
        console.log(boxen(
          'Please select your preferred default model:',
          { ...BOX.PROMPT, title: 'Model Selection' }
        ));
        
        const selectedModel = await selectModelFromList();
        
        if (selectedModel) {
          // Save the selected model as default
          const saveResult = await setDefaultModel(selectedModel);
          
          if (saveResult) {
            console.log(boxen(
              chalk.green(`Your default model has been set to: ${selectedModel}`),
              { ...BOX.OUTPUT, title: 'Success' }
            ));
          } else {
            console.log(boxen(
              chalk.gray('Failed to save the default model.'),
              { ...BOX.OUTPUT_DARK, title: 'Setup Incomplete' }
            ));
          }
        }
      }
    }
    
    console.log(boxen(
      'Please restart your terminal or run "source ~/.zshrc" for changes to take effect. Run `cloi` when you encounter the next error.',
      { ...BOX.OUTPUT, title: 'Action Required' }
    ));
    
    // Force exit the process after showing the message
    // First cleanup any resources
    if (uiTools.closeReadline) {
      uiTools.closeReadline();
    }
    
    // Force exit with a minimal delay to allow the message to be displayed
    process.stdout.write('\n');
    
    // Ensure all terminal state is reset and process exits 
    setTimeout(() => {
      // This is the most reliable way to force Node.js to exit
      process.exit(0);
    }, 100);
    
    return true;
  } else {
    console.log(boxen(
      chalk.red('Failed to enable terminal logging.'),
      { ...BOX.OUTPUT, title: 'Error' }
    ));
    return false;
  }
}

/**
 * Removes the logging function from the user's .zshrc file
 * @returns {Promise<boolean>} True if the function was removed successfully
 */
export async function disableLogging(): Promise<boolean> {
  const zshrcPath = getZshrcPath();
  
  // Check if .zshrc exists
  if (!existsSync(zshrcPath)) {
    return true; // Nothing to disable
  }
  
  try {
    let content = await fs.readFile(zshrcPath, 'utf8');
    
    // Remove the logging code block using start/end markers
    const startIndex = content.indexOf(START_MARKER);
    const endIndex = content.indexOf(END_MARKER);
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      content = content.substring(0, startIndex) + 
               content.substring(endIndex + END_MARKER.length + 1);
      // Clean up excessive newlines
      content = content.replace(/\n\s*\n/g, '\n').trim();
      await fs.writeFile(zshrcPath, content ? content + '\n' : '', 'utf8');
    }
    return true;
  } catch (error) {
    console.error(`Error modifying .zshrc during disable: ${(error as Error).message}`);
    return false;
  }
}
