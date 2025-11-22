# Agentic Architecture - DEFAULT PRODUCTION SYSTEM

## Overview

**Status**: ✅ **ENABLED BY DEFAULT IN PRODUCTION** (since 2025-11-17)

This document describes WhimCraft's agentic architecture using the ReAct (Reason-Act-Observe) pattern.

**Feature Flag**: `NEXT_PUBLIC_USE_AGENTIC_MODE=true` (default: enabled)

**Previous Architecture**: PromptAnalyzer → ContextOrchestrator → AI Response (linear pipeline)

**Current Architecture**: Agent with Tools performing iterative Reason → Act → Observe cycles (DEFAULT)

**Test Coverage**: 58 unit tests (100% pass rate)

---

## Core Concept: ReAct Pattern

The ReAct (Reason + Act) pattern allows the AI to:
1. **Reason** about what information is needed
2. **Act** by calling tools to gather information
3. **Observe** the results
4. **Reflect** on whether more actions are needed
5. **Respond** when sufficient information is gathered

```
┌─────────────────────────────────────────────────────────────┐
│                     USER MESSAGE                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    AGENT LOOP (max N iterations)            │
│                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐   │
│  │   REASON    │ →  │     ACT      │ →  │    OBSERVE    │   │
│  │ (think what │    │ (call tools) │    │ (get results) │   │
│  │  is needed) │    │              │    │               │   │
│  └─────────────┘    └──────────────┘    └───────┬───────┘   │
│         ↑                                       │           │
│         └───────────────────────────────────────┘           │
│                    (if more info needed)                    │
│                                                             │
│  Exit conditions:                                           │
│  • Agent decides it has enough info                         │
│  • Max iterations reached                                   │
│  • All required tools have been called                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   FINAL RESPONSE                            │
│              (Stream to user with citations)                │
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture Components

### 1. Agent Core

The central orchestrator that manages the ReAct loop.

```typescript
// src/lib/agent/core.ts

interface AgentConfig {
  maxIterations: number;        // Default: 5, configurable via admin
  model: string;                // Gemini model for reasoning
  temperature: number;          // Creativity level
  tools: Tool[];                // Available tools
  userId: string;
  conversationId: string;
}

interface AgentState {
  iteration: number;
  toolCalls: ToolCall[];
  observations: Observation[];
  reasoning: string[];
  finalAnswer: string | null;
  shouldContinue: boolean;
}

class Agent {
  private config: AgentConfig;
  private state: AgentState;
  private progressEmitter: ProgressEmitter;

  async run(
    message: string,
    conversationHistory: AIMessage[],
    files?: FileAttachment[]
  ): AsyncGenerator<AgentEvent> {
    // Initialize state
    this.state = this.initializeState();

    // Agent loop
    while (this.state.shouldContinue && this.state.iteration < this.config.maxIterations) {
      this.state.iteration++;

      // REASON: Determine what to do
      const reasoning = await this.reason(message, conversationHistory);
      yield { type: 'reasoning', content: reasoning };

      // Check if agent wants to respond
      if (reasoning.action === 'respond') {
        this.state.shouldContinue = false;
        break;
      }

      // ACT: Execute tool calls
      const toolResults = await this.act(reasoning.toolCalls);
      yield { type: 'tool_results', results: toolResults };

      // OBSERVE: Process results
      const observation = this.observe(toolResults);
      this.state.observations.push(observation);
      yield { type: 'observation', content: observation };
    }

    // Generate final response
    for await (const chunk of this.generateResponse(message, conversationHistory)) {
      yield { type: 'response', content: chunk };
    }
  }
}
```

### 2. Tool System

Each capability becomes a tool with a defined interface.

```typescript
// src/lib/agent/tools/base.ts

interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute(params: Record<string, any>): Promise<ToolResult>;
}

interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  enum?: string[];
}

interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: {
    executionTime: number;
    cost?: number;
    tokensUsed?: number;
  };
}

interface ToolCall {
  tool: string;
  parameters: Record<string, any>;
  reasoning: string;  // Why the agent chose this tool
}
```

---

## Tool Definitions

### Tool 1: WebSearch

Search the web for current information with reliable source targeting.

**IMPLEMENTED ENHANCEMENT**: `sourceCategory` parameter for targeting reliable sources to reduce 403 errors.

```typescript
// src/lib/agent/tools/web-search.ts

// Reliable source categories
const RELIABLE_SOURCES: Record<string, string[]> = {
  encyclopedia: ['wikipedia.org', 'britannica.com'],
  programming: ['stackoverflow.com', 'github.com', 'developer.mozilla.org'],
  academic: ['arxiv.org', 'scholar.google.com', 'ncbi.nlm.nih.gov'],
  government: ['*.gov', 'who.int', 'un.org'],
  finance: ['reuters.com', 'bloomberg.com', 'sec.gov'],
  tech: ['techcrunch.com', 'arstechnica.com', 'wired.com'],
  reference: ['wikipedia.org', 'britannica.com', 'merriam-webster.com'],
};

const WebSearchTool: Tool = {
  name: 'web_search',
  description: `Search the web for current information. Use this tool when you need:
    - Latest news, products, or updates
    - Real-time data (stock prices, weather, sports scores)
    - Current comparisons or reviews
    - Information that may have changed since your training

    IMPORTANT: Use sourceCategory to target reliable sources:
    - "encyclopedia" for facts/concepts (Wikipedia)
    - "programming" for code questions (StackOverflow, GitHub)
    - "finance" for financial data (Reuters, Bloomberg)

    DO NOT use for: timeless concepts, historical facts, creative writing`,

  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'The search query, optimized for Google search',
      required: true
    },
    {
      name: 'sourceCategory',
      type: 'string',
      description: 'Category of reliable sources: encyclopedia, programming, finance, government, academic, tech, reference',
      required: false
    },
    {
      name: 'targetInfo',
      type: 'array',
      description: 'Key aspects to cover (e.g., ["pricing", "features", "reviews"])',
      required: false
    }
  ],

  async execute(params): Promise<ToolResult> {
    const { query, targetInfo } = params;

    // Check rate limits
    const rateCheck = await searchRateLimiter.checkRateLimit();
    if (!rateCheck.allowed) {
      return {
        success: false,
        error: `Rate limit exceeded. ${rateCheck.message}`
      };
    }

    // Execute search
    const results = await googleSearchService.search(query, 5);

    // Track usage
    await searchRateLimiter.trackUsage(this.userId, query, results.length);

    return {
      success: true,
      data: {
        results,
        query,
        targetInfo
      },
      metadata: {
        executionTime: Date.now() - startTime,
        cost: 0  // Free tier
      }
    };
  }
};
```

### Tool 2: WebFetch

Fetch and extract content from web pages.

```typescript
// src/lib/agent/tools/web-fetch.ts

const WebFetchTool: Tool = {
  name: 'web_fetch',
  description: `Fetch and extract content from specific web pages. Use after web_search
    to get detailed information from the search results. Returns extracted, relevant
    content rather than raw HTML.`,

  parameters: [
    {
      name: 'urls',
      type: 'array',
      description: 'URLs to fetch (max 3 for efficiency)',
      required: true
    },
    {
      name: 'query',
      type: 'string',
      description: 'The original query to focus extraction on',
      required: true
    }
  ],

  async execute(params): Promise<ToolResult> {
    const { urls, query } = params;
    const limitedUrls = urls.slice(0, 3);

    // Fetch pages
    const fetchResults = await contentFetcher.fetchMultiple(limitedUrls);

    // Extract relevant content
    const validContent = fetchResults
      .filter(r => 'content' in r)
      .map(r => ({ url: r.url, content: r.content }));

    if (validContent.length === 0) {
      return {
        success: false,
        error: 'Failed to fetch content from all URLs'
      };
    }

    // AI-powered extraction
    const extracted = await contentExtractor.extractAndRank(validContent, query);

    return {
      success: true,
      data: {
        extractedContent: extracted,
        fetchedCount: validContent.length,
        failedCount: fetchResults.length - validContent.length
      },
      metadata: {
        executionTime: Date.now() - startTime,
        tokensUsed: extracted.reduce((sum, e) => sum + estimateTokens(e.extractedInfo), 0)
      }
    };
  }
};
```

### Tool 3: MemoryRetrieve

Retrieve relevant facts from user's memory.

```typescript
// src/lib/agent/tools/memory-retrieve.ts

const MemoryRetrieveTool: Tool = {
  name: 'memory_retrieve',
  description: `Retrieve relevant facts about the user from their memory store.
    Use this to personalize responses with user preferences, context, and history.
    Memory contains: profile info, preferences, technical context, current projects.`,

  parameters: [
    {
      name: 'searchTerms',
      type: 'array',
      description: 'Keywords to search for in memory (e.g., ["food", "allergies"])',
      required: false
    },
    {
      name: 'categories',
      type: 'array',
      description: 'Categories to filter: profile, preference, technical, project',
      required: false
    }
  ],

  async execute(params): Promise<ToolResult> {
    const { searchTerms, categories } = params;

    // Load user memory
    const memory = await getUserMemory(this.userId);

    if (!memory || memory.facts.length === 0) {
      return {
        success: true,
        data: { facts: [], message: 'No memories stored for this user' }
      };
    }

    // Filter by search terms and categories
    let filteredFacts = memory.facts;

    if (categories?.length) {
      filteredFacts = filteredFacts.filter(f => categories.includes(f.category));
    }

    if (searchTerms?.length) {
      filteredFacts = filteredFacts.filter(fact =>
        searchTerms.some(term =>
          fact.content.toLowerCase().includes(term.toLowerCase()) ||
          fact.keywords?.some(k => k.toLowerCase().includes(term.toLowerCase()))
        )
      );
    }

    // Mark as used for relevance scoring
    if (filteredFacts.length > 0) {
      await markMemoryUsed(this.userId, filteredFacts.map(f => f.id));
    }

    return {
      success: true,
      data: {
        facts: filteredFacts,
        totalMemories: memory.facts.length,
        matchedCount: filteredFacts.length
      }
    };
  }
};
```

### Tool 4: MemorySave

Save new facts to user's memory.

```typescript
// src/lib/agent/tools/memory-save.ts

const MemorySaveTool: Tool = {
  name: 'memory_save',
  description: `Save important facts about the user for future conversations.
    Use when user shares personal info, preferences, or context worth remembering.
    NEVER save: sensitive data (passwords, SSN), temporary info, speculative facts.

    Tiers:
    - core: Never expire (name, birthday, allergies) - max 8
    - important: 90 days (preferences, skills) - max 12
    - context: 30 days (current projects) - max 6`,

  parameters: [
    {
      name: 'facts',
      type: 'array',
      description: 'Facts to save with structure: {content, category, tier, confidence, keywords}',
      required: true
    }
  ],

  async execute(params): Promise<ToolResult> {
    const { facts } = params;

    // Validate and complete facts
    const completedFacts = facts.map(fact => ({
      id: generateMemoryId(),
      content: fact.content,
      category: fact.category || 'preference',
      tier: fact.tier || 'important',
      confidence: fact.confidence || 0.8,
      keywords: fact.keywords || [],
      source: `conversation:${this.conversationId}`,
      created_at: new Date(),
      last_used_at: new Date(),
      use_count: 0,
      expires_at: calculateExpiry(fact.tier || 'important'),
      extracted_from: this.conversationId,
      auto_extracted: true
    }));

    // Save with deduplication
    await addMemoryFacts(this.userId, completedFacts);

    // Cleanup to enforce limits
    await cleanupUserMemory(this.userId);

    return {
      success: true,
      data: {
        savedCount: completedFacts.length,
        facts: completedFacts.map(f => ({ id: f.id, content: f.content, tier: f.tier }))
      }
    };
  }
};
```

### Tool 5: ImageGenerate

Generate images using the AI model.

```typescript
// src/lib/agent/tools/image-generate.ts

const ImageGenerateTool: Tool = {
  name: 'image_generate',
  description: `Generate images based on text descriptions. Use when user explicitly
    requests image creation, artwork, visualizations, or diagrams.
    Returns: Image data that will be displayed to the user.`,

  parameters: [
    {
      name: 'description',
      type: 'string',
      description: 'Detailed description of the image to generate',
      required: true
    },
    {
      name: 'style',
      type: 'string',
      description: 'Optional style hints (realistic, cartoon, diagram, etc.)',
      required: false
    }
  ],

  async execute(params): Promise<ToolResult> {
    const { description, style } = params;

    // This tool sets a flag for the final response generation
    // The actual image generation happens during response streaming
    // using the IMAGE model tier

    return {
      success: true,
      data: {
        shouldUseImageModel: true,
        enhancedPrompt: style
          ? `${description}. Style: ${style}`
          : description
      }
    };
  }
};
```

### Tool 6: GetCurrentTime (Utility)

```typescript
// src/lib/agent/tools/utilities.ts

const GetCurrentTimeTool: Tool = {
  name: 'get_current_time',
  description: 'Get the current date and time. Use when user asks about current time or dates.',

  parameters: [
    {
      name: 'timezone',
      type: 'string',
      description: 'Timezone (e.g., "America/New_York"). Defaults to UTC.',
      required: false
    }
  ],

  async execute(params): Promise<ToolResult> {
    const { timezone = 'UTC' } = params;

    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      dateStyle: 'full',
      timeStyle: 'long'
    });

    return {
      success: true,
      data: {
        formatted: formatter.format(now),
        iso: now.toISOString(),
        timezone
      }
    };
  }
};
```

### Tool 7: RecallDetails (Context Expansion)

Retrieve full details from compressed tool results.

```typescript
// src/lib/agent/tools/recall.ts

const RecallDetailsTool: Tool = {
  name: 'recall_details',
  description: `Retrieve full details from a previous tool result that was compressed.
    Use when the summary isn't sufficient and you need the complete data.
    Results are automatically compressed to manage context - use this to expand them.`,

  parameters: [
    {
      name: 'resultId',
      type: 'string',
      description: 'ID of the compressed result to expand (shown in previous results)',
      required: true
    },
    {
      name: 'focus',
      type: 'string',
      description: 'Specific aspect to focus on (e.g., "pricing", "specifications")',
      required: false
    }
  ],

  async execute(params): Promise<ToolResult> {
    const { resultId, focus } = params;

    // Retrieve from temporary storage
    const fullResult = await retrieveFullResult(resultId);

    if (!fullResult) {
      return {
        success: false,
        error: 'Result not found or expired (results expire after request completes)'
      };
    }

    // If focus specified, extract just that part using AI
    if (focus) {
      const focused = await extractFocusedContent(fullResult, focus);
      return {
        success: true,
        data: focused,
        metadata: {
          executionTime: Date.now() - startTime,
          tokensUsed: estimateTokens(JSON.stringify(focused))
        }
      };
    }

    return {
      success: true,
      data: fullResult,
      metadata: {
        executionTime: Date.now() - startTime,
        tokensUsed: estimateTokens(JSON.stringify(fullResult))
      }
    };
  }
};
```

---

## Context Management System

Each iteration adds reasoning, tool results, and observations. Without management, context can quickly exceed limits and increase costs. This system uses a **hybrid approach**: automatic compression + recall tool.

### Context Budget Architecture

```typescript
// src/lib/agent/context.ts

interface ContextBudget {
  total: number;                    // e.g., 30,000 tokens
  systemPrompt: number;             // Fixed: ~500 tokens
  conversationHistory: number;      // ~5,000 tokens (sliding window)
  currentMessage: number;           // ~500 tokens
  agentScratchpad: number;          // ~20,000 tokens (for iterations)
  responseBuffer: number;           // ~4,000 tokens (for final response)
}

interface AgentScratchpad {
  iterations: IterationRecord[];
  totalTokens: number;
}

interface IterationRecord {
  reasoning: string;
  toolCalls: ToolCall[];
  results: CompressedResult[];      // Summarized, not raw
  observation: string;
  tokens: number;
}

interface CompressedResult {
  toolName: string;
  summary: string;                  // AI-generated summary
  keyPoints: string[];              // Bullet points
  tokens: number;
  fullDataRef?: string;             // ID to retrieve full data if needed
}
```

### Context Window Layout

```
┌─────────────────────────────────────────────────────┐
│              CONTEXT WINDOW (~30K tokens)           │
├─────────────────────────────────────────────────────┤
│ System Prompt                         [~500 tokens] │
│ ─────────────────────────────────────               │
│ Conversation History (sliding window) [~5K tokens]  │
│ ─────────────────────────────────────               │
│ Current User Message                  [~500 tokens] │
│ ─────────────────────────────────────               │
│ Agent Scratchpad:                     [~20K tokens] │
│   ┌─────────────────────────────────┐               │
│   │ Iteration 1 (compressed): 200t  │               │
│   │ Iteration 2 (compressed): 300t  │               │
│   │ Iteration 3 (full): 2000t       │               │
│   │ Iteration 4 (full): 3000t       │               │
│   │ Iteration 5 (full): 5000t       │ ← Most recent │
│   └─────────────────────────────────┘   kept full   │
│ ─────────────────────────────────────               │
│ Response Buffer                       [~4K tokens]  │
└─────────────────────────────────────────────────────┘
```

### Key Components

#### 1. Conversation History Sliding Window

```typescript
function getRelevantHistory(
  messages: AIMessage[],
  budgetTokens: number
): AIMessage[] {
  const result: AIMessage[] = [];
  let usedTokens = 0;

  // Work backwards from most recent
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(messages[i].content);
    if (usedTokens + msgTokens > budgetTokens) break;
    result.unshift(messages[i]);
    usedTokens += msgTokens;
  }

  return result;
}
```

#### 2. Automatic Result Compressor

Tool results are automatically compressed when they exceed budget:

```typescript
class ResultCompressor {
  private maxTokensPerResult: number = 1000;

  async compress(result: ToolResult): Promise<CompressedResult> {
    const resultTokens = estimateTokens(JSON.stringify(result.data));

    // Small results kept as-is
    if (resultTokens < this.maxTokensPerResult) {
      return {
        toolName: result.toolName,
        summary: JSON.stringify(result.data),
        keyPoints: [],
        tokens: resultTokens
      };
    }

    // Large results get AI-summarized
    const summary = await this.summarizeWithAI(result);

    // Store full data for potential recall
    const fullDataRef = await this.storeFullResult(result);

    return {
      toolName: result.toolName,
      summary: summary.text,
      keyPoints: summary.keyPoints,
      tokens: summary.tokens,
      fullDataRef
    };
  }

  private async summarizeWithAI(result: ToolResult): Promise<{
    text: string;
    keyPoints: string[];
    tokens: number;
  }> {
    const prompt = `Summarize this ${result.toolName} result concisely.
    Extract key points relevant to the user's query.
    Keep under 500 tokens.

    Data: ${JSON.stringify(result.data)}`;

    const summary = await generateWithLiteModel(prompt);

    return {
      text: summary.content,
      keyPoints: this.extractKeyPoints(summary.content),
      tokens: estimateTokens(summary.content)
    };
  }

  private async storeFullResult(result: ToolResult): Promise<string> {
    // Store in memory/cache for this request only
    const id = `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    temporaryStorage.set(id, result.data, { ttl: 300000 }); // 5 min TTL
    return id;
  }
}
```

#### 3. Scratchpad Manager

Manages the agent's working memory across iterations:

```typescript
class AgentScratchpad {
  private iterations: IterationRecord[] = [];
  private maxTokens: number;

  constructor(budget: number) {
    this.maxTokens = budget;
  }

  addIteration(record: IterationRecord): void {
    this.iterations.push(record);

    // If over budget, compress older iterations
    while (this.getTotalTokens() > this.maxTokens && this.iterations.length > 1) {
      this.compressOldestIteration();
    }
  }

  private compressOldestIteration(): void {
    const oldest = this.iterations[0];

    // Summarize into a single line
    const compressed: IterationRecord = {
      reasoning: `[Iter 1: ${oldest.toolCalls.map(t => t.tool).join(', ')}]`,
      toolCalls: [],
      results: [{
        toolName: 'summary',
        summary: oldest.observation,
        keyPoints: [],
        tokens: estimateTokens(oldest.observation)
      }],
      observation: '',
      tokens: estimateTokens(oldest.observation) + 20
    };

    this.iterations[0] = compressed;
  }

  getTotalTokens(): number {
    return this.iterations.reduce((sum, iter) => sum + iter.tokens, 0);
  }

  toPrompt(): string {
    return this.iterations.map((iter, i) => `
## Iteration ${i + 1}

**Thinking**: ${iter.reasoning}

**Actions**: ${iter.toolCalls.map(t =>
  `${t.tool}(${JSON.stringify(t.parameters)})`
).join(', ') || 'None'}

**Results**:
${iter.results.map(r => {
  const refNote = r.fullDataRef ? ` [id: ${r.fullDataRef}]` : '';
  return `- ${r.toolName}: ${r.summary}${refNote}`;
}).join('\n')}

**Observation**: ${iter.observation}
`).join('\n---\n');
  }
}
```

#### 4. Dynamic Budget Allocation

Adjust budgets based on task complexity:

```typescript
function allocateContextBudget(
  taskComplexity: 'simple' | 'moderate' | 'complex'
): ContextBudget {
  const budgets = {
    simple: {
      total: 20000,
      systemPrompt: 500,
      conversationHistory: 3000,
      currentMessage: 500,
      agentScratchpad: 12000,
      responseBuffer: 4000
    },
    moderate: {
      total: 30000,
      systemPrompt: 500,
      conversationHistory: 5000,
      currentMessage: 500,
      agentScratchpad: 18000,
      responseBuffer: 6000
    },
    complex: {
      total: 40000,
      systemPrompt: 500,
      conversationHistory: 4000,
      currentMessage: 500,
      agentScratchpad: 28000,
      responseBuffer: 7000
    }
  };

  return budgets[taskComplexity];
}
```

#### 5. Token Estimation

Fast, bilingual-aware token estimation:

```typescript
function estimateTokens(text: string): number {
  // ~4 chars per token for English
  // ~2 chars per token for Chinese
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;

  return Math.ceil(chineseChars / 2 + otherChars / 4);
}
```

### Example: Context Flow with Recall

```
Iteration 1:
  Agent calls web_search("best laptops 2024")
  → Returns 5 results (large)
  → Auto-compressed: "Found 5 results about laptops" [id: res_123]

Iteration 2:
  Agent sees compressed summary
  Agent thinks: "Need more details about pricing"
  Agent calls: recall_details(resultId: "res_123", focus: "pricing")
  → Gets focused expansion with pricing info only

Iteration 3:
  Agent calls web_fetch for top 3 URLs
  → Auto-compressed with key points

Iteration 4:
  Agent has sufficient info → generates response
```

### Benefits

1. **Predictable costs** - Token budgets prevent runaway usage
2. **Quality preservation** - Recent iterations kept in full detail
3. **Graceful degradation** - Old iterations compressed, not dropped
4. **On-demand expansion** - Agent can recall full data when needed
5. **Bilingual support** - Chinese token estimation handled correctly

---

## Agent Reasoning System

The agent uses a structured prompt to make tool decisions.

### Agent System Prompt

**Location**: `src/lib/agent/core/prompts.ts`

The complete system prompt sent to the model:

~~~
You are an intelligent AI assistant that uses the ReAct (Reason-Act-Observe) pattern to help users.

## Your Approach
{STYLE_INSTRUCTIONS}

## Available Tools
{TOOL_DESCRIPTIONS}

## Response Format (CRITICAL - YOU MUST FOLLOW THIS EXACTLY)

**Your entire response MUST be valid JSON wrapped in ```json code blocks. No other format is acceptable.**

### When using tools:
```json
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
```

### When responding directly:
```json
{
  "thinking": "Your reasoning about why you can respond directly",
  "action": "respond",
  "response": "Your helpful response to the user",
  "confidence": 0.9
}
```

**IMPORTANT - JSON FORMAT RULES:**
- You MUST wrap your response in ```json code blocks
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
- Support bilingual conversations naturally
~~~

### Style-specific Instructions

```typescript
// Style-specific instructions injected into {STYLE_INSTRUCTIONS}

const STYLE_INSTRUCTIONS: Record<AgentStyle, string> = {
  tool_first: `You prefer to use tools to gather information before responding.
- Always check memory for user context
- Use web search for current information
- Only respond directly if you're 95%+ confident
- Err on the side of gathering more information`,

  direct: `You prefer to respond directly when you're confident.
- Respond directly if you're 60%+ confident
- Use tools only when you need specific information
- Don't over-use tools for simple questions
- Trust your training knowledge for common topics`,

  balanced: `You balance between using tools and responding directly.
- Use tools when they would improve your response
- Respond directly for straightforward questions
- Check memory to personalize responses
- Use web search for time-sensitive information`
};
```

### User Message Construction

Messages sent to the model (from `agent.ts` lines 171-189):

```typescript
const messages: AIMessage[] = [
  ...input.conversationHistory,  // Previous conversation turns
  {
    role: 'user',
    content: input.message,      // Current user question
  },
];

// If there are prior iterations (tool results), add scratchpad:
if (scratchpad) {
  messages.push({
    role: 'assistant',
    content: scratchpad,         // Previous reasoning + observations
  });
  messages.push({
    role: 'user',
    content: 'Continue with your reasoning and action.',
  });
}
```

### JSON Parsing and Fallback

The agent attempts to parse the model's response as JSON. If parsing fails:

1. **Retry up to 2 times** with a hint message asking for valid JSON
2. **Fallback**: If all retries fail, use raw text as response (logged as `[Agent] All retries failed, using raw text as fallback response`)

**Parsing attempts** (in order):
1. Extract JSON from ` ```json ``` ` code blocks
2. Find raw JSON object with `"action"` field
3. Parse XML-style `<thinking>`, `<action>`, `<response>` tags
4. Return `null` to trigger retry

### Observation Processing

```typescript
// src/lib/agent/observe.ts

function processObservation(toolResults: ToolResult[]): Observation {
  const summaries = toolResults.map(result => {
    if (!result.success) {
      return `Tool failed: ${result.error}`;
    }

    switch (result.toolName) {
      case 'web_search':
        return `Found ${result.data.results.length} search results for "${result.data.query}"`;

      case 'web_fetch':
        return `Extracted content from ${result.data.fetchedCount} pages. ` +
               `Key points available for analysis.`;

      case 'memory_retrieve':
        return `Retrieved ${result.data.matchedCount} relevant memories out of ` +
               `${result.data.totalMemories} total.`;

      case 'memory_save':
        return `Saved ${result.data.savedCount} new facts to user memory.`;

      case 'image_generate':
        return `Image generation prepared. Will use IMAGE model for response.`;

      default:
        return `Tool ${result.toolName} completed successfully.`;
    }
  });

  return {
    summary: summaries.join('\n'),
    results: toolResults,
    timestamp: Date.now()
  };
}
```

---

## Configuration System

### Admin Panel Configuration

```typescript
// src/lib/agent/config.ts

// Agent response styles
type AgentStyle = 'tool_first' | 'direct' | 'balanced';

interface AgentStyleConfig {
  name: string;
  description: string;
  toolBias: number;      // 0-1, higher = more likely to use tools
  minConfidenceToSkip: number;  // Confidence needed to skip tools
}

const AGENT_STYLES: Record<AgentStyle, AgentStyleConfig> = {
  tool_first: {
    name: 'Tool First',
    description: 'Prefers to gather information via tools before answering. More thorough but slower.',
    toolBias: 0.8,
    minConfidenceToSkip: 0.95  // Very high confidence needed to skip tools
  },
  direct: {
    name: 'Direct',
    description: 'Prefers to answer from knowledge directly. Faster but may miss current info.',
    toolBias: 0.2,
    minConfidenceToSkip: 0.6   // Lower bar to skip tools
  },
  balanced: {
    name: 'Balanced',
    description: 'Balances between tool use and direct answers based on query type.',
    toolBias: 0.5,
    minConfidenceToSkip: 0.8   // Moderate confidence threshold
  }
};

interface AgentSettings {
  maxIterations: number;           // Default: 5
  defaultModel: string;            // Default: MAIN tier
  agentStyle: AgentStyle;          // Default: 'balanced'
  enabledTools: string[];          // Which tools are available
  webSearchEnabled: boolean;       // Global toggle
  memoryEnabled: boolean;          // Global toggle
  imageGenerationEnabled: boolean; // Global toggle
  reasoningVisible: boolean;       // Show thinking to user
  costBudgetPerRequest: number;    // Max cost per request in cents
}

// Stored in Firestore: settings/agent
const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  maxIterations: 5,
  defaultModel: 'gemini-2.5-flash-experimental-0827',
  agentStyle: 'balanced',          // Default to balanced approach
  enabledTools: [
    'web_search',
    'web_fetch',
    'memory_retrieve',
    'memory_save',
    'image_generate',
    'recall_details',
    'get_current_time'
  ],
  webSearchEnabled: true,
  memoryEnabled: true,
  imageGenerationEnabled: true,
  reasoningVisible: false,
  costBudgetPerRequest: 10  // 10 cents max
};

// API to get/set settings
async function getAgentSettings(): Promise<AgentSettings> {
  const doc = await db.collection('settings').doc('agent').get();
  return doc.exists ? doc.data() as AgentSettings : DEFAULT_AGENT_SETTINGS;
}

async function updateAgentSettings(updates: Partial<AgentSettings>): Promise<void> {
  await db.collection('settings').doc('agent').set(updates, { merge: true });
}
```

### Admin UI Component

```typescript
// src/app/admin/agent-settings/page.tsx

export default function AgentSettingsPage() {
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_AGENT_SETTINGS);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Agent Configuration</h1>

      {/* Agent Style Selection */}
      <div className="space-y-2">
        <label className="font-medium">Agent Style</label>
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(AGENT_STYLES).map(([key, style]) => (
            <div
              key={key}
              className={`p-4 border rounded-lg cursor-pointer ${
                settings.agentStyle === key ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
              }`}
              onClick={() => setSettings({ ...settings, agentStyle: key as AgentStyle })}
            >
              <h3 className="font-medium">{style.name}</h3>
              <p className="text-sm text-gray-500">{style.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Max Iterations Slider */}
      <div className="space-y-2">
        <label className="font-medium">Max Iterations per Request</label>
        <input
          type="range"
          min="1"
          max="10"
          value={settings.maxIterations}
          onChange={(e) => setSettings({
            ...settings,
            maxIterations: parseInt(e.target.value)
          })}
        />
        <span className="ml-2">{settings.maxIterations}</span>
        <p className="text-sm text-gray-500">
          Higher = more thorough but slower & costlier
        </p>
      </div>

      {/* Tool Toggles */}
      <div className="space-y-2">
        <label className="font-medium">Enabled Tools</label>
        {ALL_TOOLS.map(tool => (
          <div key={tool.name} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.enabledTools.includes(tool.name)}
              onChange={(e) => toggleTool(tool.name, e.target.checked)}
            />
            <span>{tool.name}</span>
            <span className="text-sm text-gray-500">- {tool.description.slice(0, 50)}...</span>
          </div>
        ))}
      </div>

      {/* Cost Budget */}
      <div className="space-y-2">
        <label className="font-medium">Cost Budget per Request (cents)</label>
        <input
          type="number"
          min="1"
          max="100"
          value={settings.costBudgetPerRequest}
          onChange={(e) => setSettings({
            ...settings,
            costBudgetPerRequest: parseInt(e.target.value)
          })}
        />
      </div>

      <button onClick={saveSettings} className="btn-primary">
        Save Settings
      </button>
    </div>
  );
}
```

---

## Progress Tracking Integration

The agent emits progress events for real-time UI updates.

```typescript
// src/lib/agent/progress.ts

enum AgentProgressStep {
  // Existing steps
  ANALYZING = 'analyzing',
  SEARCHING_WEB = 'searching_web',
  FETCHING_CONTENT = 'fetching_content',
  RETRIEVING_MEMORY = 'retrieving_memory',
  GENERATING_RESPONSE = 'generating_response',

  // New agentic steps
  REASONING = 'reasoning',
  EXECUTING_TOOLS = 'executing_tools',
  OBSERVING_RESULTS = 'observing_results',
  SAVING_MEMORY = 'saving_memory'
}

// Emit during agent loop
class Agent {
  private async reason(message: string, history: AIMessage[]) {
    this.progressEmitter.emit({
      step: AgentProgressStep.REASONING,
      status: 'started',
      message: `Iteration ${this.state.iteration}: Analyzing what information is needed...`,
      details: {
        iteration: this.state.iteration,
        maxIterations: this.config.maxIterations
      }
    });

    // ... reasoning logic ...

    this.progressEmitter.emit({
      step: AgentProgressStep.REASONING,
      status: 'completed',
      message: reasoning.action === 'respond'
        ? 'Ready to respond'
        : `Planning to use: ${reasoning.toolCalls.map(t => t.tool).join(', ')}`
    });

    return reasoning;
  }

  private async act(toolCalls: ToolCall[]) {
    this.progressEmitter.emit({
      step: AgentProgressStep.EXECUTING_TOOLS,
      status: 'started',
      message: `Executing ${toolCalls.length} tool(s)...`,
      details: {
        tools: toolCalls.map(t => t.tool)
      }
    });

    // Execute tools in parallel where possible
    const results = await Promise.all(
      toolCalls.map(async (call) => {
        const tool = this.getTool(call.tool);
        return tool.execute(call.parameters);
      })
    );

    this.progressEmitter.emit({
      step: AgentProgressStep.EXECUTING_TOOLS,
      status: 'completed',
      message: `Tools completed: ${results.filter(r => r.success).length}/${results.length} successful`
    });

    return results;
  }
}
```

---

## Chat Route Integration

How the agent integrates with the existing chat API.

```typescript
// src/app/api/chat/route.ts

import { Agent, AgentConfig } from '@/lib/agent/core';
import { getAgentSettings } from '@/lib/agent/config';
import { ALL_TOOLS } from '@/lib/agent/tools';

export async function POST(request: Request) {
  // ... authentication & validation ...

  // Get agent settings
  const agentSettings = await getAgentSettings();

  // Filter enabled tools
  const enabledTools = ALL_TOOLS.filter(
    tool => agentSettings.enabledTools.includes(tool.name)
  );

  // Create agent
  const agent = new Agent({
    maxIterations: agentSettings.maxIterations,
    model: agentSettings.defaultModel,
    temperature: 0.7,
    tools: enabledTools,
    userId,
    conversationId
  });

  // Create streaming response
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Run agent and stream events
  (async () => {
    try {
      for await (const event of agent.run(message, conversationHistory, files)) {
        switch (event.type) {
          case 'reasoning':
            if (agentSettings.reasoningVisible) {
              await writer.write(
                encoder.encode(`[REASONING]${JSON.stringify(event.content)}\n`)
              );
            }
            break;

          case 'tool_results':
            await writer.write(
              encoder.encode(`[PROGRESS]${JSON.stringify({
                step: 'tool_results',
                data: event.results
              })}\n`)
            );
            break;

          case 'response':
            await writer.write(
              encoder.encode(`[CONTENT]${JSON.stringify(event.content)}\n`)
            );
            break;
        }
      }
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
```

---

## Cost Management

Track and limit costs per request.

```typescript
// src/lib/agent/cost.ts

interface CostTracker {
  toolCosts: Record<string, number>;
  totalTokens: number;
  totalCost: number;
}

const COST_PER_TOKEN = {
  'gemini-2.5-flash': 0.000001,      // $0.001 per 1K tokens
  'gemini-2.5-flash-lite': 0.0000002, // $0.0002 per 1K tokens
};

class Agent {
  private costTracker: CostTracker = {
    toolCosts: {},
    totalTokens: 0,
    totalCost: 0
  };

  private trackCost(toolName: string, result: ToolResult) {
    const cost = result.metadata?.cost || 0;
    const tokens = result.metadata?.tokensUsed || 0;

    this.costTracker.toolCosts[toolName] =
      (this.costTracker.toolCosts[toolName] || 0) + cost;
    this.costTracker.totalTokens += tokens;
    this.costTracker.totalCost += cost;

    // Check budget
    if (this.costTracker.totalCost > this.config.costBudget) {
      throw new CostBudgetExceededError(
        `Cost budget exceeded: $${this.costTracker.totalCost.toFixed(4)} > $${this.config.costBudget}`
      );
    }
  }

  getCostSummary(): CostSummary {
    return {
      totalCost: this.costTracker.totalCost,
      totalTokens: this.costTracker.totalTokens,
      breakdown: this.costTracker.toolCosts,
      iterations: this.state.iteration
    };
  }
}
```

---

## Error Handling

Graceful degradation at each level.

```typescript
// src/lib/agent/errors.ts

class AgentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = true
  ) {
    super(message);
  }
}

// In agent loop
class Agent {
  async run(...) {
    try {
      // Main agent loop
    } catch (error) {
      if (error instanceof CostBudgetExceededError) {
        // Respond with what we have
        yield {
          type: 'response',
          content: await this.generatePartialResponse(
            'I gathered some information but reached my cost limit. ' +
            'Here\'s what I found:'
          )
        };
      } else if (error instanceof ToolExecutionError) {
        // Skip failed tool and continue
        this.state.observations.push({
          summary: `Tool ${error.toolName} failed: ${error.message}`,
          error: true
        });
        // Continue with next iteration
      } else {
        // Unrecoverable error
        yield {
          type: 'error',
          content: 'I encountered an unexpected error. Please try again.'
        };
        throw error;
      }
    }
  }

  private async executeToolWithRetry(tool: Tool, params: any): Promise<ToolResult> {
    const MAX_RETRIES = 2;

    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        return await tool.execute(params);
      } catch (error) {
        if (i === MAX_RETRIES - 1) {
          return {
            success: false,
            error: `Tool failed after ${MAX_RETRIES} attempts: ${error.message}`
          };
        }
        await sleep(1000 * (i + 1)); // Exponential backoff
      }
    }
  }
}
```

---

## Migration Strategy

### Phase 1: Tool Extraction (Week 1)

1. Extract existing functionality into tool classes:
   - `WebSearchTool` from `googleSearchService`
   - `WebFetchTool` from `contentFetcher` + `contentExtractor`
   - `MemoryRetrieveTool` from `getUserMemory` + filtering
   - `MemorySaveTool` from `addMemoryFacts`

2. Keep existing pipeline working in parallel

### Phase 2: Agent Core (Week 2)

1. Implement `Agent` class with ReAct loop
2. Implement reasoning system with structured prompts
3. Add progress tracking integration
4. Create feature flag: `NEXT_PUBLIC_USE_AGENTIC_MODE`

### Phase 3: Integration (Week 3)

1. Update chat route to use agent when flag enabled
2. Add admin panel configuration page
3. Implement cost tracking and budgeting
4. Add error handling and fallbacks

### Phase 4: Testing & Refinement (Week 4)

1. Test with various conversation patterns
2. Tune reasoning prompts for accuracy
3. Optimize tool execution order
4. Add monitoring and analytics
5. Performance testing

### Phase 5: Deprecation (Week 5+)

1. Enable agentic mode by default
2. Monitor for issues
3. Deprecate old pipeline code
4. Remove feature flag

---

## File Structure

```
src/lib/agent/
  core.ts              # Agent class with ReAct loop
  config.ts            # Configuration management
  prompts.ts           # System prompts for reasoning
  observe.ts           # Observation processing
  cost.ts              # Cost tracking
  errors.ts            # Error types
  context.ts           # Context management (budgets, scratchpad)
  compressor.ts        # Result compression logic

  tools/
    base.ts            # Tool interface
    index.ts           # Tool registry
    web-search.ts      # WebSearchTool
    web-fetch.ts       # WebFetchTool
    memory-retrieve.ts # MemoryRetrieveTool
    memory-save.ts     # MemorySaveTool
    image-generate.ts  # ImageGenerateTool
    recall.ts          # RecallDetailsTool
    utilities.ts       # GetCurrentTimeTool, etc.

src/types/
  agent.ts             # Agent-related types

src/app/admin/
  agent-settings/
    page.tsx           # Admin configuration UI
```

---

## Example Interaction Flow

### User: "What's the best laptop for programming under $1500?"

**Iteration 1:**
```json
{
  "thinking": "User wants laptop recommendations with specific criteria (programming, budget).
    This requires current market information and possibly user preferences from memory.",
  "action": "tool",
  "toolCalls": [
    {
      "tool": "memory_retrieve",
      "parameters": {
        "searchTerms": ["programming", "laptop", "computer", "developer"],
        "categories": ["preference", "technical"]
      },
      "reasoning": "Check if user has stated preferences for OS, brands, or specific needs"
    },
    {
      "tool": "web_search",
      "parameters": {
        "query": "best programming laptops under $1500 2024",
        "targetInfo": ["performance", "RAM", "storage", "display", "price"]
      },
      "reasoning": "Need current market data for laptop recommendations"
    }
  ]
}
```

**Tool Results:**
- memory_retrieve: Found 2 facts - "User prefers macOS", "User does web development"
- web_search: Found 5 results about programming laptops

**Iteration 2:**
```json
{
  "thinking": "Got search results and user preferences. Need detailed content from top results
    to make specific recommendations. User prefers macOS, so should highlight Mac options.",
  "action": "tool",
  "toolCalls": [
    {
      "tool": "web_fetch",
      "parameters": {
        "urls": ["url1", "url2", "url3"],
        "query": "best programming laptops under $1500"
      },
      "reasoning": "Get detailed specs and reviews from top search results"
    }
  ]
}
```

**Iteration 3:**
```json
{
  "thinking": "Have detailed content with specs and reviews. Combined with user's macOS preference
    and web development focus, I can now provide personalized recommendations.",
  "action": "respond",
  "response": "Based on your preference for macOS and web development work, here are my top
    recommendations under $1500:\n\n1. **MacBook Air M3** ($1,099) - Best overall...\n\n
    **Sources:**\n1. [TechRadar Review](url1)..."
}
```

---

## Performance Expectations

| Metric | Current Pipeline | Agentic (1 iter) | Agentic (3 iter) | Agentic (5 iter) |
|--------|-----------------|------------------|------------------|------------------|
| Latency | 4-8s | 3-6s | 6-12s | 10-20s |
| Cost | ~$0.0001 | ~$0.0001 | ~$0.0003 | ~$0.0005 |
| Accuracy | Fixed | Adaptive | More thorough | Most thorough |
| Flexibility | Low | High | Higher | Highest |

---

## Open Questions

1. **Parallel vs Sequential Tool Execution**: Should tools always run in parallel when independent, or give agent control?

2. **Reasoning Visibility**: Should users see the agent's thinking process? (Currently configurable)

3. **Tool Chaining**: Should tools be able to call other tools, or only the agent can orchestrate?

4. **Streaming During Tools**: Should we stream partial responses while tools are executing?

5. **Tool Suggestions**: Should the agent suggest tools the user could enable if they're disabled?

---

## Success Metrics

1. **Response Quality**: User satisfaction scores
2. **Efficiency**: Average iterations per request
3. **Cost**: Average cost per request
4. **Accuracy**: Correct tool selection rate
5. **Latency**: Time to first token, total response time
6. **Error Rate**: Tool failures, agent errors

---

## Tool Improvement Roadmap

Future enhancements planned for each tool. Check items as they are implemented.

### web_search
- [ ] Add more sourceCategories (news, health, legal, sports)
- [ ] Implement search result caching (reduce API calls for repeated queries)
- [ ] Add date range filtering (recent, past week, past month)
- [ ] Support for image/video search results
- [ ] Query reformulation on zero results

### web_fetch
- [ ] Handle JavaScript-rendered pages (headless browser fallback)
- [ ] Add retry logic with exponential backoff for 403/429 errors
- [ ] Implement content summarization tiers (brief/detailed/full)
- [ ] Support PDF and document extraction
- [ ] Cache fetched content with TTL

### memory_retrieve
- [ ] Add semantic similarity search (vector embeddings)
- [ ] Implement memory importance scoring based on usage patterns
- [ ] Cross-conversation memory linking
- [ ] Memory relevance decay over time
- [ ] Fuzzy keyword matching

### memory_save
- [ ] Automatic fact merging for duplicates
- [ ] Conflict detection with existing facts
- [ ] Source attribution improvements
- [ ] Batch save optimization
- [ ] Memory validation rules (prevent saving nonsensical facts)

### get_current_time
- [ ] Add calendar event context (if calendar integration added)
- [ ] Support for relative time calculations ("3 days from now")
- [ ] Multiple timezone comparison
- [ ] Holiday/business day awareness

### Agent Core
- [ ] Parallel tool execution for independent calls
- [ ] Tool result streaming (show progress as tools complete)
- [ ] Adaptive iteration limits based on query complexity
- [ ] Cost prediction before execution
- [ ] User preference learning for tool selection

---

**Document Version**: 2.0
**Created**: 2024-11-17
**Updated**: 2025-11-17 (Implemented and enhanced with sourceCategory)
**Author**: Claude Code
