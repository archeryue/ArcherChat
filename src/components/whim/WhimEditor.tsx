'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useState, useCallback } from 'react';
import { WhimClient, FolderClient } from '@/types/whim';
import { JSONContent } from '@tiptap/core';
import { MoreVertical, Trash2 } from 'lucide-react';

// Deep equality check for JSON objects
function isJSONEqual(a: JSONContent, b: JSONContent): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;

    const valA = (a as any)[key];
    const valB = (b as any)[key];

    if (Array.isArray(valA) && Array.isArray(valB)) {
      if (valA.length !== valB.length) return false;
      for (let i = 0; i < valA.length; i++) {
        if (!isJSONEqual(valA[i], valB[i])) return false;
      }
    } else if (typeof valA === 'object' && typeof valB === 'object') {
      if (!isJSONEqual(valA, valB)) return false;
    } else if (valA !== valB) {
      return false;
    }
  }

  return true;
}

interface WhimEditorProps {
  whim: WhimClient;
  folders: FolderClient[];
  onUpdate: (whimId: string, updates: { title?: string; content?: string; folderId?: string }) => void;
  onDelete: (whimId: string) => void;
  onOpenAIChat?: (selectedText?: string, range?: { start: number; end: number }) => void;
}

export function WhimEditor({
  whim,
  folders,
  onUpdate,
  onDelete,
  onOpenAIChat,
}: WhimEditorProps) {
  const [title, setTitle] = useState(whim.title);
  const [selectedFolderId, setSelectedFolderId] = useState(whim.folderId || '');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [noChanges, setNoChanges] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Get initial content from blocks (all whims have been migrated)
  const getInitialContent = (): JSONContent => {
    return whim.blocks || { type: 'doc', content: [] };
  };

  // Initialize editor with JSON content
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start writing your whim...',
      }),
    ],
    content: getInitialContent(),
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

    const editorJSON = editor.getJSON();
    const handleUpdate = () => {
      handleSave(title, editorJSON, selectedFolderId);
    };

    const timeoutId = setTimeout(handleUpdate, 2000); // Auto-save after 2 seconds of inactivity

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, title, selectedFolderId, isInitialized]);

  // Update editor content when whim changes
  useEffect(() => {
    if (editor) {
      const newContent = getInitialContent();
      // Only update if content actually changed (avoid infinite loops)
      const currentJSON = JSON.stringify(editor.getJSON());
      const newJSON = JSON.stringify(newContent);
      if (currentJSON !== newJSON) {
        editor.commands.setContent(newContent);
      }
    }
    setTitle(whim.title);
    setSelectedFolderId(whim.folderId || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whim.id, whim.title, whim.folderId, editor]);

  const handleSave = useCallback(
    async (newTitle: string, newContentJSON: JSONContent, newFolderId: string): Promise<boolean> => {
      // Only save if something changed
      const currentBlocks = whim.blocks || { type: 'doc', content: [] };
      const blocksChanged = !isJSONEqual(currentBlocks, newContentJSON);

      if (
        newTitle === whim.title &&
        !blocksChanged &&
        newFolderId === (whim.folderId || '')
      ) {
        return false;
      }

      setIsSaving(true);
      try {
        await onUpdate(whim.id, {
          title: newTitle,
          blocks: newContentJSON, // Save JSON blocks only (no markdown content)
          folderId: newFolderId || undefined,
        });
        setLastSaved(new Date());
        return true;
      } catch (err) {
        console.error('Error saving whim:', err);
        return false;
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
      handleSave(title, editor.getJSON(), selectedFolderId);
    }
  };

  const handleFolderChange = (folderId: string) => {
    setSelectedFolderId(folderId);
    if (editor) {
      handleSave(title, editor.getJSON(), folderId);
    }
  };

  // Keyboard shortcut: Ctrl+S / Cmd+S to save
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (editor) {
          const saved = await handleSave(title, editor.getJSON(), selectedFolderId);
          if (!saved) {
            // Show "No changes" briefly
            setNoChanges(true);
            setTimeout(() => setNoChanges(false), 1500);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editor, title, selectedFolderId, handleSave]);

  // Keyboard shortcut: Ctrl+I / Cmd+I to open AI assistant
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        if (editor && onOpenAIChat) {
          const { from, to, empty } = editor.state.selection;
          if (!empty) {
            // Get selected text
            const selectedText = editor.state.doc.textBetween(from, to, ' ');
            onOpenAIChat(selectedText, { start: from, end: to });
          } else {
            // Open with full document context
            onOpenAIChat();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editor, onOpenAIChat]);

  if (!editor) {
    return <div className="flex-1 flex items-center justify-center">Loading editor...</div>;
  }

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden relative">
      {/* Title Header */}
      <div className="px-6 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between gap-4">
          {/* Title Input */}
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              onBlur={handleTitleBlur}
              className="w-full text-2xl font-semibold text-slate-900 focus:outline-none bg-transparent p-0 m-0 border-0"
              placeholder="Untitled"
            />
            <div className="flex items-center gap-2 text-xs text-slate-600 mt-1">
              <span>
                Created: {new Date(whim.createdAt).toLocaleDateString()} • Updated:{' '}
                {new Date(whim.updatedAt).toLocaleDateString()}
              </span>
              {/* Save Status */}
              {isSaving ? (
                <>
                  <span>•</span>
                  <span className="text-slate-500">Saving...</span>
                </>
              ) : noChanges ? (
                <>
                  <span>•</span>
                  <span className="text-slate-500">No changes</span>
                </>
              ) : lastSaved ? (
                <>
                  <span>•</span>
                  <span className="text-green-600">✓ Saved</span>
                </>
              ) : null}
            </div>
          </div>

          {/* Document Controls */}
          <div className="flex items-center gap-2 flex-shrink-0 select-none">
            {/* Folder Selection */}
            <select
              value={selectedFolderId}
              onChange={(e) => handleFolderChange(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white hover:bg-slate-50 transition-colors cursor-pointer select-none"
            >
              <option value="">Uncategorized</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>

            {/* Three-dot Menu */}
            <div className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer select-none"
                title="More options"
              >
                <MoreVertical className="w-5 h-5 text-slate-600" />
              </button>

              {/* Dropdown Menu */}
              {showDropdown && (
                <>
                  {/* Backdrop to close dropdown */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowDropdown(false)}
                  />
                  {/* Dropdown */}
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20">
                    <button
                      onClick={() => {
                        setShowDropdown(false);
                        onDelete(whim.id);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
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
        </div>
      </div>
    </div>
  );
}