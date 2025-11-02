import { PromptAnalysisResult } from "@/types/prompt-analysis";
import { AIMessage } from "@/types/ai-providers";
import { googleSearchService } from "@/lib/web-search/google-search";
import { searchRateLimiter } from "@/lib/web-search/rate-limiter";
import { getUserMemory } from "@/lib/memory/storage";
import { SearchResult } from "@/types/web-search";
import { MemoryFact } from "@/types/memory";
import { GEMINI_MODELS, ModelTier } from "@/config/models";

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
   * @returns Prepared context and model selection
   */
  async prepare(
    analysis: PromptAnalysisResult,
    userId: string,
    conversationId?: string
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

    // Web search results
    if (analysis.actions.web_search.needed) {
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

    // Build final context
    result.context = this.buildFinalContext(
      result.webSearchResults,
      result.memoriesRetrieved,
      analysis
    );

    return result;
  }

  /**
   * Execute web search with rate limiting
   */
  private async executeWebSearch(userId: string, query: string): Promise<SearchResult[]> {
    // Check rate limits
    const rateCheck = await searchRateLimiter.checkRateLimit(userId);

    if (!rateCheck.allowed) {
      throw new Error(rateCheck.message || "Rate limit exceeded");
    }

    // Check if service is available
    if (!googleSearchService.isAvailable()) {
      console.warn('[ContextOrchestrator] Google Search not configured, skipping search');
      return [];
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

    // Add web search context
    if (webSearchResults && webSearchResults.length > 0 && analysis?.actions.web_search.query) {
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
