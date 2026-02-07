/**
 * Prompt Template for Terminal Command Generation
 * 
 * This module builds prompts for LLM-based terminal command generation.
 */

/**
 * Creates a prompt for generating a terminal command fix
 * 
 * @param prevCommands - Previous attempted fix commands
 * @param analysis - Previous error analysis
 * @returns The formatted prompt
 */
export function buildCommandFixPrompt(prevCommands: string[], analysis: string): string {
  const prevCommandsText = Array.isArray(prevCommands) && prevCommands.length > 0
    ? `\n\nPreviously tried commands:\n${prevCommands.map(cmd => `- ${cmd}`).join('\n')}`
    : '(none)';

  return `
You are a terminal command fixing AI. Given an analysis, extract a new command to fix it.

Error Analysis:
${analysis}

Previous Commands:
${prevCommandsText}

Instructions:
1. Analyze the Proposed Fix section carefully
2. Extract a single command that will fix the issue
3. The command should be complete and ready to run
4. Do not include any explanations, commentary, or markdown formatting
5. Only output the command itself

Generate ONLY the command, nothing else. No explanations, no markdown, just the raw command.
Make sure it's valid syntax that can be directly executed in a terminal.
`.trim();
}
