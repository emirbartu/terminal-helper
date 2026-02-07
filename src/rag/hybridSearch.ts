/**
 * Hybrid Search Module
 * 
 * Combines BM25 lexical search (30%) with FAISS vector search (70%)
 * for optimal retrieval of relevant code files.
 */

import { searchIndex, VectorIndex, VectorSearchResult, VectorMetadata } from './vectorStore.js';
import { preprocessCodeForBM25, BM25Index, BM25SearchResult, BM25DocumentMetadata } from './bm25.js';
import { generateEmbedding } from './embeddings.js';

// Configuration
const DEFAULT_BM25_WEIGHT = 0.3;
const DEFAULT_VECTOR_WEIGHT = 0.7;
const DEFAULT_TOP_K = 5;

/** Search result from hybrid search */
export interface SearchResult {
  /** Result ID */
  id: string;
  /** BM25 score */
  bm25Score: number;
  /** Vector similarity score */
  vectorScore: number;
  /** Combined score */
  combinedScore: number;
  /** Result metadata */
  metadata: SearchResultMetadata;
  /** Root cause score (calculated separately) */
  rootCauseScore?: number;
}

/** Search result metadata */
export interface SearchResultMetadata {
  /** Path to the file */
  filePath: string;
  /** File name */
  fileName: string;
  /** Start line number */
  startLine: number;
  /** End line number */
  endLine: number;
  /** File extension */
  fileExt: string;
  /** Whether the chunk has imports */
  hasImports: boolean;
}

/** Hybrid search options */
export interface HybridSearchOptions {
  /** Weight for BM25 scores (0-1) */
  bm25Weight?: number;
  /** Weight for vector scores (0-1) */
  vectorWeight?: number;
  /** Number of results to return */
  k?: number;
  /** Expanded k for initial retrieval */
  expandedK?: number;
}

/** Grouped search result by file */
export interface GroupedSearchResult {
  /** Path to the file */
  filePath: string;
  /** File name */
  fileName: string;
  /** Chunks from this file */
  chunks: SearchResult[];
  /** Maximum score */
  maxScore: number;
  /** Total score */
  totalScore: number;
}

/**
 * Perform hybrid search combining BM25 and vector search
 * @param query - The search query
 * @param vectorIndex - FAISS index wrapper
 * @param bm25Index - BM25 index
 * @param options - Search options
 * @returns Search results
 */
export async function hybridSearch(
  query: string, 
  vectorIndex: VectorIndex, 
  bm25Index: BM25Index, 
  options: HybridSearchOptions = {}
): Promise<SearchResult[]> {
  const {
    bm25Weight = DEFAULT_BM25_WEIGHT,
    vectorWeight = DEFAULT_VECTOR_WEIGHT,
    k = DEFAULT_TOP_K,
    expandedK = k * 3 // Retrieve more results initially for re-ranking
  } = options;
  
  try {
    // Check available data and adjust expandedK accordingly
    const vectorCount = vectorIndex.size || 0;
    const bm25Count = bm25Index.documentCount || 0;
    const maxAvailable = Math.max(vectorCount, bm25Count);
    
    // Ensure expandedK doesn't exceed available data
    const safeExpandedK = Math.min(expandedK, maxAvailable);
    const safeK = Math.min(k, maxAvailable);
    
    // Normalize weights
    const totalWeight = bm25Weight + vectorWeight;
    const normalizedBM25Weight = bm25Weight / totalWeight;
    const normalizedVectorWeight = vectorWeight / totalWeight;
    
    // Perform BM25 search with safe limit
    const bm25Results = bm25Index.search(query, safeExpandedK);
    
    // Perform vector search with safe limit
    const queryEmbedding = await generateEmbedding(query);
    const vectorResults = await searchIndex(vectorIndex, queryEmbedding, safeExpandedK);
    
    // Merge and re-rank results
    const mergedResults = mergeResults(
      bm25Results, 
      vectorResults, 
      normalizedBM25Weight, 
      normalizedVectorWeight
    );
    
    // Return top k results (using safe limit)
    return mergedResults.slice(0, safeK);
  } catch (error) {
    console.error('Error performing hybrid search:', error);
    throw new Error(`Failed to perform hybrid search: ${(error as Error).message}`);
  }
}

/**
 * Convert BM25 metadata to search result metadata
 */
function toSearchResultMetadata(metadata: BM25DocumentMetadata): SearchResultMetadata {
  return {
    filePath: metadata.filePath,
    fileName: metadata.fileName,
    startLine: metadata.startLine,
    endLine: metadata.endLine,
    fileExt: metadata.fileExt,
    hasImports: metadata.hasImports
  };
}

/**
 * Convert vector metadata to search result metadata
 */
function vectorToSearchResultMetadata(metadata: VectorMetadata): SearchResultMetadata {
  return {
    filePath: metadata.filePath || '',
    fileName: metadata.fileName || '',
    startLine: metadata.startLine || 0,
    endLine: metadata.endLine || 0,
    fileExt: metadata.fileExt || '',
    hasImports: metadata.hasImports || false
  };
}

/**
 * Merge and re-rank results from BM25 and vector search
 * @param bm25Results - Results from BM25 search
 * @param vectorResults - Results from vector search
 * @param bm25Weight - Weight for BM25 results (normalized)
 * @param vectorWeight - Weight for vector results (normalized)
 * @returns Merged and re-ranked results
 */
export function mergeResults(
  bm25Results: BM25SearchResult[], 
  vectorResults: VectorSearchResult[], 
  bm25Weight: number, 
  vectorWeight: number
): SearchResult[] {
  // Create a map to store combined scores
  const combinedScores = new Map<string, SearchResult>();
  
  // Process BM25 results
  for (const result of bm25Results) {
    const { id, score, metadata } = result;
    
    if (!combinedScores.has(id)) {
      combinedScores.set(id, {
        id,
        metadata: toSearchResultMetadata(metadata),
        bm25Score: 0,
        vectorScore: 0,
        combinedScore: 0
      });
    }
    
    const entry = combinedScores.get(id)!;
    entry.bm25Score = score;
    entry.metadata = toSearchResultMetadata(metadata);
  }
  
  // Process vector results
  for (const result of vectorResults) {
    const { id, score, metadata } = result;
    const idStr = String(id);
    
    if (!combinedScores.has(idStr)) {
      combinedScores.set(idStr, {
        id: idStr,
        metadata: vectorToSearchResultMetadata(metadata),
        bm25Score: 0,
        vectorScore: 0,
        combinedScore: 0
      });
    }
    
    const entry = combinedScores.get(idStr)!;
    entry.vectorScore = score;
    entry.metadata = vectorToSearchResultMetadata(metadata);
  }
  
  // Calculate combined scores
  for (const entry of combinedScores.values()) {
    entry.combinedScore = (entry.bm25Score * bm25Weight) + (entry.vectorScore * vectorWeight);
  }
  
  // Sort by combined score
  return Array.from(combinedScores.values())
    .sort((a, b) => b.combinedScore - a.combinedScore);
}

/**
 * Prepare a query for hybrid search
 * @param rawQuery - The raw query text
 * @returns Processed query
 */
export function prepareQueryForSearch(rawQuery: string): string {
  // Extract key terms from error messages
  const errorPatterns = [
    /error:?\s+([^:]+)/i,
    /exception:?\s+([^:]+)/i,
    /failed:?\s+([^:]+)/i,
    /cannot\s+([^:]+)/i,
    /undefined\s+([^:]+)/i,
    /null\s+([^:]+)/i
  ];
  
  let enhancedQuery = rawQuery;
  
  // Extract error messages
  for (const pattern of errorPatterns) {
    const match = rawQuery.match(pattern);
    if (match && match[1]) {
      enhancedQuery += ' ' + match[1];
    }
  }
  
  // Extract file paths and function names
  const codePatterns = [
    /at\s+([a-zA-Z0-9_$.]+)\s/g,  // Function names in stack traces
    /([a-zA-Z0-9_-]+\.(?:js|py|java|rb|go|cpp|c|h|ts|tsx|jsx))/g, // File names
    /([a-zA-Z0-9_]+)\(.*\)/g,     // Function calls
    /import\s+([a-zA-Z0-9_{}]+)/g, // Import statements
    /require\(['"](.*)['"]\)/g     // Require statements
  ];
  
  for (const pattern of codePatterns) {
    const matches = [...rawQuery.matchAll(pattern)];
    for (const match of matches) {
      if (match[1]) {
        enhancedQuery += ' ' + match[1];
      }
    }
  }
  
  // Preprocess the enhanced query
  return preprocessCodeForBM25(enhancedQuery);
}

/**
 * Analyze search results to identify the root cause file
 * @param searchResults - Results from hybrid search
 * @param errorLog - The original error log
 * @returns The most likely root cause file
 */
export function identifyRootCauseFile(searchResults: SearchResult[], errorLog: string): SearchResult | null {
  if (!searchResults || searchResults.length === 0) {
    return null;
  }
  
  // Extract file paths from error log
  const filePathPattern = /([a-zA-Z0-9_-]+\.(?:js|py|java|rb|go|cpp|c|h|ts|tsx|jsx))/g;
  const mentionedFiles = new Set<string>();
  
  const matches = [...errorLog.matchAll(filePathPattern)];
  for (const match of matches) {
    if (match[1]) {
      mentionedFiles.add(match[1]);
    }
  }
  
  // Score each result based on various heuristics
  const scoredResults = searchResults.map(result => {
    const { metadata, combinedScore } = result;
    let rootCauseScore = combinedScore;
    
    // Boost score if file is mentioned in the error log
    if (metadata && metadata.fileName && mentionedFiles.has(metadata.fileName)) {
      rootCauseScore *= 1.5;
    }
    
    // Boost score for files with imports (they're more likely to be root causes)
    if (metadata && metadata.hasImports) {
      rootCauseScore *= 1.2;
    }
    
    return {
      ...result,
      rootCauseScore
    };
  });
  
  // Sort by root cause score
  scoredResults.sort((a, b) => (b.rootCauseScore || 0) - (a.rootCauseScore || 0));
  
  return scoredResults[0];
}

/**
 * Group search results by file
 * @param searchResults - Results from hybrid search
 * @returns Results grouped by file
 */
export function groupResultsByFile(searchResults: SearchResult[]): GroupedSearchResult[] {
  const groupedResults = new Map<string, GroupedSearchResult>();
  
  for (const result of searchResults) {
    const { metadata } = result;
    
    if (!metadata || !metadata.filePath) {
      continue;
    }
    
    const filePath = metadata.filePath;
    
    if (!groupedResults.has(filePath)) {
      groupedResults.set(filePath, {
        filePath,
        fileName: metadata.fileName,
        chunks: [],
        maxScore: 0,
        totalScore: 0
      });
    }
    
    const group = groupedResults.get(filePath)!;
    group.chunks.push(result);
    group.totalScore += result.combinedScore;
    group.maxScore = Math.max(group.maxScore, result.combinedScore);
  }
  
  // Convert to array and sort by max score
  return Array.from(groupedResults.values())
    .sort((a, b) => b.maxScore - a.maxScore);
}
