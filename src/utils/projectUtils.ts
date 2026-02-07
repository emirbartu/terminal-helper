/**
 * Project Root Detection Utilities
 * 
 * Provides utilities for detecting project roots using package managers,
 * project structure patterns, and other indicators when git is not available.
 */

import fs from 'fs';
import path from 'path';
import { findGitRepoRoot } from './gitUtils.js';

// Package manager and project indicator files
const PROJECT_ROOT_INDICATORS = [
  'package.json',        // Node.js/npm
  'pyproject.toml',      // Python (modern)
  'setup.py',            // Python (traditional)
  'requirements.txt',    // Python
  'Cargo.toml',          // Rust
  'go.mod',              // Go
  'pom.xml',             // Java Maven
  'build.gradle',        // Java Gradle
  'composer.json',       // PHP
  'Gemfile',             // Ruby
  'pubspec.yaml',        // Dart/Flutter
  'mix.exs',             // Elixir
  'dune-project',        // OCaml
  'stack.yaml',          // Haskell
  'CMakeLists.txt',      // C/C++
  'Makefile',            // C/C++/Make projects
  '.sln',                // Visual Studio
  '.csproj',             // .NET
  'project.clj',         // Clojure
  'deps.edn',            // Clojure
];

// Common project structure patterns
const PROJECT_STRUCTURE_PATTERNS = [
  // Source code directories
  ['src', 'lib'],
  ['src', 'test'],
  ['src', 'tests'],
  ['app', 'config'],
  ['lib', 'bin'],
  
  // Documentation + code
  ['README.md', 'src'],
  ['docs', 'src'],
  ['README.rst', 'src'],
  
  // Configuration files
  ['.env.example', 'src'],
  ['config', 'src'],
  
  // Build/deployment files
  ['Dockerfile', 'src'],
  ['docker-compose.yml', 'src'],
  ['.github', 'src'],
  ['.gitignore', 'src'],
];

/**
 * Project detection result
 */
export interface ProjectDetectionResult {
  root: string;
  indicator?: string;
  pattern?: string;
  type: string;
}

/**
 * Project information
 */
export interface ProjectInfo {
  name: string;
  root: string;
  type: string;
  detectionMethod: string;
  mainFile: string | null;
}

/**
 * Project root with confidence level
 */
export interface ProjectRootWithConfidence {
  root: string;
  type: string;
  confidence: string;
  indicator: string;
}

/**
 * Find project root using package manager indicators
 * @param {string} startPath - Starting directory path
 * @returns {Promise<ProjectDetectionResult | null>} Project root or null if not found
 */
export async function findPackageManagerRoot(startPath: string): Promise<ProjectDetectionResult | null> {
  let currentPath = path.resolve(startPath);
  
  while (currentPath !== path.dirname(currentPath)) { // Not system root
    // Check for any project root indicator files
    for (const indicator of PROJECT_ROOT_INDICATORS) {
      const indicatorPath = path.join(currentPath, indicator);
      if (fs.existsSync(indicatorPath)) {
        return {
          root: currentPath,
          indicator,
          type: 'package'
        };
      }
    }
    
    currentPath = path.dirname(currentPath);
  }
  
  return null; // No package manager root found
}

/**
 * Find project root using common project structure patterns
 * @param {string} startPath - Starting directory path
 * @returns {Promise<ProjectDetectionResult | null>} Project root or null if not found
 */
export async function findProjectStructureRoot(startPath: string): Promise<ProjectDetectionResult | null> {
  let currentPath = path.resolve(startPath);
  
  while (currentPath !== path.dirname(currentPath)) {
    try {
      // Check if this directory has a recognizable project structure
      const dirContents = fs.readdirSync(currentPath);
      
      for (const pattern of PROJECT_STRUCTURE_PATTERNS) {
        const hasAll = pattern.every(item => dirContents.includes(item));
        if (hasAll) {
          return {
            root: currentPath,
            pattern: pattern.join(', '),
            type: 'structure'
          };
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
    
    currentPath = path.dirname(currentPath);
  }
  
  return null;
}

/**
 * Simple project root detection - git repo or current directory
 * @param {string} startPath - Starting directory path
 * @returns {Promise<ProjectRootWithConfidence>} Project root information with confidence level
 */
export async function findRepoOrProjectRoot(startPath: string): Promise<ProjectRootWithConfidence> {
  // Strategy 1: Try git first (highest confidence)
  const gitRoot = await findGitRepoRoot(startPath);
  if (gitRoot) {
    return { 
      root: gitRoot, 
      type: 'git', 
      confidence: 'high',
      indicator: '.git repository'
    };
  }
  
  // Strategy 2: Use current directory (no scanning, no traversal)
  return { 
    root: path.resolve(startPath), 
    type: 'current', 
    confidence: 'medium',
    indicator: 'current directory'
  };
}

/**
 * Get project information from detected root
 * @param {string} projectRoot - Project root path
 * @param {string} detectionType - How the root was detected
 * @returns {Promise<ProjectInfo>} Project information
 */
export async function getProjectInfo(projectRoot: string, detectionType: string): Promise<ProjectInfo> {
  const projectName = path.basename(projectRoot);
  
  // Try to determine project type based on files present
  let projectType = 'unknown';
  let mainFile: string | null = null;
  
  try {
    const files = fs.readdirSync(projectRoot);
    
    if (files.includes('package.json')) {
      projectType = 'node.js';
      const packagePath = path.join(projectRoot, 'package.json');
      try {
        const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf-8')) as { main?: string; name?: string };
        mainFile = packageData.main || packageData.name || null;
      } catch (error) {
        // Ignore package.json parsing errors
      }
    } else if (files.includes('setup.py') || files.includes('pyproject.toml')) {
      projectType = 'python';
    } else if (files.includes('Cargo.toml')) {
      projectType = 'rust';
    } else if (files.includes('go.mod')) {
      projectType = 'go';
    } else if (files.includes('pom.xml')) {
      projectType = 'java-maven';
    } else if (files.includes('build.gradle')) {
      projectType = 'java-gradle';
    }
  } catch (error) {
    // Keep default values if we can't read directory
  }
  
  return {
    name: projectName,
    root: projectRoot,
    type: projectType,
    detectionMethod: detectionType,
    mainFile
  };
}
