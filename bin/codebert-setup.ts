#!/usr/bin/env node

/**
 * CodeBERT Setup Wrapper
 * 
 * This script calls the Python setup script for CodeBERT model download and handles any errors.
 * It's designed to be called during the npm installation process.
 */

import { spawnSync, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get the directory name in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the path to the Python script
const scriptPath = path.join(__dirname, 'codebert_setup.py');

// Check if Python is available
function checkPythonAvailable(): boolean {
  // Check if Python is installed
  const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
  const pythonCheck = spawnSync(pythonCommand, ['--version'], { encoding: 'utf8' });
  
  if (pythonCheck.error) {
    console.warn(`Python (${pythonCommand}) not found. CodeBERT model download will be skipped.`);
    console.warn('The application will use a fallback embedding generator.');
    return false;
  }
  
  return true;
}

// Execute the Python setup script
function runPythonSetup(): boolean {
  try {
    // Check if Python is installed
    const pythonVersion = execSync('python3 --version').toString().trim();
    console.log(`Found ${pythonVersion}`);
    
    // Execute the Python script with --break-system-packages to handle externally managed Python
    console.log('\nDownloading CodeBERT model files...');
    const pythonScriptPath = path.join(__dirname, 'codebert_setup.py');
    
    // Try to execute with --break-system-packages if needed
    try {
      // First try running without installing packages
      execSync(`python3 ${pythonScriptPath} --skip-dependencies`, { stdio: 'inherit' });
      return true;
    } catch (firstError) {
      console.log('\nTrying again with dependency installation...');
      // If that fails, try with breaking system packages (with a warning)
      console.log('\nWARNING: Installing Python packages with --break-system-packages');
      console.log('This is needed for externally managed Python environments like macOS with Homebrew');
      
      try {
        execSync(`python3 ${pythonScriptPath} --break-system-packages`, { stdio: 'inherit' });
        return true;
      } catch (secondError) {
        console.error('Error downloading model files:', secondError instanceof Error ? secondError.toString() : String(secondError));
        return false;
      }
    }
  } catch (error) {
    console.error('Error executing Python setup:', error instanceof Error ? error.toString() : String(error));
    return false;
  }
}

// Check if the Python script exists
if (!fs.existsSync(scriptPath)) {
  console.error(`Error: Could not find the CodeBERT setup script at ${scriptPath}`);
  process.exit(1);
}

console.log('Setting up CodeBERT model for embedding generation...');

// Only proceed if Python is available
if (checkPythonAvailable()) {
  if (runPythonSetup()) {
    console.log('\n');
    console.log('──────────────────────────────────────────────────────────────────');
    console.log('CodeBERT model downloaded successfully!');
    console.log('Terminal Helper will use the CodeBERT model for generating code embeddings.');
    console.log('──────────────────────────────────────────────────────────────────');
    console.log('\n');
  } else {
    console.log('\n');
    console.warn('──────────────────────────────────────────────────────────────────');
    console.warn('Warning: CodeBERT model download was not completed.');
    console.warn('Please run `npm run codebert-setup` to download the model files.');
    console.warn('──────────────────────────────────────────────────────────────────');
    console.log('\n');
    // We don't exit with an error code to allow npm install to continue
  }
} else {
  console.log('\n');
  console.warn('──────────────────────────────────────────────────────────────────');
  console.warn('CodeBERT download failed.');
  console.warn('Please run `npm run codebert-setup` to download the model files.');
  console.warn('──────────────────────────────────────────────────────────────────');
  console.log('\n');
}
