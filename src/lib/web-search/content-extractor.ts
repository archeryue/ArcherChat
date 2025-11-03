/**
 * Content Extractor Service
 * Extracts relevant information from web page content using Gemini Flash Lite
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { ExtractionRequest, ExtractedContent } from '@/types/content-fetching';
import { getModelForTask } from '@/config/models';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Use lightweight model for background extraction tasks
const EXTRACTION_MODEL = getModelForTask("analysis");

export class ContentExtractor {
  private model;

  constructor() {
    this.model = genAI.getGenerativeModel({ model: EXTRACTION_MODEL });
  }

  /**
   * Extract relevant information from page content
   */
  async extract(request: ExtractionRequest): Promise<ExtractedContent> {
    const startTime = Date.now();
    const { content, query, url, maxOutputTokens = 500 } = request;

    try {
      console.log(`[ContentExtractor] Extracting from ${url} for query: "${query}"`);

      // Truncate content to max tokens (rough estimate: 4 chars per token)
      const maxInputChars = 10000 * 4; // ~10K tokens
      const truncatedContent = content.substring(0, maxInputChars);

      // Build extraction prompt
      const prompt = this.buildExtractionPrompt(query, url, truncatedContent);

      // Generate extraction
      const result = await this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens,
          temperature: 0.2, // Low temperature for factual extraction
        },
      });

      const response = result.response;
      const extractedInfo = response.text();

      // Parse the JSON response
      const parsed = this.parseExtractionResult(extractedInfo);

      // Estimate token usage (rough approximation)
      const inputTokens = Math.ceil(truncatedContent.length / 4);
      const outputTokens = Math.ceil(extractedInfo.length / 4);

      // Calculate cost (Gemini 2.5 Flash Lite pricing)
      // Input: $0.075 per 1M tokens, Output: $0.30 per 1M tokens
      const inputCost = (inputTokens / 1_000_000) * 0.075;
      const outputCost = (outputTokens / 1_000_000) * 0.30;
      const totalCost = (inputCost + outputCost) * 100; // Convert to cents

      const extractionTime = Date.now() - startTime;

      console.log(`[ContentExtractor] Extracted from ${url} in ${extractionTime}ms (${inputTokens}+${outputTokens} tokens, $${(totalCost/100).toFixed(4)})`);

      return {
        url,
        title: parsed.title || new URL(url).hostname,
        extractedInfo: parsed.summary,
        relevanceScore: parsed.relevanceScore,
        confidence: parsed.confidence,
        keyPoints: parsed.keyPoints,
        tokensUsed: {
          input: inputTokens,
          output: outputTokens,
        },
        cost: totalCost,
        extractionTime,
      };
    } catch (error) {
      console.error(`[ContentExtractor] Failed to extract from ${url}:`, error);

      // Return minimal result on error
      return {
        url,
        title: new URL(url).hostname,
        extractedInfo: content.substring(0, 500) + '...', // Fallback to truncated content
        relevanceScore: 0.5,
        confidence: 0.3,
        keyPoints: [],
        tokensUsed: { input: 0, output: 0 },
        cost: 0,
        extractionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Build the extraction prompt
   */
  private buildExtractionPrompt(query: string, url: string, content: string): string {
    return `You are a content extraction assistant. Extract the most relevant information from this web page that answers the user's query.

User Query: "${query}"
Page URL: ${url}

Page Content:
${content}

Your task:
1. Extract ONLY information relevant to the user's query
2. Focus on factual accuracy - cite specific data, quotes, or facts
3. Ignore navigation, ads, unrelated content
4. Provide key points as a bulleted list

Respond in this JSON format:
{
  "title": "Page title or main topic",
  "summary": "Concise 2-3 paragraph summary of relevant information (max 300 words)",
  "keyPoints": [
    "First key point or fact",
    "Second key point or fact",
    "Third key point or fact"
  ],
  "relevanceScore": 0.0-1.0 (how relevant is this page to the query),
  "confidence": 0.0-1.0 (how confident are you in the extraction)
}

IMPORTANT: Respond ONLY with valid JSON. No additional text.`;
  }

  /**
   * Parse the extraction result JSON
   */
  private parseExtractionResult(text: string): {
    title: string;
    summary: string;
    keyPoints: string[];
    relevanceScore: number;
    confidence: number;
  } {
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : text;

      const parsed = JSON.parse(jsonText);

      return {
        title: parsed.title || 'Untitled',
        summary: parsed.summary || '',
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        relevanceScore: typeof parsed.relevanceScore === 'number' ?
          Math.max(0, Math.min(1, parsed.relevanceScore)) : 0.5,
        confidence: typeof parsed.confidence === 'number' ?
          Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
      };
    } catch (error) {
      console.error('[ContentExtractor] Failed to parse extraction result:', error);

      // Fallback: return text as summary
      return {
        title: 'Extraction Failed',
        summary: text.substring(0, 500),
        keyPoints: [],
        relevanceScore: 0.3,
        confidence: 0.2,
      };
    }
  }

  /**
   * Extract from multiple pages and rank by relevance
   */
  async extractAndRank(
    pages: Array<{ url: string; content: string }>,
    query: string
  ): Promise<ExtractedContent[]> {
    // Extract from all pages
    const extractions = await Promise.all(
      pages.map(page =>
        this.extract({
          content: page.content,
          query,
          url: page.url,
        })
      )
    );

    // Sort by relevance score (highest first)
    return extractions.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
}

// Export singleton instance
export const contentExtractor = new ContentExtractor();
