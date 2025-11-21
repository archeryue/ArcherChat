# Future Improvements

This document tracks planned enhancements and known issues that need improvement.

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

## Low Priority

### 1. Notion-like Whim Editing Experience - Phase 2 Enhancements

**Description**: Add advanced Notion-like features to the TipTap editor. Phase 1 (LaTeX, code highlighting, tables, images) is already complete.

**Current State**:
- ✅ TipTap WYSIWYG editor implemented
- ✅ LaTeX math support (inline and block)
- ✅ Syntax-highlighted code blocks
- ✅ Table creation and editing
- ✅ Image support
- ✅ Basic formatting (bold, italic, headings, lists)

**Phase 2 Enhancements** (Nice-to-have):
1. **Slash Commands**
   - Type `/` to insert blocks (heading, list, code, table, etc.)
   - Searchable command palette

2. **Drag & Drop Blocks**
   - Reorder paragraphs, headings, lists by dragging
   - Visual drop indicators

3. **Video Embedding**
   - Support YouTube, Vimeo URLs
   - Responsive embeds

4. **Enhanced Code Blocks**
   - Line numbers
   - Copy button
   - Language badge

**Benefits**:
- Enhanced user experience with Notion-like polish
- Faster content organization with drag & drop
- Quick formatting with slash commands

**Estimated Effort**: 4-6 hours

**Cost Impact**: None (all client-side)

**Priority Rationale**:
This is LOW PRIORITY because Phase 1 already provides core functionality. These are polish features that can be added later.

---

**Last Updated**: November 21, 2025
**Maintained By**: Archer & Claude Code
