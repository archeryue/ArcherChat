/**
 * Unit Tests: Memory Storage Helper Functions
 * Tests pure business logic functions that don't require Firebase I/O
 *
 * Note: CRUD operations (getUserMemory, saveUserMemory, etc.) are covered
 * by integration tests in cleanup.test.ts, extractor.test.ts, and loader.test.ts
 */

import { describe, it, expect } from '@jest/globals';

// Mock UUID (storage.ts imports this)
jest.mock('uuid', () => ({
  v4: () => 'mock-uuid',
}));
import {
  estimateTokenUsage,
  calculateExpiry,
  daysBetween,
} from '@/lib/memory/storage';
import { MemoryTier } from '@/types/memory';
import { createMockFact } from '@/__tests__/fixtures/memory-facts';

describe('Memory Storage - Helper Functions', () => {
  describe('estimateTokenUsage', () => {
    it('should estimate tokens correctly (4 chars per token)', () => {
      const facts = [
        createMockFact({ content: 'a'.repeat(100) }), // 100 chars = ~25 tokens
        createMockFact({ content: 'b'.repeat(200) }), // 200 chars = ~50 tokens
      ];

      const tokens = estimateTokenUsage(facts);
      expect(tokens).toBe(75); // 300 chars / 4 = 75 tokens
    });

    it('should return 0 for empty facts array', () => {
      expect(estimateTokenUsage([])).toBe(0);
    });

    it('should handle single character facts', () => {
      const facts = [createMockFact({ content: 'abc' })]; // 3 chars
      expect(estimateTokenUsage(facts)).toBe(1); // Rounds up
    });
  });

  describe('calculateExpiry', () => {
    it('should return null for CORE tier (never expires)', () => {
      const expiry = calculateExpiry(MemoryTier.CORE);
      expect(expiry).toBeNull();
    });

    it('should return ~90 days for IMPORTANT tier', () => {
      const expiry = calculateExpiry(MemoryTier.IMPORTANT);
      expect(expiry).not.toBeNull();

      const now = new Date();
      const diffDays = Math.round((expiry!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      expect(diffDays).toBeGreaterThanOrEqual(89);
      expect(diffDays).toBeLessThanOrEqual(91);
    });

    it('should return ~30 days for CONTEXT tier', () => {
      const expiry = calculateExpiry(MemoryTier.CONTEXT);
      expect(expiry).not.toBeNull();

      const now = new Date();
      const diffDays = Math.round((expiry!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      expect(diffDays).toBeGreaterThanOrEqual(29);
      expect(diffDays).toBeLessThanOrEqual(31);
    });
  });

  describe('daysBetween', () => {
    it('should calculate days correctly', () => {
      const date1 = new Date('2025-01-01');
      const date2 = new Date('2025-01-11');

      const days = daysBetween(date1, date2);
      expect(days).toBe(10);
    });

    it('should handle reversed dates (absolute difference)', () => {
      const date1 = new Date('2025-01-11');
      const date2 = new Date('2025-01-01');

      const days = daysBetween(date1, date2);
      expect(days).toBe(10);
    });

    it('should return 0 for same date', () => {
      const date = new Date('2025-01-01');
      const days = daysBetween(date, date);
      expect(days).toBe(0);
    });

    it('should handle date ranges over a year', () => {
      const date1 = new Date('2024-01-01');
      const date2 = new Date('2025-01-01');

      const days = daysBetween(date1, date2);
      expect(days).toBe(366); // 2024 is a leap year
    });
  });
});
