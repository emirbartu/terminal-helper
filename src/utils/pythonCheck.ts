/**
 * Python Dependency Checker
 * 
 * Utilities to check if Python and required packages are available
 * for the CodeBERT embedding service.
 */

import { execSync } from 'child_process';
import chalk from 'chalk';

/**
 * Python check result
 */
export interface PythonInfo {
  available: boolean;
  version: string;
  path: string;
  command: string;
}

/**
 * Package check results
 */
export interface PackageCheckResults {
  [packageName: string]: boolean;
}

/**
 * RAG requirements check result
 */
export interface RAGRequirements {
  ready: boolean;
  issues: string[];
  pythonInfo: PythonInfo;
  packages?: PackageCheckResults;
}

/**
 * Check if Python is available
 * @returns {Promise<PythonInfo>}
 */
export async function checkPython(): Promise<PythonInfo> {
  const pythonCommands = ['python3', 'python'];
  
  for (const cmd of pythonCommands) {
    try {
      const version = execSync(`${cmd} --version 2>&1`, { encoding: 'utf-8', timeout: 5000 }).trim();
      const path = execSync(`which ${cmd} 2>/dev/null || where ${cmd} 2>nul`, { encoding: 'utf-8', timeout: 5000 }).trim();
      
      return {
        available: true,
        version,
        path,
        command: cmd
      };
    } catch (error) {
      // Continue to next command
    }
  }
  
  return {
    available: false,
    version: '',
    path: '',
    command: ''
  };
}

/**
 * Check if required Python packages are installed
 * @param {string} pythonCmd - Python command to use
 * @returns {Promise<PackageCheckResults>}
 */
export async function checkPythonPackages(pythonCmd = 'python'): Promise<PackageCheckResults> {
  const requiredPackages = [
    'torch',
    'transformers',
    'flask',
    'numpy'
  ];
  
  const results: PackageCheckResults = {};
  
  for (const pkg of requiredPackages) {
    try {
      execSync(`${pythonCmd} -c "import ${pkg}"`, { 
        stdio: 'ignore', 
        timeout: 5000 
      });
      results[pkg] = true;
    } catch (error) {
      results[pkg] = false;
    }
  }
  
  return results;
}

/**
 * Install Python requirements
 * @param {string} pythonCmd - Python command to use
 * @returns {Promise<boolean>}
 */
export async function installPythonRequirements(pythonCmd = 'python'): Promise<boolean> {
  try {
    console.log(chalk.blue('Installing Python requirements...'));
    
    const requirementsPath = './bin/requirements.txt';
    execSync(`${pythonCmd} -m pip install -r ${requirementsPath}`, { 
      stdio: 'inherit',
      timeout: 300000 // 5 minutes
    });
    
    console.log(chalk.green('Python requirements installed successfully'));
    return true;
  } catch (error) {
    console.error(chalk.red(`Failed to install Python requirements: ${(error as Error).message}`));
    return false;
  }
}

/**
 * Comprehensive check for RAG system requirements
 * @returns {Promise<RAGRequirements>}
 */
export async function checkRAGRequirements(): Promise<RAGRequirements> {
  const issues: string[] = [];
  
  // Check Python
  const pythonInfo = await checkPython();
  if (!pythonInfo.available) {
    issues.push('Python not found. Please install Python 3.7+ to use RAG features.');
    return { ready: false, issues, pythonInfo };
  }
  
  // Check Python packages
  const packages = await checkPythonPackages(pythonInfo.command);
  const missingPackages = Object.entries(packages)
    .filter(([, available]) => !available)
    .map(([pkg]) => pkg);
  
  if (missingPackages.length > 0) {
    issues.push(`Missing Python packages: ${missingPackages.join(', ')}`);
    issues.push('Run: npm run codebert-setup');
  }
  
  return {
    ready: issues.length === 0,
    issues,
    pythonInfo,
    packages
  };
}

/**
 * Display RAG system status
 * @param {RAGRequirements} requirements - Requirements check result
 */
export function displayRAGStatus(requirements: RAGRequirements): void {
  if (requirements.ready) {
    console.log(chalk.green('✓ RAG system requirements satisfied'));
    console.log(chalk.gray(`  Python: ${requirements.pythonInfo.version}`));
    console.log(chalk.gray(`  Path: ${requirements.pythonInfo.path}`));
  } else {
    console.log(chalk.gray('RAG system requirements not met:'));
    requirements.issues.forEach(issue => {
      console.log(chalk.gray(`  - ${issue}`));
    });
  }
}
