/**
 * Tests for Agent Utility Tools
 */

import { getCurrentTimeTool } from '@/lib/agent/tools/get-current-time';
import {
  recallDetailsTool,
  storeResult,
  clearStoredResults,
  getStoredResultIds,
} from '@/lib/agent/tools/recall-details';
import { ToolContext } from '@/types/agent';

const mockContext: ToolContext = {
  userId: 'test-user',
  conversationId: 'test-conversation',
  requestId: 'test-request',
};

describe('GetCurrentTimeTool', () => {
  it('has correct metadata', () => {
    expect(getCurrentTimeTool.name).toBe('get_current_time');
    expect(getCurrentTimeTool.description).toContain('current date and time');
    expect(getCurrentTimeTool.parameters).toHaveLength(2);
  });

  it('returns current time in full format', async () => {
    const result = await getCurrentTimeTool.execute({}, mockContext);

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('datetime');
    expect(result.data).toHaveProperty('date');
    expect(result.data).toHaveProperty('time');
    expect(result.data).toHaveProperty('timezone');
    expect(result.data).toHaveProperty('timestamp');
    expect(result.data).toHaveProperty('iso');
  });

  it('returns time in ISO format', async () => {
    const result = await getCurrentTimeTool.execute(
      { format: 'iso' },
      mockContext
    );

    expect(result.success).toBe(true);
    const data = result.data as { iso: string };
    expect(data.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns date only', async () => {
    const result = await getCurrentTimeTool.execute(
      { format: 'date' },
      mockContext
    );

    expect(result.success).toBe(true);
    const data = result.data as { date: string };
    expect(data.date).toBeDefined();
    expect(data).not.toHaveProperty('time');
  });

  it('returns time only', async () => {
    const result = await getCurrentTimeTool.execute(
      { format: 'time' },
      mockContext
    );

    expect(result.success).toBe(true);
    const data = result.data as { time: string };
    expect(data.time).toBeDefined();
  });

  it('uses specified timezone', async () => {
    const result = await getCurrentTimeTool.execute(
      { timezone: 'America/New_York' },
      mockContext
    );

    expect(result.success).toBe(true);
    const data = result.data as { timezone: string };
    expect(data.timezone).toBe('America/New_York');
  });

  it('defaults to UTC timezone', async () => {
    const result = await getCurrentTimeTool.execute({}, mockContext);

    expect(result.success).toBe(true);
    const data = result.data as { timezone: string };
    expect(data.timezone).toBe('UTC');
  });
});

describe('RecallDetailsTool', () => {
  beforeEach(() => {
    clearStoredResults();
  });

  it('has correct metadata', () => {
    expect(recallDetailsTool.name).toBe('recall_details');
    expect(recallDetailsTool.description).toContain('full details');
    expect(recallDetailsTool.parameters).toHaveLength(2);
  });

  it('stores and retrieves results', async () => {
    const testData = { foo: 'bar', items: [1, 2, 3] };
    storeResult('test-id', testData);

    const result = await recallDetailsTool.execute(
      { resultId: 'test-id' },
      mockContext
    );

    expect(result.success).toBe(true);
    const data = result.data as { data: typeof testData };
    expect(data.data).toEqual(testData);
  });

  it('returns error for non-existent result', async () => {
    const result = await recallDetailsTool.execute(
      { resultId: 'nonexistent' },
      mockContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('extracts specific fields when requested', async () => {
    const testData = { name: 'Test', value: 123, extra: 'ignored' };
    storeResult('test-id', testData);

    const result = await recallDetailsTool.execute(
      { resultId: 'test-id', fields: ['name', 'value'] },
      mockContext
    );

    expect(result.success).toBe(true);
    const data = result.data as { data: { name: string; value: number } };
    expect(data.data).toEqual({ name: 'Test', value: 123 });
    expect(data.data).not.toHaveProperty('extra');
  });

  it('clears all stored results', () => {
    storeResult('id-1', { a: 1 });
    storeResult('id-2', { b: 2 });

    expect(getStoredResultIds()).toHaveLength(2);

    clearStoredResults();

    expect(getStoredResultIds()).toHaveLength(0);
  });

  it('lists stored result IDs', () => {
    storeResult('id-1', { a: 1 });
    storeResult('id-2', { b: 2 });

    const ids = getStoredResultIds();

    expect(ids).toContain('id-1');
    expect(ids).toContain('id-2');
  });
});

describe('Tool Registry', () => {
  it('exports all tools', async () => {
    const { allTools, toolRegistry } = await import('@/lib/agent/tools');

    expect(allTools.length).toBe(7);
    expect(toolRegistry.size).toBe(7);

    const toolNames = allTools.map((t) => t.name);
    expect(toolNames).toContain('web_search');
    expect(toolNames).toContain('web_fetch');
    expect(toolNames).toContain('memory_retrieve');
    expect(toolNames).toContain('memory_save');
    expect(toolNames).toContain('recall_details');
    expect(toolNames).toContain('get_current_time');
    expect(toolNames).toContain('image_generate');
  });

  it('retrieves tools by name', async () => {
    const { getTool, getTools } = await import('@/lib/agent/tools');

    const tool = getTool('web_search');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('web_search');

    const tools = getTools(['web_search', 'get_current_time']);
    expect(tools).toHaveLength(2);
  });

  it('returns undefined for unknown tools', async () => {
    const { getTool } = await import('@/lib/agent/tools');

    const tool = getTool('unknown_tool');
    expect(tool).toBeUndefined();
  });
});
