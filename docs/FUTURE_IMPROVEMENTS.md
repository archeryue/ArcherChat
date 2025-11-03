# Future Improvements

This document tracks planned enhancements and known issues that need improvement.

---

## High Priority

### None currently

---

## Medium Priority

### None currently

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

**Last Updated**: November 2, 2025
**Maintained By**: Archer & Claude Code
