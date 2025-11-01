/**
 * Model Tiering Configuration
 *
 * This configuration implements a cost-optimized tiering strategy:
 * - Tier 1 (Main): Gemini 2.5 Flash for user-facing chat
 * - Tier 2 (Image): Gemini 2.5 Flash Image for image generation
 * - Tier 3 (Lite): Gemini 2.5 Flash-Lite for background processing
 *
 * Pricing (per 1M tokens):
 * - 2.5 Flash: $0.30 input / $2.50 output
 * - 2.5 Flash Image: Similar to 2.5 Flash
 * - 2.5 Flash-Lite: $0.075 input / $0.30 output (25% cheaper)
 *
 * Benefits:
 * - 7-15% overall cost savings
 * - More recent knowledge (January 2025 vs August 2024)
 * - 8x larger output capacity (65K vs 8K tokens)
 * - Better PDF/URL support for future features
 */

export enum ModelTier {
  MAIN = "main",           // User-facing conversations
  IMAGE = "image",         // Image generation
  LITE = "lite",          // Background processing
}

export const GEMINI_MODELS = {
  [ModelTier.MAIN]: "gemini-2.5-flash",
  [ModelTier.IMAGE]: "gemini-2.5-flash-image",
  [ModelTier.LITE]: "gemini-2.5-flash-lite",
} as const;

export const MODEL_CONFIGS = {
  [ModelTier.MAIN]: {
    model: GEMINI_MODELS[ModelTier.MAIN],
    description: "Primary model for user conversations",
    contextWindow: 1048576,        // 1M tokens
    maxOutputTokens: 65536,        // 65K tokens
    knowledgeCutoff: "January 2025",
    pricing: {
      input: 0.30,   // per 1M tokens
      output: 2.50,  // per 1M tokens
    },
  },
  [ModelTier.IMAGE]: {
    model: GEMINI_MODELS[ModelTier.IMAGE],
    description: "Specialized model for image generation",
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    knowledgeCutoff: "January 2025",
    pricing: {
      input: 0.30,
      output: 2.50,
    },
  },
  [ModelTier.LITE]: {
    model: GEMINI_MODELS[ModelTier.LITE],
    description: "Cost-optimized model for background tasks",
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    knowledgeCutoff: "January 2025",
    pricing: {
      input: 0.075,  // 25% cheaper
      output: 0.30,  // 25% cheaper
    },
  },
} as const;

/**
 * Get the appropriate model for a specific task
 */
export function getModelForTask(task: "chat" | "image" | "memory" | "analysis"): string {
  switch (task) {
    case "chat":
      return GEMINI_MODELS[ModelTier.MAIN];
    case "image":
      return GEMINI_MODELS[ModelTier.IMAGE];
    case "memory":
    case "analysis":
      return GEMINI_MODELS[ModelTier.LITE];
    default:
      return GEMINI_MODELS[ModelTier.MAIN];
  }
}

/**
 * Get model tier from model name
 */
export function getModelTier(modelName: string): ModelTier {
  if (modelName.includes("lite")) return ModelTier.LITE;
  if (modelName.includes("image")) return ModelTier.IMAGE;
  return ModelTier.MAIN;
}
