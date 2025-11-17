/**
 * Tests for Agent Tool Base Utilities
 */

import {
  estimateTokens,
  validateParameters,
  successResult,
  errorResult,
  formatToolForPrompt,
} from '@/lib/agent/tools/base';
import { ToolParameter } from '@/types/agent';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates tokens for English text', () => {
    // ~4 chars per token
    const text = 'Hello world'; // 11 chars
    expect(estimateTokens(text)).toBe(3); // ceil(11/4)
  });

  it('estimates tokens for Chinese text', () => {
    // ~2 chars per token for Chinese
    const text = '你好世界'; // 4 Chinese chars
    expect(estimateTokens(text)).toBe(2); // ceil(4/2)
  });

  it('estimates tokens for mixed text', () => {
    const text = 'Hello 你好'; // 6 English + space + 2 Chinese
    // 7 other chars / 4 = 1.75, 2 Chinese / 2 = 1
    // Total: ceil(1.75 + 1) = 3
    expect(estimateTokens(text)).toBe(3);
  });

  it('handles null/undefined gracefully', () => {
    expect(estimateTokens(null as unknown as string)).toBe(0);
    expect(estimateTokens(undefined as unknown as string)).toBe(0);
  });
});

describe('validateParameters', () => {
  const schema: ToolParameter[] = [
    {
      name: 'query',
      type: 'string',
      description: 'Search query',
      required: true,
    },
    {
      name: 'count',
      type: 'number',
      description: 'Number of results',
      required: false,
    },
    {
      name: 'format',
      type: 'string',
      description: 'Output format',
      required: false,
      enum: ['json', 'text', 'html'],
    },
  ];

  it('validates valid parameters', () => {
    const result = validateParameters(
      { query: 'test', count: 5 },
      schema
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails on missing required parameter', () => {
    const result = validateParameters({ count: 5 }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required parameter: query');
  });

  it('allows optional parameters to be undefined', () => {
    const result = validateParameters({ query: 'test' }, schema);
    expect(result.valid).toBe(true);
  });

  it('fails on wrong type', () => {
    const result = validateParameters(
      { query: 'test', count: 'five' },
      schema
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('expected number');
  });

  it('validates enum values', () => {
    const result = validateParameters(
      { query: 'test', format: 'xml' },
      schema
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('must be one of');
  });

  it('accepts valid enum values', () => {
    const result = validateParameters(
      { query: 'test', format: 'json' },
      schema
    );
    expect(result.valid).toBe(true);
  });
});

describe('successResult', () => {
  it('creates success result with data', () => {
    const result = successResult({ foo: 'bar' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ foo: 'bar' });
    expect(result.error).toBeUndefined();
  });

  it('includes metadata when provided', () => {
    const result = successResult(
      { foo: 'bar' },
      { executionTime: 100, tokensUsed: 50 }
    );
    expect(result.metadata?.executionTime).toBe(100);
    expect(result.metadata?.tokensUsed).toBe(50);
  });
});

describe('errorResult', () => {
  it('creates error result', () => {
    const result = errorResult('Something went wrong');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Something went wrong');
    expect(result.data).toBeUndefined();
  });

  it('includes execution time when provided', () => {
    const result = errorResult('Error', 150);
    expect(result.metadata?.executionTime).toBe(150);
  });
});

describe('formatToolForPrompt', () => {
  it('formats tool description correctly', () => {
    const tool = {
      name: 'web_search',
      description: 'Search the web',
      parameters: [
        {
          name: 'query',
          type: 'string' as const,
          description: 'Search query',
          required: true,
        },
        {
          name: 'count',
          type: 'number' as const,
          description: 'Number of results',
          required: false,
        },
      ],
      execute: jest.fn(),
    };

    const formatted = formatToolForPrompt(tool);

    expect(formatted).toContain('### web_search');
    expect(formatted).toContain('Search the web');
    expect(formatted).toContain('query (string) (required)');
    expect(formatted).toContain('count (number) (optional)');
  });

  it('shows enum options', () => {
    const tool = {
      name: 'format_output',
      description: 'Format output',
      parameters: [
        {
          name: 'format',
          type: 'string' as const,
          description: 'Output format',
          required: true,
          enum: ['json', 'text'],
        },
      ],
      execute: jest.fn(),
    };

    const formatted = formatToolForPrompt(tool);
    expect(formatted).toContain('[json|text]');
  });
});
