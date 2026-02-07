# Agent Guidelines for Cloi

> **Project**: @cloi-ai/cloi — Security-first agentic debugging tool for the terminal  
> **License**: GPL-3.0  
> **Runtime**: Node.js 14+ (ES Modules)

---

## Build / Dev / Test Commands

```bash
# Development - run CLI locally
npm run dev

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
```

**Note**: No formal test framework (Jest/Vitest) or linting (ESLint/Prettier) is configured. Testing is currently manual/integration-based.

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
- **Files**: camelCase or kebab-case (e.g., `cliTools.js`, `ollama-setup.cjs`)
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

### File Structure Conventions
```
src/
  cli/          # CLI entry points and command handlers
  core/         # Core business logic
    executor/   # LLM provider routing
    promptTemplates/  # Prompt builders
    ui/         # Core UI components (thinking spinner)
  rag/          # RAG system (embeddings, vector store, search)
  ui/           # Terminal UI components
  utils/        # Utility functions
```

### UI/Output Patterns
- Use `chalk` for colors (`chalk.gray()`, `chalk.green()`, etc.)
- Use `boxen` for boxed UI elements with consistent styling
- Use spinner (`startThinking()`) for long-running operations
- Keep user-facing messages friendly and informal

### Commit Messages
Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `chore:` Build/tooling changes

### Dependencies
- Keep dependencies minimal
- Prefer native Node.js APIs when possible
- Check package.json for existing patterns before adding new deps

### Python Integration
This project has Python components (CodeBERT service):
- Python files in `bin/` directory
- Use Python 3.8+ features
- Keep Python scripts standalone and well-commented

---

## Project Architecture Notes

- **RAG System**: Hybrid search using CodeBERT embeddings + BM25 keyword search
- **LLM Routing**: Supports both local Ollama and Anthropic Claude APIs
- **CLI**: Interactive REPL with slash commands (/debug, /ask, /index, /model, /yolo)
- **YOLO Mode**: Privileged execution mode with safety guards
- **Patch Application**: Unified diff generation and application for code fixes

## Safety & Security

- Never execute `rm -rf /`, `mkfs`, fork bombs, or similar destructive commands
- Validate all user-provided commands before execution
- YOLO mode requires explicit user confirmation
- All AI-generated patches require user approval before application
