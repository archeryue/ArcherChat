/**
 * Base Tool Utilities
 *
 * Helper functions and utilities for tool implementations.
 */

import { Tool, ToolParameter, ToolResult, ToolContext } from '@/types/agent';

/**
 * Create a standardized tool result
 */
export function createToolResult(
  success: boolean,
  data?: unknown,
  error?: string,
  metadata?: { executionTime: number; cost?: number; tokensUsed?: number }
): ToolResult {
  return {
    success,
    data,
    error,
    metadata,
  };
}

/**
 * Create a success result
 */
export function successResult(
  data: unknown,
  metadata?: { executionTime: number; cost?: number; tokensUsed?: number }
): ToolResult {
  return createToolResult(true, data, undefined, metadata);
}

/**
 * Create an error result
 */
export function errorResult(error: string, executionTime?: number): ToolResult {
  return createToolResult(false, undefined, error, executionTime ? { executionTime } : undefined);
}

/**
 * Estimate token count for text
 * Handles both English (~4 chars/token) and Chinese (~2 chars/token)
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // Count Chinese characters
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;

  // Chinese: ~2 chars per token, Other: ~4 chars per token
  return Math.ceil(chineseChars / 2 + otherChars / 4);
}

/**
 * Validate tool parameters against schema
 */
export function validateParameters(
  params: Record<string, unknown>,
  schema: ToolParameter[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const param of schema) {
    const value = params[param.name];

    // Check required parameters
    if (param.required && (value === undefined || value === null)) {
      errors.push(`Missing required parameter: ${param.name}`);
      continue;
    }

    // Skip validation for optional undefined parameters
    if (value === undefined || value === null) {
      continue;
    }

    // Type validation
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== param.type) {
      errors.push(
        `Parameter ${param.name} expected ${param.type}, got ${actualType}`
      );
    }

    // Enum validation
    if (param.enum && !param.enum.includes(value as string)) {
      errors.push(
        `Parameter ${param.name} must be one of: ${param.enum.join(', ')}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format tool description for agent prompt
 */
export function formatToolForPrompt(tool: Tool): string {
  const params = tool.parameters
    .map((p) => {
      const required = p.required ? '(required)' : '(optional)';
      const enumStr = p.enum ? ` [${p.enum.join('|')}]` : '';
      return `    - ${p.name} (${p.type}${enumStr}) ${required}: ${p.description}`;
    })
    .join('\n');

  return `### ${tool.name}
${tool.description}

Parameters:
${params || '    None'}`;
}

/**
 * Wrap tool execution with timing and error handling
 */
export async function executeWithTiming(
  fn: () => Promise<ToolResult>
): Promise<ToolResult> {
  const startTime = Date.now();

  try {
    const result = await fn();
    const executionTime = Date.now() - startTime;

    // Add execution time to metadata
    return {
      ...result,
      metadata: {
        ...result.metadata,
        executionTime,
      },
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    return errorResult(
      error instanceof Error ? error.message : 'Unknown error',
      executionTime
    );
  }
}

/**
 * Base class for tools that need context
 */
export abstract class BaseTool implements Tool {
  abstract name: string;
  abstract description: string;
  abstract parameters: ToolParameter[];

  protected context!: ToolContext;

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    this.context = context;

    // Validate parameters
    const validation = validateParameters(params, this.parameters);
    if (!validation.valid) {
      return errorResult(`Invalid parameters: ${validation.errors.join(', ')}`);
    }

    // Execute with timing
    return executeWithTiming(() => this.run(params));
  }

  protected abstract run(params: Record<string, unknown>): Promise<ToolResult>;

  protected get userId(): string {
    return this.context.userId;
  }

  protected get conversationId(): string {
    return this.context.conversationId;
  }

  protected get requestId(): string {
    return this.context.requestId;
  }
}
