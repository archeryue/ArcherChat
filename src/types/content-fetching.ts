/**
 * Types for web content fetching and extraction
 */

export interface PageContent {
  url: string;
  title: string;
  rawHtml: string;
  cleanedText: string;
  metadata: {
    fetchedAt: Date;
    fetchDuration: number; // milliseconds
    contentLength: number; // bytes
    error?: string;
  };
}

export interface ContentFetcherOptions {
  timeout: number; // milliseconds, default: 5000
  maxContentLength: number; // bytes, default: 50000
  userAgent: string;
  respectRobotsTxt: boolean; // default: true
}

export interface ExtractionRequest {
  content: string;
  query: string;
  url: string;
  maxOutputTokens?: number; // default: 500
}

export interface ExtractedContent {
  url: string;
  title: string;
  extractedInfo: string; // LLM-generated summary
  relevanceScore: number; // 0-1, how relevant to query
  confidence: number; // 0-1, extraction confidence
  keyPoints: string[]; // bulleted list of key information
  tokensUsed: {
    input: number;
    output: number;
  };
  cost: number; // in cents
  extractionTime: number; // milliseconds
}

export interface ContentFetchError {
  url: string;
  error: string;
  errorType: 'timeout' | 'http_error' | 'parse_error' | 'unknown';
}
