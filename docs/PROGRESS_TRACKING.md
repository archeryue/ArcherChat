# Progress Tracking System

**Status**: ✅ Implemented (November 2, 2025)

## Overview

The progress tracking system provides real-time visual feedback to users during AI response generation. It shows a single, updating badge that transitions through multiple processing steps.

## User Experience

Users see a **single badge** above the AI's response that updates in place:

1. 🔵 **"Analyzing your question..."** - Analyzing prompt intent
2. 🔵 **"Searching for: [query]"** - Web search in progress
3. 🔵 **"Fetching N pages..."** - Fetching webpage content (NEW)
4. 🔵 **"Extracting relevant information..."** - AI-powered content extraction (NEW)
5. 🔵 **"Retrieving relevant memories..."** - Memory retrieval
6. 🔵 **"Building context for AI..."** - Context preparation
7. 🔵 **"Generating response..."** - AI generating answer
8. 🟢 **"Completed"** - Response finished

## Architecture

### Components

1. **Progress Emitter** (`src/lib/progress/emitter.ts`)
   - Pub/sub system for progress events
   - Request-scoped emitter instances
   - Global registry for active emitters

2. **Progress Types** (`src/lib/progress/types.ts`)
   - `ProgressStep` enum defining all steps
   - `ProgressEvent` interface with status and metadata
   - Step labels for UI display

3. **Progress UI** (`src/components/chat/ProgressMessage.tsx`)
   - Displays single updating badge
   - Shows spinner for in-progress steps
   - Green checkmark for completion
   - Error state with red badge

### Data Flow

```
Server (route.ts)
  ├─> ProgressEmitter.emit()
  ├─> Buffer events before stream starts
  ├─> Send [PROGRESS] prefixed lines
  └─> Stream [CONTENT] separately

Client (page.tsx)
  ├─> Parse [PROGRESS] and [CONTENT] lines
  ├─> Store progress events in state
  ├─> Update message with progressEvents
  └─> Throttle UI updates (50ms)

ChatMessage Component
  ├─> Receive progressEvents prop
  └─> Render ProgressMessage badge
```

## Protocol

The server streams two types of data:

- **Progress Events**: `[PROGRESS]{"step":"analyzing_prompt","status":"started",...}\n`
- **Content Chunks**: `[CONTENT]"Hello world"\n` (JSON-encoded to preserve newlines)

### Why JSON Encoding?

Content chunks are JSON-encoded because AI responses often contain newlines. Without encoding, a chunk like `"Hello\nWorld"` would be split into two lines when sent over the newline-delimited protocol, causing data loss.

Example:
```javascript
// Server
const chunk = "Hello\nWorld";
stream.write(`[CONTENT]${JSON.stringify(chunk)}\n`); // "[CONTENT]"Hello\nWorld"\n"

// Client
const contentChunk = JSON.parse(line.substring(9)); // "Hello\nWorld" ✅
```

## Implementation Details

### Server-Side (route.ts)

```typescript
// Create progress emitter
const progressEmitter = new ProgressEmitter();
const progressEventsBuffer: any[] = [];

// Buffer early events
const earlyUnsubscribe = progressEmitter.subscribe((event) => {
  progressEventsBuffer.push(event);
});

// Emit progress at key points
progressEmitter.emit({
  step: ProgressStep.ANALYZING_PROMPT,
  status: 'started',
  message: 'Analyzing your question...',
  timestamp: Date.now(),
});

// In stream
controller.enqueue(encoder.encode(`[PROGRESS]${JSON.stringify(event)}\n`));
controller.enqueue(encoder.encode(`[CONTENT]${JSON.stringify(chunk)}\n`));
```

### Client-Side (page.tsx)

```typescript
const progressEventsList: any[] = [];
let assistantContent = "";
let buffer = "";

// Process stream
while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (line.startsWith('[PROGRESS]')) {
      const progressData = JSON.parse(line.substring(10));
      progressEventsList.push(progressData);
    } else if (line.startsWith('[CONTENT]')) {
      const contentChunk = JSON.parse(line.substring(9));
      assistantContent += contentChunk;
    }
  }

  // Update message with both content and progress
  setMessages((prev) =>
    prev.map((msg) =>
      msg.id === assistantMessageId
        ? { ...msg, content: assistantContent, progressEvents: progressEventsList }
        : msg
    )
  );
}
```

## Progress Steps

| Step | When | Duration | Skippable |
|------|------|----------|-----------|
| ANALYZING_PROMPT | Always | ~1s | No |
| SEARCHING_WEB | If web search needed | ~1s | Yes |
| FETCHING_CONTENT | After web search (top 3 results) | ~2-3s | Yes |
| EXTRACTING_INFO | After content fetching | ~2-4s | Yes |
| RETRIEVING_MEMORY | If memories exist | <0.5s | Yes |
| BUILDING_CONTEXT | Always | <0.1s | No |
| GENERATING_RESPONSE | Always | 2-5s | No |

## Known Issues & Future Improvements

### UX Issue: Badge Changes Too Fast

**Problem**: Users report only seeing "Generating response..." and "Completed" badges. Earlier steps (analyzing, searching, building context) transition too quickly to be noticed.

**Impact**: Low priority - progress tracking still works, but some steps are too fast to see.

**Potential Solutions**:
1. **Minimum display time**: Show each badge for at least 500ms before transitioning
2. **Progress history**: Show all completed steps in a collapsed list
3. **Animation**: Add fade-in/fade-out transitions between steps
4. **Parallel steps**: Show multiple simultaneous operations (e.g., "Searching & Analyzing")

**Implementation Approach** (future):
```typescript
// Option 1: Minimum display time
const MIN_DISPLAY_MS = 500;
let lastStepChangeTime = Date.now();

const updateUI = () => {
  const now = Date.now();
  if (now - lastStepChangeTime < MIN_DISPLAY_MS) {
    // Queue update for later
    setTimeout(updateUI, MIN_DISPLAY_MS - (now - lastStepChangeTime));
    return;
  }

  // Actually update badge
  setCurrentStep(latestEvent);
  lastStepChangeTime = now;
};
```

**Tracking**: See `docs/FUTURE_IMPROVEMENTS.md` for detailed plan

## Web Scraping Integration

**NEW (November 2, 2025)**: Web scraping with AI-powered content extraction

When web search is triggered, the system now:

1. **Fetches Top Results**: Downloads HTML from top 3 search results
   - Uses cheerio for HTML parsing
   - Extracts main content (article, main, body)
   - Cleans and normalizes text
   - 5-second timeout per page
   - Progress: "Fetching N pages..."

2. **Extracts Relevant Info**: Uses Gemini Flash Lite to extract pertinent information
   - Focuses on content relevant to user's query
   - Generates 2-3 paragraph summaries
   - Extracts key points as bulleted lists
   - Ranks by relevance score (0-1)
   - Progress: "Extracting relevant information..."

3. **Builds Enhanced Context**: Provides AI with detailed content instead of just snippets
   - Title + relevance score
   - Comprehensive summary
   - Key points
   - Source URL

**Benefits**:
- Much more detailed information than search snippets alone
- AI can answer with specific facts, quotes, and data
- Better accuracy for recent events and specific questions
- Cost-efficient: ~$0.001-0.002 per extraction using Gemini Flash Lite

**Cost Impact**:
- Content Fetching: FREE (standard HTTP requests)
- Content Extraction: ~$0.000015 per page (Gemini Flash Lite)
- Total: ~$0.00005 per search with extraction (3 pages)

**Files**:
- `src/lib/web-search/content-fetcher.ts` - HTML fetching with cheerio
- `src/lib/web-search/content-extractor.ts` - AI-powered extraction
- `src/types/content-fetching.ts` - Type definitions
- `src/lib/context-engineering/orchestrator.ts` - Integration

---

**Last Updated**: November 2, 2025
**Author**: Archer & Claude Code
