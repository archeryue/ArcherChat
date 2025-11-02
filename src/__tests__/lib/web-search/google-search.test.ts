/**
 * Unit Tests: Google Search Service
 * Tests GoogleSearchService logic with mocked fetch API
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GoogleSearchService } from '@/lib/web-search/google-search';
import {
  mockGoogleApiResponse,
  mockGoogleApiResponseEmpty,
  mockSearchResults,
  mockSearchResultsSingle,
} from '@/__tests__/fixtures/web-search';

// Mock global fetch
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('GoogleSearchService', () => {
  let service: GoogleSearchService;
  const mockApiKey = 'test-api-key-12345';
  const mockEngineId = 'test-engine-id-67890';

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    service = new GoogleSearchService(mockApiKey, mockEngineId);
  });

  describe('isAvailable', () => {
    it('should return true when API key and engine ID are configured', () => {
      expect(service.isAvailable()).toBe(true);
    });

    it('should return false when API key is missing', () => {
      const invalidService = new GoogleSearchService('', mockEngineId);
      expect(invalidService.isAvailable()).toBe(false);
    });

    it('should return false when engine ID is missing', () => {
      const invalidService = new GoogleSearchService(mockApiKey, '');
      expect(invalidService.isAvailable()).toBe(false);
    });

    it('should return false when both are missing', () => {
      const invalidService = new GoogleSearchService('', '');
      expect(invalidService.isAvailable()).toBe(false);
    });
  });

  describe('search', () => {
    it('should throw error if service is not available', async () => {
      const invalidService = new GoogleSearchService('', '');
      await expect(invalidService.search('test query'))
        .rejects
        .toThrow('Google Search API is not configured');
    });

    it('should throw error for empty query', async () => {
      await expect(service.search(''))
        .rejects
        .toThrow('Search query cannot be empty');
    });

    it('should throw error for whitespace-only query', async () => {
      await expect(service.search('   '))
        .rejects
        .toThrow('Search query cannot be empty');
    });

    it('should successfully search and return results', async () => {
      // Mock successful API response
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockGoogleApiResponse,
      } as Response);

      const results = await service.search('playwright vs selenium', 3);

      expect(results).toHaveLength(3);
      expect(results).toEqual(mockSearchResults);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Verify URL construction
      const callUrl = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[0][0] as string;
      expect(callUrl).toContain('key=test-api-key-12345');
      expect(callUrl).toContain('cx=test-engine-id-67890');
      expect(callUrl).toContain('q=playwright+vs+selenium');
      expect(callUrl).toContain('num=3');
    });

    it('should return empty array when no results found', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockGoogleApiResponseEmpty,
      } as Response);

      const results = await service.search('nonexistent query');

      expect(results).toEqual([]);
    });

    it('should clamp numResults to minimum 1', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockGoogleApiResponse,
      } as Response);

      await service.search('test', 0);

      const callUrl = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[0][0] as string;
      expect(callUrl).toContain('num=1');
    });

    it('should clamp numResults to maximum 10', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockGoogleApiResponse,
      } as Response);

      await service.search('test', 50);

      const callUrl = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[0][0] as string;
      expect(callUrl).toContain('num=10');
    });

    it('should throw error on API failure', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'API key invalid',
      } as Response);

      await expect(service.search('test'))
        .rejects
        .toThrow('Google Search API returned 403: Forbidden');
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(service.search('test'))
        .rejects
        .toThrow('Network error');
    });
  });

  describe('formatResultsForAI', () => {
    it('should format results as markdown for AI context', () => {
      const formatted = service.formatResultsForAI(mockSearchResults, 'playwright vs selenium');

      expect(formatted).toContain('**Web Search Results for "playwright vs selenium":**');
      expect(formatted).toContain('1. **Playwright vs Selenium: Which is Better?**');
      expect(formatted).toContain('Playwright offers faster execution');
      expect(formatted).toContain('Source: example.com');
      expect(formatted).toContain('2. **Playwright Documentation**');
      expect(formatted).toContain('3. **Selenium WebDriver Guide**');
    });

    it('should handle empty results', () => {
      const formatted = service.formatResultsForAI([], 'nonexistent query');

      expect(formatted).toBe('No search results found for "nonexistent query".');
    });

    it('should format single result correctly', () => {
      const formatted = service.formatResultsForAI(mockSearchResultsSingle, 'bitcoin price');

      expect(formatted).toContain('**Web Search Results for "bitcoin price":**');
      expect(formatted).toContain('1. **Bitcoin Price Today**');
      expect(formatted).toContain('The current Bitcoin price is $45,000 USD');
    });
  });

  describe('formatResultsForUser', () => {
    it('should format results as citations for user display', () => {
      const formatted = service.formatResultsForUser(mockSearchResults);

      expect(formatted).toContain('**Sources:**');
      expect(formatted).toContain('1. [Playwright vs Selenium: Which is Better?](https://example.com/playwright-vs-selenium)');
      expect(formatted).toContain('2. [Playwright Documentation](https://playwright.dev/docs)');
      expect(formatted).toContain('3. [Selenium WebDriver Guide](https://selenium.dev/documentation)');
    });

    it('should return empty string for no results', () => {
      const formatted = service.formatResultsForUser([]);

      expect(formatted).toBe('');
    });

    it('should format single citation correctly', () => {
      const formatted = service.formatResultsForUser(mockSearchResultsSingle);

      expect(formatted).toContain('**Sources:**');
      expect(formatted).toContain('1. [Bitcoin Price Today](https://coinmarketcap.com/bitcoin)');
    });
  });
});
