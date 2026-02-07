/**
 * Core LLM Functionality Module
 * 
 * Exposes high-level functions for LLM operations.
 * Acts as the central interface for all LLM interactions.
 */

// Import prompt templates
import { buildAnalysisPrompt, buildSummaryPrompt } from './promptTemplates/analyze.js';
import { buildErrorTypePrompt } from './promptTemplates/classify.js';
import { buildCommandFixPrompt } from './promptTemplates/command.js';
import { buildPatchPrompt } from './promptTemplates/patch.js';

// Import executor modules
import { 
  routeModelQuery, 
  routeStructuredQuery, 
  ensureModelAvailable, 
  getAllAvailableModels, 
  getInstalledModels, 
  installModelIfNeeded 
} from './executor/router.js';

// Import UI components
import { startThinking, getThinkingPhrasesForAnalysis, getThinkingPhrasesForPatch, getThinkingPhrasesForSummarization } from './ui/thinking.js';

// Import utilities
import { buildErrorContext, extractFilesFromTraceback, getErrorLines } from '../utils/traceback.js';
import { convertToUnifiedDiff } from '../utils/patch.js';
import chalk from 'chalk';
import fs from 'fs';

/**
 * RAG context information for error analysis
 */
export interface RAGContext {
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
 * File information for error context
 */
export interface FileInfo {
  content?: string;
  withLineNumbers?: string;
  start?: number;
  end?: number;
  path?: string;
  ragContext?: RAGContext;
  ragRootCause?: string;
  ragRelatedFiles?: string;
  ragEnhancedContent?: string;
  [key: string]: unknown;
}

/**
 * Model query options
 */
export interface ModelQueryOptions {
  temperature?: number;
  max_tokens?: number;
  onStreamStart?: () => void;
  [key: string]: unknown;
}

/**
 * LLM response result
 */
export interface LLMResponse {
  response: string;
  reasoning: string;
}

/**
 * Analysis result
 */
export interface AnalysisResult {
  analysis: string;
  reasoning: string;
  wasStreamed: boolean;
}

/**
 * Command fix result
 */
export interface CommandFixResult {
  command: string;
  reasoning: string;
}

/**
 * Patch generation result
 */
export interface PatchResult {
  diff: string;
  reasoning: string;
}

/**
 * Code summary result
 */
export interface SummaryResult {
  summary: string;
  wasStreamed: boolean;
}

/**
 * RAG file with content
 */
export interface RAGFile {
  path: string;
  startLine: number;
  endLine: number;
  content: string;
}

/**
 * JSON schema property definition
 */
export interface JSONSchemaProperty {
  type: string;
  nullable?: boolean;
}

/**
 * Patch change structure
 */
export interface PatchChange {
  file_path: string;
  line_number: number;
  old_line: string;
  new_line?: string | null;
}

/**
 * Structured patch data
 */
export interface PatchData {
  changes: PatchChange[];
  description?: string;
  error?: unknown;
}

/**
 * JSON schema for patch structured output (compatible with executor router)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PatchSchema = any;

/**
 * Analyzes error output with an LLM
 * @param errorOutput - The error output to analyze
 * @param model - The model to use
 * @param fileInfo - Optional file information for context
 * @param codeSummary - Optional code summary
 * @param filePath - Optional file path
 * @param optimizationSet - The optimization set to use
 * @returns Analysis, reasoning and streaming flag
 */
export async function analyzeWithLLM(
  errorOutput: string, 
  model: string = 'phi4:latest', 
  fileInfo: FileInfo = {}, 
  codeSummary: string = '', 
  filePath: string = '', 
  optimizationSet: string = 'error_analysis'
): Promise<AnalysisResult> {
  // Start thinking animation - use normal positioning to avoid spacing issues
  const stopThinking = startThinking(getThinkingPhrasesForAnalysis(), false);
  
  try {
    await ensureModelAvailable(model);
    
    // Get traceback context if available
    const context = buildErrorContext(errorOutput, 30);
    
    // Prepare enhanced file info that includes RAG context
    const enhancedFileInfo: FileInfo = { ...fileInfo };
    
    // If we have RAG context, include it in the prompt
    if (fileInfo.ragContext) {
      // Add RAG enhanced context to the file info
      if (fileInfo.ragEnhancedContent) {
        enhancedFileInfo.ragEnhancedContent = fileInfo.ragEnhancedContent;
      }
      
      // Include root cause file information
      if (fileInfo.ragContext.rootCauseFile) {
        const rootFile = fileInfo.ragContext.rootCauseFile;
        enhancedFileInfo.ragRootCause = `ROOT CAUSE (score: ${rootFile.score.toFixed(3)}): ${rootFile.path} (lines ${rootFile.startLine}-${rootFile.endLine})`;
      }
      
      // Include related files information
      if (fileInfo.ragContext.relatedFiles && fileInfo.ragContext.relatedFiles.length > 0) {
        const relatedInfo = fileInfo.ragContext.relatedFiles.map(file => 
          `- ${file.path} (lines ${file.startLine}-${file.endLine}, score: ${file.score.toFixed(3)})`
        ).join('\n');
        enhancedFileInfo.ragRelatedFiles = `RELATED FILES:\n${relatedInfo}`;
      }
    }
    
    // Build the analysis prompt with enhanced context
    const prompt = buildAnalysisPrompt(errorOutput, enhancedFileInfo, codeSummary, filePath, context);
    
    const max_tokens = 512; // Increased for RAG context
    
    // Flag to track if response was streamed
    let wasStreamed = false;
    
    // Create a callback to stop the spinner when streaming begins
    // Both providers now call onStreamStart when first content arrives
    const onStreamStart = () => {
      wasStreamed = true;
      // Both providers call when content is already appearing, so skip newline for both
      stopThinking(true);
    };
    
    // Send the query to the appropriate model with the callback
    const result = await routeModelQuery(prompt, model, { temperature: 0.3, max_tokens, onStreamStart }, optimizationSet);
    
    // Since we're already streaming the output, we don't need to display it again
    // Just return it for further processing
    return {
      analysis: result.response,
      reasoning: result.reasoning,
      wasStreamed
    };
  } catch (error) {
    stopThinking();
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      analysis: `Error during analysis: ${errorMessage}`,
      reasoning: '',
      wasStreamed: false
    };
  }
}

/**
 * Determines the type of error using LLM
 * @param errorOutput - The error output
 * @param analysis - Previous analysis of the error
 * @param model - The model to use
 * @returns Either "TERMINAL_COMMAND_ERROR" or "CODE_FILE_ISSUE"
 */
export async function determineErrorType(errorOutput: string, analysis: string, model: string): Promise<string> {
  // First do a quick check for obvious terminal errors
  if (isTerminalCommandError(errorOutput)) {
    return "TERMINAL_COMMAND_ERROR";
  }
  
  const stopThinking = startThinking(getThinkingPhrasesForAnalysis());
  
  try {
    await ensureModelAvailable(model);
    
    // Build the error type classification prompt
    const prompt = buildErrorTypePrompt(errorOutput, analysis);
    
    const max_tokens = 32;
    
    // Send the query to the appropriate model
    const result = await routeModelQuery(prompt, model, { temperature: 0.1, max_tokens }, 'error_determination');
    
    stopThinking();
    
    const cleanOutput = result.response.trim();
    const isTerminal = cleanOutput.includes('TERMINAL_COMMAND_ERROR');
    
    return isTerminal ? "TERMINAL_COMMAND_ERROR" : "CODE_FILE_ISSUE";
  } catch (error) {
    stopThinking();
    return "CODE_FILE_ISSUE"; // Default to code issue if error
  }
}

/**
 * Generates a terminal command to fix an error
 * @param prevCommands - Previous attempted commands
 * @param analysis - Previous error analysis
 * @param model - The model to use
 * @returns Generated command and reasoning
 */
export async function generateTerminalCommandFix(prevCommands: string[], analysis: string, model: string): Promise<CommandFixResult> {
  const stopThinking = startThinking(getThinkingPhrasesForAnalysis());
  
  try {
    await ensureModelAvailable(model);
    
    // Build the command fix prompt
    const prompt = buildCommandFixPrompt(prevCommands, analysis);
    
    const max_tokens = 256;
    
    // Send the query to the appropriate model
    const result = await routeModelQuery(prompt, model, { temperature: 0.1, max_tokens }, 'command_generation');
    
    stopThinking();
    
    // Clean the output to get just the command
    let command = result.response.trim();
    
    // Remove markdown code blocks if present
    command = command.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
    
    // Remove any leading "Run: " or similar text
    command = command.replace(/^(Run|Execute|Type|Use|Try):\s*/i, '');
    
    // Remove any $ prefix (common in examples)
    command = command.replace(/^\$\s*/, '');
    
    return {
      command,
      reasoning: result.reasoning
    };
  } catch (error) {
    stopThinking();
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      command: `echo "Error generating command: ${errorMessage}"`,
      reasoning: ''
    };
  }
}

/**
 * Generates a patch to fix code issues
 * @param errorOutput - The error output
 * @param prevPatches - Previous attempted patches
 * @param analysis - Previous error analysis
 * @param currentDir - Current working directory
 * @param model - The model to use
 * @param fileInfo - Optional file information
 * @param codeSummary - Optional code summary
 * @returns Generated diff and reasoning
 */
export async function generatePatch(
  errorOutput: string,
  prevPatches: string[],
  analysis: string,
  currentDir: string = process.cwd(),
  model: string,
  fileInfo: FileInfo = {},
  codeSummary: string = ''
): Promise<PatchResult> {
  const stopThinking = startThinking(getThinkingPhrasesForPatch());
  
  try {
    await ensureModelAvailable(model);
    
    // Extract file paths and line numbers from the traceback
    const filesWithErrors = extractFilesFromTraceback(errorOutput);
    const errorFiles = Array.from(filesWithErrors.keys()).join('\n');
    const errorLines = Array.from(filesWithErrors.values()).join('\n');
    
    // Get the exact lines of code where errors occur
    const exactErrorCode = getErrorLines(errorOutput);
    
    // Get the code context with reduced context size (±3 lines)
    const context = buildErrorContext(errorOutput, 3, false);
    
    // Build RAG files information with their actual contents if available
    const ragFiles: RAGFile[] = [];
    try {
      if (fileInfo && fileInfo.ragContext) {
        const { rootCauseFile, relatedFiles = [] } = fileInfo.ragContext;

        /**
         * Helper to read file snippet safely.
         */
        const readSnippet = (filePath: string, start: number, end: number): string => {
          try {
            const rawLines = fs.readFileSync(filePath, 'utf8').split('\n');
            const sliceStart = Math.max(0, (start || 1) - 31); // 30 lines before
            const sliceEnd = Math.min((end || start) + 30, rawLines.length); // 30 lines after
            const numbered = rawLines.slice(sliceStart, sliceEnd)
              .map((line, idx) => `${sliceStart + idx + 1}: ${line}`)
              .join('\n');
            return numbered;
          } catch (_) {
            return '';
          }
        };

        if (rootCauseFile && rootCauseFile.path) {
          ragFiles.push({
            path: rootCauseFile.path,
            startLine: rootCauseFile.startLine,
            endLine: rootCauseFile.endLine,
            content: readSnippet(rootCauseFile.path, rootCauseFile.startLine, rootCauseFile.endLine)
          });
        }

        for (const rf of relatedFiles) {
          if (!rf || !rf.path) continue;
          ragFiles.push({
            path: rf.path,
            startLine: rf.startLine,
            endLine: rf.endLine,
            content: readSnippet(rf.path, rf.startLine, rf.endLine)
          });
        }
      }
    } catch (_) {
      // Silently ignore issues with reading RAG files
    }
    
    // Build the patch prompt
    const prompt = buildPatchPrompt(
      errorOutput,
      prevPatches,
      analysis,
      currentDir,
      fileInfo,
      codeSummary,
      errorFiles,
      errorLines,
      exactErrorCode,
      context,
      ragFiles
    );

    // Define schema for structured output
    const patchSchema: PatchSchema = {
      type: "object",
      properties: {
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              file_path: { type: "string" },
              line_number: { type: "integer" },
              old_line: { type: "string" },
              new_line: { type: "string", nullable: true }
            },
            required: ["file_path", "line_number", "old_line"]
          }
        },
        description: { type: "string" }
      },
      required: ["changes"]
    };
    
    // Try to use structured output if possible
    try {
      const structuredMaxTokens = 384;
      const jsonMaxTokens = 384;
      
      const structuredResult = await routeStructuredQuery(prompt, model, patchSchema, { 
        temperature: 0.1, 
        max_tokens: structuredMaxTokens 
      });
      
      // Get the reasoning from the model if available
      const modelResult = await routeModelQuery(prompt, model, { 
        temperature: 0.1,
        max_tokens: jsonMaxTokens
      }, 'patch_generation');
      
      stopThinking();
      
      // Convert the structured result to a proper unified diff
      let diff: string;
      try {
        // Check if structuredResult is valid for conversion
        if (structuredResult.error || !structuredResult.changes || !Array.isArray(structuredResult.changes)) {
          // Fall back to unstructured response
          diff = modelResult.response;
          console.log(chalk.gray('Structured output invalid, falling back to text response'));
        } else {
          // Type assertion since we've validated the structure
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          diff = convertToUnifiedDiff(structuredResult as any, currentDir);
        }
      } catch (error) {
        // If conversion fails, fall back to text response
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(chalk.gray(`Error converting to diff: ${errorMessage}`));
        diff = modelResult.response;
      }
      
      return {
        diff,
        reasoning: modelResult.reasoning || (structuredResult.description as string) || ''
      };
    } catch (error) {
      // Fall back to regular text generation
      const textMaxTokens = 768;
      
      const result = await routeModelQuery(prompt, model, { 
        temperature: 0.1, 
        max_tokens: textMaxTokens 
      }, 'patch_generation');
      
      stopThinking();
      
      return {
        diff: result.response,
        reasoning: result.reasoning
      };
    }
  } catch (error) {
    stopThinking();
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error generating patch: ${errorMessage}`);
    return {
      diff: '',
      reasoning: `Error generating patch: ${errorMessage}`
    };
  }
}

/**
 * Summarizes code content with an LLM
 * @param codeContent - The code content to summarize
 * @param model - The model to use
 * @returns The summary and streaming flag
 */
export async function summarizeCodeWithLLM(codeContent: string, model: string): Promise<SummaryResult> {
  const stopThinking = startThinking(getThinkingPhrasesForSummarization());
  
  try {
    await ensureModelAvailable(model);
    
    // Build the summary prompt
    const prompt = buildSummaryPrompt(codeContent);
    
    const max_tokens = 128;
    
    // Flag to track if response was streamed
    let wasStreamed = false;
    
    // Create a callback to stop the spinner when streaming begins
    // Both providers now call onStreamStart when first content arrives
    const onStreamStart = () => {
      wasStreamed = true;
      // Both providers call when content is already appearing, so skip newline for both
      stopThinking(true);
    };
    
    // Send the query to the appropriate model with the callback
    const result = await routeModelQuery(prompt, model, { temperature: 0.3, max_tokens, onStreamStart }, 'error_analysis');
    
    // Only stop thinking if it wasn't already stopped by streaming
    if (!wasStreamed) {
      stopThinking();
    }
    
    return {
      summary: result.response.trim(),
      wasStreamed
    };
  } catch (error) {
    stopThinking();
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      summary: `Error during summarization: ${errorMessage}`,
      wasStreamed: false
    };
  }
}

/**
 * Checks if an error is likely related to a terminal command issue
 * @param errorOutput - The error output to analyze
 * @returns True if it seems to be a terminal command issue
 */
function isTerminalCommandError(errorOutput: string): boolean {
  const terminalErrors: RegExp[] = [
    /command not found/i,
    /no such file or directory/i,
    /permission denied/i,
    /not installed/i,
    /invalid option/i,
    /unknown option/i,
    /missing argument/i,
    /too many arguments/i,
    /not recognized as an internal or external command/i,
    /is not recognized as a command/i,
  ];
  
  return terminalErrors.some(pattern => pattern.test(errorOutput));
}

// Export model management functions
export {
  getAllAvailableModels,
  getInstalledModels,
  installModelIfNeeded,
  ensureModelAvailable
};
