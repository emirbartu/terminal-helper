/**
 * Model Router Module
 * 
 * Routes LLM queries to the appropriate executor based on model type.
 * Handles both Ollama and Claude model execution with provider detection.
 */

import * as OllamaExecutor from './ollama.js';
import * as ClaudeExecutor from './claude.js';
import * as OpenAIExecutor from './openai.js';
import { getModelProvider, PROVIDERS } from '../../utils/providerConfig.js';
import { startThinking } from '../ui/thinking.js';

/**
 * Detects the provider for a given model and routes accordingly
 * @param {string} model - The model name to check
 * @returns {string} - The provider name
 */
export function detectModelProvider(model) {
  return getModelProvider(model);
}

/**
 * Routes query to appropriate model provider based on model type
 * @param {string} prompt - The prompt to send
 * @param {string} model - The model to use
 * @param {Object} options - Additional options
 * @param {string} optimizationSet - Optimization preset
 * @returns {Promise<{response: string, reasoning: string}>} - The model's response
 */
export async function routeModelQuery(prompt, model, options = {}, optimizationSet = 'error_analysis') {
  // Extract callback from options if present
  const { onStreamStart, ...modelOptions } = options;
  
  // Detect provider based on model name
  const provider = detectModelProvider(model);
  
  let response;
  
  switch (provider) {
    case PROVIDERS.CLAUDE:
      response = await ClaudeExecutor.queryClaudeWithTempScript(prompt, model, optimizationSet, onStreamStart);
      break;
    
    case PROVIDERS.OPENAI:
      response = await OpenAIExecutor.queryOpenAIWithTempScript(prompt, model, optimizationSet, onStreamStart);
      break;
    
    case PROVIDERS.OLLAMA:
    default:
      response = await OllamaExecutor.queryOllamaWithTempScript(prompt, model, optimizationSet, onStreamStart);
      break;
  }
  
  return {
    response: response,
    reasoning: ''
  };
}

/**
 * Routes structured query to appropriate model provider
 * @param {string} prompt - The prompt to send
 * @param {string} model - The model to use
 * @param {Object} schema - JSON schema for structured output
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - The structured response
 */
export async function routeStructuredQuery(prompt, model, schema, options = {}) {
  const provider = detectModelProvider(model);
  
  switch (provider) {
    case PROVIDERS.CLAUDE:
      return ClaudeExecutor.queryClaudeStructured(prompt, model, schema, options);
    
    case PROVIDERS.OPENAI:
      return OpenAIExecutor.queryOpenAIStructured(prompt, model, schema, options);
    
    case PROVIDERS.OLLAMA:
    default:
      return OllamaExecutor.queryOllamaStructured(prompt, model, schema, options);
  }
}

/**
 * Ensures a model is available and installed if needed
 * @param {string} model - Model name to ensure
 * @returns {Promise<boolean>} - True if successful
 */
export async function ensureModelAvailable(model) {
  const provider = detectModelProvider(model);
  
  switch (provider) {
    case PROVIDERS.CLAUDE:
      return ClaudeExecutor.ensureClaudeAvailable();
    
    case PROVIDERS.OPENAI:
      return OpenAIExecutor.ensureOpenAIAvailable();
    
    case PROVIDERS.OLLAMA:
    default:
      return OllamaExecutor.ensureModel(model);
  }
}

/**
 * Gets the list of available models from all providers
 * @param {boolean} includeRemote - Whether to include remote models (Claude)
 * @returns {Promise<string[]>} - Array of available models
 */
export async function getAllAvailableModels(includeRemote = true) {
  const models = [];
  
  // Always include Ollama models
  try {
    const ollamaModels = OllamaExecutor.getAvailableModels();
    models.push(...ollamaModels);
  } catch (error) {
    console.error('Error getting Ollama models:', error.message);
  }
  
  // Include Claude models if requested and available
  if (includeRemote) {
    try {
      const claudeModels = await getAvailableClaudeModels();
      models.push(...claudeModels);
    } catch (error) {
      console.error('Error getting Claude models:', error.message);
    }
  }
  
  // Include OpenAI models if available
  try {
    const openaiModels = await getAvailableOpenAIModels();
    models.push(...openaiModels);
  } catch (error) {
    console.error('Error getting OpenAI models:', error.message);
  }
  
  return models;
}

/**
 * Gets the list of available Claude models (only if API key is configured)
 * @returns {Promise<string[]>} - Array of available Claude model names
 */
export async function getAvailableClaudeModels() {
  try {
    const claudeAvailable = await ClaudeExecutor.ensureClaudeAvailable();
    if (claudeAvailable) {
      return ClaudeExecutor.getClaudeModels();
    }
  } catch (error) {
    console.error('Error checking Claude availability:', error.message);
  }
  
  return [];
}

/**
 * Gets the list of available OpenAI models (only if API key is configured)
 * @returns {Promise<string[]>} - Array of available OpenAI model names
 */
export async function getAvailableOpenAIModels() {
  try {
    const openaiAvailable = await OpenAIExecutor.ensureOpenAIAvailable();
    if (openaiAvailable) {
      return OpenAIExecutor.getOpenAIModels();
    }
  } catch (error) {
    console.error('Error checking OpenAI availability:', error.message);
  }
  return [];
}

/**
 * Gets the list of installed Ollama models
 * @returns {Promise<string[]>} - Array of installed model names
 */
export async function getInstalledModels() {
  return await OllamaExecutor.readModels();
}

/**
 * Installs a model if not already installed (Ollama only)
 * @param {string} model - Model to install
 * @returns {Promise<boolean>} - True if successful
 */
export async function installModelIfNeeded(model) {
  const provider = detectModelProvider(model);
  
  switch (provider) {
    case PROVIDERS.CLAUDE:
      // Claude models don't need installation, just API key validation
      return ClaudeExecutor.ensureClaudeAvailable();
    
    case PROVIDERS.OPENAI:
      // OpenAI models don't need installation, just API key validation
      return OpenAIExecutor.ensureOpenAIAvailable();
    
    case PROVIDERS.OLLAMA:
    default:
      const installed = await OllamaExecutor.readModels();
      if (!installed.includes(model)) {
        return OllamaExecutor.installModel(model);
      }
      return true;
  }
}

/**
 * Routes to the appropriate provider for model operations
 * @param {string} model - The model name
 * @param {string} operation - The operation to perform
 * @param {...any} args - Arguments for the operation
 * @returns {Promise<any>} - Result of the operation
 */
export async function routeToProvider(model, operation, ...args) {
  const provider = detectModelProvider(model);
  
  switch (provider) {
    case PROVIDERS.CLAUDE:
      switch (operation) {
        case 'query':
          return ClaudeExecutor.queryClaudeStream(...args);
        case 'structured':
          return ClaudeExecutor.queryClaudeStructured(...args);
        case 'ensure':
          return ClaudeExecutor.ensureClaudeAvailable();
        default:
          throw new Error(`Unsupported Claude operation: ${operation}`);
      }
    
    case PROVIDERS.OPENAI:
      switch (operation) {
        case 'query':
          return OpenAIExecutor.queryOpenAIStream(...args);
        case 'structured':
          return OpenAIExecutor.queryOpenAIStructured(...args);
        case 'ensure':
          return OpenAIExecutor.ensureOpenAIAvailable();
        default:
          throw new Error(`Unsupported OpenAI operation: ${operation}`);
      }
    
    case PROVIDERS.OLLAMA:
    default:
      switch (operation) {
        case 'query':
          return OllamaExecutor.queryOllamaStream(...args);
        case 'structured':
          return OllamaExecutor.queryOllamaStructured(...args);
        case 'ensure':
          return OllamaExecutor.ensureModel(model);
        default:
          throw new Error(`Unsupported Ollama operation: ${operation}`);
      }
  }
} 