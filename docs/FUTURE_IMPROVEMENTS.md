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

### 3. Notion-like Whim Editing Experience

**Description**: Enhance the Whim editing page with a modern, Notion-like rich text editing experience. Replace the current basic textarea with a sophisticated block-based editor that provides better formatting, organization, and visual appeal.

**Current Behavior**:
- Whim editing uses a simple textarea
- Basic markdown support for formatting
- Limited visual feedback during editing
- No block-based content organization

**Proposed Enhancement**:
- **Block-based editing**: Each paragraph, heading, list item is a draggable block
- **Slash commands**: Type `/` to insert headings, lists, code blocks, etc.
- **Rich formatting toolbar**: Bold, italic, code, links with keyboard shortcuts
- **Inline formatting**: Click to format, see results immediately
- **Drag & drop**: Reorder content blocks by dragging
- **Better typography**: Clean spacing, modern fonts, visual hierarchy
- **Smooth animations**: Fade-ins, hover effects, smooth transitions

**Benefits**:
- Professional, polished editing experience
- Faster content creation with slash commands
- Better content organization with blocks
- More intuitive for users familiar with Notion/modern editors
- Encourages longer, better-structured Whims

**Technical Approach**:

**Option 1: Lexical Editor** (Recommended - Meta's framework)
```typescript
// Modern, extensible, React-friendly
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
```
- Pros: Lightweight, excellent React support, active maintenance
- Cons: Newer framework, smaller ecosystem

**Option 2: Tiptap Editor** (Popular choice)
```typescript
// Built on ProseMirror, rich plugin ecosystem
import { useEditor, EditorContent } from '@tiptap/react';
```
- Pros: Mature, many plugins, great docs
- Cons: Slightly heavier bundle size

**Option 3: Slate.js** (Fully customizable)
- Pros: Maximum control, highly customizable
- Cons: More complex, requires more setup

**Recommendation**: Use **Lexical** for modern React integration and Meta's long-term support.

**Implementation Plan**:
1. Install Lexical editor and plugins
2. Create `WhimEditor` component replacing current textarea
3. Add slash command menu for quick formatting
4. Implement drag-and-drop block reordering
5. Add formatting toolbar (sticky on scroll)
6. Update Whim save/load to handle rich content
7. Add keyboard shortcuts (Cmd+B for bold, etc.)
8. Style to match Notion's clean aesthetic

**Files to Modify**:
- `src/app/whim/page.tsx` - Replace textarea with rich editor
- New file: `src/components/whim/WhimEditor.tsx` - Lexical editor component
- New file: `src/components/whim/SlashCommandMenu.tsx` - Slash commands
- `src/types/index.ts` - Update Whim content type if needed
- `src/app/api/whims/route.ts` - Handle rich content format

**UI Components Needed**:
- Block-based editor canvas
- Floating formatting toolbar
- Slash command popup menu
- Drag handle for blocks
- Block type selector (heading, list, code, etc.)

**Estimated Effort**: 6-8 hours

**References**:
- Lexical docs: https://lexical.dev/
- Notion-like editor tutorial: https://lexical.dev/docs/getting-started/tutorials

---

**Last Updated**: November 19, 2025
**Maintained By**: Archer & Claude Code
