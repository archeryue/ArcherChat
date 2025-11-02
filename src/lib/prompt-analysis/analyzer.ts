import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_MODELS, ModelTier } from "@/config/models";
import {
  PromptAnalysisInput,
  PromptAnalysisResult,
  UserIntent,
} from "@/types/prompt-analysis";

/**
 * PromptAnalysis Module
 *
 * Analyzes user input using Gemini Flash Lite to determine:
 * - User intent
 * - Required actions (web search, memory retrieval, memory extraction, image generation)
 * - Language preference
 * - Extracts memory facts immediately if needed
 *
 * Cost: ~$0.000002 per analysis (~50 tokens)
 * Latency: ~200-400ms
 */
export class PromptAnalyzer {
  private client: GoogleGenerativeAI;
  private modelName: string;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("Gemini API key is required for PromptAnalyzer");
    }

    this.client = new GoogleGenerativeAI(key);
    this.modelName = GEMINI_MODELS[ModelTier.LITE]; // Use Flash Lite for cost efficiency
  }

  /**
   * Build the analysis prompt with user input and context
   */
  private buildAnalysisPrompt(input: PromptAnalysisInput): string {
    const { message, files, conversationHistory, userSettings } = input;

    // Build conversation context
    let contextStr = "";
    if (conversationHistory && conversationHistory.length > 0) {
      contextStr = conversationHistory
        .slice(-5) // Last 5 messages
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join("\n");
    }

    return `You are a prompt analyzer for a bilingual AI chatbot. Analyze the user's input and determine:

1. Primary intent (question/image_generation/casual_chat/command)
2. Required actions:
   - Web search: Does this need current, real-time information? If yes, generate optimized search query
   - Memory retrieval: Should we recall user's past preferences/info? If yes, what search terms?
   - Memory extraction: Should we save information from this conversation? If yes, EXTRACT THE FACTS NOW
   - Image generation: Is the user asking to create/generate an image?
3. Language preference (english/chinese/hybrid)
4. Confidence level (0.0-1.0)

IMPORTANT: If memory extraction is needed, you must extract the facts IMMEDIATELY and include them in your response.
Do not just flag "needed=true". Actually extract the facts with proper categorization and tier.

Memory extraction format:
{
  "content": "factual statement",
  "category": "PROFILE" | "PREFERENCE" | "TECHNICAL" | "PROJECT",
  "tier": "CORE" | "IMPORTANT" | "CONTEXT",
  "confidence": 0.0-1.0,
  "keywords": ["relevant", "keywords"],
  "source": "user statement or conversation"
}

Categories:
- PROFILE: Personal info (name, birthday, location, family, health)
- PREFERENCE: Likes/dislikes, habits, choices
- TECHNICAL: Skills, tools, technologies they use
- PROJECT: Current work, projects, goals

Tiers:
- CORE: Critical info, never expires (name, allergies, core preferences)
- IMPORTANT: Important info, expires in 90 days (current preferences, technical context)
- CONTEXT: Temporary context, expires in 30 days (current projects, temporary interests)

Return ONLY valid JSON matching this exact schema:
{
  "intent": "question" | "image_generation" | "casual_chat" | "command",
  "actions": {
    "web_search": {
      "needed": boolean,
      "query": string | undefined,
      "reason": string | undefined,
      "priority": "high" | "medium" | "low" | undefined
    },
    "memory_retrieval": {
      "needed": boolean,
      "search_terms": string[] | undefined,
      "categories": ("PROFILE" | "PREFERENCE" | "TECHNICAL" | "PROJECT")[] | undefined
    },
    "memory_extraction": {
      "needed": boolean,
      "trigger": "explicit" | "implicit",
      "facts": [/* MemoryFact objects */] | undefined
    },
    "image_generation": {
      "needed": boolean,
      "description": string | undefined
    }
  },
  "language": "english" | "chinese" | "hybrid",
  "sentiment": "positive" | "neutral" | "negative" | undefined,
  "urgency": "high" | "normal" | "low" | undefined,
  "confidence": 0.0-1.0,
  "reasoning": string | undefined
}

Examples:

Input: "What's the latest iPhone model?"
Output: {
  "intent": "question",
  "actions": {
    "web_search": {"needed": true, "query": "latest iPhone model 2025", "reason": "User asks for current product information", "priority": "high"},
    "memory_retrieval": {"needed": false},
    "memory_extraction": {"needed": false, "trigger": "implicit"},
    "image_generation": {"needed": false}
  },
  "language": "english",
  "confidence": 0.92,
  "reasoning": "User explicitly asks for 'latest' which requires real-time data"
}

Input: "Remember my birthday is June 5th"
Output: {
  "intent": "command",
  "actions": {
    "web_search": {"needed": false},
    "memory_retrieval": {"needed": false},
    "memory_extraction": {
      "needed": true,
      "trigger": "explicit",
      "facts": [
        {
          "content": "User's birthday is June 5th",
          "category": "PROFILE",
          "tier": "CORE",
          "confidence": 0.98,
          "keywords": ["birthday", "June 5th"],
          "source": "User explicitly stated: 'Remember my birthday is June 5th'"
        }
      ]
    },
    "image_generation": {"needed": false}
  },
  "language": "english",
  "confidence": 0.98,
  "reasoning": "User explicitly says 'remember', clear memory extraction command"
}

Input: "I really love spicy Thai food"
Output: {
  "intent": "casual_chat",
  "actions": {
    "web_search": {"needed": false},
    "memory_retrieval": {"needed": false},
    "memory_extraction": {
      "needed": true,
      "trigger": "implicit",
      "facts": [
        {
          "content": "User loves spicy Thai food",
          "category": "PREFERENCE",
          "tier": "IMPORTANT",
          "confidence": 0.85,
          "keywords": ["spicy", "Thai food", "food preference"],
          "source": "User stated: 'I really love spicy Thai food'"
        }
      ]
    },
    "image_generation": {"needed": false}
  },
  "language": "english",
  "confidence": 0.88,
  "reasoning": "User expresses strong preference, worth saving even without 'remember' keyword"
}

Input: "生成一幅星空图片"
Output: {
  "intent": "image_generation",
  "actions": {
    "web_search": {"needed": false},
    "memory_retrieval": {"needed": false},
    "memory_extraction": {"needed": false, "trigger": "implicit"},
    "image_generation": {"needed": true, "description": "starry night sky"}
  },
  "language": "chinese",
  "confidence": 0.95,
  "reasoning": "User explicitly requests image generation in Chinese"
}

Input: "How are you?"
Output: {
  "intent": "casual_chat",
  "actions": {
    "web_search": {"needed": false},
    "memory_retrieval": {"needed": false},
    "memory_extraction": {"needed": false, "trigger": "implicit"},
    "image_generation": {"needed": false}
  },
  "language": "english",
  "confidence": 0.99,
  "reasoning": "Simple greeting, no special actions needed"
}

Current settings:
- Web search enabled: ${userSettings?.webSearchEnabled ?? false}
- User language preference: ${userSettings?.languagePreference || "auto-detect"}

User input: "${message}"
Files attached: ${files?.length || 0}
${contextStr ? `\nRecent conversation:\n${contextStr}` : ""}

Analyze and return JSON:`;
  }

  /**
   * Normalize tier values from uppercase to lowercase enum values
   */
  private normalizeTier(tier: string): string {
    const tierMap: Record<string, string> = {
      'CORE': 'core',
      'IMPORTANT': 'important',
      'CONTEXT': 'context',
    };
    return tierMap[tier] || tier.toLowerCase();
  }

  /**
   * Parse and validate the analysis result from Gemini
   */
  private parseAnalysisResult(rawResponse: string): PromptAnalysisResult {
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const result = JSON.parse(jsonMatch[0]) as PromptAnalysisResult;

      // Validate required fields
      if (!result.intent || !result.actions || !result.language || result.confidence === undefined) {
        throw new Error("Missing required fields in analysis result");
      }

      // Ensure confidence is in valid range
      result.confidence = Math.max(0, Math.min(1, result.confidence));

      // Normalize tier and category values in extracted facts
      if (result.actions.memory_extraction.facts && result.actions.memory_extraction.facts.length > 0) {
        console.log('[PromptAnalyzer] Normalizing', result.actions.memory_extraction.facts.length, 'facts');
        result.actions.memory_extraction.facts = result.actions.memory_extraction.facts.map(fact => {
          const normalized = {
            ...fact,
            tier: this.normalizeTier(fact.tier as string) as any,
            category: (fact.category as string).toLowerCase() as any, // Convert to lowercase
          };
          console.log(`[PromptAnalyzer] Normalized tier: ${fact.tier} → ${normalized.tier}, category: ${fact.category} → ${normalized.category}`);
          return normalized;
        });
      }

      return result;
    } catch (error) {
      console.error("Error parsing analysis result:", error);
      console.error("Raw response:", rawResponse);
      throw error;
    }
  }

  /**
   * Analyze user input and return structured decisions
   *
   * @param input - User message, files, conversation history, settings
   * @returns PromptAnalysisResult with intent, actions, and extracted facts
   */
  async analyze(input: PromptAnalysisInput): Promise<PromptAnalysisResult> {
    try {
      const model = this.client.getGenerativeModel({
        model: this.modelName,
      });

      const prompt = this.buildAnalysisPrompt(input);

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      const analysis = this.parseAnalysisResult(text);

      console.log(`[PromptAnalyzer] Analysis complete:`, {
        intent: analysis.intent,
        confidence: analysis.confidence,
        actions: {
          web_search: analysis.actions.web_search.needed,
          memory_retrieval: analysis.actions.memory_retrieval.needed,
          memory_extraction: analysis.actions.memory_extraction.needed,
          image_generation: analysis.actions.image_generation.needed,
        },
        facts_extracted: analysis.actions.memory_extraction.facts?.length || 0,
      });

      return analysis;
    } catch (error) {
      console.error("[PromptAnalyzer] Error during analysis:", error);

      // Error handling: Option B - Assume no special actions, continue normally
      console.log("[PromptAnalyzer] Falling back to default analysis (no special actions)");

      return this.getDefaultAnalysis(input);
    }
  }

  /**
   * Fallback analysis when PromptAnalyzer fails
   * Option B: Assume no special actions, continue normally
   */
  private getDefaultAnalysis(input: PromptAnalysisInput): PromptAnalysisResult {
    // Detect language from input
    const hasChineseChars = /[\u4e00-\u9fa5]/.test(input.message);
    const hasEnglishChars = /[a-zA-Z]/.test(input.message);

    let language: "english" | "chinese" | "hybrid" = "english";
    if (hasChineseChars && hasEnglishChars) {
      language = "hybrid";
    } else if (hasChineseChars) {
      language = "chinese";
    }

    return {
      intent: "question", // Assume it's a question
      actions: {
        web_search: { needed: false },
        memory_retrieval: { needed: false },
        memory_extraction: { needed: false, trigger: "implicit" },
        image_generation: { needed: false },
      },
      language,
      confidence: 0.5, // Low confidence for fallback
      reasoning: "Fallback analysis - PromptAnalyzer failed, assuming no special actions needed",
    };
  }
}

// Export singleton instance
export const promptAnalyzer = new PromptAnalyzer();
