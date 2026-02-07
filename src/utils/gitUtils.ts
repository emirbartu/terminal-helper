/**
 * Git Repository Detection Utilities
 * 
 * Provides utilities for detecting git repositories, finding repository roots,
 * and handling edge cases like git worktrees and submodules.
 */

import fs from 'fs';
import path from 'path';

/**
 * Git repository information
 */
export interface GitRepoInfo {
  name: string;
  root: string;
  branch: string;
}

/**
 * Check if a directory is a bare git repository
 * @param {string} directory - Directory to check
 * @returns {boolean} Whether it's a bare git repository
 */
function isBareGitRepo(directory: string): boolean {
  const gitFiles = ['HEAD', 'refs', 'objects', 'config'];
  
  return gitFiles.every(file => {
    const filePath = path.join(directory, file);
    return fs.existsSync(filePath);
  });
}

/**
 * Handle git worktree detection (.git file pointing to real git dir)
 * @param {string} gitFilePath - Path to the .git file
 * @returns {boolean} Whether it's a valid git worktree
 */
function handleGitWorktree(gitFilePath: string): boolean {
  try {
    const content = fs.readFileSync(gitFilePath, 'utf-8').trim();
    
    if (content.startsWith('gitdir:')) {
      const gitDirPath = content.substring(7).trim(); // Remove "gitdir: "
      
      // Check if the referenced git directory exists
      return fs.existsSync(gitDirPath);
    }
  } catch (error) {
    return false;
  }
  
  return false;
}

/**
 * Check if a directory is a git repository
 * @param {string} directory - Directory to check
 * @returns {boolean} Whether it's a git repository
 */
export function isGitRepository(directory: string): boolean {
  const gitPath = path.join(directory, '.git');
  
  if (!fs.existsSync(gitPath)) {
    // Check if it's a bare repository
    return isBareGitRepo(directory);
  }
  
  const gitStat = fs.statSync(gitPath);
  
  if (gitStat.isDirectory()) {
    // Regular git repository
    return true;
  }
  
  if (gitStat.isFile()) {
    // Git worktree or submodule
    return handleGitWorktree(gitPath);
  }
  
  return false;
}

/**
 * Find git repository root by walking up directory tree
 * @param {string} startPath - Starting directory path
 * @returns {Promise<string | null>} Git repository root or null if not found
 */
export async function findGitRepoRoot(startPath: string): Promise<string | null> {
  let currentPath = path.resolve(startPath);
  
  // Walk up the directory tree until we find .git or hit system root
  while (currentPath !== path.dirname(currentPath)) { // Not system root (/ or C:\)
    if (isGitRepository(currentPath)) {
      return currentPath;
    }
    
    currentPath = path.dirname(currentPath);
  }
  
  return null; // No git repository found
}

/**
 * Get git repository information
 * @param {string} gitRepoRoot - Git repository root path
 * @returns {Promise<GitRepoInfo>} Repository information
 */
export async function getGitRepoInfo(gitRepoRoot: string): Promise<GitRepoInfo> {
  try {
    const repoName = path.basename(gitRepoRoot);
    
    // Try to read current branch from HEAD
    let branch = 'unknown';
    try {
      const headPath = path.join(gitRepoRoot, '.git', 'HEAD');
      if (fs.existsSync(headPath)) {
        const headContent = fs.readFileSync(headPath, 'utf-8').trim();
        if (headContent.startsWith('ref: refs/heads/')) {
          branch = headContent.substring('ref: refs/heads/'.length);
        }
      }
    } catch (error) {
      // Keep default branch name
    }
    
    return {
      name: repoName,
      root: gitRepoRoot,
      branch
    };
  } catch (error) {
    throw new Error(`Failed to get git repository info: ${(error as Error).message}`);
  }
}

/**
 * Validate that we're in a git repository
 * @param {string} path - Path to check
 * @returns {Promise<boolean>} Whether path is in git repo
 */
export async function isInGitRepository(path: string): Promise<boolean> {
  const gitRoot = await findGitRepoRoot(path);
  return gitRoot !== null;
}
