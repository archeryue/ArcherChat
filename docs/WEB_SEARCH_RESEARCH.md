# Web Search Integration Research for ArcherChat

**Research Date**: 2025-11-01
**Objective**: Evaluate options for adding web search capability to ArcherChat

---

## Executive Summary

There are **two main approaches** to add web search to ArcherChat:

1. **Built-in Gemini Grounding** (Recommended) - Use Google's native grounding feature
2. **Custom Search API Integration** - Integrate third-party search APIs via function calling

**Recommendation**: Start with **Gemini Grounding with Google Search** ($35/1000 queries) for the easiest integration and best quality. Consider custom search APIs (like Serper at $0.30/1000 queries) only if cost becomes a major concern at scale.

---

## Option 1: Gemini Grounding with Google Search (RECOMMENDED)

### Overview

Google now offers **native grounding** that connects Gemini directly to real-time Google Search results. This is the most integrated and reliable approach.

### How It Works

```
User asks question → Gemini analyzes if search needed →
Gemini generates search queries → Google Search executed →
Results incorporated into response → Citations provided
```

### Key Features

✅ **Automatic**: Model decides when to search
✅ **Citations**: Provides source links for verification
✅ **Real-time**: Accesses current web information
✅ **Multilingual**: Works in all Gemini-supported languages
✅ **Reduced hallucinations**: Grounds responses in facts
✅ **No API management**: No need for separate search API keys

### Pricing

- **$35 per 1,000 grounded queries**
- One billable query even if Gemini executes multiple searches internally
- Available in paid tier of Gemini API

### Cost Comparison for ArcherChat

**Scenario 1: Light Usage (100 search queries/month)**
- Cost: 100 × $0.035 = **$3.50/month**
- Total ArcherChat cost: $8-18 + $3.50 = **$11.50-21.50/month**

**Scenario 2: Moderate Usage (500 search queries/month)**
- Cost: 500 × $0.035 = **$17.50/month**
- Total ArcherChat cost: $8-18 + $17.50 = **$25.50-35.50/month**

**Scenario 3: Heavy Usage (1000 search queries/month)**
- Cost: 1000 × $0.035 = **$35/month**
- Total ArcherChat cost: $8-18 + $35 = **$43-53/month**

### Implementation

**For Gemini 2.0+ models (recommended):**

```typescript
// src/lib/providers/gemini.provider.ts

import { Tool, GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function* generateChatResponseWithSearch(
  messages: Message[],
  options: ChatOptions
): AsyncGenerator<string> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    tools: [
      {
        googleSearch: {} // Enable Google Search grounding
      }
    ]
  });

  const chat = model.startChat({
    history: convertMessagesToHistory(messages),
  });

  const result = await chat.sendMessageStream(
    messages[messages.length - 1].content
  );

  for await (const chunk of result.stream) {
    const text = chunk.text();
    yield text;
  }

  // Access grounding metadata for citations
  const response = await result.response;
  if (response.candidates[0]?.groundingMetadata) {
    const metadata = response.candidates[0].groundingMetadata;
    // metadata.webSearchQueries - the search queries used
    // metadata.groundingChunks - the sources with URLs
    console.log('Sources:', metadata.groundingChunks);
  }
}
```

**Configuration options:**

```typescript
// Enable grounding with threshold
tools: [
  {
    googleSearch: {
      dynamicRetrievalConfig: {
        mode: 'MODE_DYNAMIC', // or 'MODE_UNSPECIFIED'
        dynamicThreshold: 0.3  // Lower = more likely to search
      }
    }
  }
]
```

### Pros

✅ Easiest to implement (just enable a tool)
✅ No separate API management
✅ High-quality results (Google Search)
✅ Automatic relevance detection
✅ Built-in citation support
✅ Works seamlessly with existing Gemini integration

### Cons

❌ More expensive ($35/1000 vs $0.30-5/1000 for alternatives)
❌ Less control over search queries
❌ Requires paid Gemini API tier
❌ Cannot customize search results format

### Use Cases

- Users ask about current events: "What happened at CES 2025?"
- Users need real-time data: "What's the current price of Bitcoin?"
- Users ask about recent releases: "Tell me about the latest Next.js version"
- Research questions: "What are the best practices for React Server Components?"

---

## Option 2: Custom Search API Integration

### Approach

Integrate third-party search APIs using **Gemini Function Calling**. The model decides when to call your search function, you execute the search, and return results to Gemini for synthesis.

### Available Search APIs

#### A. Google Custom Search JSON API

**Pricing:**
- First 100 queries/day: **FREE**
- Beyond 100: **$5 per 1,000 queries**
- Limit: 10,000 queries/day

**Cost for ArcherChat (assuming 500 searches/month, all paid):**
- 500 × $0.005 = **$2.50/month**

**Pros:**
- ✅ Official Google search results
- ✅ 100 free queries/day (3000/month)
- ✅ Reliable and well-documented
- ✅ JSON API easy to integrate

**Cons:**
- ❌ Requires Programmable Search Engine setup
- ❌ Limited to 10K queries/day
- ❌ More expensive than alternatives

**Setup Required:**
1. Create Programmable Search Engine at [programmablesearchengine.google.com](https://programmablesearchengine.google.com/)
2. Get API key from Google Cloud Console
3. Get Search Engine ID

**API Example:**
```bash
GET https://www.googleapis.com/customsearch/v1?key=YOUR_API_KEY&cx=YOUR_SEARCH_ENGINE_ID&q=search+query
```

---

#### B. Serper API (BEST VALUE)

**Pricing:**
- **$0.30 per 1,000 queries**
- Pay-as-you-go, no monthly minimum
- No daily limits

**Cost for ArcherChat (500 searches/month):**
- 500 × $0.0003 = **$0.15/month**

**Pros:**
- ✅ **10x cheaper** than Google Custom Search
- ✅ **100x cheaper** than Gemini grounding
- ✅ Real Google Search results
- ✅ Fast response times
- ✅ No setup complexity
- ✅ Flexible pricing

**Cons:**
- ❌ Third-party service (not Google official)
- ❌ Less established than Google

**API Example:**
```typescript
const response = await fetch('https://google.serper.dev/search', {
  method: 'POST',
  headers: {
    'X-API-KEY': process.env.SERPER_API_KEY!,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    q: 'search query',
    num: 10 // number of results
  })
});

const data = await response.json();
// data.organic - array of search results
// data.answerBox - featured snippet if available
```

---

#### C. Tavily AI Search API (AI-OPTIMIZED)

**Pricing:**
- 1,000 free searches/month
- Beyond free: **$0.008 per query** ($8 per 1,000 queries)
- Pay-as-you-go

**Cost for ArcherChat (500 searches/month):**
- First 500: **FREE** (within 1000 free tier)
- Or if over 1000: **$4/month** for 500 paid queries

**Pros:**
- ✅ **Designed specifically for LLMs/AI agents**
- ✅ Returns LLM-ready structured content
- ✅ 1,000 free searches/month
- ✅ Extraction and summarization built-in
- ✅ Great for RAG applications

**Cons:**
- ❌ More expensive than Serper
- ❌ Newer service (less proven)

**API Example:**
```typescript
const response = await fetch('https://api.tavily.com/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    api_key: process.env.TAVILY_API_KEY!,
    query: 'search query',
    search_depth: 'basic', // or 'advanced' (costs 2 credits)
    include_answer: true,
    max_results: 5
  })
});

const data = await response.json();
// data.answer - direct answer if available
// data.results - array of sources with content
```

---

#### D. Bing Web Search API

**Status:** ⚠️ **RETIRING AUGUST 11, 2025**

**Pricing (legacy):**
- $15-25 per 1,000 queries (expensive!)

**Recommendation:** **DO NOT USE** - service is being deprecated.

---

### Comparison Table

| API | Cost/1K Queries | Free Tier | Best For | Status |
|-----|----------------|-----------|----------|--------|
| **Gemini Grounding** | $35 | None | Easiest integration, best quality | ✅ Active |
| **Serper** | $0.30 | None | Best value, cost-conscious | ✅ Active |
| **Tavily** | $8 | 1000/month | AI-optimized content | ✅ Active |
| **Google Custom Search** | $5 | 100/day | Official Google results | ✅ Active |
| **Bing Search** | $15-25 | None | ❌ Not recommended | ⚠️ Retiring 8/2025 |

---

## Implementation Approach with Function Calling

### Step 1: Define Search Function

```typescript
// src/lib/search/search-tools.ts

export const searchFunctionDeclaration = {
  name: 'search_web',
  description: 'Search the web for current information, recent events, or real-time data. Use this when the user asks about current events, recent news, latest information, or anything beyond your knowledge cutoff.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to execute'
      },
      num_results: {
        type: 'number',
        description: 'Number of results to return (1-10)',
        default: 5
      }
    },
    required: ['query']
  }
};
```

### Step 2: Implement Search Function

```typescript
// src/lib/search/search.ts

import { searchFunctionDeclaration } from './search-tools';

export async function searchWeb(query: string, numResults: number = 5) {
  // Option A: Using Serper API (cheapest)
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.SERPER_API_KEY!,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      q: query,
      num: numResults
    })
  });

  const data = await response.json();

  // Format results for Gemini
  const results = data.organic?.map((result: any, index: number) => ({
    position: index + 1,
    title: result.title,
    link: result.link,
    snippet: result.snippet
  })) || [];

  return {
    query,
    results,
    answerBox: data.answerBox || null
  };
}

// Alternative: Using Tavily API (AI-optimized)
export async function searchWebTavily(query: string, maxResults: number = 5) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY!,
      query,
      search_depth: 'basic',
      include_answer: true,
      max_results: maxResults
    })
  });

  const data = await response.json();

  return {
    query,
    answer: data.answer,
    results: data.results.map((r: any, i: number) => ({
      position: i + 1,
      title: r.title,
      link: r.url,
      snippet: r.content,
      score: r.score
    }))
  };
}
```

### Step 3: Integrate with Gemini Provider

```typescript
// src/lib/providers/gemini.provider.ts

import { searchFunctionDeclaration } from '@/lib/search/search-tools';
import { searchWeb } from '@/lib/search/search';

export class GeminiProvider implements IAIProvider {
  async* generateChatResponse(
    messages: Message[],
    options: ChatOptions
  ): AsyncGenerator<string> {
    const model = this.genAI.getGenerativeModel({
      model: getModelForTask('chat'),
      tools: [
        {
          functionDeclarations: [searchFunctionDeclaration]
        }
      ]
    });

    const chat = model.startChat({
      history: convertMessagesToHistory(messages),
    });

    const userMessage = messages[messages.length - 1].content;
    let result = await chat.sendMessageStream(userMessage);

    // Handle function calls
    let response = await result.response;

    while (response.candidates?.[0]?.content?.parts?.[0]?.functionCall) {
      const functionCall = response.candidates[0].content.parts[0].functionCall;

      if (functionCall.name === 'search_web') {
        // Execute the search
        const searchResults = await searchWeb(
          functionCall.args.query,
          functionCall.args.num_results || 5
        );

        // Format results as text for Gemini
        const formattedResults = `Search results for "${searchResults.query}":\n\n` +
          searchResults.results.map((r, i) =>
            `${i + 1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.link}`
          ).join('\n\n');

        // Send function response back to model
        result = await chat.sendMessageStream([
          {
            functionResponse: {
              name: 'search_web',
              response: {
                results: formattedResults
              }
            }
          }
        ]);

        response = await result.response;
      }
    }

    // Stream the final response
    for await (const chunk of result.stream) {
      yield chunk.text();
    }
  }
}
```

### Step 4: Add Environment Variables

```env
# .env.local

# Choose ONE search provider:

# Option 1: Serper API (cheapest - $0.30/1K queries)
SERPER_API_KEY=your_serper_api_key

# Option 2: Tavily API (AI-optimized - $8/1K queries, 1K free/month)
TAVILY_API_KEY=your_tavily_api_key

# Option 3: Google Custom Search (official - $5/1K queries, 100 free/day)
GOOGLE_CUSTOM_SEARCH_API_KEY=your_api_key
GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id
```

### Step 5: Add Search Toggle in UI

```typescript
// src/components/chat/ChatInput.tsx

export function ChatInput() {
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <input
          type="checkbox"
          checked={webSearchEnabled}
          onChange={(e) => setWebSearchEnabled(e.target.checked)}
          id="web-search"
        />
        <label htmlFor="web-search" className="text-sm text-slate-600">
          Enable web search for real-time information
        </label>
      </div>
      {/* ... rest of chat input */}
    </div>
  );
}
```

---

## Cost Analysis Summary

### Monthly Cost Projections (500 search queries/month)

| Solution | Search Cost | Total ArcherChat Cost | Savings vs Gemini Grounding |
|----------|-------------|----------------------|----------------------------|
| **No search** | $0 | $8-18/month | - |
| **Serper API** | $0.15 | $8.15-18.15/month | 99% cheaper |
| **Tavily API** | FREE (under 1K) | $8-18/month | 100% cheaper |
| **Google Custom Search** | $2.50 | $10.50-20.50/month | 86% cheaper |
| **Gemini Grounding** | $17.50 | $25.50-35.50/month | Baseline |

### At Scale (2000 searches/month)

| Solution | Search Cost | Total ArcherChat Cost |
|----------|-------------|----------------------|
| **Serper API** | $0.60 | $8.60-18.60/month |
| **Tavily API** | $8 | $16-26/month |
| **Google Custom Search** | $10 | $18-28/month |
| **Gemini Grounding** | $70 | $78-88/month |

---

## Recommendations

### For ArcherChat (Family Use, 5-10 users)

**RECOMMENDED: Gemini Grounding with Google Search**

**Rationale:**
1. **Easiest implementation**: Just enable the tool, no complex function calling
2. **Best quality**: Google's native integration with Gemini
3. **Automatic**: Model decides when to search
4. **Cost acceptable**: At 100-500 searches/month ($3.50-17.50), still within budget
5. **Built-in citations**: Professional appearance with source links
6. **No maintenance**: No separate API to manage

**Alternative if cost becomes an issue:**

If search usage exceeds 500 queries/month, consider **Serper API**:
- 100x cheaper ($0.30 vs $35 per 1K queries)
- Still uses Google Search results
- Simple to implement with function calling
- Pay-as-you-go pricing

### Implementation Roadmap

**Phase 1: MVP (Week 1)**
- Implement Gemini Grounding with Google Search
- Add simple enable/disable toggle in UI
- Test with family users
- Monitor usage and costs

**Phase 2: Optimization (Week 2-3)**
- Add citation display in chat UI
- Track search query counts per user
- Analyze which queries trigger searches
- Optimize threshold if needed

**Phase 3: Cost Optimization (if needed)**
- If costs exceed $30/month, migrate to Serper API
- Implement function calling with Serper
- Keep same UX, just swap backend
- Estimated savings: 99% on search costs

---

## Feature Enhancements

### UI/UX Improvements

1. **Citation Display**
```typescript
// Show sources in chat message
<div className="mt-2 text-sm text-slate-600">
  <p className="font-medium">Sources:</p>
  <ul className="list-disc list-inside">
    {sources.map((source, i) => (
      <li key={i}>
        <a href={source.url} target="_blank" className="text-blue-600 hover:underline">
          {source.title}
        </a>
      </li>
    ))}
  </ul>
</div>
```

2. **Search Indicator**
```typescript
// Show when AI is searching
{isSearching && (
  <div className="flex items-center gap-2 text-sm text-slate-500">
    <SearchIcon className="w-4 h-4 animate-spin" />
    Searching the web...
  </div>
)}
```

3. **User Control**
- Toggle to enable/disable web search per conversation
- Show search query used in UI
- Allow users to retry search with different query

### Admin Features

1. **Usage Dashboard**
- Track search queries per user
- Cost tracking for search API
- Most common search queries

2. **Configuration**
- Set search threshold
- Enable/disable for specific users
- Rate limiting (e.g., max 10 searches per conversation)

---

## Security & Privacy Considerations

### Data Privacy

⚠️ **Important**: Search queries are sent to third-party services (Google/Serper/Tavily)

**Best Practices:**
1. Add privacy notice in UI when web search is enabled
2. Don't search sensitive/personal information
3. Anonymize user data in search queries
4. Comply with data protection regulations (GDPR, etc.)

### Rate Limiting

```typescript
// src/lib/search/rate-limiter.ts

const searchLimits = new Map<string, number[]>();

export function checkSearchRateLimit(userId: string, maxPerHour: number = 20): boolean {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;

  const userSearches = searchLimits.get(userId) || [];
  const recentSearches = userSearches.filter(timestamp => timestamp > hourAgo);

  if (recentSearches.length >= maxPerHour) {
    return false; // Rate limit exceeded
  }

  recentSearches.push(now);
  searchLimits.set(userId, recentSearches);
  return true;
}
```

### Cost Control

```typescript
// src/lib/search/cost-control.ts

export async function shouldPerformSearch(
  userId: string,
  currentMonthCost: number,
  monthlyBudget: number
): Promise<boolean> {
  // Check if user has exceeded monthly search budget
  if (currentMonthCost >= monthlyBudget) {
    return false;
  }

  // Check user-specific limits
  const userSearchCount = await getUserSearchCount(userId, 'month');
  const userLimit = 50; // max 50 searches per user per month

  return userSearchCount < userLimit;
}
```

---

## Testing Strategy

### Test Cases

1. **Current Events**: "What happened at CES 2025?"
2. **Real-time Data**: "What's the Bitcoin price right now?"
3. **Recent Releases**: "What's new in Next.js 15?"
4. **Fact Checking**: "When did the latest iPhone come out?"
5. **No Search Needed**: "What is 2+2?" (shouldn't trigger search)
6. **Bilingual**: Test in both English and Chinese

### Monitoring

```typescript
// Track search metrics
interface SearchMetrics {
  totalSearches: number;
  successfulSearches: number;
  failedSearches: number;
  averageResultCount: number;
  totalCost: number;
  averageLatency: number;
}

// Log each search
await logSearch({
  userId,
  query,
  provider: 'gemini-grounding', // or 'serper', 'tavily'
  resultCount: results.length,
  cost: calculateCost(provider, 1),
  latency: endTime - startTime,
  timestamp: new Date()
});
```

---

## Next Steps

### Immediate Actions

1. **Choose approach**: Gemini Grounding (recommended) or Custom API
2. **Get API keys**:
   - Gemini Grounding: Upgrade to paid tier ($35/1K queries)
   - OR Serper: Sign up at serper.dev ($0.30/1K queries)
3. **Implement basic integration**: Follow code examples above
4. **Test with family**: Monitor usage and costs
5. **Iterate based on feedback**

### Future Enhancements

- **Smart caching**: Cache search results for common queries
- **Search history**: Show users their past searches
- **Advanced filters**: Date range, domain filtering
- **Fact verification**: Cross-reference multiple sources
- **RAG integration**: Combine with memory system for context-aware searches

---

## Conclusion

**For ArcherChat, I recommend starting with Gemini Grounding with Google Search** because:

✅ Easiest to implement (1-2 hours)
✅ Best quality and reliability
✅ Professional citations
✅ Acceptable cost at family scale ($3.50-17.50/month for 100-500 queries)
✅ No additional API management

If costs scale beyond $30/month, migrating to **Serper API** is straightforward and will reduce search costs by **99%** while maintaining quality.

Total estimated cost with web search:
- **Light usage**: $11.50-21.50/month (current + $3.50)
- **Moderate usage**: $25.50-35.50/month (current + $17.50)
- Still within reasonable family budget!

---

**Questions or need help implementing?** Let me know!
