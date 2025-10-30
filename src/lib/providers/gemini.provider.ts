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

    // Use image generation model for image requests
    const modelName = isImageRequest ? "gemini-2.5-flash-image" : this.modelName;

    // Configure for image generation if needed
    const generationConfig: any = {
      temperature: temperature ?? 0.7,
      maxOutputTokens: isImageRequest ? 2048 : undefined,
    };

    // Add response modalities for image generation
    if (isImageRequest) {
      generationConfig.responseModalities = ["TEXT", "IMAGE"];
    }

    // Use special prompt for image generation requests
    const effectivePrompt = isImageRequest
      ? "You are an AI that can generate images. When asked to create an image, describe it and generate it."
      : systemPrompt;

    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: effectivePrompt,
      generationConfig,
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
      let hasImage = false;

      for await (const chunk of result.stream) {
        // Check if chunk contains image data
        const response = chunk;
        if (response.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.text) {
              yield part.text;
            }
            if (part.inlineData && !hasImage) {
              // Handle image data - convert to base64 URL
              hasImage = true;
              const imageData = part.inlineData.data;
              const mimeType = part.inlineData.mimeType || 'image/png';
              yield `\n\n![Generated Image](data:${mimeType};base64,${imageData})\n\n`;
            }
          }
        } else {
          // Fallback to text-only handling
          const text = chunk.text();
          if (text) yield text;
        }
      }
    } catch (error) {
      console.error("Gemini API Error:", error);
      // If image generation fails, provide helpful feedback
      if (isImageRequest) {
        yield "\n\n*Note: Image generation requires the Gemini 2.5 Flash Image model. Please ensure your API key has access to this model. Cost is approximately $0.039 per image.*";
      }
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

    // Use image generation model for image requests
    const modelName = isImageRequest ? "gemini-2.5-flash-image" : this.modelName;

    // Configure for image generation if needed
    const generationConfig: any = {
      temperature: temperature ?? 0.7,
      maxOutputTokens: isImageRequest ? 2048 : undefined,
    };

    // Add response modalities for image generation
    if (isImageRequest) {
      generationConfig.responseModalities = ["TEXT", "IMAGE"];
    }

    // Use special prompt for image generation requests
    const effectivePrompt = isImageRequest
      ? "You are an AI that can generate images. When asked to create an image, describe it and generate it."
      : systemPrompt;

    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: effectivePrompt,
      generationConfig,
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
      let fullContent = "";

      // Handle response with potential image data
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.text) {
            fullContent += part.text;
          }
          if (part.inlineData) {
            // Convert image data to markdown
            const imageData = part.inlineData.data;
            const mimeType = part.inlineData.mimeType || 'image/png';
            fullContent += `\n\n![Generated Image](data:${mimeType};base64,${imageData})\n\n`;
          }
        }
      } else {
        // Fallback to text-only
        fullContent = response.text();
      }

      return {
        content: fullContent,
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
      if (isImageRequest) {
        return {
          content: "I apologize, but I cannot generate images at this moment. Image generation requires the Gemini 2.5 Flash Image model which may not be available with your current API key. Please ensure your API key has access to this model (cost is approximately $0.039 per image).",
          finishReason: "stop",
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
        };
      }
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
      description: "Google's Gemini AI models with native image generation",
      requiresApiKey: true,
      supportsStreaming: true,
      supportedModels: [
        "gemini-2.0-flash-exp",
        "gemini-2.5-flash-image",
        "gemini-1.5-pro",
        "gemini-1.5-flash",
      ],
    };
  }
}
