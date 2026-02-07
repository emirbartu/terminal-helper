/**
 * Terminal Logs Module
 * 
 * Provides utilities for reading and analyzing terminal logs.
 * This module is used to extract recent errors from terminal logs,
 * which helps the application diagnose issues without re-running commands.
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import { getTerminalLogPath } from './terminalLogger.js';

/**
 * Extracted error result
 */
export interface ExtractedError {
  error: string;
  files: Map<string, number>;
}

/**
 * Read recently logged terminal output
 * @param {number} [maxLines=750] Maximum number of lines to read
 * @returns {Promise<string>} Terminal log content
 */
export async function readTerminalLogs(maxLines = 750): Promise<string> {
  const terminalLogPath = getTerminalLogPath();
  
  if (!existsSync(terminalLogPath)) {
    return '';
  }
  
  try {
    // Read the file and get the last maxLines lines
    const content = await fs.readFile(terminalLogPath, 'utf8');
    const lines = content.split('\n');
    return lines.slice(-maxLines).join('\n');
  } catch (error) {
    console.error(`Error reading terminal logs: ${(error as Error).message}`);
    return '';
  }
}

/**
 * Determines if a log excerpt likely contains a runtime error
 * @param {string} log - Log content to analyze
 * @returns {boolean} True if the log appears to contain a runtime error
 */
export function isLikelyRuntimeError(log: string): boolean {
  const errorPatterns = [
    /error/i,
    /exception/i,
    /traceback/i,
    /fail/i,
    /crash/i,
    /stack trace/i,
    /warning/i,
  ];
  
  return errorPatterns.some(pattern => pattern.test(log));
}

/**
 * Extract the most recent error from terminal logs
 * @returns {Promise<ExtractedError>} Extracted error and related files
 */
export async function extractRecentError(): Promise<ExtractedError> {
  const logs = await readTerminalLogs();
  
  // No logs available
  if (!logs) {
    return { error: '', files: new Map() };
  }
  
  // Split into "command blocks" using the consistent separator
  // Each block starts with the separator and contains command info and output
  const commandBlocks = logs.split("===================================================\n")
    .filter(block => block.trim() !== "" && block.includes("COMMAND:"));
  
  // Look through recent command blocks for errors, starting from the most recent
  for (let i = commandBlocks.length - 1; i >= 0; i--) {
    const block = commandBlocks[i];
    
    // Extract the part of the block that is the actual command output
    const outputHeader = "OUTPUT BEGINS BELOW:\n---------------------------------------------------\n";
    const outputStartIndex = block.indexOf(outputHeader);
    
    if (outputStartIndex !== -1) {
      const outputContent = block.substring(outputStartIndex + outputHeader.length);
      const outputEndMarker = "\n---------------------------------------------------\n"; // Before EXIT STATUS
      const outputEndIndex = outputContent.indexOf(outputEndMarker);
      const pureOutput = (outputEndIndex !== -1) ? 
                        outputContent.substring(0, outputEndIndex) : 
                        outputContent;
      
      if (isLikelyRuntimeError(pureOutput)) {
        // We found a likely error block, now extract file references
        
        // Import the traceback analyzer
        const { extractFilesFromTraceback } = await import('./traceback.js');
        const files = extractFilesFromTraceback(pureOutput);
        
        return {
          error: pureOutput, // Return just the command output part as the error
          files: files
        };
      }
    }
  }
  
  return { error: '', files: new Map() };
}
