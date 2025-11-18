/**
 * Context Manager
 *
 * Manages context compression and scratchpad building for the agent.
 */

import {
  CompressedResult,
  ToolResult,
  Observation,
  ContextBudget,
} from '@/types/agent';
import { estimateTokens } from '../tools';

/**
 * Default context budget (tokens)
 */
export const defaultContextBudget: ContextBudget = {
  total: 30000, // ~30k tokens for Gemini Flash
  systemPrompt: 3000,
  conversationHistory: 10000,
  currentMessage: 2000,
  agentScratchpad: 10000,
  responseBuffer: 5000,
};

/**
 * Compress tool results to save context
 */
export function compressResults(
  results: Array<{ toolName: string; result: ToolResult }>
): CompressedResult[] {
  return results.map(({ toolName, result }) => {
    if (!result.success) {
      return {
        toolName,
        summary: `Error: ${result.error || 'Unknown error'}`,
        keyPoints: [],
        tokens: estimateTokens(result.error || ''),
      };
    }

    const data = result.data;
    const { summary, keyPoints } = extractSummary(toolName, data);

    return {
      toolName,
      summary,
      keyPoints,
      tokens: estimateTokens(summary + keyPoints.join(' ')),
      fullDataRef: result.metadata?.executionTime
        ? `${toolName}_${Date.now()}`
        : undefined,
    };
  });
}

/**
 * Extract summary and key points from tool result data
 */
function extractSummary(
  toolName: string,
  data: unknown
): { summary: string; keyPoints: string[] } {
  if (!data || typeof data !== 'object') {
    return {
      summary: String(data),
      keyPoints: [],
    };
  }

  const obj = data as Record<string, unknown>;

  switch (toolName) {
    case 'web_search':
      return extractWebSearchSummary(obj);

    case 'web_fetch':
      return extractWebFetchSummary(obj);

    case 'memory_retrieve':
      return extractMemoryRetrieveSummary(obj);

    case 'memory_save':
      return extractMemorySaveSummary(obj);

    case 'get_current_time':
      return {
        summary: obj.datetime as string || obj.iso as string || 'Time retrieved',
        keyPoints: [],
      };

    case 'image_generate':
      return {
        summary: `Image generated for: ${obj.originalPrompt || 'prompt'}`,
        keyPoints: obj.style ? [`Style: ${obj.style}`] : [],
      };

    default:
      return {
        summary: JSON.stringify(data).slice(0, 200),
        keyPoints: [],
      };
  }
}

/**
 * Extract summary from web search results
 */
function extractWebSearchSummary(
  data: Record<string, unknown>
): { summary: string; keyPoints: string[] } {
  const results = data.results as Array<{
    title: string;
    link: string;
    snippet: string;
  }> || [];

  if (results.length === 0) {
    return {
      summary: 'No search results found',
      keyPoints: [],
    };
  }

  const summary = `Found ${results.length} results for "${data.query}"`;
  const keyPoints = results.slice(0, 5).map(
    (r) => `${r.title} (${r.link})`
  );

  return { summary, keyPoints };
}

/**
 * Extract summary from web fetch results
 */
function extractWebFetchSummary(
  data: Record<string, unknown>
): { summary: string; keyPoints: string[] } {
  const extracted = data.extractedContent as Array<{
    url: string;
    title: string;
    extractedInfo: string;
    keyPoints: string[];
  }> || [];

  if (extracted.length === 0) {
    return {
      summary: 'No content extracted',
      keyPoints: [],
    };
  }

  const summary = `Extracted content from ${extracted.length} page(s)`;
  const keyPoints: string[] = [];

  for (const item of extracted) {
    if (item.keyPoints && item.keyPoints.length > 0) {
      keyPoints.push(...item.keyPoints.slice(0, 3));
    } else if (item.extractedInfo) {
      // Take first 100 chars as a key point
      keyPoints.push(item.extractedInfo.slice(0, 100) + '...');
    }
  }

  return { summary, keyPoints: keyPoints.slice(0, 5) };
}

/**
 * Extract summary from memory retrieve results
 */
function extractMemoryRetrieveSummary(
  data: Record<string, unknown>
): { summary: string; keyPoints: string[] } {
  const facts = data.facts as Array<{
    content: string;
    category: string;
  }> || [];

  if (facts.length === 0) {
    return {
      summary: data.message as string || 'No memories found',
      keyPoints: [],
    };
  }

  const summary = `Retrieved ${facts.length} memory fact(s)`;
  const keyPoints = facts.slice(0, 5).map(
    (f) => `[${f.category}] ${f.content}`
  );

  return { summary, keyPoints };
}

/**
 * Extract summary from memory save results
 */
function extractMemorySaveSummary(
  data: Record<string, unknown>
): { summary: string; keyPoints: string[] } {
  const savedCount = data.savedCount as number || 0;
  const facts = data.facts as Array<{
    content: string;
    category: string;
  }> || [];

  const summary = `Saved ${savedCount} fact(s) to memory`;
  const keyPoints = facts.map(
    (f) => `[${f.category}] ${f.content}`
  );

  return { summary, keyPoints };
}

/**
 * Build scratchpad from reasoning and observations
 */
export function buildScratchpad(
  reasoning: string[],
  observations: Observation[]
): string {
  if (reasoning.length === 0 && observations.length === 0) {
    return '';
  }

  const parts: string[] = [];

  for (let i = 0; i < reasoning.length; i++) {
    parts.push(`## Iteration ${i + 1}`);
    parts.push(`### Reasoning`);
    parts.push(reasoning[i]);

    if (observations[i]) {
      parts.push(`### Observation`);
      parts.push(observations[i].summary);

      if (observations[i].error) {
        parts.push('(Some tools encountered errors)');
      }
    }

    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Check if we're within context budget
 */
export function checkContextBudget(
  systemPrompt: string,
  conversationHistory: string,
  currentMessage: string,
  scratchpad: string,
  budget: ContextBudget = defaultContextBudget
): { withinBudget: boolean; usage: Record<string, number>; remaining: number } {
  const usage = {
    systemPrompt: estimateTokens(systemPrompt),
    conversationHistory: estimateTokens(conversationHistory),
    currentMessage: estimateTokens(currentMessage),
    agentScratchpad: estimateTokens(scratchpad),
  };

  const total = Object.values(usage).reduce((a, b) => a + b, 0);
  const remaining = budget.total - total - budget.responseBuffer;

  return {
    withinBudget: remaining > 0,
    usage,
    remaining: Math.max(0, remaining),
  };
}

/**
 * Truncate scratchpad to fit within budget
 */
export function truncateScratchpad(
  scratchpad: string,
  maxTokens: number
): string {
  const currentTokens = estimateTokens(scratchpad);

  if (currentTokens <= maxTokens) {
    return scratchpad;
  }

  // Split by iterations and keep the most recent ones
  const iterations = scratchpad.split(/## Iteration \d+/);
  const headers = scratchpad.match(/## Iteration \d+/g) || [];

  let result = '';
  let tokens = 0;

  // Work backwards, keeping most recent iterations
  for (let i = iterations.length - 1; i >= 1; i--) {
    const iteration = headers[i - 1] + iterations[i];
    const iterTokens = estimateTokens(iteration);

    if (tokens + iterTokens > maxTokens) {
      break;
    }

    result = iteration + result;
    tokens += iterTokens;
  }

  if (result) {
    result = '[Earlier iterations truncated]\n\n' + result;
  }

  return result;
}
