/**
 * Web Search Tool
 *
 * Searches the web for current information using Google Custom Search API.
 */

import { ToolParameter, ToolResult } from '@/types/agent';
import { BaseTool, successResult, errorResult, estimateTokens } from './base';
import { googleSearchService } from '@/lib/web-search/google-search';
import { searchRateLimiter } from '@/lib/web-search/rate-limiter';

export class WebSearchTool extends BaseTool {
  name = 'web_search';

  description = `Search the web for current information. Use this tool when you need:
- Latest news, products, or updates
- Real-time data (stock prices, weather, sports scores)
- Current comparisons or reviews
- Information that may have changed since your training
DO NOT use for: timeless concepts, historical facts, creative writing`;

  parameters: ToolParameter[] = [
    {
      name: 'query',
      type: 'string',
      description: 'The search query, optimized for Google search',
      required: true,
    },
    {
      name: 'targetInfo',
      type: 'array',
      description:
        'Key aspects to cover (e.g., ["pricing", "features", "reviews"])',
      required: false,
    },
    {
      name: 'numResults',
      type: 'number',
      description: 'Number of results to return (default: 5, max: 10)',
      required: false,
      default: 5,
    },
  ];

  protected async run(params: Record<string, unknown>): Promise<ToolResult> {
    const query = params.query as string;
    const targetInfo = params.targetInfo as string[] | undefined;
    const numResults = Math.min((params.numResults as number) || 5, 10);

    // Check rate limits
    const rateCheck = await searchRateLimiter.checkRateLimit();
    if (!rateCheck.allowed) {
      return errorResult(
        `Rate limit exceeded. ${rateCheck.message || 'Please try again later.'}`
      );
    }

    try {
      // Execute search
      const results = await googleSearchService.search(query, numResults);

      if (!results || results.length === 0) {
        return errorResult('No search results found for the query');
      }

      // Track usage for rate limiting and analytics
      await searchRateLimiter.trackUsage(this.userId, query, results.length);

      // Format results for agent
      const formattedResults = results.map((r, i) => ({
        index: i + 1,
        title: r.title,
        link: r.link,
        snippet: r.snippet,
        displayLink: r.displayLink,
      }));

      return successResult(
        {
          results: formattedResults,
          query,
          targetInfo,
          totalResults: results.length,
        },
        {
          executionTime: 0, // Will be set by executeWithTiming
          cost: 0, // Free tier
          tokensUsed: estimateTokens(JSON.stringify(formattedResults)),
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      return errorResult(`Web search failed: ${message}`);
    }
  }
}

// Export singleton instance
export const webSearchTool = new WebSearchTool();
