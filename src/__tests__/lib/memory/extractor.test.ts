/**
 * Unit Tests: Memory Extractor Functions
 * Tests memory extraction from conversations
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  shouldExtractMemory,
  processConversationMemory,
} from '@/lib/memory/extractor';
import { MemoryCategory, MemoryTier, LanguagePreference } from '@/types/memory';
import { TEST_USER_IDS } from '@/__tests__/fixtures/memory-facts';

// Mock dependencies
jest.mock('@/lib/gemini', () => ({
  getGeminiModel: jest.fn(() => ({
    generateContent: jest.fn(),
  })),
}));

jest.mock('@/lib/firebase-admin', () => ({
  db: {
    collection: jest.fn(),
  },
  COLLECTIONS: {
    CONVERSATIONS: 'conversations',
    MESSAGES: 'messages',
    USERS: 'users',
  },
}));

jest.mock('@/lib/memory/storage', () => ({
  generateMemoryId: jest.fn(() => 'mock-id-' + Math.random()),
  calculateExpiry: jest.fn((tier: any) => {
    if (tier === 'core') return null;
    if (tier === 'important') return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }),
  addMemoryFacts: jest.fn(),
  getUserMemory: jest.fn(),
  saveUserMemory: jest.fn(),
}));

describe('Memory Extractor Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== TC-EXT-001: shouldExtractMemory ====================
  describe('shouldExtractMemory', () => {
    it('TC-EXT-001: should return true for long conversations', () => {
      const messageCount = 10;
      const durationMs = 5 * 60 * 1000; // 5 minutes

      const result = shouldExtractMemory(messageCount, durationMs);

      expect(result).toBe(true);
    });

    it('TC-EXT-002: should return false for short conversations', () => {
      const messageCount = 3; // Less than 5
      const durationMs = 5 * 60 * 1000;

      const result = shouldExtractMemory(messageCount, durationMs);

      expect(result).toBe(false);
    });

    it('TC-EXT-003: should return false for brief conversations', () => {
      const messageCount = 10;
      const durationMs = 1 * 60 * 1000; // Less than 2 minutes

      const result = shouldExtractMemory(messageCount, durationMs);

      expect(result).toBe(false);
    });

    it('TC-EXT-004: should return true at exactly the threshold', () => {
      const messageCount = 5; // Exactly 5
      const durationMs = 2 * 60 * 1000; // Exactly 2 minutes

      const result = shouldExtractMemory(messageCount, durationMs);

      expect(result).toBe(true);
    });
  });

  // ==================== TC-EXT-005: parseExtractionResult (tested via processConversationMemory) ====================
  describe('processConversationMemory', () => {
    let mockDb: any;
    let mockGemini: any;
    let mockStorage: any;

    beforeEach(() => {
      // Set up Firebase mock
      const firebase = require('@/lib/firebase-admin');
      mockDb = firebase.db;

      // Set up Gemini mock
      const gemini = require('@/lib/gemini');
      mockGemini = gemini.getGeminiModel;

      // Set up storage mocks
      mockStorage = require('@/lib/memory/storage');
    });

    it('TC-EXT-005: should return 0 for non-existent conversation', async () => {
      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn(async () => ({ exists: false })),
        })),
      });

      const result = await processConversationMemory('fake-id', TEST_USER_IDS.ARCHER);

      expect(result).toBe(0);
    });

    it('TC-EXT-006: should extract facts from valid conversation', async () => {
      // Mock conversation data
      const mockConversationDoc = {
        exists: true,
        data: () => ({
          created_at: { toDate: () => new Date('2025-01-01T00:00:00Z') },
          updated_at: { toDate: () => new Date('2025-01-01T00:10:00Z') }, // 10 min later
        }),
      };

      // Mock messages
      const mockMessages = [
        { role: 'user', content: 'My name is Archer' },
        { role: 'assistant', content: 'Nice to meet you, Archer!' },
        { role: 'user', content: 'I love TypeScript' },
        { role: 'assistant', content: 'TypeScript is great!' },
        { role: 'user', content: 'I prefer using dark mode' },
        { role: 'assistant', content: 'Dark mode is easier on the eyes' },
      ];

      // Mock Gemini response
      const mockGeminiResponse = {
        response: {
          text: () => JSON.stringify({
            facts: [
              {
                content: 'Name is Archer',
                category: 'profile',
                tier: 'core',
                confidence: 1.0,
              },
              {
                content: 'Loves TypeScript',
                category: 'preference',
                tier: 'important',
                confidence: 0.9,
              },
            ],
            language_preference: 'english',
          }),
        },
      };

      // Set up mocks
      let collectionPath = '';
      let docPath = '';

      mockDb.collection.mockImplementation((path: string) => {
        collectionPath = path;
        return {
          doc: jest.fn((id: string) => {
            docPath = id;

            // Conversation doc
            if (collectionPath === 'conversations' && docPath) {
              return {
                get: jest.fn(async () => mockConversationDoc),
                collection: jest.fn((subCollection: string) => {
                  // Messages subcollection
                  if (subCollection === 'messages') {
                    return {
                      orderBy: jest.fn(() => ({
                        get: jest.fn(async () => ({
                          docs: mockMessages.map(m => ({ data: () => m })),
                          size: mockMessages.length,
                        })),
                      })),
                      get: jest.fn(async () => ({
                        size: mockMessages.length,
                      })),
                    };
                  }
                  return {};
                }),
              };
            }
            return {};
          }),
        };
      });

      mockGemini.mockReturnValue({
        generateContent: jest.fn(async () => mockGeminiResponse),
      });

      mockStorage.getUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: [],
        stats: { total_facts: 0, token_usage: 0, last_cleanup: new Date() },
        updated_at: new Date(),
      });

      // Execute
      const result = await processConversationMemory(
        'conv-123',
        TEST_USER_IDS.ARCHER,
        'Remember this about me' // Keyword trigger
      );

      expect(result).toBe(2);
      expect(mockStorage.addMemoryFacts).toHaveBeenCalled();
      expect(mockStorage.saveUserMemory).toHaveBeenCalledWith(
        TEST_USER_IDS.ARCHER,
        expect.any(Array),
        'english'
      );
    });

    it('TC-EXT-007: should handle Gemini response with markdown code blocks', async () => {
      // Mock conversation
      const mockConversationDoc = {
        exists: true,
        data: () => ({
          created_at: { toDate: () => new Date('2025-01-01T00:00:00Z') },
          updated_at: { toDate: () => new Date('2025-01-01T00:10:00Z') },
        }),
      };

      const mockMessages = [
        { role: 'user', content: 'I work at Google' },
        { role: 'assistant', content: 'That sounds interesting!' },
        { role: 'user', content: 'Yes, I am a software engineer' },
      ];

      // Gemini response with markdown code block
      const mockGeminiResponse = {
        response: {
          text: () => `\`\`\`json
{
  "facts": [
    {
      "content": "Works at Google as a software engineer",
      "category": "profile",
      "tier": "core",
      "confidence": 0.95
    }
  ],
  "language_preference": null
}
\`\`\``,
        },
      };

      // Set up mocks
      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn(async () => mockConversationDoc),
          collection: jest.fn(() => ({
            orderBy: jest.fn(() => ({
              get: jest.fn(async () => ({
                docs: mockMessages.map(m => ({ data: () => m })),
                size: mockMessages.length,
              })),
            })),
            get: jest.fn(async () => ({ size: mockMessages.length })),
          })),
        })),
      });

      mockGemini.mockReturnValue({
        generateContent: jest.fn(async () => mockGeminiResponse),
      });

      mockStorage.getUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: [],
        stats: { total_facts: 0, token_usage: 0, last_cleanup: new Date() },
        updated_at: new Date(),
      });

      const result = await processConversationMemory(
        'conv-123',
        TEST_USER_IDS.ARCHER,
        'Remember this'
      );

      expect(result).toBe(1);
    });

    it('TC-EXT-008: should filter out low confidence facts', async () => {
      const mockConversationDoc = {
        exists: true,
        data: () => ({
          created_at: { toDate: () => new Date('2025-01-01T00:00:00Z') },
          updated_at: { toDate: () => new Date('2025-01-01T00:10:00Z') },
        }),
      };

      const mockMessages = [
        { role: 'user', content: 'Maybe I like Python?' },
        { role: 'assistant', content: 'Python is popular' },
      ];

      // Response with low confidence fact (should be filtered)
      const mockGeminiResponse = {
        response: {
          text: () => JSON.stringify({
            facts: [
              {
                content: 'Might like Python',
                category: 'preference',
                tier: 'important',
                confidence: 0.5, // Below 0.6 threshold
              },
            ],
            language_preference: null,
          }),
        },
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn(async () => mockConversationDoc),
          collection: jest.fn(() => ({
            orderBy: jest.fn(() => ({
              get: jest.fn(async () => ({
                docs: mockMessages.map(m => ({ data: () => m })),
                size: mockMessages.length,
              })),
            })),
            get: jest.fn(async () => ({ size: mockMessages.length })),
          })),
        })),
      });

      mockGemini.mockReturnValue({
        generateContent: jest.fn(async () => mockGeminiResponse),
      });

      mockStorage.getUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: [],
        stats: { total_facts: 0, token_usage: 0, last_cleanup: new Date() },
        updated_at: new Date(),
      });

      const result = await processConversationMemory(
        'conv-123',
        TEST_USER_IDS.ARCHER,
        'Remember this'
      );

      // Should be 0 because fact is filtered out (confidence < 0.6)
      expect(result).toBe(0);
    });

    it('TC-EXT-009: should handle invalid JSON gracefully', async () => {
      const mockConversationDoc = {
        exists: true,
        data: () => ({
          created_at: { toDate: () => new Date('2025-01-01T00:00:00Z') },
          updated_at: { toDate: () => new Date('2025-01-01T00:10:00Z') },
        }),
      };

      const mockMessages = [
        { role: 'user', content: 'Test message' },
      ];

      // Invalid JSON response
      const mockGeminiResponse = {
        response: {
          text: () => 'This is not valid JSON',
        },
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn(async () => mockConversationDoc),
          collection: jest.fn(() => ({
            orderBy: jest.fn(() => ({
              get: jest.fn(async () => ({
                docs: mockMessages.map(m => ({ data: () => m })),
                size: mockMessages.length,
              })),
            })),
            get: jest.fn(async () => ({ size: mockMessages.length })),
          })),
        })),
      });

      mockGemini.mockReturnValue({
        generateContent: jest.fn(async () => mockGeminiResponse),
      });

      const result = await processConversationMemory(
        'conv-123',
        TEST_USER_IDS.ARCHER,
        'Remember this'
      );

      // Should handle error gracefully
      expect(result).toBe(0);
    });

    it('TC-EXT-010: should update language preference when detected', async () => {
      const mockConversationDoc = {
        exists: true,
        data: () => ({
          created_at: { toDate: () => new Date('2025-01-01T00:00:00Z') },
          updated_at: { toDate: () => new Date('2025-01-01T00:10:00Z') },
        }),
      };

      const mockMessages = [
        { role: 'user', content: '我喜欢用中文' },
        { role: 'assistant', content: '好的！' },
      ];

      const mockGeminiResponse = {
        response: {
          text: () => JSON.stringify({
            facts: [],
            language_preference: 'chinese',
          }),
        },
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn(async () => mockConversationDoc),
          collection: jest.fn(() => ({
            orderBy: jest.fn(() => ({
              get: jest.fn(async () => ({
                docs: mockMessages.map(m => ({ data: () => m })),
                size: mockMessages.length,
              })),
            })),
            get: jest.fn(async () => ({ size: mockMessages.length })),
          })),
        })),
      });

      mockGemini.mockReturnValue({
        generateContent: jest.fn(async () => mockGeminiResponse),
      });

      mockStorage.getUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: [],
        stats: { total_facts: 0, token_usage: 0, last_cleanup: new Date() },
        updated_at: new Date(),
      });

      await processConversationMemory(
        'conv-123',
        TEST_USER_IDS.ARCHER,
        'Remember this'
      );

      // Should update language preference
      expect(mockStorage.saveUserMemory).toHaveBeenCalledWith(
        TEST_USER_IDS.ARCHER,
        expect.any(Array),
        'chinese'
      );
    });

    it('TC-EXT-011: should remove old language preference facts when updating', async () => {
      const mockConversationDoc = {
        exists: true,
        data: () => ({
          created_at: { toDate: () => new Date('2025-01-01T00:00:00Z') },
          updated_at: { toDate: () => new Date('2025-01-01T00:10:00Z') },
        }),
      };

      const mockMessages = [
        { role: 'user', content: 'Please use English' },
      ];

      const mockGeminiResponse = {
        response: {
          text: () => JSON.stringify({
            facts: [],
            language_preference: 'english',
          }),
        },
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn(async () => mockConversationDoc),
          collection: jest.fn(() => ({
            orderBy: jest.fn(() => ({
              get: jest.fn(async () => ({
                docs: mockMessages.map(m => ({ data: () => m })),
                size: mockMessages.length,
              })),
            })),
            get: jest.fn(async () => ({ size: mockMessages.length })),
          })),
        })),
      });

      mockGemini.mockReturnValue({
        generateContent: jest.fn(async () => mockGeminiResponse),
      });

      // User has old language-related facts
      mockStorage.getUserMemory.mockResolvedValue({
        user_id: TEST_USER_IDS.ARCHER,
        facts: [
          {
            id: 'fact-1',
            content: 'Prefers communicating in Chinese', // Should be removed
            category: 'preference',
            tier: 'core',
            confidence: 0.9,
            created_at: new Date(),
            last_used_at: new Date(),
            use_count: 5,
            expires_at: null,
            auto_extracted: true,
          },
          {
            id: 'fact-2',
            content: 'Likes TypeScript', // Should be kept
            category: 'preference',
            tier: 'important',
            confidence: 0.9,
            created_at: new Date(),
            last_used_at: new Date(),
            use_count: 3,
            expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            auto_extracted: true,
          },
        ],
        stats: { total_facts: 2, token_usage: 20, last_cleanup: new Date() },
        updated_at: new Date(),
        language_preference: 'chinese',
      });

      await processConversationMemory(
        'conv-123',
        TEST_USER_IDS.ARCHER,
        'Remember this'
      );

      // Should have saved with only 1 fact (removed language-related fact)
      const savedFacts = mockStorage.saveUserMemory.mock.calls[0][1];
      expect(savedFacts).toHaveLength(1);
      expect(savedFacts[0].id).toBe('fact-2'); // Kept TypeScript fact
    });
  });
});
