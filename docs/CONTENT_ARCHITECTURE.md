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

WhimCraft uses **markdown as the universal source of truth** for all content, but renders it differently depending on the context:

- **Chat Page**: Read-only markdown rendering with full LaTeX and code support
- **Whim Page**: Editable WYSIWYG editor with markdown storage

```
┌─────────────────────────────────────────────────────────────┐
│                    MARKDOWN (Source of Truth)               │
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

### HTML (Intermediate Format)

**What it is**: Rich text markup language

**Used for**:
- TipTap editor internal representation
- Temporary display format (converted from markdown)

**Example**:
```html
<h2>User</h2>
<p>How do I calculate the derivative of x²?</p>
<hr />
<h2>AI</h2>
<p>The derivative of <span class="math-inline">x^2</span> is <span class="math-inline">2x</span>.</p>
```

**Conversion libraries**:
- `marked`: Markdown → HTML (parsing)
- `turndown`: HTML → Markdown (serialization)

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
├── content: string  // ⬅️ MARKDOWN
├── folderId?: string
├── conversationId?: string  // Reference to source conversation
├── createdAt: Timestamp
└── updatedAt: Timestamp
```

**Key insight**: Both collections store content as **markdown strings**, ensuring consistency and portability.

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

#### Rendering Pipeline

```
Whim.content (markdown stored in Firestore)
    ↓
marked.parse() // Markdown → HTML
    ↓
TipTap Editor (loaded with HTML)
    ↓
User edits (WYSIWYG)
    ↓
turndownService.turndown() // HTML → Markdown
    ↓
Save to Firestore (markdown)
```

#### Key Features

**Libraries** (`src/components/whim/WhimEditor.tsx:3-21`):
```typescript
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { marked } from 'marked';              // Markdown → HTML
import TurndownService from 'turndown';       // HTML → Markdown

// Configure marked
marked.setOptions({
  breaks: true,       // Treat \n as <br>
  gfm: true,         // GitHub Flavored Markdown
});

// Configure turndown
const turndownService = new TurndownService({
  headingStyle: 'atx',        // Use # for headings (not underline)
  codeBlockStyle: 'fenced',   // Use ``` for code blocks
});
```

**Loading whim** (lines 45-63):
```typescript
// 1. Convert markdown to HTML for display
const htmlContent = marked.parse(whim.content) as string;

// 2. Initialize TipTap editor with HTML
const editor = useEditor({
  extensions: [
    StarterKit,
    Placeholder.configure({
      placeholder: 'Start writing your whim...',
    }),
  ],
  content: htmlContent,
  editorProps: {
    attributes: {
      class: 'prose prose-sm prose-slate max-w-none focus:outline-none',
    },
  },
});
```

**Saving edits** (lines 97-128):
```typescript
const handleSave = async (newTitle: string, newContentHTML: string, newFolderId: string) => {
  // Convert HTML back to markdown before saving
  const newContentMarkdown = turndownService.turndown(newContentHTML);

  // Only save if something changed
  if (newTitle === whim.title && newContentMarkdown === whim.content) {
    return false;
  }

  // Save to Firestore
  await onUpdate(whim.id, {
    title: newTitle,
    content: newContentMarkdown,  // ⬅️ Store as markdown
    folderId: newFolderId || undefined,
  });

  setLastSaved(new Date());
  return true;
};
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

**Current limitations** (to be improved):
- ❌ No LaTeX/math support in editor
- ❌ No syntax highlighting in code blocks
- ❌ No table editing UI
- ❌ No image insertion
- ❌ Limited markdown feature parity with Chat

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

**3. Call converter** (line 146):
```typescript
const { title, content } = await convertConversationToWhim(messagesWithoutCommand);
```

**4. Save to Firestore** (lines 149-170):
```typescript
const now = Timestamp.now();
const whimData: Omit<Whim, 'id'> = {
  userId: session.user.id,
  title,
  content,
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

#### B. Convert to Markdown

**Function**: `conversationToMarkdown()` (lines 9-20)

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

**Example output**:
```markdown
## User

How do I calculate derivatives in calculus?

---

## AI

The derivative of a function $f(x)$ represents the rate of change...

---
```

#### C. Main Converter

**Function**: `convertConversationToWhim()` (lines 88-98)

```typescript
export async function convertConversationToWhim(messages: AIMessage[]): Promise<{
  title: string;
  content: string;
}> {
  // Run in parallel for performance
  const [title, content] = await Promise.all([
    generateConversationTitle(messages),
    Promise.resolve(conversationToMarkdown(messages))
  ]);

  return { title, content };
}
```

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

### Content Format Strategy

```
┌──────────────────────────────────────────────────────────────┐
│         MARKDOWN = Single Source of Truth                    │
│                                                              │
│  ✅ Portable across systems                                  │
│  ✅ Version control friendly                                 │
│  ✅ AI-friendly (easy to parse/generate)                     │
│  ✅ Future-proof                                             │
└──────────────────────────────────────────────────────────────┘
```

### Display Strategy

| System | Library | Mode | Features |
|--------|---------|------|----------|
| **Chat** | ReactMarkdown | Read-only | ✅ Full markdown, LaTeX, code highlighting |
| **Whim** | TipTap (HTML) | Editable | ⚠️ Basic formatting only |

### Key Takeaways

1. **Markdown everywhere**: All content stored as markdown in Firestore
2. **Different renderers**: Chat (ReactMarkdown) vs Whim (TipTap)
3. **Feature gap**: Whim editor lacks LaTeX, syntax highlighting, advanced markdown
4. **Improvement path**: Gradual enhancement starting with preview mode

---

**Last Updated**: 2025-11-20
**Next Review**: After implementing preview mode for Whim editor
