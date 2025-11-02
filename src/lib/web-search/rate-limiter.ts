import { db } from "@/lib/firebase-admin";
import { SearchUsage } from "@/types/web-search";

/**
 * Rate limiter for web search functionality
 *
 * Global Limits (ALL users combined):
 * - 100 searches per day (matches Google's free tier)
 *
 * Cost tracking:
 * - First 100 searches/day: FREE
 * - Beyond 100: $0.005 per search ($5 per 1,000 queries)
 */

const GLOBAL_DAILY_LIMIT = 100; // Total for ALL users
const FREE_DAILY_LIMIT = 100;
const COST_PER_SEARCH = 0.5; // cents ($0.005)

export class SearchRateLimiter {
  /**
   * Check if search is allowed (within global daily limit)
   *
   * @returns Object with allowed status and remaining quota
   */
  async checkRateLimit(): Promise<{
    allowed: boolean;
    dailyRemaining: number;
    message?: string;
  }> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    try {
      // Get total searches in the last 24 hours (ALL users)
      const dailySnapshot = await db
        .collection('search_usage')
        .where('timestamp', '>=', oneDayAgo)
        .get();

      const dailyCount = dailySnapshot.size;

      // Check global daily limit
      if (dailyCount >= GLOBAL_DAILY_LIMIT) {
        return {
          allowed: false,
          dailyRemaining: 0,
          message: `Global daily search limit reached (${GLOBAL_DAILY_LIMIT} searches/day for all users). Please try again tomorrow.`
        };
      }

      return {
        allowed: true,
        dailyRemaining: GLOBAL_DAILY_LIMIT - dailyCount
      };
    } catch (error) {
      console.error('[SearchRateLimiter] Error checking rate limit:', error);
      // Allow the request if rate limit check fails (fail open)
      return {
        allowed: true,
        dailyRemaining: GLOBAL_DAILY_LIMIT
      };
    }
  }

  /**
   * Track a search usage
   *
   * @param userId - User's email or ID (for analytics)
   * @param query - Search query
   * @param resultsCount - Number of results returned
   */
  async trackUsage(
    userId: string,
    query: string,
    resultsCount: number
  ): Promise<void> {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Calculate cost based on GLOBAL usage (first 100/day globally are free)
      const globalSnapshot = await db
        .collection('search_usage')
        .where('timestamp', '>=', oneDayAgo)
        .get();

      const globalCount = globalSnapshot.size;
      const isFree = globalCount < FREE_DAILY_LIMIT;
      const costEstimate = isFree ? 0 : COST_PER_SEARCH;

      const usage: SearchUsage = {
        user_id: userId,
        query,
        results_count: resultsCount,
        timestamp: now,
        cost_estimate: costEstimate
      };

      await db.collection('search_usage').add(usage);

      console.log(`[SearchRateLimiter] Tracked: ${userId} - "${query}" (${resultsCount} results, global: ${globalCount + 1}/${GLOBAL_DAILY_LIMIT}, $${(costEstimate/100).toFixed(3)})`);
    } catch (error) {
      console.error('[SearchRateLimiter] Error tracking usage:', error);
      // Don't throw - tracking failures shouldn't block the search
    }
  }

  /**
   * Get global search statistics (all users combined)
   *
   * @returns Global search statistics
   */
  async getGlobalStats(): Promise<{
    searchesToday: number;
    dailyRemaining: number;
    totalCost: number; // in cents
  }> {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Get all searches in the last 24 hours
      const dailySnapshot = await db
        .collection('search_usage')
        .where('timestamp', '>=', oneDayAgo)
        .get();

      let totalCost = 0;
      dailySnapshot.forEach(doc => {
        const data = doc.data() as SearchUsage;
        totalCost += data.cost_estimate || 0;
      });

      return {
        searchesToday: dailySnapshot.size,
        dailyRemaining: Math.max(0, GLOBAL_DAILY_LIMIT - dailySnapshot.size),
        totalCost
      };
    } catch (error) {
      console.error('[SearchRateLimiter] Error getting global stats:', error);
      return {
        searchesToday: 0,
        dailyRemaining: GLOBAL_DAILY_LIMIT,
        totalCost: 0
      };
    }
  }
}

// Export singleton instance
export const searchRateLimiter = new SearchRateLimiter();
