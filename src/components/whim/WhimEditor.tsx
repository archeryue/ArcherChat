'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useState, useCallback } from 'react';
import { Whim, Folder } from '@/types/whim';
import { marked } from 'marked';
import TurndownService from 'turndown';

// Configure marked options
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Configure turndown for HTML to markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

interface WhimEditorProps {
  whim: Whim;
  folders: Folder[];
  onUpdate: (whimId: string, updates: { title?: string; content?: string; folderId?: string }) => void;
  onDelete: (whimId: string) => void;
}

export function WhimEditor({ whim, folders, onUpdate, onDelete }: WhimEditorProps) {
  const [title, setTitle] = useState(whim.title);
  const [selectedFolderId, setSelectedFolderId] = useState(whim.folderId || '');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Convert markdown to HTML for display
  const htmlContent = marked.parse(whim.content) as string;

  // Initialize editor with HTML content
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
        class: 'prose prose-slate max-w-none focus:outline-none px-6 py-4',
      },
    },
    immediatelyRender: false,
  }, []);

  // Mark as initialized after first render
  useEffect(() => {
    if (editor) {
      setIsInitialized(true);
    }
  }, [editor]);

  // Auto-save when content changes (debounced)
  useEffect(() => {
    if (!editor || !isInitialized) return;

    const editorHTML = editor.getHTML();
    const handleUpdate = () => {
      handleSave(title, editorHTML, selectedFolderId);
    };

    const timeoutId = setTimeout(handleUpdate, 2000); // Auto-save after 2 seconds of inactivity

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, title, selectedFolderId, isInitialized]);

  // Update editor content when whim changes
  useEffect(() => {
    if (editor && whim.content !== editor.getHTML()) {
      const newHtmlContent = marked.parse(whim.content) as string;
      editor.commands.setContent(newHtmlContent);
    }
    setTitle(whim.title);
    setSelectedFolderId(whim.folderId || '');
  }, [whim.id, whim.content, whim.title, whim.folderId, editor]);

  const handleSave = useCallback(
    async (newTitle: string, newContentHTML: string, newFolderId: string) => {
      // Convert HTML back to markdown before saving
      const newContentMarkdown = turndownService.turndown(newContentHTML);

      // Only save if something changed
      if (
        newTitle === whim.title &&
        newContentMarkdown === whim.content &&
        newFolderId === (whim.folderId || '')
      ) {
        return;
      }

      setIsSaving(true);
      try {
        await onUpdate(whim.id, {
          title: newTitle,
          content: newContentMarkdown,
          folderId: newFolderId || undefined,
        });
        setLastSaved(new Date());
      } catch (err) {
        console.error('Error saving whim:', err);
      } finally {
        setIsSaving(false);
      }
    },
    [whim, onUpdate]
  );

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
  };

  const handleTitleBlur = () => {
    if (title !== whim.title && editor) {
      handleSave(title, editor.getHTML(), selectedFolderId);
    }
  };

  const handleFolderChange = (folderId: string) => {
    setSelectedFolderId(folderId);
    if (editor) {
      handleSave(title, editor.getHTML(), folderId);
    }
  };

  if (!editor) {
    return <div className="flex-1 flex items-center justify-center">Loading editor...</div>;
  }

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      {/* Toolbar */}
      <div className="border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          {/* Bold */}
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-2 rounded hover:bg-slate-100 ${
              editor.isActive('bold') ? 'bg-slate-200' : ''
            }`}
            title="Bold"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 12h8a4 4 0 100-8H6v8zm0 0h9a4 4 0 110 8H6v-8z"
              />
            </svg>
          </button>

          {/* Italic */}
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-2 rounded hover:bg-slate-100 ${
              editor.isActive('italic') ? 'bg-slate-200' : ''
            }`}
            title="Italic"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 20l4-16m-4 4h6m-6 8h6"
              />
            </svg>
          </button>

          {/* Heading */}
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-2 rounded hover:bg-slate-100 ${
              editor.isActive('heading', { level: 2 }) ? 'bg-slate-200' : ''
            }`}
            title="Heading"
          >
            <span className="text-sm font-semibold">H2</span>
          </button>

          {/* Bullet List */}
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-2 rounded hover:bg-slate-100 ${
              editor.isActive('bulletList') ? 'bg-slate-200' : ''
            }`}
            title="Bullet List"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          {/* Code Block */}
          <button
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={`p-2 rounded hover:bg-slate-100 ${
              editor.isActive('codeBlock') ? 'bg-slate-200' : ''
            }`}
            title="Code Block"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-4">
          {/* Folder Selection */}
          <select
            value={selectedFolderId}
            onChange={(e) => handleFolderChange(e.target.value)}
            className="px-3 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <option value="">Uncategorized</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>

          {/* Save Status */}
          {isSaving ? (
            <span className="text-xs text-slate-500">Saving...</span>
          ) : lastSaved ? (
            <span className="text-xs text-slate-500">
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          ) : null}

          {/* Delete */}
          <button
            onClick={() => onDelete(whim.id)}
            className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="px-6 py-4 border-b border-slate-200 flex-shrink-0">
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          onBlur={handleTitleBlur}
          className="w-full text-3xl font-bold text-slate-900 focus:outline-none"
          placeholder="Untitled"
        />
        <div className="text-xs text-slate-500 mt-2">
          Created: {new Date(whim.createdAt).toLocaleDateString()} • Updated:{' '}
          {new Date(whim.updatedAt).toLocaleDateString()}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}
