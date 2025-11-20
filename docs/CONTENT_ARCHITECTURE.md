# Content Architecture: Chat vs Whim

This document explains how WhimCraft handles content formatting, storage, conversion, and rendering across the Chat and Whim systems.

## Table of Contents

1. [Overview](#overview)
2. [Content Formats](#content-formats)
3. [Storage Layer](#storage-layer)
4. [Display Systems](#display-systems)
5. [Conversion Pipeline](#conversion-pipeline)
6. [File References](#file-references)
7. [Future Improvements](#future-improvements)

---

## Overview

WhimCraft uses different content formats optimized for each context:

- **Chat Page**: Markdown messages with read-only rendering (LaTeX, code highlighting)
- **Whim Page**: **TipTap JSON blocks** with WYSIWYG editing (new format as of 2025-11-20)

```
┌─────────────────────────────────────────────────────────────┐
│              Chat: MARKDOWN (messages)                       │
│              Whim: JSON BLOCKS (TipTap format)              │
│                   Stored in Firestore                       │
└────────────┬────────────────────────────────┬───────────────┘
             │                                │
             ▼                                ▼
    ┌────────────────┐              ┌──────────────────┐
    │   Chat Page    │              │    Whim Page     │
    │  ReactMarkdown │              │  TipTap Editor   │
    │   (Read-only)  │              │   (Editable)     │
    └────────────────┘              └──────────────────┘
```

**Migration Note**: As of 2025-11-20, all whims use JSON blocks. The `content` field (markdown) is preserved for backward compatibility but is no longer written to for new whims.

---

## Content Formats

### Markdown (Primary Format)

**What it is**: Plain text with formatting syntax (headings, lists, code blocks, LaTeX, etc.)

**Used for**:
- Storing messages in Firestore
- Storing whim content in Firestore
- API data transfer
- Conversion between systems

**Example**:
```markdown
## User

How do I calculate the derivative of x²?

---

## AI

The derivative of $x^2$ is $2x$.

Here's the code in Python:

```python
def derivative(x):
    return 2 * x
```
---
```

### TipTap JSON Blocks (Whim Storage Format)

**What it is**: Structured JSON representing document content as nested blocks (based on ProseMirror's document model)

**Used for**:
- Primary storage format for whims (as of 2025-11-20)
- TipTap editor native format
- Notion-like block-based editing

**Structure**:
```typescript
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Plain text" },
        {
          "type": "text",
          "marks": [{ "type": "bold" }],
          "text": "Bold text"
        }
      ]
    },
    {
      "type": "heading",
      "attrs": { "level": 2 },
      "content": [
        { "type": "text", "text": "Heading" }
      ]
    },
    {
      "type": "codeBlock",
      "attrs": { "language": "python" },
      "content": [
        { "type": "text", "text": "def hello():\n    print('world')" }
      ]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                { "type": "text", "text": "List item" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

**Node Types**:
- **Blocks**: `paragraph`, `heading`, `codeBlock`, `bulletList`, `orderedList`, `listItem`, `blockquote`
- **Inline**: `text` (with optional `marks`)
- **Marks**: `bold`, `italic`, `code`, `strike`, `link`

**Attributes**:
- `heading`: `{ level: 1-6 }`
- `codeBlock`: `{ language: string | null }`
- `link`: `{ href: string }`

**Key Benefits**:
- ✅ **Block-level operations**: Move, delete, duplicate blocks easily
- ✅ **Type safety**: Each node has a defined structure
- ✅ **Extensible**: Custom block types and marks
- ✅ **Collaborative editing**: Operational Transform (OT) compatible
- ✅ **Notion-like UX**: Natural foundation for slash commands, drag-and-drop

**Conversion libraries**:
- `@tiptap/html/server`: Markdown → HTML → JSON blocks (server-side, used in migration)
- `marked`: Markdown → HTML (intermediate step)

---

## Storage Layer

### Firestore Structure

#### Conversations Collection

```typescript
conversations/{conversationId}
├── id: string
├── user_id: string
├── title: string
├── created_at: Timestamp
├── updated_at: Timestamp
└── messages/{messageId}
    ├── id: string
    ├── role: "user" | "assistant"
    ├── content: string  // ⬅️ MARKDOWN
    ├── created_at: Timestamp
    ├── files?: FileAttachment[]
    ├── image_url?: string
    ├── image_data?: string
    └── progressEvents?: ProgressEvent[]
```

#### Whims Collection

```typescript
whims/{whimId}
├── id: string
├── userId: string
├── title: string
├── blocks: JSONContent  // ⬅️ TIPTAP JSON BLOCKS (primary, new format)
├── content?: string     // ⬅️ MARKDOWN (legacy, kept for backward compatibility)
├── folderId?: string
├── conversationId?: string  // Reference to source conversation
├── createdAt: Timestamp
└── updatedAt: Timestamp
```

**Key insights**:
- **Chat messages**: Stored as markdown strings (simple, AI-friendly)
- **Whims**: Stored as TipTap JSON blocks (rich editing, Notion-like UX)
- **Migration**: All existing whims migrated to JSON blocks (2025-11-20)
- **Backward compatibility**: `content` field preserved but no longer written to

---

## Display Systems

### 1. Chat Page (Read-only Markdown)

**Component**: `src/components/chat/ChatMessage.tsx`

#### Rendering Pipeline

```
Message.content (markdown)
    ↓
ReactMarkdown
    ↓
Remark Plugins (parsing)
├── remarkGfm (GitHub Flavored Markdown)
└── remarkMath (LaTeX math support)
    ↓
Rehype Plugins (HTML transformation)
├── rehypeKatex (render LaTeX to visual math)
└── rehypeHighlight (syntax highlighting)
    ↓
Custom Components
├── CodeBlock (with copy-to-clipboard)
└── Inline code (custom styling)
    ↓
Rendered HTML in browser
```

#### Key Features

**Libraries** (`src/components/chat/ChatMessage.tsx:4-10`):
```typescript
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";           // Tables, strikethrough, task lists
import remarkMath from "remark-math";         // LaTeX: $...$, $$...$$
import rehypeHighlight from "rehype-highlight"; // Code syntax highlighting
import rehypeKatex from "rehype-katex";       // LaTeX rendering
import "highlight.js/styles/atom-one-dark.css";
import "katex/dist/katex.min.css";
```

**Markdown rendering** (lines 105-131):
```typescript
<ReactMarkdown
  remarkPlugins={[remarkGfm, remarkMath]}
  rehypePlugins={[rehypeKatex, rehypeHighlight]}
  components={{
    code({ className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || "");
      const inline = !match;
      return !inline ? (
        <code className={className} {...props}>{children}</code>
      ) : (
        <code className="bg-slate-100 text-slate-800 rounded px-1.5 py-0.5">
          {children}
        </code>
      );
    },
    pre({ children }) {
      return <CodeBlock>{children}</CodeBlock>;
    },
  }}
>
  {message.content}
</ReactMarkdown>
```

**Supported markdown features**:
- ✅ Headers (`#`, `##`, `###`)
- ✅ Bold (`**text**`), italic (`*text*`)
- ✅ Lists (ordered, unordered)
- ✅ Code blocks with syntax highlighting
- ✅ Inline code
- ✅ Tables (GFM)
- ✅ LaTeX math: `$inline$` and `$$block$$`
- ✅ Strikethrough (`~~text~~`)
- ✅ Task lists (`- [ ]`, `- [x]`)
- ✅ Horizontal rules (`---`)
- ✅ Links, images

**File attachments** (lines 134-172):
- Image thumbnails with preview
- PDF/document icons with metadata
- File size display

**Generated images** (lines 175-202):
- Base64 or URL rendering
- Download button overlay

---

### 2. Whim Page (Editable WYSIWYG)

**Component**: `src/components/whim/WhimEditor.tsx`

#### Rendering Pipeline (Updated 2025-11-20)

```
Whim.blocks (TipTap JSON stored in Firestore)
    ↓
TipTap Editor (loaded with JSON blocks directly)
    ↓
User edits (WYSIWYG)
    ↓
editor.getJSON() // Get current JSON state
    ↓
Save to Firestore (JSON blocks)
```

**Key change**: No more markdown ↔ HTML conversion! JSON blocks are stored and loaded directly.

#### Key Features

**Libraries** (`src/components/whim/WhimEditor.tsx:1-9`):
```typescript
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { JSONContent } from '@tiptap/core';

// No more markdown/HTML conversion libraries needed!
// JSON blocks are used directly
```

**Loading whim** (lines 35-54):
```typescript
// Get initial content from JSON blocks
const getInitialContent = (): JSONContent => {
  return whim.blocks || { type: 'doc', content: [] };
};

// Initialize TipTap editor with JSON content directly
const editor = useEditor({
  extensions: [
    StarterKit,
    Placeholder.configure({
      placeholder: 'Start writing your whim...',
    }),
  ],
  content: getInitialContent(),  // ⬅️ JSON blocks loaded directly
  editorProps: {
    attributes: {
      class: 'prose prose-sm prose-slate max-w-none focus:outline-none px-8',
    },
  },
  immediatelyRender: false,
}, []);
```

**Saving edits** (lines 126-155):
```typescript
// Deep equality check for JSON objects
function isJSONEqual(a: JSONContent, b: JSONContent): boolean {
  // Recursive comparison of JSON structure
  // (See WhimEditor.tsx:12-41 for full implementation)
}

const handleSave = useCallback(
  async (newTitle: string, newContentJSON: JSONContent, newFolderId: string) => {
    // Compare JSON structures using deep equality
    const currentBlocks = whim.blocks || { type: 'doc', content: [] };
    const blocksChanged = !isJSONEqual(currentBlocks, newContentJSON);

    // Only save if something changed
    if (newTitle === whim.title && !blocksChanged && newFolderId === (whim.folderId || '')) {
      return false;
    }

    // Save to Firestore
    await onUpdate(whim.id, {
      title: newTitle,
      blocks: newContentJSON,  // ⬅️ Store JSON blocks directly
      folderId: newFolderId || undefined,
    });

    setLastSaved(new Date());
    return true;
  },
  [whim, onUpdate]
);
```

**Editor features** (lines 224-308):
- Bold, italic buttons
- Heading (H2) toggle
- Bullet lists
- Code blocks
- Folder selection
- Auto-save (2-second debounce)

**Keyboard shortcuts** (lines 147-188):
- `Ctrl+S` / `Cmd+S`: Manual save
- `Ctrl+I` / `Cmd+I`: Open AI assistant with selected text

**Current features**:
- ✅ JSON blocks storage (Notion-like foundation)
- ✅ WYSIWYG editing with TipTap
- ✅ Basic formatting (bold, italic, headings, lists, code blocks)
- ✅ Deep equality comparison (no false auto-saves)
- ✅ Auto-save with debouncing

**Future enhancements** (see FUTURE_IMPROVEMENTS.md):
- ⏳ LaTeX/math support (`@tiptap/extension-mathematics`)
- ⏳ Syntax highlighting (`@tiptap/extension-code-block-lowlight`)
- ⏳ Table editing UI (`@tiptap/extension-table`)
- ⏳ Image insertion (`@tiptap/extension-image`)
- ⏳ Slash commands for block insertion
- ⏳ Drag-and-drop block reordering

---

## Conversion Pipeline

### Slash Commands: `/save` and `/whim`

**Trigger**: User types `/save` or `/whim` in chat

**File**: `src/app/api/chat/route.ts:136-170`

#### Step-by-step process

**1. Command detection** (lines 137-138):
```typescript
const trimmedMessage = message.trim().toLowerCase();
if (trimmedMessage === '/save' || trimmedMessage === '/whim') {
  console.log('[Chat API] Slash command detected');
```

**2. Exclude the command itself** (line 143):
```typescript
// Don't include the /save or /whim command in the whim
const messagesWithoutCommand = messages.slice(0, -1);
```

**3. Call converter** (updated 2025-11-20):
```typescript
const { title, blocks } = await convertConversationToWhimBlocks(messagesWithoutCommand);
```

**4. Save to Firestore**:
```typescript
const now = Timestamp.now();
const whimData: Omit<Whim, 'id'> = {
  userId: session.user.id,
  title,
  blocks,  // ⬅️ JSON blocks (new format)
  conversationId: conversationId,
  createdAt: now,
  updatedAt: now,
};

const whimRef = await db.collection(COLLECTIONS.WHIMS).add(whimData);
```

**5. Return confirmation** (stream response):
```typescript
return `✅ Saved conversation as whim: "${title}". View it in the Whim page.`;
```

---

### Converter Implementation

**File**: `src/lib/whim/converter.ts`

#### A. Generate Title (AI-powered)

**Function**: `generateConversationTitle()` (lines 25-83)

```typescript
export async function generateConversationTitle(messages: AIMessage[]): Promise<string> {
  // Use Gemini 2.0 Flash Lite (cost-effective)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

  // Summarize first 6 messages
  const conversationSummary = messages
    .slice(0, 6)
    .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.slice(0, 200)}`)
    .join('\n');

  const prompt = `Analyze this conversation and generate a short, concise title (4-5 words maximum).
The title should capture the main topic. Be brief and direct.
Use title case. Do not use quotes, articles (a, an, the), or special formatting.

Conversation:
${conversationSummary}

Title:`;

  const result = await model.generateContent(prompt);
  let title = result.response.text().trim();

  // Clean up
  title = title.replace(/^["']|["']$/g, '');     // Remove quotes
  title = title.replace(/^Title:\s*/i, '');      // Remove "Title:" prefix
  title = title.slice(0, 100);                   // Max 100 chars

  // Fallback if AI fails
  if (!title || title.length < 3) {
    const firstUserMessage = messages.find(m => m.role === 'user');
    title = firstUserMessage
      ? firstUserMessage.content.slice(0, 50) + '...'
      : 'Untitled Whim';
  }

  return title;
}
```

**Examples**:
- Input: "How do I sort a list in Python?"
- Output: "Sorting Lists in Python"

**Cost**: ~$0.000002 per title (using Flash Lite, ~50 tokens)

#### B. Convert to TipTap JSON Blocks

**Function**: `conversationToBlocks()` (lines 99-110)

```typescript
export function conversationToBlocks(messages: AIMessage[]): JSONContent {
  // 1. Build markdown first
  const markdown = conversationToMarkdown(messages);

  // 2. Convert markdown to HTML
  const html = marked.parse(markdown) as string;

  // 3. Parse HTML to TipTap JSON using StarterKit extensions
  const json = generateJSON(html, [StarterKit]);

  return json;
}
```

**Helper**: `conversationToMarkdown()` (lines 19-30)
```typescript
export function conversationToMarkdown(messages: AIMessage[]): string {
  let markdown = '';

  for (const message of messages) {
    const role = message.role === 'user' ? 'User' : 'AI';
    markdown += `## ${role}\n\n`;
    markdown += `${message.content}\n\n`;
    markdown += `---\n\n`;
  }

  return markdown.trim();
}
```

**Example JSON output**:
```json
{
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": { "level": 2 },
      "content": [{ "type": "text", "text": "User" }]
    },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "How do I calculate derivatives in calculus?" }
      ]
    },
    {
      "type": "horizontalRule"
    },
    {
      "type": "heading",
      "attrs": { "level": 2 },
      "content": [{ "type": "text", "text": "AI" }]
    },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "The derivative of a function..." }
      ]
    }
  ]
}
```

#### C. Main Converter (Updated 2025-11-20)

**Function**: `convertConversationToWhimBlocks()` (lines 131-141)

```typescript
export async function convertConversationToWhimBlocks(messages: AIMessage[]): Promise<{
  title: string;
  blocks: JSONContent;
}> {
  // Run in parallel for performance
  const [title, blocks] = await Promise.all([
    generateConversationTitle(messages),
    Promise.resolve(conversationToBlocks(messages))
  ]);

  return { title, blocks };
}
```

**Note**: The old `convertConversationToWhim()` function (returns markdown) is deprecated but kept for backward compatibility.

---

## File References

### Chat System

| Component | Path | Purpose |
|-----------|------|---------|
| Chat Page | `src/app/chat/page.tsx` | Main chat UI, message streaming |
| Chat Message | `src/components/chat/ChatMessage.tsx` | Markdown rendering with ReactMarkdown |
| Chat Input | `src/components/chat/ChatInput.tsx` | Message input with file upload |
| Chat API | `src/app/api/chat/route.ts` | Message processing, slash commands |

### Whim System

| Component | Path | Purpose |
|-----------|------|---------|
| Whim Page | `src/app/whim/page.tsx` | Main whim UI, state management |
| Whim Editor | `src/components/whim/WhimEditor.tsx` | TipTap editor, markdown ↔ HTML |
| Whim Sidebar | `src/components/whim/WhimSidebar.tsx` | Whim list, folder management |
| AI Chat Sidebar | `src/components/whim/AIChatSidebar.tsx` | AI assistant for whim editing |
| Whim API | `src/app/api/whims/route.ts` | CRUD operations |

### Conversion

| Component | Path | Purpose |
|-----------|------|---------|
| Converter | `src/lib/whim/converter.ts` | Conversation → Whim conversion |
| Whim Assistant | `src/lib/whim-assistant/prompts.ts` | AI assistant system prompts |

### Types

| File | Path | Purpose |
|------|------|---------|
| Whim Types | `src/types/whim.ts` | Whim, Folder interfaces |
| AI Provider Types | `src/types/ai-providers.ts` | AIMessage interface |
| File Types | `src/types/file.ts` | FileAttachment interface |

### Migration Scripts (2025-11-20)

| Script | Path | Purpose |
|--------|------|---------|
| Migration | `scripts/migrate-whims-to-blocks.ts` | One-time migration: markdown → JSON blocks |
| Verification | `scripts/verify-whim-migration.ts` | Verify migration status |

**Migration details**:
- Converted 13 whims from markdown to JSON blocks
- Preserved `content` field for rollback safety
- Used `@tiptap/html/server` for server-side conversion
- Can be run multiple times (idempotent)

---

## Future Improvements

### Whim Editor Enhancement Opportunities

**Current pain points**:
1. ❌ No LaTeX/math support (Chat has this via KaTeX)
2. ❌ No syntax highlighting in code blocks (Chat has this via highlight.js)
3. ❌ Limited markdown feature parity with Chat
4. ❌ No image insertion/upload
5. ❌ No table editing UI
6. ❌ Conversion quality issues (HTML → Markdown can lose formatting)

**Potential solutions**:

#### Option A: Enhance TipTap with More Extensions
**Pros**: Keep WYSIWYG, maintain current UX
**Cons**: Complex to implement LaTeX, syntax highlighting

**Required TipTap extensions**:
- `@tiptap/extension-mathematics` (KaTeX)
- `@tiptap/extension-code-block-lowlight` (syntax highlighting)
- `@tiptap/extension-table` (table editing)
- `@tiptap/extension-image` (image insertion)

**Packages to add**:
```bash
npm install @tiptap/extension-mathematics @tiptap/extension-code-block-lowlight lowlight katex
npm install @tiptap/extension-table @tiptap/extension-image
```

**Estimated effort**: Medium-High (need to configure each extension, test markdown conversion)

---

#### Option B: Switch to Dual-Mode Editor (WYSIWYG ↔ Markdown)
**Pros**: Better markdown support, user control
**Cons**: More complex UI, learning curve

**Potential libraries**:
- `@uiw/react-md-editor` (split-view editor)
- `react-markdown-editor-lite` (dual-mode)
- `milkdown` (WYSIWYG + markdown source)

**Estimated effort**: High (requires major refactor)

---

#### Option C: Keep Current System, Add Preview Mode
**Pros**: Low effort, safe incremental improvement
**Cons**: Doesn't solve core editing limitations

**Implementation**:
- Add "Preview" tab that renders markdown with ReactMarkdown
- Same rendering as Chat (full LaTeX, syntax highlighting)
- Switch between Edit (TipTap) and Preview (ReactMarkdown)

**Estimated effort**: Low

---

#### Option D: Use Same ReactMarkdown + Textarea (Hybrid)
**Pros**: Consistent with Chat, simple, predictable
**Cons**: Less user-friendly, no formatting buttons

**Implementation**:
- Replace TipTap with large `<textarea>` for raw markdown editing
- Live preview panel below using ReactMarkdown
- Optionally add formatting toolbar that inserts markdown syntax

**Estimated effort**: Low-Medium

---

### Recommended Approach

**Phase 1 (Quick Win)**: Option C - Add preview mode
- Low risk, immediate value
- Users can see how whim will render with full features
- Keep TipTap for basic editing

**Phase 2 (Medium-term)**: Option A - Enhance TipTap
- Add most critical extensions: math, syntax highlighting
- Improve markdown conversion quality
- Test thoroughly with existing whims

**Phase 3 (Long-term)**: Evaluate Option B based on user feedback
- If users need advanced markdown features, consider dual-mode
- Otherwise, stick with enhanced TipTap

---

## Summary

### Content Format Strategy (Updated 2025-11-20)

```
┌──────────────────────────────────────────────────────────────┐
│   Chat: MARKDOWN (simple, AI-friendly)                      │
│   Whim: JSON BLOCKS (rich editing, Notion-like)             │
│                                                              │
│  ✅ Optimized for each use case                              │
│  ✅ TipTap JSON blocks = Extensible, block-based editing     │
│  ✅ Future-proof (supports custom extensions)                │
│  ✅ Collaborative editing ready (with Y.js)                  │
└──────────────────────────────────────────────────────────────┘
```

### Display Strategy

| System | Storage Format | Library | Mode | Features |
|--------|---------------|---------|------|----------|
| **Chat** | Markdown | ReactMarkdown | Read-only | ✅ Full markdown, LaTeX, code highlighting |
| **Whim** | JSON Blocks | TipTap | Editable | ✅ Block-based WYSIWYG, extensible |

### Key Takeaways

1. **Different formats for different needs**:
   - Chat: Markdown (AI-generated content, read-only)
   - Whim: JSON blocks (user-edited content, Notion-like)

2. **JSON blocks benefits**:
   - ✅ No conversion overhead (direct load/save)
   - ✅ Block-level operations (move, delete, duplicate)
   - ✅ Foundation for Notion-like features (slash commands, drag-drop)
   - ✅ Type-safe structure
   - ✅ Extensible (custom blocks and marks)

3. **Migration complete**:
   - All 13 existing whims migrated to JSON blocks
   - Legacy `content` field preserved for safety
   - New whims only save JSON blocks

4. **Future path**:
   - Add TipTap extensions (LaTeX, syntax highlighting, tables, images)
   - Implement Notion-like UX (slash commands, drag handles)
   - See `docs/FUTURE_IMPROVEMENTS.md` for roadmap

---

**Last Updated**: 2025-11-20
**Migration Date**: 2025-11-20 (Markdown → JSON blocks)
**Next Review**: After implementing Phase 1 extensions (LaTeX, syntax highlighting)
