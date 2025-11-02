import { GoogleSearchResponse, SearchResult } from "@/types/web-search";

/**
 * Google Custom Search API service
 *
 * Setup Instructions:
 * 1. Go to https://console.cloud.google.com/apis/library/customsearch.googleapis.com
 * 2. Enable "Custom Search API" for your project
 * 3. Go to https://programmablesearchengine.google.com/
 * 4. Create a Programmable Search Engine (select "Search the entire web")
 * 5. Get your Search Engine ID from the control panel
 * 6. Add these environment variables:
 *    - GOOGLE_SEARCH_API_KEY (from GCP Console > APIs & Services > Credentials)
 *    - GOOGLE_SEARCH_ENGINE_ID (from Programmable Search Engine)
 *
 * Free tier: 100 queries/day (3,000/month)
 * Paid tier: $5 per 1,000 queries beyond free tier
 */

const GOOGLE_SEARCH_API_URL = 'https://www.googleapis.com/customsearch/v1';

export class GoogleSearchService {
  private apiKey: string;
  private searchEngineId: string;

  constructor(apiKey?: string, searchEngineId?: string) {
    this.apiKey = apiKey || process.env.GOOGLE_SEARCH_API_KEY || '';
    this.searchEngineId = searchEngineId || process.env.GOOGLE_SEARCH_ENGINE_ID || '';

    if (!this.apiKey || !this.searchEngineId) {
      console.warn('[GoogleSearch] API credentials not configured. Web search will not be available.');
    }
  }

  /**
   * Check if the service is properly configured
   */
  isAvailable(): boolean {
    return Boolean(this.apiKey && this.searchEngineId);
  }

  /**
   * Search the web using Google Custom Search API
   *
   * @param query - The search query
   * @param numResults - Number of results to return (1-10)
   * @returns Array of search results
   */
  async search(query: string, numResults: number = 5): Promise<SearchResult[]> {
    if (!this.isAvailable()) {
      throw new Error('Google Search API is not configured. Please set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables.');
    }

    if (!query || query.trim().length === 0) {
      throw new Error('Search query cannot be empty');
    }

    // Clamp numResults to valid range
    const num = Math.min(Math.max(1, numResults), 10);

    try {
      const url = new URL(GOOGLE_SEARCH_API_URL);
      url.searchParams.append('key', this.apiKey);
      url.searchParams.append('cx', this.searchEngineId);
      url.searchParams.append('q', query);
      url.searchParams.append('num', num.toString());

      console.log(`[GoogleSearch] Searching for: "${query}" (${num} results)`);

      const response = await fetch(url.toString());

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[GoogleSearch] API error:', response.status, errorText);
        throw new Error(`Google Search API returned ${response.status}: ${response.statusText}`);
      }

      const data: GoogleSearchResponse = await response.json();

      if (!data.items || data.items.length === 0) {
        console.log(`[GoogleSearch] No results found for: "${query}"`);
        return [];
      }

      console.log(`[GoogleSearch] Found ${data.items.length} results`);

      return data.items.map(item => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
        displayLink: item.displayLink,
      }));
    } catch (error) {
      console.error('[GoogleSearch] Error performing search:', error);
      throw error;
    }
  }

  /**
   * Format search results as markdown for AI context
   *
   * @param results - Array of search results
   * @param query - Original search query
   * @returns Formatted markdown string
   */
  formatResultsForAI(results: SearchResult[], query: string): string {
    if (results.length === 0) {
      return `No search results found for "${query}".`;
    }

    let markdown = `**Web Search Results for "${query}":**\n\n`;

    results.forEach((result, index) => {
      markdown += `${index + 1}. **${result.title}**\n`;
      markdown += `   ${result.snippet}\n`;
      markdown += `   Source: ${result.displayLink}\n\n`;
    });

    return markdown;
  }

  /**
   * Format search results for user display (with citations)
   *
   * @param results - Array of search results
   * @returns Formatted markdown with citations
   */
  formatResultsForUser(results: SearchResult[]): string {
    if (results.length === 0) {
      return '';
    }

    let markdown = '\n\n**Sources:**\n';

    results.forEach((result, index) => {
      markdown += `${index + 1}. [${result.title}](${result.link})\n`;
    });

    return markdown;
  }
}

// Export singleton instance
export const googleSearchService = new GoogleSearchService();
