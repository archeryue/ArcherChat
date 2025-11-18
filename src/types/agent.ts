/**
 * Agent System Types
 *
 * Types for the agentic architecture with ReAct pattern.
 */

import { AIMessage } from './ai-providers';
import { FileAttachment } from './file';
import { MemoryFact } from './memory';

// =============================================================================
// Tool Types
// =============================================================================

export type ToolParameterType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface ToolParameter {
  name: string;
  type: ToolParameterType;
  description: string;
  required: boolean;
  enum?: string[];
  default?: unknown;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: {
    executionTime: number;
    cost?: number;
    tokensUsed?: number;
  };
}

export interface ToolCall {
  tool: string;
  parameters: Record<string, unknown>;
  reasoning: string;
}

export interface ToolContext {
  userId: string;
  conversationId: string;
  requestId: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

// =============================================================================
// Agent Types
// =============================================================================

export type AgentStyle = 'tool_first' | 'direct' | 'balanced';

export interface AgentStyleConfig {
  name: string;
  description: string;
  toolBias: number;
  minConfidenceToSkip: number;
}

export interface AgentSettings {
  maxIterations: number;
  defaultModel: string;
  agentStyle: AgentStyle;
  enabledTools: string[];
  webSearchEnabled: boolean;
  memoryEnabled: boolean;
  imageGenerationEnabled: boolean;
  reasoningVisible: boolean;
  costBudgetPerRequest: number;
}

export interface AgentConfig {
  maxIterations: number;
  model: string;
  temperature: number;
  tools: Tool[];
  userId: string;
  conversationId: string;
  style: AgentStyle;
  costBudget: number;
}

export interface AgentState {
  iteration: number;
  toolCalls: ToolCall[];
  observations: Observation[];
  reasoning: string[];
  finalAnswer: string | null;
  shouldContinue: boolean;
  totalCost: number;
  totalTokens: number;
}

// =============================================================================
// Context Management Types
// =============================================================================

export interface ContextBudget {
  total: number;
  systemPrompt: number;
  conversationHistory: number;
  currentMessage: number;
  agentScratchpad: number;
  responseBuffer: number;
}

export interface CompressedResult {
  toolName: string;
  summary: string;
  keyPoints: string[];
  tokens: number;
  fullDataRef?: string;
}

export interface IterationRecord {
  reasoning: string;
  toolCalls: ToolCall[];
  results: CompressedResult[];
  observation: string;
  tokens: number;
}

export interface Observation {
  summary: string;
  results: ToolResult[];
  timestamp: number;
  error?: boolean;
}

// =============================================================================
// Agent Events (for streaming)
// =============================================================================

export type AgentEventType =
  | 'reasoning'
  | 'tool_call'
  | 'tool_results'
  | 'observation'
  | 'response'
  | 'error';

export interface AgentEvent {
  type: AgentEventType;
  content?: string | unknown;
  iteration?: number;
  toolName?: string;
  results?: ToolResult[];
}

// =============================================================================
// Agent Reasoning Types
// =============================================================================

export interface AgentReasoning {
  thinking: string;
  action: 'tool' | 'respond';
  toolCalls: ToolCall[];
  response?: string;
  confidence?: number;
}

// =============================================================================
// Agent Input/Output Types
// =============================================================================

export interface AgentInput {
  message: string;
  conversationHistory: AIMessage[];
  files?: FileAttachment[];
  userSettings?: {
    webSearchEnabled: boolean;
    languagePreference: string;
  };
}

export interface AgentOutput {
  response: string;
  toolsUsed: string[];
  iterations: number;
  memoriesSaved?: MemoryFact[];
  webSearchResults?: unknown[];
  totalCost: number;
  totalTokens: number;
}

// =============================================================================
// Temporary Storage Types (for result recall)
// =============================================================================

export interface StoredResult {
  id: string;
  data: unknown;
  createdAt: number;
  expiresAt: number;
}
