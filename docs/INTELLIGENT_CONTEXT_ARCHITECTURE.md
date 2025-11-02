# Intelligent Context Architecture Design

**Status**: 🟡 Design Phase
**Created**: 2025-11-01
**Author**: Archer & Claude Code

---

## 📋 Table of Contents

- [Overview](#overview)
- [Problem Statement](#problem-statement)
- [Proposed Architecture](#proposed-architecture)
- [Module Details](#module-details)
- [Data Flow](#data-flow)
- [Benefits](#benefits)
- [Cost Analysis](#cost-analysis)
- [Migration Plan](#migration-plan)
- [Open Questions](#open-questions)
- [Implementation Roadmap](#implementation-roadmap)

---

## Overview

This document outlines a new intelligent architecture for ArcherChat that replaces the keyword-based trigger system with AI-powered prompt analysis and context engineering.

**Key Innovation**: Use a cheap, fast LLM (Gemini Flash Lite) to analyze every user input and intelligently orchestrate actions (web search, memory retrieval, image generation) before calling the main LLM.

---

## Problem Statement

### Current Issues with Keyword System

1. **Scattered Logic**
   - Keyword matching in multiple places (`keywords.ts`, `extractor.ts`, image detection, etc.)
   - 175+ keywords to maintain in 2 languages
   - Hard to add new features without expanding keyword lists

2. **Inflexible**
   - Can't understand nuanced requests
   - "search for the latest iPhone" - is this web search or just asking?
   - "I really love spicy food, don't forget that" - memory trigger, but no exact keyword match

3. **Maintenance Burden**
   - Every new feature needs keyword updates
   - Bilingual support doubles the work
   - Keywords can conflict or miss edge cases

4. **Limited Intelligence**
   - Can't combine actions (e.g., search + remember)
   - Can't understand context across messages
   - Binary matching (yes/no), no confidence scores

---

## Proposed Architecture

### High-Level Design

Replace keyword matching with a two-stage intelligent pipeline:

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INPUT                              │
│                  (message + files/images)                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  STAGE 1: PromptAnalysis Module                 │
│                     (Gemini 2.5 Flash Lite)                     │
│                                                                 │
│  Analyzes user input and returns structured decisions:         │
│  - What is the user trying to do?                              │
│  - What actions are needed? (search, memory retrieval, etc)    │
│  - EXTRACTS memory facts if needed (immediate extraction)      │
│  - What language is being used?                                │
│  - How confident are we?                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    Analysis Result (JSON)
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                STAGE 2: ContextEngineering Module               │
│                                                                 │
│  Orchestrates all context preparation:                         │
│  1. Execute web search (if needed)                             │
│  2. Retrieve relevant memories (if needed)                     │
│  3. Select appropriate model (Flash vs Image)                  │
│  4. Build final context + prompt                               │
│  5. Perform rate limiting checks                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                  Final Context + Prompt
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  STAGE 3: Main LLM Call                         │
│                    (Gemini 2.5 Flash)                           │
│                                                                 │
│  Generate response with full context                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                      Response to User
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                 STAGE 4: Post-Processing                        │
│                                                                 │
│  - Save extracted memories to Firestore (already extracted)    │
│  - Track usage stats                                           │
│  - Log for debugging                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Module Details

### 1. PromptAnalysis Module

**Purpose**: Fast, cheap AI analysis of user input to determine intent, required actions, AND perform memory extraction.

**Technology**: Gemini 2.5 Flash Lite (4x cheaper, optimized for fast reasoning)

**Key Insight**: Since we're already calling an LLM to analyze the prompt, we should extract memory facts immediately rather than deferring to a separate call later. This saves time and cost.

**Input**:
```typescript
{
  message: string;
  files?: FileAttachment[];
  conversationHistory?: Message[]; // Last 3-5 messages for context
  userSettings?: {
    webSearchEnabled: boolean;
    languagePreference?: string;
  };
}
```

**Output**:
```typescript
interface PromptAnalysisResult {
  // Primary intent
  intent: "question" | "image_generation" | "casual_chat" | "command";

  // Actions needed (multiple can be true)
  actions: {
    web_search: {
      needed: boolean;
      query?: string;          // Optimized search query
      reason?: string;         // Why search is needed
      priority?: "high" | "medium" | "low";
    };

    memory_retrieval: {
      needed: boolean;
      search_terms?: string[]; // What to search in memory
      categories?: MemoryCategory[]; // Which categories to focus on
    };

    memory_extraction: {
      needed: boolean;
      trigger: "explicit" | "implicit"; // User said "remember" vs conversation-based
      facts?: MemoryFact[];  // Extracted facts (if needed=true)
      // Facts are extracted immediately during analysis, not deferred
    };

    image_generation: {
      needed: boolean;
      description?: string;    // Image generation prompt
    };
  };

  // Context metadata
  language: "english" | "chinese" | "hybrid";
  sentiment?: "positive" | "neutral" | "negative";
  urgency?: "high" | "normal" | "low";

  // Confidence
  confidence: number; // 0.0-1.0 (how certain is this analysis)

  // Debug info
  reasoning?: string; // Why these decisions were made
}
```

**Prompt Strategy**:
```
You are a prompt analyzer for a bilingual AI chatbot. Analyze the user's input and determine:

1. Primary intent (question/image_generation/casual_chat/command)
2. Required actions:
   - Web search: Does this need current, real-time information? If yes, generate optimized search query
   - Memory retrieval: Should we recall user's past preferences/info? If yes, what search terms?
   - Memory extraction: Should we save information from this conversation? If yes, EXTRACT THE FACTS NOW
   - Image generation: Is the user asking to create/generate an image?
3. Language preference (English/Chinese/Hybrid)
4. Confidence level (0.0-1.0)

IMPORTANT: If memory extraction is needed, you must extract the facts IMMEDIATELY and include them in your response.
Do not just flag "needed=true". Actually extract the facts with proper categorization and tier.

Memory extraction format:
{
  "content": "factual statement",
  "category": "PROFILE" | "PREFERENCE" | "TECHNICAL" | "PROJECT",
  "tier": "CORE" | "IMPORTANT" | "CONTEXT",
  "confidence": 0.0-1.0,
  "keywords": ["relevant", "keywords"]
}

Return ONLY valid JSON matching the PromptAnalysisResult schema.

Examples:
- "What's the latest iPhone?" → web_search.needed=true, query="latest iPhone model 2025"
- "Remember my birthday is June 5th" → memory_extraction.needed=true, facts=[{content:"User's birthday is June 5th", category:"PROFILE", tier:"CORE"}]
- "I really love spicy food" → memory_extraction.needed=true (implicit), facts=[{content:"User prefers spicy food", category:"PREFERENCE", tier:"IMPORTANT"}]
- "生成一幅星空图片" → image_generation.needed=true, language="chinese"
- "How are you?" → intent="casual_chat", no actions needed

Current settings:
- Web search enabled: {webSearchEnabled}
- User language preference: {languagePreference || "auto-detect"}

User input: {message}
Files attached: {files.length}
Recent context: {conversationHistory}
```

**Performance**:
- Latency: ~200-400ms (Flash Lite is fast)
- Cost: ~$0.000002 per analysis (same cost as old memory extraction, but combined!)
- Runs on every user message

**Efficiency Gain**: By extracting memories during analysis instead of in a separate post-processing call, we save:
- One LLM API call per memory extraction (~200ms latency)
- Complexity of managing two separate LLM calls
- No additional cost (we were calling Flash Lite anyway)

---

### 2. ContextEngineering Module

**Purpose**: Orchestrate all context preparation based on PromptAnalysis results.

**Responsibilities**:

1. **Action Execution**
   ```typescript
   async function executeActions(analysis: PromptAnalysisResult) {
     const context: any = {};

     // Execute in parallel for speed
     const tasks = [];

     if (analysis.actions.web_search.needed) {
       tasks.push(executeWebSearch(analysis.actions.web_search.query));
     }

     if (analysis.actions.memory_retrieval.needed) {
       tasks.push(retrieveMemories(analysis.actions.memory_retrieval.search_terms));
     }

     const results = await Promise.all(tasks);

     // Build context
     return buildFinalContext(results, analysis);
   }
   ```

2. **Rate Limiting**
   - Check web search quota before executing
   - Check memory token budget
   - Return user-friendly errors if limits exceeded

3. **Model Selection**
   ```typescript
   function selectModel(analysis: PromptAnalysisResult): string {
     if (analysis.actions.image_generation.needed) {
       return GEMINI_MODELS[ModelTier.IMAGE];
     }
     return GEMINI_MODELS[ModelTier.MAIN];
   }
   ```

4. **Context Building**
   ```typescript
   function buildFinalContext(
     webSearchResults?: SearchResult[],
     memories?: MemoryFact[],
     analysis: PromptAnalysisResult
   ): string {
     let context = "";

     if (memories && memories.length > 0) {
       context += "**User Context:**\n";
       context += formatMemoriesForContext(memories);
       context += "\n\n";
     }

     if (webSearchResults && webSearchResults.length > 0) {
       context += "**Web Search Results:**\n";
       context += formatSearchResults(webSearchResults);
       context += "\n\n";
     }

     return context;
   }
   ```

5. **Error Handling**
   - Graceful degradation if web search fails
   - Fallback to cached memories if Firestore is slow
   - Continue without context if everything fails

**Integration Points**:
- `WebSearch` module (Google Custom Search API)
- `Memory` module (existing memory system)
- `ProviderFactory` (model selection)
- `RateLimiter` (quota checks)

---

### 3. Post-Processing Module

**Purpose**: Handle actions after the main LLM response.

**Responsibilities**:

1. **Memory Storage**
   - If `analysis.actions.memory_extraction.needed === true`
   - Facts are already extracted by PromptAnalysis module
   - Simply save them to Firestore with deduplication check
   - No additional LLM call needed!

2. **Usage Tracking**
   - Log web search usage
   - Track token consumption
   - Update user statistics

3. **Cleanup**
   - Clear temporary data
   - Release resources

---

## Data Flow

### Example 1: Simple Question (No Special Actions)

```
User: "How do I center a div in CSS?"
  ↓
PromptAnalysis:
  {
    intent: "question",
    actions: { /* all false */ },
    language: "english",
    confidence: 0.95
  }
  ↓
ContextEngineering:
  - No actions needed
  - Select model: Gemini 2.5 Flash (main)
  - Context: conversation history only
  ↓
Main LLM Call → Response
  ↓
Post-Processing: (nothing to do)
```

### Example 2: Web Search + Memory

```
User: "What's the latest news about my favorite team?"
  ↓
PromptAnalysis:
  {
    intent: "question",
    actions: {
      web_search: { needed: true, query: "latest news [team name]" },
      memory_retrieval: { needed: true, search_terms: ["favorite team"] }
    },
    language: "english",
    confidence: 0.88
  }
  ↓
ContextEngineering:
  1. Retrieve memory: "User's favorite team is Lakers"
  2. Execute search: "latest news Lakers"
  3. Build context with both
  ↓
Main LLM Call with context → Response with sources
  ↓
Post-Processing: Track search usage
```

### Example 3: Memory Extraction

```
User: "Remember that I'm vegetarian and allergic to peanuts"
  ↓
PromptAnalysis:
  {
    intent: "command",
    actions: {
      memory_extraction: {
        needed: true,
        trigger: "explicit",
        facts: [
          {
            content: "User is vegetarian",
            category: "PREFERENCE",
            tier: "CORE",
            confidence: 0.98,
            keywords: ["vegetarian", "diet"]
          },
          {
            content: "User has peanut allergy",
            category: "PROFILE",
            tier: "CORE",
            confidence: 0.98,
            keywords: ["allergy", "peanuts", "health"]
          }
        ]
      }
    },
    language: "english",
    confidence: 0.98
  }
  ↓
ContextEngineering:
  - No special context needed
  - Acknowledge command
  ↓
Main LLM Call → "Got it, I'll remember that!"
  ↓
Post-Processing:
  - Save extracted facts to Firestore (facts already extracted above)
  - No need to call LLM again!
```

### Example 4: Image Generation

```
User: "生成一幅星空图片" (Generate a starry sky image)
  ↓
PromptAnalysis:
  {
    intent: "image_generation",
    actions: {
      image_generation: {
        needed: true,
        description: "starry night sky"
      }
    },
    language: "chinese",
    confidence: 0.92
  }
  ↓
ContextEngineering:
  - Select model: Gemini 2.5 Flash Image
  - Add image generation instructions
  ↓
Main LLM Call (Image model) → Response with image
  ↓
Post-Processing: (nothing special)
```

---

## Benefits

### 1. **Cleaner Codebase**

**Before (Keywords)**:
```
src/config/keywords.ts           - 175+ keywords
src/lib/memory/extractor.ts      - Keyword checking
src/lib/providers/gemini.ts      - Image keyword detection
src/lib/keywords/system.ts       - Keyword matching utilities
src/lib/keywords/triggers.ts     - Trigger configuration
```

**After (Intelligent Analysis)**:
```
src/lib/prompt-analysis/         - PromptAnalysis module
src/lib/context-engineering/     - ContextEngineering module
src/lib/web-search/              - Web search integration
src/lib/memory/                  - Memory (no keyword logic)
```

**Lines of Code Reduction**: ~500 lines removed

---

### 2. **Faster and More Efficient**

**Memory Extraction Optimization**:
- **Old way**: Analyze → LLM call → Post-process with ANOTHER LLM call to extract
- **New way**: Analyze + Extract in ONE call → LLM call → Just save

**Benefits**:
- ~200ms faster (one less API round trip)
- Simpler code (no post-processing extraction logic)
- Same cost (we were calling Flash Lite anyway)

---

### 3. **Better User Experience**

- **Understands nuance**: "I really love Thai food" → saves memory without "remember" keyword
- **Smarter routing**: "What's the latest iPhone?" → auto-searches web
- **Multi-action**: "Search for vegetarian recipes and remember I'm allergic to nuts" → does both
- **Language flexibility**: Understands mixed English/Chinese without keyword matching

---

### 4. **Easier to Extend**

Want to add a new feature (e.g., code execution, file generation)?

**Before**: Update keyword lists in 5 places, add detection logic everywhere

**After**: Update PromptAnalysis prompt, add new action type, implement handler

---

### 5. **Cost Efficient**

Despite adding analysis to every message, costs remain negligible:

| Component | Model | Cost per 1K Messages | Notes |
|-----------|-------|---------------------|-------|
| PromptAnalysis | Flash Lite | $0.002 | 50 tokens × 1000 × $0.0000375 |
| Main Chat | Flash | $1.70 | Existing cost |
| **Total Change** | | **+$0.002/month** | **0.1% increase** |

**For 1,000 messages/month**: Adding PromptAnalysis costs less than **$0.01**

---

### 6. **Better Debugging**

Analysis returns structured JSON with reasoning:

```json
{
  "intent": "question",
  "actions": {
    "web_search": {
      "needed": true,
      "query": "Bitcoin price USD",
      "reason": "User asks for real-time price data"
    }
  },
  "confidence": 0.92,
  "reasoning": "User explicitly asks 'current price' which requires real-time data"
}
```

Can log this for debugging, show to admins, analyze patterns.

---

## Cost Analysis

### Current System (Without Web Search)

| Feature | Model | Usage/Month | Cost/Month |
|---------|-------|-------------|------------|
| Main Chat | 2.5 Flash | 1000 msgs | $1.70 |
| Memory Extraction | Flash Lite | 50 extractions | $0.05 |
| Image Generation | Flash Image | 20 images | $0.50 |
| **Total** | | | **$2.25** |

### New System (With PromptAnalysis + Web Search)

| Feature | Model | Usage/Month | Cost/Month |
|---------|-------|-------------|------------|
| **PromptAnalysis** | **Flash Lite** | **1000 analyses** | **$0.002** |
| Main Chat | 2.5 Flash | 1000 msgs | $1.70 |
| Memory Extraction | Flash Lite | 50 extractions | $0.05 |
| Image Generation | Flash Image | 20 images | $0.50 |
| **Web Search** | **Custom Search** | **500 searches** | **$0.00** |
| **Total** | | | **$2.252** |

**Cost Increase**: $0.002/month (0.1%)

**Web search is FREE** because:
- Google Custom Search: 100 free searches/day = 3,000/month
- Family use estimate: 10-20 searches/day = 300-600/month
- Well within free tier

---

## Migration Plan

### Phase 1: Implement New Modules (No Breaking Changes)

**Week 1-2**: Build new modules alongside existing system

1. Create `src/lib/prompt-analysis/analyzer.ts`
2. Create `src/lib/context-engineering/orchestrator.ts`
3. Implement web search integration
4. Add feature flag: `USE_INTELLIGENT_ANALYSIS` (default: false)

**No user impact** - old system still works

---

### Phase 2: A/B Testing (Parallel Systems)

**Week 3**: Run both systems in parallel

1. Enable `USE_INTELLIGENT_ANALYSIS` for admin only
2. Log both outputs (keyword vs AI analysis)
3. Compare:
   - Accuracy of intent detection
   - Response quality
   - Latency difference
   - Cost impact

**Success Criteria**:
- ✅ AI analysis accuracy ≥ 95%
- ✅ Latency increase < 500ms
- ✅ No critical bugs for 1 week

---

### Phase 3: Gradual Rollout

**Week 4**: Enable for all users

1. Set `USE_INTELLIGENT_ANALYSIS = true` by default
2. Keep keyword system as fallback (if analysis confidence < 0.7)
3. Monitor for issues

---

### Phase 4: Cleanup

**Week 5**: Remove old keyword system

1. Delete `src/config/keywords.ts`
2. Remove keyword logic from memory, image detection
3. Update documentation
4. Commit and deploy

---

## Open Questions

### 🔴 Critical Decisions Needed

1. **PromptAnalysis Output Schema**
   - Is the proposed JSON structure complete?
   - Any additional fields needed?

2. **Error Handling Strategy**
   - What happens if PromptAnalysis fails?
     - Option A: Fallback to keywords (safe but complex)
     - Option B: Assume no special actions, continue normally
     - Option C: Show error to user, ask them to retry

3. **Rate Limiting Placement**
   - Check limits BEFORE PromptAnalysis? (save API call if at limit)
   - Check limits AFTER PromptAnalysis? (more accurate, knows if search is actually needed)

4. **Conversation History for Analysis**
   - How many previous messages to include? (0, 3, 5, 10?)
   - Impacts cost and accuracy

### 🟡 Design Refinements

5. **Caching Strategy**
   - Cache PromptAnalysis results for identical inputs?
   - Cache web search results for same query within X minutes?

6. **Model Selection Logic**
   - Should PromptAnalysis also recommend temperature/max_tokens?
   - Should it detect when to use Flash vs Flash Experimental?

7. **User Controls**
   - Should users see the analysis results? (transparency)
   - Should they be able to override? ("No, don't search")

8. **Confidence Thresholds**
   - Below what confidence should we not trust the analysis?
   - Should different actions have different thresholds?

### 🟢 Future Enhancements

9. **Learning from Feedback**
   - If user says "no, don't search", save this as training signal?
   - Build a feedback loop to improve analysis over time?

10. **Multi-step Actions**
    - "Search for restaurants and remember I'm vegetarian"
    - Should ContextEngineering handle dependencies between actions?

---

## Implementation Roadmap

### Phase 1: Core Infrastructure (Week 1)

**Tasks**:
- [ ] Create `src/lib/prompt-analysis/analyzer.ts`
- [ ] Define `PromptAnalysisResult` TypeScript interface
- [ ] Implement basic PromptAnalysis with Flash Lite
- [ ] Write unit tests for analysis prompt
- [ ] Add feature flag `USE_INTELLIGENT_ANALYSIS`

**Deliverable**: Working PromptAnalysis module (isolated, testable)

---

### Phase 2: Context Engineering (Week 2)

**Tasks**:
- [ ] Create `src/lib/context-engineering/orchestrator.ts`
- [ ] Implement action execution (web search, memory retrieval)
- [ ] Implement rate limiting integration
- [ ] Implement model selection logic
- [ ] Build final context formatting
- [ ] Write integration tests

**Deliverable**: Full pipeline (analysis → context → LLM call)

---

### Phase 3: Web Search Integration (Week 2)

**Tasks**:
- [ ] Create `src/lib/web-search/google-search.ts`
- [ ] Implement rate limiter for web search
- [ ] Add usage tracking to Firestore
- [ ] Create UI toggle for web search enable/disable
- [ ] Add search result citations to responses
- [ ] Test with Google Custom Search API

**Deliverable**: Working web search feature

---

### Phase 4: Testing & Refinement (Week 3)

**Tasks**:
- [ ] Enable for admin user only
- [ ] Test various scenarios (English, Chinese, mixed)
- [ ] Compare with keyword system outputs
- [ ] Measure latency and costs
- [ ] Fix bugs and edge cases
- [ ] Refine analysis prompts based on results

**Deliverable**: Production-ready system

---

### Phase 5: Rollout & Cleanup (Week 4-5)

**Tasks**:
- [ ] Enable for all users (set flag to true)
- [ ] Monitor for issues for 1 week
- [ ] Remove keyword system code
- [ ] Update all documentation
- [ ] Final deployment to Cloud Run

**Deliverable**: Keyword system fully replaced

---

## Success Metrics

### Technical Metrics

- **Accuracy**: PromptAnalysis intent detection ≥ 95% correct
- **Latency**: P95 latency increase < 500ms
- **Cost**: Total cost increase < 5%
- **Reliability**: Uptime ≥ 99.5%

### User Experience Metrics

- **User satisfaction**: No complaints about missed features
- **Memory quality**: More relevant facts extracted
- **Search usefulness**: Web search used appropriately (not over/under-triggered)

### Code Quality Metrics

- **Lines of code**: -500 lines (removed keyword logic)
- **Test coverage**: ≥ 80% for new modules
- **Maintainability**: New features require <50% effort vs old system

---

## Conclusion

The Intelligent Context Architecture represents a fundamental shift from rule-based (keywords) to AI-powered analysis. This design:

✅ **Simplifies** the codebase (remove 500+ lines)
✅ **Improves** user experience (understands nuance)
✅ **Costs** almost nothing (<$0.01/month increase)
✅ **Enables** future features (easy to extend)
✅ **Maintains** reliability (fallback strategies)

**Recommendation**: Proceed with implementation following the phased roadmap.

---

**Next Steps**:
1. Review and approve this design
2. Resolve open questions (see section above)
3. Begin Phase 1 implementation
4. Schedule weekly check-ins to track progress

**Last Updated**: 2025-11-01
**Status**: 🟡 Awaiting approval and open question resolution
