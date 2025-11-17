/**
 * Agent System Index
 *
 * Main entry point for the agentic architecture.
 */

// Core agent
export {
  Agent,
  createAgent,
  buildAgentPrompt,
  buildToolsDescription,
  agentStyles,
  compressResults,
  buildScratchpad,
  checkContextBudget,
  truncateScratchpad,
  defaultContextBudget,
  defaultAgentSettings,
  createAgentConfig,
  getToolsForStyle,
  validateAgentSettings,
  getAgentSettingsDescription,
} from './core';

// Tools
export {
  webSearchTool,
  webFetchTool,
  memoryRetrieveTool,
  memorySaveTool,
  recallDetailsTool,
  getCurrentTimeTool,
  imageGenerateTool,
  storeResult,
  clearStoredResults,
  allTools,
  toolRegistry,
  getTool,
  getTools,
  getToolNames,
  defaultEnabledTools,
  BaseTool,
  successResult,
  errorResult,
  estimateTokens,
  validateParameters,
  formatToolForPrompt,
  executeWithTiming,
} from './tools';

// Re-export types for convenience
export type {
  Tool,
  ToolParameter,
  ToolParameterType,
  ToolResult,
  ToolCall,
  ToolContext,
  AgentConfig,
  AgentState,
  AgentInput,
  AgentOutput,
  AgentEvent,
  AgentEventType,
  AgentReasoning,
  AgentStyle,
  AgentStyleConfig,
  AgentSettings,
  ContextBudget,
  CompressedResult,
  IterationRecord,
  Observation,
  StoredResult,
} from '@/types/agent';
