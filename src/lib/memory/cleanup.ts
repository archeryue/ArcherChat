import {
  getUserMemory,
  saveUserMemory,
  estimateTokenUsage,
  daysBetween,
} from "./storage";
import {
  MemoryFact,
  MemoryTier,
  MEMORY_LIMITS,
} from "@/types/memory";

/**
 * Clean up user's memory (remove expired, enforce limits)
 */
export async function cleanupUserMemory(userId: string): Promise<void> {
  const memory = await getUserMemory(userId);
  let facts = memory.facts;

  // Step 1: Remove expired facts
  facts = removeExpiredFacts(facts);

  // Step 2: Enforce tier limits
  facts = enforceTierLimits(facts);

  // Step 3: Enforce token budget
  if (estimateTokenUsage(facts) > MEMORY_LIMITS.max_total_tokens) {
    facts = enforceTokenBudget(facts, MEMORY_LIMITS.max_total_tokens);
  }

  // Save cleaned memory (preserve language preference!)
  await saveUserMemory(userId, facts, memory.language_preference);
}

/**
 * Remove facts that have expired
 */
function removeExpiredFacts(facts: MemoryFact[]): MemoryFact[] {
  const now = new Date();
  return facts.filter((fact) => {
    if (!fact.expires_at) return true; // CORE facts never expire
    return fact.expires_at > now;
  });
}

/**
 * Enforce max facts per tier
 */
function enforceTierLimits(facts: MemoryFact[]): MemoryFact[] {
  // Group by tier
  const byTier: Record<MemoryTier, MemoryFact[]> = {
    [MemoryTier.CORE]: [],
    [MemoryTier.IMPORTANT]: [],
    [MemoryTier.CONTEXT]: [],
  };

  facts.forEach((fact) => {
    // Ensure tier exists in byTier before pushing
    if (fact.tier && byTier[fact.tier]) {
      byTier[fact.tier].push(fact);
    } else {
      // Default to CONTEXT if tier is invalid
      console.warn(`Invalid tier "${fact.tier}" for fact, defaulting to CONTEXT`);
      byTier[MemoryTier.CONTEXT].push(fact);
    }
  });

  // Keep top N per tier
  const kept: MemoryFact[] = [];

  Object.entries(byTier).forEach(([tier, tierFacts]) => {
    const limit = MEMORY_LIMITS[tier as MemoryTier].max_facts;
    const sorted = sortByImportance(tierFacts);
    kept.push(...sorted.slice(0, limit));
  });

  return kept;
}

/**
 * Prune facts to fit within token budget
 */
function enforceTokenBudget(facts: MemoryFact[], budget: number): MemoryFact[] {
  // Sort by importance
  const sorted = sortByImportance(facts);
  const result: MemoryFact[] = [];
  let tokens = 0;

  for (const fact of sorted) {
    const factTokens = Math.ceil(fact.content.length / 4);

    // Always keep CORE facts
    if (fact.tier === MemoryTier.CORE) {
      result.push(fact);
      tokens += factTokens;
    } else if (tokens + factTokens <= budget) {
      result.push(fact);
      tokens += factTokens;
    }
  }

  return result;
}

/**
 * Sort facts by importance score
 */
export function sortByImportance(facts: MemoryFact[]): MemoryFact[] {
  return [...facts].sort((a, b) => {
    const scoreA = calculateImportanceScore(a);
    const scoreB = calculateImportanceScore(b);
    return scoreB - scoreA;
  });
}

/**
 * Calculate importance score for a fact
 */
export function calculateImportanceScore(fact: MemoryFact): number {
  // Confidence: 40% weight
  const confidenceScore = fact.confidence * 40;

  // Recency: 30% weight (newer = better)
  const daysSinceCreated = daysBetween(fact.created_at, new Date());
  const recencyScore = Math.max(0, 30 - daysSinceCreated / 3);

  // Usage: 30% weight
  const usageScore = Math.min(fact.use_count * 3, 30);

  return confidenceScore + recencyScore + usageScore;
}
