/**
 * Unit Tests: Context Orchestrator (Web Search Integration)
 * Tests ContextOrchestrator's web search logic with mocked dependencies
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mockSearchResults } from '@/__tests__/fixtures/web-search';
import { PromptAnalysisResult } from '@/types/prompt-analysis';

// Mock UUID first (needed by storage module)
jest.mock('uuid', () => ({
  v4: () => 'mock-uuid',
}));

// Mock dependencies before importing
jest.mock('@/lib/web-search/google-search');
jest.mock('@/lib/web-search/rate-limiter');
jest.mock('@/lib/memory/storage');

// Import after mocking
import { ContextOrchestrator } from '@/lib/context-engineering/orchestrator';
import { googleSearchService } from '@/lib/web-search/google-search';
import { searchRateLimiter } from '@/lib/web-search/rate-limiter';
import { getUserMemory } from '@/lib/memory/storage';

describe('ContextOrchestrator - Web Search Integration', () => {
  let orchestrator: ContextOrchestrator;
  const mockUserId = 'test-user-001';
  const mockConversationId = 'test-conversation-001';

  // Helper to create mock analysis result
  const createMockAnalysis = (webSearchNeeded: boolean = false, query: string = ''): PromptAnalysisResult => ({
    intent: 'web_search',
    confidence: 0.9,
    language: 'english',
    actions: {
      web_search: {
        needed: webSearchNeeded,
        query: query,
        reasoning: 'User needs current information',
      },
      memory_retrieval: {
        needed: false,
        search_terms: [],
        reasoning: 'No memory needed',
      },
      memory_extraction: {
        needed: false,
        facts: [],
        reasoning: 'No facts to extract',
      },
      image_generation: {
        needed: false,
        prompt: '',
        reasoning: 'No image needed',
      },
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock implementations
    jest.mocked(googleSearchService.isAvailable).mockReturnValue(true);
    jest.mocked(googleSearchService.search).mockResolvedValue([]);
    jest.mocked(googleSearchService.formatResultsForAI).mockReturnValue('');
    jest.mocked(googleSearchService.formatResultsForUser).mockReturnValue('');

    jest.mocked(searchRateLimiter.checkRateLimit).mockResolvedValue({
      allowed: true,
      dailyRemaining: 50,
    });
    jest.mocked(searchRateLimiter.trackUsage).mockResolvedValue(undefined);

    jest.mocked(getUserMemory).mockResolvedValue({
      user_id: mockUserId,
      facts: [],
      stats: { total_facts: 0, token_usage: 0, last_cleanup: new Date() },
      updated_at: new Date(),
    });

    orchestrator = new ContextOrchestrator();
  });

  describe('prepare - Web Search Logic', () => {
    it('should skip web search when not needed', async () => {
      const analysis = createMockAnalysis(false);

      const result = await orchestrator.prepare(analysis, mockUserId, mockConversationId);

      expect(googleSearchService.search).not.toHaveBeenCalled();
      expect(searchRateLimiter.checkRateLimit).not.toHaveBeenCalled();
      expect(result.webSearchResults).toBeUndefined();
    });

    it('should skip web search when service is not available', async () => {
      jest.mocked(googleSearchService.isAvailable).mockReturnValue(false);
      const analysis = createMockAnalysis(true, 'test query');

      const result = await orchestrator.prepare(analysis, mockUserId, mockConversationId);

      // Should check availability BEFORE rate limiter
      expect(googleSearchService.isAvailable).toHaveBeenCalled();
      expect(searchRateLimiter.checkRateLimit).not.toHaveBeenCalled();
      expect(googleSearchService.search).not.toHaveBeenCalled();
      expect(result.webSearchResults).toEqual([]);
    });

    it('should skip web search when query is missing', async () => {
      const analysis = createMockAnalysis(true, ''); // needed=true but query empty

      const result = await orchestrator.prepare(analysis, mockUserId, mockConversationId);

      expect(googleSearchService.search).not.toHaveBeenCalled();
      expect(result.webSearchResults).toBeUndefined();
    });

    it('should perform web search when needed and allowed', async () => {
      jest.mocked(googleSearchService.search).mockResolvedValue(mockSearchResults);
      const analysis = createMockAnalysis(true, 'playwright vs selenium');

      const result = await orchestrator.prepare(analysis, mockUserId, mockConversationId);

      expect(googleSearchService.isAvailable).toHaveBeenCalled();
      expect(searchRateLimiter.checkRateLimit).toHaveBeenCalled();
      expect(googleSearchService.search).toHaveBeenCalledWith('playwright vs selenium', 5);
      expect(searchRateLimiter.trackUsage).toHaveBeenCalledWith(
        mockUserId,
        'playwright vs selenium',
        3
      );
      expect(result.webSearchResults).toEqual(mockSearchResults);
    });

    it('should handle rate limit exceeded', async () => {
      jest.mocked(searchRateLimiter.checkRateLimit).mockResolvedValue({
        allowed: false,
        dailyRemaining: 0,
        message: 'Global daily search limit reached',
      });
      const analysis = createMockAnalysis(true, 'test query');

      const result = await orchestrator.prepare(analysis, mockUserId, mockConversationId);

      expect(searchRateLimiter.checkRateLimit).toHaveBeenCalled();
      expect(googleSearchService.search).not.toHaveBeenCalled();
      expect(result.rateLimitError).toBe('Global daily search limit reached');
      expect(result.webSearchResults).toBeUndefined();
    });

    it('should handle search errors gracefully', async () => {
      jest.mocked(googleSearchService.search).mockRejectedValue(
        new Error('API error')
      );
      const analysis = createMockAnalysis(true, 'test query');

      const result = await orchestrator.prepare(analysis, mockUserId, mockConversationId);

      // Should not crash, but return empty results
      expect(result.webSearchResults).toEqual([]);
    });

    it('should not track usage on search failure', async () => {
      jest.mocked(googleSearchService.search).mockRejectedValue(
        new Error('API error')
      );
      const analysis = createMockAnalysis(true, 'test query');

      await orchestrator.prepare(analysis, mockUserId, mockConversationId);

      // trackUsage should not be called when search fails
      expect(searchRateLimiter.trackUsage).not.toHaveBeenCalled();
    });

    it('should include web search results in context', async () => {
      jest.mocked(googleSearchService.search).mockResolvedValue(mockSearchResults);
      jest.mocked(googleSearchService.formatResultsForAI).mockReturnValue(
        '**Web Search Results:**\n1. Playwright...'
      );
      const analysis = createMockAnalysis(true, 'playwright vs selenium');

      const result = await orchestrator.prepare(analysis, mockUserId, mockConversationId);

      expect(result.context).toContain('**Web Search Results:**');
      expect(googleSearchService.formatResultsForAI).toHaveBeenCalledWith(
        mockSearchResults,
        'playwright vs selenium'
      );
    });
  });

  describe('formatSourceCitations', () => {
    it('should format citations for user', () => {
      jest.mocked(googleSearchService.formatResultsForUser).mockReturnValue(
        '**Sources:**\n1. [Link](url)'
      );

      const citations = orchestrator.formatSourceCitations(mockSearchResults);

      expect(googleSearchService.formatResultsForUser).toHaveBeenCalledWith(mockSearchResults);
      expect(citations).toBe('**Sources:**\n1. [Link](url)');
    });

    it('should return empty string for no results', () => {
      jest.mocked(googleSearchService.formatResultsForUser).mockReturnValue('');

      const citations = orchestrator.formatSourceCitations([]);

      expect(citations).toBe('');
    });

    it('should return empty string for undefined results', () => {
      const citations = orchestrator.formatSourceCitations(undefined);

      expect(citations).toBe('');
    });
  });

  describe('Web Search Priority - Optimization', () => {
    it('should check service availability BEFORE rate limiter', async () => {
      const callOrder: string[] = [];

      jest.mocked(googleSearchService.isAvailable).mockImplementation(() => {
        callOrder.push('isAvailable');
        return false;
      });

      jest.mocked(searchRateLimiter.checkRateLimit).mockImplementation(async () => {
        callOrder.push('checkRateLimit');
        return { allowed: true, dailyRemaining: 50 };
      });

      const analysis = createMockAnalysis(true, 'test query');
      await orchestrator.prepare(analysis, mockUserId, mockConversationId);

      // Verify isAvailable was called first, and checkRateLimit was NOT called
      expect(callOrder).toEqual(['isAvailable']);
      expect(searchRateLimiter.checkRateLimit).not.toHaveBeenCalled();
    });

    it('should avoid Firestore query when web search is disabled', async () => {
      jest.mocked(googleSearchService.isAvailable).mockReturnValue(false);
      const analysis = createMockAnalysis(true, 'test query');

      await orchestrator.prepare(analysis, mockUserId, mockConversationId);

      // Rate limiter should not be called, avoiding Firestore overhead
      expect(searchRateLimiter.checkRateLimit).not.toHaveBeenCalled();
    });
  });

  describe('Model Selection', () => {
    it('should select image model when image generation is needed', async () => {
      const analysis = createMockAnalysis(false);
      analysis.actions.image_generation.needed = true;

      const result = await orchestrator.prepare(analysis, mockUserId, mockConversationId);

      expect(result.modelName).toContain('image'); // Should use IMAGE model
    });

    it('should select main model by default', async () => {
      const analysis = createMockAnalysis(false);

      const result = await orchestrator.prepare(analysis, mockUserId, mockConversationId);

      expect(result.modelName).not.toContain('image'); // Should use MAIN model
    });
  });
});
