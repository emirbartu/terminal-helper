/**
 * BM25 Implementation Module
 * 
 * Provides a pure JavaScript implementation of the BM25 algorithm for lexical matching.
 * This module handles the lexical component (30%) of the hybrid retrieval system.
 */

import fs from 'fs';
import path from 'path';

// Configuration
const DEFAULT_K1 = 1.2; // Controls term frequency saturation
const DEFAULT_B = 0.75; // Controls field length normalization
const DEFAULT_EPSILON = 0.25; // Smoothing parameter

/** BM25 index options */
export interface BM25IndexOptions {
  /** BM25 k1 parameter */
  k1?: number;
  /** BM25 b parameter */
  b?: number;
  /** Smoothing parameter */
  epsilon?: number;
  /** Whether to lowercase tokens */
  lowercase?: boolean;
  /** Whether to remove stopwords */
  removeStopwords?: boolean;
  /** Whether to apply stemming */
  stemming?: boolean;
  /** Whether to split on code delimiters */
  splitOnCode?: boolean;
}

/** BM25 document structure */
export interface BM25Document {
  /** Document ID */
  id: string;
  /** Document content */
  content: string;
  /** Document metadata */
  metadata: BM25DocumentMetadata;
}

/** BM25 document metadata */
export interface BM25DocumentMetadata {
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

/** BM25 search result */
export interface BM25SearchResult {
  /** Document ID */
  id: string;
  /** BM25 score */
  score: number;
  /** Document metadata */
  metadata: BM25DocumentMetadata;
}

/** BM25 statistics */
export interface BM25Stats {
  /** Number of documents */
  documentCount: number;
  /** Size of vocabulary */
  vocabularySize: number;
  /** Average document length */
  averageDocumentLength: number;
  /** BM25 parameters */
  parameters: {
    k1: number;
    b: number;
    epsilon: number;
  };
}

/** BM25 posting list entry */
interface Posting {
  /** Document index */
  docIndex: number;
  /** Term frequency */
  frequency: number;
}

/** Tokenization options */
interface TokenizationOptions {
  lowercase: boolean;
  removeStopwords: boolean;
  stemming: boolean;
  splitOnCode: boolean;
}

/** BM25 Index class for efficient lexical search */
export class BM25Index {
  /** BM25 k1 parameter */
  k1: number;
  /** BM25 b parameter */
  b: number;
  /** Smoothing parameter */
  epsilon: number;
  /** Array of document objects with id and content */
  documents: Array<{ id: string; content: string }>;
  /** Map of document id to metadata */
  documentMetadata: Map<string, BM25DocumentMetadata>;
  /** Map of term to posting list */
  invertedIndex: Map<string, Posting[]>;
  /** Array of document lengths */
  documentLengths: number[];
  /** Average document length */
  averageDocumentLength: number;
  /** Number of documents in the index */
  documentCount: number;
  /** Set of all terms in the index */
  vocabulary: Set<string>;
  /** Tokenization options */
  tokenizationOptions: TokenizationOptions;

  constructor(options: BM25IndexOptions = {}) {
    // BM25 parameters
    this.k1 = options.k1 ?? DEFAULT_K1;
    this.b = options.b ?? DEFAULT_B;
    this.epsilon = options.epsilon ?? DEFAULT_EPSILON;
    
    // Index data structures
    this.documents = []; // Array of document objects with id and content
    this.documentMetadata = new Map(); // Map of document id to metadata
    this.invertedIndex = new Map(); // Map of term to posting list
    this.documentLengths = []; // Array of document lengths
    this.averageDocumentLength = 0; // Average document length
    this.documentCount = 0; // Number of documents in the index
    this.vocabulary = new Set(); // Set of all terms in the index
    
    // Tokenization options
    this.tokenizationOptions = {
      lowercase: options.lowercase !== false, // Default to true
      removeStopwords: options.removeStopwords !== false, // Default to true
      stemming: options.stemming !== false, // Default to true
      splitOnCode: options.splitOnCode !== false, // Default to true
    };
  }
  
  /**
   * Add a document to the index
   * @param document - Document object with id, content, and metadata
   */
  addDocument(document: BM25Document): void {
    const { id, content, metadata } = document;
    
    // Skip if document already exists
    if (this.documentMetadata.has(id)) {
      return;
    }
    
    // Tokenize the document
    const tokens = this._tokenize(content);
    
    // Add document to the index
    const docIndex = this.documentCount;
    this.documents.push({ id, content });
    this.documentMetadata.set(id, metadata || {} as BM25DocumentMetadata);
    
    // Calculate document length
    const docLength = tokens.length;
    this.documentLengths[docIndex] = docLength;
    
    // Update average document length
    const totalLength = this.averageDocumentLength * this.documentCount + docLength;
    this.documentCount++;
    this.averageDocumentLength = totalLength / this.documentCount;
    
    // Build inverted index
    const termFrequencies = new Map<string, number>();
    
    // Count term frequencies in this document
    for (const token of tokens) {
      this.vocabulary.add(token);
      
      if (!termFrequencies.has(token)) {
        termFrequencies.set(token, 0);
      }
      
      termFrequencies.set(token, termFrequencies.get(token)! + 1);
    }
    
    // Update inverted index with term frequencies
    for (const [term, frequency] of termFrequencies.entries()) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, []);
      }
      
      this.invertedIndex.get(term)!.push({
        docIndex,
        frequency
      });
    }
  }
  
  /**
   * Add multiple documents to the index
   * @param documents - Array of document objects
   */
  addDocuments(documents: BM25Document[]): void {
    for (const document of documents) {
      this.addDocument(document);
    }
  }
  
  /**
   * Search the index using BM25 scoring
   * @param query - The search query
   * @param k - Number of results to return
   * @returns Search results
   */
  search(query: string, k: number = 5): BM25SearchResult[] {
    // Tokenize the query
    const queryTokens = this._tokenize(query);
    
    // Calculate document scores
    const scores = new Map<string, number>();
    
    for (const term of queryTokens) {
      // Skip if term is not in the index
      if (!this.invertedIndex.has(term)) {
        continue;
      }
      
      // Get posting list for this term
      const postings = this.invertedIndex.get(term)!;
      
      // Calculate IDF (Inverse Document Frequency)
      const idf = this._calculateIDF(term);
      
      // Calculate score contribution for each document
      for (const posting of postings) {
        const { docIndex, frequency } = posting;
        const docId = this.documents[docIndex].id;
        
        // Calculate BM25 score for this term-document pair
        const score = this._calculateBM25Score(docIndex, frequency, idf);
        
        // Add to document's total score
        if (!scores.has(docId)) {
          scores.set(docId, 0);
        }
        
        scores.set(docId, scores.get(docId)! + score);
      }
    }
    
    // Sort documents by score
    const results = Array.from(scores.entries())
      .map(([docId, score]) => ({
        id: docId,
        score,
        metadata: this.documentMetadata.get(docId)!
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
    
    return results;
  }
  
  /**
   * Calculate BM25 score for a term-document pair
   * @param docIndex - Document index
   * @param termFrequency - Term frequency in the document
   * @param idf - Inverse Document Frequency
   * @returns BM25 score
   */
  _calculateBM25Score(docIndex: number, termFrequency: number, idf: number): number {
    const docLength = this.documentLengths[docIndex];
    const avgDocLength = this.averageDocumentLength;
    
    // BM25 scoring formula
    const numerator = termFrequency * (this.k1 + 1);
    const denominator = termFrequency + this.k1 * (1 - this.b + this.b * (docLength / avgDocLength));
    
    return idf * (numerator / denominator);
  }
  
  /**
   * Calculate Inverse Document Frequency for a term
   * @param term - The term
   * @returns IDF value
   */
  _calculateIDF(term: string): number {
    // Get number of documents containing this term
    const docsWithTerm = this.invertedIndex.has(term) ? this.invertedIndex.get(term)!.length : 0;
    
    // Calculate IDF with smoothing
    return Math.log(1 + (this.documentCount - docsWithTerm + 0.5) / (docsWithTerm + 0.5) + this.epsilon);
  }
  
  /**
   * Tokenize text into terms
   * @param text - Text to tokenize
   * @returns Array of tokens
   */
  _tokenize(text: string): string[] {
    const { lowercase, removeStopwords, stemming, splitOnCode } = this.tokenizationOptions;
    
    // Convert to string if not already
    let processedText = String(text);
    
    // Lowercase if enabled
    if (lowercase) {
      processedText = processedText.toLowerCase();
    }
    
    // Split on code-specific delimiters if enabled
    if (splitOnCode) {
      // Replace common code delimiters with spaces
      processedText = processedText
        .replace(/[{}()\[\]]/g, ' ') // Braces, parentheses, brackets
        .replace(/[;:,.]/g, ' ')     // Semicolons, colons, commas, periods
        .replace(/[-+*/%=<>!&|^~]/g, ' '); // Operators
    }
    
    // Split into tokens
    let tokens = processedText.split(/\s+/).filter(token => token.length > 0);
    
    // Remove stopwords if enabled
    if (removeStopwords) {
      tokens = tokens.filter(token => !STOPWORDS.has(token));
    }
    
    // Apply stemming if enabled
    if (stemming) {
      tokens = tokens.map(token => this._stem(token));
    }
    
    return tokens;
  }
  
  /**
   * Apply stemming to a token (simplified Porter stemming)
   * @param token - Token to stem
   * @returns Stemmed token
   */
  _stem(token: string): string {
    // Very simplified stemming - just handles some common endings
    // For a real implementation, use a proper stemming library
    
    // Skip short tokens
    if (token.length <= 3) {
      return token;
    }
    
    // Handle common endings
    if (token.endsWith('ing')) {
      return token.slice(0, -3);
    } else if (token.endsWith('ed')) {
      return token.slice(0, -2);
    } else if (token.endsWith('s') && !token.endsWith('ss')) {
      return token.slice(0, -1);
    } else if (token.endsWith('ly')) {
      return token.slice(0, -2);
    } else if (token.endsWith('ment')) {
      return token.slice(0, -4);
    }
    
    return token;
  }
  
  /**
   * Get index statistics
   * @returns Index statistics
   */
  getStats(): BM25Stats {
    return {
      documentCount: this.documentCount,
      vocabularySize: this.vocabulary.size,
      averageDocumentLength: this.averageDocumentLength,
      parameters: {
        k1: this.k1,
        b: this.b,
        epsilon: this.epsilon
      }
    };
  }
  
  /**
   * Save the index to disk
   * @param directory - Directory to save the index
   * @param name - Name of the index
   * @returns Path to the saved index
   */
  save(directory: string, name: string = 'bm25_index'): string {
    // Create directory if it doesn't exist
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
    
    // Prepare index data for serialization
    const indexData = {
      parameters: {
        k1: this.k1,
        b: this.b,
        epsilon: this.epsilon
      },
      tokenizationOptions: this.tokenizationOptions,
      documents: this.documents,
      documentMetadata: Array.from(this.documentMetadata.entries()),
      invertedIndex: Array.from(this.invertedIndex.entries()),
      documentLengths: this.documentLengths,
      averageDocumentLength: this.averageDocumentLength,
      documentCount: this.documentCount,
      vocabulary: Array.from(this.vocabulary)
    };
    
    // Save to file
    const indexPath = path.join(directory, `${name}.json`);
    fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
    
    return indexPath;
  }
  
  /**
   * Load the index from disk
   * @param filePath - Path to the index file
   * @returns Loaded index
   */
  static load(filePath: string): BM25Index {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`Index file not found at ${filePath}`);
    }
    
    // Load from file
    const indexData = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
      parameters: { k1: number; b: number; epsilon: number };
      tokenizationOptions: TokenizationOptions;
      documents: Array<{ id: string; content: string }>;
      documentMetadata: Array<[string, BM25DocumentMetadata]>;
      invertedIndex: Array<[string, Posting[]]>;
      documentLengths: number[];
      averageDocumentLength: number;
      documentCount: number;
      vocabulary: string[];
    };
    
    // Create new index with loaded parameters
    const index = new BM25Index({
      ...indexData.parameters,
      ...indexData.tokenizationOptions
    });
    
    // Restore index state
    index.documents = indexData.documents;
    index.documentMetadata = new Map(indexData.documentMetadata);
    index.invertedIndex = new Map(indexData.invertedIndex);
    index.documentLengths = indexData.documentLengths;
    index.averageDocumentLength = indexData.averageDocumentLength;
    index.documentCount = indexData.documentCount;
    index.vocabulary = new Set(indexData.vocabulary);
    
    return index;
  }
}

/**
 * Create a new BM25 index for code documents
 * @param documents - Array of document objects
 * @param options - BM25 options
 * @returns The created index
 */
export function createBM25Index(documents: BM25Document[] = [], options: BM25IndexOptions = {}): BM25Index {
  const index = new BM25Index(options);
  
  if (documents.length > 0) {
    index.addDocuments(documents);
  }
  
  return index;
}

/**
 * Preprocess code content for BM25 indexing
 * @param codeContent - Raw code content
 * @returns Preprocessed content
 */
export function preprocessCodeForBM25(codeContent: string): string {
  // Convert to string if not already
  let processedContent = String(codeContent);
  
  // Remove comments
  processedContent = processedContent
    .replace(/\/\*[\s\S]*?\*\//g, '') // Block comments
    .replace(/\/\/.*/g, '')           // Line comments
    .replace(/#.*/g, '');             // Python/Ruby comments
  
  // Normalize whitespace
  processedContent = processedContent
    .replace(/\s+/g, ' ')
    .trim();
  
  return processedContent;
}

/**
 * Check if BM25 index exists
 * @param directory - Directory to check
 * @param name - Name of the index
 * @returns Whether the index exists
 */
export function bm25IndexExists(directory: string, name: string = 'bm25_index'): boolean {
  const indexPath = path.join(directory, `${name}.json`);
  return fs.existsSync(indexPath);
}

/**
 * Get or create BM25 index
 * @param directory - Directory for the index
 * @param name - Name of the index
 * @param options - BM25 options
 * @returns BM25 index
 */
export function getOrCreateBM25Index(directory: string, name: string = 'bm25_index', options: BM25IndexOptions = {}): BM25Index {
  const indexPath = path.join(directory, `${name}.json`);
  
  if (bm25IndexExists(directory, name)) {
    return BM25Index.load(indexPath);
  } else {
    return createBM25Index([], options);
  }
}

// Common English stopwords
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'if', 'in', 
  'into', 'is', 'it', 'no', 'not', 'of', 'on', 'or', 'such', 'that', 'the', 
  'their', 'then', 'there', 'these', 'they', 'this', 'to', 'was', 'will', 'with'
]);
