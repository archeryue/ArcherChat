# Future Improvements

This document tracks planned enhancements and known issues that need improvement.

---

## High Priority

### None currently

---

## Medium Priority

### 1. Image Generation Prompt Enhancement

**Description**: Add an AI-powered prompt enhancement step before sending user's image generation request to the model. This will improve image quality and ensure better results by expanding brief descriptions into detailed, well-structured prompts.

**Current Behavior**:
- User provides image description (e.g., "a cat playing piano")
- System sends prompt directly to Gemini 2.5 Flash Image model
- Results vary depending on prompt quality

**Proposed Enhancement**:
```
User Input → Prompt Enhancer (Gemini Flash Lite) → Enhanced Prompt → Image Model → Generated Image
```

**Benefits**:
- Better image quality from concise user inputs
- Consistent prompt structure (style, lighting, composition details)
- Educational - users can see what makes a good image prompt
- Minimal cost (~$0.000002 per enhancement with Flash Lite)

**Example Enhancement**:
- User input: "a cat playing piano"
- Enhanced: "A fluffy orange tabby cat sitting at a grand piano, paws on the keys, warm studio lighting, photorealistic style, detailed fur texture, elegant composition, shallow depth of field, professional photography"

**Implementation Plan**:
1. Create `src/lib/image/prompt-enhancer.ts`
2. Use Gemini 2.5 Flash Lite for enhancement (fast, cheap)
3. Add system prompt with image generation best practices
4. Show original and enhanced prompts in UI (optional)
5. Allow users to edit enhanced prompt before generating

**Files to Modify**:
- `src/app/api/chat/route.ts` - Add enhancement step before image gen
- `src/lib/prompt-analysis/analyzer.ts` - Detect image gen intent
- New file: `src/lib/image/prompt-enhancer.ts`
- `src/components/chat/ChatMessage.tsx` - Show enhancement details (optional)

**Estimated Effort**: 2-3 hours

**Cost Impact**: ~$0.000002 per image generation (negligible)

---

### 2. Per-Conversation PRO Model Toggle

**Description**: Add a UI button/toggle to enable a more powerful "PRO" tier model (e.g., Gemini 2.5 Pro) for specific conversations where higher quality is needed, while keeping the default fast/free tier for general use.

**Current Behavior**:
- All conversations use Gemini 2.5 Flash (main tier)
- Model selection is automatic based on task (image gen, analysis, etc.)
- No way for users to request higher quality model

**Proposed Feature**:
- Add "PRO Mode" toggle in chat interface (near settings or in top bar)
- Stores preference per conversation in Firestore
- Visual indicator when PRO mode is active
- Cost estimation shown before enabling

**Benefits**:
- Users control quality vs cost tradeoff
- Better responses for complex queries
- Keeps free tier as default for cost efficiency
- Transparent pricing - users know when they're using expensive models

**UI Mockup**:
```
[Chat Top Bar]
  [⚡ PRO Mode: OFF] ← Button

When clicked:
  Modal:
    "Enable PRO Mode for this conversation?
     - Higher quality responses
     - Better reasoning for complex queries
     - Estimated cost: ~$0.02-0.05 per message
     - Can be toggled on/off anytime
     [Cancel] [Enable PRO Mode]"
```

**Model Tiers**:
- **Default**: Gemini 2.5 Flash (fast, free tier)
- **PRO**: Gemini 2.5 Pro or Gemini 2.5 Pro Experimental (higher quality, paid)

**Implementation Plan**:
1. Add `model_tier` field to Conversation schema
2. Create UI toggle component in chat top bar
3. Update model selection logic to respect conversation preference
4. Add cost estimation display
5. Store preference in Firestore
6. Add visual indicator (badge/icon) when PRO is active

**Files to Modify**:
- `src/types/index.ts` - Add model_tier to Conversation type
- `src/components/chat/ChatTopBar.tsx` - Add PRO toggle button
- `src/app/api/chat/route.ts` - Check conversation's model_tier
- `src/config/models.ts` - Add PRO tier model configuration
- `src/lib/providers/provider-factory.ts` - Support PRO tier
- Firestore schema: Add model_tier to conversations collection

**Estimated Effort**: 3-4 hours

**Cost Impact**: User-controlled, opt-in for specific conversations

---

---

## Low Priority

### 1. Progress Badge UX: Steps Change Too Fast

**Issue**: Progress tracking badge transitions through steps too quickly. Users only see "Generating response..." and "Completed", missing earlier steps like "Analyzing", "Searching", and "Building context".

**Current Behavior**:
- All steps work correctly and are emitted by server
- Client receives and processes all events
- But fast steps (< 500ms) complete before user can read them

**Impact**:
- Low - Progress tracking is functional and shows major step (generating)
- Users get visual feedback that something is happening
- Missing intermediate steps doesn't affect functionality

**Proposed Solutions**:

**Option 1: Minimum Display Time** (Recommended)
```typescript
// Ensure each step displays for at least 500ms
const MIN_DISPLAY_MS = 500;
const stepQueue: ProgressEvent[] = [];
let currentDisplayedStep: ProgressEvent | null = null;
let lastStepTime = 0;

const processNextStep = () => {
  if (stepQueue.length === 0) return;

  const now = Date.now();
  const timeSinceLastStep = now - lastStepTime;

  if (timeSinceLastStep >= MIN_DISPLAY_MS || !currentDisplayedStep) {
    currentDisplayedStep = stepQueue.shift()!;
    lastStepTime = now;
    updateBadge(currentDisplayedStep);

    if (stepQueue.length > 0) {
      setTimeout(processNextStep, MIN_DISPLAY_MS);
    }
  } else {
    setTimeout(processNextStep, MIN_DISPLAY_MS - timeSinceLastStep);
  }
};

// When new progress event arrives
progressEventsList.push(progressData);
stepQueue.push(progressData);
processNextStep();
```

**Option 2: Progress History**
- Show all completed steps in a collapsed/expandable list
- Keep current badge for active step
- Allows users to review what happened

**Option 3: Animation Transitions**
- Add 200ms fade-out → fade-in between steps
- Makes transitions more noticeable
- Still might be too fast for very quick steps

**Option 4: Parallel Step Display**
- Show multiple simultaneous operations: "Analyzing & Searching..."
- More complex to implement
- Better reflects actual parallel operations

**Recommendation**: Start with Option 1 (minimum display time). It's simple, non-intrusive, and ensures users can read each step. If that's insufficient, add Option 2 (history).

**Files to Modify**:
- `src/app/chat/page.tsx` - Add step queueing logic
- `src/components/chat/ProgressMessage.tsx` - Handle queued steps
- `src/lib/progress/types.ts` - Add queue management types

**Estimated Effort**: 1-2 hours

**Related**: See `docs/PROGRESS_TRACKING.md` for architecture details

---

## Ideas / Nice to Have

### Memory Analytics Dashboard
- Visualize user's memory facts over time
- Show which facts are used most frequently
- Memory usage graphs

### Export/Import Memory Data
- Allow users to export their memory as JSON
- Import memory from another account
- Useful for account migration

### Multi-Model Support
- Add OpenAI, Anthropic, local models
- Allow users to select preferred model
- Compare responses from different models side-by-side

### Voice Input Support
- Especially useful for Chinese input
- Speech-to-text integration
- Voice commands for navigation

### Conversation Branching
- Allow users to create alternate conversation branches
- "What if" scenarios from any message
- Tree view of conversation branches

### Collaborative Conversations
- Share conversations with family members
- Real-time collaborative chat
- Shared memory contexts (opt-in)

### Code Execution Sandbox
- Execute code snippets safely
- Show output inline
- Support for multiple languages

### Custom Keyboard Shortcuts
- User-configurable hotkeys
- Quick actions without mouse
- Vim-style navigation mode

---

**Last Updated**: November 19, 2025
**Maintained By**: Archer & Claude Code
