# Future Improvements

This document tracks planned enhancements and known issues that need improvement.

---

## High Priority

### 1. Image-to-Image Generation

**Description**: Enable users to upload one or more images and use them as reference/basis for generating new images. This includes image editing, style transfer, variations, and modifications.

**Current Behavior**:
- Image generation only accepts text prompts
- Users cannot upload reference images
- No image editing or modification capabilities
- File upload exists but not connected to image generation

**Proposed Feature**:
```
User uploads image(s) + Text prompt → Image Generation Tool → Modified/New Image
```

**Use Cases**:
1. **Style Transfer**: Upload a photo, ask to make it look like a painting
2. **Image Editing**: Upload image, ask to change specific elements
3. **Variations**: Upload image, generate similar variations
4. **Background Removal/Replacement**: Upload image, modify background
5. **Object Addition/Removal**: Upload image, add or remove objects
6. **Image Enhancement**: Upscale, colorize, restore old photos

**Example Interactions**:
- "Make this photo look like a Van Gogh painting" + [user photo]
- "Remove the background from this image" + [product photo]
- "Change the sunset to a sunrise" + [landscape photo]
- "Generate 3 variations of this design" + [logo image]

**Technical Requirements**:
1. Extend `image_generate` tool to accept image files as parameter
2. Pass uploaded images to Gemini IMAGE model via multimodal API
3. Update prompt enhancer to handle image-based prompts
4. Ensure base64 images are NOT included in conversation history (already implemented)
5. Add UI indicator for image-to-image vs text-to-image mode

**Implementation Plan**:
1. Add `referenceImages` parameter to image-generate tool
2. Modify `ToolParameter` type to support file attachments
3. Update agent to pass files to tools via ToolContext
4. Enhance prompt builder to include image descriptions
5. Test with various image formats (PNG, JPEG, WebP)

**Files to Modify**:
- `src/lib/agent/tools/image-generate.ts` - Add image file parameters
- `src/types/agent.ts` - Extend ToolParameter for file support
- `src/lib/agent/core/agent.ts` - Pass files to tools
- `src/lib/image/prompt-enhancer.ts` - Handle image-based prompts
- `src/components/chat/ChatInput.tsx` - UI for image upload workflow

**Estimated Effort**: 4-6 hours

**Cost Impact**: Similar to text-to-image (~$0.000002 per generation)

**Priority Rationale**: Medium priority - enhances creative capabilities significantly, but text-to-image covers most basic use cases.

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

**Last Updated**: November 22, 2025
**Maintained By**: Archer & Claude Code
