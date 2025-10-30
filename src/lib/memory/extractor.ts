import { getGeminiModel } from "@/lib/gemini";
import { db, COLLECTIONS } from "@/lib/firebase-admin";
import {
  MemoryFact,
  MemoryCategory,
  MemoryTier,
} from "@/types/memory";
import {
  generateMemoryId,
  calculateExpiry,
  addMemoryFacts,
} from "./storage";

const EXTRACTION_PROMPT = `You are a memory extraction system. Analyze this conversation and extract ONLY important, lasting facts about the user.

RULES:
1. Extract personal facts, strong preferences, and ongoing projects
2. DO NOT extract: one-time questions, general knowledge, exploratory topics, hypothetical discussions
3. Be selective - only extract facts worth remembering long-term (3-6 months)
4. Assign confidence: 1.0 = certain, 0.7 = likely, 0.5 = possible
5. Only return facts with confidence >= 0.6

CATEGORIES:
- profile: Name, occupation, location, family, interests, background
- preference: Strong likes/dislikes, work style, communication preferences, habits
- technical: Programming languages, tools, frameworks, tech stack, methodologies
- project: Current work, ongoing projects, goals, challenges

TIERS (retention period):
- core: Permanent facts (profile information, fundamental preferences) - never expires
- important: Long-term preferences and technical info - 90 days
- context: Current projects and temporary context - 30 days

CONVERSATION:
{conversation_text}

Return ONLY valid JSON in this exact format:
{
  "facts": [
    {
      "content": "Brief, clear statement (e.g., 'Prefers TypeScript over JavaScript')",
      "category": "profile|preference|technical|project",
      "confidence": 0.6-1.0,
      "tier": "core|important|context"
    }
  ]
}

Return empty facts array if nothing important to extract.`;

interface ExtractedFact {
  content: string;
  category: MemoryCategory;
  confidence: number;
  tier: MemoryTier;
}

interface ExtractionResult {
  facts: ExtractedFact[];
}

/**
 * Keywords that trigger immediate memory extraction
 */
const MEMORY_TRIGGER_KEYWORDS = [
  "remember that",
  "my name is",
  "i prefer",
  "i work as",
  "i'm a",
  "i am a",
  "don't forget",
  "keep in mind",
  "for future reference",
  "just so you know",
  "i like",
  "i don't like",
  "i hate",
  "i love",
];

/**
 * Check if a message contains memory trigger keywords
 */
export function hasMemoryTriggerKeywords(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return MEMORY_TRIGGER_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Check if a conversation should trigger memory extraction
 * Uses hybrid strategy: keyword-based OR conversation-based
 */
export function shouldExtractMemory(
  messageCount: number,
  durationMs: number,
  hasKeywordTrigger: boolean = false
): boolean {
  // Strategy 1: Immediate extraction if keyword detected
  if (hasKeywordTrigger) {
    return true;
  }

  // Strategy 2: Automatic extraction after long conversation
  const MIN_MESSAGES = 5;
  const MIN_DURATION_MS = 2 * 60 * 1000; // 2 minutes

  return messageCount >= MIN_MESSAGES && durationMs >= MIN_DURATION_MS;
}

/**
 * Extract memory facts from a conversation using Gemini
 */
export async function extractMemoriesFromConversation(
  conversationId: string,
  userId: string
): Promise<MemoryFact[]> {
  try {
    // 1. Get conversation messages
    const messages = await getConversationMessages(conversationId);

    if (messages.length === 0) {
      return [];
    }

    // 2. Format conversation text
    const conversationText = messages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    // 3. Call Gemini for extraction
    const model = getGeminiModel();
    const prompt = EXTRACTION_PROMPT.replace("{conversation_text}", conversationText);

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // 4. Parse JSON response
    const extracted: ExtractionResult = parseExtractionResult(text);

    // 5. Convert to MemoryFact objects
    const facts: MemoryFact[] = extracted.facts.map((fact) => ({
      id: generateMemoryId(),
      content: fact.content,
      category: fact.category,
      tier: fact.tier,
      confidence: fact.confidence,
      created_at: new Date(),
      last_used_at: new Date(),
      use_count: 0,
      expires_at: calculateExpiry(fact.tier),
      extracted_from: conversationId,
      auto_extracted: true,
    }));

    return facts;
  } catch (error) {
    console.error("Error extracting memories:", error);
    return [];
  }
}

/**
 * Get messages from a conversation
 */
async function getConversationMessages(
  conversationId: string
): Promise<Array<{ role: string; content: string }>> {
  const messagesSnapshot = await db
    .collection(COLLECTIONS.CONVERSATIONS)
    .doc(conversationId)
    .collection(COLLECTIONS.MESSAGES)
    .orderBy("created_at", "asc")
    .get();

  return messagesSnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      role: data.role,
      content: data.content,
    };
  });
}

/**
 * Parse extraction result from Gemini response
 */
function parseExtractionResult(text: string): ExtractionResult {
  try {
    // Try to extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : text;

    // Remove any leading/trailing whitespace and parse
    const parsed = JSON.parse(jsonText.trim());

    // Validate structure
    if (!parsed.facts || !Array.isArray(parsed.facts)) {
      return { facts: [] };
    }

    // Validate each fact
    const validFacts = parsed.facts.filter((fact: any) => {
      return (
        fact.content &&
        typeof fact.content === "string" &&
        fact.category &&
        Object.values(MemoryCategory).includes(fact.category) &&
        fact.tier &&
        Object.values(MemoryTier).includes(fact.tier) &&
        typeof fact.confidence === "number" &&
        fact.confidence >= 0.6 &&
        fact.confidence <= 1.0
      );
    });

    return { facts: validFacts };
  } catch (error) {
    console.error("Failed to parse extraction result:", error);
    return { facts: [] };
  }
}

/**
 * Extract and save memories after a conversation ends
 * This is the main entry point called from the chat API
 */
export async function processConversationMemory(
  conversationId: string,
  userId: string,
  lastUserMessage?: string
): Promise<number> {
  try {
    // 1. Get conversation details
    const conversationDoc = await db
      .collection(COLLECTIONS.CONVERSATIONS)
      .doc(conversationId)
      .get();

    if (!conversationDoc.exists) {
      return 0;
    }

    const conversationData = conversationDoc.data()!;
    const messageCount = await getMessageCount(conversationId);
    const duration =
      conversationData.updated_at.toDate().getTime() -
      conversationData.created_at.toDate().getTime();

    // 2. Check for keyword trigger in last message
    const hasKeywordTrigger = lastUserMessage
      ? hasMemoryTriggerKeywords(lastUserMessage)
      : false;

    if (hasKeywordTrigger) {
      console.log("[Memory] Keyword trigger detected, extracting immediately");
    }

    // 3. Check if should extract (hybrid strategy)
    if (!shouldExtractMemory(messageCount, duration, hasKeywordTrigger)) {
      return 0;
    }

    // 3. Extract memories
    const newFacts = await extractMemoriesFromConversation(conversationId, userId);

    if (newFacts.length === 0) {
      return 0;
    }

    // 4. Add to user's memory
    await addMemoryFacts(userId, newFacts);

    console.log(
      `[Memory] Extracted ${newFacts.length} facts from conversation ${conversationId}`
    );

    return newFacts.length;
  } catch (error) {
    console.error("Error processing conversation memory:", error);
    return 0;
  }
}

/**
 * Get message count for a conversation
 */
async function getMessageCount(conversationId: string): Promise<number> {
  const messagesSnapshot = await db
    .collection(COLLECTIONS.CONVERSATIONS)
    .doc(conversationId)
    .collection(COLLECTIONS.MESSAGES)
    .get();

  return messagesSnapshot.size;
}
