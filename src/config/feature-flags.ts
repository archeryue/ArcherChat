import { FeatureFlags } from "@/types/prompt-analysis";

/**
 * Feature Flags Configuration
 *
 * Control rollout of new features safely
 */

export const FEATURE_FLAGS: FeatureFlags = {
  // Use intelligent analysis (PromptAnalysis + ContextEngineering) instead of keywords
  // Default: false (use old keyword system)
  // Set to true to enable new architecture
  USE_INTELLIGENT_ANALYSIS: process.env.NEXT_PUBLIC_USE_INTELLIGENT_ANALYSIS === 'true' || false,

  // Enable web search capability
  // Default: false
  // Set to true when Google Custom Search API is configured
  USE_WEB_SEARCH: process.env.NEXT_PUBLIC_USE_WEB_SEARCH === 'true' || false,
};

/**
 * Check if intelligent analysis is enabled
 */
export function isIntelligentAnalysisEnabled(): boolean {
  return FEATURE_FLAGS.USE_INTELLIGENT_ANALYSIS;
}

/**
 * Check if web search is enabled
 */
export function isWebSearchEnabled(): boolean {
  return FEATURE_FLAGS.USE_WEB_SEARCH;
}
