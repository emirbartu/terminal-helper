/**
 * Model Router Module
 * 
 * Routes LLM queries to the appropriate executor based on model type.
 * Handles both Ollama and OpenAI model execution with provider detection.
 */

import * as OllamaExecutor from './ollama.js';
import * as OpenAIExecutor from './openai.js';
import { getModelProvider, PROVIDERS } from '../../utils/providerConfig.js';

/**
 * Model query options
 */
interface ModelQueryOptions {
  temperature?: number;
  max_tokens?: number;
  onStreamStart?: () => void;
  [key: string]: unknown;
}

/**
 * LLM response result
 */
interface LLMResponse {
  response: string;
  reasoning: string;
}

/**
 * JSON schema for structured output
 */
interface JSONSchema {
  type: string;
  properties?: Record<string, unknown>;
  items?: unknown;
  required?: string[];
  nullable?: boolean;
  [key: string]: unknown;
}

/**
 * Structured query options
 */
interface StructuredQueryOptions {
  temperature?: number;
  max_tokens?: number;
  [key: string]: unknown;
}



/**
 * Detects the provider for a given model and routes accordingly
 * @param model - The model name to check
 * @returns The provider name
 */
export function detectModelProvider(model: string): string {
  return getModelProvider(model);
}

/**
 * Routes query to appropriate model provider based on model type
 * @param prompt - The prompt to send
 * @param model - The model to use
 * @param options - Additional options
 * @param optimizationSet - Optimization preset
 * @returns The model's response
 */
export async function routeModelQuery(
  prompt: string, 
  model: string, 
  options: ModelQueryOptions = {}, 
  optimizationSet: string = 'error_analysis'
): Promise<LLMResponse> {
  // Extract callback from options if present
  const { onStreamStart } = options;
  
  // Detect provider based on model name
  const provider = detectModelProvider(model);
  
  let response: string;
  
  switch (provider) {
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
 * @param prompt - The prompt to send
 * @param model - The model to use
 * @param schema - JSON schema for structured output
 * @param options - Additional options
 * @returns The structured response
 */
export async function routeStructuredQuery(
  prompt: string, 
  model: string, 
  schema: JSONSchema, 
  options: StructuredQueryOptions = {}
): Promise<Record<string, unknown>> {
  const provider = detectModelProvider(model);
  
  switch (provider) {
    case PROVIDERS.OPENAI:
      return OpenAIExecutor.queryOpenAIStructured(prompt, model, schema, options);
    
    case PROVIDERS.OLLAMA:
    default:
      return OllamaExecutor.queryOllamaStructured(prompt, model, schema, options);
  }
}

/**
 * Ensures a model is available and installed if needed
 * @param model - Model name to ensure
 * @returns True if successful
 */
export async function ensureModelAvailable(model: string): Promise<boolean> {
  const provider = detectModelProvider(model);
  
  switch (provider) {
    case PROVIDERS.OPENAI:
      return OpenAIExecutor.ensureOpenAIAvailable(model);
    
    case PROVIDERS.OLLAMA:
    default:
      return OllamaExecutor.ensureModel(model);
  }
}

/**
 * Gets the list of available models from all providers
 * @returns Array of available models
 */
export async function getAllAvailableModels(): Promise<string[]> {
  const models: string[] = [];
  
  // Always include Ollama models
  try {
    const ollamaModels = OllamaExecutor.getAvailableModels();
    models.push(...ollamaModels);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error getting Ollama models:', errorMessage);
  }
  
  // Include OpenAI models if available
  try {
    const openaiModels = await getAvailableOpenAIModels();
    models.push(...openaiModels);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error getting OpenAI models:', errorMessage);
  }
  
  return models;
}

/**
 * Gets the list of available OpenAI models (only if API key is configured)
 * @returns Array of available OpenAI model names
 */
export async function getAvailableOpenAIModels(): Promise<string[]> {
  try {
    const openaiAvailable = await OpenAIExecutor.ensureOpenAIAvailable();
    if (openaiAvailable) {
      return OpenAIExecutor.getOpenAIModels();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error checking OpenAI availability:', errorMessage);
  }
  return [];
}

/**
 * Gets the list of installed Ollama models
 * @returns Array of installed model names
 */
export async function getInstalledModels(): Promise<string[]> {
  return await OllamaExecutor.readModels();
}

/**
 * Installs a model if not already installed (Ollama only)
 * @param model - Model to install
 * @returns True if successful
 */
export async function installModelIfNeeded(model: string): Promise<boolean> {
  const provider = detectModelProvider(model);
  
  switch (provider) {
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
 * Operation types for provider routing
 */
type OperationType = 'query' | 'structured' | 'ensure';

/**
 * Routes to the appropriate provider for model operations
 * @param model - The model name
 * @param operation - The operation to perform
 * @param args - Arguments for the operation
 * @returns Result of the operation
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function routeToProvider(model: string, operation: OperationType, ...args: unknown[]): Promise<unknown> {
  const provider = detectModelProvider(model);
  
  switch (provider) {
    case PROVIDERS.OPENAI:
      switch (operation) {
        case 'query':
          return OpenAIExecutor.queryOpenAIStream(...args as [string, string, string, (() => void) | null]);
        case 'structured':
          return OpenAIExecutor.queryOpenAIStructured(...args as [string, string, JSONSchema, StructuredQueryOptions]);
        case 'ensure':
          return OpenAIExecutor.ensureOpenAIAvailable();
        default:
          throw new Error(`Unsupported OpenAI operation: ${operation}`);
      }
    
    case PROVIDERS.OLLAMA:
    default:
      switch (operation) {
        case 'query':
          return OllamaExecutor.queryOllamaStream(...args as [string, string, string, (() => void) | null]);
        case 'structured':
          return OllamaExecutor.queryOllamaStructured(...args as [string, string, JSONSchema, StructuredQueryOptions]);
        case 'ensure':
          return OllamaExecutor.ensureModel(model);
        default:
          throw new Error(`Unsupported Ollama operation: ${operation}`);
      }
  }
}
