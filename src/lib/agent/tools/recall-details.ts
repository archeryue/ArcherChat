/**
 * Recall Details Tool
 *
 * Retrieves full data from previously compressed tool results.
 * Used when the agent needs more details than what's in the summary.
 */

import { ToolParameter, ToolResult, StoredResult } from '@/types/agent';
import { BaseTool, successResult, errorResult, estimateTokens } from './base';

// In-memory storage for tool results (with TTL)
const resultStorage = new Map<string, StoredResult>();

// Clean up expired results every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, result] of resultStorage.entries()) {
    if (result.expiresAt < now) {
      resultStorage.delete(id);
    }
  }
}, 5 * 60 * 1000);

/**
 * Store a result for later recall
 */
export function storeResult(
  id: string,
  data: unknown,
  ttlMinutes: number = 30
): void {
  const now = Date.now();
  resultStorage.set(id, {
    id,
    data,
    createdAt: now,
    expiresAt: now + ttlMinutes * 60 * 1000,
  });
}

/**
 * Get all stored result IDs for debugging
 */
export function getStoredResultIds(): string[] {
  return Array.from(resultStorage.keys());
}

/**
 * Clear all stored results
 */
export function clearStoredResults(): void {
  resultStorage.clear();
}

export class RecallDetailsTool extends BaseTool {
  name = 'recall_details';

  description = `Retrieve full details from a previously executed tool result. Use this when
you need more information than what was provided in the compressed summary. Provide the
result ID that was returned in the compressed result.`;

  parameters: ToolParameter[] = [
    {
      name: 'resultId',
      type: 'string',
      description: 'The ID of the stored result to retrieve',
      required: true,
    },
    {
      name: 'fields',
      type: 'array',
      description: 'Specific fields to extract (optional, returns all if not specified)',
      required: false,
    },
  ];

  protected async run(params: Record<string, unknown>): Promise<ToolResult> {
    const resultId = params.resultId as string;
    const fields = params.fields as string[] | undefined;

    try {
      const stored = resultStorage.get(resultId);

      if (!stored) {
        return errorResult(
          `Result not found or expired. Available IDs: ${getStoredResultIds().join(', ') || 'none'}`
        );
      }

      // Check if expired
      if (stored.expiresAt < Date.now()) {
        resultStorage.delete(resultId);
        return errorResult('Result has expired and was removed');
      }

      let data = stored.data;

      // Extract specific fields if requested
      if (fields && fields.length > 0 && typeof data === 'object' && data !== null) {
        const filtered: Record<string, unknown> = {};
        for (const field of fields) {
          if (field in (data as Record<string, unknown>)) {
            filtered[field] = (data as Record<string, unknown>)[field];
          }
        }
        data = filtered;
      }

      return successResult(
        {
          resultId,
          data,
          createdAt: stored.createdAt,
          expiresAt: stored.expiresAt,
        },
        {
          executionTime: 0,
          tokensUsed: estimateTokens(JSON.stringify(data)),
        }
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Recall failed';
      return errorResult(`Recall details failed: ${message}`);
    }
  }
}

// Export singleton instance
export const recallDetailsTool = new RecallDetailsTool();
