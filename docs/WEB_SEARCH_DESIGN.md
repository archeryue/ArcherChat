# Web Search Integration - Complete Design and Implementation

**Created**: 2025-11-01
**Status**: Implemented ✅ (Disabled - TODO: Enable Tomorrow)
**Provider**: Google Custom Search API

---

## 🔴 ISSUES & TODO (2025-11-02)

### ✅ COMPLETED: Global Rate Limiting Implementation
**Status**: Implemented and deployed (2025-11-02)

**Changes Made**:
1. ✅ Modified `src/lib/web-search/rate-limiter.ts`:
   - Removed per-user logic (no more `user_id` filtering)
   - Removed hourly limit logic
   - Implemented global daily limit: 100 searches/day for ALL users
   - Simple query: `search_usage.where('timestamp', '>=', oneDayAgo).get()`

2. ✅ Updated `src/lib/context-engineering/orchestrator.ts`:
   - Changed `checkRateLimit(userId)` to `checkRateLimit()` (no userId needed)

3. ✅ Simplified Firestore index requirement:
   - **Old**: Composite index (user_id + timestamp) ❌
   - **New**: Single-field index (timestamp only) ✅
   - **Auto-created**: Firestore automatically creates single-field indexes
   - **No manual setup needed** for basic `where('timestamp', '>=', ...)` queries

**Benefits Achieved**:
- ✅ Simpler code (50% fewer lines in rate limiter)
- ✅ No Firestore index errors (single-field indexes auto-created)
- ✅ More predictable costs (one shared limit)
- ✅ Easier to monitor (one query, one metric)

**New Limits**:
- **Global daily limit**: 100 searches/day for ALL users combined
- **Free tier**: 100 searches/day = $0 (within Google's free tier)
- **Beyond 100/day**: $0.005 per search ($5 per 1,000 queries)

### TODO: Analyze and Optimize Latency
**Issue**: Response time is slow in some cases

**Observed Behavior**:
- Example: "compare Playwright with Selenium" caused noticeable delay
- AI stuck for a while before responding

**Potential Causes to Investigate**:
1. **PromptAnalyzer latency** - Gemini Flash Lite analysis adds ~1 second
2. **Rate limiter errors** - Firestore index errors cause delays (even though it "fails open")
3. **Web search attempt** - Tries to search even when disabled, then falls back
4. **Memory retrieval** - Currently queries Firestore EVERY request (NO caching!) ⚠️
5. **Main AI response** - Gemini 2.0 Flash response generation

**Investigation Plan** (Tomorrow):
1. Add timing logs to each major step:
   - PromptAnalysis duration
   - Rate limiter check duration
   - Web search duration (if enabled)
   - Memory retrieval duration
   - AI response generation duration
2. Identify bottlenecks from production logs
3. Optimize the slowest components

**Optimization Ideas**:
- **🔴 PRIORITY: Cache user memory** - Currently queries Firestore on EVERY message!
  - Implement in-memory cache (Map) or Redis
  - Cache TTL: 5-10 minutes (memory rarely changes)
  - Invalidate cache when new facts are saved
  - This should make memory retrieval nearly instant
- Skip rate limiter entirely when web search is disabled (avoid Firestore error overhead)
- Consider caching PromptAnalysis for similar queries
- Use Gemini Flash (faster) instead of Flash Lite for analysis if latency > quality

**Target**: Total response time < 2 seconds for typical questions

---

## Executive Summary

WhimCraft implements web search capability using **Google Custom Search API** integrated via the Intelligent Context Architecture. This provides real-time web information access with rate limiting and cost controls.

**Key Decision**: Google Custom Search API chosen over alternatives (Tavily AI, Gemini Grounding) due to:
- ✅ Same GCP ecosystem (no new accounts needed)
- ✅ 3,000 FREE searches/month (100/day)
- ✅ Best search quality (Google's algorithm)
- ✅ Cheaper at scale ($5/1K vs $8/1K Tavily, $35/1K Gemini Grounding)
- ✅ Consolidated GCP billing

**Implementation Status**: Fully implemented via Intelligent Context Architecture (see `IMPLEMENTATION_SUMMARY.md`)

---

## Architecture

### Integration Approach: Option C (Hybrid - Smart + User Control) ⭐

**How it works:**
- User has global toggle "Enable Web Search" (feature flag)
- When enabled, AI (PromptAnalysis module) decides if search is actually needed
- Best of both worlds: user controls feature availability, AI optimizes usage

**Benefits:**
- ✅ User controls when feature is available
- ✅ AI optimizes when to actually search
- ✅ Predictable costs (max = when enabled)
- ✅ Smart behavior when enabled
- ✅ Can default to OFF for cost control

**Flow:**
```
User Message → PromptAnalysis Module (Gemini Flash Lite)
    ↓
Determines: Is web search needed?
    ↓
If yes → ContextEngineering Module
    ↓
Executes Google Custom Search (with rate limiting)
    ↓
Results formatted and added to context
    ↓
Main LLM generates response with citations
```

---

## Cost Comparison

### Google Custom Search API (Selected)

**Free Tier:**
- 100 searches/day FREE (3,000/month) ✅
- No credit card required initially
- Full API access

**Paid Tier:**
- $5 per 1,000 queries beyond free tier
- Maximum 10,000 queries/day limit

**Cost Scenarios for WhimCraft:**

| Monthly Usage | Free Queries | Paid Queries | Total Cost |
|---------------|--------------|--------------|------------|
| 500 searches | 500 (free) | 0 | $0 ✅ |
| 1,000 searches | 1,000 (free) | 0 | $0 ✅ |
| 2,000 searches | 2,000 (free) | 0 | $0 ✅ |
| 3,000 searches | 3,000 (free) | 0 | $0 ✅ |
| 5,000 searches | 3,000 (free) | 2,000 paid | $10 |
| 10,000 searches | 3,000 (free) | 7,000 paid | $35 |

### Alternatives Considered (Not Selected)

#### Gemini Grounding with Google Search
- **Cost**: $35 per 1,000 queries
- **Pros**: Native integration, automatic search decisions, citations included
- **Cons**: 7x more expensive than Custom Search API
- **Verdict**: Too expensive for family use case

#### Tavily AI
- **Cost**: $8 per 1,000 queries (after 1,000 free/month)
- **Pros**: LLM-optimized content, 1,000 free searches/month
- **Cons**: Requires separate account, not in GCP ecosystem
- **Verdict**: Good option but not optimal for existing GCP users

**For detailed comparison**: See "Alternative Providers Comparison" section below

---

## Implementation Details

### Setup (Google Custom Search API)

**1. Enable Custom Search API:**
```bash
# In your GCP project (archerchat-3d462)
gcloud services enable customsearch.googleapis.com
```

**2. Create Programmable Search Engine:**
- Go to https://programmablesearchengine.google.com/
- Create new search engine
- Select "Search the entire web"
- Get your Search Engine ID

**3. Get API Key:**
- Go to GCP Console → APIs & Services → Credentials
- Create API key
- Restrict to Custom Search API (recommended)

**4. Configure Environment Variables:**
```bash
# .env.local
NEXT_PUBLIC_USE_WEB_SEARCH=true
GOOGLE_SEARCH_API_KEY=your-api-key-here
GOOGLE_SEARCH_ENGINE_ID=your-search-engine-id
```

### Rate Limiting

**Global Limits** (ALL users combined):
- **100 searches per day** for all users combined
- Tracked in Firestore `search_usage` collection
- Simple query: `where('timestamp', '>=', last24hours)`

**Cost Tracking:**
- First 100 searches/day globally: **FREE** ✅
- Beyond 100/day: $0.005 per search ($5 per 1,000 queries)
- Usage tracked with `user_id` for analytics (but not for rate limiting)

**Why Global Limit:**
- Simpler implementation (no per-user tracking)
- More predictable costs (one shared pool)
- Easier monitoring (single metric)
- Fits free tier perfectly (100/day = $0)

### Code Implementation

**PromptAnalysis Module** (`src/lib/prompt-analysis/analyzer.ts`):
- Determines if user query needs web search
- Returns structured JSON with `actions.web_search.needed = true/false`

**ContextEngineering Module** (`src/lib/context-engineering/orchestrator.ts`):
- Executes web search when needed
- Applies rate limiting
- Formats results for AI context

**Google Search Service** (`src/lib/web-search/google-search.ts`):
- Performs actual search API calls
- Formats results for display
- Generates source citations

---

## Alternative Providers Comparison

### Detailed Comparison Table

| Feature | Google Custom Search | Tavily AI | Gemini Grounding |
|---------|---------------------|-----------|------------------|
| **Free Tier** | 3,000/month | 1,000/month | None |
| **Paid Cost** | $5/1K | $8/1K | $35/1K |
| **Setup Time** | 15 min (GCP users) | 15 min (new account) | 5 min (native) |
| **Search Quality** | Excellent (Google) | Good (AI-optimized) | Excellent (Google) |
| **Citations** | Manual formatting | Built-in | Built-in |
| **Ecosystem** | GCP | Standalone | GCP |
| **Content Type** | Snippets (~200 chars) | Full page content | Snippets + context |
| **Rate Limits** | 10K/day max | None specified | None specified |
| **Best For** | GCP users, cost-conscious | New projects, LLM-ready content | Enterprise, simple integration |

### Why Google Custom Search Won

For WhimCraft specifically (already on GCP):

1. **Same ecosystem**: Everything in GCP, no new accounts
2. **3x more free searches**: 3,000 vs 1,000 (Tavily) vs 0 (Gemini)
3. **38% cheaper at scale**: $5/1K vs $8/1K (Tavily)
4. **86% cheaper than Gemini**: $5/1K vs $35/1K
5. **Consolidated billing**: One GCP invoice
6. **Best search quality**: Google's algorithm
7. **Fastest setup for us**: Just enable API in existing project

**Trade-off accepted**: Returns snippets only (~200 chars). Full page scraping can be added later if needed.

---

## Testing

### Enable Web Search

```bash
# .env.local
NEXT_PUBLIC_USE_INTELLIGENT_ANALYSIS=true
NEXT_PUBLIC_USE_WEB_SEARCH=true
GOOGLE_SEARCH_API_KEY=your-key
GOOGLE_SEARCH_ENGINE_ID=your-id
```

### Test Cases

| Input | Expected Behavior |
|-------|-------------------|
| "What's the latest iPhone?" | Searches web, cites sources |
| "Bitcoin price now" | Searches for real-time data |
| "How does React work?" | No search (timeless knowledge) |
| 21st search in one hour | Rate limit error message |

### Verify Logs

```
[GoogleSearch] Searching for: "latest iPhone model 2025" (5 results)
[GoogleSearch] Found 5 results
[SearchRateLimiter] Tracked: user@example.com - "..." (5 results, $0.000)
```

### Verify Response

- Answer includes information from search results
- **Sources:** section at the end with clickable links

---

## Production Deployment

### Local Testing First

```bash
npm run dev
# Test all search scenarios
```

### Deploy to Cloud Run

```bash
gcloud run services update archerchat \
  --region=us-central1 \
  --update-env-vars NEXT_PUBLIC_USE_WEB_SEARCH=true,GOOGLE_SEARCH_API_KEY=your-key,GOOGLE_SEARCH_ENGINE_ID=your-id
```

### Monitoring

**Firestore Collection: `search_usage`**
- Fields: `user_id`, `query`, `results_count`, `timestamp`, `cost_estimate`
- Use for billing monitoring and usage analytics

**Key Metrics:**
- Searches per day (free tier: 100/day)
- Cost per month (free tier: $0 up to 3,000/month)
- Top users (for rate limit optimization)

---

## Cost Impact on WhimCraft

### Before Web Search

| Feature | Cost/Month |
|---------|-----------|
| Main Chat | $1.70 |
| Memory Extraction | $0.05 |
| **Total** | **$1.75** |

### After Web Search (500 searches/month)

| Feature | Cost/Month |
|---------|-----------|
| Main Chat | $1.70 |
| Memory Extraction | $0.05 |
| PromptAnalysis | $0.002 |
| **Web Search (500)** | **$0** (within free tier) |
| **Total** | **$1.752** |

**Cost Increase**: ~$0.002/month (0.1%) ← Negligible!

### At Scale (5,000 searches/month)

| Feature | Cost/Month |
|---------|-----------|
| Main Chat | $1.70 |
| Memory Extraction | $0.05 |
| PromptAnalysis | $0.002 |
| **Web Search (5,000)** | **$10** (2,000 paid) |
| **Total** | **$11.752** |

**Still well within $30/month budget** ✅

---

## Future Enhancements

1. **Full Page Scraping**: Fetch complete page content (not just snippets)
2. **Search Result Caching**: Cache popular queries to reduce API calls
3. **User Search History**: Let users view past searches
4. **Advanced Search Operators**: Support site:, filetype:, etc.
5. **Image Search**: Add Google Image Search capability
6. **News Search**: Dedicated news search for current events
7. **Per-User Quotas**: Customize rate limits by user tier

---

## References

- [Google Custom Search JSON API Documentation](https://developers.google.com/custom-search/v1/overview)
- [Programmable Search Engine Setup](https://programmablesearchengine.google.com/)
- [Intelligent Context Architecture](./INTELLIGENT_CONTEXT_ARCHITECTURE.md)
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)

---

**Last Updated**: 2025-11-01
**Implementation Status**: ✅ Complete and Production-Ready
