'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useState, useCallback } from 'react';
import { WhimClient, FolderClient } from '@/types/whim';
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
  whim: WhimClient;
  folders: FolderClient[];
  onUpdate: (whimId: string, updates: { title?: string; content?: string; folderId?: string }) => void;
  onDelete: (whimId: string) => void;
}

export function WhimEditor({
  whim,
  folders,
  onUpdate,
  onDelete,
}: WhimEditorProps) {
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
        class: 'prose prose-sm prose-slate max-w-none focus:outline-none px-8 leading-relaxed',
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
    <div className="flex-1 flex flex-col bg-white overflow-hidden relative">
      {/* Title */}
      <div className="px-6 py-3 border-b border-slate-200 bg-slate-50">
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          onBlur={handleTitleBlur}
          className="w-full text-2xl font-semibold text-slate-900 focus:outline-none bg-transparent p-0 m-0 border-0"
          placeholder="Untitled"
        />
        <div className="text-xs text-slate-600 mt-1">
          Created: {new Date(whim.createdAt).toLocaleDateString()} • Updated:{' '}
          {new Date(whim.updatedAt).toLocaleDateString()}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto bg-white relative">
        <div className="max-w-4xl mx-auto py-8 pb-24">
          <EditorContent editor={editor} className="min-h-[600px]" />
        </div>
      </div>

      {/* Floating Toolbar */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2">
        <div className="bg-white rounded-full shadow-lg border border-slate-200 px-6 py-2 flex items-center gap-3 whitespace-nowrap">
          {/* Format Buttons */}
          <div className="flex items-center gap-2">
            {/* Bold */}
            <button
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={`p-2 rounded-lg hover:bg-slate-100 transition-colors ${
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
              className={`p-2 rounded-lg hover:bg-slate-100 transition-colors ${
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

            {/* Divider */}
            <div className="w-px h-4 bg-slate-300"></div>

            {/* Heading */}
            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={`px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors ${
                editor.isActive('heading', { level: 2 }) ? 'bg-slate-200' : ''
              }`}
              title="Heading"
            >
              <span className="text-sm font-semibold">H2</span>
            </button>

            {/* Bullet List */}
            <button
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              className={`p-2 rounded-lg hover:bg-slate-100 transition-colors ${
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
              className={`p-2 rounded-lg hover:bg-slate-100 transition-colors ${
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

          {/* Divider */}
          <div className="w-px h-6 bg-slate-300"></div>

          {/* Folder Selection */}
          <select
            value={selectedFolderId}
            onChange={(e) => handleFolderChange(e.target.value)}
            className="px-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <option value="">Uncategorized</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>

          {/* Divider */}
          <div className="w-px h-6 bg-slate-300"></div>

          {/* Save Status */}
          {isSaving ? (
            <span className="text-xs text-slate-500">Saving...</span>
          ) : lastSaved ? (
            <span className="text-xs text-green-600">✓ Saved</span>
          ) : null}

          {/* Delete */}
          <button
            onClick={() => onDelete(whim.id)}
            className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}