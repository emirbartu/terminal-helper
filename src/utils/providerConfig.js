/**
 * Provider Configuration Module
 * 
 * Manages multi-provider model configuration and routing.
 * Handles detection of model providers and their availability.
 */

import { isClaudeAvailable, isOpenAIAvailable } from './apiKeyManager.js';
import { getClaudeModels } from '../core/executor/claude.js';
import { getOpenAIModels } from '../core/executor/openai.js';
import { readModels as getOllamaModels, getAllOllamaModels } from '../core/executor/ollama.js';

// Provider definitions
export const PROVIDERS = {
  OLLAMA: 'ollama',
  CLAUDE: 'claude',
  OPENAI: 'openai'
};

// Model name patterns for provider detection
const PROVIDER_PATTERNS = {
  [PROVIDERS.CLAUDE]: /^claude-/i,
  [PROVIDERS.OPENAI]: /^gpt-/i,
  [PROVIDERS.OLLAMA]: /^(?!claude-|gpt-)/i // Everything that doesn't start with claude- or gpt-
};

/**
 * Determines the provider for a given model name
 * @param {string} modelName - The model name to check
 * @returns {string} - The provider name (PROVIDERS.CLAUDE or PROVIDERS.OLLAMA)
 */
export function getModelProvider(modelName) {
  if (!modelName) {
    return PROVIDERS.OLLAMA; // Default to Ollama
  }
  
  if (PROVIDER_PATTERNS[PROVIDERS.CLAUDE].test(modelName)) {
    return PROVIDERS.CLAUDE;
  }
  
  if (PROVIDER_PATTERNS[PROVIDERS.OPENAI].test(modelName)) {
    return PROVIDERS.OPENAI;
  }
  
  return PROVIDERS.OLLAMA;
}

/**
 * Gets available models for a specific provider
 * @param {string} provider - The provider name
 * @returns {Promise<string[]>} - Array of available model names
 */
export async function getProviderModels(provider) {
  switch (provider) {
    case PROVIDERS.CLAUDE:
      const claudeAvailable = await isClaudeAvailable();
      return claudeAvailable ? getClaudeModels() : [];
    
    case PROVIDERS.OPENAI:
      const openaiAvailable = await isOpenAIAvailable();
      return openaiAvailable ? getOpenAIModels() : [];
    
    case PROVIDERS.OLLAMA:
      return getOllamaModels();
    
    default:
      return [];
  }
}

/**
 * Checks if a provider is available and configured
 * @param {string} provider - The provider name
 * @returns {Promise<boolean>} - True if the provider is available
 */
export async function isProviderAvailable(provider) {
  switch (provider) {
    case PROVIDERS.CLAUDE:
      return await isClaudeAvailable();
    
    case PROVIDERS.OPENAI:
      return await isOpenAIAvailable();
    
    case PROVIDERS.OLLAMA:
      return true; // Ollama is always considered available (handled by ollama.js)
    
    default:
      return false;
  }
}

/**
 * Gets the default model for a specific provider
 * @param {string} provider - The provider name
 * @returns {string} - The default model name for the provider
 */
export function getDefaultModelByProvider(provider) {
  switch (provider) {
    case PROVIDERS.CLAUDE:
      return 'claude-4-sonnet-20250514'; // Default to Claude 4 Sonnet
    
    case PROVIDERS.OPENAI:
      return process.env.OPENAI_MODEL || 'gpt-4o-mini'; // Default to GPT-4o Mini
    
    case PROVIDERS.OLLAMA:
      return 'phi4:latest'; // Default Ollama model
    
    default:
      return 'phi4:latest';
  }
}

/**
 * Gets all available models from all providers with provider labels
 * @returns {Promise<Array<{model: string, provider: string, label: string}>>} - Array of model objects
 */
export async function getAllProvidersModels() {
  const models = [];
  
  // Get Ollama models (both recommended and installed)
  try {
    const ollamaModels = await getAllOllamaModels();
    for (const modelInfo of ollamaModels) {
      models.push({
        model: modelInfo.model,
        provider: PROVIDERS.OLLAMA,
        label: `${modelInfo.label} (Ollama)`
      });
    }
  } catch (error) {
    console.error('Error getting Ollama models:', error.message);
  }
  
  // Get Claude models (only if API key is available)
  try {
    const claudeModels = await getProviderModels(PROVIDERS.CLAUDE);
    for (const model of claudeModels) {
      // Create user-friendly labels for Claude models
      let friendlyName = model;
      if (model.includes('claude-4-opus')) {
        friendlyName = 'Claude 4 Opus';
      } else if (model.includes('claude-4-sonnet')) {
        friendlyName = 'Claude 4 Sonnet';
      } else if (model.includes('claude-3-5-sonnet')) {
        friendlyName = 'Claude 3.5 Sonnet';
      } else if (model.includes('claude-3-5-haiku')) {
        friendlyName = 'Claude 3.5 Haiku';
      }
      
      models.push({
        model,
        provider: PROVIDERS.CLAUDE,
        label: `${friendlyName} (Anthropic)`
      });
    }
  } catch (error) {
    console.error('Error getting Claude models:', error.message);
  }
  
  // Get OpenAI models (only if API key is available)
  try {
    const openaiModels = await getProviderModels(PROVIDERS.OPENAI);
    for (const model of openaiModels) {
      // Create user-friendly labels for OpenAI models
      let friendlyName = model;
      if (model.includes('gpt-4o-mini')) {
        friendlyName = 'GPT-4o Mini';
      } else if (model.includes('gpt-4o')) {
        friendlyName = 'GPT-4o';
      } else if (model.includes('gpt-4-turbo')) {
        friendlyName = 'GPT-4 Turbo';
      } else if (model.includes('gpt-4')) {
        friendlyName = 'GPT-4';
      } else if (model.includes('gpt-3.5-turbo')) {
        friendlyName = 'GPT-3.5 Turbo';
      }
      
      models.push({
        model,
        provider: PROVIDERS.OPENAI,
        label: `${friendlyName} (OpenAI)`
      });
    }
  } catch (error) {
    console.error('Error getting OpenAI models:', error.message);
  }
  
  return models;
}

/**
 * Saves provider-specific preferences
 * @param {string} provider - The provider name
 * @param {Object} preferences - Provider-specific preferences
 * @returns {Promise<boolean>} - True if successful
 */
export async function saveProviderPreferences(provider, preferences) {
  // This could be extended to save provider-specific settings
  // For now, we'll just return true as preferences are handled elsewhere
  return true;
}

/**
 * Gets a user-friendly display name for a provider
 * @param {string} provider - The provider name
 * @returns {string} - Display name for the provider
 */
export function getProviderDisplayName(provider) {
  switch (provider) {
    case PROVIDERS.CLAUDE:
      return 'Anthropic Claude';
    case PROVIDERS.OPENAI:
      return 'OpenAI (API)';
    case PROVIDERS.OLLAMA:
      return 'Ollama (Local)';
    default:
      return provider;
  }
}

/**
 * Validates if a model name is valid for its detected provider
 * @param {string} modelName - The model name to validate
 * @returns {Promise<boolean>} - True if the model is valid and available
 */
export async function validateModelForProvider(modelName) {
  const provider = getModelProvider(modelName);
  const isAvailable = await isProviderAvailable(provider);
  
  if (!isAvailable) {
    return false;
  }
  
  const providerModels = await getProviderModels(provider);
  return providerModels.includes(modelName);
} 