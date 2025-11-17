/**
 * Agent Tools Index
 *
 * Exports all available tools and provides a registry for tool lookup.
 */

import { Tool } from '@/types/agent';

// Import all tools
import { webSearchTool } from './web-search';
import { webFetchTool } from './web-fetch';
import { memoryRetrieveTool } from './memory-retrieve';
import { memorySaveTool } from './memory-save';
import { recallDetailsTool, storeResult, clearStoredResults } from './recall-details';
import { getCurrentTimeTool } from './get-current-time';
import { imageGenerateTool } from './image-generate';

// Export individual tools
export { webSearchTool } from './web-search';
export { webFetchTool } from './web-fetch';
export { memoryRetrieveTool } from './memory-retrieve';
export { memorySaveTool } from './memory-save';
export { recallDetailsTool, storeResult, clearStoredResults } from './recall-details';
export { getCurrentTimeTool } from './get-current-time';
export { imageGenerateTool } from './image-generate';

// Export base utilities
export {
  BaseTool,
  successResult,
  errorResult,
  estimateTokens,
  validateParameters,
  formatToolForPrompt,
  executeWithTiming,
} from './base';

/**
 * All available tools
 */
export const allTools: Tool[] = [
  webSearchTool,
  webFetchTool,
  memoryRetrieveTool,
  memorySaveTool,
  recallDetailsTool,
  getCurrentTimeTool,
  imageGenerateTool,
];

/**
 * Tool registry for lookup by name
 */
export const toolRegistry: Map<string, Tool> = new Map(
  allTools.map((tool) => [tool.name, tool])
);

/**
 * Get a tool by name
 */
export function getTool(name: string): Tool | undefined {
  return toolRegistry.get(name);
}

/**
 * Get tools by names
 */
export function getTools(names: string[]): Tool[] {
  return names
    .map((name) => toolRegistry.get(name))
    .filter((tool): tool is Tool => tool !== undefined);
}

/**
 * Get all tool names
 */
export function getToolNames(): string[] {
  return allTools.map((tool) => tool.name);
}

/**
 * Default enabled tools for each style
 */
export const defaultEnabledTools: Record<string, string[]> = {
  tool_first: [
    'web_search',
    'web_fetch',
    'memory_retrieve',
    'memory_save',
    'recall_details',
    'get_current_time',
    'image_generate',
  ],
  balanced: [
    'web_search',
    'web_fetch',
    'memory_retrieve',
    'memory_save',
    'recall_details',
    'get_current_time',
    'image_generate',
  ],
  direct: [
    'memory_retrieve',
    'get_current_time',
  ],
};
