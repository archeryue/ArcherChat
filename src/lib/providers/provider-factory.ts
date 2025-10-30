import { IAIProvider, AIProviderType, AIProviderConfig } from "@/types/ai-providers";
import { GeminiProvider } from "./gemini.provider";

/**
 * Factory for creating AI provider instances
 * This centralizes provider instantiation and makes it easy to add new providers
 */
export class ProviderFactory {
  /**
   * Create a provider instance based on configuration
   * @param config - Provider configuration
   * @returns IAIProvider instance
   * @throws Error if provider type is unsupported or configuration is invalid
   */
  static createProvider(config: AIProviderConfig): IAIProvider {
    switch (config.provider) {
      case "gemini":
        return new GeminiProvider(config.apiKey, config.model);

      case "openai":
        throw new Error(
          "OpenAI provider not yet implemented. Coming soon!"
        );

      case "claude":
        throw new Error(
          "Claude provider not yet implemented. Coming soon!"
        );

      case "ollama":
        throw new Error(
          "Ollama provider not yet implemented. Coming soon!"
        );

      default:
        throw new Error(`Unsupported provider type: ${config.provider}`);
    }
  }

  /**
   * Create the default provider from environment configuration
   * Reads from env vars: AI_PROVIDER (default: gemini), GEMINI_API_KEY, etc.
   * @returns IAIProvider instance
   */
  static createDefaultProvider(): IAIProvider {
    // Read provider type from env (default to gemini)
    const providerType = (process.env.AI_PROVIDER || "gemini") as AIProviderType;

    // Create config based on provider type
    const config: AIProviderConfig = {
      provider: providerType,
      temperature: process.env.AI_TEMPERATURE
        ? parseFloat(process.env.AI_TEMPERATURE)
        : undefined,
      maxTokens: process.env.AI_MAX_TOKENS
        ? parseInt(process.env.AI_MAX_TOKENS)
        : undefined,
    };

    // Add provider-specific configuration
    switch (providerType) {
      case "gemini":
        config.apiKey = process.env.GEMINI_API_KEY;
        config.model = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
        break;

      case "openai":
        config.apiKey = process.env.OPENAI_API_KEY;
        config.model = process.env.OPENAI_MODEL || "gpt-4-turbo-preview";
        break;

      case "claude":
        config.apiKey = process.env.CLAUDE_API_KEY;
        config.model = process.env.CLAUDE_MODEL || "claude-3-opus-20240229";
        break;

      case "ollama":
        config.baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
        config.model = process.env.OLLAMA_MODEL || "llama2";
        break;
    }

    return this.createProvider(config);
  }

  /**
   * Get list of all supported provider types
   * @returns Array of supported provider types
   */
  static getSupportedProviders(): AIProviderType[] {
    return ["gemini", "openai", "claude", "ollama"];
  }

  /**
   * Check if a provider type is supported
   * @param provider - Provider type to check
   * @returns true if supported
   */
  static isProviderSupported(provider: string): boolean {
    return this.getSupportedProviders().includes(provider as AIProviderType);
  }
}
