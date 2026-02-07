/**
 * Prompt Template for Classification Tasks
 * 
 * This module builds prompts for LLM-based classification of errors.
 */

/**
 * Creates a prompt for determining error type (terminal command or code issue)
 * 
 * @param errorOutput - The error output to analyze
 * @param analysis - Previous analysis of the error
 * @returns The formatted prompt
 */
export function buildErrorTypePrompt(_errorOutput: string, analysis: string): string {
  return `
You are a binary classifier AI. Your ONLY task is to classify if a fix requires code changes or terminal commands.

ANALYSIS:
${analysis}

INSTRUCTIONS:
1. Look at the Proposed Fix section
2. If the fix requires running a command (like pip install, npm install, etc.), output: TERMINAL_COMMAND_ERROR
3. If the fix requires changing code files, output: CODE_FILE_ISSUE
4. You MUST output ONLY ONE of these exact phrases, and no additional thoughts: "TERMINAL_COMMAND_ERROR" or "CODE_FILE_ISSUE"

Output ONLY ONE of these exact phrases. No need for long explanations. Just a simple single word output:
'TERMINAL_COMMAND_ERROR',
'CODE_FILE_ISSUE'
`.trim();
}
