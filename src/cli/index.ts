#!/usr/bin/env node
/**
 * Main CLI Application Entry Point
 * 
 * This is the core entry point for the Terminal Helper application, providing an interactive
 * command-line interface for error analysis and automatic debugging.
 * 
 * The module integrates all other components (LLM, UI, patch application, etc.)
 * to provide a seamless experience for users to analyze and fix errors in their
 * terminal commands and code files. It handles command-line arguments, manages the
 * interactive loop, and coordinates the debugging workflow.
 */

/* ----------------------------------------------------------------------------
 *  Terminal Helper — Secure Agentic Debugger
 *  ----------------------------------------------------------------------------
 */

import chalk from 'chalk';
import boxen from 'boxen';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import path, { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

// Import from our modules
import { 
  BOX, 
  echoCommand, 
  askYesNo, 
  getReadline, 
  closeReadline, 
  askInput
} from '../ui/terminalUI.js';
import { runCommand, ensureDir, writeDebugLog } from '../utils/cliTools.js';
import { lastRealCommand, selectHistoryItem } from '../utils/history.js';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { 
  analyzeWithLLM, 
  determineErrorType, 
  generateTerminalCommandFix, 
  generatePatch, 
  summarizeCodeWithLLM, 
  getInstalledModels as readModels,
  installModelIfNeeded as installModel
} from '../core/index.js';
// Import router for model queries
import { routeModelQuery } from '../core/executor/router.js';
// RAG imports are loaded dynamically to allow CLI to work without dependencies
import { extractDiff, confirmAndApply } from '../utils/patch.js';
import { readFileContext, extractFilesFromTraceback } from '../utils/traceback.js';
import { startThinking } from '../core/ui/thinking.js';
// Import prompt builders for debugging
import { buildTaskPlanPrompt } from '../core/promptTemplates/taskPlanner.js';

// Import model configuration utilities
import { getDefaultModel } from '../utils/modelConfig.js';

// Import system information and command validator
import { getSystemInfo } from '../utils/systemInformation.js';


// Get directory references
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/* ───────────────────────── Type Definitions ────────────────────────────── */

/**
 * RAG context information for a file
 */
interface RAGContext {
  rootCauseFile?: {
    path: string;
    content?: string;
    startLine: number;
    endLine: number;
    score: number;
  };
  relatedFiles?: Array<{
    path: string;
    content?: string;
    startLine: number;
    endLine: number;
    score: number;
  }>;
}

/**
 * File information structure
 */
interface FileInfo {
  content?: string;
  withLineNumbers?: string;
  start?: number;
  end?: number;
  path?: string;
  ragContext?: RAGContext;
  ragEnhancedContext?: string;
  [key: string]: unknown;
}

/**
 * RAG statistics
 */
interface RAGStats {
  vectorStats: {
    vectorCount: number;
    dimension?: number;
    size?: number;
  };
  bm25Stats: {
    documentCount: number;
    termCount?: number;
  };
}

/**
 * RAG population status
 */
interface RAGPopulatedStatus {
  isPopulated: boolean;
  vectorCount: number;
  documentCount: number;
}

/**
 * CodeBERT model check result
 */
interface CodeBERTCheckResult {
  installed: boolean;
  modelPath: string;
}

/**
 * Yargs argv interface
 */
interface CliArgv {
  model?: string;
  m?: string;
  setupLogging?: boolean;
  help?: boolean;
  '?': boolean;
  _: (string | number)[];
  $0: string;
}

/**
 * Debug iteration record
 */
interface DebugIteration {
  error: string;
  patch: string;
  analysis: string;
}

/**
 * Model info from provider config
 */
interface ModelInfo {
  model: string;
  label: string;
  provider: string;
}

/* ───────────────────────── Interactive Loop ────────────────────────────── */
/**
 * Enhanced error detection function that recognizes various failure patterns
 * @param output - The command output to analyze
 * @returns True if an error/failure is detected
 */
function detectFailure(output: string): boolean {
  if (!output || typeof output !== 'string') return false;
  
  // Common failure patterns (case-insensitive)
  const failurePatterns: RegExp[] = [
    /error/i,                    // Original pattern
    /failed/i,                   // "Failed to start", "Build failed", etc.
    /exception/i,                // JavaScript/Java exceptions
    /traceback/i,                // Python tracebacks
    /fatal/i,                    // Fatal errors
    /warning.*not found/i,       // Warnings about missing things
    /cannot find/i,              // "Cannot find module", etc.
    /no such file/i,            // File not found errors
    /permission denied/i,        // Permission issues
    /command not found/i,        // Command errors
    /syntax error/i,            // Code syntax issues
    /reference error/i,         // JavaScript reference errors
    /type error/i,              // Type errors
    /import error/i,            // Import/require errors
    /module.*not found/i,       // Module resolution failures
    /connection.*refused/i,     // Network connection issues
    /timeout/i,                 // Timeout errors
    /compilation.*failed/i,     // Build/compilation failures
    /abort/i,                   // Aborted operations
    /crash/i,                   // Application crashes
    /segmentation fault/i,      // Low-level crashes
    /stack overflow/i,          // Stack overflow errors
    /out of memory/i,           // Memory issues
    /invalid/i,                 // Invalid configurations, arguments, etc.
    /unauthorized/i,            // Auth failures
    /forbidden/i,               // Access denied
    /not implemented/i,         // Unimplemented features
    /deprecated/i,              // Deprecated warnings (often indicate issues)
    /unsupported/i             // Unsupported operations
  ];
  
  return failurePatterns.some(pattern => pattern.test(output));
}

/**
 * Runs the main interactive loop of the FigAI CLI.
 * Presents a prompt allowing the user to execute commands like /analyze, /debug, /history, /model.
 * Manages the state (last command, current model) between interactions.
 * @param initialCmd - The initial command to have ready for analysis/debugging.
 * @param limit - The history limit to use for /history selection.
 * @param initialModel - The model to use.
 */
async function interactiveLoop(initialCmd: string | null, limit: number, initialModel: string): Promise<void> {
    let lastCmd: string | null = initialCmd;
    let currentModel: string = initialModel;
  
    while (true) {
      closeReadline(); // Ensure clean state before each iteration
      const { isYOLOEnabled } = await import('../utils/yoloConfig.js');
      const yoloEnabled = await isYOLOEnabled();
      const yoloIndicator = yoloEnabled ? chalk.red(' [YOLO]') : '';
      
      console.log(boxen(
        `${chalk.gray('Type a command ')} (${chalk.blue('/ask')}, ${chalk.blue('/debug')}, ${chalk.blue('/index')}, ${chalk.blue('/model')}, ${chalk.blue('/logging')}, ${chalk.blue('/yolo')}, ${chalk.blue('/help')})${yoloIndicator}`,
        BOX.PROMPT
      ));
      // Add improved gray text below the boxen prompt for exit instructions and /debug info
      console.log(chalk.gray('  Run /debug to auto-fix the last command, or ctrl+c when you\'re done.'));
  
      const input: string = await new Promise(r => {
        const rl = getReadline();
        rl.question('> ', (t: string) => {
          closeReadline(); // Clean up after getting input
          r(t.trim().toLowerCase());
        });
      });
  
      // Handle /ask command with natural language input
      if (input.startsWith('/ask ')) {
        const query = input.substring(5).trim();
        if (query) {
          process.stdout.write('\n');
          await askCommand(query, currentModel);
          process.stdout.write('\n');
        } else {
          console.log(boxen('Please provide a query after /ask', { ...BOX.OUTPUT, title: 'Usage Error' }));
        }
        continue;
      }

      switch (input) {
        case '/ask': {
          process.stdout.write('\n');
          const query = await askInput('What would you like me to help you with? ', false);
          if (query && query.trim()) {
            await askCommand(query.trim(), currentModel);
          } else {
            console.log(boxen('No query provided', { ...BOX.OUTPUT, title: 'Input Error' }));
          }
          process.stdout.write('\n');
          break;
        }

        case '/debug': {
          process.stdout.write('\n');
          await debugLoop(lastCmd, limit, currentModel);
          process.stdout.write('\n');
          break;
        }

        case '/index': {
          process.stdout.write('\n');
          await indexCommand(currentModel);
          process.stdout.write('\n');
          break;
        }
  
        case '/history': {
          const sel = await selectHistoryItem(limit);
          if (sel) {
            lastCmd = sel;
            console.log(boxen(`Selected command: ${lastCmd}`, { ...BOX.OUTPUT, title: 'History Selection' }));
          }
          process.stdout.write('\n');
          break;
        }
  
        case '/model': {
          const newModel = await selectModelFromList();
          if (newModel) {
            currentModel = newModel;
            process.stdout.write('\n');
            
            const { setDefaultModel } = await import('../utils/modelConfig.js');
            const saveResult = await setDefaultModel(newModel);
            
            if (saveResult) {
              console.log(boxen(`Model ${currentModel} is now set as default`, { ...BOX.OUTPUT, title: 'Success' }));
            } else {
              console.log(boxen(`Using model: ${currentModel} for this session only`, BOX.PROMPT));
              console.log(chalk.gray('Failed to save as default model'));
            }
          }
          break;
        }
        
        case '/logging': {
          if (!process.env.SHELL || !process.env.SHELL.includes('zsh')) {
            console.log(boxen(
              `Terminal logging is only supported for zsh shell.\nYour current shell is: ${process.env.SHELL || 'unknown'}\n\nTerminal Helper will still work but without auto-logging capabilities.`,
              { ...BOX.OUTPUT, title: 'Shell Not Supported' }
            ));
            break;
          }
          
          const { isLoggingEnabled, setupTerminalLogging, disableLogging } = await import('../utils/terminalLogger.js');
          const loggingEnabled = await isLoggingEnabled();
          
          if (loggingEnabled) {
            console.log(boxen(
              `Terminal logging is currently enabled.\nDo you want to disable it?`,
              { ...BOX.CONFIRM, title: 'Logging Status' }
            ));
            
            const shouldDisable = await askYesNo('Disable terminal logging?');
            if (shouldDisable) {
              const success = await disableLogging();
              console.log('\n');
              if (success) {
                console.log(boxen(
                  `Terminal logging has been disabled.\nPlease restart your terminal or run 'source ~/.zshrc' for changes to take effect.`,
                  { ...BOX.OUTPUT, title: 'Success' }
                ));
              } else {
                console.log(chalk.red('Failed to disable terminal logging.'));
              }
            }
          } else {
            const uiTools = { askYesNo, askInput, closeReadline };
            await setupTerminalLogging(uiTools, false);
          }
          break;
        }
        
        case '/yolo': {
          process.stdout.write('\n');
          await yoloCommand();
          process.stdout.write('\n');
          break;
        }

        case '/help':
          console.log(boxen(
            [
              '/ask      – ask me to help with a task in natural language',
              '/debug    – let me fix that error for you',
              '/index    – scan your codebase for better debugging',
              '/model    – pick a different AI model',
              '/logging  – set up automatic error logging (zsh only)',
              '/yolo     – toggle YOLO mode (auto-approve commands with sudo)',
              '/help     – show this menu',
            ].join('\n'),
            BOX.PROMPT
          ));
          break;
  
        case '':
          break;
  
        default:
          console.log(chalk.red('Not sure what that means! Try'), chalk.bold('/help'));
      }
    }
  }

/* ───────────────  Index command  ─────────────── */
/**
 * Command to index the current codebase for RAG
 * @param currentModel - The current model for user feedback
 */
async function indexCommand(_currentModel: string): Promise<void> {
  console.log(chalk.gray('  Let me scan your codebase for better debugging...\n'));
  await echoCommand('pwd');
  const { output: currentDir } = runCommand('pwd');
  
  // Check if indexing is enabled for this project
  console.log(chalk.gray('  Checking if enhanced indexing is ready for this project...'));
  
  try {
    // Check for CodeBERT model and offer download if missing
    const { installed: codeBertInstalled } = await checkCodeBERTModel();

    if (!codeBertInstalled) {
      console.log(boxen(
        `Enhanced codebase analysis requires the CodeBERT model.\n\n` +
        `This will enable me to:\n` +
        `• Understand semantic relationships in your code\n` +
        `• Find relevant files during debugging\n` +
        `• Provide better context-aware suggestions\n\n` +
        `Would you like to download it now?`,
        { ...BOX.CONFIRM, title: 'Enhanced Codebase Analysis' }
      ));
      
      const shouldDownload = await askYesNo('Download CodeBERT for enhanced analysis?');
      
      if (!shouldDownload) {
        console.log(boxen(
          `No problem! You can run /index again anytime to set up enhanced analysis.\n\n` +
          `For now, you'll get basic error analysis without codebase context.`,
          { ...BOX.OUTPUT_DARK, title: 'Basic Analysis Mode' }
        ));
        return;
      }
      
      // Offer to download the model
      const downloadSuccess = await downloadCodeBERTModel();
      
      if (!downloadSuccess) {
        console.log(boxen(
          `Model download didn't complete, but that's okay!\n\n` +
          `You can try again later with /index or continue with basic debugging.`,
          { ...BOX.OUTPUT_DARK, title: 'No Worries' }
        ));
        return;
      }
    }
    
    console.log(boxen(
      `Time to scan your codebase for better debugging!\nThis might take a few minutes for bigger projects.`,
      { ...BOX.CONFIRM, title: 'Codebase Indexing' }
    ));
    
    // Initialize RAG which will also do the indexing
    const { initializeRAGIfNeeded } = await import('../core/rag.js');
    const rootInfo: { root: string; type: string; confidence: string } | null = await initializeRAGIfNeeded(currentDir.trim());
    
    if (!rootInfo) {
      throw new Error('Failed to initialize RAG - no project root found');
    }
    
    console.log(chalk.gray(`  Nice! Detected a ${rootInfo.type} project: ${path.basename(rootInfo.root)} (${rootInfo.confidence} confidence)`));
    
    // Ensure CodeBERT service is running before indexing (indexing requires embeddings)
    console.log(chalk.gray('  Starting up the AI service for code analysis...'));
    
    // Check if CodeBERT service is running, and start it if needed
    const { execSync } = await import('child_process');
    try {
      execSync('curl -s http://localhost:3090/health > /dev/null 2>&1', { timeout: 2000 });
      console.log(chalk.gray('  AI service is already running, perfect!'));
    } catch (error) {
      // Service not running, try to start it
      console.log(chalk.gray('  Firing up the AI service...'));
      
      try {
        // Import and start the service
        const { startCodeBERTService } = await import('../rag/embeddings.js');
        await startCodeBERTService();
        
        // Wait for service to start
        console.log(chalk.gray('  Waiting for CodeBERT service to start...'));
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Verify it started
        try {
          execSync('curl -s http://localhost:3090/health > /dev/null 2>&1', { timeout: 3000 });
          console.log(chalk.gray('  CodeBERT service started successfully'));
        } catch (verifyError) {
          console.log(chalk.gray('  CodeBERT service may still be starting...'));
          return;
        }
      } catch (startError) {
        const errorMsg = startError instanceof Error ? startError.message : String(startError);
        console.log(chalk.gray(`  Could not start CodeBERT service: ${errorMsg}`));
        return;
      }
    }
    
    // Force re-index regardless of existing state
    const { indexCodebase } = await import('../rag/index.js');
    console.log(chalk.gray('  Re-indexing codebase...'));
    
    interface IndexResults {
      fileCount: number;
      chunkCount: number;
      vectorStats?: { vectorCount?: number };
      bm25Stats?: { documentCount?: number };
    }
    
    const results: IndexResults = await indexCodebase(rootInfo.root, {
      maxFilesToProcess: 500, // More files for manual indexing
      batchSize: 20,
      forceReindex: true
    });
    
    console.log(boxen(
      `Indexing complete!\n` +
      `Project: ${path.basename(rootInfo.root)}\n` +
      `Files processed: ${results.fileCount}\n` +
      `Code chunks: ${results.chunkCount}\n` +
      `Vector embeddings: ${results.vectorStats?.vectorCount || 0}\n` +
      `BM25 documents: ${results.bm25Stats?.documentCount || 0}\n\n` +
      `Your codebase is now supercharged for debugging!`,
      { ...BOX.OUTPUT, title: 'Indexing Complete' }
    ));
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(boxen(
      `Indexing failed: ${errorMsg}\n\n` +
      `Common solutions:\n` +
      `• Ensure Python 3.7+ is installed\n` +
      `• Check your internet connection for model download\n` +
      `• Verify you're in a valid project directory\n` +
      `• Try running /index again to retry download\n\n` +
      `Cloi will continue to work with basic error analysis.`,
      { ...BOX.OUTPUT_DARK, title: 'Indexing Failed' }
    ));
  }
}

/* ───────────────────────── YOLO Command ────────────────────────────── */
/**
 * Command to toggle YOLO mode settings
 */
async function yoloCommand(): Promise<void> {
  const yoloConfig = await import('../utils/yoloConfig.js');
  
  interface YOLOStatus {
    enabled: boolean;
    autoApprove: boolean;
  }
  
  const status: YOLOStatus = await yoloConfig.getYOLOStatus();
  
  if (!status.enabled) {
    console.log(boxen(
      chalk.yellow('⚠️  YOLO MODE - EXTREME CAUTION ADVISED ⚠️\n\n') +
      'YOLO mode grants the AI full system access including:\n' +
      '• Execute commands with sudo privileges\n' +
      '• Modify system files\n' +
      '• Install system packages\n' +
      '• Perform administrative tasks\n\n' +
      chalk.red('SAFETY WARNINGS:\n') +
      '• NEVER execute "rm -rf /" or similar commands\n' +
      '• NEVER format drives or destroy data\n' +
      '• ALWAYS review commands before execution\n\n' +
      'Enable YOLO mode?',
      { ...BOX.CONFIRM, title: 'YOLO Mode', borderColor: 'red' }
    ));
    
    const shouldEnable = await askYesNo('Enable YOLO mode?');
    if (shouldEnable) {
      console.log('\n');
      const autoApprove = await askYesNo('Enable auto-approve? (commands will execute without confirmation)');
      
      await yoloConfig.enableYOLO();
      if (autoApprove) {
        await yoloConfig.setAutoApprove(true);
      }
      
      console.log(boxen(
        chalk.red('🔥 YOLO MODE ENABLED 🔥\n\n') +
        `Auto-approve: ${autoApprove ? chalk.green('ON') : chalk.yellow('OFF')}\n\n` +
        'The AI now has full system access.\n' +
        'Use with extreme caution!',
        { ...BOX.OUTPUT, title: 'YOLO Active', borderColor: 'red' }
      ));
    } else {
      console.log(chalk.gray('YOLO mode not enabled.'));
    }
  } else {
    console.log(boxen(
      chalk.red('YOLO mode is currently ENABLED\n\n') +
      `Auto-approve: ${status.autoApprove ? chalk.green('ON') : chalk.yellow('OFF')}\n\n` +
      'What would you like to do?',
      { ...BOX.CONFIRM, title: 'YOLO Status', borderColor: 'yellow' }
    ));
    
    const disable = await askYesNo('Disable YOLO mode?');
    if (disable) {
      await yoloConfig.disableYOLO();
      console.log(boxen(
        chalk.green('YOLO mode disabled.\n') +
        'System access has been restricted.',
        { ...BOX.OUTPUT, title: 'YOLO Disabled' }
      ));
    } else {
      const toggleAutoApprove = await askYesNo(`Toggle auto-approve? (currently ${status.autoApprove ? 'ON' : 'OFF'})`);
      if (toggleAutoApprove) {
        await yoloConfig.setAutoApprove(!status.autoApprove);
        console.log(boxen(
          `Auto-approve is now ${!status.autoApprove ? chalk.green('ON') : chalk.yellow('OFF')}`,
          { ...BOX.OUTPUT, title: 'Setting Updated' }
        ));
      }
    }
  }
}

/* ───────────────────────── Ask Command ────────────────────────────── */
/**
 * Command to handle natural language queries
 * @param query - The natural language query
 * @param currentModel - The current model to use
 */
async function askCommand(query: string, currentModel: string): Promise<void> {
  try {
    const systemInfo = await getSystemInfo();
    // Use type assertion to resolve interface mismatch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prompt = await buildTaskPlanPrompt(query, systemInfo as any);
  
    console.log(chalk.gray('  Thinking...\n'));
    
    // Show thinking animation
    const stopThinking = startThinking();
    
    interface ModelQueryResult {
      response: string;
      reasoning?: string;
    }
    
    // Query the model using our router
    const result = await routeModelQuery(prompt, currentModel, { temperature: 0.1, max_tokens: 512 }, 'command_generation') as ModelQueryResult;
    
    stopThinking();
    
    // Parsing the response
    interface TaskPlanResponse {
      plan_steps?: string[];
      commands?: string[];
    }
    
    let response: TaskPlanResponse;
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = result.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        response = JSON.parse(jsonMatch[0]) as TaskPlanResponse;
      } else {
        response = JSON.parse(result.response) as TaskPlanResponse;
      }
    } catch (parseError) {
      console.log(boxen(
        chalk.red('Failed to parse response from AI model.\n\nResponse was: ') + result.response,
        { ...BOX.ERROR, title: 'Parse Error' }
      ));
      return;
    }
    
    const { plan_steps, commands } = response;
    
    if (!plan_steps || !commands || !Array.isArray(plan_steps) || !Array.isArray(commands)) {
      console.log(boxen(
        chalk.red('Invalid response structure from AI model.\n\nResponse was: ') + JSON.stringify(response, null, 2),
        { ...BOX.ERROR, title: 'Invalid Response' }
      ));
      return;
    }
    
    // Show plan in the box
    console.log(boxen(
      chalk.bold('Execution Plan:\n\n') +
      plan_steps.map(step => `• ${step}`).join('\n') +
      `\n\n` + chalk.bold('Commands to be executed:\n') +
      commands.map(cmd => `  $ ${chalk.cyan(cmd)}`).join('\n'),
      { padding: 1, margin: 1, borderStyle: 'round', title: 'Cloi Terminal Helper', titleAlignment: 'center' }
    ));
    
    // YOLO-aware command validation
    const yoloConfig = await import('../utils/yoloConfig.js');
    const isYOLO = await yoloConfig.isYOLOEnabled();
    const autoApprove = await yoloConfig.isAutoApproveEnabled();
    
    // Validate each command for safety
    for (const command of commands) {
      const validation = yoloConfig.validateCommandSafety(command, isYOLO);
      if (!validation.safe) {
        console.log(boxen(
          chalk.red('Error: Potentially dangerous command detected.\n\n') +
          `Command: ${chalk.yellow(command)}\n` +
          `Reason: ${validation.reason}`,
          { ...BOX.ERROR, title: 'Security Warning' }
        ));
        return;
      }
      if (validation.requiresSudo) {
        console.log(boxen(
          chalk.yellow('Command requires sudo privileges.\n\n') +
          `Command: ${chalk.yellow(command)}\n\n` +
          'Enable YOLO mode (/yolo) to execute commands with elevated privileges.',
          { ...BOX.ERROR, title: 'Sudo Required' }
        ));
        return;
      }
    }
    
    // Confirm execution (unless auto-approve is on)
    if (commands.length > 0) {
      let proceed = true;
      if (!autoApprove) {
        proceed = await askYesNo('Proceed with execution?');
      } else {
        console.log(chalk.yellow('\n⚡ Auto-approve enabled - executing commands without confirmation\n'));
      }
      
      if (proceed) {
        // Execute commands
        for (const command of commands) {
          console.log(`\n$ ${chalk.yellow(command)}\n`);
          await new Promise<void>((resolve, reject) => {
            // Split command and args
            const [cmd, ...args] = command.split(' ');
            
            const spawned = spawn(cmd, args, { stdio: 'inherit', shell: true });
            
            spawned.on('close', (code: number | null) => {
              if (code === 0) {
                resolve();
              } else {
                reject(new Error(`Command failed with exit code ${code}`));
              }
            });
            spawned.on('error', (err: Error) => reject(err));
          });
        }
        console.log(chalk.green('\n✅ Task completed successfully!'));
      } else {
        console.log(chalk.gray('  Task execution cancelled.'));
      }
    } else {
      console.log(chalk.gray('  No commands to execute.'));
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(boxen(
      chalk.red('An error occurred while processing your request:\n') + errorMsg,
      { ...BOX.ERROR, title: 'Error' }
    ));
  }
}

/* ───────────────────────── RAG Helper Functions ────────────────────────────── */
/**
 * Check if CodeBERT model is installed
 * @returns Object with installed status and model path
 */
async function checkCodeBERTModel(): Promise<CodeBERTCheckResult> {
  try {
    const path = await import('path');
    const fs = await import('fs');
    
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const modelFilesDir = path.join(homeDir, '.terminal_helper', 'models', 'codebert-base');
    
    // Check if model directory exists
    if (!fs.existsSync(modelFilesDir)) {
      return { installed: false, modelPath: modelFilesDir };
    }
    
    // Check for required files
    const requiredFiles: string[] = [
      'pytorch_model.bin',
      'tokenizer.json',
      'config.json',
      'vocab.json'
    ];
    
    for (const file of requiredFiles) {
      const filePath = path.join(modelFilesDir, file);
      if (!fs.existsSync(filePath)) {
        return { installed: false, modelPath: modelFilesDir };
      }
    }
    
    return { installed: true, modelPath: modelFilesDir };
  } catch (error) {
    return { installed: false, modelPath: '' };
  }
}

/**
 * Download CodeBERT model with user permission and progress feedback
 * @returns Whether download was successful
 */
async function downloadCodeBERTModel(): Promise<boolean> {
  try {
    console.log(boxen(
      `CodeBERT model not found. This model enables enhanced error analysis with RAG.\n\n` +
      `Download details:\n` +
      `• Model: microsoft/codebert-base (~500MB)\n` +
      `• Location: ~/.terminal_helper/models/codebert-base/\n` +
      `• Required for: Enhanced context retrieval\n\n` +
      `Would you like to download it now?`,
      { ...BOX.CONFIRM, title: 'CodeBERT Model Download' }
    ));
    
    const shouldDownload = await askYesNo('Download CodeBERT model?');
    
    if (!shouldDownload) {
      console.log(chalk.gray('\nSkipping CodeBERT download. Continuing with basic error analysis.'));
      return false;
    }
    
    console.log(boxen(
      `Starting CodeBERT model download...\nThis may take a few minutes depending on your internet connection.`,
      { ...BOX.OUTPUT, title: 'Downloading' }
    ));
    
    console.log(chalk.gray('  Initializing download process...'));
    
    // Try multiple approaches to run the setup script
    
    // Approach 1: Try npm run if we're in a project with cloi
    const approach1Success = await tryNpmRunApproach();
    if (approach1Success) return true;
    
    // Approach 2: Try finding global cloi installation
    const approach2Success = await tryGlobalCliApproach();
    if (approach2Success) return true;
    
    // Approach 3: Try direct Python script execution
    const approach3Success = await tryDirectPythonSetup();
    return approach3Success;
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`Error during CodeBERT download: ${errorMsg}`));
    return false;
  }
}

/**
 * Try using npm run codebert-setup approach
 * @returns Whether setup was successful
 */
async function tryNpmRunApproach(): Promise<boolean> {
  try {
    console.log(chalk.gray(`   Trying: npm run codebert-setup`));
    
    const { spawn } = await import('child_process');
    
    return new Promise((resolve) => {
      const downloadProcess = spawn('npm', ['run', 'codebert-setup'], {
        stdio: ['inherit', 'pipe', 'pipe'],
        cwd: process.cwd()
      });
      
      // Handle stdout with progress indicators
      downloadProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        
        if (output.includes('Found Python')) {
          console.log(chalk.gray('  Python environment detected'));
        } else if (output.includes('Downloading CodeBERT') || output.includes('downloaded successfully')) {
          console.log(chalk.gray('  Downloading CodeBERT model files...'));
        } else if (output.includes('setup completed')) {
          console.log(chalk.gray('  CodeBERT model setup completed'));
        } else if (output.trim() && !output.includes('npm WARN')) {
          console.log(chalk.gray(`   ${output.trim()}`));
        }
      });
      
      downloadProcess.stderr?.on('data', (data: Buffer) => {
        const error = data.toString();
        if (!error.includes('npm WARN') && !error.includes('UserWarning')) {
          console.log(chalk.gray(`   ${error.trim()}`));
        }
      });
      
      downloadProcess.on('close', (code: number | null) => {
        if (code === 0) {
          console.log(boxen(
            chalk.green('CodeBERT model downloaded successfully!\nEnhanced error analysis is now available.'),
            { ...BOX.OUTPUT, title: 'Download Complete' }
          ));
          resolve(true);
        } else {
          console.log(chalk.gray(`   npm approach failed with code ${code}, trying alternative...`));
          resolve(false);
        }
      });
      
      downloadProcess.on('error', (error: Error) => {
        console.log(chalk.gray(`   npm approach failed: ${error.message}, trying alternative...`));
        resolve(false);
      });
      
      // Set timeout for npm approach
      setTimeout(() => {
        downloadProcess.kill();
        console.log(chalk.gray('   npm approach timed out, trying alternative...'));
        resolve(false);
      }, 30000); // 30 second timeout
    });
  } catch {
    return false;
  }
}

/**
 * Try using global cloi binary approach  
 * @returns Whether setup was successful
 */
async function tryGlobalCliApproach(): Promise<boolean> {
  try {
    console.log(chalk.gray(`   Trying: cloi codebert-setup (global CLI)`));
    
    const { spawn, execSync } = await import('child_process');
    
    // Check if cloi is available globally
    try {
      execSync('which cloi 2>/dev/null || where cloi 2>nul', { stdio: 'ignore' });
    } catch (error) {
      console.log(chalk.gray('   Global cloi command not found, trying direct approach...'));
      return false;
    }
    
    return new Promise((resolve) => {
      // Try to run cloi with a hypothetical setup command
      // Since cloi doesn't have a setup subcommand, this will likely fail
      // But we'll keep this for future extensibility
      const setupProcess = spawn('cloi', ['--setup-codebert'], {
        stdio: ['inherit', 'pipe', 'pipe']
      });
      
      setupProcess.on('close', (code: number | null) => {
        if (code === 0) {
          console.log(boxen(
            chalk.gray('CodeBERT model downloaded successfully!'),
            { ...BOX.OUTPUT, title: 'Download Complete' }
          ));
          resolve(true);
        } else {
          console.log(chalk.gray('   Global CLI approach failed, trying direct Python...'));
          resolve(false);
        }
      });
      
      setupProcess.on('error', () => {
        console.log(chalk.gray('   Global CLI approach failed, trying direct Python...'));
        resolve(false);
      });
      
      // Quick timeout since this approach likely won't work
      setTimeout(() => {
        setupProcess.kill();
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    return false;
  }
}

/**
 * Alternative method to set up CodeBERT using direct Python execution
 * @returns Whether setup was successful
 */
async function tryDirectPythonSetup(): Promise<boolean> {
  try {
    console.log(chalk.gray('   Trying: Direct Python script execution'));
    
    const { spawn, execSync } = await import('child_process');
    const path = await import('path');
    const fs = await import('fs');
    
    // Try multiple methods to find the Terminal Helper installation directory
    let cloiPackagePath: string | null = null;
    let setupScriptPath: string | null = null;
    
    // Method 1: Try npm list to find global package
    try {
      const globalPath = execSync('npm list -g @cloi-ai/cloi --parseable 2>/dev/null', { encoding: 'utf-8' }).trim();
      if (globalPath && fs.existsSync(globalPath)) {
        cloiPackagePath = globalPath;
        setupScriptPath = path.join(cloiPackagePath, 'bin', 'codebert_setup.py');
        console.log(chalk.gray(`   Found Terminal Helper at: ${cloiPackagePath}`));
      }
    } catch (error) {
      // Continue to next method
    }
    
    // Method 2: Try npm root global + package name
    if (!setupScriptPath) {
      try {
        const npmRoot = execSync('npm root -g 2>/dev/null', { encoding: 'utf-8' }).trim();
        if (npmRoot) {
          cloiPackagePath = path.join(npmRoot, '@cloi-ai', 'cloi');
          if (fs.existsSync(cloiPackagePath)) {
            setupScriptPath = path.join(cloiPackagePath, 'bin', 'codebert_setup.py');
            console.log(chalk.gray(`   Found Terminal Helper at: ${cloiPackagePath}`));
          }
        }
      } catch (error) {
        // Continue to next method
      }
    }
    
    // Method 3: Try to find cloi binary and derive path
    if (!setupScriptPath) {
      try {
        const cloiPath = execSync('which cloi 2>/dev/null || where cloi 2>nul', { encoding: 'utf-8' }).trim();
        if (cloiPath) {
          // cloi binary is typically in bin/ directory, so go up one level
          const binDir = path.dirname(cloiPath);
          cloiPackagePath = path.dirname(binDir);
          setupScriptPath = path.join(cloiPackagePath, 'bin', 'codebert_setup.py');
          console.log(chalk.gray(`   Derived Terminal Helper path from binary: ${cloiPackagePath}`));
        }
      } catch (error) {
        // Continue to next method
      }
    }
    
    // Method 4: Check if we're running from within cloi source
    if (!setupScriptPath) {
      // Get the directory where this CLI script is located
      const currentScriptDir = path.dirname(fileURLToPath(import.meta.url));
      const possibleCloiRoot = path.resolve(currentScriptDir, '..', '..');
      const possibleSetupScript = path.join(possibleCloiRoot, 'bin', 'codebert_setup.py');
      
      if (fs.existsSync(possibleSetupScript)) {
        cloiPackagePath = possibleCloiRoot;
        setupScriptPath = possibleSetupScript;
        console.log(chalk.gray(`   Using local Terminal Helper installation: ${cloiPackagePath}`));
      }
    }
    
    // Final check: verify the setup script exists
    if (!setupScriptPath || !fs.existsSync(setupScriptPath)) {
      console.log(chalk.gray(`   Could not locate CodeBERT setup script. Searched:`));
      console.log(chalk.gray(`   - npm global packages`));
      console.log(chalk.gray(`   - cloi binary location`)); 
      console.log(chalk.gray(`   - local source directory`));
      console.log(chalk.gray(`   Please try running: npm install -g @cloi-ai/cloi`));
      return false;
    }
    
    console.log(chalk.gray(`   Running: python3 ${setupScriptPath}`));
    
    return new Promise((resolve) => {
      const pythonProcess = spawn('python3', [setupScriptPath], {
        stdio: ['inherit', 'pipe', 'pipe']
      });
      
      // Handle stdout
      pythonProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        if (output.includes('Found Python')) {
          console.log(chalk.gray('  Python environment detected'));
        } else if (output.includes('Downloading CodeBERT') || output.includes('downloaded successfully')) {
          console.log(chalk.gray('  Downloading CodeBERT model files...'));
        } else if (output.includes('setup completed') || output.includes('CodeBERT model setup complete')) {
          console.log(chalk.gray('  CodeBERT model setup completed'));
        } else if (output.trim()) {
          console.log(chalk.gray(`   ${output.trim()}`));
        }
      });
      
      // Handle stderr
      pythonProcess.stderr?.on('data', (data: Buffer) => {
        const error = data.toString();
        if (!error.includes('UserWarning') && !error.includes('WARNING:')) {
          console.log(chalk.gray(`   ${error.trim()}`));
        }
      });
      
      pythonProcess.on('close', (code: number | null) => {
        if (code === 0) {
          console.log(boxen(
            chalk.green('CodeBERT model downloaded successfully!\nEnhanced error analysis is now available.'),
            { ...BOX.OUTPUT, title: 'Download Complete' }
          ));
          resolve(true);
        } else {
          console.log(boxen(
            chalk.red(`Python setup failed with exit code ${code}.\nContinuing with basic error analysis.`),
            { ...BOX.OUTPUT_DARK, title: 'Setup Failed' }
          ));
          resolve(false);
        }
      });
      
      pythonProcess.on('error', (error: Error) => {
        console.log(chalk.gray(`   Python setup error: ${error.message}`));
        console.log(chalk.gray('   Make sure Python 3.7+ is installed and available.'));
        resolve(false);
      });
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(chalk.gray(`   Direct Python setup failed: ${errorMsg}`));
    return false;
  }
}

/**
 * Check if RAG indices are populated for a project
 * @param projectRoot - Project root directory
 * @returns Object with population status and counts
 */
async function isRAGPopulated(projectRoot: string): Promise<RAGPopulatedStatus> {
  try {
    const { getRAGStats } = await import('../rag/index.js');
    const stats: RAGStats = await getRAGStats(projectRoot);
    
    const vectorCount = stats.vectorStats?.vectorCount || 0;
    const documentCount = stats.bm25Stats?.documentCount || 0;
    
    return {
      isPopulated: vectorCount > 0 && documentCount > 0,
      vectorCount,
      documentCount
    };
  } catch (error) {
    // If we can't get stats, assume not populated
    return {
      isPopulated: false,
      vectorCount: 0,
      documentCount: 0
    };
  }
}

/**
 * Start CodeBERT service in background if RAG is populated but service isn't running
 * @param projectRoot - Project root directory
 * @returns Whether service was started or already running
 */
async function ensureCodeBERTServiceRunning(projectRoot: string): Promise<boolean> {
  try {
    // First check if RAG is populated
    const ragStatus = await isRAGPopulated(projectRoot);
    
    if (!ragStatus.isPopulated) {
      console.log(chalk.gray('  RAG indices not populated, skipping CodeBERT service startup'));
      return false;
    }
    
    // Check if CodeBERT service is already running
    const { execSync } = await import('child_process');
    try {
      execSync('curl -s http://localhost:3090/health > /dev/null 2>&1', { timeout: 2000 });

      return true;
    } catch (error) {
      // Service not running, try to start it
      console.log(chalk.gray('  Starting CodeBERT service in background...'));
      
      try {
        // Import and start the service
        const { startCodeBERTService } = await import('../rag/embeddings.js');
        await startCodeBERTService();
        
        // Wait a moment for service to start
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Verify it started
        try {
          execSync('curl -s http://localhost:3090/health > /dev/null 2>&1', { timeout: 3000 });
          console.log(chalk.green('  ✓ CodeBERT service started successfully'));
          return true;
        } catch (verifyError) {
          console.log(chalk.gray('  CodeBERT service may still be starting...'));
          return false;
        }
      } catch (startError) {
        const errorMsg = startError instanceof Error ? startError.message : String(startError);
        console.log(chalk.gray(`  Could not start CodeBERT service: ${errorMsg}`));
        return false;
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(chalk.gray(`  Error checking CodeBERT service: ${errorMsg}`));
    return false;
  }
}

/* ───────────────  Debug loop  ─────────────── */
/**
 * Main debugging loop that analyzes errors and fixes them.
 * 1. Runs the current command (`cmd`).
 * 2. If successful, breaks the loop.
 * 3. If error, analyzes the error (`analyzeWithLLM`).
 * 4. Determines error type (`determineErrorType`).
 * 5. If Terminal Issue: generates a new command (`generateTerminalCommandFix`), confirms with user, updates `cmd`.
 * 6. If Code Issue: generates a patch (`generatePatch`), confirms and applies (`confirmAndApply`).
 * 7. Logs the iteration details (`writeDebugLog`).
 * Continues until the command succeeds or the user cancels.
 * @param initialCmd - The command to start debugging.
 * @param limit - History limit (passed down from interactive loop/args).
 * @param currentModel - The Ollama model to use.
 */
async function debugLoop(initialCmd: string | null, _limit: number, currentModel: string): Promise<void> {
    const iterations: DebugIteration[] = [];
    const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 15);
    const logDir = join(__dirname, 'debug_history');
    await ensureDir(logDir);
    const logPath = join(logDir, `${ts}.txt`);
  
    // Get current working directory for context
    console.log(chalk.gray('  Let me see where we are first...'));
    await echoCommand('pwd');
    const { output: currentDir } = runCommand('pwd');
    
    // Check for CodeBERT model and offer download if missing
    const { installed: codeBertInstalled } = await checkCodeBERTModel();
    
    if (!codeBertInstalled) {
      // Offer to download the model
      const downloadSuccess = await downloadCodeBERTModel();
      
      if (!downloadSuccess) {
        console.log(chalk.gray('  No worries, we can still figure this out without the fancy AI stuff...'));
      }
    }
    
    // Initialize RAG system with enhanced messaging and capture project root
    let projectRoot: string = currentDir.trim(); // Default to current directory
    try {
      const { initializeRAGIfNeeded } = await import('../core/rag.js');
      const rootInfo: { root: string; type: string; confidence: string } | null = await initializeRAGIfNeeded(currentDir.trim());
      
      // Success - Show what was detected and use the detected project root
      if (!rootInfo) {
        throw new Error('Failed to initialize RAG - no project root found');
      }
      console.log(chalk.gray(`  Sweet! I've got enhanced context for ${path.basename(rootInfo.root)} ready to go\n`));
      projectRoot = rootInfo.root; // Use the detected project root for patch application
      
      // Auto-start CodeBERT service if RAG is populated
      await ensureCodeBERTServiceRunning(rootInfo.root);
      
    } catch (error) {
      // Special handling for CodeBERT model issues - offer automatic setup
      console.log(boxen(
        `I see the CodeBERT model isn't set up yet.\n\n` +
        `Would you like me to download it now for enhanced debugging?\n` +
        `This will enable me to understand your codebase better.`,
        { ...BOX.CONFIRM, title: 'Enhanced Analysis Available' }
      ));
      
      const shouldSetupNow = await askYesNo('Download CodeBERT model for enhanced debugging?');
      
      if (shouldSetupNow) {
        console.log(chalk.blue('Great! Setting up enhanced analysis...'));
        const setupSuccess = await downloadCodeBERTModel();
        
        if (setupSuccess) {
          // Retry RAG initialization after successful model download
          try {
            const { initializeRAGIfNeeded } = await import('../core/rag.js');
            // Clear cache to force re-initialization
            const { clearRAGCache } = await import('../core/rag.js');
            clearRAGCache();
            
            const rootInfo: { root: string; type: string; confidence: string } | null = await initializeRAGIfNeeded(currentDir.trim());
            if (!rootInfo) {
              throw new Error('Failed to initialize RAG after setup');
            }
            console.log(chalk.green(`  Enhanced context for ${path.basename(rootInfo.root)} is now ready!\n`));
            projectRoot = rootInfo.root;
            
            // Start CodeBERT service if needed
            await ensureCodeBERTServiceRunning(rootInfo.root);
          } catch (retryError) {
            const retryErrorMsg = retryError instanceof Error ? retryError.message : String(retryError);
            console.log(chalk.gray(`  Setup completed, but indexing will happen in the background: ${retryErrorMsg}`));
          }
        } else {
          console.log(chalk.gray('  No problem! I can still help you debug this the traditional way.'));
        }
      } else if ((error as Error).message.includes('project structure')) {
        console.log(boxen(
          `Hmm, this doesn't look like a typical project structure, but that's totally fine!\n\n` +
          `I'll just use my basic debugging skills instead...`,
          { ...BOX.OUTPUT_DARK, title: 'No Problem!' }
        ));
      } else if ((error as Error).message.includes('git repository')) {
        console.log(boxen(
          `I notice this isn't a git repo yet.\n\n` +
          `Pro tip: Running 'git init' helps me understand your project better,\n` +
          `but I can definitely work with what we have here!`,
          { ...BOX.OUTPUT_DARK, title: 'Just a Thought' }
        ));
      } else if ((error as Error).message.includes('Python') || (error as Error).message.includes('requirements')) {
        console.log(boxen(
          `Looks like we're missing some Python dependencies for the advanced stuff.\n\n` +
          `That's cool though - I've debugged plenty of code the old-fashioned way!\n` +
          `If you want the full experience later, just install Python 3.7+`,
          { ...BOX.OUTPUT_DARK, title: 'Python Missing' }
        ));
      } else {
        console.log(chalk.gray(`  Heads up: ${(error as Error).message}`));
        console.log(chalk.gray(`  But hey, I've got other tricks up my sleeve!`));
      }
    }
    
    // Initialize file content and summary variables outside try-catch scope
    let fileContentRaw = '';
    let fileContentWithLineNumbers = '';
    let codeSummary = '';
    let filePath = '';
    let isValidSourceFile = false; // Track if we have a valid source file
    // Initialize fileInfo with default values
    let fileInfo: FileInfo | null = null;
    
    // First, try to extract recent errors from terminal logs
    let cmd: string | null = initialCmd;
    console.log(chalk.gray('  Let me check if you\'ve got any recent errors logged...\n'));
    
    // Import and use the terminal log reader and logger
    const { extractRecentError } = await import('../utils/terminalLogs.js');
    const { isLoggingEnabled } = await import('../utils/terminalLogger.js');
    
    // Check if terminal logging is enabled (for zsh users)
    const loggingEnabled = process.env.SHELL?.includes('zsh') ? await isLoggingEnabled() : false;
    
    // Show the equivalent command for reading terminal logs
    if (loggingEnabled) {
      await echoCommand('tail -n 750 ~/.terminal_helper/terminal_output.log');
    }
    
    // Try to get error from logs first
    const { error: logError, files: logFiles } = await extractRecentError();
    
    // Variables to store final error output
    let ok = true;
    let output = '';
    
    // If we found a likely runtime error in logs
    if (logError && logFiles.size > 0) {
      console.log(chalk.gray(`  Ah, found something! Looks like this happened when you ran: ${initialCmd}\n`));
      
      // Show the last 5 lines of the traceback error
      const errorLines = logError.split('\n');
      const lastFiveLines = errorLines.slice(Math.max(0, errorLines.length - 3));
      
      // Add simple dividers to indicate error section
      console.log(chalk.gray('  Here\'s what went wrong:'));
      lastFiveLines.forEach(line => console.log(chalk.gray(`  ${line}`)));
      
      output = logError;
      ok = false; // Mark as error since we found one
    } else {
      // If logging is not enabled and this is a zsh shell, suggest enabling it
      if (!loggingEnabled && process.env.SHELL?.includes('zsh')) {
        console.log(boxen(
          chalk.gray('Quick tip: Enable terminal logging with /logging and I can catch errors automatically!\nJust needs a terminal restart to work its magic.'),
          { ...BOX.OUTPUT_DARK, title: 'Tip' }
        ));
      }
      
      // Fall back to running the command - show appropriate message based on logging status
      if (!loggingEnabled) {
        console.log(chalk.gray('  No logging setup, so let me run this and see what happens...'));
      } else {
        console.log(chalk.gray('  Nothing in the logs, so let me try running this fresh...'));
      }
      await echoCommand(cmd || '');
      const result = runCommand(cmd || '');
      ok = result.ok;
      output = result.output;
    }
    
    if (ok && !detectFailure(output)) {
      console.log(boxen(chalk.green('Wait... this actually worked fine! No errors here.'), { ...BOX.OUTPUT, title: 'All Good!' }));
      return;
    }
      
    // Extract possible file paths from the command or error logs
    try {
      // If we extracted error from logs and have file paths already, use those
      if (logError && logFiles && logFiles.size > 0) {
        // Use the first file from the logs
        filePath = Array.from((logFiles as Map<string, number>).keys())[0];

        // Check if it's a valid file
        isValidSourceFile = !!(filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile());
        
        // If not a file, try as absolute path relative to project root
        if (!isValidSourceFile && filePath && !filePath.startsWith('/')) {
          filePath = join(projectRoot, filePath);
          isValidSourceFile = !!(fs.existsSync(filePath) && fs.statSync(filePath).isFile());
        }
      } else {
        // Extract possible filename from commands like "python file.py", "node script.js", etc.
        let possibleFile = initialCmd || '';
        
        // Common command prefixes to check for
        const commandPrefixes = ['python', 'python3', 'node', 'ruby', 'perl', 'php', 'java', 'javac', 'bash', 'sh'];
        
        // Check if the command starts with any of the common prefixes
        for (const prefix of commandPrefixes) {
          if (initialCmd && initialCmd.startsWith(prefix + ' ')) {
            // Extract everything after the prefix and a space
            possibleFile = initialCmd.substring(prefix.length + 1).trim();
            break;
          }
        }
        
        // Further extract arguments if present (get first word that doesn't start with -)
        const parts = possibleFile.split(' ');
        const foundPart = parts.find(part => part && !part.startsWith('-'));
        possibleFile = foundPart || '';
        
        // First check relative path
        filePath = possibleFile;
        isValidSourceFile = !!(filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile());
        
        // If not a file, try as absolute path relative to project root
        if (!isValidSourceFile && filePath && !filePath.startsWith('/')) {
          filePath = join(projectRoot, filePath);
          isValidSourceFile = !!(fs.existsSync(filePath) && fs.statSync(filePath).isFile());
        }
      }
      
      // Check if we need additional context from the file
      // We'll read file content only if:
      // 1. It's a valid file AND
      // 2. There are NO clear error lines in the traceback
      const filesWithErrors = extractFilesFromTraceback(output);
      const hasErrorLineInfo = filesWithErrors.size > 0;
      
      if (isValidSourceFile && !hasErrorLineInfo) {
        console.log(chalk.gray(`  Let me take a look at your code to understand what's going on...`));
        // Show the sed command that will be used
        const start = 1; // Since we want first 200 lines, starting from line 1
        const end = 200; // Read first 200 lines
        const sedCmd = `sed -n '${start},${end}p' ${filePath}`;
        await echoCommand(sedCmd);
        
        // Use readFileContext to get the first 200 lines (using line 100 as center with ctx=100)
        const fileContentInfo = readFileContext(filePath, 100, 100);
        fileContentRaw = fileContentInfo.content;
        
        // Create a version with line numbers for analysis
        fileContentWithLineNumbers = fileContentRaw.split('\n')
          .map((line: string, index: number) => `${(fileContentInfo.start || 1) + index}: ${line}`)
          .join('\n');
        
        // Create file info object with content and line range
        fileInfo = {
          content: fileContentRaw,
          withLineNumbers: fileContentWithLineNumbers,
          start: fileContentInfo.start || 1,
          end: fileContentInfo.end || 0,
          path: filePath
        };
        
        // Summarize the content - use the version with line numbers for better context
        interface SummaryResult {
          summary: string;
          wasStreamed: boolean;
        }
        
        const { summary, wasStreamed }: SummaryResult = await summarizeCodeWithLLM(fileContentWithLineNumbers, currentModel);
        codeSummary = summary;
        
        // Only display summary if it wasn't already streamed
        if (!wasStreamed) {
          console.log('\n' +'  ' + chalk.gray(codeSummary) + '\n');
        }
      }
    } catch (error) {
      console.log(chalk.gray(`  Couldn't get the enhanced context this time: ${(error as Error).message}`));
    }
  
    // Skip displaying snippets to avoid spacing issues - analysis will handle context
    
    /* eslint-disable no-await-in-loop */
    while (true) {
      // First, run analysis like /analyze would do, but pass additional context
      // Build the analysis prompt but don't display it
      
      // Enhance file info with RAG context
      const currentFileInfo: FileInfo = fileInfo || { 
        content: fileContentRaw, 
        withLineNumbers: fileContentWithLineNumbers, 
        start: 1, 
        end: fileContentRaw ? fileContentRaw.split('\n').length : 0, 
        path: filePath 
      };
      
      // Enhance with RAG context
      let enhancedFileInfo: FileInfo = currentFileInfo;
      try {
        const { enhanceWithRAG } = await import('../core/rag.js');
        enhancedFileInfo = await enhanceWithRAG(output, currentFileInfo, projectRoot);
        
        // If we have RAG context, display a clean summary
        if (enhancedFileInfo.ragContext) {
          const rootFile = enhancedFileInfo.ragContext.rootCauseFile;
          const relatedFiles = enhancedFileInfo.ragContext.relatedFiles || [];
          
          // Add spacing before RAG context
          console.log();
          
          if (rootFile) {
            const lineInfo = rootFile.startLine && rootFile.endLine ? 
              ` (lines ${rootFile.startLine}-${rootFile.endLine})` : '';
            
            console.log(chalk.gray(`  I think I found the main culprit in ${path.basename(rootFile.path)}${lineInfo}`));
            
            // Show sed command for root cause file after the description
            if (rootFile.startLine && rootFile.endLine) {
              const start = Math.max(1, rootFile.startLine - 30);
              const end = rootFile.endLine + 30;
              await echoCommand(`sed -n '${start},${end}p' ${path.basename(rootFile.path)}`);
            }
          }
          
          if (relatedFiles.length > 0) {
            console.log(chalk.gray(`  Also found ${relatedFiles.length} other files that might be connected:`));
            
            // Show sed commands for related files after the description
            for (const file of relatedFiles) {
              if (file.startLine && file.endLine) {
                const startRel = Math.max(1, file.startLine - 30);
                const endRel = file.endLine + 30;
                await echoCommand(`sed -n '${startRel},${endRel}p' ${path.basename(file.path)}`);
              }
            }
          }
          
          // Add spacing after RAG context to separate from analysis
          console.log();
        }
      } catch (error) {
        console.log(chalk.gray(`  Note: RAG enhancement skipped: ${(error as Error).message}`));
      }
      
      interface AnalysisResult {
        analysis: string;
        reasoning?: string;
        wasStreamed: boolean;
      }
      
      const { analysis, reasoning: analysisReasoning, wasStreamed }: AnalysisResult = await analyzeWithLLM(
        output, 
        currentModel, 
        enhancedFileInfo,
        codeSummary, 
        filePath
      );
      
      // Display reasoning if available
      if (analysisReasoning) {
        console.log(boxen(analysisReasoning, { ...BOX.OUTPUT_DARK, title: 'Reasoning' }));
      }
      
      // Only display analysis if it wasn't already streamed
      if (!wasStreamed) {
        console.log('  ' + chalk.gray(analysis.replace(/\n/g, '\n  ')));
      }
      
      // Determine if this is a terminal command issue using LLM
      // Determine error type without displaying the prompt
      
      const errorType = await determineErrorType(output, analysis, currentModel);
      // Display error type as indented gray text
      console.log('  ' + chalk.gray(errorType));
      
      if (errorType === "TERMINAL_COMMAND_ERROR") {
        // Generate a new command to fix the issue
        const prevCommands = iterations.map(i => i.patch).filter(Boolean);
        
        // Generate command fix without displaying the prompt
        
        interface CommandFixResult {
          command: string;
          reasoning?: string;
        }
        
        const { command: newCommand, reasoning: cmdReasoning }: CommandFixResult = await generateTerminalCommandFix(prevCommands, analysis, currentModel);
        
        // Display command reasoning if available
        if (cmdReasoning) {
          console.log(boxen(cmdReasoning, { ...BOX.OUTPUT_DARK, title: 'Command Reasoning' }));
        }
        // Show the proposed command
        console.log(boxen(newCommand, { ...BOX.OUTPUT, title: 'Proposed Command' }));
        
        // Ask for confirmation
        if (!(await askYesNo('Run this command?'))) {
          console.log(chalk.gray('\nNo worries! Let me know if you want to try something else.'));
          break;
        }
        
        // Update the command for the next iteration
        cmd = newCommand;
        iterations.push({ error: output, patch: newCommand, analysis: analysis });
      } else {
        // Original code file patching logic
        const prevPatches = iterations.map(i => i.patch);
        
        // Extract file paths and line numbers from the traceback
        // const filesWithErrors = extractFilesFromTraceback(output);
        
        // Get the code context with reduced context size (±3 lines)
        // const context = buildErrorContext(output, 3, false);
        
        // Generate patch without displaying the prompt
        
        interface PatchResult {
          diff: string;
          reasoning?: string;
        }
        
        const { diff: rawDiff, reasoning: patchReasoning }: PatchResult = await generatePatch(
          output,
          prevPatches,
          analysis,
          projectRoot,
          currentModel,
          enhancedFileInfo, // Use the RAG-enhanced file info
          codeSummary
        );
        
        // Display patch reasoning if available
        if (patchReasoning) {
          console.log(boxen(patchReasoning, { ...BOX.OUTPUT_DARK, title: 'Patch Reasoning' }));
        }
                
        // Just extract the diff without displaying it
        const cleanDiff = extractDiff(rawDiff);
        
        // Check if we have a valid diff
        const isValidDiff = 
          // Standard unified diff format
          (cleanDiff.includes('---') && cleanDiff.includes('+++')) || 
          // Path with @@ hunks and -/+ changes
          (cleanDiff.includes('@@') && cleanDiff.includes('-') && cleanDiff.includes('+')) ||
          // File path and -/+ lines without @@ marker (simpler format)
          (cleanDiff.includes('/') && cleanDiff.includes('-') && cleanDiff.includes('+'));
        
        if (!isValidDiff) {
          console.error(chalk.red('  Hmm, I couldn\'t generate a proper fix for this one. The error might be trickier than I thought.'));
          break;
        }
  
        const applied = await confirmAndApply(cleanDiff, projectRoot);
        
        if (!applied) {
          console.log(chalk.gray('\n  No problem! Feel free to try /debug again anytime.'));
          break;
        }
  
        iterations.push({ error: output, patch: cleanDiff, analysis: analysis });
        
        // Write the debug log
        await writeDebugLog(iterations, logPath);
        
        // Exit the loop after applying the patch instead of running the command again
        console.log(chalk.green('\n  Patch applied! You should be good to go now.'));
        break;
      }
      
      await writeDebugLog(iterations, logPath);
    }
  }
  

/* ───────────────────────────────  Main  ──────────────────────────────── */

/**
 * Main entry point for the Cloi CLI application.
 * Parses command line arguments using yargs, displays a banner,
 * and routes execution based on the provided flags (`--analyze`, `--debug`, `--history`, `model`).
 * Handles fetching the last command and initiating the appropriate loop (interactive or debug).
 */
(async function main(): Promise<void> {
    const argv = (await yargs(hideBin(process.argv))
      .option('model', {
        alias: 'm',
        describe: 'Ollama model to use for completions',
        default: null as string | null,
        type: 'string'
      })
      .option('setup-logging', {
        describe: 'Set up automatic terminal logging',
        type: 'boolean'
      })
      .help().alias('help', '?')
      .epilog('Terminal Helper - Open source and completely local debugging agent.')
      .parseAsync()) as unknown as CliArgv;
    
    // Check if user explicitly requested to set up terminal logging
    if (argv.setupLogging) {
      const { setupTerminalLogging } = await import('../utils/terminalLogger.js');
      const { askYesNo, askInput, closeReadline } = await import('../ui/terminalUI.js');
      const uiTools = { askYesNo, askInput, closeReadline };
      // Show model selection during explicit setup
      const setupResult = await setupTerminalLogging(uiTools, true);
      if (!setupResult) {
        console.log(chalk.gray('Terminal logging setup was not completed.'));
      } else {
        console.log(boxen(
          chalk.green('Terminal logging has been enabled.\nAfter restarting your terminal, ALL commands will be automatically logged without any prefix.'),
          { ...BOX.OUTPUT, title: 'Success' }
        ));
      }
      process.exit(0);
    }
  
    // Load default model from config or use command line argument if provided
    let currentModel: string | null;
    
    try {
      // First try to get the user's saved default model
      const savedModel = await getDefaultModel();
      
      // If command-line argument is provided, it overrides the saved default
      currentModel = argv.model || savedModel;
    } catch (error) {
      console.error(chalk.gray(`Error loading default model: ${(error as Error).message}`));
      currentModel = 'phi4:latest';
    }
    
    // Check if this is first run (no config file exists)
    const CONFIG_FILE = join(homedir(), '.terminal_helper', 'config.json');
    const isFirstRun = !existsSync(CONFIG_FILE);
    
    // On first run, check if we should prompt for Ollama setup
    if (isFirstRun && !argv.model) {
      const { isOpenAIAvailable } = await import('../utils/apiKeyManager.js');
      
      const hasOpenAIKey = await isOpenAIAvailable();
      
      // Only prompt if no API keys are configured
      if (!hasOpenAIKey) {
        console.log(boxen(
          `Welcome to Terminal Helper! 🎉\n\n` +
          `To get started, you need an AI model. You can either:\n\n` +
          `1. Download Ollama (local, free, private) + phi4 model\n` +
          `2. Use OpenAI with your own API key\n\n` +
          `Would you like to download Ollama and the phi4 model?\n` +
          `This will use ~4GB of disk space.`,
          { ...BOX.CONFIRM, title: 'First Run Setup' }
        ));
        
        const setupOllama = await askYesNo('Download Ollama + phi4? (y/N):', true);
        console.log(setupOllama ? 'y' : 'N');
        
        if (!setupOllama) {
          // User declined Ollama setup - offer to set up OpenAI
          console.log(chalk.gray('\nNo problem! Would you like to set up OpenAI credentials?'));
          const setupOpenAI = await askYesNo('Set up OpenAI? (y/N):', true);
          
          if (setupOpenAI) {
            const { promptForOpenAICredentials } = await import('../utils/apiKeyManager.js');
            const credentials = await promptForOpenAICredentials();
            if (credentials) {
              console.log(chalk.green('✓ OpenAI credentials saved!'));
            }
          } else {
            console.log(chalk.gray('\nYou can:'));
            console.log(chalk.gray('  • Set OPENAI_API_KEY in your environment'));
            console.log(chalk.gray('  • Use /model to select a different model'));
            console.log(chalk.gray('  • Run with --model to specify a model\n'));
          }
          
          // Don't default to phi4 if they declined
          currentModel = null;
        }
      }
    }
    
    if (currentModel) {
      // Check if model is available based on its provider
      const { getModelProvider, PROVIDERS } = await import('../utils/providerConfig.js');
      
      interface ProviderConfig {
        PROVIDERS: Record<string, string>;
        getModelProvider: (model: string) => string;
      }
      
      const providerConfig: ProviderConfig = { getModelProvider, PROVIDERS };
      const provider = providerConfig.getModelProvider(currentModel);
      
      if (provider === PROVIDERS.OPENAI) {
        // For OpenAI models, skip installation check
        // (API key validation happens at query time)
      } else {
        // For Ollama models, check if they're installed
        const installedModels = await readModels();
        
        if (!installedModels.includes(currentModel)) {
          console.log(boxen(
            `Looks like ${currentModel} isn't installed yet. Want me to grab it?\nThis might take a few minutes.\n\nProceed (y/N):`,
            { ...BOX.CONFIRM, title: 'Model Installation' }
          ));
          
          const response = await askYesNo('', true);
          console.log(response ? 'y' : 'N');
          
          if (response) {
            console.log(chalk.blue(`Getting ${currentModel} ready for you...`));
            const success = await installModel(currentModel);
            
            if (!success) {
              console.log(chalk.gray(`Couldn't install ${currentModel}. I'll use the default instead.`));
              currentModel = 'phi4:latest';
            } else {
              console.log(chalk.green(`Great! ${currentModel} is ready to go.`));
            }
          } else {
            console.log(chalk.gray(`No problem, I'll stick with the default.`));
            currentModel = 'phi4:latest';
          }
        }
      }
    }
    
    const banner = chalk.blueBright.bold('Cloi') + ' — secure agentic debugging tool';
    console.log(boxen(
      `${banner}\n↳ model: ${currentModel}\n↳ completely local and secure`,
      BOX.WELCOME
    ));
    
    // Check if terminal logging should be set up (only for zsh users)
    if (process.env.SHELL && process.env.SHELL.includes('zsh')) {
      const { isLoggingEnabled, setupTerminalLogging } = await import('../utils/terminalLogger.js');
      
      // Only prompt if logging is not already enabled
      if (!(await isLoggingEnabled())) {
        try {
          const uiTools = { askYesNo, askInput, closeReadline };
          // Show model selection during first-run setup
          const setupResult = await setupTerminalLogging(uiTools, true);
          
          // If user gave permission to set up logging, ensure clean exit
          if (setupResult) {
            // Process will exit in setupTerminalLogging
            return;
          }
        } catch (error) {
          console.error(chalk.red(`Oops, something went wrong during setup: ${(error as Error).message}`));
          // Continue with normal execution if setup fails
        }
      }
    }
  
    const lastCmd = await lastRealCommand();
    if (!lastCmd) {
      console.log(chalk.gray('Hmm, I don\'t see any recent commands in your history.'));
      return;
    }

    console.log(boxen(lastCmd, { ...BOX.WELCOME, title: 'Last Command I Saw'}));
    await interactiveLoop(lastCmd, 15, currentModel || 'phi4:latest');
  })().catch(err => {
    console.error(chalk.red(`Uh oh, something went wrong: ${(err as Error).message}`));
    process.exit(1);
  });

/* ───────────────────────── Model Selection ────────────────────────────── */
/**
 * Allows the user to select a model using an interactive picker.
 * @returns Selected model or null if canceled
 */
export async function selectModelFromList(): Promise<string | null> {
  const { makePicker } = await import('../ui/terminalUI.js');
  
  try {
    console.log(boxen('Loading available models...', BOX.OUTPUT));
    
    // Get all models from both providers with proper categorization
    const { getAllProvidersModels, PROVIDERS } = await import('../utils/providerConfig.js');
    const allModels: ModelInfo[] = await getAllProvidersModels();
    
    if (allModels.length === 0) {
      console.log(boxen(
        chalk.gray('No models found. Please install Ollama and at least one model, or configure your OpenAI API key.'),
        { ...BOX.OUTPUT, title: 'Error' }
      ));
      return null;
    }
    
    // Separate models by provider
    const ollamaModels = allModels.filter(m => m.provider === PROVIDERS.OLLAMA);
    const openaiModels = allModels.filter(m => m.provider === PROVIDERS.OPENAI);
    
    // Create display options with proper categorization
    const displayOptions: string[] = [];
    const modelMapping: (string | null)[] = [];
    
    // Add Ollama section header and models
    if (ollamaModels.length > 0) {
      displayOptions.push(chalk.cyan('Ollama Models:'));
      modelMapping.push(null); // Section headers don't map to models
      
      for (const modelInfo of ollamaModels) {
        const cleanLabel = modelInfo.label.replace(' (Ollama)', '');
        displayOptions.push(`  ${cleanLabel}`);
        modelMapping.push(modelInfo.model);
      }
    }
    
    // Add OpenAI section header and models
    if (openaiModels.length > 0) {
      if (ollamaModels.length > 0) {
        displayOptions.push(''); // Empty line separator
        modelMapping.push(null);
      }
      
      displayOptions.push(chalk.cyan('OpenAI Models:'));
      modelMapping.push(null); // Section headers don't map to models
      
      for (const modelInfo of openaiModels) {
        const cleanLabel = modelInfo.label.replace(' (OpenAI)', '');
        displayOptions.push(`  ${cleanLabel}`);
        modelMapping.push(modelInfo.model);
      }
    }
    
    // Create the picker with categorized display
    const picker = makePicker(displayOptions, 'Select Model');
    const selected = await picker();
    
    if (!selected) return null;
    
    // Find the index of the selected option
    const selectedIndex = displayOptions.indexOf(selected);
    const selectedModel = modelMapping[selectedIndex];
    
    // Check if user selected a section header or empty line
    if (!selectedModel) {
      console.log(chalk.gray('Please select a specific model, not a section header.'));
      return await selectModelFromList(); // Recursively call to try again
    }
    
    // Check if this is an Ollama model that needs installation
    const { getModelProvider } = await import('../utils/providerConfig.js');
    const provider = getModelProvider(selectedModel);
    
    // Skip installation check for API-based models (OpenAI)
    if (provider === PROVIDERS.OPENAI) {
      return selectedModel;
    }
    
    if (provider === PROVIDERS.OLLAMA) {
      const installedModels = await readModels();
      const isInstalled = installedModels.includes(selectedModel);
      
      if (!isInstalled) {
        console.log(boxen(
          `Install ${selectedModel}?\nThis may take a few minutes.\n\nProceed (y/N):`,
          { ...BOX.CONFIRM, title: 'Confirm Installation' }
        ));
        const response = await askYesNo('', true);
        console.log(response ? 'y' : 'N');
        if (response) {
          const success = await installModel(selectedModel);
          if (!success) return null;
        } else {
          return null;
        }
      }
    }
    
    return selectedModel;
  } catch (error) {
    console.error(chalk.red(`Error selecting model: ${(error as Error).message}`));
    return null;
  }
}

/**
 * Checks if network is available by checking if DNS resolution works
 * @returns True if network is available
 */
// checkNetwork function can be used for network connectivity checks if needed
// function checkNetwork(): boolean {
//   try {
//     execSync('ping -c 1 -W 1 1.1.1.1 > /dev/null 2>&1', { stdio: 'ignore' });
//     return true;
//   } catch {
//     return false;
//   }
// }

// askInput is already imported from terminalUI.js at the top of the file
