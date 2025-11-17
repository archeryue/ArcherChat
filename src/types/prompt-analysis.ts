import { MemoryFact, MemoryCategory, MemoryTier, LanguagePreference } from "./memory";
import { FileAttachment } from "./file";
import { AIMessage } from "./ai-providers";

/**
 * Primary intent of the user's message
 */
export type UserIntent = "question" | "image_generation" | "casual_chat" | "command";

/**
 * Web search action details
 */
export interface WebSearchAction {
  needed: boolean;
  query?: string;          // Initial optimized search query
  userQuestion?: string;   // Original user question for context
  targetInfo?: string[];   // Key aspects to cover (e.g., ["performance", "ease of use", "community"])
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
  language: LanguagePreference;
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
  conversationHistory?: AIMessage[]; // Last 3-5 messages for context
  userSettings?: {
    webSearchEnabled: boolean;
    languagePreference?: LanguagePreference;
  };
}

/**
 * Feature flag configuration
 */
export interface FeatureFlags {
  USE_INTELLIGENT_ANALYSIS: boolean;
  USE_WEB_SEARCH: boolean;
  USE_AGENTIC_MODE: boolean;
}

/**
 * Reflection result after analyzing search content
 * Used for iterative search refinement
 */
export interface SearchReflection {
  sufficient: boolean;           // Is the content sufficient to answer the question?
  missingAspects?: string[];     // What important aspects are missing?
  refinedQuery?: string;         // Suggested refined search query
  reasoning: string;             // Why is this sufficient or not?
  confidence: number;            // 0.0-1.0 confidence in this assessment
}
