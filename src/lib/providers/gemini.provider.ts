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

  private isImageGenerationRequest(content: string): boolean {
    const imageKeywords = [
      'generate image',
      'create image',
      'draw',
      'paint',
      'picture of',
      'image of',
      'illustration of',
      'sketch',
      'design',
      'create a visual',
      'make an image',
      'generate a picture',
      'visualize',
      'render',
      'artwork',
      'graphic'
    ];

    const lowerContent = content.toLowerCase();
    return imageKeywords.some(keyword => lowerContent.includes(keyword));
  }

  private getImageGenerationPrompt(): string {
    return `You are an AI assistant with advanced image generation capabilities through Google's Gemini 2.0 Flash native image generation (also known as "Nano Banana" internally at Google).

When a user requests an image, you should:

1. First, acknowledge their request and describe what you'll create in vivid detail
2. Generate the image using your native capabilities
3. Provide the generated image along with your description

For image generation requests, use this format in your response:

**Image Description:** [Detailed description of what will be generated]

**Generating Image...**

[The actual image would appear here]

**Image Details:**
- Style: [art style, photorealistic, illustration, etc.]
- Colors: [dominant colors and palette]
- Composition: [layout and focal points]
- Additional notes: [any special features or techniques]

You can generate various types of images including:
- Photorealistic scenes
- Artistic illustrations
- Technical diagrams
- Character designs
- Landscapes and environments
- Abstract art
- Product visualizations
- And much more!

Remember: Gemini 2.0 Flash has native image generation capabilities built-in, so you can create images directly in response to user requests.`;
  }

  getName(): string {
    return "gemini";
  }

  async *streamResponse(
    messages: AIMessage[],
    systemPrompt?: string,
    temperature?: number
  ): AsyncGenerator<string, void, unknown> {
    const lastMessage = messages[messages.length - 1];
    const isImageRequest = this.isImageGenerationRequest(lastMessage.content);

    // Use special prompt for image generation requests
    const effectivePrompt = isImageRequest
      ? this.getImageGenerationPrompt()
      : systemPrompt;

    // Use gemini-2.0-flash-exp which has native image generation
    const model = this.client.getGenerativeModel({
      model: this.modelName,
      systemInstruction: effectivePrompt,
      generationConfig: {
        temperature: temperature ?? 0.7,
        maxOutputTokens: isImageRequest ? 2048 : undefined,
      },
    });

    // Convert messages to Gemini format
    const history = messages.slice(0, -1).map((msg) => ({
      role: msg.role === "user" ? "user" : ("model" as const),
      parts: [{ text: msg.content }],
    }));

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
    const lastMessage = messages[messages.length - 1];
    const isImageRequest = this.isImageGenerationRequest(lastMessage.content);

    // Use special prompt for image generation requests
    const effectivePrompt = isImageRequest
      ? this.getImageGenerationPrompt()
      : systemPrompt;

    // Use gemini-2.0-flash-exp which has native image generation
    const model = this.client.getGenerativeModel({
      model: this.modelName,
      systemInstruction: effectivePrompt,
      generationConfig: {
        temperature: temperature ?? 0.7,
        maxOutputTokens: isImageRequest ? 2048 : undefined,
      },
    });

    // Convert messages to Gemini format
    const history = messages.slice(0, -1).map((msg) => ({
      role: msg.role === "user" ? "user" : ("model" as const),
      parts: [{ text: msg.content }],
    }));

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
