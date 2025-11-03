/**
 * Content Fetcher Service
 * Fetches and parses web page content using cheerio
 */

import * as cheerio from 'cheerio';
import { PageContent, ContentFetcherOptions, ContentFetchError } from '@/types/content-fetching';

const DEFAULT_OPTIONS: ContentFetcherOptions = {
  timeout: 5000, // 5 seconds
  maxContentLength: 50000, // 50KB
  userAgent: 'Mozilla/5.0 (compatible; ArcherChatBot/1.0; +https://archerchat.app)',
  respectRobotsTxt: true,
};

export class ContentFetcher {
  private options: ContentFetcherOptions;

  constructor(options?: Partial<ContentFetcherOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Fetch and parse content from a URL
   */
  async fetchPageContent(url: string): Promise<PageContent> {
    const startTime = Date.now();

    try {
      console.log(`[ContentFetcher] Fetching: ${url}`);

      // 1. Fetch HTML with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.options.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ContentFetcher] Failed to fetch ${url}:`, errorMessage);

      const fetchError: ContentFetchError = {
        url,
        error: errorMessage,
        errorType: this.categorizeError(error),
      };

      throw fetchError;
    }
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
