/**
 * Web Search Tool
 *
 * Searches the web for current information using Google Custom Search API.
 */

import { ToolParameter, ToolResult } from '@/types/agent';
import { BaseTool, successResult, errorResult, estimateTokens } from './base';
import { googleSearchService } from '@/lib/web-search/google-search';
import { searchRateLimiter } from '@/lib/web-search/rate-limiter';

// Reliable source categories with their domains
const RELIABLE_SOURCES: Record<string, string[]> = {
  encyclopedia: ['wikipedia.org', 'britannica.com'],
  programming: ['stackoverflow.com', 'github.com', 'developer.mozilla.org', 'docs.python.org'],
  academic: ['arxiv.org', 'scholar.google.com', 'researchgate.net', 'ncbi.nlm.nih.gov'],
  government: ['*.gov', 'who.int', 'un.org', 'europa.eu'],
  finance: ['reuters.com', 'bloomberg.com', 'wsj.com', 'ft.com', 'sec.gov', 'federalreserve.gov'],
  tech: ['techcrunch.com', 'arstechnica.com', 'wired.com', 'theverge.com'],
  reference: ['wikipedia.org', 'britannica.com', 'merriam-webster.com', 'dictionary.com'],
};

export class WebSearchTool extends BaseTool {
  name = 'web_search';

  description = `Search the web for current information. Use this tool when you need:
- Latest news, products, or updates
- Real-time data (stock prices, weather, sports scores)
- Current comparisons or reviews
- Information that may have changed since your training

IMPORTANT: Use sourceCategory to target reliable sources and avoid 403 errors:
- "encyclopedia" for facts/concepts (Wikipedia, Britannica)
- "programming" for code questions (StackOverflow, GitHub, MDN)
- "finance" for financial data (Reuters, Bloomberg, SEC)
- "government" for official data (*.gov sites)
- "academic" for research (arXiv, PubMed)

Example: For "What is machine learning?", use sourceCategory="encyclopedia"
DO NOT use for: timeless concepts you already know, creative writing`;

  parameters: ToolParameter[] = [
    {
      name: 'query',
      type: 'string',
      description: 'The search query, optimized for Google search',
      required: true,
    },
    {
      name: 'sourceCategory',
      type: 'string',
      description: 'Category of reliable sources: "encyclopedia", "programming", "finance", "government", "academic", "tech", "reference"',
      required: false,
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

  /**
   * Build optimized query with site: restrictions for reliable sources
   */
  private buildOptimizedQuery(query: string, sourceCategory?: string): string {
    if (!sourceCategory || !RELIABLE_SOURCES[sourceCategory]) {
      return query;
    }

    const domains = RELIABLE_SOURCES[sourceCategory];

    // For single primary source categories, use site: directly
    if (sourceCategory === 'encyclopedia' && domains.includes('wikipedia.org')) {
      return `site:wikipedia.org ${query}`;
    }

    // For programming, prioritize StackOverflow
    if (sourceCategory === 'programming') {
      return `site:stackoverflow.com OR site:github.com ${query}`;
    }

    // For multiple domains, use OR
    const siteQueries = domains
      .slice(0, 3) // Limit to top 3 domains to keep query clean
      .map(d => `site:${d}`)
      .join(' OR ');

    return `(${siteQueries}) ${query}`;
  }

  protected async run(params: Record<string, unknown>): Promise<ToolResult> {
    const query = params.query as string;
    const sourceCategory = params.sourceCategory as string | undefined;
    const targetInfo = params.targetInfo as string[] | undefined;
    const numResults = Math.min((params.numResults as number) || 5, 10);

    // Build optimized query with site restrictions
    const optimizedQuery = this.buildOptimizedQuery(query, sourceCategory);

    // Check rate limits
    const rateCheck = await searchRateLimiter.checkRateLimit();
    if (!rateCheck.allowed) {
      return errorResult(
        `Rate limit exceeded. ${rateCheck.message || 'Please try again later.'}`
      );
    }

    try {
      // Execute search with optimized query
      const results = await googleSearchService.search(optimizedQuery, numResults);

      console.log(`[WebSearch] Query: "${query}" -> Optimized: "${optimizedQuery}" (category: ${sourceCategory || 'none'})`);

      if (!results || results.length === 0) {
        return errorResult('No search results found for the query');
      }

      // Track usage for rate limiting and analytics
      await searchRateLimiter.trackUsage(this.userId, optimizedQuery, results.length);

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
          optimizedQuery,
          sourceCategory,
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
