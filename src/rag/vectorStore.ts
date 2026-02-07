/**
 * Vector Storage Module using FAISS
 * 
 * Provides utilities for storing and retrieving code embeddings using FAISS.
 * This module is responsible for the vector search component (70%) of the
 * hybrid retrieval system.
 */

import fs from 'fs';
import path from 'path';
import { getEmbeddingDimension } from './embeddings.js';

// FAISS module will be loaded dynamically
let faiss: unknown = null;

// Configuration
const EMBEDDING_DIMENSION = getEmbeddingDimension(); // 768 for CodeBERT

/** FAISS index wrapper */
export interface VectorIndex {
  /** FAISS index instance */
  index: FAISSIndex;
  /** Embedding dimension */
  dimension: number;
  /** Number of vectors in the index */
  size: number;
  /** Map to store metadata for each vector */
  idToMetadata: Map<number, VectorMetadata>;
}

/** FAISS index interface */
interface FAISSIndex {
  /** Add vectors to the index */
  add: (vectors: number[] | number[][]) => void;
  /** Search the index */
  search: (query: number[], k: number) => FAISSSearchResult | [number[], number[]];
  /** Write index to disk */
  writeIndex?: (path: string) => void;
  /** Write index to disk (alternative) */
  write?: (path: string) => void;
}

/** FAISS search result */
interface FAISSSearchResult {
  /** Distances */
  distances: number[];
  /** Labels/indices */
  labels: number[];
}

/** FAISS module interface */
interface FAISSModule {
  /** IndexFlatL2 class */
  IndexFlatL2?: new (dimension: number) => FAISSIndex;
  /** Default export */
  default?: {
    IndexFlatL2?: new (dimension: number) => FAISSIndex;
    writeIndex?: (index: FAISSIndex, path: string) => void;
    readIndex?: (path: string) => FAISSIndex;
  };
  /** Write index function */
  writeIndex?: (index: FAISSIndex, path: string) => void;
  /** Read index function */
  readIndex?: (path: string) => FAISSIndex;
}

/** Vector metadata */
export interface VectorMetadata {
  /** Path to the file */
  filePath?: string;
  /** Start line number */
  startLine?: number;
  /** End line number */
  endLine?: number;
  /** Chunk content */
  content?: string;
  /** Display content */
  displayContent?: string;
  /** File name */
  fileName?: string;
  /** File extension */
  fileExt?: string;
  /** Directory path */
  directory?: string;
  /** Whether the chunk has imports */
  hasImports?: boolean;
}

/** Search result from vector index */
export interface VectorSearchResult {
  /** Result ID */
  id: number;
  /** Similarity score */
  score: number;
  /** L2 distance */
  distance: number;
  /** Result metadata */
  metadata: VectorMetadata;
}

/** Vector index statistics */
export interface VectorStats {
  /** Number of vectors in the index */
  vectorCount: number;
  /** Embedding dimension */
  dimension: number;
  /** Number of unique files */
  fileCount: number;
  /** Estimated memory usage in bytes */
  memoryUsage: number;
}

/** Index options */
export interface IndexOptions {
  /** Embedding dimension */
  dimension?: number;
}

/**
 * Initialize FAISS if not already loaded
 * @returns Promise that resolves when FAISS is loaded
 */
async function ensureFaissLoaded(): Promise<void> {
  if (!faiss) {
    try {
      // Import the entire faiss-node module
      faiss = await import('faiss-node') as FAISSModule;
    } catch (error) {
      throw new Error(`Failed to load FAISS. Please ensure faiss-node is installed: npm install faiss-node`);
    }
  }
}

/**
 * Create a new FAISS index for code embeddings
 * @param options - Index options
 * @returns The created index
 */
export async function createFAISSIndex(options: IndexOptions = {}): Promise<VectorIndex> {
  await ensureFaissLoaded();
  
  const {
    dimension = EMBEDDING_DIMENSION
  } = options;
  
  let index: FAISSIndex | null = null;
  let lastError: Error | null = null;
  
  const faissModule = faiss as FAISSModule;
  
  // Try multiple approaches to create the index
  const approaches = [
    () => faissModule.IndexFlatL2 ? new faissModule.IndexFlatL2(dimension) : null,
    () => faissModule.default ? new (faissModule.default.IndexFlatL2!)(dimension) : null,
    () => faissModule.default?.IndexFlatL2 ? new faissModule.default.IndexFlatL2(dimension) : null,
    () => faissModule.IndexFlatL2 ? (faissModule.IndexFlatL2 as unknown as (d: number) => FAISSIndex)(dimension) : null,
    () => faissModule.default && faissModule.default.IndexFlatL2 ? new faissModule.default.IndexFlatL2(dimension) : null
  ];
  
  for (let i = 0; i < approaches.length; i++) {
    try {
      const result = approaches[i]();
      if (result) {
        index = result;
        break;
      }
    } catch (error) {
      lastError = error as Error;
    }
  }
  
  if (!index) {
    throw new Error(`Failed to create FAISS index. Please check faiss-node installation. Last error: ${lastError?.message || 'Unknown error'}`);
  }
  
  return {
    index,
    dimension,
    size: 0,
    idToMetadata: new Map() // Map to store metadata for each vector
  };
}

/** Chunk with embedding for indexing */
interface ChunkWithEmbedding {
  /** Path to the file */
  filePath: string;
  /** Start line number */
  startLine: number;
  /** End line number */
  endLine: number;
  /** Chunk content */
  content: string;
  /** Embedding vector */
  embedding: Float32Array | null;
  /** Display content */
  displayContent?: string;
  /** Chunk metadata */
  metadata?: {
    hasImports?: boolean;
  };
}

/**
 * Add embeddings to the FAISS index
 * @param indexWrapper - The index wrapper object
 * @param chunks - Chunks with embeddings to add
 * @returns Updated index wrapper
 */
export async function addToIndex(indexWrapper: VectorIndex, chunks: ChunkWithEmbedding[]): Promise<VectorIndex> {
  const { index, idToMetadata } = indexWrapper;
  
  try {
    // Validate input first
    if (!Array.isArray(chunks)) {
      console.error('Chunks must be an array, got:', typeof chunks);
      throw new Error('Invalid the first argument type, must be an Array');
    }
    
    // Extract and validate embeddings from chunks
    const embeddings: Float32Array[] = [];
    const validChunks: ChunkWithEmbedding[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = chunk.embedding;
      
      // Skip chunks without embeddings
      if (!embedding) {
        console.warn(`Chunk ${i} has no embedding, skipping`);
        continue;
      }
      
      let processedEmbedding: Float32Array;
      
      // Handle different input types and ensure Float32Array
      if (embedding instanceof Float32Array) {
        // Already correct type - validate dimension
        if (embedding.length !== 768) { // CodeBERT dimension
          console.warn(`Embedding ${i} has wrong dimension: ${embedding.length}, expected 768`);
          // Create correctly sized embedding
          processedEmbedding = new Float32Array(768);
          const copyLength = Math.min(embedding.length, 768);
          processedEmbedding.set(embedding.subarray(0, copyLength));
          if (copyLength < 768) {
            processedEmbedding.fill(0, copyLength); // Fill remaining with zeros
          }
        } else {
          processedEmbedding = embedding;
        }
      } else if (Array.isArray(embedding)) {
        // Convert array to Float32Array
        const numericArray: number[] = [];
        const arr = embedding as unknown[];
        for (let j = 0; j < arr.length; j++) {
          const item = arr[j];
          if (typeof item === 'number' && !isNaN(item)) {
            numericArray.push(item);
          }
        }
        if (numericArray.length === 0) {
          console.warn(`Chunk ${i} has no valid numeric values in embedding, skipping`);
          continue;
        }
        
        // Ensure correct dimension
        if (numericArray.length !== 768) {
          console.warn(`Array embedding ${i} has wrong dimension: ${numericArray.length}, expected 768`);
          if (numericArray.length < 768) {
            numericArray.push(...new Array(768 - numericArray.length).fill(0));
          } else {
            numericArray.splice(768);
          }
        }
        
        processedEmbedding = new Float32Array(numericArray);
      } else if (embedding && typeof embedding === 'object' && (embedding as { values?: Float32Array }).values instanceof Float32Array) {
        // Handle transformers.js format
        processedEmbedding = (embedding as { values: Float32Array }).values;
      } else {
        console.error(`Chunk ${i} has invalid embedding format:`, typeof embedding);
        console.error('Embedding value:', embedding);
        continue; // Skip this chunk
      }
      
      // Final validation
      if (!(processedEmbedding instanceof Float32Array) || processedEmbedding.length !== 768) {
        console.error(`Failed to process embedding ${i} correctly`);
        continue;
      }
      
      // Check for NaN or infinite values
      const hasInvalidValues = Array.from(processedEmbedding).some(x => !isFinite(x));
      if (hasInvalidValues) {
        console.warn(`Embedding ${i} contains NaN or infinite values, replacing with zeros`);
        processedEmbedding = new Float32Array(768).fill(0.1);
      }
      
      embeddings.push(processedEmbedding);
      validChunks.push(chunk);
    }
    
    if (embeddings.length === 0) {
      console.warn('No valid embeddings to add to index');
      return indexWrapper;
    }
    
    // Get the current size of the index
    const startId = indexWrapper.size;
    
    // Add embeddings to the index one by one with better error handling
    for (let i = 0; i < embeddings.length; i++) {
      try {
        // Convert Float32Array to regular array for FAISS compatibility
        const embeddingArray = Array.from(embeddings[i]);
        index.add(embeddingArray);
      } catch (addError) {
        console.error(`Error adding embedding ${i} to FAISS index:`, (addError as Error).message);
        console.error('Embedding details:', {
          type: typeof embeddings[i],
          isFloat32Array: embeddings[i] instanceof Float32Array,
          length: embeddings[i].length,
          firstValues: Array.from(embeddings[i].slice(0, 3)),
          convertedType: typeof Array.from(embeddings[i]),
          convertedLength: Array.from(embeddings[i]).length
        });
        throw new Error(`Failed to add embedding ${i} to FAISS index: ${(addError as Error).message}`);
      }
    }
    
    // Update the size
    indexWrapper.size += embeddings.length;
    
    // Store metadata for each embedding
    validChunks.forEach((chunk, i) => {
      const id = startId + i;
      
      // Store metadata without the embedding to save memory
      const { embedding: _, ...metadata } = chunk;
      idToMetadata.set(id, metadata);
    });
    
    return indexWrapper;
  } catch (error) {
    console.error('Error in addToIndex:', error);
    throw new Error(`Failed to add embeddings to index: ${(error as Error).message}`);
  }
}

/**
 * Search the FAISS index for similar embeddings
 * @param indexWrapper - The index wrapper object
 * @param queryEmbedding - The query embedding
 * @param k - Number of results to return
 * @returns Search results with metadata
 */
export async function searchIndex(
  indexWrapper: VectorIndex, 
  queryEmbedding: Float32Array, 
  k: number = 5
): Promise<VectorSearchResult[]> {
  const { index, idToMetadata } = indexWrapper;
  
  try {
    // Safety check: ensure k doesn't exceed the total number of vectors
    const totalVectors = indexWrapper.size || 0;
    const safeK = Math.min(k, totalVectors);
    
    if (safeK === 0) {
      console.warn('Vector index is empty, returning empty results');
      return [];
    }
    
    // Convert query embedding to regular array for FAISS compatibility
    let queryArray: number[];
    if (queryEmbedding instanceof Float32Array) {
      queryArray = Array.from(queryEmbedding);
    } else if (Array.isArray(queryEmbedding)) {
      queryArray = queryEmbedding;
    } else {
      queryArray = Array.from(new Float32Array(queryEmbedding as ArrayBuffer));
    }
    
    // Search the index with safe k value
    const result = index.search(queryArray, safeK);
    
    // Extract distances and indices from result
    // The structure might vary depending on faiss-node version
    let distances: number[], labels: number[];
    
    if ((result as FAISSSearchResult).distances && (result as FAISSSearchResult).labels) {
      distances = (result as FAISSSearchResult).distances;
      labels = (result as FAISSSearchResult).labels;
    } else if (Array.isArray(result) && result.length === 2) {
      [distances, labels] = result as [number[], number[]];
    } else {
      // Fallback: assume result is in a different format
      const r = result as { distance?: number[]; scores?: number[]; indices?: number[]; ids?: number[] };
      distances = r.distance || r.scores || [];
      labels = r.indices || r.ids || [];
    }
    
    // Map results to metadata
    const searchResults: VectorSearchResult[] = [];
    const numResults = Math.min(labels.length, distances.length);
    
    for (let i = 0; i < numResults; i++) {
      const id = labels[i];
      
      // Skip invalid IDs (can happen if index is not fully populated)
      if (id === -1 || id === undefined || id === null) continue;
      
      const metadata = idToMetadata.get(id);
      
      // Skip if metadata not found
      if (!metadata) continue;
      
      // Convert distance to similarity score
      // For L2 distance, smaller is better, so we invert it
      const distance = distances[i];
      const score = Math.max(0, 1 - distance / 100); // Normalize distance to similarity
      
      searchResults.push({
        id,
        score,
        distance,
        metadata
      });
    }
    
    // Sort by score (highest first)
    searchResults.sort((a, b) => b.score - a.score);
    
    return searchResults;
  } catch (error) {
    throw new Error(`Failed to search index: ${(error as Error).message}`);
  }
}

/**
 * Save the FAISS index to disk
 * @param indexWrapper - The index wrapper object
 * @param directory - Directory to save the index
 * @param name - Name of the index
 * @returns Path to the saved index
 */
export async function saveIndex(indexWrapper: VectorIndex, directory: string, name: string = 'code_index'): Promise<string> {
  const { index, dimension, size, idToMetadata } = indexWrapper;
  
  try {
    // Create directory if it doesn't exist
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
    
    // Save the index
    const indexPath = path.join(directory, `${name}.faiss`);
    
    const faissModule = faiss as FAISSModule;
    
    // Try multiple approaches to save the index
    let saved = false;
    let lastError: Error | null = null;
    
    const saveApproaches = [
      () => index.writeIndex ? index.writeIndex(indexPath) : null,
      () => index.write ? index.write(indexPath) : null,
      () => faissModule.writeIndex ? faissModule.writeIndex(index, indexPath) : null,
      () => faissModule.default && faissModule.default.writeIndex ? faissModule.default.writeIndex(index, indexPath) : null
    ];
    
    for (let i = 0; i < saveApproaches.length; i++) {
      try {
        saveApproaches[i]();
        // Check if the file actually exists after the save attempt, regardless of return value
        // Many FAISS write operations return null/undefined even on success
        if (fs.existsSync(indexPath)) {
          saved = true;
          break;
        }
      } catch (error) {
        lastError = error as Error;
        // Continue to next approach if this one failed
      }
    }
    
    // Only warn if the file genuinely doesn't exist after all attempts
    if (!saved && !fs.existsSync(indexPath)) {
      console.warn(`Could not save index to ${indexPath}. Index will only exist in memory.`);
      // Don't throw an error, just warn - the index can still be used in memory
    }
    
    // Save metadata
    const metadataPath = path.join(directory, `${name}.metadata.json`);
    const metadataObj = {
      dimension,
      size,
      metadata: Array.from(idToMetadata.entries())
    };
    
    fs.writeFileSync(metadataPath, JSON.stringify(metadataObj, null, 2));
    
    return indexPath;
  } catch (error) {
    throw new Error(`Failed to save index: ${(error as Error).message}`);
  }
}

/**
 * Load a FAISS index from disk
 * @param directory - Directory where the index is saved
 * @param name - Name of the index
 * @returns Loaded index wrapper
 */
export async function loadIndex(directory: string, name: string = 'code_index'): Promise<VectorIndex> {
  await ensureFaissLoaded();
  
  const faissModule = faiss as FAISSModule;
  
  try {
    // Check if index exists
    const indexPath = path.join(directory, `${name}.faiss`);
    const metadataPath = path.join(directory, `${name}.metadata.json`);
    
    if (!fs.existsSync(indexPath) || !fs.existsSync(metadataPath)) {
      throw new Error(`Index or metadata file not found at ${directory}`);
    }
    
    // Load metadata
    const metadataStr = fs.readFileSync(metadataPath, 'utf-8');
    const metadataObj = JSON.parse(metadataStr) as {
      dimension: number;
      size: number;
      metadata: Array<[number, VectorMetadata]>;
    };
    
    // Try multiple approaches to load the index
    let index: FAISSIndex | null = null;
    let lastError: Error | null = null;
    
    const loadApproaches = [
      () => faissModule.readIndex ? faissModule.readIndex(indexPath) : null,
      () => faissModule.IndexFlatL2 && (faissModule.IndexFlatL2 as unknown as { readIndex?: (p: string) => FAISSIndex }).readIndex ? 
        (faissModule.IndexFlatL2 as unknown as { readIndex: (p: string) => FAISSIndex }).readIndex(indexPath) : null,
      () => faissModule.IndexFlatL2 && (faissModule.IndexFlatL2 as unknown as { read?: (p: string) => FAISSIndex }).read ? 
        (faissModule.IndexFlatL2 as unknown as { read: (p: string) => FAISSIndex }).read(indexPath) : null,
      () => faissModule.default && faissModule.default.readIndex ? faissModule.default.readIndex(indexPath) : null,
      () => faissModule.default && faissModule.default.IndexFlatL2 ? 
        (faissModule.default.IndexFlatL2 as unknown as { readIndex?: (p: string) => FAISSIndex }).readIndex?.(indexPath) : null,
      () => faissModule.default && faissModule.default.IndexFlatL2 ? 
        (faissModule.default.IndexFlatL2 as unknown as { read?: (p: string) => FAISSIndex }).read?.(indexPath) : null,
    ];
    
    for (let i = 0; i < loadApproaches.length; i++) {
      try {
        const result = loadApproaches[i]();
        if (result) {
          index = result;
          break;
        }
      } catch (error) {
        lastError = error as Error;
      }
    }
    
    if (!index) {
      // If all loading methods fail, create a new index and warn the user
      console.warn(`Could not load existing index from ${indexPath}. Creating new index instead.`);
      
      // Create a new index with the same dimension
      const newIndexWrapper = await createFAISSIndex({ dimension: metadataObj.dimension });
      
      // Return the new index but keep the metadata for reference
      return {
        ...newIndexWrapper,
        size: 0, // Reset size since we're starting fresh
        idToMetadata: new Map() // Reset metadata
      };
    }
    
    // Reconstruct metadata map
    const idToMetadata = new Map(metadataObj.metadata);
    
    return {
      index,
      dimension: metadataObj.dimension,
      size: metadataObj.size,
      idToMetadata
    };
  } catch (error) {
    throw new Error(`Failed to load index: ${(error as Error).message}`);
  }
}

/**
 * Check if an index exists
 * @param directory - Directory to check
 * @param name - Name of the index
 * @returns Whether the index exists
 */
export function indexExists(directory: string, name: string = 'code_index'): boolean {
  const indexPath = path.join(directory, `${name}.faiss`);
  const metadataPath = path.join(directory, `${name}.metadata.json`);
  
  return fs.existsSync(indexPath) && fs.existsSync(metadataPath);
}

/**
 * Get index statistics
 * @param indexWrapper - The index wrapper object
 * @returns Index statistics
 */
export function getIndexStats(indexWrapper: VectorIndex): VectorStats {
  const { dimension, size, idToMetadata } = indexWrapper;
  
  // Count files
  const filePaths = new Set<string>();
  for (const metadata of idToMetadata.values()) {
    if (metadata.filePath) {
      filePaths.add(metadata.filePath);
    }
  }
  
  return {
    vectorCount: size,
    dimension,
    fileCount: filePaths.size,
    memoryUsage: estimateMemoryUsage(indexWrapper)
  };
}

/**
 * Estimate memory usage of the index
 * @param indexWrapper - The index wrapper object
 * @returns Estimated memory usage in bytes
 */
function estimateMemoryUsage(indexWrapper: VectorIndex): number {
  const { dimension, size } = indexWrapper;
  
  // Estimate FAISS index memory
  // IndexFlatL2 stores vectors as float32 (4 bytes per dimension)
  const vectorMemory = size * dimension * 4;
  
  // Estimate metadata memory (rough approximation)
  const metadataMemory = size * 200; // Assume average 200 bytes per metadata entry
  
  return vectorMemory + metadataMemory;
}

/**
 * Create a new index or load existing
 * @param directory - Directory for the index
 * @param name - Name of the index
 * @param options - Index options
 * @returns Index wrapper
 */
export async function getOrCreateIndex(directory: string, name: string = 'code_index', options: IndexOptions = {}): Promise<VectorIndex> {
  try {
    if (indexExists(directory, name)) {
      return await loadIndex(directory, name);
    } else {
      return await createFAISSIndex(options);
    }
  } catch (error) {
    throw new Error(`Failed to get or create index: ${(error as Error).message}`);
  }
}
