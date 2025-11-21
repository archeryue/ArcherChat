'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Mathematics } from '@tiptap/extension-mathematics';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Image } from '@tiptap/extension-image';
import { Markdown } from '@tiptap/markdown';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { common, createLowlight } from 'lowlight';
import { useEffect, useState, useCallback, useRef } from 'react';
import { WhimClient, FolderClient } from '@/types/whim';
import { JSONContent } from '@tiptap/core';
import { MoreVertical, Trash2 } from 'lucide-react';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

// Initialize lowlight with common languages
const lowlight = createLowlight(common);

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
  onUpdate: (whimId: string, updates: { title?: string; content?: string; blocks?: any; folderId?: string }) => void;
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
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [showListMenu, setShowListMenu] = useState(false);

  // Refs for click-outside detection
  const headingMenuRef = useRef<HTMLDivElement>(null);
  const listMenuRef = useRef<HTMLDivElement>(null);

  // Get initial content from blocks (all whims have been migrated)
  const getInitialContent = (): JSONContent => {
    const content = whim.blocks || { type: 'doc', content: [] };
    console.log('WhimEditor getInitialContent:', {
      hasBlocks: !!whim.blocks,
      contentType: content.type,
      contentLength: content.content?.length,
      firstItems: content.content?.slice(0, 3),
    });
    return content;
  };

  // Initialize editor empty, content set via useEffect below
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // Disable default code block (we use CodeBlockLowlight)
      }),
      Placeholder.configure({
        placeholder: 'Start writing your whim...',
      }),
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
      Markdown.configure({
        markedOptions: {
          gfm: true, // Enable GitHub Flavored Markdown (includes tables)
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
    ],
    editorProps: {
      attributes: {
        class: 'prose prose-sm prose-slate max-w-none focus:outline-none px-8 leading-relaxed',
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain');
        if (!text) return false;

        // Check if the pasted text looks like a markdown table
        const lines = text.trim().split('\n');
        const hasTableStructure = lines.length >= 2 &&
          lines[0].includes('|') &&
          lines[1].includes('|') &&
          lines[1].includes('-');

        if (hasTableStructure) {
          // Prevent default paste behavior
          event.preventDefault();

          try {
            // Use TipTap's insertContent command with markdown parsing
            const editor = (view.state as any).editor;
            if (editor && editor.commands) {
              editor.commands.insertContent(text, {
                contentType: 'markdown',
              });
              return true;
            }
          } catch (error) {
            console.error('Failed to parse markdown table:', error);
          }
        }

        return false;
      },
    },
    immediatelyRender: false,
  });

  // Expose editor to window for E2E testing
  useEffect(() => {
    if (editor && typeof window !== 'undefined') {
      (window as any).__testEditor = editor;
    }
  }, [editor]);

  // Mark as initialized after first render and set content
  useEffect(() => {
    if (editor) {
      if (!isInitialized) {
        // Force set content when editor first becomes available
        const initialContent = whim.blocks || { type: 'doc', content: [] };
        console.log('Setting initial content on editor mount:', {
          contentLength: initialContent.content?.length,
          firstBlock: initialContent.content?.[0]?.type
        });
        editor.commands.setContent(initialContent);

        // Verify content was set
        setTimeout(() => {
          const editorContent = editor.getJSON();
          console.log('Content after setContent:', {
            editorContentLength: editorContent.content?.length,
            editorFirstBlock: editorContent.content?.[0]?.type
          });
        }, 100);

        setIsInitialized(true);
      }
    }
  }, [editor, isInitialized, whim.blocks]);

  // Auto-save when content changes (debounced)
  useEffect(() => {
    if (!editor || !isInitialized) return;

    const handleUpdate = () => {
      // Capture editor JSON when timeout fires, not when effect runs
      const editorJSON = editor.getJSON();
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

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close heading menu if clicking outside
      if (showHeadingMenu && headingMenuRef.current && !headingMenuRef.current.contains(event.target as Node)) {
        setShowHeadingMenu(false);
      }
      // Close list menu if clicking outside
      if (showListMenu && listMenuRef.current && !listMenuRef.current.contains(event.target as Node)) {
        setShowListMenu(false);
      }
    };

    if (showHeadingMenu || showListMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showHeadingMenu, showListMenu]);

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
      {/* Custom CSS for task lists */}
      <style jsx global>{`
        /* Reduce spacing between regular list items */
        .ProseMirror ul:not([data-type="taskList"]) > li,
        .ProseMirror ol > li {
          margin-bottom: 0.25rem;
        }

        .ProseMirror ul:not([data-type="taskList"]) > li > p,
        .ProseMirror ol > li > p {
          margin: 0;
        }

        /* Remove list-style dots from task lists */
        ul[data-type="taskList"] {
          list-style: none;
          padding-left: 0;
        }

        /* Task item styling - target li[data-checked] which is what TipTap actually generates */
        ul[data-type="taskList"] > li[data-checked] {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          list-style: none;
          margin-bottom: 0.25rem;
        }

        /* Checkbox label styling */
        ul[data-type="taskList"] > li[data-checked] > label {
          display: flex;
          align-items: center;
          cursor: pointer;
          flex-shrink: 0;
        }

        ul[data-type="taskList"] > li[data-checked] > label > input[type="checkbox"] {
          cursor: pointer;
        }

        /* Content div styling */
        ul[data-type="taskList"] > li[data-checked] > div {
          flex: 1;
        }

        /* Remove margins from paragraphs inside task items */
        ul[data-type="taskList"] > li[data-checked] > div > p {
          margin: 0;
        }
      `}</style>
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

            {/* Heading Button with Dropdown */}
            <div className="relative" ref={headingMenuRef}>
              <button
                onClick={() => setShowHeadingMenu(!showHeadingMenu)}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                title="Heading"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
              </button>
              {showHeadingMenu && (
                <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-white border border-slate-300 rounded-lg shadow-lg py-1 min-w-[120px] z-50 flex flex-col">
                  <button
                    onClick={() => {
                      editor.chain().focus().setParagraph().run();
                      setShowHeadingMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100"
                  >
                    Text
                  </button>
                  <button
                    onClick={() => {
                      editor.chain().focus().toggleHeading({ level: 1 }).run();
                      setShowHeadingMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 font-bold"
                  >
                    H1
                  </button>
                  <button
                    onClick={() => {
                      editor.chain().focus().toggleHeading({ level: 2 }).run();
                      setShowHeadingMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 font-semibold"
                  >
                    H2
                  </button>
                  <button
                    onClick={() => {
                      editor.chain().focus().toggleHeading({ level: 3 }).run();
                      setShowHeadingMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 font-medium"
                  >
                    H3
                  </button>
                </div>
              )}
            </div>

            {/* List Button with Dropdown */}
            <div className="relative" ref={listMenuRef}>
              <button
                onClick={() => setShowListMenu(!showListMenu)}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                title="List"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {showListMenu && (
                <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-white border border-slate-300 rounded-lg shadow-lg py-1 min-w-[120px] z-50 flex flex-col">
                  <button
                    onClick={() => {
                      editor.chain().focus().toggleBulletList().run();
                      setShowListMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100"
                  >
                    • Bullet
                  </button>
                  <button
                    onClick={() => {
                      editor.chain().focus().toggleOrderedList().run();
                      setShowListMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100"
                  >
                    1. Number
                  </button>
                </div>
              )}
            </div>

            {/* Todo List */}
            <button
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              className={`p-2 rounded-lg hover:bg-slate-100 transition-colors ${
                editor.isActive('taskList') ? 'bg-slate-200' : ''
              }`}
              title="Todo List"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
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

            {/* Divider */}
            <div className="w-px h-4 bg-slate-300"></div>

            {/* Insert Table */}
            <button
              onClick={() => {
                // Check if there's selected text
                const { from, to } = editor.state.selection;
                const selectedText = editor.state.doc.textBetween(from, to, '\n');

                if (selectedText.trim()) {
                  // Check if selected text looks like a markdown table
                  const lines = selectedText.trim().split('\n');
                  const hasTableStructure = lines.length >= 2 &&
                    lines[0].includes('|') &&
                    lines[1].includes('|') &&
                    lines[1].includes('-');

                  if (hasTableStructure) {
                    // Convert selected markdown to table
                    editor.chain()
                      .focus()
                      .deleteSelection()
                      .insertContent(selectedText, { contentType: 'markdown' })
                      .run();
                    return;
                  }
                }

                // No selection or not a table format - show modal
                // Create a modal dialog with textarea
                const modal = document.createElement('div');
                modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';

                const dialog = document.createElement('div');
                dialog.style.cssText = 'background:white;padding:24px;border-radius:8px;max-width:600px;width:90%;box-shadow:0 4px 6px rgba(0,0,0,0.1);';

                dialog.innerHTML = `
                  <h3 style="margin:0 0 16px 0;font-size:18px;font-weight:600;color:#1e293b;">Insert Markdown Table</h3>
                  <p style="margin:0 0 12px 0;font-size:14px;color:#64748b;">Paste your markdown table below:</p>
                  <textarea id="markdown-input" style="width:100%;height:200px;padding:12px;border:1px solid #cbd5e1;border-radius:6px;font-family:monospace;font-size:13px;resize:vertical;" placeholder="| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |"></textarea>
                  <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
                    <button id="cancel-btn" style="padding:8px 16px;border:1px solid #cbd5e1;background:white;border-radius:6px;cursor:pointer;font-size:14px;">Cancel</button>
                    <button id="insert-btn" style="padding:8px 16px;background:#4F46E5;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500;">Insert Table</button>
                  </div>
                `;

                modal.appendChild(dialog);
                document.body.appendChild(modal);

                const textarea = document.getElementById('markdown-input') as HTMLTextAreaElement;
                const insertBtn = document.getElementById('insert-btn');
                const cancelBtn = document.getElementById('cancel-btn');

                textarea.focus();

                const cleanup = () => document.body.removeChild(modal);

                cancelBtn?.addEventListener('click', cleanup);
                modal.addEventListener('click', (e) => {
                  if (e.target === modal) cleanup();
                });

                insertBtn?.addEventListener('click', () => {
                  const markdownTable = textarea.value.trim();

                  if (markdownTable) {
                    // Check if input looks like markdown table
                    const lines = markdownTable.split('\n');
                    const hasTableStructure = lines.length >= 2 &&
                      lines[0].includes('|') &&
                      lines[1].includes('|') &&
                      lines[1].includes('-');

                    if (hasTableStructure) {
                      // Parse markdown and insert as table
                      editor.commands.insertContent(markdownTable, {
                        contentType: 'markdown',
                      });
                      cleanup();
                    } else {
                      alert('Invalid markdown table format. Please ensure:\n- Each row starts and ends with |\n- Second row contains dashes (---)\n- At least 2 rows (header + separator)');
                    }
                  }
                });
              }}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              title="Insert Table from Markdown"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </button>

            {/* Insert Image */}
            <button
              onClick={() => {
                const url = window.prompt('Enter image URL:');
                if (url) {
                  editor.chain().focus().setImage({ src: url }).run();
                }
              }}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              title="Insert Image"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </button>

            {/* Insert Math (inline) */}
            <button
              onClick={() => {
                const formula = window.prompt('Enter LaTeX formula (e.g., E = mc^2):');
                if (formula) {
                  // Use the correct Mathematics extension command
                  editor.commands.insertInlineMath({ latex: formula });
                }
              }}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              title="Insert Math Formula (Inline)"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <text x="8" y="13" fontFamily="serif" fontSize="20" fontStyle="italic" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
                  f
                </text>
                <text x="16" y="13" fontFamily="serif" fontSize="16" fontStyle="italic" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
                  x
                </text>
              </svg>
            </button>

            {/* Insert Math (display/block) */}
            <button
              onClick={() => {
                const formula = window.prompt('Enter LaTeX formula for display mode (e.g., \\int_0^\\infty e^{-x^2} dx):');
                if (formula) {
                  // Use block math for display equations
                  editor.commands.insertBlockMath({ latex: formula });
                }
              }}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              title="Insert Math Formula (Display)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}