/**
 * Tests for Agent Context Manager
 */

import {
  compressResults,
  buildScratchpad,
  checkContextBudget,
  truncateScratchpad,
} from '@/lib/agent/core/context-manager';
import { ToolResult, Observation } from '@/types/agent';

describe('compressResults', () => {
  it('compresses successful web search results', () => {
    const results = [
      {
        toolName: 'web_search',
        result: {
          success: true,
          data: {
            query: 'test query',
            results: [
              { title: 'Result 1', link: 'http://example.com/1', snippet: 'Snippet 1' },
              { title: 'Result 2', link: 'http://example.com/2', snippet: 'Snippet 2' },
            ],
          },
        },
      },
    ];

    const compressed = compressResults(results);

    expect(compressed).toHaveLength(1);
    expect(compressed[0].toolName).toBe('web_search');
    expect(compressed[0].summary).toContain('Found 2 results');
    expect(compressed[0].keyPoints).toHaveLength(2);
  });

  it('compresses error results', () => {
    const results = [
      {
        toolName: 'web_search',
        result: {
          success: false,
          error: 'Rate limit exceeded',
        },
      },
    ];

    const compressed = compressResults(results);

    expect(compressed[0].summary).toContain('Error: Rate limit exceeded');
    expect(compressed[0].keyPoints).toHaveLength(0);
  });

  it('compresses memory retrieve results', () => {
    const results = [
      {
        toolName: 'memory_retrieve',
        result: {
          success: true,
          data: {
            facts: [
              { content: 'User prefers TypeScript', category: 'preference' },
              { content: 'User works on AI projects', category: 'project' },
            ],
          },
        },
      },
    ];

    const compressed = compressResults(results);

    expect(compressed[0].summary).toContain('Retrieved 2 memory fact(s)');
    expect(compressed[0].keyPoints).toHaveLength(2);
    expect(compressed[0].keyPoints[0]).toContain('[preference]');
  });

  it('compresses memory save results', () => {
    const results = [
      {
        toolName: 'memory_save',
        result: {
          success: true,
          data: {
            savedCount: 1,
            facts: [
              { content: 'User likes Python', category: 'preference' },
            ],
          },
        },
      },
    ];

    const compressed = compressResults(results);

    expect(compressed[0].summary).toContain('Saved 1 fact(s)');
  });

  it('compresses get_current_time results', () => {
    const results = [
      {
        toolName: 'get_current_time',
        result: {
          success: true,
          data: {
            datetime: 'Monday, January 1, 2024 at 12:00:00',
            timezone: 'UTC',
          },
        },
      },
    ];

    const compressed = compressResults(results);

    expect(compressed[0].summary).toBe('Monday, January 1, 2024 at 12:00:00');
  });
});

describe('buildScratchpad', () => {
  it('returns empty string for no history', () => {
    const result = buildScratchpad([], []);
    expect(result).toBe('');
  });

  it('builds scratchpad from reasoning and observations', () => {
    const reasoning = ['I need to search for information about X'];
    const observations: Observation[] = [
      {
        summary: 'Found 3 results about X',
        results: [],
        timestamp: Date.now(),
      },
    ];

    const scratchpad = buildScratchpad(reasoning, observations);

    expect(scratchpad).toContain('## Iteration 1');
    expect(scratchpad).toContain('### Reasoning');
    expect(scratchpad).toContain('I need to search');
    expect(scratchpad).toContain('### Observation');
    expect(scratchpad).toContain('Found 3 results');
  });

  it('handles multiple iterations', () => {
    const reasoning = [
      'First search',
      'Need more details',
    ];
    const observations: Observation[] = [
      { summary: 'First observation', results: [], timestamp: Date.now() },
      { summary: 'Second observation', results: [], timestamp: Date.now() },
    ];

    const scratchpad = buildScratchpad(reasoning, observations);

    expect(scratchpad).toContain('## Iteration 1');
    expect(scratchpad).toContain('## Iteration 2');
    expect(scratchpad).toContain('First search');
    expect(scratchpad).toContain('Need more details');
  });

  it('notes errors in observations', () => {
    const reasoning = ['Testing'];
    const observations: Observation[] = [
      {
        summary: 'Tool failed',
        results: [],
        timestamp: Date.now(),
        error: true,
      },
    ];

    const scratchpad = buildScratchpad(reasoning, observations);

    expect(scratchpad).toContain('(Some tools encountered errors)');
  });
});

describe('checkContextBudget', () => {
  it('reports within budget for small content', () => {
    const result = checkContextBudget(
      'System prompt',
      'History',
      'Message',
      'Scratchpad'
    );

    expect(result.withinBudget).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it('reports usage for each component', () => {
    const result = checkContextBudget(
      'System prompt here',
      'Some history',
      'User message',
      'Agent scratchpad'
    );

    expect(result.usage.systemPrompt).toBeGreaterThan(0);
    expect(result.usage.conversationHistory).toBeGreaterThan(0);
    expect(result.usage.currentMessage).toBeGreaterThan(0);
    expect(result.usage.agentScratchpad).toBeGreaterThan(0);
  });
});

describe('truncateScratchpad', () => {
  it('returns unchanged if within limit', () => {
    const scratchpad = '## Iteration 1\nShort content';
    const result = truncateScratchpad(scratchpad, 1000);
    expect(result).toBe(scratchpad);
  });

  it('truncates to fit within limit', () => {
    const longScratchpad = `## Iteration 1
### Reasoning
${'Long content '.repeat(100)}

## Iteration 2
### Reasoning
Short content`;

    const result = truncateScratchpad(longScratchpad, 50);

    // Should contain truncation notice and keep most recent
    expect(result).toContain('[Earlier iterations truncated]');
  });

  it('handles empty scratchpad', () => {
    const result = truncateScratchpad('', 100);
    expect(result).toBe('');
  });
});
