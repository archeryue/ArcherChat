/**
 * Unit Tests: Memory Cleanup Functions
 * Tests cleanup logic including expiration, tier limits, and token budgets
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock UUID before other imports
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-' + Math.random().toString(36).substr(2, 9)),
}));
import {
  cleanupUserMemory,
  sortByImportance,
  calculateImportanceScore,
} from '@/lib/memory/cleanup';
import { MemoryTier, MemoryCategory, MEMORY_LIMITS } from '@/types/memory';
import {
  TEST_USER_IDS,
  coreFact1,
  coreFact2,
  importantFact1,
  contextFact1,
  expiredFact,
  createMockFact,
} from '@/__tests__/fixtures/memory-facts';

// Mock storage functions
jest.mock('@/lib/memory/storage', () => {
  const actual = jest.requireActual('@/lib/memory/storage');
  return {
    getUserMemory: jest.fn(),
    saveUserMemory: jest.fn(),
    // Use actual implementations for helper functions
    estimateTokenUsage: actual.estimateTokenUsage,
    daysBetween: actual.daysBetween,
  };
});

describe('Memory Cleanup Functions', () => {
  let mockGetUserMemory: jest.Mock;
  let mockSaveUserMemory: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    const storage = require('@/lib/memory/storage');
    mockGetUserMemory = storage.getUserMemory as jest.Mock;
    mockSaveUserMemory = storage.saveUserMemory as jest.Mock;
  });

  // ==================== TC-CLN-001: Remove Expired Facts ====================
  describe('cleanupUserMemory - Remove Expired', () => {
    it('TC-CLN-001: should remove expired facts', async () => {
      mockGetUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: [coreFact1, expiredFact],
        stats: {
          total_facts: 2,
          token_usage: 20,
          last_cleanup: new Date(),
        },
        updated_at: new Date(),
      });

      await cleanupUserMemory(TEST_USER_IDS.ARCHER);

      // Should have called saveUserMemory with only non-expired facts
      expect(mockSaveUserMemory).toHaveBeenCalledWith(
        TEST_USER_IDS.ARCHER,
        expect.arrayContaining([
          expect.objectContaining({ id: coreFact1.id }),
        ]),
        undefined
      );

      const savedFacts = mockSaveUserMemory.mock.calls[0][1];
      expect(savedFacts).toHaveLength(1);
      expect(savedFacts.find((f: any) => f.id === expiredFact.id)).toBeUndefined();
    });

    it('TC-CLN-001b: should preserve CORE facts (no expiry)', async () => {
      mockGetUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: [coreFact1, coreFact2],
        stats: {
          total_facts: 2,
          token_usage: 20,
          last_cleanup: new Date(),
        },
        updated_at: new Date(),
      });

      await cleanupUserMemory(TEST_USER_IDS.ARCHER);

      const savedFacts = mockSaveUserMemory.mock.calls[0][1];
      expect(savedFacts).toHaveLength(2); // Both CORE facts preserved
    });
  });

  // ==================== TC-CLN-002: Enforce Tier Limits ====================
  describe('cleanupUserMemory - Tier Limits', () => {
    it('TC-CLN-002: should enforce max facts per tier', async () => {
      // Create more facts than the tier limit
      const manyImportantFacts = Array.from({ length: 60 }, (_, i) =>
        createMockFact({
          id: `important-${i}`,
          tier: MemoryTier.IMPORTANT,
          confidence: 0.8 + (i / 100), // Varying confidence
          use_count: i,
        })
      );

      mockGetUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: manyImportantFacts,
        stats: {
          total_facts: 60,
          token_usage: 300,
          last_cleanup: new Date(),
        },
        updated_at: new Date(),
      });

      await cleanupUserMemory(TEST_USER_IDS.ARCHER);

      const savedFacts = mockSaveUserMemory.mock.calls[0][1];
      // Should be capped at IMPORTANT tier limit (50)
      expect(savedFacts.length).toBeLessThanOrEqual(
        MEMORY_LIMITS[MemoryTier.IMPORTANT].max_facts
      );
    });

    it('TC-CLN-002b: should keep most important facts when trimming', async () => {
      const highConfidenceFact = createMockFact({
        id: 'high-confidence',
        tier: MemoryTier.IMPORTANT,
        confidence: 0.95,
        use_count: 10,
      });

      const lowConfidenceFact = createMockFact({
        id: 'low-confidence',
        tier: MemoryTier.IMPORTANT,
        confidence: 0.65,
        use_count: 0,
      });

      // Create 49 more facts to reach limit
      const fillerFacts = Array.from({ length: 49 }, (_, i) =>
        createMockFact({
          id: `filler-${i}`,
          tier: MemoryTier.IMPORTANT,
          confidence: 0.75,
          use_count: 1,
        })
      );

      mockGetUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: [highConfidenceFact, lowConfidenceFact, ...fillerFacts],
        stats: {
          total_facts: 51,
          token_usage: 300,
          last_cleanup: new Date(),
        },
        updated_at: new Date(),
      });

      await cleanupUserMemory(TEST_USER_IDS.ARCHER);

      const savedFacts = mockSaveUserMemory.mock.calls[0][1];
      const savedIds = savedFacts.map((f: any) => f.id);

      // High confidence fact should be kept
      expect(savedIds).toContain(highConfidenceFact.id);
      // Low confidence fact might be trimmed
      // (depends on importance score calculation)
    });
  });

  // ==================== TC-CLN-003: Enforce Token Budget ====================
  describe('cleanupUserMemory - Token Budget', () => {
    it('TC-CLN-003: should enforce token budget', async () => {
      // Create facts that exceed token budget
      const largeFacts = Array.from({ length: 20 }, (_, i) =>
        createMockFact({
          id: `large-${i}`,
          content: 'a'.repeat(2000), // ~500 tokens each = 10,000 total
          tier: MemoryTier.IMPORTANT,
          confidence: 0.8,
          use_count: i,
        })
      );

      mockGetUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: largeFacts,
        stats: {
          total_facts: 20,
          token_usage: 10000,
          last_cleanup: new Date(),
        },
        updated_at: new Date(),
      });

      await cleanupUserMemory(TEST_USER_IDS.ARCHER);

      const savedFacts = mockSaveUserMemory.mock.calls[0][1];
      const storage = require('@/lib/memory/storage');
      const totalTokens = storage.estimateTokenUsage(savedFacts);

      // Should be under budget
      expect(totalTokens).toBeLessThanOrEqual(MEMORY_LIMITS.max_total_tokens);
    });

    it('TC-CLN-003b: should always keep CORE facts even if over budget', async () => {
      const coreFact = createMockFact({
        id: 'core-1',
        content: 'a'.repeat(20000), // Huge CORE fact
        tier: MemoryTier.CORE,
        confidence: 1.0,
        use_count: 100,
      });

      mockGetUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: [coreFact],
        stats: {
          total_facts: 1,
          token_usage: 5000,
          last_cleanup: new Date(),
        },
        updated_at: new Date(),
      });

      await cleanupUserMemory(TEST_USER_IDS.ARCHER);

      const savedFacts = mockSaveUserMemory.mock.calls[0][1];
      // CORE fact should be preserved even if it exceeds budget
      expect(savedFacts).toHaveLength(1);
      expect(savedFacts[0].id).toBe(coreFact.id);
    });
  });

  // ==================== TC-CLN-004: Preserve Language Preference ====================
  describe('cleanupUserMemory - Language Preference', () => {
    it('TC-CLN-004: should preserve language preference during cleanup', async () => {
      mockGetUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: [coreFact1, expiredFact],
        stats: {
          total_facts: 2,
          token_usage: 20,
          last_cleanup: new Date(),
        },
        updated_at: new Date(),
        language_preference: 'hybrid',
      });

      await cleanupUserMemory(TEST_USER_IDS.ARCHER);

      // Should preserve language preference
      expect(mockSaveUserMemory).toHaveBeenCalledWith(
        TEST_USER_IDS.ARCHER,
        expect.any(Array),
        'hybrid'
      );
    });
  });

  // ==================== TC-CLN-005: sortByImportance ====================
  describe('sortByImportance', () => {
    it('TC-CLN-005: should sort facts by importance score', () => {
      const highImportance = createMockFact({
        id: 'high',
        confidence: 0.95,
        use_count: 10,
        created_at: new Date(), // Recent
      });

      const lowImportance = createMockFact({
        id: 'low',
        confidence: 0.65,
        use_count: 0,
        created_at: new Date('2024-01-01'), // Old
      });

      const facts = [lowImportance, highImportance];
      const sorted = sortByImportance(facts);

      expect(sorted[0].id).toBe(highImportance.id);
      expect(sorted[1].id).toBe(lowImportance.id);
    });

    it('TC-CLN-005b: should not mutate original array', () => {
      const original = [coreFact1, importantFact1];
      const originalCopy = [...original];

      sortByImportance(original);

      expect(original).toEqual(originalCopy);
    });
  });

  // ==================== TC-CLN-006: calculateImportanceScore ====================
  describe('calculateImportanceScore', () => {
    it('TC-CLN-006: should calculate importance score correctly', () => {
      const fact = createMockFact({
        confidence: 0.9, // 36 points (40% weight)
        use_count: 5, // 15 points (30% weight, capped at 30)
        created_at: new Date(), // ~30 points (30% weight, recent)
      });

      const score = calculateImportanceScore(fact);

      // Should be around 81 (36 + 30 + 15)
      expect(score).toBeGreaterThan(70);
      expect(score).toBeLessThan(100);
    });

    it('TC-CLN-006b: should give higher score to high confidence facts', () => {
      const highConfidence = createMockFact({
        confidence: 0.95,
        use_count: 5,
        created_at: new Date(),
      });

      const lowConfidence = createMockFact({
        confidence: 0.65,
        use_count: 5,
        created_at: new Date(),
      });

      const scoreHigh = calculateImportanceScore(highConfidence);
      const scoreLow = calculateImportanceScore(lowConfidence);

      expect(scoreHigh).toBeGreaterThan(scoreLow);
    });

    it('TC-CLN-006c: should give higher score to recently used facts', () => {
      const recent = createMockFact({
        confidence: 0.8,
        use_count: 5,
        created_at: new Date(),
      });

      const old = createMockFact({
        confidence: 0.8,
        use_count: 5,
        created_at: new Date('2024-01-01'),
      });

      const scoreRecent = calculateImportanceScore(recent);
      const scoreOld = calculateImportanceScore(old);

      expect(scoreRecent).toBeGreaterThan(scoreOld);
    });

    it('TC-CLN-006d: should give higher score to frequently used facts', () => {
      const frequent = createMockFact({
        confidence: 0.8,
        use_count: 10,
        created_at: new Date(),
      });

      const rare = createMockFact({
        confidence: 0.8,
        use_count: 1,
        created_at: new Date(),
      });

      const scoreFrequent = calculateImportanceScore(frequent);
      const scoreRare = calculateImportanceScore(rare);

      expect(scoreFrequent).toBeGreaterThan(scoreRare);
    });
  });

  // ==================== Edge Cases ====================
  describe('Edge Cases', () => {
    it('should handle empty memory', async () => {
      mockGetUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: [],
        stats: {
          total_facts: 0,
          token_usage: 0,
          last_cleanup: new Date(),
        },
        updated_at: new Date(),
      });

      await cleanupUserMemory(TEST_USER_IDS.ARCHER);

      expect(mockSaveUserMemory).toHaveBeenCalledWith(
        TEST_USER_IDS.ARCHER,
        [],
        undefined
      );
    });

    it('should handle facts with invalid tier', async () => {
      const invalidTierFact = createMockFact({
        tier: 'INVALID_TIER' as any,
      });

      mockGetUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: [invalidTierFact],
        stats: {
          total_facts: 1,
          token_usage: 10,
          last_cleanup: new Date(),
        },
        updated_at: new Date(),
      });

      // Should not throw
      await expect(cleanupUserMemory(TEST_USER_IDS.ARCHER)).resolves.not.toThrow();
    });
  });
});
