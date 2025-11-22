/**
 * Tests for ImageGenerateTool with AI Prompt Enhancement
 */

import { ImageGenerateTool } from '@/lib/agent/tools/image-generate';
import { promptEnhancer } from '@/lib/image/prompt-enhancer';
import { ProviderFactory } from '@/lib/providers/provider-factory';

// Mock the dependencies
jest.mock('@/lib/image/prompt-enhancer');
jest.mock('@/lib/providers/provider-factory');

describe('ImageGenerateTool', () => {
  let tool: ImageGenerateTool;
  let mockEnhance: jest.MockedFunction<typeof promptEnhancer.enhance>;
  let mockGenerateResponse: jest.Mock;

  beforeEach(() => {
    tool = new ImageGenerateTool();

    // Mock prompt enhancer
    mockEnhance = promptEnhancer.enhance as jest.MockedFunction<typeof promptEnhancer.enhance>;

    // Mock provider
    mockGenerateResponse = jest.fn();
    (ProviderFactory.createDefaultProvider as jest.Mock).mockReturnValue({
      generateResponse: mockGenerateResponse,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Prompt Enhancement Integration', () => {
    it('should enhance basic prompt with AI', async () => {
      // Setup
      mockEnhance.mockResolvedValue({
        originalPrompt: 'a cat',
        enhancedPrompt: 'A fluffy orange cat, photorealistic style, warm lighting, detailed fur texture',
        enhancements: ['photorealistic style', 'warm lighting', 'detailed fur texture'],
      });

      mockGenerateResponse.mockResolvedValue({
        content: 'generated image data',
        usage: { totalTokens: 100 },
      });

      // Execute
      const result = await tool.execute({ prompt: 'a cat' });

      // Verify enhancement was called
      expect(mockEnhance).toHaveBeenCalledWith('a cat');

      // Verify enhanced prompt was used for generation
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('fluffy orange cat'),
          }),
        ]),
        expect.any(String),
        0.8
      );

      // Verify success
      expect(result.success).toBe(true);
    });

    it('should add style to enhanced prompt when provided', async () => {
      // Setup
      mockEnhance.mockResolvedValue({
        originalPrompt: 'a sunset',
        enhancedPrompt: 'A beautiful sunset over mountains, vibrant colors',
        enhancements: ['vibrant colors'],
      });

      mockGenerateResponse.mockResolvedValue({
        content: 'generated image data',
        usage: { totalTokens: 100 },
      });

      // Execute with style parameter
      await tool.execute({
        prompt: 'a sunset',
        style: 'watercolor',
      });

      // Verify style was appended to enhanced prompt
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('watercolor style'),
          }),
        ]),
        expect.any(String),
        0.8
      );
    });

    it('should add aspect ratio hints to enhanced prompt', async () => {
      // Setup
      mockEnhance.mockResolvedValue({
        originalPrompt: 'a landscape',
        enhancedPrompt: 'A scenic mountain landscape',
        enhancements: [],
      });

      mockGenerateResponse.mockResolvedValue({
        content: 'generated image data',
        usage: { totalTokens: 100 },
      });

      // Execute with landscape aspect ratio
      await tool.execute({
        prompt: 'a landscape',
        aspectRatio: 'landscape',
      });

      // Verify aspect ratio hint was added
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('wide landscape composition'),
          }),
        ]),
        expect.any(String),
        0.8
      );
    });

    it('should handle portrait aspect ratio', async () => {
      // Setup
      mockEnhance.mockResolvedValue({
        originalPrompt: 'a person',
        enhancedPrompt: 'A person standing tall',
        enhancements: [],
      });

      mockGenerateResponse.mockResolvedValue({
        content: 'generated image data',
        usage: { totalTokens: 100 },
      });

      // Execute with portrait aspect ratio
      await tool.execute({
        prompt: 'a person',
        aspectRatio: 'portrait',
      });

      // Verify portrait composition was added
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('vertical portrait composition'),
          }),
        ]),
        expect.any(String),
        0.8
      );
    });

    it('should default to square composition when no aspect ratio specified', async () => {
      // Setup
      mockEnhance.mockResolvedValue({
        originalPrompt: 'a circle',
        enhancedPrompt: 'A perfect circle',
        enhancements: [],
      });

      mockGenerateResponse.mockResolvedValue({
        content: 'generated image data',
        usage: { totalTokens: 100 },
      });

      // Execute without aspect ratio
      await tool.execute({
        prompt: 'a circle',
      });

      // Verify square composition was added
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('square composition'),
          }),
        ]),
        expect.any(String),
        0.8
      );
    });
  });

  describe('Fallback Handling', () => {
    it('should use original prompt if enhancement fails', async () => {
      // Setup - enhancement returns original on failure
      mockEnhance.mockResolvedValue({
        originalPrompt: 'a dog',
        enhancedPrompt: 'a dog', // Same as original (fallback behavior)
        enhancements: [],
      });

      mockGenerateResponse.mockResolvedValue({
        content: 'generated image data',
        usage: { totalTokens: 100 },
      });

      // Execute
      const result = await tool.execute({ prompt: 'a dog' });

      // Verify it still works
      expect(result.success).toBe(true);
      expect(mockGenerateResponse).toHaveBeenCalled();
    });

    it('should return error if image generation fails', async () => {
      // Setup
      mockEnhance.mockResolvedValue({
        originalPrompt: 'test',
        enhancedPrompt: 'Enhanced test prompt',
        enhancements: [],
      });

      mockGenerateResponse.mockRejectedValue(new Error('Generation API failed'));

      // Execute
      const result = await tool.execute({ prompt: 'test' });

      // Verify error handling
      expect(result.success).toBe(false);
      expect(result.error).toContain('Image generation failed');
    });
  });

  describe('Tool Metadata', () => {
    it('should have correct tool name', () => {
      expect(tool.name).toBe('image_generate');
    });

    it('should have description', () => {
      expect(tool.description).toBeTruthy();
      expect(tool.description).toContain('Generate images');
    });

    it('should have required prompt parameter', () => {
      const promptParam = tool.parameters.find(p => p.name === 'prompt');
      expect(promptParam).toBeDefined();
      expect(promptParam?.required).toBe(true);
      expect(promptParam?.type).toBe('string');
    });

    it('should have optional style parameter', () => {
      const styleParam = tool.parameters.find(p => p.name === 'style');
      expect(styleParam).toBeDefined();
      expect(styleParam?.required).toBe(false);
    });

    it('should have optional aspectRatio parameter with enum', () => {
      const aspectParam = tool.parameters.find(p => p.name === 'aspectRatio');
      expect(aspectParam).toBeDefined();
      expect(aspectParam?.required).toBe(false);
      expect(aspectParam?.enum).toEqual(['square', 'landscape', 'portrait']);
    });
  });
});
