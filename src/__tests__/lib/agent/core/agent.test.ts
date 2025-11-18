/**
 * Tests for Agent Core
 */

import { Agent, createAgent } from '@/lib/agent/core/agent';
import { AgentConfig, AgentEvent, ToolResult } from '@/types/agent';
import { toolRegistry } from '@/lib/agent/tools';
import { ProviderFactory } from '@/lib/providers/provider-factory';

// Mock the provider factory module
jest.mock('@/lib/providers/provider-factory');

// Mock functions that can be configured in tests
const mockGenerateResponse = jest.fn();
const mockStreamResponse = jest.fn();

describe('Agent', () => {
  const mockConfig: AgentConfig = {
    maxIterations: 3,
    model: 'test-model',
    temperature: 0.7,
    tools: Array.from(toolRegistry.values()),
    userId: 'test-user',
    conversationId: 'test-conversation',
    style: 'balanced',
    costBudget: 0.10,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Configure the mock to return our mock provider
    (ProviderFactory.createDefaultProvider as jest.Mock).mockReturnValue({
      generateResponse: mockGenerateResponse,
      streamResponse: mockStreamResponse,
      isAvailable: jest.fn().mockResolvedValue(true),
      getName: jest.fn().mockReturnValue('mock-provider'),
    });
  });

  describe('createAgent', () => {
    it('creates agent with default configuration', () => {
      const agent = createAgent({
        userId: 'user-1',
        conversationId: 'conv-1',
      });

      const state = agent.getState();
      expect(state.iteration).toBe(0);
      expect(state.shouldContinue).toBe(true);
      expect(state.finalAnswer).toBeNull();
    });

    it('allows overriding configuration', () => {
      const agent = createAgent({
        userId: 'user-1',
        conversationId: 'conv-1',
        maxIterations: 10,
        style: 'tool_first',
      });

      // Agent created successfully with custom config
      expect(agent).toBeDefined();
    });
  });

  describe('run', () => {
    it('returns direct response when agent decides to respond', async () => {
      mockGenerateResponse.mockResolvedValue({
        content: '```json\n' + JSON.stringify({
          thinking: 'I can answer this directly',
          action: 'respond',
          response: 'Hello! How can I help you?',
          confidence: 0.9,
        }) + '\n```',
        usage: { totalTokens: 100 },
      });

      const agent = new Agent(mockConfig);
      const events: AgentEvent[] = [];
      agent.onEvent((event) => events.push(event));

      const result = await agent.run({
        message: 'Hello',
        conversationHistory: [],
      });

      expect(result.response).toBe('Hello! How can I help you?');
      expect(result.iterations).toBe(1);
      expect(events.some((e) => e.type === 'reasoning')).toBe(true);
      expect(events.some((e) => e.type === 'response')).toBe(true);
    });

    it('stops after maxIterations', async () => {
      // Always return tool calls, never respond
      mockGenerateResponse.mockResolvedValue({
        content: '```json\n' + JSON.stringify({
          thinking: 'Need more info',
          action: 'tool',
          tool_calls: [
            {
              tool: 'get_current_time',
              parameters: {},
              reasoning: 'Check time',
            },
          ],
        }) + '\n```',
        usage: { totalTokens: 50 },
      });

      const agent = new Agent({
        ...mockConfig,
        maxIterations: 2,
      });

      const result = await agent.run({
        message: 'What time is it?',
        conversationHistory: [],
      });

      expect(result.iterations).toBeLessThanOrEqual(2);
    });

    it('emits events during execution', async () => {
      mockGenerateResponse.mockResolvedValue({
        content: '```json\n' + JSON.stringify({
          thinking: 'Direct response',
          action: 'respond',
          response: 'Test response',
        }) + '\n```',
        usage: { totalTokens: 50 },
      });

      const agent = new Agent(mockConfig);
      const events: AgentEvent[] = [];
      agent.onEvent((event) => events.push(event));

      await agent.run({
        message: 'Test',
        conversationHistory: [],
      });

      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain('reasoning');
      expect(eventTypes).toContain('response');
    });

    it('tracks tools used', async () => {
      // First call: use tool
      mockGenerateResponse
        .mockResolvedValueOnce({
          content: '```json\n' + JSON.stringify({
            thinking: 'Check time first',
            action: 'tool',
            tool_calls: [
              {
                tool: 'get_current_time',
                parameters: {},
                reasoning: 'Need current time',
              },
            ],
          }) + '\n```',
          usage: { totalTokens: 50 },
        })
        // Second call: respond
        .mockResolvedValueOnce({
          content: '```json\n' + JSON.stringify({
            thinking: 'Now I can respond',
            action: 'respond',
            response: 'The time is 12:00',
          }) + '\n```',
          usage: { totalTokens: 50 },
        });

      const agent = new Agent(mockConfig);

      const result = await agent.run({
        message: 'What time is it?',
        conversationHistory: [],
      });

      expect(result.toolsUsed).toContain('get_current_time');
    });
  });

  describe('parseReasoning', () => {
    it('falls back to raw text after retries fail', async () => {
      // Mock returns plain text twice (retry fails both times)
      mockGenerateResponse.mockResolvedValue({
        content: 'Just a plain text response without JSON',
        usage: { totalTokens: 20 },
      });

      const agent = new Agent(mockConfig);

      const result = await agent.run({
        message: 'Test',
        conversationHistory: [],
      });

      // Falls back to using raw text as response
      expect(result.response).toBe('Just a plain text response without JSON');
    });

    it('succeeds on retry when model corrects to valid JSON', async () => {
      // First call: invalid format, second call: valid JSON
      mockGenerateResponse
        .mockResolvedValueOnce({
          content: 'Plain text that will fail parsing',
          usage: { totalTokens: 20 },
        })
        .mockResolvedValueOnce({
          content: '```json\n' + JSON.stringify({
            thinking: 'Corrected format',
            action: 'respond',
            response: 'Valid response after retry',
          }) + '\n```',
          usage: { totalTokens: 30 },
        });

      const agent = new Agent(mockConfig);

      const result = await agent.run({
        message: 'Test',
        conversationHistory: [],
      });

      expect(result.response).toBe('Valid response after retry');
      // Should have called generateResponse twice
      expect(mockGenerateResponse).toHaveBeenCalledTimes(2);
    });
  });

  describe('state management', () => {
    it('initializes with clean state', () => {
      const agent = new Agent(mockConfig);
      const state = agent.getState();

      expect(state.iteration).toBe(0);
      expect(state.toolCalls).toHaveLength(0);
      expect(state.observations).toHaveLength(0);
      expect(state.reasoning).toHaveLength(0);
      expect(state.finalAnswer).toBeNull();
      expect(state.shouldContinue).toBe(true);
      expect(state.totalCost).toBe(0);
      expect(state.totalTokens).toBe(0);
    });
  });
});

describe('Agent Styles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates agent with tool_first style', () => {
    const agent = createAgent({
      userId: 'user-1',
      conversationId: 'conv-1',
      style: 'tool_first',
    });

    expect(agent).toBeDefined();
  });

  it('creates agent with direct style', () => {
    const agent = createAgent({
      userId: 'user-1',
      conversationId: 'conv-1',
      style: 'direct',
    });

    expect(agent).toBeDefined();
  });

  it('creates agent with balanced style by default', () => {
    const agent = createAgent({
      userId: 'user-1',
      conversationId: 'conv-1',
    });

    expect(agent).toBeDefined();
  });
});
