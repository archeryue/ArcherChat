/**
 * Web Fetch Tool
 *
 * Fetches and extracts content from web pages using AI-powered extraction.
 */

import { ToolParameter, ToolResult } from '@/types/agent';
import { BaseTool, successResult, errorResult, estimateTokens } from './base';
import { contentFetcher } from '@/lib/web-search/content-fetcher';
import { contentExtractor } from '@/lib/web-search/content-extractor';

export class WebFetchTool extends BaseTool {
  name = 'web_fetch';

  description = `Fetch and extract content from specific web pages. Use after web_search
to get detailed information from the search results. Returns extracted, relevant
content rather than raw HTML.`;

  parameters: ToolParameter[] = [
    {
      name: 'urls',
      type: 'array',
      description: 'URLs to fetch (max 3 for efficiency)',
      required: true,
    },
    {
      name: 'query',
      type: 'string',
      description: 'The original query to focus extraction on',
      required: true,
    },
  ];

  protected async run(params: Record<string, unknown>): Promise<ToolResult> {
    const urls = params.urls as string[];
    const query = params.query as string;

    // Limit to 3 URLs for efficiency
    const limitedUrls = urls.slice(0, 3);

    if (limitedUrls.length === 0) {
      return errorResult('No URLs provided');
    }

    try {
      // Fetch pages
      const fetchResults = await contentFetcher.fetchMultiple(limitedUrls);

      // Separate successful and failed fetches
      const validContent: Array<{ url: string; content: string }> = [];
      const failedUrls: string[] = [];

      for (const result of fetchResults) {
        if ('cleanedText' in result && result.cleanedText) {
          validContent.push({
            url: result.url,
            content: result.cleanedText,
          });
        } else {
          failedUrls.push(result.url);
        }
      }

      if (validContent.length === 0) {
        return errorResult('Failed to fetch content from all URLs');
      }

      // Extract relevant content using AI
      const extracted = await contentExtractor.extractAndRank(
        validContent,
        query
      );

      // Calculate total tokens used
      const totalTokens = extracted.reduce(
        (sum, e) => sum + estimateTokens(e.extractedInfo || ''),
        0
      );

      return successResult(
        {
          extractedContent: extracted.map((e) => ({
            url: e.url,
            title: e.title,
            extractedInfo: e.extractedInfo,
            keyPoints: e.keyPoints || [],
            relevanceScore: e.relevanceScore,
          })),
          fetchedCount: validContent.length,
          failedCount: failedUrls.length,
          failedUrls: failedUrls.length > 0 ? failedUrls : undefined,
        },
        {
          executionTime: 0, // Will be set by executeWithTiming
          tokensUsed: totalTokens,
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fetch failed';
      return errorResult(`Web fetch failed: ${message}`);
    }
  }
}

// Export singleton instance
export const webFetchTool = new WebFetchTool();
