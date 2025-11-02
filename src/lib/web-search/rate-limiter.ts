import { getFirestore } from "@/lib/firebase-admin";
import { SearchUsage } from "@/types/web-search";

/**
 * Rate limiter for web search functionality
 *
 * Limits:
 * - 20 searches per hour per user
 * - 100 searches per day per user (matches Google's free tier)
 *
 * Cost tracking:
 * - First 100 searches/day: FREE
 * - Beyond 100: $0.005 per search ($5 per 1,000 queries)
 */

const HOURLY_LIMIT = 20;
const DAILY_LIMIT = 100;
const FREE_DAILY_LIMIT = 100;
const COST_PER_SEARCH = 0.5; // cents ($0.005)

export class SearchRateLimiter {
  /**
   * Check if user can perform a search (within rate limits)
   *
   * @param userId - User's email or ID
   * @returns Object with allowed status and remaining quota
   */
  async checkRateLimit(userId: string): Promise<{
    allowed: boolean;
    hourlyRemaining: number;
    dailyRemaining: number;
    message?: string;
  }> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    try {
      const db = getFirestore();

      // Get searches in the last hour
      const hourlySnapshot = await db
        .collection('search_usage')
        .where('user_id', '==', userId)
        .where('timestamp', '>=', oneHourAgo)
        .get();

      const hourlyCount = hourlySnapshot.size;

      // Get searches in the last day
      const dailySnapshot = await db
        .collection('search_usage')
        .where('user_id', '==', userId)
        .where('timestamp', '>=', oneDayAgo)
        .get();

      const dailyCount = dailySnapshot.size;

      // Check hourly limit
      if (hourlyCount >= HOURLY_LIMIT) {
        return {
          allowed: false,
          hourlyRemaining: 0,
          dailyRemaining: Math.max(0, DAILY_LIMIT - dailyCount),
          message: `Hourly search limit reached (${HOURLY_LIMIT} searches/hour). Please try again later.`
        };
      }

      // Check daily limit
      if (dailyCount >= DAILY_LIMIT) {
        return {
          allowed: false,
          hourlyRemaining: Math.max(0, HOURLY_LIMIT - hourlyCount),
          dailyRemaining: 0,
          message: `Daily search limit reached (${DAILY_LIMIT} searches/day). Please try again tomorrow.`
        };
      }

      return {
        allowed: true,
        hourlyRemaining: HOURLY_LIMIT - hourlyCount,
        dailyRemaining: DAILY_LIMIT - dailyCount
      };
    } catch (error) {
      console.error('[SearchRateLimiter] Error checking rate limit:', error);
      // Allow the request if rate limit check fails (fail open)
      return {
        allowed: true,
        hourlyRemaining: HOURLY_LIMIT,
        dailyRemaining: DAILY_LIMIT
      };
    }
  }

  /**
   * Track a search usage
   *
   * @param userId - User's email or ID
   * @param query - Search query
   * @param resultsCount - Number of results returned
   */
  async trackUsage(
    userId: string,
    query: string,
    resultsCount: number
  ): Promise<void> {
    try {
      const db = getFirestore();
      const now = new Date();

      // Calculate cost (first 100/day are free)
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const todaySnapshot = await db
        .collection('search_usage')
        .where('user_id', '==', userId)
        .where('timestamp', '>=', todayStart)
        .get();

      const todayCount = todaySnapshot.size;
      const isFree = todayCount < FREE_DAILY_LIMIT;
      const costEstimate = isFree ? 0 : COST_PER_SEARCH;

      const usage: SearchUsage = {
        user_id: userId,
        query,
        results_count: resultsCount,
        timestamp: now,
        cost_estimate: costEstimate
      };

      await db.collection('search_usage').add(usage);

      console.log(`[SearchRateLimiter] Tracked: ${userId} - "${query}" (${resultsCount} results, $${(costEstimate/100).toFixed(3)})`);
    } catch (error) {
      console.error('[SearchRateLimiter] Error tracking usage:', error);
      // Don't throw - tracking failures shouldn't block the search
    }
  }

  /**
   * Get user's search statistics
   *
   * @param userId - User's email or ID
   * @param days - Number of days to look back (default: 30)
   * @returns Search statistics
   */
  async getUserStats(userId: string, days: number = 30): Promise<{
    totalSearches: number;
    searchesToday: number;
    totalCost: number; // in cents
    averagePerDay: number;
  }> {
    try {
      const db = getFirestore();
      const now = new Date();
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      // Get all searches in the period
      const allSnapshot = await db
        .collection('search_usage')
        .where('user_id', '==', userId)
        .where('timestamp', '>=', startDate)
        .get();

      // Get today's searches
      const todaySnapshot = await db
        .collection('search_usage')
        .where('user_id', '==', userId)
        .where('timestamp', '>=', todayStart)
        .get();

      let totalCost = 0;
      allSnapshot.forEach(doc => {
        const data = doc.data() as SearchUsage;
        totalCost += data.cost_estimate || 0;
      });

      return {
        totalSearches: allSnapshot.size,
        searchesToday: todaySnapshot.size,
        totalCost,
        averagePerDay: allSnapshot.size / days
      };
    } catch (error) {
      console.error('[SearchRateLimiter] Error getting user stats:', error);
      return {
        totalSearches: 0,
        searchesToday: 0,
        totalCost: 0,
        averagePerDay: 0
      };
    }
  }
}

// Export singleton instance
export const searchRateLimiter = new SearchRateLimiter();
