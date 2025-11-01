import { FileAttachment } from "./file";

// Supported AI provider types
export type AIProviderType = "gemini" | "openai" | "inhouse";

// Configuration for each provider
export interface AIProviderConfig {
  provider: AIProviderType;
  apiKey?: string;
  baseUrl?: string; // For self-hosted models
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

// Message format (common across all providers)
export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// Response from AI provider
export interface AIResponse {
  content: string;
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

// Streaming chunk from AI provider
export interface AIStreamChunk {
  content: string;
  done: boolean;
}

// Base interface that all AI providers must implement
export interface IAIProvider {
  // Get provider name
  getName(): string;

  // Stream response (for chat)
  streamResponse(
    messages: AIMessage[],
    systemPrompt?: string,
    temperature?: number,
    files?: FileAttachment[]
  ): AsyncGenerator<string, void, unknown>;

  // Non-streaming response (for simple requests)
  generateResponse(
    messages: AIMessage[],
    systemPrompt?: string,
    temperature?: number,
    files?: FileAttachment[]
  ): Promise<AIResponse>;

  // Check if provider is available (API key set, etc.)
  isAvailable(): Promise<boolean>;
}

// Provider metadata
export interface ProviderMetadata {
  name: string;
  displayName: string;
  type: AIProviderType;
  description: string;
  requiresApiKey: boolean;
  supportsStreaming: boolean;
  supportedModels?: string[];
}
