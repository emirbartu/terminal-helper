import { getStandardSystemPrompt, getYOLOSystemPrompt, isYOLOEnabled } from '../../utils/yoloConfig.js';

export async function buildTaskPlanPrompt(query, systemInfo) {
  if (!systemInfo) {
    systemInfo = { distro: 'an unknown OS', platform: 'unknown' };
  }

  const isYOLO = await isYOLOEnabled();
  const systemPrompt = isYOLO ? getYOLOSystemPrompt() : getStandardSystemPrompt();

  return `${systemPrompt}

You are a helpful assistant for a command-line interface.
The user is running on ${systemInfo.distro} (${systemInfo.platform}).
The user wants to accomplish the following task: "${query}".
Your task is to generate a plan and the necessary shell commands to achieve this.
Provide your response as a single, valid JSON object with two keys: "plan_steps" (an array of strings) and "commands" (an array of strings). Do not include any other text, explanations, or markdown formatting outside of the JSON object.

Example for "list all files and count them":
{
  "plan_steps": ["List all files in the current directory.", "Pipe the output to count the number of lines."],
  "commands": ["ls -la | wc -l"]
}

Now, for the user query: "${query}"
  `;
}