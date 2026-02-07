/**
 * Ollama Executor Module
 * 
 * Handles execution of LLM queries via local Ollama models.
 * Uses the Ollama JavaScript client for direct model interaction.
 */

import { execSync, spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import chalk from 'chalk';
import { cpus } from 'os';
import ollama from 'ollama';

// Directory references available for future use:
// import { dirname } from 'path';
// import { fileURLToPath } from 'url';
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

/**
 * Ollama model object
 */
interface OllamaModel {
  model: string;
  label: string;
  isInstalled: boolean;
}

/**
 * Ollama generation options
 */
interface OllamaOptions {
  temperature: number;
  num_predict: number;
  num_thread: number;
  num_batch: number;
  mmap: boolean;
  int8: boolean;
  f16: boolean;
  repeat_penalty: number;
  top_k: number;
  top_p: number;
  cache_mode: string;
  use_mmap: boolean;
  use_mlock: boolean;
}

/**
 * Optimization set configuration
 */
interface OptimizationConfig {
  temperature: number;
  num_predict: number;
}

/**
 * Structured query options
 */
interface StructuredQueryOptions {
  temperature?: number;
  max_tokens?: number;
  num_predict?: number;
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
 * Ollama stream chunk
 */
interface OllamaStreamChunk {
  message?: {
    content?: string;
  };
}

/**
 * Returns a static list of recommended Ollama models
 * @returns Array of model names
 */
export function getAvailableModels(): string[] {
  return [
    'llama3.1:8b',
    'gemma3:4b',
    'gemma3:12b',
    'qwen3:8b',
    'qwen3:14b',
    'phi4:14b',
    'phi4-reasoning:plus'
  ];
}

/**
 * Reads the list of currently installed Ollama models
 * @returns Array of installed model names
 */
export async function readModels(): Promise<string[]> {
  try {
    const output = execSync('ollama list', { encoding: 'utf8' });
    
    const models = output
      .split(/\r?\n/)
      .slice(1)                         // drop header line: NAME   SIZE
      .filter(Boolean)
      .map(l => l.split(/\s+/)[0]);    // first token is the model name
    
    return models;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red('Error reading models:'), errorMessage);
    return [];
  }
}

/**
 * Gets all Ollama models (both recommended and installed) with labels
 * @returns Array of model objects
 */
export async function getAllOllamaModels(): Promise<OllamaModel[]> {
  const recommendedModels = getAvailableModels();
  const installedModels = await readModels();
  
  const modelMap = new Map<string, OllamaModel>();
  
  // Add recommended models first
  for (const model of recommendedModels) {
    const isInstalled = installedModels.includes(model);
    modelMap.set(model, {
      model,
      label: `${model} ${isInstalled ? '(Installed)' : '(Recommended)'}`,
      isInstalled
    });
  }
  
  // Add any additional installed models that aren't in the recommended list
  for (const model of installedModels) {
    if (!modelMap.has(model)) {
      modelMap.set(model, {
        model,
        label: `${model} (Installed)`,
        isInstalled: true
      });
    }
  }
  
  // Convert to array and sort: installed first, then recommended
  return Array.from(modelMap.values()).sort((a, b) => {
    if (a.isInstalled && !b.isInstalled) return -1;
    if (!a.isInstalled && b.isInstalled) return 1;
    return a.model.localeCompare(b.model);
  });
}

/**
 * Download progress controller
 */
interface DownloadController {
  stop: () => void;
  updateProgress: (progress: string) => void;
}

/**
 * Installs an Ollama model with UI progress feedback
 * @param modelName - Model to install
 * @returns True if installation succeeded
 */
export async function installModel(modelName: string): Promise<boolean> {
  // Start UI progress indicator
  const downloader = startDownloading(modelName);
  
  try {
    // Use direct ollama CLI call to install the model
    const child: ChildProcessWithoutNullStreams = spawn('ollama', ['pull', modelName]);
    
    child.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      // Extract progress information from Ollama's output
      const progressMatch = output.match(/(\d+%)/);
      if (progressMatch) {
        downloader.updateProgress(chalk.blue(progressMatch[0]));
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      const output = data.toString();
      // Extract progress information from Ollama's error output
      const progressMatch = output.match(/(\d+%)/);
      if (progressMatch) {
        downloader.updateProgress(chalk.blue(progressMatch[0]));
      }
    });

    return new Promise((resolve) => {
      child.on('close', (code: number | null) => {
        downloader.stop();
        resolve(code === 0);
      });
    });
  } catch (error) {
    downloader.stop();
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Failed to install model ${modelName}: ${errorMessage}`));
    return false;
  }
}

/**
 * Starts a download progress indicator
 * @param modelName - The model being downloaded
 * @returns Controller
 */
export function startDownloading(modelName: string): DownloadController {
  let spinnerFrame = 0;
  let progress = '';
  const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  
  const updateDisplay = () => {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(`${spinner[spinnerFrame]} Installing ${modelName}… ${progress}`);
  };

  // Spinner animation
  const spinnerInterval = setInterval(() => {
    spinnerFrame = (spinnerFrame + 1) % spinner.length;
    updateDisplay();
  }, 80);

  const tick = () => {
    updateDisplay();
  };
  tick();
  const id = setInterval(tick, 1000);
  return {
    stop: () => {
      clearInterval(id);
      clearInterval(spinnerInterval);
    },
    updateProgress: (newProgress: string) => {
      progress = newProgress;
      updateDisplay();
    }
  };
}

/**
 * Ensures required model is installed
 * @param model - Model name to ensure
 * @returns True if successful
 */
export async function ensureModel(model: string): Promise<boolean> {
  try {
    // Check if Ollama is installed
    try {
      execSync('which ollama', { stdio: 'ignore' });
    } catch {
      console.error(chalk.red('Ollama CLI not found. Please install Ollama first.'));
      return false;
    }
    
    // Ensure the model exists
    const models = await readModels();
    if (!models.includes(model)) {
      console.log(chalk.gray(`Model ${model} not found. Installing...`));
      const installed = await installModel(model);
      if (!installed) {
        throw new Error(`Failed to install model: ${model}`);
      }
    }
    
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error ensuring model: ${errorMessage}`));
    return false;
  }
}

/**
 * Runs a query using Ollama with streaming output
 * @param prompt - The prompt to send
 * @param model - Model to use
 * @param optimizationSet - Optimization preset
 * @param onStreamStart - Optional callback when streaming begins
 * @returns The model's response
 */
export async function queryOllamaStream(
  prompt: string, 
  model: string, 
  optimizationSet: string = "error_analysis", 
  onStreamStart: (() => void) | null = null
): Promise<string> {
  try {
    await ensureModel(model);

    const cpuThreads = Math.min(8, (cpus()?.length || 2));
    const defaultOptions: OllamaOptions = {
      temperature: 0.1,
      num_predict: 768,
      num_thread: cpuThreads,
      num_batch: 32,
      mmap: true,
      int8: true,
      f16: false,
      repeat_penalty: 1.0,
      top_k: 40,
      top_p: 0.95,
      cache_mode: "all",
      use_mmap: true,
      use_mlock: true
    };

    // Get optimization set specific options
    const optimizationSets: Record<string, OptimizationConfig> = {
      "error_analysis": { temperature: 0.3, num_predict: 512 },
      "error_determination": { temperature: 0.1, num_predict: 32 },
      "command_generation": { temperature: 0.1, num_predict: 256 },
      "patch_generation": { temperature: 0.1, num_predict: 768 }
    };

    const optSet = optimizationSets[optimizationSet] || optimizationSets["error_analysis"];
    const options = { ...defaultOptions, ...optSet };

    let fullResponse = '';
    
    if (optimizationSet === "error_analysis") {
      const stream = await ollama.chat({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        options: options
      });
      let outputBuffer = '';
      let firstChunkReceived = false;

      for await (const chunk of stream as AsyncIterable<OllamaStreamChunk>) {
        const content = chunk.message?.content || '';
        if (content) {
          // Notify that streaming has started on first actual content, if callback provided
          if (!firstChunkReceived && typeof onStreamStart === 'function') {
            onStreamStart();
            firstChunkReceived = true;
          }
          
          outputBuffer += content;
          // Output in gray with no indentation
          process.stdout.write(chalk.gray(content));
        }
      }
      
      // Print a final newline
      process.stdout.write('\n');
      fullResponse = outputBuffer;
    } else {
      const response = await ollama.chat({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: options
      });
      fullResponse = response.message?.content || '';
    }

    return fullResponse;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error querying model: ${errorMessage}`));
    throw error;
  }
}

/**
 * Runs a query using Ollama with optimized settings for each prompt type
 * @param prompt - The prompt to send
 * @param model - Model to use
 * @param optimizationSet - Optimization preset
 * @param onStreamStart - Optional callback when streaming begins
 * @returns The model's response
 */
export async function queryOllamaWithTempScript(
  prompt: string, 
  model: string, 
  optimizationSet: string = "error_analysis", 
  onStreamStart: (() => void) | null = null
): Promise<string> {
  try {
    await ensureModel(model);
    
    // Use the new streaming query function instead of Python executor
    return await queryOllamaStream(prompt, model, optimizationSet, onStreamStart);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error querying model: ${errorMessage}`));
    throw error;
  }
}

/**
 * Runs a query using Ollama's JS client with structured output
 * @param prompt - The prompt to send
 * @param model - Model to use
 * @param schema - JSON schema for structured output
 * @param options - Additional options
 * @returns The structured response
 */
export async function queryOllamaStructured(
  prompt: string, 
  model: string, 
  schema: JSONSchema, 
  options: StructuredQueryOptions = {}
): Promise<Record<string, unknown>> {
  await ensureModel(model);

  const cpuThreads = Math.min(8, (cpus()?.length || 2));
  const defaultOptions: OllamaOptions = {
    temperature: 0.1,
    num_predict: 768,
    num_thread: cpuThreads,
    num_batch: 32,
    mmap: true,
    int8: true,
    f16: false,
    repeat_penalty: 1.0,
    top_k: 40,
    top_p: 0.95,
    cache_mode: "all",
    use_mmap: true,
    use_mlock: true
  };

  const combinedOptions = { ...defaultOptions, ...options };

  try {
    const response = await ollama.chat({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      format: schema,  // Pass the schema to the format parameter
      stream: false,   // Structured outputs don't work with streaming
      options: combinedOptions
    });
    
    return JSON.parse(response.message.content);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error in structured query: ${errorMessage}`));
    throw error;
  }
}
