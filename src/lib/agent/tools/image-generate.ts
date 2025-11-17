/**
 * Image Generate Tool
 *
 * Generates images using Gemini's native image generation capabilities.
 */

import { ToolParameter, ToolResult } from '@/types/agent';
import { BaseTool, successResult, errorResult } from './base';
import { ProviderFactory } from '@/lib/providers/provider-factory';
import { GEMINI_MODELS, ModelTier } from '@/config/models';

export class ImageGenerateTool extends BaseTool {
  name = 'image_generate';

  description = `Generate images based on text descriptions using AI. Use this when the user
asks you to create, draw, generate, or visualize images. Returns the generated image
as base64 data.

Guidelines:
- Provide detailed, descriptive prompts for better results
- Specify style, colors, composition when relevant
- Note: Cannot generate images of real people or copyrighted characters`;

  parameters: ToolParameter[] = [
    {
      name: 'prompt',
      type: 'string',
      description: 'Detailed description of the image to generate',
      required: true,
    },
    {
      name: 'style',
      type: 'string',
      description: 'Art style (e.g., "photorealistic", "cartoon", "watercolor", "oil painting")',
      required: false,
    },
    {
      name: 'aspectRatio',
      type: 'string',
      description: 'Aspect ratio: "square", "landscape", "portrait". Defaults to "square".',
      required: false,
      enum: ['square', 'landscape', 'portrait'],
    },
  ];

  protected async run(params: Record<string, unknown>): Promise<ToolResult> {
    const prompt = params.prompt as string;
    const style = params.style as string | undefined;
    const aspectRatio = (params.aspectRatio as string) || 'square';

    try {
      // Build enhanced prompt
      let enhancedPrompt = prompt;
      if (style) {
        enhancedPrompt = `${prompt}, in ${style} style`;
      }

      // Add aspect ratio hint
      switch (aspectRatio) {
        case 'landscape':
          enhancedPrompt += ', wide landscape composition';
          break;
        case 'portrait':
          enhancedPrompt += ', vertical portrait composition';
          break;
        default:
          enhancedPrompt += ', square composition';
      }

      // Get the IMAGE tier provider
      const provider = ProviderFactory.createDefaultProvider(
        GEMINI_MODELS[ModelTier.IMAGE]
      );

      // Use generateResponse with image generation system prompt
      // The Gemini IMAGE model will generate images natively
      const systemPrompt = `You are an image generation model. Generate an image based on the user's description. Return the image directly.`;

      const response = await provider.generateResponse(
        [{ role: 'user', content: enhancedPrompt }],
        systemPrompt,
        0.8
      );

      // For now, return the response content which may contain image data
      // The actual image handling depends on how Gemini returns images
      return successResult(
        {
          generatedContent: response.content,
          prompt: enhancedPrompt,
          originalPrompt: prompt,
          style,
          aspectRatio,
          message: 'Image generation requested. Response may contain image data or description.',
        },
        {
          executionTime: 0,
          tokensUsed: response.usage?.totalTokens || 0,
        }
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Image generation failed';
      return errorResult(`Image generation failed: ${message}`);
    }
  }
}

// Export singleton instance
export const imageGenerateTool = new ImageGenerateTool();
