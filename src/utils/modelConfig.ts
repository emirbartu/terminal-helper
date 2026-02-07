/**
 * Model Configuration Module
 * 
 * Provides utilities for managing default model configuration with provider support.
 * Allows setting and retrieving the default model for Terminal Helper to use across providers.
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getModelProvider, PROVIDERS } from './providerConfig.js';

// Path to the Terminal Helper configuration directory
const CONFIG_DIR = join(homedir(), '.terminal_helper');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/**
 * Provider preferences
 */
export interface ProviderPreferences {
  defaultModel?: string;
  [key: string]: unknown;
}

/**
 * Model configuration object
 */
export interface ModelConfig {
  defaultModel: string;
  provider: string;
  providerPreferences: Record<string, ProviderPreferences>;
  [key: string]: unknown;
}

/**
 * Model with provider information
 */
export interface ModelWithProvider {
  model: string;
  provider: string;
}

/**
 * Ensures the configuration directory exists
 * @returns {Promise<void>}
 */
async function ensureConfigDir(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch (error) {
    console.error(`Error creating config directory: ${(error as Error).message}`);
  }
}

/**
 * Gets the current configuration object
 * @returns {Promise<ModelConfig>} Configuration object
 */
async function getConfig(): Promise<ModelConfig> {
  await ensureConfigDir();
  
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = await fs.readFile(CONFIG_FILE, 'utf8');
      const config = JSON.parse(content) as ModelConfig;
      
      // Migrate old config format if needed
      return migrateOldConfig(config);
    }
  } catch (error) {
    console.error(`Error reading config file: ${(error as Error).message}`);
  }
  
  // Return default config if file doesn't exist or is invalid
  return { 
    defaultModel: 'phi4:latest',
    provider: PROVIDERS.OLLAMA,
    providerPreferences: {
      [PROVIDERS.OLLAMA]: { defaultModel: 'phi4:latest' }
    }
  };
}

/**
 * Migrates old configuration format to new provider-aware format
 * @param {ModelConfig} config - Old configuration object
 * @returns {ModelConfig} - Migrated configuration object
 */
function migrateOldConfig(config: ModelConfig): ModelConfig {
  // If config already has provider info, return as-is
  if (config.provider && config.providerPreferences) {
    return config;
  }
  
  // Migrate old format
  const defaultModel = config.defaultModel || 'phi4:latest';
  const provider = getModelProvider(defaultModel);
  
  return {
    // Preserve any other existing config first
    ...config,
    // Then override with migrated values
    defaultModel,
    provider,
    providerPreferences: {
      [PROVIDERS.OLLAMA]: { 
        defaultModel: provider === PROVIDERS.OLLAMA ? defaultModel : 'phi4:latest' 
      }
    }
  };
}

/**
 * Saves the configuration object
 * @param {ModelConfig} config - Configuration object to save
 * @returns {Promise<boolean>} True if successful
 */
async function saveConfig(config: ModelConfig): Promise<boolean> {
  await ensureConfigDir();
  
  try {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Error saving config file: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Gets the default model from configuration
 * @returns {Promise<string>} The default model name
 */
export async function getDefaultModel(): Promise<string> {
  const config = await getConfig();
  return config.defaultModel || 'phi4:latest';
}

/**
 * Gets the default model with provider information
 * @returns {Promise<ModelWithProvider>} The default model with provider
 */
export async function getModelWithProvider(): Promise<ModelWithProvider> {
  const config = await getConfig();
  const model = config.defaultModel || 'phi4:latest';
  const provider = config.provider || getModelProvider(model);
  
  return { model, provider };
}

/**
 * Sets the default model in configuration with provider detection
 * @param {string} modelName - The model name to set as default
 * @returns {Promise<boolean>} True if successful
 */
export async function setDefaultModel(modelName: string): Promise<boolean> {
  const config = await getConfig();
  const provider = getModelProvider(modelName);
  
  // Update the main default model
  config.defaultModel = modelName;
  config.provider = provider;
  
  // Update provider-specific preferences
  if (!config.providerPreferences) {
    config.providerPreferences = {};
  }
  
  if (!config.providerPreferences[provider]) {
    config.providerPreferences[provider] = {};
  }
  
  config.providerPreferences[provider].defaultModel = modelName;
  
  return saveConfig(config);
}

/**
 * Sets the default model with explicit provider information
 * @param {string} modelName - The model name to set as default
 * @param {string} provider - The provider for the model
 * @returns {Promise<boolean>} True if successful
 */
export async function setDefaultModelWithProvider(modelName: string, provider: string): Promise<boolean> {
  const config = await getConfig();
  
  // Update the main default model
  config.defaultModel = modelName;
  config.provider = provider;
  
  // Update provider-specific preferences
  if (!config.providerPreferences) {
    config.providerPreferences = {};
  }
  
  if (!config.providerPreferences[provider]) {
    config.providerPreferences[provider] = {};
  }
  
  config.providerPreferences[provider].defaultModel = modelName;
  
  return saveConfig(config);
}

/**
 * Gets the default model for a specific provider
 * @param {string} provider - The provider name
 * @returns {Promise<string>} The default model for the provider
 */
export async function getDefaultModelForProvider(provider: string): Promise<string> {
  const config = await getConfig();
  
  if (config.providerPreferences && config.providerPreferences[provider]) {
    return config.providerPreferences[provider].defaultModel || 'phi4:latest';
  }
  
  // Return sensible defaults
  switch (provider) {
    case PROVIDERS.OLLAMA:
    default:
      return 'phi4:latest';
  }
}

/**
 * Gets all provider preferences
 * @returns {Promise<Record<string, ProviderPreferences>>} Provider preferences object
 */
export async function getProviderPreferences(): Promise<Record<string, ProviderPreferences>> {
  const config = await getConfig();
  return config.providerPreferences || {};
}

/**
 * Updates preferences for a specific provider
 * @param {string} provider - The provider name
 * @param {ProviderPreferences} preferences - The preferences to update
 * @returns {Promise<boolean>} True if successful
 */
export async function updateProviderPreferences(provider: string, preferences: ProviderPreferences): Promise<boolean> {
  const config = await getConfig();
  
  if (!config.providerPreferences) {
    config.providerPreferences = {};
  }
  
  if (!config.providerPreferences[provider]) {
    config.providerPreferences[provider] = {};
  }
  
  // Merge preferences
  config.providerPreferences[provider] = {
    ...config.providerPreferences[provider],
    ...preferences
  };
  
  return saveConfig(config);
}
