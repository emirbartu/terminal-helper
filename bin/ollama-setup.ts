#!/usr/bin/env node

/**
 * Ollama Setup Wrapper
 * 
 * This script calls the Python setup script for Ollama and handles any errors.
 * It's designed to be called during the npm installation process.
 */

import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get the directory name in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the path to the Python script
const scriptPath = path.join(__dirname, 'ollama_setup.py');

// Check if Python is available
function checkPythonAndDependencies(): boolean {
  // Check Python
  const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
  const pythonCheck = spawnSync(pythonCommand, ['--version'], { encoding: 'utf8' });
  
  if (pythonCheck.error) {
    console.warn(`Python (${pythonCommand}) not found. Ollama auto-setup will be skipped.`);
    console.warn('You may need to install Ollama manually: https://ollama.com/download');
    return false;
  }
  
  // Check pip installation
  const pipCommand = process.platform === 'win32' ? 'pip' : 'pip3';
  const pipCheck = spawnSync(pipCommand, ['--version'], { encoding: 'utf8' });
  
  if (pipCheck.error) {
    console.warn(`pip (${pipCommand}) not found. Ollama auto-setup will be skipped.`);
    console.warn('You may need to install Ollama manually: https://ollama.com/download');
    return false;
  }
  
  // Check if Python requests module is installed
  const requestsCheck = spawnSync(
    pythonCommand, 
    ['-c', 'import requests; print("OK")'], 
    { encoding: 'utf8' }
  );
  
  if (requestsCheck.status !== 0) {
    console.log('Requests module not found. Attempting to install...');
    
    const pipInstall = spawnSync(
      pipCommand,
      ['install', 'requests'],
      { encoding: 'utf8', stdio: 'inherit' }
    );
    
    if (pipInstall.error || pipInstall.status !== 0) {
      console.warn('Failed to install the Python requests module. Ollama auto-setup will be skipped.');
      console.warn('You may need to install Ollama manually: https://ollama.com/download');
      return false;
    }
  }
  
  return true;
}

// Check if the Python script exists
if (!fs.existsSync(scriptPath)) {
  console.error(`Error: Could not find the Ollama setup script at ${scriptPath}`);
  process.exit(1);
}

console.log('Checking Ollama installation...');

// Only proceed if Python and requirements are available
if (checkPythonAndDependencies()) {
  // Determine the Python command to use (try python3 first, then python)
  const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

  // Run the Python script
  const setupProcess = spawn(pythonCommand, [scriptPath], {
    stdio: 'inherit' // Show output from the Python script
  });

  setupProcess.on('close', (code: number | null) => {
    if (code !== 0) {
      console.log('\n');
      console.warn('──────────────────────────────────────────────────────────────────');
      console.warn('Warning: Ollama setup was not fully completed.');
      console.warn('Terminal Helper will still work, but you may need to install Ollama manually:');
      console.warn('https://ollama.com/download');
      console.warn('──────────────────────────────────────────────────────────────────');
      console.log('\n');
      // We don't exit with an error code to allow npm install to continue
    }
  });
} else {
  console.log('\n');
  console.warn('──────────────────────────────────────────────────────────────────');
  console.warn('Skipping automatic Ollama setup.');
  console.warn('Terminal Helper will still work, but you will need to install Ollama manually:');
  console.warn('https://ollama.com/download');
  console.warn('Then run: ollama pull phi4');
  console.warn('──────────────────────────────────────────────────────────────────');
  console.log('\n');
}
