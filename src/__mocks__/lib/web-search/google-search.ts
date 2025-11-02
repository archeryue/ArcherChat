/**
 * Manual mock for google-search service
 */

export const googleSearchService = {
  isAvailable: jest.fn(),
  search: jest.fn(),
  formatResultsForAI: jest.fn(),
  formatResultsForUser: jest.fn(),
};

export class GoogleSearchService {
  isAvailable = jest.fn();
  search = jest.fn();
  formatResultsForAI = jest.fn();
  formatResultsForUser = jest.fn();
}
