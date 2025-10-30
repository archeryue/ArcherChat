import { db, COLLECTIONS } from "@/lib/firebase-admin";
import {
  UserMemory,
  MemoryFact,
  MemoryTier,
  MEMORY_LIMITS,
} from "@/types/memory";
import { v4 as uuidv4 } from "uuid";

// Collection name
const MEMORY_COLLECTION = "memory";

/**
 * Get user's memory from Firestore
 */
export async function getUserMemory(userId: string): Promise<UserMemory> {
  const memoryDoc = await db
    .collection(COLLECTIONS.USERS)
    .doc(userId)
    .collection(MEMORY_COLLECTION)
    .doc("data")
    .get();

  if (!memoryDoc.exists) {
    // Initialize empty memory
    const emptyMemory: UserMemory = {
      user_id: userId,
      facts: [],
      stats: {
        total_facts: 0,
        token_usage: 0,
        last_cleanup: new Date(),
      },
      updated_at: new Date(),
    };
    return emptyMemory;
  }

  const data = memoryDoc.data()!;

  // Convert Firestore timestamps to Dates
  return {
    user_id: userId,
    facts: (data.facts || []).map((f: any) => ({
      ...f,
      created_at: f.created_at?.toDate() || new Date(),
      last_used_at: f.last_used_at?.toDate() || new Date(),
      expires_at: f.expires_at?.toDate() || null,
    })),
    stats: {
      ...data.stats,
      last_cleanup: data.stats?.last_cleanup?.toDate() || new Date(),
    },
    updated_at: data.updated_at?.toDate() || new Date(),
  };
}

/**
 * Save user's memory to Firestore
 */
export async function saveUserMemory(
  userId: string,
  facts: MemoryFact[]
): Promise<void> {
  const memory: UserMemory = {
    user_id: userId,
    facts,
    stats: {
      total_facts: facts.length,
      token_usage: estimateTokenUsage(facts),
      last_cleanup: new Date(),
    },
    updated_at: new Date(),
  };

  await db
    .collection(COLLECTIONS.USERS)
    .doc(userId)
    .collection(MEMORY_COLLECTION)
    .doc("data")
    .set(memory);
}

/**
 * Check if a fact is duplicate based on content similarity
 */
function isDuplicateFact(existingFacts: MemoryFact[], newFact: MemoryFact): boolean {
  // Normalize content for comparison (lowercase, trim)
  const normalizedNew = newFact.content.toLowerCase().trim();

  return existingFacts.some(existing => {
    const normalizedExisting = existing.content.toLowerCase().trim();

    // Check for exact match
    if (normalizedExisting === normalizedNew) {
      return true;
    }

    // Check for high similarity (>80% overlap)
    const similarity = calculateSimilarity(normalizedExisting, normalizedNew);
    return similarity > 0.8;
  });
}

/**
 * Calculate simple similarity score between two strings
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  // Count matching characters
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }

  return matches / longer.length;
}

/**
 * Add new facts to user's memory (with deduplication)
 */
export async function addMemoryFacts(
  userId: string,
  newFacts: MemoryFact[]
): Promise<void> {
  const memory = await getUserMemory(userId);

  // Filter out duplicate facts
  const uniqueNewFacts = newFacts.filter(
    newFact => !isDuplicateFact(memory.facts, newFact)
  );

  if (uniqueNewFacts.length === 0) {
    console.log("[Memory] All new facts are duplicates, skipping");
    return;
  }

  if (uniqueNewFacts.length < newFacts.length) {
    console.log(
      `[Memory] Filtered out ${newFacts.length - uniqueNewFacts.length} duplicate facts`
    );
  }

  // Add only unique facts
  memory.facts.push(...uniqueNewFacts);

  await saveUserMemory(userId, memory.facts);
}

/**
 * Delete a specific fact
 */
export async function deleteMemoryFact(
  userId: string,
  factId: string
): Promise<void> {
  const memory = await getUserMemory(userId);
  memory.facts = memory.facts.filter((f) => f.id !== factId);
  await saveUserMemory(userId, memory.facts);
}

/**
 * Clear all memory for a user
 */
export async function clearUserMemory(userId: string): Promise<void> {
  await saveUserMemory(userId, []);
}

/**
 * Mark facts as used (increment use_count, update last_used_at)
 */
export async function markMemoryUsed(
  userId: string,
  factIds: string[]
): Promise<void> {
  const memory = await getUserMemory(userId);

  memory.facts = memory.facts.map((fact) => {
    if (factIds.includes(fact.id)) {
      return {
        ...fact,
        use_count: fact.use_count + 1,
        last_used_at: new Date(),
      };
    }
    return fact;
  });

  await saveUserMemory(userId, memory.facts);
}

/**
 * Estimate token usage for facts
 * Rough estimate: ~4 characters per token
 */
export function estimateTokenUsage(facts: MemoryFact[]): number {
  const totalChars = facts.reduce((sum, fact) => sum + fact.content.length, 0);
  return Math.ceil(totalChars / 4);
}

/**
 * Calculate expiry date for a fact based on its tier
 */
export function calculateExpiry(tier: MemoryTier): Date | null {
  if (tier === MemoryTier.CORE) return null;

  const now = new Date();
  const days = MEMORY_LIMITS[tier].max_age;

  if (days === Infinity) return null;

  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Generate a unique ID for a memory fact
 */
export function generateMemoryId(): string {
  return uuidv4();
}

/**
 * Calculate days between two dates
 */
export function daysBetween(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
