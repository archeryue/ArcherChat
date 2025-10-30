import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  IAIProvider,
  AIMessage,
  AIResponse,
  ProviderMetadata,
} from "@/types/ai-providers";

export class GeminiProvider implements IAIProvider {
  private client: GoogleGenerativeAI;
  private modelName: string;

  constructor(apiKey?: string, model?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("Gemini API key is required");
    }

    this.client = new GoogleGenerativeAI(key);
    this.modelName = model || "gemini-2.0-flash-exp";
  }

  getName(): string {
    return "gemini";
  }

  async *streamResponse(
    messages: AIMessage[],
    systemPrompt?: string,
    temperature?: number
  ): AsyncGenerator<string, void, unknown> {
    const model = this.client.getGenerativeModel({
      model: this.modelName,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: temperature ?? 0.7,
      },
    });

    // Convert messages to Gemini format
    const history = messages.slice(0, -1).map((msg) => ({
      role: msg.role === "user" ? "user" : ("model" as const),
      parts: [{ text: msg.content }],
    }));

    const lastMessage = messages[messages.length - 1];

    const chat = model.startChat({
      history: history,
    });

    try {
      const result = await chat.sendMessageStream(lastMessage.content);

      for await (const chunk of result.stream) {
        const text = chunk.text();
        yield text;
      }
    } catch (error) {
      console.error("Gemini API Error:", error);
      throw error;
    }
  }

  async generateResponse(
    messages: AIMessage[],
    systemPrompt?: string,
    temperature?: number
  ): Promise<AIResponse> {
    const model = this.client.getGenerativeModel({
      model: this.modelName,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: temperature ?? 0.7,
      },
    });

    // Convert messages to Gemini format
    const history = messages.slice(0, -1).map((msg) => ({
      role: msg.role === "user" ? "user" : ("model" as const),
      parts: [{ text: msg.content }],
    }));

    const lastMessage = messages[messages.length - 1];

    const chat = model.startChat({
      history: history,
    });

    try {
      const result = await chat.sendMessage(lastMessage.content);
      const response = result.response;
      const text = response.text();

      return {
        content: text,
        finishReason: "stop",
        usage: {
          // Gemini doesn't provide token counts in free tier
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      };
    } catch (error) {
      console.error("Gemini API Error:", error);
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if API key is set
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return false;
      }

      // Try a simple test request (optional, can be expensive)
      // For now, just check if API key exists
      return true;
    } catch (error) {
      console.error("Gemini availability check failed:", error);
      return false;
    }
  }

  static getMetadata(): ProviderMetadata {
    return {
      name: "gemini",
      displayName: "Google Gemini",
      type: "gemini",
      description: "Google's Gemini AI models (2.0 Flash)",
      requiresApiKey: true,
      supportsStreaming: true,
      supportedModels: [
        "gemini-2.0-flash-exp",
        "gemini-1.5-pro",
        "gemini-1.5-flash",
      ],
    };
  }
}
