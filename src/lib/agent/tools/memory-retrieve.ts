/**
 * Memory Retrieve Tool
 *
 * Retrieves relevant facts from user's memory based on query.
 */

import { ToolParameter, ToolResult } from '@/types/agent';
import { MemoryCategory, MemoryTier } from '@/types/memory';
import { BaseTool, successResult, errorResult, estimateTokens } from './base';
import { getUserMemory } from '@/lib/memory/storage';

export class MemoryRetrieveTool extends BaseTool {
  name = 'memory_retrieve';

  description = `Retrieve relevant facts from user's memory. Use this to personalize responses
with remembered information about the user such as preferences, technical context, projects,
and personal details. Returns relevant facts sorted by relevance.`;

  parameters: ToolParameter[] = [
    {
      name: 'query',
      type: 'string',
      description: 'What information to retrieve (e.g., "user preferences", "technical stack")',
      required: true,
    },
    {
      name: 'categories',
      type: 'array',
      description: 'Filter by categories: profile, preference, technical, project',
      required: false,
    },
    {
      name: 'maxResults',
      type: 'number',
      description: 'Maximum number of facts to return (default: 10)',
      required: false,
      default: 10,
    },
  ];

  protected async run(params: Record<string, unknown>): Promise<ToolResult> {
    const query = params.query as string;
    const categories = params.categories as string[] | undefined;
    const maxResults = Math.min((params.maxResults as number) || 10, 20);

    try {
      // Get user's memory
      const memory = await getUserMemory(this.userId);

      if (!memory.facts || memory.facts.length === 0) {
        return successResult(
          {
            facts: [],
            totalFacts: 0,
            message: 'No memories found for this user',
          },
          {
            executionTime: 0,
            tokensUsed: 0,
          }
        );
      }

      // Filter by categories if specified
      let filteredFacts = memory.facts;
      if (categories && categories.length > 0) {
        const validCategories = categories.filter((c) =>
          Object.values(MemoryCategory).includes(c as MemoryCategory)
        );
        if (validCategories.length > 0) {
          filteredFacts = filteredFacts.filter((f) =>
            validCategories.includes(f.category)
          );
        }
      }

      // Score facts by relevance to query
      const queryTerms = query.toLowerCase().split(/\s+/);
      const scoredFacts = filteredFacts.map((fact) => {
        const content = fact.content.toLowerCase();
        const category = fact.category.toLowerCase();

        // Calculate relevance score
        let score = 0;

        // Direct term matches
        for (const term of queryTerms) {
          if (content.includes(term)) score += 2;
          if (category.includes(term)) score += 1;
        }

        // Tier bonus (CORE facts are more important)
        if (fact.tier === MemoryTier.CORE) score += 1;
        if (fact.tier === MemoryTier.IMPORTANT) score += 0.5;

        // Recency bonus
        const daysSinceUsed = Math.floor(
          (Date.now() - new Date(fact.last_used_at).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        if (daysSinceUsed < 7) score += 0.5;

        // Usage frequency bonus
        if (fact.use_count > 5) score += 0.3;

        return { fact, score };
      });

      // Sort by score and take top results
      const topFacts = scoredFacts
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults)
        .filter((sf) => sf.score > 0)
        .map((sf) => ({
          id: sf.fact.id,
          content: sf.fact.content,
          category: sf.fact.category,
          tier: sf.fact.tier,
          confidence: sf.fact.confidence,
          useCount: sf.fact.use_count,
          relevanceScore: sf.score,
        }));

      // If no relevant facts found, return all facts up to limit
      if (topFacts.length === 0 && filteredFacts.length > 0) {
        const allFacts = filteredFacts.slice(0, maxResults).map((fact) => ({
          id: fact.id,
          content: fact.content,
          category: fact.category,
          tier: fact.tier,
          confidence: fact.confidence,
          useCount: fact.use_count,
          relevanceScore: 0,
        }));

        return successResult(
          {
            facts: allFacts,
            totalFacts: filteredFacts.length,
            query,
            message: 'No specific matches found, returning all available facts',
          },
          {
            executionTime: 0,
            tokensUsed: estimateTokens(JSON.stringify(allFacts)),
          }
        );
      }

      return successResult(
        {
          facts: topFacts,
          totalFacts: filteredFacts.length,
          returnedCount: topFacts.length,
          query,
          languagePreference: memory.language_preference,
        },
        {
          executionTime: 0,
          tokensUsed: estimateTokens(JSON.stringify(topFacts)),
        }
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Memory retrieval failed';
      return errorResult(`Memory retrieval failed: ${message}`);
    }
  }
}

// Export singleton instance
export const memoryRetrieveTool = new MemoryRetrieveTool();
