/**
 * Agent Configuration
 *
 * Default configuration and settings for the agent system.
 */

import { AgentConfig, AgentSettings, AgentStyle } from '@/types/agent';
import { toolRegistry, getTools, defaultEnabledTools } from '../tools';
import { ModelTier, GEMINI_MODELS } from '@/config/models';

/**
 * Default agent settings
 */
export const defaultAgentSettings: AgentSettings = {
  maxIterations: 5,
  defaultModel: GEMINI_MODELS[ModelTier.MAIN],
  agentStyle: 'balanced',
  enabledTools: [
    'web_search',
    'web_fetch',
    'memory_retrieve',
    'memory_save',
    'recall_details',
    'get_current_time',
    'image_generate',
  ],
  webSearchEnabled: true,
  memoryEnabled: true,
  imageGenerationEnabled: true,
  reasoningVisible: false,
  costBudgetPerRequest: 0.10, // $0.10
};

/**
 * Create agent config from settings
 */
export function createAgentConfig(
  settings: Partial<AgentSettings>,
  userId: string,
  conversationId: string
): AgentConfig {
  const merged = { ...defaultAgentSettings, ...settings };

  // Filter enabled tools based on settings
  let enabledToolNames = merged.enabledTools;

  // Disable tools based on feature flags
  if (!merged.webSearchEnabled) {
    enabledToolNames = enabledToolNames.filter(
      (t) => !['web_search', 'web_fetch'].includes(t)
    );
  }

  if (!merged.memoryEnabled) {
    enabledToolNames = enabledToolNames.filter(
      (t) => !['memory_retrieve', 'memory_save'].includes(t)
    );
  }

  if (!merged.imageGenerationEnabled) {
    enabledToolNames = enabledToolNames.filter((t) => t !== 'image_generate');
  }

  return {
    maxIterations: merged.maxIterations,
    model: merged.defaultModel,
    temperature: 0.7,
    tools: getTools(enabledToolNames),
    userId,
    conversationId,
    style: merged.agentStyle,
    costBudget: merged.costBudgetPerRequest,
  };
}

/**
 * Get tools for a specific style
 */
export function getToolsForStyle(style: AgentStyle): string[] {
  return defaultEnabledTools[style] || defaultEnabledTools.balanced;
}

/**
 * Validate agent settings
 */
export function validateAgentSettings(
  settings: Partial<AgentSettings>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (settings.maxIterations !== undefined) {
    if (settings.maxIterations < 1 || settings.maxIterations > 20) {
      errors.push('maxIterations must be between 1 and 20');
    }
  }

  if (settings.agentStyle !== undefined) {
    if (!['tool_first', 'balanced', 'direct'].includes(settings.agentStyle)) {
      errors.push('agentStyle must be tool_first, balanced, or direct');
    }
  }

  if (settings.enabledTools !== undefined) {
    const validTools = Array.from(toolRegistry.keys());
    for (const tool of settings.enabledTools) {
      if (!validTools.includes(tool)) {
        errors.push(`Unknown tool: ${tool}`);
      }
    }
  }

  if (settings.costBudgetPerRequest !== undefined) {
    if (settings.costBudgetPerRequest < 0.01 || settings.costBudgetPerRequest > 1.0) {
      errors.push('costBudgetPerRequest must be between $0.01 and $1.00');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get agent settings description for admin UI
 */
export function getAgentSettingsDescription(): Record<
  keyof AgentSettings,
  { label: string; description: string; type: string }
> {
  return {
    maxIterations: {
      label: 'Max Iterations',
      description: 'Maximum ReAct iterations per request (1-20)',
      type: 'number',
    },
    defaultModel: {
      label: 'Default Model',
      description: 'AI model for reasoning',
      type: 'select',
    },
    agentStyle: {
      label: 'Agent Style',
      description: 'How the agent balances tool use vs direct response',
      type: 'select',
    },
    enabledTools: {
      label: 'Enabled Tools',
      description: 'Which tools the agent can use',
      type: 'multiselect',
    },
    webSearchEnabled: {
      label: 'Web Search',
      description: 'Enable web search capabilities',
      type: 'boolean',
    },
    memoryEnabled: {
      label: 'Memory',
      description: 'Enable memory storage and retrieval',
      type: 'boolean',
    },
    imageGenerationEnabled: {
      label: 'Image Generation',
      description: 'Enable AI image generation',
      type: 'boolean',
    },
    reasoningVisible: {
      label: 'Show Reasoning',
      description: 'Display agent reasoning to users',
      type: 'boolean',
    },
    costBudgetPerRequest: {
      label: 'Cost Budget',
      description: 'Maximum cost per request in USD',
      type: 'number',
    },
  };
}
