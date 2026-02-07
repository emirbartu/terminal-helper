/**
 * OpenAI Executor Module
 * 
 * Handles execution of LLM queries via OpenAI's API.
 * Uses the official OpenAI JavaScript SDK for direct model interaction.
 * Supports custom baseURL for OpenRouter compatibility.
 */

import OpenAI from 'openai';
import chalk from 'chalk';

// OpenAI model configurations
const OPENAI_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
];

// Optimization sets for different use cases
const OPTIMIZATION_SETS = {
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
 * @returns {string[]} - Array of OpenAI model names
 */
export function getOpenAIModels() {
  return [...OPENAI_MODELS];
}

/**
 * Creates and configures an OpenAI client instance
 * @returns {OpenAI|null} - Configured OpenAI client or null if no API key
 */
function createOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const baseURL = process.env.OPENAI_BASE_URL;
  
  const config = {
    apiKey: apiKey
  };

  // Support custom baseURL for OpenRouter or other OpenAI-compatible APIs
  if (baseURL) {
    config.baseURL = baseURL;
  }
  
  return new OpenAI(config);
}

/**
 * Builds OpenAI-specific options based on optimization set
 * @param {string} optimizationSet - The optimization preset to use
 * @returns {Object} - OpenAI API options
 */
export function buildOpenAIOptions(optimizationSet = "error_analysis") {
  const baseOptions = {
    temperature: 0.3,
    max_tokens: 1024,
    stream: false
  };
  
  const optSet = OPTIMIZATION_SETS[optimizationSet] || OPTIMIZATION_SETS["error_analysis"];
  return { ...baseOptions, ...optSet };
}

/**
 * Ensures OpenAI is available and accessible
 * @returns {Promise<boolean>} - True if OpenAI is available
 */
export async function ensureOpenAIAvailable() {
  const client = createOpenAIClient();
  if (!client) {
    console.error(chalk.red('OpenAI API key not found. Please set OPENAI_API_KEY in your environment.'));
    return false;
  }
  
  try {
    // Test the API key by making a minimal request
    await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'test' }]
    });
    return true;
  } catch (error) {
    console.error(chalk.red(`OpenAI API error: ${error.message}`));
    return false;
  }
}

/**
 * Handles OpenAI-specific errors with user-friendly messages
 * @param {Error} error - The error to handle
 * @returns {string} - User-friendly error message
 */
export function handleOpenAIError(error) {
  if (error.status === 401) {
    return 'Invalid API key. Please check your OPENAI_API_KEY in your environment.';
  } else if (error.status === 429) {
    return 'Rate limit exceeded. Please try again in a moment.';
  } else if (error.status === 400) {
    return 'Invalid request. Please check your input.';
  } else if (error.status >= 500) {
    return 'OpenAI API is temporarily unavailable. Please try again later.';
  } else {
    return `OpenAI API error: ${error.message}`;
  }
}

/**
 * Runs a query using OpenAI with streaming output
 * @param {string} prompt - The prompt to send
 * @param {string} model - OpenAI model to use
 * @param {string} optimizationSet - Optimization preset
 * @param {Function} [onStreamStart] - Optional callback when streaming begins
 * @returns {Promise<string>} - The model's response
 */
export async function queryOpenAIStream(prompt, model, optimizationSet = "error_analysis", onStreamStart = null) {
  const client = createOpenAIClient();
  if (!client) {
    throw new Error('OpenAI API key not available');
  }
  
  try {
    const options = buildOpenAIOptions(optimizationSet);
    
    const requestParams = {
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
      requestParams.stream = true;
      
      let fullResponse = '';
      let firstChunkReceived = false;
      
      const stream = await client.chat.completions.create(requestParams);
      
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
    const errorMessage = handleOpenAIError(error);
    console.error(chalk.red(errorMessage));
    throw new Error(errorMessage);
  }
}

/**
 * Runs a query using OpenAI with structured JSON output
 * @param {string} prompt - The prompt to send
 * @param {string} model - OpenAI model to use
 * @param {Object} schema - JSON schema for structured output
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - The structured response
 */
export async function queryOpenAIStructured(prompt, model, schema, options = {}) {
  const client = createOpenAIClient();
  if (!client) {
    throw new Error('OpenAI API key not available');
  }
  
  try {
    const defaultOptions = buildOpenAIOptions("patch_generation");
    const combinedOptions = { ...defaultOptions, ...options };
    
    const requestParams = {
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
      requestParams.response_format = {
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
      throw new Error(`Failed to parse JSON response: ${parseError.message}`);
    }
  } catch (error) {
    const errorMessage = handleOpenAIError(error);
    console.error(chalk.red(errorMessage));
    throw new Error(errorMessage);
  }
}

/**
 * Wrapper function for backward compatibility with existing code
 * @param {string} prompt - The prompt to send
 * @param {string} model - OpenAI model to use
 * @param {string} optimizationSet - Optimization preset
 * @param {Function} [onStreamStart] - Optional callback when streaming begins
 * @returns {Promise<string>} - The model's response
 */
export async function queryOpenAIWithTempScript(prompt, model, optimizationSet = "error_analysis", onStreamStart = null) {
  return await queryOpenAIStream(prompt, model, optimizationSet, onStreamStart);
}
