/**
 * Agent Core Index
 *
 * Exports all core agent components.
 */

// Main agent
export { Agent, createAgent } from './agent';

// Prompts
export { buildAgentPrompt, buildToolsDescription, agentStyles } from './prompts';

// Context management
export {
  compressResults,
  buildScratchpad,
  checkContextBudget,
  truncateScratchpad,
  defaultContextBudget,
} from './context-manager';

// Configuration
export {
  defaultAgentSettings,
  createAgentConfig,
  getToolsForStyle,
  validateAgentSettings,
  getAgentSettingsDescription,
} from './config';
