# Agent Guidelines for Cloi

> **Project**: terminal-helper — Security-first agentic debugging tool for the terminal (TypeScript fork of Cloi)  
> **License**: GPL-3.0  
> **Runtime**: Node.js 18+ (ES Modules), Python 3.9+

---

## Project Overview

Cloi is a local, context-aware AI debugging agent that operates entirely in your terminal. It helps developers debug errors by:

1. **Capturing terminal output** from failed commands
2. **Analyzing errors** using local LLMs (via Ollama) or OpenAI-compatible APIs
3. **Retrieving relevant code context** via a hybrid RAG system (CodeBERT + BM25)
4. **Generating patches** to fix code issues with user approval
5. **Running fix commands** in an interactive loop

The project is built as a dual-runtime system:
- **TypeScript/Node.js** (primary): CLI interface, LLM routing, UI components
- **Python** (supporting): CodeBERT embedding service for RAG

---

## Project Architecture

### Directory Structure

```
├── bin/                          # CLI entry scripts & Python components
│   ├── index.ts                  # Main CLI entry wrapper
│   ├── cloi-setup.ts             # Configuration setup script
│   ├── ollama-setup.ts           # Ollama integration setup
│   ├── codebert-setup.ts         # CodeBERT model setup
│   ├── codebert_service.py       # HTTP service for CodeBERT embeddings (port 3090)
│   ├── codebert_setup.py         # CodeBERT model downloader
│   ├── ollama_setup.py           # Ollama setup helper
│   ├── tokenizer.py              # CodeBERT tokenizer utilities
│   └── pyproject.toml            # Python package configuration
├── src/
│   ├── cli/
│   │   └── index.ts              # Main CLI implementation (~2000 lines)
│   ├── core/                     # Core LLM functionality
│   │   ├── index.ts              # Core LLM operations (analyze, patch, summarize)
│   │   ├── executor/             # LLM provider implementations
│   │   │   ├── router.ts         # Routes queries to correct provider
│   │   │   ├── ollama.ts         # Ollama local model execution

│   │   │   └── openai.ts         # OpenAI API integration
│   │   ├── promptTemplates/      # LLM prompt builders
│   │   │   ├── analyze.ts        # Error analysis prompts
│   │   │   ├── classify.ts       # Error classification prompts
│   │   │   ├── command.ts        # Command generation prompts
│   │   │   ├── patch.ts          # Code patch prompts
│   │   │   └── taskPlanner.ts    # Task planning prompts
│   │   ├── ui/
│   │   │   └── thinking.ts       # Thinking spinner component
│   │   └── rag.ts                # RAG integration for core module
│   ├── rag/                      # RAG (Retrieval-Augmented Generation) system
│   │   ├── index.ts              # Main RAG API (index, retrieve, search)
│   │   ├── embeddings.ts         # CodeBERT embedding generation
│   │   ├── vectorStore.ts        # FAISS vector index management
│   │   ├── bm25.ts               # BM25 keyword search implementation
│   │   ├── hybridSearch.ts       # Hybrid vector + BM25 search
│   │   └── chunking.ts           # Code chunking strategies
│   ├── ui/                       # Terminal UI components
│   │   ├── terminalUI.ts         # Boxen-based UI components, readline management
│   │   └── prompt.ts             # User prompt utilities
│   └── utils/                    # Utility functions
│       ├── providerConfig.ts     # Multi-provider model configuration
│       ├── apiKeyManager.ts      # API key management (Claude, OpenAI)
│       ├── modelConfig.ts        # Model selection and defaults
│       ├── yoloConfig.ts         # YOLO mode configuration & safety
│       ├── cliTools.ts           # CLI helper utilities
│       ├── history.ts            # Shell history management
│       ├── traceback.ts          # Error traceback parsing
│       ├── patch.ts              # Diff generation and application
│       ├── gitUtils.ts           # Git operations
│       ├── terminalLogger.ts     # Terminal output logging
│       └── pythonCheck.ts        # Python environment validation
├── assets/                       # Demo GIFs and media
├── package.json                  # Node.js package configuration
├── tsconfig.json                 # TypeScript config for src/
├── tsconfig.bin.json             # TypeScript config for bin/
└── dist/                         # Compiled JavaScript output (gitignored)
```

### Key Technologies

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 18+, Python 3.9+ |
| Module System | ES Modules (`"type": "module"`) |
| Language | TypeScript 5.3+ |
| CLI Framework | yargs |
| UI Styling | chalk, boxen |
| Local LLMs | Ollama |
| Cloud LLMs | OpenAI-compatible APIs |
| Embeddings | CodeBERT (microsoft/codebert-base) |
| Vector Store | FAISS (faiss-node) |
| Python Env | uv (preferred) or pip |

---

## Build / Dev / Test Commands

```bash
# Development - run CLI locally (requires build first)
npm run dev

# Build (compiles TypeScript to dist/)
npm run build              # Build src/ + bin/
npm run build:src          # Build src/ only
npm run build:bin          # Build bin/ only
npm run watch              # Watch mode for src/
npm run watch:bin          # Watch mode for bin/

# Manual setup scripts
npm run dev:setup          # Setup cloi configuration
npm run dev:ollama         # Setup Ollama integration
npm run codebert-setup     # Setup CodeBERT model (~500MB)

# Service management
npm run codebert-service   # Start CodeBERT service (port 3090)
npm run codebert-start     # Start CodeBERT in background

# Installation helpers
npm run setup-all          # Run all setup scripts
npm run link               # Link package globally (npm link)
npm run unlink             # Unlink package

# Maintenance
npm run clean              # Remove node_modules and package-lock
npm run reinstall          # Clean reinstall

# Testing
npm run test-rag           # Basic RAG system load test
npm run typecheck          # TypeScript type checking (no emit)
```

**Note**: There is no formal test framework (Jest/Vitest) or linting (ESLint/Prettier) configured. Testing is currently manual/integration-based.

---

## Code Style Guidelines

### Module System
- **ES Modules only** — `"type": "module"` in package.json
- Use `.js` extension for all imports (e.g., `import { x } from './file.js'`)
- Use `import`/`export`, never `require`/`module.exports`

### Imports Order
1. External dependencies (chalk, boxen, fs, path, etc.)
2. Internal absolute imports (from `../core/`, `../utils/`, etc.)
3. Relative imports from same directory

```javascript
// GOOD
import chalk from 'chalk';
import { execSync } from 'child_process';
import { routeModelQuery } from '../core/executor/router.js';
import { startThinking } from './ui/thinking.js';
```

### Naming Conventions
- **Functions**: camelCase (`runCommand`, `analyzeWithLLM`)
- **Classes**: PascalCase (if any)
- **Constants**: UPPER_SNAKE_CASE for module-level constants
- **Files**: camelCase or kebab-case (e.g., `cliTools.js`, `ollama-setup.ts`)
- **Private/internal**: Prefix with underscore or use separate internal modules

### JSDoc Documentation
Every exported function must have JSDoc:

```javascript
/**
 * Brief description of what the function does
 * @param {string} paramName - Parameter description
 * @param {number} [optionalParam=10] - Optional with default
 * @returns {Promise<Object>} Description of return value
 */
```

### Error Handling
- Always wrap async operations in `try-catch`
- Return error objects rather than throwing when appropriate
- Use `console.error()` for actual errors, `console.log()` for user-facing output
- Handle errors gracefully — don't crash the CLI

```javascript
export async function myFunction() {
  try {
    const result = await riskyOperation();
    return { success: true, data: result };
  } catch (error) {
    console.error(`Operation failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}
```

### Async Patterns
- Prefer `async/await` over raw Promises
- Use `Promise.all()` for parallel operations
- Always handle promise rejections

### TypeScript Configuration
- **src/**: Uses `tsconfig.json` (outputs declarations and source maps)
- **bin/**: Uses `tsconfig.bin.json` (no declarations, source maps enabled)
- Target: ES2022, Module: Node16
- Strict mode enabled

---

## Core Functionality

### Interactive Commands

The CLI provides an interactive REPL with slash commands:

| Command | Description |
|---------|-------------|
| `/debug` | Auto-fix errors using AI (with RAG context) |
| `/ask <question>` | Ask the AI a question about your code |
| `/index` | Re-index your codebase for improved debugging |
| `/model` | Pick a different AI model (Ollama or OpenAI) |
| `/yolo` | Toggle YOLO mode (full system access with auto-approve) |
| `/logging` | Set up automatic error logging (zsh only) |
| `/help` | Show available commands |

### LLM Provider Routing

The `executor/router.ts` module routes queries based on model name patterns:
- `gpt-*` → OpenAI API
- Everything else → Ollama (local)

### RAG System

The Retrieval-Augmented Generation system provides code context:

1. **Indexing** (`rag/index.ts:indexCodebase`):
   - Chunks code files using `chunking.ts`
   - Generates CodeBERT embeddings via HTTP service
   - Stores vectors in FAISS index
   - Creates BM25 keyword index

2. **Retrieval** (`rag/index.ts:retrieveRelevantFiles`):
   - Performs hybrid search (70% vector, 30% BM25 by default)
   - Identifies root cause file
   - Returns grouped results by file

3. **CodeBERT Service**:
   - Runs as local HTTP service on port 3090
   - Loads microsoft/codebert-base model (~500MB)
   - Provides `/embed` endpoint for embedding generation
   - Auto-installs on first `/debug` run

### Patch Application

The `utils/patch.ts` module:
- Converts structured JSON changes to unified diff format
- Validates patches before application
- Applies patches with user confirmation
- Supports rollback on failure

---

## YOLO Mode (Privileged Execution)

YOLO (You Only Live Once) mode grants the AI full system access including sudo privileges.

**Safety Features:**
- System prompts with safety warnings
- Blocks dangerous commands:
  - `rm -rf /` and variations
  - `mkfs` commands
  - Fork bombs (`:(){:|:&};:`)
  - Disk destruction commands (`dd if=/dev/zero of=/dev/sda`)
  - Modifications to critical system directories
- Optional auto-approve (executes without confirmation)
- Visual indicator when YOLO mode is active

**Configuration:** Stored in `~/.cloi/config.json`

---

## Security Considerations

### Command Validation
All AI-generated commands are validated through `yoloConfig.ts`:
- Dangerous patterns are blocked regardless of mode
- Sudo commands require YOLO mode
- User confirmation required for patch application

### API Key Management

The Env module (`src/utils/env.ts`) provides isolated environment variable management inspired by OpenCode:

**Authentication Sources (in order of precedence):**
1. **Runtime environment variables** - `process.env` isolated copy
2. **Stored credentials** - `~/.terminal_helper/auth.json`
3. **Interactive prompts** - User enters credentials, then stored

**Supported Providers:**
- `openai` - OpenAI API (default: `https://api.openai.com/v1`)
- `groq` - Groq API (default: `https://api.groq.com/openai/v1`)
- `openrouter` - OpenRouter API (default: `https://openrouter.ai/api/v1`)
- `kimi` - Kimi API (default: `https://api.kimi.com/coding/v1`)

**Environment Variables:**
- `OPENAI_API_KEY` / `OPENAI_BASE_URL`
- `GROQ_API_KEY` / `GROQ_BASE_URL`
- `OPENROUTER_API_KEY` / `OPENROUTER_BASE_URL`
- `KIMI_API_KEY` / `KIMI_BASE_URL`

**Key Methods:**
- `Env.init()` - Initialize isolated env copy
- `Env.get(key)` - Get environment variable
- `Env.getProviderCredentials(providerId)` - Get credentials for a provider
- `Env.promptForCredentials(providerId)` - Prompt user for credentials
- `Env.getOrPromptCredentials(providerId)` - Get or prompt for credentials

Keys are validated before use. If no credentials are found, the user is prompted interactively.

### Data Privacy
- Ollama models run locally (no data sent externally)
- Cloud APIs only receive error context, not full codebase
- RAG indices stored locally in `.terminal_helper/rag-data/` (only if using RAG)

---

## Python Components (Optional)

**Python is only required for RAG features.** Terminal Helper works without Python for basic debugging.

Python files in `bin/` directory handle ML workloads for RAG:

### Requirements (pyproject.toml)
- `torch>=2.5.0`
- `transformers>=4.38.0`
- `onnx>=1.15.0`
- `numpy>=1.24.0`

### Setup (for RAG only)
```bash
# Using npm script
npm run setup-python

# Or manually with uv
cd bin
uv venv
uv sync
```

### Running CodeBERT Service (for RAG)
```bash
# Foreground
npm run codebert-service

# Background
npm run codebert-start
```

---

## Configuration Files

### User Configuration
Stored in `~/.terminal_helper/`:
- `config.json` — App config (YOLO mode, model preferences)
- `auth.json` — Stored API credentials
- `rag-data/` — FAISS and BM25 indices (only if using RAG)
- `models/` — Downloaded CodeBERT model (only if using RAG)
- `terminal_output.log` — Terminal logging (if enabled)

### Project Configuration
- `.terminal_helper/rag-data/` — Per-project RAG indices (gitignored)



---

## Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `chore:` Build/tooling changes

---

## Deployment Notes

The package is published to npm as `@cloi-ai/cloi`:

1. Files included in package (`package.json` files field):
   - `dist/`
   - `bin/pyproject.toml`
   - `README.md`
   - `LICENSE`

2. Post-install script (`postinstall`):
   - Compiles TypeScript
   - Runs cloi-setup
   - Installs Python dependencies
   - Runs ollama-setup

3. Binary entries:
   - `cloi` → `dist/bin/index.js`
   - `cloi-setup` → `dist/bin/cloi-setup.js`
   - `cloi-ollama-setup` → `dist/bin/ollama-setup.js`
