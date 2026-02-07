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
- **Modern Python Tooling** - Uses `uv` and `pyproject.toml` instead of pip/requirements.txt
- **On-Device/API Models** – Choose between local Ollama models or OpenAI-compatible APIs (OpenAI, Groq, etc.)
- **Smart Context Retrieval** – RAG system automatically finds relevant code files for better debugging
- **Safe Changes** – Review all diffs before applying. Full control to accept or reject
- **Zero Setup** – RAG models, indexing, and dependencies install automatically on first use

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
/debug    - Auto-fix errors using AI models (sets up RAG automatically)
/index    - Re-index your codebase for improved debugging accuracy
/model    - Pick a different AI model (Ollama or OpenAI)
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

### RAG

Terminal Helper uses Retrieval-Augmented Generation to find relevant code files across your entire codebase when debugging. RAG combines CodeBERT (500 MB) embeddings with BM25 keyword search to identify files related to your error. Auto-installs on first `/debug` run.

### Terminal Logging

Enable automatic error capture without making Terminal Helper re-run commands. Run `/logging` to modify your `.zshrc`, then restart your terminal. All output gets saved to `~/.terminal_helper/terminal_output.log` with auto-rotation (1 MB). (zsh only)
**Note:** Currently only tested with zsh shell.

### System Requirements

<table>
<tr>
  <td><b>🖥️ Hardware</b></td>
  <td>
    • <b>Memory:</b> 8GB RAM minimum (16GB+ recommended)<br>
    • <b>Storage:</b> 10GB+ free space (Phi-4 model: ~9.1GB)<br>
    • <b>Processor:</b> Tested on M2 and M3
  </td>
</tr>
<tr>
  <td><b>💻 Software</b></td>
  <td>
    • <b>OS:</b> macOS (Big Sur 11.0+), Linux<br>
    • <b>Runtime:</b> Node.js 18+ and Python 3.9+<br>
    • <b>Shell:</b> Zsh, Fish, Bash (limited testing)<br>
    • <b>Dependencies:</b> Ollama (automatically installed if needed), uv (for Python)
  </td>
</tr>
</table>

### Development Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd terminal-helper

# Install Node.js dependencies
npm install

# Build TypeScript
npm run build

# Install Python dependencies (using uv)
cd bin && uv pip install -e .

# Run locally
npm run dev
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
