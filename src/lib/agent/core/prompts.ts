/**
 * Agent Prompts
 *
 * System prompts and tool descriptions for the agent.
 */

import { Tool, AgentStyle, AgentStyleConfig } from '@/types/agent';
import { formatToolForPrompt } from '../tools';

/**
 * Style configurations
 */
export const agentStyles: Record<AgentStyle, AgentStyleConfig> = {
  tool_first: {
    name: 'Tool First',
    description: 'Always use tools to gather information before responding',
    toolBias: 0.8,
    minConfidenceToSkip: 0.95,
  },
  balanced: {
    name: 'Balanced',
    description: 'Use tools when helpful, respond directly when confident',
    toolBias: 0.5,
    minConfidenceToSkip: 0.8,
  },
  direct: {
    name: 'Direct',
    description: 'Respond directly when possible, use tools only when necessary',
    toolBias: 0.2,
    minConfidenceToSkip: 0.6,
  },
};

/**
 * Build the agent system prompt
 */
export function buildAgentPrompt(
  style: AgentStyle,
  toolsDescription: string
): string {
  const styleConfig = agentStyles[style];

  return `You are an intelligent AI assistant that uses the ReAct (Reason-Act-Observe) pattern to help users.

## Your Approach
${getStyleInstructions(style, styleConfig)}

## Available Tools
${toolsDescription}

## Response Format (CRITICAL - YOU MUST FOLLOW THIS EXACTLY)

**Your entire response MUST be valid JSON wrapped in \`\`\`json code blocks. No other format is acceptable.**

### When using tools:
\`\`\`json
{
  "thinking": "Your reasoning about the situation and why you're taking this action",
  "action": "tool",
  "tool_calls": [
    {
      "tool": "tool_name",
      "parameters": { "param1": "value1" },
      "reasoning": "Why this specific tool call"
    }
  ]
}
\`\`\`

### When responding directly:
\`\`\`json
{
  "thinking": "Your reasoning about why you can respond directly",
  "action": "respond",
  "response": "Your helpful response to the user",
  "confidence": 0.9
}
\`\`\`

**IMPORTANT - JSON FORMAT RULES:**
- You MUST wrap your response in \`\`\`json code blocks
- You MUST NOT include any text before or after the JSON block
- The "action" field MUST be either "tool" or "respond"
- Do NOT output plain text explanations outside the JSON

## Guidelines
1. Think step by step about what the user needs
2. Use tools to gather information when needed
3. Consider using memory_retrieve to personalize responses
4. Use memory_save to remember important user information
5. Be concise but thorough in your reasoning
6. If using web_search, follow up with web_fetch for detailed content
7. Always provide helpful, accurate responses

## Language Support
- Detect and match the user's language (English or Chinese)
- Respond in the same language the user uses
- Support bilingual conversations naturally`;
}

/**
 * Get style-specific instructions
 */
function getStyleInstructions(
  style: AgentStyle,
  config: AgentStyleConfig
): string {
  switch (style) {
    case 'tool_first':
      return `You prefer to use tools to gather information before responding.
- Always check memory for user context
- Use web search for current information
- Only respond directly if you're ${Math.round(config.minConfidenceToSkip * 100)}%+ confident
- Err on the side of gathering more information`;

    case 'direct':
      return `You prefer to respond directly when you're confident.
- Respond directly if you're ${Math.round(config.minConfidenceToSkip * 100)}%+ confident
- Use tools only when you need specific information
- Don't over-use tools for simple questions
- Trust your training knowledge for common topics`;

    case 'balanced':
    default:
      return `You balance between using tools and responding directly.
- Use tools when they would improve your response
- Respond directly for straightforward questions
- Check memory to personalize responses
- Use web search for time-sensitive information`;
  }
}

/**
 * Build tools description for the prompt
 */
export function buildToolsDescription(tools: Tool[]): string {
  if (tools.length === 0) {
    return 'No tools available.';
  }

  return tools.map((tool) => formatToolForPrompt(tool)).join('\n\n');
}

/**
 * Build iteration prompt (for continuing after tool results)
 */
export function buildIterationPrompt(
  iteration: number,
  maxIterations: number
): string {
  const remaining = maxIterations - iteration;

  if (remaining <= 1) {
    return `This is your final iteration. You must provide a response to the user now.`;
  }

  return `Iteration ${iteration}/${maxIterations}. You have ${remaining} iterations remaining.
Continue reasoning based on the observations above.`;
}
