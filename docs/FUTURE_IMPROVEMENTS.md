# Future Improvements

This document tracks planned enhancements and known issues that need improvement.

---

## High Priority

### 1. Notion-like Whim Editing Experience with TipTap Extensions

**Description**: Enhance the existing TipTap editor with advanced extensions to create a modern, Notion-like rich text editing experience. Add support for LaTeX math, syntax-highlighted code blocks, images, videos, and tables to achieve feature parity with the Chat page and provide a professional editing experience.

**Current State**:
- ✅ TipTap WYSIWYG editor already implemented (`src/components/whim/WhimEditor.tsx`)
- ✅ Basic formatting: Bold, italic, headings (H2), bullet lists, code blocks
- ✅ Floating toolbar with save status and folder selection
- ✅ Auto-save (2-second debounce)
- ✅ Keyboard shortcuts (Ctrl+S save, Ctrl+I AI assistant)
- ✅ Markdown storage (HTML ↔ Markdown conversion with marked/turndown)

**Current Gaps** (compared to Chat page):
- ❌ No LaTeX/math rendering ($inline$ and $$block$$ formulas)
- ❌ No syntax highlighting in code blocks (Chat has highlight.js)
- ❌ No table creation/editing
- ❌ No image insertion/upload
- ❌ No video embedding
- ❌ Limited markdown feature parity with Chat
- ❌ No drag-and-drop block reordering
- ❌ No slash commands for quick formatting

**Proposed Enhancement**:
Extend TipTap with professional plugins to match Notion's editing experience:

**Phase 1: Feature Parity with Chat (Critical)**
1. **LaTeX Math Support**
   - Extension: `@tiptap/extension-mathematics`
   - Renders: `$E = mc^2$` (inline) and `$$...$$` (block)
   - Uses KaTeX (same as Chat page)

2. **Syntax Highlighting**
   - Extension: `@tiptap/extension-code-block-lowlight`
   - Language selection dropdown
   - Uses Lowlight (highlight.js wrapper)

3. **Table Editing**
   - Extension: `@tiptap/extension-table` + related packages
   - Visual table creation and editing
   - Column/row add/delete controls

4. **Image Support**
   - Extension: `@tiptap/extension-image`
   - Drag-and-drop image upload
   - Resize handles
   - Alt text support

**Phase 2: Notion-like Enhancements**
5. **Slash Commands**
   - Extension: Custom or `tiptap-extension-slash-command`
   - Type `/` to insert blocks (heading, list, code, table, etc.)
   - Searchable command palette

6. **Drag & Drop Blocks**
   - Extension: `@tiptap/extension-drag-handle`
   - Reorder paragraphs, headings, lists by dragging
   - Visual drop indicators

7. **Video Embedding**
   - Extension: Custom or use iframe/embed extensions
   - Support YouTube, Vimeo URLs
   - Responsive embeds

8. **Enhanced Code Blocks**
   - Line numbers
   - Copy button
   - Language badge

**Benefits**:
- ✅ **Feature parity**: Whim editor matches Chat rendering capabilities
- ✅ **Professional experience**: Notion-like polish and usability
- ✅ **Better content creation**: LaTeX formulas, syntax-highlighted code, rich media
- ✅ **Consistent UX**: Same markdown features work in both Chat and Whim
- ✅ **Encourages usage**: Users more likely to save complex conversations as whims

**Technical Approach**:

**Stick with TipTap** (already implemented, proven choice):
```typescript
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mathematics from '@tiptap/extension-mathematics';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import { lowlight } from 'lowlight';
import 'katex/dist/katex.min.css';

const editor = useEditor({
  extensions: [
    StarterKit,
    Mathematics.configure({
      katexOptions: {
        throwOnError: false,
      },
    }),
    CodeBlockLowlight.configure({
      lowlight,
    }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
    Image.configure({
      inline: true,
      allowBase64: true,
    }),
    // ... more extensions
  ],
});
```

**Packages to Install**:
```bash
npm install @tiptap/extension-mathematics katex
npm install @tiptap/extension-code-block-lowlight lowlight
npm install @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header
npm install @tiptap/extension-image
```

**Implementation Plan**:

**Phase 1 (Critical - 4-6 hours)**:
1. ✅ Read `docs/CONTENT_ARCHITECTURE.md` for current architecture
2. Install TipTap extensions for math, code, tables, images
3. Update `src/components/whim/WhimEditor.tsx`:
   - Add Mathematics extension with KaTeX
   - Add CodeBlockLowlight with language selector
   - Add Table extensions with insert/edit controls
   - Add Image extension with upload/paste support
4. Update toolbar with new formatting buttons:
   - Insert table button
   - Insert image button
   - Math formula button (inline/block)
5. Test markdown conversion (ensure extensions work with marked/turndown)
6. Add CSS for KaTeX and code highlighting
7. Test with complex content (formulas, code, tables)

**Phase 2 (Enhancements - 4-6 hours)**:
1. Add slash command menu component
2. Implement drag-and-drop block reordering
3. Add video embedding support
4. Enhance code blocks (line numbers, copy button)
5. Polish animations and transitions
6. Add keyboard shortcuts for new features

**Files to Modify**:

**Phase 1**:
- `src/components/whim/WhimEditor.tsx` - Add extensions and toolbar buttons
- `package.json` - Add new TipTap extension dependencies
- `src/app/whim/page.tsx` - Pass additional props if needed
- Update styles for math/code rendering

**Phase 2**:
- New file: `src/components/whim/SlashCommandMenu.tsx` - Slash command palette
- New file: `src/components/whim/BlockDragHandle.tsx` - Drag handle component
- `src/components/whim/WhimEditor.tsx` - Integrate new components

**Testing Checklist**:
- [ ] LaTeX inline formulas render correctly
- [ ] LaTeX block formulas render correctly
- [ ] Code blocks show syntax highlighting
- [ ] Language selector works for code blocks
- [ ] Tables can be created and edited
- [ ] Images can be uploaded/pasted
- [ ] Markdown conversion preserves all features
- [ ] Saved whims display correctly when reloaded
- [ ] Auto-save works with new content types
- [ ] Slash commands trigger correctly
- [ ] Blocks can be dragged and reordered
- [ ] Keyboard shortcuts work

**Estimated Effort**:
- Phase 1: 4-6 hours (critical features)
- Phase 2: 4-6 hours (Notion-like polish)
- **Total**: 8-12 hours

**Cost Impact**: None (all client-side rendering)

**References**:
- TipTap docs: https://tiptap.dev/
- Mathematics extension: https://tiptap.dev/api/extensions/mathematics
- CodeBlockLowlight: https://tiptap.dev/api/nodes/code-block-lowlight
- Table extension: https://tiptap.dev/api/nodes/table
- Image extension: https://tiptap.dev/api/nodes/image
- Current architecture: `docs/CONTENT_ARCHITECTURE.md`

**Priority Rationale**:
This is HIGH PRIORITY because:
1. Users expect feature parity between Chat and Whim
2. Currently, complex conversations with LaTeX/code can't be properly edited as whims
3. Notion-like experience significantly improves user satisfaction
4. Relatively quick implementation (TipTap already in place)
5. No additional costs (client-side only)

---

## Completed

### ✅ Rich Content Rendering in Whim AI Chat Sidebar

**Status**: ✅ **COMPLETED** (November 21, 2025)

**What Was Implemented**:
- Replaced plain text message rendering with full `ChatMessage` component (Option 1 - Reuse approach)
- Now supports LaTeX math (inline `$...$` and block `$$...$$`), syntax-highlighted code blocks, markdown tables, and text formatting
- Preserved Copy and Apply buttons for assistant messages
- Fixed 404 API errors by correcting endpoint from `/messages` to `/api/conversations/[id]`
- Prevented empty conversation creation (only creates DB records when first message is sent)

**Testing Infrastructure**:
- Created standalone test page at `/whim-sidebar-test` (no authentication required)
- Added 10 comprehensive E2E tests using Playwright (all passing):
  1. Sidebar displays with messages
  2. LaTeX inline math formulas (36 elements verified)
  3. LaTeX block/display math formulas (2 elements verified)
  4. Syntax-highlighted code blocks (9 highlighted tokens)
  5. Markdown tables (4 rows, 4 headers)
  6. Markdown text formatting (bold, italic)
  7. Copy buttons present (3 buttons)
  8. Apply buttons present (3 buttons)
  9. Copy button functionality (shows "Copied" feedback)
  10. Comprehensive test (all 4 feature categories working)

**Files Changed**:
- `src/components/whim/AIChatSidebar.tsx` - Rich content rendering + API fixes + prevent empty conversations
- `src/app/whim-sidebar-test/page.tsx` - Test page with mocked data
- `e2e/sidebar-rich-content.e2e.ts` - 10 E2E tests (100% passing in 50s)
- `src/app/api/admin/cleanup-empty-conversations/route.ts` - Cleanup API for empty conversations
- `scripts/cleanup-empty-conversations.ts` - Database maintenance script

**Actual Effort**: ~2 hours (estimated 1-2 hours)

**Test Results**: All 10 E2E tests passing
- LaTeX: 36 inline + 2 block formulas rendering correctly
- Code blocks: Syntax highlighting working (9 tokens highlighted)
- Markdown: Tables, bold, italic all rendering
- Buttons: Copy and Apply functionality verified
- No authentication required for tests

**Benefits Achieved**:
- ✅ Consistent UX between Chat and Whim AI assistant
- ✅ Better readability with formatted code and math formulas
- ✅ Professional experience with no rendering gaps
- ✅ Code assistance improved with syntax highlighting
- ✅ Math support for LaTeX formulas in AI responses
- ✅ Fixed annoying 404 errors in console
- ✅ Prevented database pollution with empty conversations

**Commit**: `22f3970` - feat: Add rich content rendering to AI Chat Sidebar with comprehensive E2E tests

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

**Last Updated**: November 21, 2025
**Maintained By**: Archer & Claude Code
