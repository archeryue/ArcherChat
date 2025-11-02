/**
 * Manual mock for rate-limiter service
 */

export const searchRateLimiter = {
  checkRateLimit: jest.fn(),
  trackUsage: jest.fn(),
  getGlobalStats: jest.fn(),
};

export class SearchRateLimiter {
  checkRateLimit = jest.fn();
  trackUsage = jest.fn();
  getGlobalStats = jest.fn();
}
