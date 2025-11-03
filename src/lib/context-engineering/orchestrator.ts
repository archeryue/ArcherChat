import { PromptAnalysisResult } from "@/types/prompt-analysis";
import { AIMessage } from "@/types/ai-providers";
import { googleSearchService } from "@/lib/web-search/google-search";
import { searchRateLimiter } from "@/lib/web-search/rate-limiter";
import { contentFetcher } from "@/lib/web-search/content-fetcher";
import { contentExtractor } from "@/lib/web-search/content-extractor";
import { getUserMemory } from "@/lib/memory/storage";
import { SearchResult } from "@/types/web-search";
import { MemoryFact } from "@/types/memory";
import { ExtractedContent } from "@/types/content-fetching";
import { GEMINI_MODELS, ModelTier } from "@/config/models";
import { ProgressEmitter } from "@/lib/progress/emitter";
import { ProgressStep } from "@/lib/progress/types";

/**
 * Context Engineering Module
 *
 * Orchestrates all context preparation based on PromptAnalysis results:
 * 1. Execute web search (if needed and within rate limits)
 * 2. Retrieve relevant memories (if needed)
 * 3. Select appropriate model (Flash vs Image)
 * 4. Build final context + prompt
 *
 * This module is the "conductor" that coordinates all the pieces.
 */

export interface ContextEngineeringResult {
  // Final context to include in LLM prompt
  context: string;

  // Selected model
  modelName: string;

  // Data collected (for tracking/debugging)
  webSearchResults?: SearchResult[];
  extractedContent?: ExtractedContent[];  // NEW: Extracted web page content
  memoriesRetrieved?: MemoryFact[];

  // Rate limiting info
  rateLimitError?: string;
}

export class ContextOrchestrator {
  /**
   * Orchestrate context preparation based on analysis
   *
   * @param analysis - Result from PromptAnalysis
   * @param userId - User's ID for rate limiting and memory retrieval
   * @param conversationId - Current conversation ID
   * @param progressEmitter - Optional progress emitter for tracking
   * @returns Prepared context and model selection
   */
  async prepare(
    analysis: PromptAnalysisResult,
    userId: string,
    conversationId?: string,
    progressEmitter?: ProgressEmitter
  ): Promise<ContextEngineeringResult> {
    const result: ContextEngineeringResult = {
      context: "",
      modelName: this.selectModel(analysis),
    };

    // Execute actions in parallel for speed
    const tasks: Promise<any>[] = [];

    // 1. Web Search (if needed)
    if (analysis.actions.web_search.needed && analysis.actions.web_search.query) {
      tasks.push(this.executeWebSearch(userId, analysis.actions.web_search.query));
    }

    // 2. Memory Retrieval (if needed)
    if (analysis.actions.memory_retrieval.needed) {
      tasks.push(this.retrieveMemories(userId, analysis.actions.memory_retrieval.search_terms));
    }

    // Wait for all tasks to complete
    const results = await Promise.allSettled(tasks);

    // Process results
    let taskIndex = 0;

    // Web search results (only if task was added)
    if (analysis.actions.web_search.needed && analysis.actions.web_search.query) {
      const searchResult = results[taskIndex++];
      if (searchResult.status === 'fulfilled') {
        result.webSearchResults = searchResult.value;
      } else {
        console.error('[ContextOrchestrator] Web search failed:', searchResult.reason);
        result.rateLimitError = searchResult.reason?.message;
      }
    }

    // Memory retrieval results
    if (analysis.actions.memory_retrieval.needed) {
      const memoryResult = results[taskIndex++];
      if (memoryResult.status === 'fulfilled') {
        result.memoriesRetrieved = memoryResult.value;
      } else {
        console.error('[ContextOrchestrator] Memory retrieval failed:', memoryResult.reason);
      }
    }

    // 3. Content Fetching & Extraction (if we have search results)
    if (result.webSearchResults && result.webSearchResults.length > 0) {
      result.extractedContent = await this.fetchAndExtractContent(
        result.webSearchResults,
        analysis.actions.web_search.query || '',
        progressEmitter
      );
    }

    // Build final context
    result.context = this.buildFinalContext(
      result.webSearchResults,
      result.extractedContent,
      result.memoriesRetrieved,
      analysis
    );

    return result;
  }

  /**
   * Execute web search with rate limiting
   */
  private async executeWebSearch(userId: string, query: string): Promise<SearchResult[]> {
    // Check if service is available first (skip rate limiter if disabled)
    if (!googleSearchService.isAvailable()) {
      console.warn('[ContextOrchestrator] Google Search not configured, skipping search');
      return [];
    }

    // Check global rate limits
    const rateCheck = await searchRateLimiter.checkRateLimit();

    if (!rateCheck.allowed) {
      throw new Error(rateCheck.message || "Rate limit exceeded");
    }

    // Execute search
    try {
      const results = await googleSearchService.search(query, 5);

      // Track usage
      await searchRateLimiter.trackUsage(userId, query, results.length);

      return results;
    } catch (error) {
      console.error('[ContextOrchestrator] Search error:', error);
      return [];
    }
  }

  /**
   * Retrieve relevant memories
   */
  private async retrieveMemories(
    userId: string,
    searchTerms?: string[]
  ): Promise<MemoryFact[]> {
    try {
      // Load user memories
      const userMemory = await getUserMemory(userId);
      const memories = userMemory.facts;

      // If search terms provided, filter memories
      if (searchTerms && searchTerms.length > 0) {
        return memories.filter(fact => {
          const contentLower = fact.content.toLowerCase();
          return searchTerms.some(term => contentLower.includes(term.toLowerCase()));
        });
      }

      return memories;
    } catch (error) {
      console.error('[ContextOrchestrator] Memory retrieval error:', error);
      return [];
    }
  }

  /**
   * Fetch and extract content from web search results
   */
  private async fetchAndExtractContent(
    searchResults: SearchResult[],
    query: string,
    progressEmitter?: ProgressEmitter
  ): Promise<ExtractedContent[]> {
    try {
      // Limit to top 3 results for cost efficiency
      const topResults = searchResults.slice(0, 3);
      const urls = topResults.map(r => r.link);

      // Emit progress: Fetching content
      progressEmitter?.emit({
        step: ProgressStep.FETCHING_CONTENT,
        status: 'started',
        message: `Fetching ${urls.length} pages...`,
        timestamp: Date.now(),
        details: {
          current: 0,
          total: urls.length,
        },
      });

      console.log(`[ContextOrchestrator] Fetching content from ${urls.length} URLs`);

      // Fetch page content
      const fetchResults = await contentFetcher.fetchMultiple(urls, { concurrency: 2 });

      // Filter successful fetches
      const successfulFetches = fetchResults.filter(
        (result): result is import('@/types/content-fetching').PageContent => !('error' in result)
      );

      console.log(`[ContextOrchestrator] Successfully fetched ${successfulFetches.length}/${urls.length} pages`);

      // Emit progress: Fetching complete
      progressEmitter?.emit({
        step: ProgressStep.FETCHING_CONTENT,
        status: 'completed',
        message: `Fetched ${successfulFetches.length} pages`,
        timestamp: Date.now(),
      });

      if (successfulFetches.length === 0) {
        return [];
      }

      // Emit progress: Extracting info
      progressEmitter?.emit({
        step: ProgressStep.EXTRACTING_INFO,
        status: 'started',
        message: `Extracting relevant information...`,
        timestamp: Date.now(),
        details: {
          current: 0,
          total: successfulFetches.length,
        },
      });

      console.log(`[ContextOrchestrator] Extracting content for query: "${query}"`);

      // Extract relevant information using Gemini
      const extracted = await contentExtractor.extractAndRank(
        successfulFetches.map(page => ({
          url: page.url,
          content: page.cleanedText,
        })),
        query
      );

      console.log(`[ContextOrchestrator] Extracted ${extracted.length} content pieces, avg relevance: ${
        (extracted.reduce((sum, e) => sum + e.relevanceScore, 0) / extracted.length).toFixed(2)
      }`);

      // Emit progress: Extraction complete
      progressEmitter?.emit({
        step: ProgressStep.EXTRACTING_INFO,
        status: 'completed',
        message: `Extracted ${extracted.length} relevant summaries`,
        timestamp: Date.now(),
      });

      return extracted;
    } catch (error) {
      console.error('[ContextOrchestrator] Content fetching/extraction error:', error);

      // Emit error progress
      progressEmitter?.emit({
        step: ProgressStep.EXTRACTING_INFO,
        status: 'error',
        message: 'Content extraction failed',
        timestamp: Date.now(),
      });

      return [];
    }
  }

  /**
   * Select appropriate model based on analysis
   */
  private selectModel(analysis: PromptAnalysisResult): string {
    // Use Image model if image generation is needed
    if (analysis.actions.image_generation.needed) {
      return GEMINI_MODELS[ModelTier.IMAGE];
    }

    // Default to main model
    return GEMINI_MODELS[ModelTier.MAIN];
  }

  /**
   * Build final context string from all collected data
   */
  private buildFinalContext(
    webSearchResults?: SearchResult[],
    extractedContent?: ExtractedContent[],
    memories?: MemoryFact[],
    analysis?: PromptAnalysisResult
  ): string {
    let context = "";

    // Add memory context
    if (memories && memories.length > 0) {
      context += "**User Context (from memory):**\n\n";

      memories.forEach(fact => {
        context += `- ${fact.content}\n`;
      });

      context += "\n---\n\n";
    }

    // Add extracted web content (more detailed than search snippets)
    if (extractedContent && extractedContent.length > 0) {
      context += `**Detailed Web Content for "${analysis?.actions.web_search.query}":**\n\n`;

      extractedContent.forEach((content, index) => {
        context += `**Source ${index + 1}: ${content.title}** (Relevance: ${(content.relevanceScore * 100).toFixed(0)}%)\n`;
        context += `${content.extractedInfo}\n\n`;

        if (content.keyPoints && content.keyPoints.length > 0) {
          context += `Key Points:\n`;
          content.keyPoints.forEach(point => {
            context += `- ${point}\n`;
          });
          context += `\n`;
        }
      });

      context += "\n---\n\n";
    } else if (webSearchResults && webSearchResults.length > 0 && analysis?.actions.web_search.query) {
      // Fallback to search snippets if extraction failed
      context += googleSearchService.formatResultsForAI(
        webSearchResults,
        analysis.actions.web_search.query
      );
      context += "\n---\n\n";
    }

    return context;
  }

  /**
   * Format source citations for user (append to response)
   */
  formatSourceCitations(webSearchResults?: SearchResult[]): string {
    if (!webSearchResults || webSearchResults.length === 0) {
      return "";
    }

    return googleSearchService.formatResultsForUser(webSearchResults);
  }
}

// Export singleton instance
export const contextOrchestrator = new ContextOrchestrator();
