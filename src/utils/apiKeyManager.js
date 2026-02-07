/**
 * API Key Manager Module
 * 
 * Handles detection and validation of API keys from environment variables,
 * specifically focusing on Anthropic API keys in .zshrc files.
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Cache for API key detection to avoid repeated file reads
let _claudeAvailableCache = null;
let _cacheTimestamp = null;
const CACHE_DURATION = 30000; // 30 seconds

// Cache for OpenAI API key detection
let openAIAvailableCache = null;
let openAILastCheck = 0;
const OPENAI_CACHE_TTL = 30000; // 30 seconds

/**
 * Gets the path to the user's .zshrc file
 * @returns {string} Path to the user's .zshrc file
 */
export function getZshrcPath() {
  return join(homedir(), '.zshrc');
}

/**
 * Parses environment variables from .zshrc content
 * @param {string} content - Content of the .zshrc file
 * @returns {Object} Object containing environment variables
 */
export function parseEnvironmentVariables(content) {
  const envVars = {};
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip comments and empty lines
    if (trimmed.startsWith('#') || !trimmed) {
      continue;
    }
    
    // Match export VAR="value" or VAR="value" patterns
    const exportMatch = trimmed.match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)=["']?([^"']+)["']?$/);
    if (exportMatch) {
      const [, varName, varValue] = exportMatch;
      envVars[varName] = varValue;
    }
  }
  
  return envVars;
}

/**
 * Validates the format of an Anthropic API key
 * @param {string} apiKey - The API key to validate
 * @returns {boolean} True if the API key format is valid
 */
export function validateApiKeyFormat(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }
  
  // Anthropic API keys start with 'sk-ant-'
  return apiKey.startsWith('sk-ant-') && apiKey.length > 20;
}

/**
 * Detects if an Anthropic API key is present in .zshrc
 * @returns {Promise<boolean>} True if a valid API key is found
 */
export async function detectAnthropicApiKey() {
  const zshrcPath = getZshrcPath();
  
  // Check if .zshrc exists
  if (!existsSync(zshrcPath)) {
    return false;
  }
  
  try {
    const content = await fs.readFile(zshrcPath, 'utf8');
    const envVars = parseEnvironmentVariables(content);
    
    // Check for ANTHROPIC_API_KEY
    const apiKey = envVars.ANTHROPIC_API_KEY;
    return validateApiKeyFormat(apiKey);
  } catch (error) {
    console.error(`Error reading .zshrc: ${error.message}`);
    return false;
  }
}

/**
 * Checks if Claude is available (with caching)
 * @param {boolean} forceRefresh - Force refresh the cache
 * @returns {Promise<boolean>} True if Claude is available
 */
export async function isClaudeAvailable(forceRefresh = false) {
  const now = Date.now();
  
  // Return cached result if valid and not forcing refresh
  if (!forceRefresh && _claudeAvailableCache !== null && _cacheTimestamp && (now - _cacheTimestamp) < CACHE_DURATION) {
    return _claudeAvailableCache;
  }
  
  // Detect API key availability
  const available = await detectAnthropicApiKey();
  
  // Update cache
  _claudeAvailableCache = available;
  _cacheTimestamp = now;
  
  return available;
}

/**
 * Gets the Anthropic API key from environment variables
 * Note: This function reads from process.env, not .zshrc directly
 * The API key should be loaded into the environment before calling this
 * @returns {string|null} The API key if available, null otherwise
 */
export function getAnthropicApiKey() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return validateApiKeyFormat(apiKey) ? apiKey : null;
}

/**
 * Clears the cache (useful for testing or when .zshrc is modified)
 */
export function clearCache() {
  _claudeAvailableCache = null;
  _cacheTimestamp = null;
  openAIAvailableCache = null;
  openAILastCheck = 0;
}

/**
 * Validates the format of an OpenAI API key
 * @param {string} apiKey - The API key to validate
 * @returns {boolean} True if the API key format is valid
 */
export function validateOpenAIKeyFormat(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  return (apiKey.startsWith('sk-') || apiKey.startsWith('sk-or-v1-')) && apiKey.length > 20;
}

/**
 * Detects if an OpenAI API key is present in .zshrc
 * @returns {Promise<string|null>} The API key if found, null otherwise
 */
export async function detectOpenAIApiKey() {
  const zshrcPath = getZshrcPath();

  if (!existsSync(zshrcPath)) {
    return null;
  }

  try {
    const content = await fs.readFile(zshrcPath, 'utf8');
    const envVars = parseEnvironmentVariables(content);
    const apiKey = envVars.OPENAI_API_KEY;
    return validateOpenAIKeyFormat(apiKey) ? apiKey : null;
  } catch (error) {
    console.error(`Error reading .zshrc: ${error.message}`);
    return null;
  }
}

/**
 * Gets the OpenAI API key from environment variables
 * @returns {Promise<string|null>} The API key if available, null otherwise
 */
export async function getOpenAIApiKey() {
  const envKey = process.env.OPENAI_API_KEY;
  if (validateOpenAIKeyFormat(envKey)) {
    return envKey;
  }

  return await detectOpenAIApiKey();
}

/**
 * Gets the OpenAI base URL from environment variables
 * @returns {string} The base URL for OpenAI API requests
 */
export function getOpenAIBaseURL() {
  return process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
}

/**
 * Checks if OpenAI is available (with caching)
 * @param {boolean} forceRefresh - Force refresh the cache
 * @returns {Promise<boolean>} True if OpenAI is available
 */
export async function isOpenAIAvailable(forceRefresh = false) {
  const now = Date.now();

  if (!forceRefresh && openAIAvailableCache !== null && (now - openAILastCheck) < OPENAI_CACHE_TTL) {
    return openAIAvailableCache;
  }

  const apiKey = await getOpenAIApiKey();
  const available = apiKey !== null;

  openAIAvailableCache = available;
  openAILastCheck = now;

  return available;
} 