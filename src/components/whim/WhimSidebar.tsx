'use client';

import { useState, useEffect, useRef } from 'react';
import { WhimClient, FolderClient } from '@/types/whim';

interface WhimSidebarProps {
  whims: WhimClient[];
  folders: FolderClient[];
  selectedWhim: WhimClient | null;
  onWhimSelect: (whim: WhimClient) => void;
  onFolderCreate: (name: string) => void;
  onFolderUpdate: (folderId: string, name: string) => void;
  onFolderDelete: (folderId: string) => void;
}

export function WhimSidebar({
  whims,
  folders,
  selectedWhim,
  onWhimSelect,
  onFolderCreate,
  onFolderUpdate,
  onFolderDelete,
}: WhimSidebarProps) {
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(256); // Default width in pixels
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Group whims by folder
  const whimsWithoutFolder = whims.filter(w => !w.folderId);
  const whimsByFolder = folders.reduce((acc, folder) => {
    acc[folder.id] = whims.filter(w => w.folderId === folder.id);
    return acc;
  }, {} as Record<string, WhimClient[]>);

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      onFolderCreate(newFolderName.trim());
      setNewFolderName('');
      setShowNewFolderInput(false);
    }
  };

  const handleUpdateFolder = (folderId: string) => {
    if (editingFolderName.trim()) {
      onFolderUpdate(folderId, editingFolderName.trim());
      setEditingFolder(null);
      setEditingFolderName('');
    }
  };

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  // Handle resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      if (newWidth >= 200 && newWidth <= 500) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  return (
    <div
      ref={sidebarRef}
      className="bg-white border-r border-slate-200 flex flex-col relative"
      style={{ width: `${sidebarWidth}px` }}
    >
      {/* Main Title */}
      <div className="px-6 py-2 border-b border-slate-200">
        <h1 className="text-2xl font-semibold text-blue-600 italic m-0 p-0">Whims</h1>
        <p className="text-xs text-slate-500 mt-1">
          Your saved conversations and notes
        </p>
      </div>

      {/* Folders Header */}
      <div className="px-4 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Folders</h2>
          <button
            onClick={() => setShowNewFolderInput(true)}
            className="text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100"
          >
            + New
          </button>
        </div>

        {showNewFolderInput && (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') {
                  setShowNewFolderInput(false);
                  setNewFolderName('');
                }
              }}
              placeholder="Folder name"
              className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-slate-400"
              autoFocus
            />
            <button
              onClick={handleCreateFolder}
              className="px-2 py-1 text-xs bg-slate-700 text-white rounded hover:bg-slate-800"
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Folders and Whims */}
      <div className="flex-1 overflow-y-auto">
        {/* Uncategorized Whims */}
        {whimsWithoutFolder.length > 0 && (
          <div className="py-2">
            <div className="px-4 py-2 text-xs font-medium text-slate-500 uppercase">
              Uncategorized
            </div>
            {whimsWithoutFolder.map((whim) => (
              <button
                key={whim.id}
                onClick={() => onWhimSelect(whim)}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ${
                  selectedWhim?.id === whim.id ? 'bg-slate-100 border-l-2 border-slate-700' : ''
                }`}
              >
                <div className="font-medium text-slate-900 truncate">{whim.title}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {new Date(whim.updatedAt).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Folders */}
        {folders.map((folder) => {
          const isExpanded = expandedFolders.has(folder.id);
          const folderWhims = whimsByFolder[folder.id] || [];

          return (
            <div key={folder.id} className="py-2 border-t border-slate-100">
              <div className="px-4 py-2 flex items-center justify-between group">
                {editingFolder === folder.id ? (
                  <input
                    type="text"
                    value={editingFolderName}
                    onChange={(e) => setEditingFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdateFolder(folder.id);
                      if (e.key === 'Escape') {
                        setEditingFolder(null);
                        setEditingFolderName('');
                      }
                    }}
                    onBlur={() => handleUpdateFolder(folder.id)}
                    className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-slate-400"
                    autoFocus
                  />
                ) : (
                  <>
                    <button
                      onClick={() => toggleFolder(folder.id)}
                      className="flex-1 flex items-center gap-2 text-left text-xs font-medium text-slate-700 uppercase"
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                      {folder.name} ({folderWhims.length})
                    </button>
                    <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                      <button
                        onClick={() => {
                          setEditingFolder(folder.id);
                          setEditingFolderName(folder.name);
                        }}
                        className="text-slate-500 hover:text-slate-700 p-1"
                        title="Rename folder"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => onFolderDelete(folder.id)}
                        className="text-slate-500 hover:text-red-600 p-1"
                        title="Delete folder"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {isExpanded && folderWhims.map((whim) => (
                <button
                  key={whim.id}
                  onClick={() => onWhimSelect(whim)}
                  className={`w-full text-left px-4 pl-10 py-2 text-sm hover:bg-slate-50 ${
                    selectedWhim?.id === whim.id ? 'bg-slate-100 border-l-2 border-slate-700' : ''
                  }`}
                >
                  <div className="font-medium text-slate-900 truncate">{whim.title}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {new Date(whim.updatedAt).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {/* Resize Handle */}
      <div
        className="absolute top-0 right-0 w-1 h-full cursor-ew-resize hover:bg-blue-400 bg-slate-300 transition-colors"
        onMouseDown={() => setIsResizing(true)}
      />
    </div>
  );
}
