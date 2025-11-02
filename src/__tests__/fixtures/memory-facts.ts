/**
 * Test Fixtures: Memory Facts
 *
 * Pre-defined test data for memory system tests
 */

import { MemoryFact, MemoryTier, MemoryCategory, UserMemory } from '@/types/memory';

export const TEST_USER_IDS = {
  ARCHER: 'test-user-archer-001',
  ALICE: 'test-user-alice-002',
  BOB: 'test-user-bob-003',
};

// Core tier facts
export const coreFact1: MemoryFact = {
  id: 'fact-core-001',
  content: 'Name is Archer',
  category: 'profile' as MemoryCategory,
  tier: 'core' as MemoryTier,
  confidence: 1.0,
  created_at: new Date('2025-01-01T00:00:00Z'),
  last_used_at: new Date('2025-01-01T00:00:00Z'),
  use_count: 5,
  expires_at: null, // CORE never expires
  auto_extracted: true,
  keywords: ['name', 'archer'],
  source: 'AI analysis',
};

export const coreFact2: MemoryFact = {
  id: 'fact-core-002',
  content: 'Birthday is June 5th',
  category: 'profile' as MemoryCategory,
  tier: 'core' as MemoryTier,
  confidence: 0.98,
  created_at: new Date('2025-01-02T00:00:00Z'),
  last_used_at: new Date('2025-01-02T00:00:00Z'),
  use_count: 2,
  expires_at: null,
  auto_extracted: false,
  keywords: ['birthday', 'june'],
  source: 'User explicitly stated',
};

// Important tier facts
export const importantFact1: MemoryFact = {
  id: 'fact-important-001',
  content: 'Prefers dark mode',
  category: 'preference' as MemoryCategory,
  tier: 'important' as MemoryTier,
  confidence: 0.9,
  created_at: new Date('2025-01-03T00:00:00Z'),
  last_used_at: new Date('2025-01-03T00:00:00Z'),
  use_count: 10,
  expires_at: new Date('2025-04-03T00:00:00Z'), // 90 days
  auto_extracted: true,
  keywords: ['dark', 'mode', 'preference'],
  source: 'AI analysis',
};

export const importantFact2: MemoryFact = {
  id: 'fact-important-002',
  content: 'Loves TypeScript',
  category: 'preference' as MemoryCategory,
  tier: 'important' as MemoryTier,
  confidence: 0.85,
  created_at: new Date('2025-01-04T00:00:00Z'),
  last_used_at: new Date('2025-01-04T00:00:00Z'),
  use_count: 3,
  expires_at: new Date('2025-04-04T00:00:00Z'),
  auto_extracted: true,
  keywords: ['typescript', 'programming'],
  source: 'AI analysis',
};

// Context tier facts
export const contextFact1: MemoryFact = {
  id: 'fact-context-001',
  content: 'Currently working on ArcherChat project',
  category: 'project' as MemoryCategory,
  tier: 'context' as MemoryTier,
  confidence: 0.8,
  created_at: new Date('2025-01-05T00:00:00Z'),
  last_used_at: new Date('2025-01-05T00:00:00Z'),
  use_count: 15,
  expires_at: new Date('2025-02-04T00:00:00Z'), // 30 days
  auto_extracted: true,
  keywords: ['archerchat', 'project'],
  source: 'AI analysis',
};

export const contextFact2: MemoryFact = {
  id: 'fact-context-002',
  content: 'Learning Next.js',
  category: 'technical' as MemoryCategory,
  tier: 'context' as MemoryTier,
  confidence: 0.75,
  created_at: new Date('2025-01-06T00:00:00Z'),
  last_used_at: new Date('2025-01-06T00:00:00Z'),
  use_count: 1,
  expires_at: new Date('2025-02-05T00:00:00Z'),
  auto_extracted: true,
  keywords: ['nextjs', 'learning'],
  source: 'AI analysis',
};

// Expired fact (for cleanup tests)
export const expiredFact: MemoryFact = {
  id: 'fact-expired-001',
  content: 'Was interested in Vue.js (expired)',
  category: 'technical' as MemoryCategory,
  tier: 'context' as MemoryTier,
  confidence: 0.7,
  created_at: new Date('2024-11-01T00:00:00Z'),
  last_used_at: new Date('2024-11-01T00:00:00Z'),
  use_count: 0,
  expires_at: new Date('2024-12-01T00:00:00Z'), // Expired
  auto_extracted: true,
  keywords: ['vue', 'vuejs'],
  source: 'AI analysis',
};

// Complete UserMemory objects
export const emptyUserMemory: UserMemory = {
  user_id: TEST_USER_IDS.ARCHER,
  facts: [],
  stats: {
    total_facts: 0,
    token_usage: 0,
    last_cleanup: new Date('2025-01-01T00:00:00Z'),
  },
  updated_at: new Date('2025-01-01T00:00:00Z'),
};

export const sampleUserMemory: UserMemory = {
  user_id: TEST_USER_IDS.ARCHER,
  facts: [coreFact1, coreFact2, importantFact1, contextFact1],
  stats: {
    total_facts: 4,
    token_usage: 50, // Rough estimate
    last_cleanup: new Date('2025-01-01T00:00:00Z'),
  },
  updated_at: new Date('2025-01-06T00:00:00Z'),
  language_preference: 'english',
};

export const fullUserMemory: UserMemory = {
  user_id: TEST_USER_IDS.ALICE,
  facts: [
    coreFact1,
    coreFact2,
    importantFact1,
    importantFact2,
    contextFact1,
    contextFact2,
  ],
  stats: {
    total_facts: 6,
    token_usage: 100,
    last_cleanup: new Date('2025-01-01T00:00:00Z'),
  },
  updated_at: new Date('2025-01-06T00:00:00Z'),
  language_preference: 'hybrid',
};

// Helper functions for creating test facts
export function createMockFact(overrides: Partial<MemoryFact> = {}): MemoryFact {
  return {
    id: 'mock-fact-' + Math.random().toString(36).substr(2, 9),
    content: 'Mock fact content',
    category: 'preference' as MemoryCategory,
    tier: 'important' as MemoryTier,
    confidence: 0.8,
    created_at: new Date(),
    last_used_at: new Date(),
    use_count: 0,
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    auto_extracted: true,
    keywords: ['mock'],
    source: 'test',
    ...overrides,
  };
}
