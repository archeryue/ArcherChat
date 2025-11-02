# Web Search Implementation Plan - Technical Design

**Date**: 2025-11-01
**Project**: ArcherChat Web Search Integration
**Provider**: Google Custom Search API

---

## 1. Implementation Approaches (Comparison)

### Option A: AI-Controlled (Automatic)

**How it works:**
- Use Gemini function calling
- AI decides when search is needed
- No user action required

**Pros:**
- ✅ Smart - only searches when actually helpful
- ✅ Best UX - transparent to user
- ✅ No user burden - works automatically

**Cons:**
- ❌ Unpredictable costs - AI might search more than expected
- ❌ Less user control
- ❌ Might search when not needed

**Cost Impact:**
- Unknown - depends on AI's decisions
- Could be 10-50% of messages trigger search

---

### Option B: User-Controlled (Manual Toggle)

**How it works:**
- User enables "Web Search" toggle
- Always searches when enabled
- User controls when to use it

**Pros:**
- ✅ Predictable costs - user decides
- ✅ Full user control
- ✅ Easy to understand

**Cons:**
- ❌ User burden - must remember to toggle
- ❌ Might search when not needed (if always on)
- ❌ Might miss opportunities (if user forgets)

**Cost Impact:**
- Predictable - only when user enables
- Likely 5-20% of messages if users remember

---

### Option C: Hybrid (Smart + User Control) ⭐ RECOMMENDED

**How it works:**
- User has global toggle "Enable Web Search"
- When enabled, AI decides if search is actually needed
- Best of both worlds

**Pros:**
- ✅ User controls when feature is available
- ✅ AI optimizes when to actually search
- ✅ Predictable costs (max = when enabled)
- ✅ Smart behavior when enabled
- ✅ Can default to OFF for cost control

**Cons:**
- ⚠️ Slightly more complex implementation
- ⚠️ Need to explain to users how it works

**Cost Impact:**
- Moderate - user enables, AI decides
- Estimate: 10-30% of messages when enabled
- Default OFF keeps costs low

---

### Option D: Keyword-Based

**How it works:**
- Search triggered by specific phrases
- "search for", "what's the latest", "current", etc.
- Simple pattern matching

**Pros:**
- ✅ Very predictable
- ✅ Simple to implement
- ✅ No AI function calling complexity

**Cons:**
- ❌ Users must know keywords
- ❌ Less flexible
- ❌ Might miss legitimate needs
- ❌ Can't handle nuanced cases

**Cost Impact:**
- Very predictable - only on keywords
- Likely 5-15% of messages

---

## 2. RECOMMENDED APPROACH: Hybrid (Option C)

### Why Hybrid is Best for ArcherChat

1. **Cost Control**: Default OFF, users opt-in when needed
2. **Smart Behavior**: AI only searches when helpful (even when enabled)
3. **User Control**: Users decide when feature is available
4. **Good UX**: Transparent, users understand what's happening
5. **Scalable**: Can adjust behavior based on usage patterns

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        User Input                           │
│  "What's happening at CES 2025?" [🔍 Web Search: ON]      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Check: Is Web Search Enabled?                  │
│  - Check user's conversation settings                       │
│  - If OFF: Skip search, use normal Gemini                  │
│  - If ON: Continue to AI decision                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼ (if enabled)
┌─────────────────────────────────────────────────────────────┐
│           Gemini Function Calling (AI Decides)              │
│  - Define search_web function in tools                      │
│  - Gemini analyzes: "Does this query need web search?"     │
│  - Examples:                                               │
│    ✅ "CES 2025" - YES (recent event)                     │
│    ✅ "Bitcoin price" - YES (real-time data)              │
│    ❌ "Explain React" - NO (timeless knowledge)           │
│    ❌ "What is 2+2" - NO (doesn't need web)               │
└────────────────────────┬────────────────────────────────────┘
                         │
                    ┌────┴─────┐
                    │          │
           ┌────────▼───┐   ┌──▼──────────┐
           │  No Search │   │   Search    │
           │   Needed   │   │   Needed    │
           └────┬───────┘   └──┬──────────┘
                │              │
                │              ▼
                │    ┌──────────────────────┐
                │    │ Execute Google       │
                │    │ Custom Search API    │
                │    │ - Get snippets       │
                │    │ - Get URLs           │
                │    └──────┬───────────────┘
                │           │
                │           ▼
                │    ┌──────────────────────┐
                │    │ Return results to    │
                │    │ Gemini as function   │
                │    │ response             │
                │    └──────┬───────────────┘
                │           │
                └───────────┴───────────────┐
                                            ▼
                            ┌───────────────────────────┐
                            │ Gemini Synthesizes Answer │
                            │ - Incorporates sources    │
                            │ - Cites URLs              │
                            │ - Streams response        │
                            └───────────┬───────────────┘
                                        │
                                        ▼
                            ┌───────────────────────────┐
                            │   Display to User         │
                            │   - Answer with citations │
                            │   - "Sources:" section    │
                            │   - Clickable links       │
                            └───────────────────────────┘
```

---

## 3. When to Trigger Web Search

### ✅ Good Candidates for Web Search

**Recent Events & News:**
- "What happened at CES 2025?"
- "Latest news about AI"
- "Recent developments in quantum computing"
- "What did Elon Musk announce today?"

**Real-Time Data:**
- "Current Bitcoin price"
- "Weather in San Francisco"
- "Stock price of Tesla"
- "Exchange rate USD to EUR"

**Current Information:**
- "Who won the 2024 election?"
- "Latest iPhone features"
- "Current COVID-19 guidelines"
- "When is the next SpaceX launch?"

**Beyond Knowledge Cutoff:**
- "What's new in React 19?" (if model trained before React 19)
- "Latest Python 3.13 features"
- "Current world population"
- "Who is the current CEO of X company?"

**Product/Service Information:**
- "Best laptops in 2025"
- "Top rated restaurants in Tokyo"
- "Reviews of the new MacBook"
- "Comparison of cloud providers"

**Verification/Fact-Checking:**
- "Is this news article true: [URL]"
- "What are people saying about [topic]"
- "Are there any recalls for [product]"

---

### ❌ Bad Candidates (Don't Need Web Search)

**Timeless Knowledge:**
- "Explain photosynthesis"
- "What is the Pythagorean theorem?"
- "How does HTTP work?"
- "Explain object-oriented programming"

**Programming Help:**
- "How to create a React component?"
- "Debug this Python code"
- "Explain async/await in JavaScript"
- "Best practices for database indexing"

**Math/Logic:**
- "What is 2+2?"
- "Calculate compound interest"
- "Solve this equation"
- "Convert Celsius to Fahrenheit"

**Code Generation:**
- "Write a function to sort an array"
- "Create a REST API endpoint"
- "Generate a Dockerfile"
- "Write SQL query to join tables"

**General Explanations:**
- "How does a car engine work?"
- "Explain the water cycle"
- "What is democracy?"
- "Describe the solar system"

**Personal Conversation:**
- "How are you?"
- "Tell me a joke"
- "What's your opinion on X?"
- "Can you help me?"

**Already Has Context:**
- Questions about uploaded files
- Questions about previous conversation
- Questions about code in the chat

---

## 4. Implementation Details

### 4.1. Function Declaration

```typescript
// src/lib/search/search-function.ts

export const searchWebFunction = {
  name: 'search_web',
  description: `Search the web for current, real-time information.

Use this function when:
- User asks about recent events or news (after January 2025)
- User needs real-time data (prices, weather, stocks)
- User asks "what's the latest" or "current" information
- The answer requires up-to-date information beyond your training

DO NOT use this function when:
- User asks about timeless knowledge (history, science, math)
- User wants code help or programming explanations
- User asks personal questions or opinions
- The answer can be provided from existing knowledge

Examples of when to use:
✅ "What happened at CES 2025?"
✅ "Current Bitcoin price"
✅ "Latest iPhone features"
✅ "Recent AI developments"

Examples of when NOT to use:
❌ "Explain React components"
❌ "How does photosynthesis work?"
❌ "Write a sorting function"
❌ "What is 2+2?"`,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to execute. Should be concise and specific.'
      },
      num_results: {
        type: 'number',
        description: 'Number of search results to return (1-10)',
        default: 5
      }
    },
    required: ['query']
  }
};
```

### 4.2. Search Function Implementation

```typescript
// src/lib/search/google-search.ts

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  searchTime: number;
  totalResults: string;
}

export async function searchWeb(
  query: string,
  numResults: number = 5
): Promise<SearchResponse> {
  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    throw new Error('Google Custom Search API credentials not configured');
  }

  const url = `https://www.googleapis.com/customsearch/v1?` +
    `key=${apiKey}` +
    `&cx=${searchEngineId}` +
    `&q=${encodeURIComponent(query)}` +
    `&num=${Math.min(numResults, 10)}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Google Search API error: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      return {
        query,
        results: [],
        searchTime: data.searchInformation?.searchTime || 0,
        totalResults: '0'
      };
    }

    const results: SearchResult[] = data.items.map((item: any, index: number) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet || '',
      position: index + 1
    }));

    return {
      query,
      results,
      searchTime: data.searchInformation?.searchTime || 0,
      totalResults: data.searchInformation?.totalResults || '0'
    };
  } catch (error) {
    console.error('Search error:', error);
    throw error;
  }
}

// Format search results for Gemini
export function formatSearchResultsForLLM(response: SearchResponse): string {
  if (response.results.length === 0) {
    return `No search results found for "${response.query}".`;
  }

  const formattedResults = response.results.map((result) =>
    `${result.position}. ${result.title}\n   ${result.snippet}\n   Source: ${result.url}`
  ).join('\n\n');

  return `Search results for "${response.query}":\n\n${formattedResults}\n\nFound ${response.totalResults} total results.`;
}
```

### 4.3. Integration with Gemini Provider

```typescript
// src/lib/providers/gemini.provider.ts

import { searchWebFunction } from '@/lib/search/search-function';
import { searchWeb, formatSearchResultsForLLM } from '@/lib/search/google-search';

export class GeminiProvider implements IAIProvider {
  async* generateChatResponse(
    messages: Message[],
    options: ChatOptions & { webSearchEnabled?: boolean }
  ): AsyncGenerator<string> {
    const model = this.genAI.getGenerativeModel({
      model: getModelForTask('chat'),
      // Only add search tool if web search is enabled
      ...(options.webSearchEnabled && {
        tools: [{
          functionDeclarations: [searchWebFunction]
        }]
      })
    });

    const chat = model.startChat({
      history: convertMessagesToHistory(messages),
    });

    const userMessage = messages[messages.length - 1].content;

    // Track if we're searching
    let isSearching = false;

    // Send initial message
    let result = await chat.sendMessageStream(userMessage);
    let response = await result.response;

    // Handle function calls (web search)
    while (response.candidates?.[0]?.content?.parts?.[0]?.functionCall) {
      const functionCall = response.candidates[0].content.parts[0].functionCall;

      if (functionCall.name === 'search_web') {
        isSearching = true;

        // Yield a searching indicator
        yield '[Searching the web...]\n\n';

        try {
          // Execute the search
          const searchResults = await searchWeb(
            functionCall.args.query,
            functionCall.args.num_results || 5
          );

          // Format results for Gemini
          const formattedResults = formatSearchResultsForLLM(searchResults);

          // Send function response back to model
          result = await chat.sendMessageStream([
            {
              functionResponse: {
                name: 'search_web',
                response: {
                  content: formattedResults
                }
              }
            }
          ]);

          response = await result.response;
        } catch (error) {
          console.error('Search error:', error);

          // Send error back to model so it can handle gracefully
          result = await chat.sendMessageStream([
            {
              functionResponse: {
                name: 'search_web',
                response: {
                  error: 'Search failed. Please answer based on your existing knowledge.'
                }
              }
            }
          ]);

          response = await result.response;
        }
      }
    }

    // Stream the final response
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }

    // Extract and yield sources if we searched
    if (isSearching && response.candidates?.[0]?.content) {
      // Could extract citations here if needed
    }
  }
}
```

### 4.4. API Route Update

```typescript
// src/app/api/chat/route.ts

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ProviderFactory } from '@/lib/providers/provider-factory';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { message, conversationId, webSearchEnabled } = await req.json();

  // ... (load conversation, messages, memory, etc.)

  const provider = ProviderFactory.getProvider('gemini');

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of provider.generateChatResponse(
          messages,
          {
            systemPrompt,
            temperature: 0.7,
            webSearchEnabled // Pass the flag
          }
        )) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      } catch (error) {
        console.error('Chat error:', error);
        controller.error(error);
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked'
    }
  });
}
```

---

## 5. UI/UX Implementation

### 5.1. Web Search Toggle

```typescript
// src/components/chat/ChatTopBar.tsx

'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';

export function ChatTopBar({ conversationId }: { conversationId: string }) {
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  return (
    <div className="flex items-center justify-between px-6 py-3 border-b">
      <h1 className="text-lg font-semibold">ArcherChat</h1>

      {/* Web Search Toggle */}
      <div className="flex items-center gap-2">
        <label
          htmlFor="web-search-toggle"
          className="flex items-center gap-2 cursor-pointer text-sm"
        >
          <Search className={`w-4 h-4 ${webSearchEnabled ? 'text-blue-600' : 'text-slate-400'}`} />
          <span className={webSearchEnabled ? 'text-blue-600 font-medium' : 'text-slate-600'}>
            Web Search
          </span>
          <input
            id="web-search-toggle"
            type="checkbox"
            checked={webSearchEnabled}
            onChange={(e) => setWebSearchEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
        </label>
      </div>
    </div>
  );
}
```

### 5.2. Search Indicator

```typescript
// src/components/chat/ChatMessage.tsx

export function ChatMessage({ message }: { message: Message }) {
  const isSearching = message.content.includes('[Searching the web...]');

  return (
    <div className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
      {/* Avatar */}
      <div className="flex-shrink-0">
        {message.role === 'assistant' && (
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            {isSearching ? (
              <Search className="w-4 h-4 text-blue-600 animate-pulse" />
            ) : (
              <Bot className="w-4 h-4 text-blue-600" />
            )}
          </div>
        )}
      </div>

      {/* Message Content */}
      <div className="flex-1">
        {isSearching && (
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <Search className="w-3 h-3 animate-pulse" />
            <span>Searching the web...</span>
          </div>
        )}

        <ReactMarkdown>{message.content.replace('[Searching the web...]\n\n', '')}</ReactMarkdown>
      </div>
    </div>
  );
}
```

### 5.3. Source Citations Display

```typescript
// src/components/chat/SourceCitations.tsx

export function SourceCitations({ sources }: { sources: SearchResult[] }) {
  if (sources.length === 0) return null;

  return (
    <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
      <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
        <ExternalLink className="w-4 h-4" />
        Sources:
      </h4>
      <ul className="space-y-2">
        {sources.map((source, index) => (
          <li key={index} className="text-sm">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 hover:underline flex items-start gap-2"
            >
              <span className="text-slate-400">{index + 1}.</span>
              <span className="flex-1">{source.title}</span>
              <ExternalLink className="w-3 h-3 flex-shrink-0 mt-1" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## 6. Cost Control & Monitoring

### 6.1. Search Usage Tracking

```typescript
// src/lib/search/usage-tracker.ts

import { db } from '@/lib/firebase-admin';

export async function trackSearchUsage(
  userId: string,
  query: string,
  resultCount: number,
  cost: number
) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  await db.collection('search_usage').add({
    user_id: userId,
    query,
    result_count: resultCount,
    cost,
    month,
    timestamp: now
  });

  // Update monthly aggregate
  const monthlyRef = db.collection('search_usage_monthly').doc(`${userId}_${month}`);
  const monthlyDoc = await monthlyRef.get();

  if (monthlyDoc.exists) {
    await monthlyRef.update({
      total_searches: (monthlyDoc.data()?.total_searches || 0) + 1,
      total_cost: (monthlyDoc.data()?.total_cost || 0) + cost,
      updated_at: now
    });
  } else {
    await monthlyRef.set({
      user_id: userId,
      month,
      total_searches: 1,
      total_cost: cost,
      created_at: now,
      updated_at: now
    });
  }
}
```

### 6.2. Rate Limiting

```typescript
// src/lib/search/rate-limiter.ts

const searchLimits = new Map<string, number[]>();

export function checkSearchRateLimit(
  userId: string,
  maxPerHour: number = 20,
  maxPerDay: number = 100
): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  const userSearches = searchLimits.get(userId) || [];

  // Filter to recent searches
  const recentSearches = userSearches.filter(timestamp => timestamp > oneDayAgo);
  const lastHourSearches = recentSearches.filter(timestamp => timestamp > oneHourAgo);

  // Check hourly limit
  if (lastHourSearches.length >= maxPerHour) {
    return {
      allowed: false,
      reason: `Rate limit exceeded: ${maxPerHour} searches per hour`
    };
  }

  // Check daily limit
  if (recentSearches.length >= maxPerDay) {
    return {
      allowed: false,
      reason: `Daily limit exceeded: ${maxPerDay} searches per day`
    };
  }

  // Allow and record
  recentSearches.push(now);
  searchLimits.set(userId, recentSearches);

  return { allowed: true };
}
```

---

## 7. Configuration

### 7.1. Environment Variables

```env
# .env.local

# Google Custom Search API
GOOGLE_CUSTOM_SEARCH_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXX
GOOGLE_SEARCH_ENGINE_ID=012345678901234567890:xxxx

# Web Search Configuration
WEB_SEARCH_DEFAULT_ENABLED=false  # Default state
WEB_SEARCH_RATE_LIMIT_HOUR=20     # Max searches per hour per user
WEB_SEARCH_RATE_LIMIT_DAY=100     # Max searches per day per user
WEB_SEARCH_MAX_RESULTS=5          # Default number of results
```

### 7.2. Feature Flags

```typescript
// src/config/features.ts

export const FEATURES = {
  WEB_SEARCH: {
    enabled: process.env.NEXT_PUBLIC_WEB_SEARCH_ENABLED === 'true',
    defaultEnabled: process.env.WEB_SEARCH_DEFAULT_ENABLED === 'true',
    rateLimitHour: parseInt(process.env.WEB_SEARCH_RATE_LIMIT_HOUR || '20'),
    rateLimitDay: parseInt(process.env.WEB_SEARCH_RATE_LIMIT_DAY || '100'),
    maxResults: parseInt(process.env.WEB_SEARCH_MAX_RESULTS || '5')
  }
};
```

---

## 8. Testing Strategy

### Test Cases

1. **Basic Search**
   - Enable web search
   - Ask "What happened at CES 2025?"
   - Verify search is triggered
   - Verify results are displayed
   - Verify citations are shown

2. **No Search Needed**
   - Enable web search
   - Ask "What is React?"
   - Verify search is NOT triggered
   - Verify normal response

3. **Search Disabled**
   - Disable web search
   - Ask "What's the latest iPhone?"
   - Verify search is NOT triggered
   - Verify response based on existing knowledge

4. **Error Handling**
   - Simulate API error
   - Verify graceful fallback
   - Verify user sees meaningful message

5. **Rate Limiting**
   - Make 21 searches in an hour
   - Verify 21st is blocked
   - Verify user sees rate limit message

6. **Bilingual**
   - Test in English: "What's the latest news?"
   - Test in Chinese: "最新的新闻是什么？"
   - Verify both work correctly

---

## 9. Deployment Checklist

- [ ] Enable Google Custom Search API in GCP
- [ ] Create Programmable Search Engine
- [ ] Get API key and Search Engine ID
- [ ] Add environment variables to Cloud Run
- [ ] Implement search function
- [ ] Integrate with Gemini function calling
- [ ] Add UI toggle
- [ ] Add search indicator
- [ ] Add source citations
- [ ] Implement rate limiting
- [ ] Implement usage tracking
- [ ] Test all scenarios
- [ ] Deploy to production
- [ ] Monitor usage and costs
- [ ] Gather user feedback

---

## 10. Estimated Costs

### With Free Tier (3,000 searches/month)

**Scenario 1: Low Usage (500 searches/month)**
- Cost: $0 (within free tier)
- Total ArcherChat: $8-18/month (unchanged)

**Scenario 2: Moderate Usage (1,000 searches/month)**
- Cost: $0 (within free tier)
- Total ArcherChat: $8-18/month (unchanged)

**Scenario 3: High Usage (3,000 searches/month)**
- Cost: $0 (within free tier)
- Total ArcherChat: $8-18/month (unchanged)

**Scenario 4: Very High Usage (5,000 searches/month)**
- Free: 3,000
- Paid: 2,000 × $0.005 = $10
- Total ArcherChat: $18-28/month

**Conclusion**: Likely FREE for family use! 🎉

---

## Summary

**Recommended Implementation:**
- ✅ Hybrid approach (user toggle + AI decides)
- ✅ Default OFF (cost control)
- ✅ AI function calling for smart behavior
- ✅ Google Custom Search API (3K free/month)
- ✅ Rate limiting (20/hour, 100/day)
- ✅ Usage tracking for monitoring
- ✅ Source citations in UI

**Timeline:** 3-4 hours to implement
**Cost:** Likely $0 (within free tier)
**User Experience:** Smart, transparent, controlled

Ready to implement! 🚀
