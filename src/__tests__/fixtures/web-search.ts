/**
 * Test Fixtures: Web Search
 *
 * Mock data for web search system tests
 */

import { SearchResult, GoogleSearchResponse, SearchUsage } from '@/types/web-search';

// Mock Google Search API responses
export const mockGoogleApiResponse: GoogleSearchResponse = {
  items: [
    {
      title: 'Playwright vs Selenium: Which is Better?',
      link: 'https://example.com/playwright-vs-selenium',
      snippet: 'Playwright offers faster execution and better API compared to Selenium. Modern web testing made easy.',
      displayLink: 'example.com',
    },
    {
      title: 'Playwright Documentation',
      link: 'https://playwright.dev/docs',
      snippet: 'Playwright enables reliable end-to-end testing for modern web apps. Fast, reliable, and powerful.',
      displayLink: 'playwright.dev',
    },
    {
      title: 'Selenium WebDriver Guide',
      link: 'https://selenium.dev/documentation',
      snippet: 'Selenium automates browsers. It is primarily used for testing web applications across different browsers.',
      displayLink: 'selenium.dev',
    },
  ],
};

export const mockGoogleApiResponseEmpty: GoogleSearchResponse = {
  items: [],
};

// Mock Search Results
export const mockSearchResults: SearchResult[] = [
  {
    title: 'Playwright vs Selenium: Which is Better?',
    link: 'https://example.com/playwright-vs-selenium',
    snippet: 'Playwright offers faster execution and better API compared to Selenium. Modern web testing made easy.',
    displayLink: 'example.com',
  },
  {
    title: 'Playwright Documentation',
    link: 'https://playwright.dev/docs',
    snippet: 'Playwright enables reliable end-to-end testing for modern web apps. Fast, reliable, and powerful.',
    displayLink: 'playwright.dev',
  },
  {
    title: 'Selenium WebDriver Guide',
    link: 'https://selenium.dev/documentation',
    snippet: 'Selenium automates browsers. It is primarily used for testing web applications across different browsers.',
    displayLink: 'selenium.dev',
  },
];

export const mockSearchResultsSingle: SearchResult[] = [
  {
    title: 'Bitcoin Price Today',
    link: 'https://coinmarketcap.com/bitcoin',
    snippet: 'The current Bitcoin price is $45,000 USD with 24-hour trading volume.',
    displayLink: 'coinmarketcap.com',
  },
];

// Mock Search Usage records
export const mockSearchUsage: SearchUsage = {
  user_id: 'test-user-001',
  query: 'playwright vs selenium',
  results_count: 3,
  timestamp: new Date('2025-11-02T10:00:00Z'),
  cost_estimate: 0, // First 100 are free
};

export const mockSearchUsagePaid: SearchUsage = {
  user_id: 'test-user-002',
  query: 'bitcoin price',
  results_count: 5,
  timestamp: new Date('2025-11-02T11:00:00Z'),
  cost_estimate: 0.5, // Beyond 100/day = $0.005 each = 0.5 cents
};

// Mock Firestore snapshots for rate limiter tests
export const createMockSnapshot = (size: number, docs: any[] = []) => ({
  size,
  docs: docs.map((data, index) => ({
    id: `doc-${index}`,
    data: () => data,
  })),
  forEach: (callback: (doc: any) => void) => {
    docs.forEach((data, index) => {
      callback({
        id: `doc-${index}`,
        data: () => data,
      });
    });
  },
  empty: size === 0,
});

// Helper to create mock search usage array
export function createMockSearchUsageArray(count: number): SearchUsage[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => ({
    user_id: `user-${i % 5}`, // Simulate multiple users
    query: `test query ${i}`,
    results_count: 5,
    timestamp: new Date(now.getTime() - i * 60 * 1000), // Spread over last hour
    cost_estimate: i >= 100 ? 0.5 : 0, // First 100 free
  }));
}
