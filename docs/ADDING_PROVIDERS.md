# Adding New AI Providers

This guide explains how to add support for new AI providers to WhimCraft.

## Architecture Overview

WhimCraft uses a provider abstraction layer to support three types of AI providers:
- **gemini** - Google Gemini API
- **openai** - OpenAI API (GPT models)
- **inhouse** - Self-hosted models (Ollama, LM Studio, etc.)

All providers implement the `IAIProvider` interface, which ensures a consistent API regardless of which AI service is used.

## Provider Interface

All providers must implement the `IAIProvider` interface defined in `src/types/ai-providers.ts`:

```typescript
export interface IAIProvider {
  // Get provider name
  getName(): string;

  // Stream response (for chat)
  streamResponse(
    messages: AIMessage[],
    systemPrompt?: string,
    temperature?: number
  ): AsyncGenerator<string, void, unknown>;

  // Non-streaming response (for simple requests)
  generateResponse(
    messages: AIMessage[],
    systemPrompt?: string,
    temperature?: number
  ): Promise<AIResponse>;

  // Check if provider is available (API key set, etc.)
  isAvailable(): Promise<boolean>;
}
```

## Step-by-Step Guide

### 1. Create Provider Class

Create a new file in `src/lib/providers/` for your provider. For example, `openai.provider.ts`:

```typescript
import { IAIProvider, AIMessage, AIResponse, ProviderMetadata } from "@/types/ai-providers";

export class OpenAIProvider implements IAIProvider {
  private apiKey: string;
  private modelName: string;

  constructor(apiKey?: string, model?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("OpenAI API key is required");
    }
    this.apiKey = key;
    this.modelName = model || "gpt-4-turbo-preview";
  }

  getName(): string {
    return "openai";
  }

  async *streamResponse(
    messages: AIMessage[],
    systemPrompt?: string,
    temperature?: number
  ): AsyncGenerator<string, void, unknown> {
    // Implementation using OpenAI SDK
    // Convert messages to OpenAI format
    // Stream the response
  }

  async generateResponse(
    messages: AIMessage[],
    systemPrompt?: string,
    temperature?: number
  ): Promise<AIResponse> {
    // Implementation for non-streaming requests
  }

  async isAvailable(): Promise<boolean> {
    // Check if API key is set and optionally test connection
    return !!process.env.OPENAI_API_KEY;
  }

  static getMetadata(): ProviderMetadata {
    return {
      name: "openai",
      displayName: "OpenAI",
      type: "openai",
      description: "OpenAI's GPT models",
      requiresApiKey: true,
      supportsStreaming: true,
      supportedModels: ["gpt-4-turbo-preview", "gpt-3.5-turbo"],
    };
  }
}
```

### 2. Update Provider Factory

Add your provider to the factory in `src/lib/providers/provider-factory.ts`:

```typescript
import { OpenAIProvider } from "./openai.provider";

export class ProviderFactory {
  static createProvider(config: AIProviderConfig): IAIProvider {
    switch (config.provider) {
      case "gemini":
        return new GeminiProvider(config.apiKey, config.model);

      case "openai":
        return new OpenAIProvider(config.apiKey, config.model);

      // Add your provider here...
    }
  }

  static createDefaultProvider(): IAIProvider {
    // Add configuration for your provider
    switch (providerType) {
      case "openai":
        config.apiKey = process.env.OPENAI_API_KEY;
        config.model = process.env.OPENAI_MODEL || "gpt-4-turbo-preview";
        break;
    }
  }
}
```

### 3. Update Type Definitions

The supported provider types are defined in `src/types/ai-providers.ts`:

```typescript
export type AIProviderType = "gemini" | "openai" | "inhouse";
```

For self-hosted models, use the "inhouse" type.

### 4. Configure Environment Variables

Add the necessary environment variables to `.env.local`:

```bash
# AI Provider Configuration
AI_PROVIDER=openai  # gemini | openai | inhouse

# OpenAI Configuration
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4-turbo-preview

# OR for Gemini
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.0-flash-exp

# OR for In-house (self-hosted)
INHOUSE_BASE_URL=http://localhost:11434
INHOUSE_MODEL=llama2
```

## Message Format

The `AIMessage` interface provides a common format for messages across all providers:

```typescript
export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}
```

Your provider implementation should convert this format to whatever format your AI service expects.

## Response Format

### Streaming Response

The `streamResponse` method should return an `AsyncGenerator<string, void, unknown>` that yields chunks of text as they become available:

```typescript
async *streamResponse(messages: AIMessage[], systemPrompt?: string, temperature?: number) {
  for await (const chunk of yourSDK.stream()) {
    yield chunk.text;
  }
}
```

### Non-Streaming Response

The `generateResponse` method should return an `AIResponse` object:

```typescript
export interface AIResponse {
  content: string;
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}
```

## Example: Gemini Provider

See `src/lib/providers/gemini.provider.ts` for a complete, working example of a provider implementation.

## Testing Your Provider

1. Set the `AI_PROVIDER` environment variable to your provider name
2. Ensure API keys are configured
3. Start the dev server: `npm run dev`
4. Test chat functionality through the UI
5. Check server logs for any errors

## Best Practices

1. **Error Handling**: Wrap API calls in try-catch blocks and provide meaningful error messages
2. **Type Safety**: Use TypeScript types consistently
3. **Configuration**: Support both constructor parameters and environment variables
4. **Metadata**: Provide accurate metadata through the `getMetadata()` static method
5. **Availability Check**: Implement `isAvailable()` to help with debugging
6. **Streaming**: Ensure streaming responses are properly handled and cleaned up
7. **System Prompts**: Respect the system prompt parameter if your provider supports it
8. **Temperature**: Use the temperature parameter for response randomness control

## Environment Variables Reference

```bash
# Global AI Settings
AI_PROVIDER=gemini          # gemini | openai | inhouse
AI_TEMPERATURE=0.7          # Default temperature (0-1)
AI_MAX_TOKENS=4096          # Maximum tokens for response

# Provider-Specific Settings

# Gemini (Google AI)
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-2.0-flash-exp

# OpenAI
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4-turbo-preview

# In-house (self-hosted models like Ollama, LM Studio, etc.)
INHOUSE_BASE_URL=http://localhost:11434
INHOUSE_MODEL=llama2
```

## Troubleshooting

### Provider Not Found

Ensure you've added your provider to:
- `AIProviderType` union type
- `ProviderFactory.createProvider()` switch statement
- `ProviderFactory.createDefaultProvider()` configuration

### API Key Issues

- Check `.env.local` file exists and contains the API key
- Ensure the environment variable name matches what your provider expects
- Restart the dev server after changing environment variables

### Streaming Issues

- Ensure your generator properly yields strings, not objects
- Close/cleanup resources in finally blocks
- Handle errors within the generator to prevent hanging connections

## Support

For questions or issues with provider implementation, please check:
- Existing provider implementations in `src/lib/providers/`
- Interface definitions in `src/types/ai-providers.ts`
- Factory implementation in `src/lib/providers/provider-factory.ts`
