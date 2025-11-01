/**
 * Centralized Keyword System for ArcherChat
 *
 * This system provides a unified way to:
 * - Define keyword triggers with bilingual support (English/Chinese)
 * - Register actions/callbacks for specific keyword matches
 * - Check messages for keyword matches
 * - Execute corresponding actions systematically
 */

/**
 * Main categories of keyword triggers
 */
export enum KeywordCategory {
  INTENTION = "intention", // What the user wants to do
  MEMORY = "memory",       // What the system should remember
}

/**
 * Types of keyword triggers supported by the system
 * Organized hierarchically under main categories
 */
export enum KeywordTriggerType {
  // INTENTION category - user actions
  INTENTION_IMAGE_GENERATION = "intention.image_generation",
  INTENTION_WEB_SEARCH = "intention.web_search",
  INTENTION_FILE_OPERATION = "intention.file_operation",

  // MEMORY category - system memory
  MEMORY_GENERAL = "memory.general",
  MEMORY_LANGUAGE_PREFERENCE = "memory.language_preference",
  MEMORY_PROFILE = "memory.profile",
  MEMORY_PREFERENCE = "memory.preference",
}

/**
 * Bilingual keyword configuration
 */
export interface KeywordConfig {
  english: string[];
  chinese: string[];
}

/**
 * Context passed to keyword callbacks
 */
export interface KeywordContext {
  conversationId?: string;
  userId?: string;
  message: string;
  [key: string]: any; // Allow additional context fields
}

/**
 * Callback function type for keyword actions
 */
export type KeywordCallback = (context: KeywordContext) => Promise<any> | any;

/**
 * Complete keyword trigger definition
 */
export interface KeywordTrigger {
  type: KeywordTriggerType;
  keywords: KeywordConfig;
  description: string;
  callback?: KeywordCallback;
}

/**
 * Result of keyword checking
 */
export interface KeywordMatchResult {
  type: KeywordTriggerType;
  matched: boolean;
  matchedKeywords: string[];
}

/**
 * Centralized Keyword System
 *
 * Usage:
 * 1. Register triggers with keywords and callbacks
 * 2. Check messages for keyword matches
 * 3. Execute callbacks for matched triggers
 */
export class KeywordSystem {
  private triggers: Map<KeywordTriggerType, KeywordTrigger> = new Map();

  /**
   * Register a keyword trigger with its configuration
   */
  register(trigger: KeywordTrigger): void {
    this.triggers.set(trigger.type, trigger);
  }

  /**
   * Check if a message contains any keywords
   */
  containsKeywords(message: string, keywords: KeywordConfig): boolean {
    const lowerMessage = message.toLowerCase();
    const allKeywords = [...keywords.english, ...keywords.chinese];

    return allKeywords.some((keyword) =>
      lowerMessage.includes(keyword.toLowerCase())
    );
  }

  /**
   * Get all keywords that match in the message
   */
  getMatchedKeywords(message: string, keywords: KeywordConfig): string[] {
    const lowerMessage = message.toLowerCase();
    const allKeywords = [...keywords.english, ...keywords.chinese];

    return allKeywords.filter((keyword) =>
      lowerMessage.includes(keyword.toLowerCase())
    );
  }

  /**
   * Check a message against all registered triggers
   * Returns all matching trigger types
   */
  check(message: string): KeywordMatchResult[] {
    const results: KeywordMatchResult[] = [];

    for (const [type, trigger] of this.triggers) {
      const matchedKeywords = this.getMatchedKeywords(message, trigger.keywords);
      results.push({
        type,
        matched: matchedKeywords.length > 0,
        matchedKeywords,
      });
    }

    return results;
  }

  /**
   * Get all matched trigger types from check results
   */
  getMatchedTypes(results: KeywordMatchResult[]): KeywordTriggerType[] {
    return results.filter((r) => r.matched).map((r) => r.type);
  }

  /**
   * Execute the callback for a specific trigger type
   */
  async execute(
    type: KeywordTriggerType,
    context: KeywordContext
  ): Promise<any> {
    const trigger = this.triggers.get(type);

    if (!trigger) {
      console.warn(`[KeywordSystem] No trigger registered for type: ${type}`);
      return null;
    }

    if (!trigger.callback) {
      console.warn(
        `[KeywordSystem] No callback defined for trigger: ${type}`
      );
      return null;
    }

    try {
      console.log(
        `[KeywordSystem] Executing callback for trigger: ${type}`
      );
      return await trigger.callback(context);
    } catch (error) {
      console.error(
        `[KeywordSystem] Error executing callback for ${type}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Execute all callbacks for matched triggers
   */
  async executeAll(
    results: KeywordMatchResult[],
    context: KeywordContext
  ): Promise<Map<KeywordTriggerType, any>> {
    const executionResults = new Map<KeywordTriggerType, any>();

    for (const result of results) {
      if (result.matched) {
        try {
          const execResult = await this.execute(result.type, context);
          executionResults.set(result.type, execResult);
        } catch (error) {
          console.error(
            `[KeywordSystem] Failed to execute ${result.type}:`,
            error
          );
          executionResults.set(result.type, { error });
        }
      }
    }

    return executionResults;
  }

  /**
   * Get a specific trigger configuration
   */
  getTrigger(type: KeywordTriggerType): KeywordTrigger | undefined {
    return this.triggers.get(type);
  }

  /**
   * Get all registered triggers
   */
  getAllTriggers(): KeywordTrigger[] {
    return Array.from(this.triggers.values());
  }

  /**
   * Check if a specific trigger type is registered
   */
  hasTrigger(type: KeywordTriggerType): boolean {
    return this.triggers.has(type);
  }

  /**
   * Unregister a trigger
   */
  unregister(type: KeywordTriggerType): boolean {
    return this.triggers.delete(type);
  }

  /**
   * Clear all registered triggers
   */
  clear(): void {
    this.triggers.clear();
  }

  /**
   * Get the category of a trigger type
   */
  getCategory(type: KeywordTriggerType): KeywordCategory | null {
    const typeStr = type.toString();
    if (typeStr.startsWith("intention.")) {
      return KeywordCategory.INTENTION;
    }
    if (typeStr.startsWith("memory.")) {
      return KeywordCategory.MEMORY;
    }
    return null;
  }

  /**
   * Get all triggers in a specific category
   */
  getTriggersByCategory(category: KeywordCategory): KeywordTrigger[] {
    return this.getAllTriggers().filter(
      (trigger) => this.getCategory(trigger.type) === category
    );
  }

  /**
   * Get all matched triggers in a specific category
   */
  getMatchedByCategory(
    results: KeywordMatchResult[],
    category: KeywordCategory
  ): KeywordMatchResult[] {
    return results.filter(
      (result) => result.matched && this.getCategory(result.type) === category
    );
  }

  /**
   * Check if any triggers in a category are matched
   */
  hasCategoryMatch(
    results: KeywordMatchResult[],
    category: KeywordCategory
  ): boolean {
    return this.getMatchedByCategory(results, category).length > 0;
  }
}

/**
 * Create a singleton instance for global use
 */
export const keywordSystem = new KeywordSystem();
