# <div align="center">Terminal Helper</div>

<div align="center">AI-powered debugging agent that runs in your terminal</div>
<br>
<div align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue" alt="version" />
  <img src="https://img.shields.io/badge/license-GPL%203.0-green" alt="license" />
</div>
<br>

> **Note:** This is a TypeScript fork of [Cloi](https://github.com/cloi-ai/cloi) with modern tooling (TypeScript, uv, pyproject.toml).

## Overview

Terminal Helper is a local, context-aware agent designed to streamline your debugging process. Operating entirely on your machine, it ensures that your code and data remain private and secure. With your permission, Terminal Helper can analyze errors and apply fixes directly to your codebase.

**Disclaimer:** Terminal Helper is an experimental project under active development. It may contain bugs, and we recommend reviewing all changes before accepting agentic suggestions.

## Features

- **TypeScript** - Fully typed codebase for better maintainability
- **On-Device/API Models** – Choose between local Ollama models or OpenAI-compatible APIs (OpenAI, Groq, Kimi, etc.)
- **Smart Context Retrieval** – Optional RAG system finds relevant code files for better debugging
- **Safe Changes** – Review all diffs before applying. Full control to accept or reject
- **Zero Setup for AI** – Just Ollama or an API key. Python only needed for optional RAG features

## Installation

Install globally: 

```bash
npm install -g terminal-helper
```

**Works with your existing Ollama models - zero setup, no API key required.**

Navigate to your project directory and call Terminal Helper when you run into an error.

```bash
terminal-helper
```

### Interactive Mode Commands
```
/debug    - Auto-fix errors using AI (optional RAG for better context)
/index    - Index your codebase for RAG (requires Python)
/model    - Pick a different AI model (Ollama, OpenAI, etc.)
/logging  - Set up automatic error logging (zsh only)
/yolo     - Toggle YOLO mode (full system access with auto-approve)
/help     - Show available commands
```

### YOLO Mode

YOLO (You Only Live Once) mode grants the AI full system access including sudo privileges. This is useful for:
- Installing system packages
- Modifying system configuration
- Administrative tasks

**⚠️ EXTREME CAUTION ADVISED ⚠️**

YOLO mode includes these safety features:
- System prompts with safety warnings about dangerous commands
- Blocks commands like `rm -rf /`, `mkfs`, fork bombs
- Optional auto-approve (executes without confirmation)

Enable YOLO mode by running `/yolo` in the interactive CLI. You'll be prompted to confirm and can toggle auto-approve.

### Using OpenAI-Compatible APIs

Want to use OpenAI or any OpenAI-compatible API (Groq, OpenRouter, etc.) instead of local models? You have two options:

#### Option 1: Environment Variables (Recommended for CI/CD)

```bash
export OPENAI_API_KEY="your-api-key-here"
export OPENAI_BASE_URL="https://api.openai.com/v1"  # Optional, defaults to OpenAI
```

Add these to your `~/.zshrc` file, then restart your terminal.

#### Option 2: Interactive Credential Storage

If no environment variables are set, Terminal Helper will **prompt you** to enter your API key and base URL on first use. Credentials are securely stored in:

```
~/.terminal_helper/auth.json
```

**Supported Providers:**

| Provider | Environment Variable | Default Base URL |
|----------|---------------------|------------------|
| OpenAI | `OPENAI_API_KEY` | `https://api.openai.com/v1` |
| Groq | `GROQ_API_KEY` | `https://api.groq.com/openai/v1` |
| OpenRouter | `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1` |
| Kimi | `KIMI_API_KEY` | `https://api.kimi.com/coding/v1` |

**Credential Precedence:**
1. Runtime environment variables (highest priority)
2. Stored credentials in `~/.terminal_helper/auth.json`
3. User prompt (credentials are then stored for future use)

### RAG (Optional - Requires Python)

**RAG is completely optional.** Terminal Helper works great for debugging without it!

If you want enhanced context retrieval that finds relevant code files across your entire codebase:

1. Install Python 3.9+ and `uv`
2. Run `npm run setup-python` to install CodeBERT dependencies
3. Run `/index` to index your codebase

RAG combines CodeBERT (500 MB) embeddings with BM25 keyword search to identify files related to your error. Without RAG, Terminal Helper still analyzes errors and suggests fixes using just the error output and stack traces.

### Terminal Logging

Enable automatic error capture without making Terminal Helper re-run commands. Run `/logging` to modify your `.zshrc`, then restart your terminal. All output gets saved to `~/.terminal_helper/terminal_output.log` with auto-rotation (1 MB). (zsh only)
**Note:** Currently only tested with zsh shell.

### System Requirements

<table>
<tr>
  <td><b>🖥️ Hardware</b></td>
  <td>
    • <b>Memory:</b> 8GB RAM minimum (16GB+ recommended)<br>
    • <b>Storage:</b> 10GB+ free space for Ollama models<br>
    • <b>Processor:</b> Tested on M2, M3, and x86_64
  </td>
</tr>
<tr>
  <td><b>💻 Software (Basic)</b></td>
  <td>
    • <b>OS:</b> macOS, Linux, Windows (WSL)<br>
    • <b>Runtime:</b> Node.js 18+<br>
    • <b>Shell:</b> Zsh, Bash, Fish<br>
    • <b>AI:</b> Ollama OR OpenAI-compatible API key
  </td>
</tr>
<tr>
  <td><b>💻 Software (RAG - Optional)</b></td>
  <td>
    • <b>Python:</b> 3.9+ with uv<br>
    • <b>Extra Storage:</b> ~500MB for CodeBERT model<br>
  </td>
</tr>
</table>

### RAG Setup (Optional - for Enhanced Context)

**Skip this if you just want to use Terminal Helper for debugging without RAG.**

If you want the enhanced code context retrieval (RAG):

1. Install `faiss-node` (optional dependency):
```bash
npm install faiss-node
```

2. Setup Python environment:
```bash
npm run setup-python
```

```bash
# Install uv if not already installed
curl -LsSf https://astral.sh/uv/install.sh | sh

# Setup Python environment
npm run setup-python
```

This installs:
- CodeBERT model (~500MB) for code embeddings
- FAISS for vector search
- BM25 for keyword search

### Development Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd terminal-helper

# Install Node.js dependencies (no Python needed for basic usage)
npm install

# Build TypeScript
npm run build

# Run locally
npm run dev

# Optional: Setup Python for RAG features
npm run setup-python
```

### Contributing

This is a fork of [Cloi](https://github.com/cloi-ai/cloi). Contributions are welcome!

- **License:** GNU General Public License v3.0 (GPL-3.0)

For more detailed information on contributing, please refer to the [CONTRIBUTING.md](CONTRIBUTING.md) file.

---

### Changelog

#### [1.0.0] - Fork Release
- **Refactor:** Converted entire codebase to TypeScript
- **Build:** Added TypeScript compilation with separate configs for src/ and bin/
- **Python:** Migrated from requirements.txt to pyproject.toml with uv support
- **Package:** Renamed package to "terminal-helper"

#### Original Cloi Changelog (prior to fork)
See [Cloi releases](https://github.com/cloi-ai/cloi/releases) for history before this fork.
