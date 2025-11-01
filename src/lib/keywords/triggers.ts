/**
 * Keyword Trigger Registrations
 *
 * This file defines all keyword triggers and their associated actions.
 * Each trigger maps specific keywords to a callback function.
 */

import {
  keywordSystem,
  KeywordTriggerType,
  KeywordContext,
} from "./system";
import { MEMORY_TRIGGER_KEYWORDS, IMAGE_GENERATION_KEYWORDS } from "@/config/keywords";
import { processConversationMemory } from "@/lib/memory";

/**
 * ==========================================
 * MEMORY CATEGORY TRIGGERS
 * ==========================================
 * These triggers help the system remember information about the user
 */

/**
 * Register general memory extraction trigger
 *
 * When users say things like:
 * - "remember that..."
 * - "I prefer..."
 * - "my name is..."
 *
 * This trigger immediately initiates memory extraction
 */
keywordSystem.register({
  type: KeywordTriggerType.MEMORY_GENERAL,
  keywords: MEMORY_TRIGGER_KEYWORDS,
  description: "Triggers immediate memory extraction from conversation",
  callback: async (context: KeywordContext) => {
    const { conversationId, userId, message } = context;

    if (!conversationId || !userId) {
      console.warn("[Memory.General] Missing conversationId or userId");
      return { success: false, reason: "Missing required context" };
    }

    console.log("[Memory.General] Keyword detected, extracting memory...");

    try {
      const factsExtracted = await processConversationMemory(
        conversationId,
        userId,
        message
      );

      return {
        success: true,
        factsExtracted,
      };
    } catch (error) {
      console.error("[Memory.General] Error processing memory:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * ==========================================
 * INTENTION CATEGORY TRIGGERS
 * ==========================================
 * These triggers detect what the user wants to do
 */

/**
 * Register image generation intention trigger
 *
 * When users say things like:
 * - "generate image of..."
 * - "create a picture..."
 * - "画一张..."
 *
 * This trigger marks the request for image generation
 */
keywordSystem.register({
  type: KeywordTriggerType.INTENTION_IMAGE_GENERATION,
  keywords: IMAGE_GENERATION_KEYWORDS,
  description: "Detects requests for image generation",
  callback: async (context: KeywordContext) => {
    console.log("[Intention.ImageGeneration] Image generation request detected");

    // Image generation is handled by the provider directly
    // This callback just logs the detection
    // The actual generation happens in the AI provider based on prompt analysis

    return {
      success: true,
      detected: true,
      message: "Image generation request detected",
    };
  },
});

/**
 * Initialize all triggers
 * This function is called once at application startup
 */
export function initializeKeywordTriggers(): void {
  console.log("[KeywordSystem] All triggers initialized");
  console.log(
    `[KeywordSystem] Registered ${keywordSystem.getAllTriggers().length} triggers`
  );
}

// Auto-initialize triggers when this module is imported
initializeKeywordTriggers();

// Export the system for use in other parts of the application
export { keywordSystem };
