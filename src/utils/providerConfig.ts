/**
 * Provider Configuration Module
 * 
 * Manages multi-provider model configuration and routing.
 * Handles detection of model providers and their availability.
 */

import { isOpenAIAvailable } from './apiKeyManager.js';

// Provider definitions
export const PROVIDERS = {
  OLLAMA: 'ollama',
  OPENAI: 'openai'
} as const;

/**
 * Provider type
 */
export type Provider = typeof PROVIDERS[keyof typeof PROVIDERS];

/**
 * Model information with provider details
 */
export interface ModelInfo {
  model: string;
  provider: string;
  label: string;
}

// Model name patterns for provider detection
const PROVIDER_PATTERNS: Record<string, RegExp> = {
  [PROVIDERS.OPENAI]: /^(gpt-|kimi-)/i,
  [PROVIDERS.OLLAMA]: /^(?!gpt-|kimi-)/i // Everything that doesn't start with gpt- or kimi-
};

/**
 * Determines the provider for a given model name
 * @param {string} modelName - The model name to check
 * @returns {string} - The provider name (PROVIDERS.OPENAI or PROVIDERS.OLLAMA)
 */
export function getModelProvider(modelName: string | null | undefined): string {
  if (!modelName) {
    return PROVIDERS.OLLAMA; // Default to Ollama
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
export async function getProviderModels(provider: string): Promise<string[]> {
  switch (provider) {
    case PROVIDERS.OPENAI: {
      const { getOpenAIModels } = await import('../core/executor/openai.js');
      const openaiAvailable = await isOpenAIAvailable();
      return openaiAvailable ? getOpenAIModels() : [];
    }
    
    case PROVIDERS.OLLAMA: {
      const { readModels: getOllamaModels } = await import('../core/executor/ollama.js');
      return getOllamaModels();
    }
    
    default:
      return [];
  }
}

/**
 * Checks if a provider is available and configured
 * @param {string} provider - The provider name
 * @returns {Promise<boolean>} - True if the provider is available
 */
export async function isProviderAvailable(provider: string): Promise<boolean> {
  switch (provider) {
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
export function getDefaultModelByProvider(provider: string): string {
  switch (provider) {
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
 * @returns {Promise<ModelInfo[]>} - Array of model objects
 */
export async function getAllProvidersModels(): Promise<ModelInfo[]> {
  const models: ModelInfo[] = [];
  
  // Get Ollama models (both recommended and installed)
  try {
    const { getAllOllamaModels } = await import('../core/executor/ollama.js');
    const ollamaModels = await getAllOllamaModels();
    for (const modelInfo of ollamaModels) {
      models.push({
        model: modelInfo.model,
        provider: PROVIDERS.OLLAMA,
        label: `${modelInfo.label} (Ollama)`
      });
    }
  } catch (error) {
    console.error('Error getting Ollama models:', (error as Error).message);
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
    console.error('Error getting OpenAI models:', (error as Error).message);
  }
  
  return models;
}

/**
 * Saves provider-specific preferences
 * @param {string} _provider - The provider name (unused but kept for API compatibility)
 * @param {Record<string, unknown>} _preferences - Provider-specific preferences (unused but kept for API compatibility)
 * @returns {Promise<boolean>} - True if successful
 */
export async function saveProviderPreferences(_provider: string, _preferences: Record<string, unknown>): Promise<boolean> {
  // This could be extended to save provider-specific settings
  // For now, we'll just return true as preferences are handled elsewhere
  return true;
}

/**
 * Gets a user-friendly display name for a provider
 * @param {string} provider - The provider name
 * @returns {string} - Display name for the provider
 */
export function getProviderDisplayName(provider: string): string {
  switch (provider) {
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
export async function validateModelForProvider(modelName: string): Promise<boolean> {
  const provider = getModelProvider(modelName);
  const isAvailable = await isProviderAvailable(provider);
  
  if (!isAvailable) {
    return false;
  }
  
  const providerModels = await getProviderModels(provider);
  return providerModels.includes(modelName);
}
