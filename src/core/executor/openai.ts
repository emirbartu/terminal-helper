/**
 * OpenAI Executor Module
 * 
 * Handles execution of LLM queries via OpenAI's API.
 * Uses the official OpenAI JavaScript SDK for direct model interaction.
 * Supports custom baseURL for OpenRouter compatibility.
 */

import OpenAI from 'openai';
import chalk from 'chalk';
import { 
  getOpenAIBaseURL, 
  promptForOpenAICredentials,
  getProviderCredentials,
  promptForProviderCredentials
} from '../../utils/apiKeyManager.js';
import * as Env from '../../utils/env.js';

// OpenAI model configurations (including OpenAI-compatible APIs like Kimi)
const OPENAI_MODELS: string[] = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
  'kimi-for-coding',
];

/**
 * Optimization set configuration
 */
interface OptimizationConfig {
  temperature: number;
  max_tokens: number;
  stream: boolean;
}

/**
 * OpenAI API options
 */
interface OpenAIOptions {
  temperature: number;
  max_tokens: number;
  stream: boolean;
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
 * OpenAI API error with status code
 */
interface OpenAIAPIError extends Error {
  status?: number;
}

/**
 * Optimization sets for different use cases
 */
const OPTIMIZATION_SETS: Record<string, OptimizationConfig> = {
  "error_analysis": { 
    temperature: 0.3, 
    max_tokens: 1024,
    stream: true 
  },
  "error_determination": { 
    temperature: 0.1, 
    max_tokens: 64,
    stream: false 
  },
  "command_generation": { 
    temperature: 0.1, 
    max_tokens: 512,
    stream: false 
  },
  "patch_generation": { 
    temperature: 0.1, 
    max_tokens: 1536,
    stream: false 
  }
};

/**
 * Returns a list of available OpenAI models
 * @returns Array of OpenAI model names
 */
export function getOpenAIModels(): string[] {
  return [...OPENAI_MODELS];
}

/**
 * Determines the provider ID based on model name
 * @param model - The model name
 * @returns Provider ID ('openai' or 'kimi')
 */
function getProviderForModel(model?: string): string {
  if (model?.startsWith('kimi-')) {
    return 'kimi';
  }
  return 'openai';
}

/**
 * Creates and configures an OpenAI client instance
 * @param apiKey - Optional API key (uses stored credentials if not provided)
 * @param baseUrl - Optional base URL (uses stored credentials if not provided)
 * @param model - Optional model name to determine provider
 * @returns Configured OpenAI client or null if no API key
 */
function createOpenAIClient(apiKey?: string, baseUrl?: string, model?: string): OpenAI | null {
  Env.init();
  
  const providerId = getProviderForModel(model);
  
  // Use provided key or get from Env system
  let key = apiKey;
  let baseURL = baseUrl;
  
  if (!key) {
    const credentials = Env.getProviderCredentials(providerId);
    key = credentials?.apiKey;
    if (!baseURL && credentials?.baseUrl) {
      baseURL = credentials.baseUrl;
    }
  }
  
  // Fall back to openai if kimi credentials not found
  if (!key && providerId === 'kimi') {
    const openaiCreds = Env.getProviderCredentials('openai');
    key = openaiCreds?.apiKey;
    if (!baseURL && openaiCreds?.baseUrl) {
      baseURL = openaiCreds.baseUrl;
    }
  }
  
  if (!key) {
    return null;
  }
  
  // Default base URLs per provider
  if (!baseURL) {
    if (providerId === 'kimi') {
      baseURL = 'https://api.kimi.com/coding/v1';
    } else {
      baseURL = getOpenAIBaseURL();
    }
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config: any = {
    apiKey: key
  };

  // Support custom baseURL for OpenRouter, Kimi, or other OpenAI-compatible APIs
  if (baseURL) {
    config.baseURL = baseURL;
  }
  
  return new OpenAI(config);
}

/**
 * Builds OpenAI-specific options based on optimization set
 * @param optimizationSet - The optimization preset to use
 * @returns OpenAI API options
 */
export function buildOpenAIOptions(optimizationSet: string = "error_analysis"): OpenAIOptions {
  const baseOptions: OpenAIOptions = {
    temperature: 0.3,
    max_tokens: 1024,
    stream: false
  };
  
  const optSet = OPTIMIZATION_SETS[optimizationSet] || OPTIMIZATION_SETS["error_analysis"];
  return { ...baseOptions, ...optSet };
}

/**
 * Ensures OpenAI is available and accessible
 * Prompts user for credentials if not found in environment or stored auth
 * @param model - Optional model to check availability for
 * @returns True if OpenAI is available
 */
export async function ensureOpenAIAvailable(model?: string): Promise<boolean> {
  let client = createOpenAIClient(undefined, undefined, model);
  
  // If no client, try to prompt for credentials
  if (!client) {
    const providerId = getProviderForModel(model);
    const credentials = await promptForProviderCredentials(providerId);
    if (credentials) {
      client = createOpenAIClient(credentials.apiKey, credentials.baseUrl, model);
    }
  }
  
  if (!client) {
    console.error(chalk.red('API key not found. Please set OPENAI_API_KEY or KIMI_API_KEY in your environment.'));
    return false;
  }
  
  try {
    // Test the API key by making a minimal request
    const testModel = model || 'gpt-4o-mini';
    await client.chat.completions.create({
      model: testModel,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'test' }]
    });
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`API error: ${errorMessage}`));
    return false;
  }
}

/**
 * Handles OpenAI-specific errors with user-friendly messages
 * @param error - The error to handle
 * @returns User-friendly error message
 */
export function handleOpenAIError(error: OpenAIAPIError): string {
  if (error.status === 401) {
    return 'Invalid API key. Please check your OPENAI_API_KEY in your environment.';
  } else if (error.status === 429) {
    return 'Rate limit exceeded. Please try again in a moment.';
  } else if (error.status === 400) {
    return 'Invalid request. Please check your input.';
  } else if (error.status && error.status >= 500) {
    return 'OpenAI API is temporarily unavailable. Please try again later.';
  } else {
    return `OpenAI API error: ${error.message}`;
  }
}

/**
 * Runs a query using OpenAI with streaming output
 * @param prompt - The prompt to send
 * @param model - OpenAI model to use
 * @param optimizationSet - Optimization preset
 * @param onStreamStart - Optional callback when streaming begins
 * @returns The model's response
 */
export async function queryOpenAIStream(
  prompt: string, 
  model: string, 
  optimizationSet: string = "error_analysis", 
  onStreamStart: (() => void) | null = null
): Promise<string> {
  let client = createOpenAIClient(undefined, undefined, model);
  
  // If no client, try to prompt for credentials
  if (!client) {
    const providerId = getProviderForModel(model);
    const credentials = await promptForProviderCredentials(providerId);
    if (credentials) {
      client = createOpenAIClient(credentials.apiKey, credentials.baseUrl, model);
    }
  }
  
  if (!client) {
    throw new Error('API key not available. Please set OPENAI_API_KEY or KIMI_API_KEY.');
  }
  
  try {
    const options = buildOpenAIOptions(optimizationSet);
    
    const requestParams: OpenAI.Chat.ChatCompletionCreateParams = {
      model: model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      max_tokens: options.max_tokens,
      temperature: options.temperature,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    };
    
    // Handle streaming vs non-streaming
    if (options.stream && optimizationSet === "error_analysis") {
      const streamingRequest = {
        ...requestParams,
        stream: true as const
      };
      
      let fullResponse = '';
      let firstChunkReceived = false;
      
      const stream = await client.chat.completions.create(streamingRequest);
      
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        
        if (content) {
          // Notify that streaming has started on first actual content, if callback provided
          if (!firstChunkReceived && typeof onStreamStart === 'function') {
            onStreamStart();
            firstChunkReceived = true;
          }
          
          fullResponse += content;
          // Output in gray with no indentation
          process.stdout.write(chalk.gray(content));
        }
      }
      
      // Print a final newline
      process.stdout.write('\n');
      return fullResponse;
    } else {
      // Non-streaming request
      const response = await client.chat.completions.create(requestParams);
      return response.choices[0]?.message?.content || '';
    }
  } catch (error) {
    const openAIError: OpenAIAPIError = error instanceof Error ? error : new Error(String(error));
    const errorMessage = handleOpenAIError(openAIError);
    console.error(chalk.red(errorMessage));
    throw new Error(errorMessage);
  }
}

/**
 * JSON schema definition for response format
 */
interface ResponseFormatJSONSchema {
  type: 'json_schema';
  json_schema: {
    name: string;
    schema: JSONSchema;
    strict: boolean;
  };
}

/**
 * Runs a query using OpenAI with structured JSON output
 * @param prompt - The prompt to send
 * @param model - OpenAI model to use
 * @param schema - JSON schema for structured output
 * @param options - Additional options
 * @returns The structured response
 */
export async function queryOpenAIStructured(
  prompt: string, 
  model: string, 
  schema: JSONSchema, 
  options: StructuredQueryOptions = {}
): Promise<Record<string, unknown>> {
  let client = createOpenAIClient(undefined, undefined, model);
  
  // If no client, try to prompt for credentials
  if (!client) {
    const providerId = getProviderForModel(model);
    const credentials = await promptForProviderCredentials(providerId);
    if (credentials) {
      client = createOpenAIClient(credentials.apiKey, credentials.baseUrl, model);
    }
  }
  
  if (!client) {
    throw new Error('API key not available. Please set OPENAI_API_KEY or KIMI_API_KEY.');
  }
  
  try {
    const defaultOptions = buildOpenAIOptions("patch_generation");
    const combinedOptions = { ...defaultOptions, ...options };
    
    const requestParams: OpenAI.Chat.ChatCompletionCreateParams = {
      model: model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      max_tokens: combinedOptions.max_tokens,
      temperature: combinedOptions.temperature,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    };
    
    // Add response_format for structured output if schema is provided
    if (schema) {
      (requestParams as OpenAI.Chat.ChatCompletionCreateParams & { response_format: ResponseFormatJSONSchema }).response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          schema: schema,
          strict: true
        }
      };
    }
    
    const response = await client.chat.completions.create(requestParams);
    
    const content = response.choices[0]?.message?.content || '';
    
    try {
      return JSON.parse(content);
    } catch (parseError) {
      // Try to extract JSON from the response if it's wrapped in markdown or other text
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
      const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
      throw new Error(`Failed to parse JSON response: ${errorMessage}`);
    }
  } catch (error) {
    const openAIError: OpenAIAPIError = error instanceof Error ? error : new Error(String(error));
    const errorMessage = handleOpenAIError(openAIError);
    console.error(chalk.red(errorMessage));
    throw new Error(errorMessage);
  }
}

/**
 * Wrapper function for backward compatibility with existing code
 * @param prompt - The prompt to send
 * @param model - OpenAI model to use
 * @param optimizationSet - Optimization preset
 * @param onStreamStart - Optional callback when streaming begins
 * @returns The model's response
 */
export async function queryOpenAIWithTempScript(
  prompt: string, 
  model: string, 
  optimizationSet: string = "error_analysis", 
  onStreamStart: (() => void) | null = null
): Promise<string> {
  return await queryOpenAIStream(prompt, model, optimizationSet, onStreamStart);
}
