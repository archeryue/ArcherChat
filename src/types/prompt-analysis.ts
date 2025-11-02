import { MemoryFact, MemoryCategory, MemoryTier } from "./memory";
import { FileAttachment } from "./file";
import { Message } from "./index";

/**
 * Primary intent of the user's message
 */
export type UserIntent = "question" | "image_generation" | "casual_chat" | "command";

/**
 * Web search action details
 */
export interface WebSearchAction {
  needed: boolean;
  query?: string;          // Optimized search query
  reason?: string;         // Why search is needed
  priority?: "high" | "medium" | "low";
}

/**
 * Memory retrieval action details
 */
export interface MemoryRetrievalAction {
  needed: boolean;
  search_terms?: string[]; // What to search in memory
  categories?: MemoryCategory[]; // Which categories to focus on
}

/**
 * Memory extraction action details
 * Note: Facts are extracted immediately during analysis, not deferred
 */
export interface MemoryExtractionAction {
  needed: boolean;
  trigger: "explicit" | "implicit"; // User said "remember" vs conversation-based
  facts?: MemoryFact[];  // Extracted facts (if needed=true)
}

/**
 * Image generation action details
 */
export interface ImageGenerationAction {
  needed: boolean;
  description?: string;    // Image generation prompt
}

/**
 * All possible actions that can be triggered
 */
export interface PromptActions {
  web_search: WebSearchAction;
  memory_retrieval: MemoryRetrievalAction;
  memory_extraction: MemoryExtractionAction;
  image_generation: ImageGenerationAction;
}

/**
 * Result from PromptAnalysis module
 */
export interface PromptAnalysisResult {
  // Primary intent
  intent: UserIntent;

  // Actions needed (multiple can be true)
  actions: PromptActions;

  // Context metadata
  language: "english" | "chinese" | "hybrid";
  sentiment?: "positive" | "neutral" | "negative";
  urgency?: "high" | "normal" | "low";

  // Confidence
  confidence: number; // 0.0-1.0 (how certain is this analysis)

  // Debug info
  reasoning?: string; // Why these decisions were made
}

/**
 * Input to PromptAnalysis module
 */
export interface PromptAnalysisInput {
  message: string;
  files?: FileAttachment[];
  conversationHistory?: Message[]; // Last 3-5 messages for context
  userSettings?: {
    webSearchEnabled: boolean;
    languagePreference?: "english" | "chinese" | "hybrid";
  };
}

/**
 * Feature flag configuration
 */
export interface FeatureFlags {
  USE_INTELLIGENT_ANALYSIS: boolean;
  USE_WEB_SEARCH: boolean;
}
