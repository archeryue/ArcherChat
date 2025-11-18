/**
 * Memory Save Tool
 *
 * Saves new facts to user's memory with automatic deduplication.
 */

import { ToolParameter, ToolResult } from '@/types/agent';
import {
  MemoryCategory,
  MemoryTier,
  MemoryFact,
  LanguagePreference,
} from '@/types/memory';
import { BaseTool, successResult, errorResult } from './base';
import {
  addMemoryFacts,
  generateMemoryId,
  calculateExpiry,
} from '@/lib/memory/storage';

export class MemorySaveTool extends BaseTool {
  name = 'memory_save';

  description = `Save important facts about the user to memory for future personalization.
Use this to remember user preferences, technical context, project details, and personal
information. Facts are automatically deduplicated and organized by tier.

Guidelines for what to save:
- CORE tier: Name, birthday, allergies, permanent preferences
- IMPORTANT tier: Job, skills, significant preferences
- CONTEXT tier: Current projects, temporary context`;

  parameters: ToolParameter[] = [
    {
      name: 'facts',
      type: 'array',
      description:
        'Array of facts to save. Each fact should have: content, category, tier, confidence',
      required: true,
    },
    {
      name: 'languagePreference',
      type: 'string',
      description: "User's language preference: english, chinese, or hybrid",
      required: false,
      enum: ['english', 'chinese', 'hybrid'],
    },
  ];

  protected async run(params: Record<string, unknown>): Promise<ToolResult> {
    const factsInput = params.facts as Array<{
      content: string;
      category: string;
      tier: string;
      confidence?: number;
    }>;
    const languagePreference = params.languagePreference as
      | LanguagePreference
      | undefined;

    if (!factsInput || factsInput.length === 0) {
      return errorResult('No facts provided to save');
    }

    try {
      // Convert input to MemoryFact format
      const facts: MemoryFact[] = factsInput.map((input) => {
        // Validate and convert category
        const category = Object.values(MemoryCategory).includes(
          input.category as MemoryCategory
        )
          ? (input.category as MemoryCategory)
          : MemoryCategory.PREFERENCE;

        // Validate and convert tier
        const tier = Object.values(MemoryTier).includes(
          input.tier as MemoryTier
        )
          ? (input.tier as MemoryTier)
          : MemoryTier.CONTEXT;

        // Calculate confidence
        const confidence = Math.min(
          Math.max(input.confidence || 0.8, 0),
          1
        );

        return {
          id: generateMemoryId(),
          content: input.content,
          category,
          tier,
          confidence,
          created_at: new Date(),
          last_used_at: new Date(),
          use_count: 0,
          expires_at: calculateExpiry(tier),
          extracted_from: this.conversationId,
          auto_extracted: true,
        };
      });

      // Save to memory (deduplication handled by addMemoryFacts)
      await addMemoryFacts(this.userId, facts, languagePreference);

      return successResult(
        {
          savedCount: facts.length,
          facts: facts.map((f) => ({
            id: f.id,
            content: f.content,
            category: f.category,
            tier: f.tier,
          })),
          message: `Successfully saved ${facts.length} fact(s) to memory`,
        },
        {
          executionTime: 0,
        }
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Memory save failed';
      return errorResult(`Memory save failed: ${message}`);
    }
  }
}

// Export singleton instance
export const memorySaveTool = new MemorySaveTool();
