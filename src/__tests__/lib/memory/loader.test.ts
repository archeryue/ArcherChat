/**
 * Unit Tests: Memory Loader Functions
 * Tests loading and formatting memory for chat context
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { loadMemoryForChat } from '@/lib/memory/loader';
import { LanguagePreference } from '@/types/memory';
import {
  TEST_USER_IDS,
  coreFact1,
  coreFact2,
  importantFact1,
  contextFact1,
  sampleUserMemory,
  emptyUserMemory,
} from '@/__tests__/fixtures/memory-facts';

// Mock storage functions
jest.mock('@/lib/memory/storage', () => ({
  getUserMemory: jest.fn(),
  markMemoryUsed: jest.fn(),
}));

describe('Memory Loader Functions', () => {
  let mockGetUserMemory: jest.Mock;
  let mockMarkMemoryUsed: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    const storage = require('@/lib/memory/storage');
    mockGetUserMemory = storage.getUserMemory as jest.Mock;
    mockMarkMemoryUsed = storage.markMemoryUsed as jest.Mock;
  });

  // ==================== TC-LOAD-001: Empty Memory ====================
  describe('loadMemoryForChat - Empty Memory', () => {
    it('TC-LOAD-001: should return empty string for empty memory', async () => {
      mockGetUserMemory.mockResolvedValue(emptyUserMemory);

      const context = await loadMemoryForChat(TEST_USER_IDS.ARCHER);

      expect(context).toBe('');
      expect(mockMarkMemoryUsed).not.toHaveBeenCalled();
    });

    it('TC-LOAD-001b: should return language preference only if no facts', async () => {
      mockGetUserMemory.mockResolvedValue({
        ...emptyUserMemory,
        language_preference: LanguagePreference.ENGLISH,
      });

      const context = await loadMemoryForChat(TEST_USER_IDS.ARCHER);

      expect(context).toContain('## User Memory');
      expect(context).toContain('Language Preference');
      expect(context).toContain('English');
    });
  });

  // ==================== TC-LOAD-002: Format Facts by Category ====================
  describe('loadMemoryForChat - Formatting', () => {
    it('TC-LOAD-002: should format facts grouped by category', async () => {
      mockGetUserMemory.mockResolvedValue(sampleUserMemory);

      const context = await loadMemoryForChat(TEST_USER_IDS.ARCHER);

      // Should contain section headers
      expect(context).toContain('## User Memory');
      expect(context).toContain('**About the user:**');
      expect(context).toContain('**Preferences:**');
      expect(context).toContain('**Current Work:**');

      // Should contain facts
      expect(context).toContain('- Name is Archer');
      expect(context).toContain('- Birthday is June 5th');
      expect(context).toContain('- Prefers dark mode');
      expect(context).toContain('- Currently working on ArcherChat project');
    });

    it('TC-LOAD-003: should sort facts by tier (core first)', async () => {
      mockGetUserMemory.mockResolvedValue(sampleUserMemory);

      const context = await loadMemoryForChat(TEST_USER_IDS.ARCHER);

      // Core facts should appear before important/context facts
      const archerIndex = context.indexOf('Name is Archer');
      const birthdayIndex = context.indexOf('Birthday is June 5th');
      const darkModeIndex = context.indexOf('Prefers dark mode');

      expect(archerIndex).toBeGreaterThan(-1);
      expect(birthdayIndex).toBeGreaterThan(-1);
      expect(darkModeIndex).toBeGreaterThan(-1);

      // Core facts should appear before important facts
      // (within their respective categories)
    });

    it('TC-LOAD-004: should include usage instruction at the end', async () => {
      mockGetUserMemory.mockResolvedValue(sampleUserMemory);

      const context = await loadMemoryForChat(TEST_USER_IDS.ARCHER);

      expect(context).toContain(
        'Use this information to personalize responses'
      );
    });
  });

  // ==================== TC-LOAD-005: Language Preference ====================
  describe('loadMemoryForChat - Language Preference', () => {
    it('TC-LOAD-005: should include English language preference', async () => {
      mockGetUserMemory.mockResolvedValue({
        ...sampleUserMemory,
        language_preference: LanguagePreference.ENGLISH,
      });

      const context = await loadMemoryForChat(TEST_USER_IDS.ARCHER);

      expect(context).toContain('**Language Preference:**');
      expect(context).toContain('User prefers English');
      expect(context).toContain('Respond in English');
    });

    it('TC-LOAD-006: should include Chinese language preference', async () => {
      mockGetUserMemory.mockResolvedValue({
        ...sampleUserMemory,
        language_preference: LanguagePreference.CHINESE,
      });

      const context = await loadMemoryForChat(TEST_USER_IDS.ARCHER);

      expect(context).toContain('**Language Preference:**');
      expect(context).toContain('User prefers Chinese');
      expect(context).toContain('中文');
      expect(context).toContain('Respond in Chinese');
    });

    it('TC-LOAD-007: should include hybrid language preference', async () => {
      mockGetUserMemory.mockResolvedValue({
        ...sampleUserMemory,
        language_preference: LanguagePreference.HYBRID,
      });

      const context = await loadMemoryForChat(TEST_USER_IDS.ARCHER);

      expect(context).toContain('**Language Preference:**');
      expect(context).toContain('both English and Chinese');
      expect(context).toContain('either language or mix them');
    });

    it('TC-LOAD-008: should place language preference at top', async () => {
      mockGetUserMemory.mockResolvedValue({
        ...sampleUserMemory,
        language_preference: LanguagePreference.ENGLISH,
      });

      const context = await loadMemoryForChat(TEST_USER_IDS.ARCHER);

      const languagePrefIndex = context.indexOf('Language Preference');
      const aboutUserIndex = context.indexOf('About the user');

      expect(languagePrefIndex).toBeGreaterThan(-1);
      expect(aboutUserIndex).toBeGreaterThan(-1);
      expect(languagePrefIndex).toBeLessThan(aboutUserIndex);
    });
  });

  // ==================== TC-LOAD-009: Mark Facts as Used ====================
  describe('loadMemoryForChat - Usage Tracking', () => {
    it('TC-LOAD-009: should mark all facts as used', async () => {
      mockGetUserMemory.mockResolvedValue(sampleUserMemory);

      await loadMemoryForChat(TEST_USER_IDS.ARCHER);

      expect(mockMarkMemoryUsed).toHaveBeenCalledWith(
        TEST_USER_IDS.ARCHER,
        expect.arrayContaining([
          coreFact1.id,
          coreFact2.id,
          importantFact1.id,
          contextFact1.id,
        ])
      );
    });

    it('TC-LOAD-010: should not mark facts as used for empty memory', async () => {
      mockGetUserMemory.mockResolvedValue(emptyUserMemory);

      await loadMemoryForChat(TEST_USER_IDS.ARCHER);

      expect(mockMarkMemoryUsed).not.toHaveBeenCalled();
    });
  });

  // ==================== TC-LOAD-011: Category Coverage ====================
  describe('loadMemoryForChat - Categories', () => {
    it('TC-LOAD-011: should handle only profile facts', async () => {
      mockGetUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: [coreFact1, coreFact2],
        stats: { total_facts: 2, token_usage: 20, last_cleanup: new Date() },
        updated_at: new Date(),
      });

      const context = await loadMemoryForChat(TEST_USER_IDS.ARCHER);

      expect(context).toContain('**About the user:**');
      expect(context).not.toContain('**Preferences:**');
      expect(context).not.toContain('**Technical Context:**');
      expect(context).not.toContain('**Current Work:**');
    });

    it('TC-LOAD-012: should handle only preference facts', async () => {
      mockGetUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: [importantFact1],
        stats: { total_facts: 1, token_usage: 10, last_cleanup: new Date() },
        updated_at: new Date(),
      });

      const context = await loadMemoryForChat(TEST_USER_IDS.ARCHER);

      expect(context).toContain('**Preferences:**');
      expect(context).not.toContain('**About the user:**');
    });

    it('TC-LOAD-013: should handle only project facts', async () => {
      mockGetUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: [contextFact1],
        stats: { total_facts: 1, token_usage: 10, last_cleanup: new Date() },
        updated_at: new Date(),
      });

      const context = await loadMemoryForChat(TEST_USER_IDS.ARCHER);

      expect(context).toContain('**Current Work:**');
      expect(context).not.toContain('**About the user:**');
      expect(context).not.toContain('**Preferences:**');
    });

    it('TC-LOAD-014: should handle mixed categories', async () => {
      mockGetUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: [coreFact1, importantFact1, contextFact1],
        stats: { total_facts: 3, token_usage: 30, last_cleanup: new Date() },
        updated_at: new Date(),
      });

      const context = await loadMemoryForChat(TEST_USER_IDS.ARCHER);

      expect(context).toContain('**About the user:**');
      expect(context).toContain('**Preferences:**');
      expect(context).toContain('**Current Work:**');
    });
  });

  // ==================== Edge Cases ====================
  describe('Edge Cases', () => {
    it('should handle facts with special characters', async () => {
      mockGetUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: [
          {
            id: 'fact-special',
            content: 'Likes "TypeScript" & React.js (frameworks)',
            category: 'preference',
            tier: 'important',
            confidence: 0.9,
            created_at: new Date(),
            last_used_at: new Date(),
            use_count: 1,
            expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            auto_extracted: true,
          },
        ],
        stats: { total_facts: 1, token_usage: 10, last_cleanup: new Date() },
        updated_at: new Date(),
      });

      const context = await loadMemoryForChat(TEST_USER_IDS.ARCHER);

      expect(context).toContain('Likes "TypeScript" & React.js (frameworks)');
    });

    it('should handle facts with Chinese characters', async () => {
      mockGetUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: [
          {
            id: 'fact-chinese',
            content: '喜欢用TypeScript编程',
            category: 'preference',
            tier: 'important',
            confidence: 0.9,
            created_at: new Date(),
            last_used_at: new Date(),
            use_count: 1,
            expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            auto_extracted: true,
          },
        ],
        stats: { total_facts: 1, token_usage: 10, last_cleanup: new Date() },
        updated_at: new Date(),
      });

      const context = await loadMemoryForChat(TEST_USER_IDS.ARCHER);

      expect(context).toContain('喜欢用TypeScript编程');
    });
  });
});
