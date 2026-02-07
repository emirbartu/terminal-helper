/**
 * Environment Variable Management Module
 * 
 * Provides isolated environment variable access to prevent test interference
 * and support multiple authentication sources:
 * 1. Runtime environment variables (process.env)
 * 2. Stored credentials in ~/.terminal_helper/auth.json
 * 3. User prompts for missing credentials
 * 
 * This approach is inspired by OpenCode's credential management system.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { askInput } from '../ui/terminalUI.js';

// Path to stored credentials
const AUTH_DIR = join(homedir(), '.terminal_helper');
const AUTH_FILE = join(AUTH_DIR, 'auth.json');

// Default base URLs for providers
const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  kimi: 'https://api.kimi.com/coding/v1',
};

/**
 * Provider configuration interface
 */
export interface ProviderConfig {
  env: string[];
  defaultBaseUrl?: string;
  name: string;
}

/**
 * Stored credential entry
 */
export interface StoredCredential {
  apiKey: string;
  baseUrl?: string;
  timestamp: number;
}

/**
 * Auth storage structure
 */
interface AuthStorage {
  version: number;
  providers: Record<string, StoredCredential>;
}

// In-memory copy of environment variables (isolated from process.env)
let envCache: Record<string, string | undefined> = {};
let authStorage: AuthStorage | null = null;
let initialized = false;

/**
 * Provider configurations
 */
export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  openai: {
    name: 'OpenAI',
    env: ['OPENAI_API_KEY'],
    defaultBaseUrl: 'https://api.openai.com/v1',
  },
  groq: {
    name: 'Groq',
    env: ['GROQ_API_KEY'],
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
  },
  openrouter: {
    name: 'OpenRouter',
    env: ['OPENROUTER_API_KEY'],
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
  },
  kimi: {
    name: 'Kimi',
    env: ['KIMI_API_KEY'],
    defaultBaseUrl: 'https://api.kimi.com/coding/v1',
  },
};

/**
 * Initialize the Env system
 * Creates an isolated copy of process.env and loads stored credentials
 */
export function init(): void {
  if (initialized) return;
  
  // Create isolated copy of process.env
  envCache = { ...process.env };
  
  // Load stored credentials
  loadAuthStorage();
  
  initialized = true;
}

/**
 * Ensure the system is initialized
 */
function ensureInitialized(): void {
  if (!initialized) {
    init();
  }
}

/**
 * Load auth storage from disk
 */
function loadAuthStorage(): void {
  try {
    if (existsSync(AUTH_FILE)) {
      const content = readFileSync(AUTH_FILE, 'utf-8');
      authStorage = JSON.parse(content) as AuthStorage;
    }
  } catch {
    // Ignore errors, will create new storage
  }
  
  if (!authStorage) {
    authStorage = {
      version: 1,
      providers: {},
    };
  }
}

/**
 * Save auth storage to disk
 */
function saveAuthStorage(): void {
  try {
    // Ensure directory exists
    if (!existsSync(AUTH_DIR)) {
      mkdirSync(AUTH_DIR, { recursive: true });
    }
    
    writeFileSync(AUTH_FILE, JSON.stringify(authStorage, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save auth credentials:', error);
  }
}

/**
 * Get an environment variable
 * Checks in order: runtime env, stored credentials (for known keys)
 * @param key - Environment variable name
 * @returns The value or undefined
 */
export function get(key: string): string | undefined {
  ensureInitialized();
  
  // First check runtime environment
  if (envCache[key]) {
    return envCache[key];
  }
  
  // Check if this is an API key we have stored
  const provider = findProviderForEnvKey(key);
  if (provider && authStorage?.providers[provider]) {
    return authStorage.providers[provider].apiKey;
  }
  
  return undefined;
}

/**
 * Get all environment variables
 * @returns Copy of all environment variables
 */
export function all(): Record<string, string | undefined> {
  ensureInitialized();
  return { ...envCache };
}

/**
 * Set an environment variable (in the isolated cache)
 * @param key - Variable name
 * @param value - Variable value
 */
export function set(key: string, value: string): void {
  ensureInitialized();
  envCache[key] = value;
}

/**
 * Find which provider configuration uses a given environment key
 */
function findProviderForEnvKey(key: string): string | null {
  for (const [providerId, config] of Object.entries(PROVIDER_CONFIGS)) {
    if (config.env.includes(key)) {
      return providerId;
    }
  }
  return null;
}

/**
 * Get credentials for a provider
 * Checks in order: runtime env, stored credentials
 * @param providerId - Provider identifier (e.g., 'openai', 'groq')
 * @returns Credentials or null if not found
 */
export function getProviderCredentials(providerId: string): { apiKey: string; baseUrl?: string } | null {
  ensureInitialized();
  
  const config = PROVIDER_CONFIGS[providerId];
  if (!config) return null;
  
  // Check runtime environment first
  for (const envKey of config.env) {
    const value = envCache[envKey];
    if (value) {
      return {
        apiKey: value,
        baseUrl: envCache[`${envKey.replace('_API_KEY', '')}_BASE_URL`] || config.defaultBaseUrl,
      };
    }
  }
  
  // Check stored credentials
  const stored = authStorage?.providers[providerId];
  if (stored) {
    return {
      apiKey: stored.apiKey,
      baseUrl: stored.baseUrl || config.defaultBaseUrl,
    };
  }
  
  return null;
}

/**
 * Store credentials for a provider
 * @param providerId - Provider identifier
 * @param apiKey - API key
 * @param baseUrl - Optional base URL
 */
export function setProviderCredentials(providerId: string, apiKey: string, baseUrl?: string): void {
  ensureInitialized();
  
  if (!authStorage) {
    authStorage = { version: 1, providers: {} };
  }
  
  authStorage.providers[providerId] = {
    apiKey,
    baseUrl,
    timestamp: Date.now(),
  };
  
  saveAuthStorage();
}

/**
 * Clear stored credentials for a provider
 * @param providerId - Provider identifier
 */
export function clearProviderCredentials(providerId: string): void {
  ensureInitialized();
  
  if (authStorage?.providers[providerId]) {
    delete authStorage.providers[providerId];
    saveAuthStorage();
  }
}

/**
 * Prompt user for credentials and store them
 * @param providerId - Provider identifier
 * @returns Credentials or null if user cancelled
 */
export async function promptForCredentials(
  providerId: string
): Promise<{ apiKey: string; baseUrl: string } | null> {
  const config = PROVIDER_CONFIGS[providerId];
  if (!config) return null;
  
  console.log(`\n${config.name} API credentials not found in environment variables.`);
  console.log(`You can set ${config.env.join(' or ')} in your environment,`);
  console.log('or enter them now to store securely.\n');
  
  const apiKey = await askInput(`Enter your ${config.name} API key: `, true);
  if (!apiKey?.trim()) {
    console.log('No API key provided. Skipping credential setup.');
    return null;
  }
  
  const defaultUrl = config.defaultBaseUrl || DEFAULT_BASE_URLS[providerId] || 'https://api.openai.com/v1';
  const baseUrlInput = await askInput(`Base URL (press Enter for ${defaultUrl}): `, false);
  const baseUrl = baseUrlInput?.trim() || defaultUrl;
  
  // Store credentials
  setProviderCredentials(providerId, apiKey.trim(), baseUrl);
  
  console.log(`✓ ${config.name} credentials saved to ${AUTH_FILE}`);
  
  return { apiKey: apiKey.trim(), baseUrl };
}

/**
 * Get credentials for a provider, prompting user if not found
 * @param providerId - Provider identifier
 * @param promptIfMissing - Whether to prompt user if credentials not found
 * @returns Credentials or null
 */
export async function getOrPromptCredentials(
  providerId: string,
  promptIfMissing: boolean = true
): Promise<{ apiKey: string; baseUrl: string } | null> {
  const existing = getProviderCredentials(providerId);
  
  if (existing?.apiKey) {
    return {
      apiKey: existing.apiKey,
      baseUrl: existing.baseUrl || PROVIDER_CONFIGS[providerId]?.defaultBaseUrl || 'https://api.openai.com/v1',
    };
  }
  
  if (promptIfMissing) {
    return await promptForCredentials(providerId);
  }
  
  return null;
}

/**
 * Check if credentials exist for a provider (without prompting)
 * @param providerId - Provider identifier
 * @returns True if credentials exist
 */
export function hasCredentials(providerId: string): boolean {
  return getProviderCredentials(providerId) !== null;
}

/**
 * Clear all stored credentials
 */
export function clearAllCredentials(): void {
  authStorage = { version: 1, providers: {} };
  saveAuthStorage();
}

/**
 * Get the path to the auth file
 * @returns Absolute path to auth.json
 */
export function getAuthFilePath(): string {
  return AUTH_FILE;
}
