import { PromptAnalysisResult, SearchReflection } from "@/types/prompt-analysis";
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
import { GoogleGenerativeAI } from "@google/generative-ai";

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

    // Handle memory retrieval (non-iterative)
    if (analysis.actions.memory_retrieval.needed) {
      try {
        result.memoriesRetrieved = await this.retrieveMemories(
          userId,
          analysis.actions.memory_retrieval.search_terms
        );
      } catch (error) {
        console.error('[ContextOrchestrator] Memory retrieval failed:', error);
      }
    }

    // Handle web search with iterative refinement (NEW!)
    if (analysis.actions.web_search.needed && analysis.actions.web_search.query) {
      const searchResult = await this.executeIterativeSearch(
        userId,
        analysis,
        progressEmitter
      );

      // Only set results if we have data (not just empty arrays)
      if (searchResult.searchResults.length > 0) {
        result.webSearchResults = searchResult.searchResults;
      }
      if (searchResult.extractedContent.length > 0) {
        result.extractedContent = searchResult.extractedContent;
      }
      if (searchResult.rateLimitError) {
        result.rateLimitError = searchResult.rateLimitError;
      }
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
   * Execute iterative web search with reflection (up to 3 iterations)
   *
   * @param userId - User ID for rate limiting
   * @param analysis - Prompt analysis result
   * @param progressEmitter - Progress emitter for tracking
   * @returns Combined search results and extracted content
   */
  private async executeIterativeSearch(
    userId: string,
    analysis: PromptAnalysisResult,
    progressEmitter?: ProgressEmitter
  ): Promise<{
    searchResults: SearchResult[];
    extractedContent: ExtractedContent[];
    rateLimitError?: string;
  }> {
    const MAX_ITERATIONS = 3;
    const allSearchResults: SearchResult[] = [];
    const allExtractedContent: ExtractedContent[] = [];

    let currentQuery = analysis.actions.web_search.query || '';
    const userQuestion = analysis.actions.web_search.userQuestion || '';
    const targetInfo = analysis.actions.web_search.targetInfo || [];

    // If no targetInfo provided, can't do intelligent reflection - just do one search
    if (targetInfo.length === 0) {
      console.log('[ContextOrchestrator] No targetInfo provided, performing single search');
      try {
        const searchResults = await this.executeWebSearch(userId, currentQuery);
        allSearchResults.push(...searchResults);

        if (searchResults.length > 0) {
          const extracted = await this.fetchAndExtractContent(
            searchResults,
            currentQuery,
            progressEmitter
          );
          allExtractedContent.push(...extracted);
        }
      } catch (error: any) {
        return {
          searchResults: allSearchResults,
          extractedContent: allExtractedContent,
          rateLimitError: error?.message
        };
      }

      return {
        searchResults: allSearchResults,
        extractedContent: allExtractedContent
      };
    }

    // Iterative search with reflection
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      console.log(`[ContextOrchestrator] Search iteration ${iteration + 1}/${MAX_ITERATIONS}, query: "${currentQuery}"`);

      // Emit progress: Starting iteration
      if (iteration > 0 && progressEmitter) {
        progressEmitter.emit({
          step: ProgressStep.SEARCHING_WEB,
          status: 'started',
          message: `Refining search (iteration ${iteration + 1}): ${currentQuery}`,
          timestamp: Date.now(),
        });
      }

      try {
        // Execute search
        const searchResults = await this.executeWebSearch(userId, currentQuery);
        allSearchResults.push(...searchResults);

        if (searchResults.length === 0) {
          console.log('[ContextOrchestrator] No search results, ending iteration');
          break;
        }

        // Extract content
        const extracted = await this.fetchAndExtractContent(
          searchResults,
          currentQuery,
          progressEmitter
        );
        allExtractedContent.push(...extracted);

        // Emit progress: Analyzing content
        if (iteration < MAX_ITERATIONS - 1 && progressEmitter) {
          progressEmitter.emit({
            step: ProgressStep.ANALYZING_PROMPT,
            status: 'started',
            message: 'Analyzing if more information is needed...',
            timestamp: Date.now(),
          });
        }

        // Reflect: Do we need more information?
        const reflection = await this.reflectOnContent(
          userQuestion,
          targetInfo,
          allExtractedContent,
          iteration
        );

        // If sufficient or last iteration, stop
        if (reflection.sufficient || iteration === MAX_ITERATIONS - 1) {
          console.log(`[ContextOrchestrator] Search complete after ${iteration + 1} iteration(s). Sufficient: ${reflection.sufficient}`);

          // Emit progress: Search complete
          if (progressEmitter) {
            progressEmitter.emit({
              step: ProgressStep.SEARCHING_WEB,
              status: 'completed',
              message: `Found comprehensive information (${iteration + 1} search${iteration > 0 ? 'es' : ''})`,
              timestamp: Date.now(),
            });
          }
          break;
        }

        // Continue with refined query
        if (reflection.refinedQuery) {
          currentQuery = reflection.refinedQuery;
          console.log(`[ContextOrchestrator] Refining search: "${currentQuery}"`);

          // Emit progress: Refining search
          if (progressEmitter) {
            progressEmitter.emit({
              step: ProgressStep.ANALYZING_PROMPT,
              status: 'completed',
              message: `Need more info about: ${reflection.missingAspects?.join(', ') || 'additional details'}`,
              timestamp: Date.now(),
            });
          }
        } else {
          console.log('[ContextOrchestrator] No refined query provided, ending iteration');
          break;
        }

      } catch (error: any) {
        console.error(`[ContextOrchestrator] Search iteration ${iteration + 1} failed:`, error);

        // If first iteration fails, return error
        if (iteration === 0) {
          return {
            searchResults: allSearchResults,
            extractedContent: allExtractedContent,
            rateLimitError: error?.message
          };
        }

        // Otherwise, stop iteration and use what we have
        break;
      }
    }

    return {
      searchResults: allSearchResults,
      extractedContent: allExtractedContent
    };
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
   * Reflect on collected content to determine if more search is needed
   *
   * @param userQuestion - Original user question
   * @param targetInfo - Key aspects that should be covered
   * @param extractedContent - Content collected so far
   * @param iteration - Current iteration number
   * @returns Reflection result with sufficiency assessment and refined query
   */
  private async reflectOnContent(
    userQuestion: string,
    targetInfo: string[],
    extractedContent: ExtractedContent[],
    iteration: number
  ): Promise<SearchReflection> {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn('[ContextOrchestrator] Gemini API key not configured, skipping reflection');
        return {
          sufficient: true,
          reasoning: 'Cannot perform reflection without API key',
          confidence: 0.5
        };
      }

      const client = new GoogleGenerativeAI(apiKey);
      const model = client.getGenerativeModel({
        model: GEMINI_MODELS[ModelTier.LITE] // Use Flash Lite for cost efficiency
      });

      // Build reflection prompt
      const contentSummary = extractedContent.map((content, idx) =>
        `Source ${idx + 1} (${content.title}):\n${content.extractedInfo}\nKey points: ${content.keyPoints?.join(', ') || 'none'}`
      ).join('\n\n');

      const prompt = `You are analyzing whether search results sufficiently answer a user's question.

User asked: "${userQuestion}"

We want to cover these aspects: ${targetInfo.join(', ')}

Content found so far (iteration ${iteration + 1}/3):
${contentSummary}

Analyze:
1. Does this content sufficiently cover the key aspects?
2. What important information is missing (if any)?
3. If more search is needed, what specific refined query would help?

Return ONLY valid JSON (DO NOT use 'undefined', omit fields or use null instead):
{
  "sufficient": boolean,
  "missingAspects"?: string[],
  "refinedQuery"?: string,
  "reasoning": string,
  "confidence": 0.0-1.0
}

IMPORTANT: If sufficient=true, OMIT the missingAspects and refinedQuery fields entirely (do not set them to null or undefined).
If sufficient=false, provide specific missingAspects and a refined query to find that information.`;

      const result = await model.generateContent(prompt);
      const response = result.response.text();

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in reflection response");
      }

      const reflection: SearchReflection = JSON.parse(jsonMatch[0]);

      console.log(`[ContextOrchestrator] Reflection (iteration ${iteration + 1}):`, {
        sufficient: reflection.sufficient,
        missingAspects: reflection.missingAspects,
        confidence: reflection.confidence
      });

      return reflection;
    } catch (error) {
      console.error('[ContextOrchestrator] Reflection error:', error);

      // Fallback: assume content is sufficient to avoid infinite loops
      return {
        sufficient: true,
        reasoning: 'Reflection failed, proceeding with available content',
        confidence: 0.5
      };
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
