/**
 * Agent Core
 *
 * Implements the ReAct (Reason-Act-Observe) pattern for agentic AI behavior.
 */

import {
  AgentConfig,
  AgentState,
  AgentInput,
  AgentOutput,
  AgentEvent,
  AgentReasoning,
  ToolCall,
  ToolResult,
  ToolContext,
  Observation,
} from '@/types/agent';
import { AIMessage } from '@/types/ai-providers';
import { ProviderFactory } from '@/lib/providers/provider-factory';
import { GEMINI_MODELS, ModelTier } from '@/config/models';
import { toolRegistry, storeResult } from '../tools';
import { buildAgentPrompt, buildToolsDescription } from './prompts';
import { compressResults, buildScratchpad } from './context-manager';
import { v4 as uuidv4 } from 'uuid';

export class Agent {
  private config: AgentConfig;
  private state: AgentState;
  private eventCallback?: (event: AgentEvent) => void;

  constructor(config: AgentConfig) {
    this.config = config;
    this.state = {
      iteration: 0,
      toolCalls: [],
      observations: [],
      reasoning: [],
      finalAnswer: null,
      shouldContinue: true,
      totalCost: 0,
      totalTokens: 0,
    };
  }

  /**
   * Set callback for streaming agent events
   */
  onEvent(callback: (event: AgentEvent) => void): void {
    this.eventCallback = callback;
  }

  /**
   * Emit an agent event
   */
  private emit(event: AgentEvent): void {
    if (this.eventCallback) {
      this.eventCallback(event);
    }
  }

  /**
   * Run the agent on the given input
   */
  async run(input: AgentInput): Promise<AgentOutput> {
    const requestId = uuidv4();
    const toolContext: ToolContext = {
      userId: this.config.userId,
      conversationId: this.config.conversationId,
      requestId,
    };

    try {
      // Main ReAct loop
      while (
        this.state.shouldContinue &&
        this.state.iteration < this.config.maxIterations
      ) {
        this.state.iteration++;

        // Reason: Generate reasoning and decide on action
        const reasoning = await this.reason(input);

        this.state.reasoning.push(reasoning.thinking);
        this.emit({
          type: 'reasoning',
          content: reasoning.thinking,
          iteration: this.state.iteration,
        });

        // Check if agent wants to respond directly
        if (reasoning.action === 'respond') {
          this.state.finalAnswer = reasoning.response || '';
          this.state.shouldContinue = false;
          break;
        }

        // Act: Execute tools
        if (reasoning.toolCalls.length > 0) {
          const results = await this.act(reasoning.toolCalls, toolContext);

          // Observe: Process results
          const observation = this.observe(reasoning.toolCalls, results);
          this.state.observations.push(observation);

          this.emit({
            type: 'observation',
            content: observation.summary,
            iteration: this.state.iteration,
            results,
          });

          // Check if image was generated - if so, use it as final answer and terminate
          // Image generation is a terminal action that completes the user's request
          const imageGenerateIndex = reasoning.toolCalls.findIndex(
            (call) => call.tool === 'image_generate'
          );
          if (imageGenerateIndex !== -1 && results[imageGenerateIndex]?.success) {
            // Extract image from tool result and use as final answer
            const imageResult = results[imageGenerateIndex];
            const imageData = imageResult.data as {
              generatedContent?: string;
              originalPrompt?: string;
              prompt?: string;
            };

            // Build response with both description and image
            // If generatedContent has no text (only image), add descriptive text
            const content = imageData?.generatedContent || '';
            const hasText = content.includes('![Generated Image]') &&
                           content.replace(/!\[Generated Image\]\(data:image\/[^)]+\)/g, '').trim().length > 0;

            if (!hasText && content.includes('![Generated Image]')) {
              // Image-only response, add descriptive text
              const prompt = imageData?.originalPrompt || imageData?.prompt || 'your request';
              this.state.finalAnswer = `I've generated an image for: ${prompt}\n\n${content}`;
            } else {
              this.state.finalAnswer = content || 'Image generated successfully.';
            }

            this.state.shouldContinue = false;
            break;
          }
        }

        // Check cost budget
        if (this.state.totalCost >= this.config.costBudget) {
          this.emit({
            type: 'error',
            content: 'Cost budget exceeded',
            iteration: this.state.iteration,
          });
          break;
        }
      }

      // If we exhausted iterations without a final answer, generate one
      if (!this.state.finalAnswer) {
        this.state.finalAnswer = await this.generateFinalResponse(input);
      }

      // Emit final response
      this.emit({
        type: 'response',
        content: this.state.finalAnswer,
      });

      return {
        response: this.state.finalAnswer,
        toolsUsed: this.getToolsUsed(),
        iterations: this.state.iteration,
        totalCost: this.state.totalCost,
        totalTokens: this.state.totalTokens,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Agent execution failed';
      this.emit({
        type: 'error',
        content: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Reason phase: Analyze situation and decide on action
   */
  private async reason(input: AgentInput): Promise<AgentReasoning> {
    const provider = ProviderFactory.createDefaultProvider(this.config.model);

    // Build system prompt with tools
    const systemPrompt = buildAgentPrompt(
      this.config.style,
      buildToolsDescription(this.config.tools)
    );

    // Build conversation with scratchpad
    const scratchpad = buildScratchpad(
      this.state.reasoning,
      this.state.observations
    );

    const messages: AIMessage[] = [
      ...input.conversationHistory,
      {
        role: 'user',
        content: input.message,
      },
    ];

    // Add scratchpad as assistant context if we have prior iterations
    if (scratchpad) {
      messages.push({
        role: 'assistant',
        content: scratchpad,
      });
      messages.push({
        role: 'user',
        content: 'Continue with your reasoning and action.',
      });
    }

    // Retry up to 2 times if parsing fails
    const maxRetries = 2;
    let lastResponse = '';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // Generate reasoning
      const response = await provider.generateResponse(
        messages,
        systemPrompt,
        this.config.temperature,
        input.files
      );

      // Update token usage
      this.state.totalTokens += response.usage?.totalTokens || 0;
      lastResponse = response.content;

      // Parse the response to extract reasoning and actions
      const parsed = this.parseReasoning(response.content);

      if (parsed) {
        return parsed;
      }

      // Log retry attempt with actual response content
      console.log(`[Agent] Failed to parse response (attempt ${attempt}/${maxRetries}), retrying...`);
      console.log(`[Agent] Raw response that failed parsing:\n${response.content.substring(0, 1000)}`);

      // Add a hint message for retry
      if (attempt < maxRetries) {
        messages.push({
          role: 'assistant',
          content: response.content,
        });
        messages.push({
          role: 'user',
          content: 'Your response was not in valid JSON format. Please respond with valid JSON in the format specified (either with ```json code blocks or as a raw JSON object with "thinking", "action", etc. fields).',
        });
      }
    }

    // Fallback: treat raw text as response (more resilient than throwing error)
    console.log('[Agent] All retries failed, using raw text as fallback response');
    return {
      thinking: '',
      action: 'respond',
      toolCalls: [],
      response: lastResponse,
    };
  }

  /**
   * Parse LLM response into structured reasoning
   * Returns null if parsing fails (caller should retry)
   */
  private parseReasoning(content: string): AgentReasoning | null {
    // Try to extract JSON from code blocks first
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        return {
          thinking: parsed.thinking || '',
          action: parsed.action || 'respond',
          toolCalls: parsed.tool_calls || [],
          response: parsed.response,
          confidence: parsed.confidence,
        };
      } catch {
        // Fall through to text parsing
      }
    }

    // Try to find raw JSON object (with or without prefix like "---")
    const rawJsonMatch = content.match(/\{[\s\S]*"action"[\s\S]*\}/);
    if (rawJsonMatch) {
      try {
        const parsed = JSON.parse(rawJsonMatch[0]);
        return {
          thinking: parsed.thinking || '',
          action: parsed.action || 'respond',
          toolCalls: parsed.tool_calls || [],
          response: parsed.response,
          confidence: parsed.confidence,
        };
      } catch {
        // Fall through to text parsing
      }
    }

    // Parse structured text format
    const thinkingMatch = content.match(/<thinking>([\s\S]*?)<\/thinking>/);
    const actionMatch = content.match(/<action>([\s\S]*?)<\/action>/);
    const responseMatch = content.match(/<response>([\s\S]*?)<\/response>/);

    if (thinkingMatch || actionMatch || responseMatch) {
      const thinking = thinkingMatch ? thinkingMatch[1].trim() : '';
      const actionContent = actionMatch ? actionMatch[1].trim() : '';
      const responseContent = responseMatch ? responseMatch[1].trim() : '';

      // Parse tool calls from action
      const toolCalls: ToolCall[] = [];
      const toolCallMatches = actionContent.matchAll(
        /tool:\s*(\w+)\s*\nparameters:\s*({[\s\S]*?})\s*(?:reasoning:\s*(.*?))?(?=\n\ntool:|$)/g
      );

      for (const match of toolCallMatches) {
        try {
          toolCalls.push({
            tool: match[1],
            parameters: JSON.parse(match[2]),
            reasoning: match[3] || '',
          });
        } catch {
          // Skip malformed tool calls
        }
      }

      return {
        thinking,
        action: toolCalls.length > 0 ? 'tool' : 'respond',
        toolCalls,
        response: responseContent || content,
      };
    }

    // Default: return null to indicate parsing failed (caller should retry)
    return null;
  }

  /**
   * Act phase: Execute tool calls
   */
  private async act(
    toolCalls: ToolCall[],
    context: ToolContext
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const call of toolCalls) {
      this.emit({
        type: 'tool_call',
        toolName: call.tool,
        content: call.reasoning,
        iteration: this.state.iteration,
      });

      const tool = toolRegistry.get(call.tool);

      if (!tool) {
        results.push({
          success: false,
          error: `Unknown tool: ${call.tool}`,
        });
        continue;
      }

      try {
        const result = await tool.execute(call.parameters, context);
        results.push(result);

        // Store full result for potential recall
        if (result.success && result.data) {
          const resultId = `${call.tool}_${context.requestId}_${Date.now()}`;
          storeResult(resultId, result.data);
        }

        // Track tool call
        this.state.toolCalls.push(call);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Tool execution failed';
        results.push({
          success: false,
          error: message,
        });
      }
    }

    this.emit({
      type: 'tool_results',
      results,
      iteration: this.state.iteration,
    });

    return results;
  }

  /**
   * Observe phase: Process and summarize tool results
   */
  private observe(toolCalls: ToolCall[], results: ToolResult[]): Observation {
    // Compress results to save context
    const compressed = compressResults(
      toolCalls.map((tc, i) => ({
        toolName: tc.tool,
        result: results[i],
      }))
    );

    // Build observation summary
    const summaries = compressed.map((c) => {
      if (c.keyPoints.length > 0) {
        return `${c.toolName}: ${c.summary}\n  - ${c.keyPoints.join('\n  - ')}`;
      }
      return `${c.toolName}: ${c.summary}`;
    });

    return {
      summary: summaries.join('\n\n'),
      results,
      timestamp: Date.now(),
      error: results.some((r) => !r.success),
    };
  }

  /**
   * Generate final response after all iterations
   */
  private async generateFinalResponse(input: AgentInput): Promise<string> {
    const provider = ProviderFactory.createDefaultProvider(this.config.model);

    // Build final context with all observations
    const observations = this.state.observations
      .map((o) => o.summary)
      .join('\n\n');

    const systemPrompt = `You are a helpful AI assistant. Based on your reasoning and the information gathered, provide a comprehensive and helpful response to the user.

${observations ? `\nInformation gathered:\n${observations}` : ''}`;

    const messages: AIMessage[] = [
      ...input.conversationHistory,
      {
        role: 'user',
        content: input.message,
      },
    ];

    const response = await provider.generateResponse(
      messages,
      systemPrompt,
      this.config.temperature,
      input.files
    );

    this.state.totalTokens += response.usage?.totalTokens || 0;

    return response.content;
  }

  /**
   * Get list of tools that were used
   */
  private getToolsUsed(): string[] {
    const tools = new Set<string>();
    for (const call of this.state.toolCalls) {
      tools.add(call.tool);
    }
    return Array.from(tools);
  }

  /**
   * Get current state (for debugging)
   */
  getState(): AgentState {
    return { ...this.state };
  }
}

/**
 * Create an agent with default configuration
 */
export function createAgent(config: Partial<AgentConfig> & {
  userId: string;
  conversationId: string;
}): Agent {
  const defaultConfig: AgentConfig = {
    maxIterations: 5,
    model: GEMINI_MODELS[ModelTier.MAIN],
    temperature: 0.7,
    tools: Array.from(toolRegistry.values()),
    style: 'balanced',
    costBudget: 0.10, // $0.10 per request
    ...config,
  };

  return new Agent(defaultConfig);
}
