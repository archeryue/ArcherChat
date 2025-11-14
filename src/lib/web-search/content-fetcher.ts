/**
 * Content Fetcher Service
 * Fetches and parses web page content using cheerio
 */

import * as cheerio from 'cheerio';
import { PageContent, ContentFetcherOptions, ContentFetchError } from '@/types/content-fetching';

// Realistic User-Agent strings that rotate to avoid blocking
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
];

const DEFAULT_OPTIONS: ContentFetcherOptions = {
  timeout: 5000, // 5 seconds
  maxContentLength: 50000, // 50KB
  userAgent: USER_AGENTS[0],
  respectRobotsTxt: true,
};

// Maximum download size: 2MB (to prevent memory exhaustion)
const MAX_DOWNLOAD_SIZE = 2 * 1024 * 1024;

export class ContentFetcher {
  private options: ContentFetcherOptions;

  constructor(options?: Partial<ContentFetcherOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Get a random User-Agent from the pool
   */
  private getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch and parse content from a URL with retry logic
   */
  async fetchPageContent(url: string): Promise<PageContent> {
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const startTime = Date.now();

        if (attempt > 0) {
          // Exponential backoff: 1s, 2s
          const delay = 1000 * Math.pow(2, attempt - 1);
          console.log(`[ContentFetcher] Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay for ${url}`);
          await this.sleep(delay);
        }

        console.log(`[ContentFetcher] Fetching: ${url}`);

        // 1. Fetch HTML with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

        // Use random User-Agent on retry to bypass blocking
        const userAgent = attempt > 0 ? this.getRandomUserAgent() : this.options.userAgent;

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Referer': new URL(url).origin,
          },
        });

        clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check Content-Type - skip PDFs and other binary files
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('application/pdf') ||
          contentType.includes('application/octet-stream') ||
          contentType.includes('application/zip')) {
        throw new Error(`Unsupported content type: ${contentType}`);
      }

      // Check Content-Length - skip if file is too large
      const contentLength = response.headers.get('Content-Length');
      if (contentLength && parseInt(contentLength) > MAX_DOWNLOAD_SIZE) {
        throw new Error(`File too large: ${contentLength} bytes (max ${MAX_DOWNLOAD_SIZE})`);
      }

      const html = await response.text();
      const fetchDuration = Date.now() - startTime;

      console.log(`[ContentFetcher] Fetched ${url} in ${fetchDuration}ms (${html.length} bytes)`);

      // 2. Parse with cheerio
      const $ = cheerio.load(html);

      // 3. Extract title
      const title = this.extractTitle($);

      // 4. Extract main content
      const mainContent = this.extractMainContent($);

      // 5. Clean and truncate
      const cleanedText = this.cleanText(mainContent);
      const truncatedText = cleanedText.substring(0, this.options.maxContentLength);

      console.log(`[ContentFetcher] Extracted ${truncatedText.length} chars from ${url}`);

        return {
          url,
          title,
          rawHtml: html.substring(0, this.options.maxContentLength),
          cleanedText: truncatedText,
          metadata: {
            fetchedAt: new Date(),
            fetchDuration: Date.now() - startTime,
            contentLength: truncatedText.length,
          },
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        const errorMessage = lastError.message;

        // Don't retry for non-retryable errors
        if (errorMessage.includes('Unsupported content type') ||
            errorMessage.includes('File too large')) {
          console.error(`[ContentFetcher] Non-retryable error for ${url}:`, errorMessage);
          break;
        }

        // Retry for HTTP errors (403, 429, 500+) and network errors
        if (attempt < maxRetries) {
          console.warn(`[ContentFetcher] Fetch failed (attempt ${attempt + 1}/${maxRetries + 1}):`, errorMessage);
          continue;
        }

        // Max retries exhausted
        console.error(`[ContentFetcher] Failed to fetch ${url} after ${maxRetries + 1} attempts:`, errorMessage);
      }
    }

    // All attempts failed, throw error
    const fetchError: ContentFetchError = {
      url,
      error: lastError?.message || 'Failed to fetch after retries',
      errorType: this.categorizeError(lastError),
    };

    throw fetchError;
  }

  /**
   * Extract page title
   */
  private extractTitle($: ReturnType<typeof cheerio.load>): string {
    // Try multiple title sources
    const title =
      $('title').first().text() ||
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('h1').first().text() ||
      'Untitled';

    return title.trim();
  }

  /**
   * Extract main content using common selectors
   */
  private extractMainContent($: ReturnType<typeof cheerio.load>): string {
    // Remove unwanted elements first (across entire document)
    $('script, style, nav, header, footer, aside, .sidebar, .advertisement, .ad, iframe, noscript').remove();

    // Try common content selectors in order of preference
    const selectors = [
      'article',              // Semantic article tag
      'main',                 // Main content area
      '[role="main"]',        // ARIA main role
      '.post-content',        // Common blog class
      '.article-content',     // Common article class
      '.entry-content',       // WordPress default
      '.content',             // Generic content class
      '#content',             // Generic content ID
      '.markdown-body',       // GitHub, Markdown renderers
      'body',                 // Ultimate fallback
    ];

    for (const selector of selectors) {
      const content = $(selector).first();
      if (content.length) {
        const text = content.text().trim();
        // Must have substantial content (>100 chars)
        if (text.length > 100) {
          console.log(`[ContentFetcher] Found content with selector: ${selector}`);
          return text;
        }
      }
    }

    // Fallback: get body text
    console.log(`[ContentFetcher] Using fallback: body text`);
    return $('body').text();
  }

  /**
   * Clean and normalize text
   */
  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')           // Normalize whitespace
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive newlines
      .replace(/\t+/g, ' ')           // Replace tabs with spaces
      .trim();
  }

  /**
   * Categorize error type
   */
  private categorizeError(error: unknown): ContentFetchError['errorType'] {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return 'timeout';
      }
      if (error.message.includes('HTTP')) {
        return 'http_error';
      }
    }
    return 'unknown';
  }

  /**
   * Batch fetch multiple URLs (in parallel with concurrency limit)
   */
  async fetchMultiple(
    urls: string[],
    options?: { concurrency?: number }
  ): Promise<Array<PageContent | ContentFetchError>> {
    const concurrency = options?.concurrency || 3;
    const results: Array<PageContent | ContentFetchError> = [];

    // Process in batches
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(url => this.fetchPageContent(url))
      );

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            url: batch[index],
            error: result.reason?.message || 'Failed to fetch',
            errorType: 'unknown',
          });
        }
      });
    }

    return results;
  }
}

// Export singleton instance
export const contentFetcher = new ContentFetcher();
