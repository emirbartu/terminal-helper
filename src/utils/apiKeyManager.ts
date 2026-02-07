/**
 * API Key Manager Module
 * 
 * Manages API keys for OpenAI-compatible providers.
 * Uses the Env system for isolated credential management.
 */

import * as Env from './env.js';

// Cache for availability checks
let openAIAvailableCache: boolean | null = null;
let openAILastCheck = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Validates the format of an OpenAI API key
 * @param apiKey - The API key to validate
 * @returns True if the key format is valid
 */
export function validateOpenAIKeyFormat(apiKey: string | undefined): boolean {
  if (!apiKey) return false;
  // OpenAI API keys start with 'sk-'
  return apiKey.startsWith('sk-') && apiKey.length > 20;
}

/**
 * Gets the OpenAI API key from environment or stored credentials
 * @returns The API key if available, null otherwise
 */
export async function getOpenAIApiKey(): Promise<string | null> {
  // Initialize Env if not already done
  Env.init();
  
  // Check environment variables and stored credentials
  const credentials = Env.getProviderCredentials('openai');
  if (credentials?.apiKey && validateOpenAIKeyFormat(credentials.apiKey)) {
    return credentials.apiKey;
  }
  
  return null;
}

/**
 * Gets the OpenAI base URL from environment or stored credentials
 * @returns The base URL for OpenAI API requests
 */
export function getOpenAIBaseURL(): string {
  Env.init();
  
  // Check environment first, then stored credentials
  const envBaseUrl = Env.get('OPENAI_BASE_URL');
  if (envBaseUrl) {
    return envBaseUrl;
  }
  
  const credentials = Env.getProviderCredentials('openai');
  if (credentials?.baseUrl) {
    return credentials.baseUrl;
  }
  
  return 'https://api.openai.com/v1';
}

/**
 * Prompts user for OpenAI credentials if not found
 * @returns Credentials or null if user cancelled
 */
export async function promptForOpenAICredentials(): Promise<{ apiKey: string; baseUrl: string } | null> {
  Env.init();
  return await Env.getOrPromptCredentials('openai', true);
}

/**
 * Stores OpenAI credentials
 * @param apiKey - The API key
 * @param baseUrl - Optional base URL
 */
export function setOpenAICredentials(apiKey: string, baseUrl?: string): void {
  Env.init();
  Env.setProviderCredentials('openai', apiKey, baseUrl);
  
  // Clear cache to force re-check
  openAIAvailableCache = null;
  openAILastCheck = 0;
}

/**
 * Checks if OpenAI is available (with caching)
 * @param forceRefresh - Force a fresh check
 * @returns True if OpenAI API key is configured
 */
export async function isOpenAIAvailable(forceRefresh = false): Promise<boolean> {
  const now = Date.now();
  
  if (!forceRefresh && openAIAvailableCache !== null && (now - openAILastCheck) < CACHE_DURATION) {
    return openAIAvailableCache;
  }
  
  const apiKey = await getOpenAIApiKey();
  openAIAvailableCache = apiKey !== null;
  openAILastCheck = now;
  
  return openAIAvailableCache;
}

/**
 * Clears the cache (useful for testing or when credentials change)
 */
export function clearCache(): void {
  openAIAvailableCache = null;
  openAILastCheck = 0;
}

/**
 * Clears stored OpenAI credentials
 */
export function clearOpenAICredentials(): void {
  Env.init();
  Env.clearProviderCredentials('openai');
  clearCache();
}

/**
 * Gets credentials for any supported provider
 * @param providerId - Provider identifier (e.g., 'openai', 'groq', 'openrouter')
 * @returns Credentials or null
 */
export function getProviderCredentials(providerId: string): { apiKey: string; baseUrl?: string } | null {
  Env.init();
  return Env.getProviderCredentials(providerId);
}

/**
 * Prompts user for provider credentials
 * @param providerId - Provider identifier
 * @returns Credentials or null
 */
export async function promptForProviderCredentials(
  providerId: string
): Promise<{ apiKey: string; baseUrl: string } | null> {
  Env.init();
  return await Env.getOrPromptCredentials(providerId, true);
}

/**
 * Check if any OpenAI-compatible provider is configured
 * @returns True if at least one provider has credentials
 */
export async function isAnyProviderAvailable(): Promise<boolean> {
  Env.init();
  
  // Check OpenAI
  if (await isOpenAIAvailable()) {
    return true;
  }
  
  // Check other providers
  for (const providerId of Object.keys(Env.PROVIDER_CONFIGS)) {
    if (Env.hasCredentials(providerId)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get all available providers with their credentials
 * @returns Array of provider IDs that have credentials
 */
export function getAvailableProviders(): string[] {
  Env.init();
  
  const available: string[] = [];
  for (const providerId of Object.keys(Env.PROVIDER_CONFIGS)) {
    if (Env.hasCredentials(providerId)) {
      available.push(providerId);
    }
  }
  
  return available;
}
