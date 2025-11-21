'use client';

import { useState } from 'react';
import { WhimClient, FolderClient } from '@/types/whim';
import { WhimEditor } from '@/components/whim/WhimEditor';
import { AIChatSidebar } from '@/components/whim/AIChatSidebar';
import { MessageClient } from '@/types';

/**
 * Test page for AI Chat Sidebar - NO AUTHENTICATION REQUIRED
 *
 * This page is used for E2E testing of the AIChatSidebar rich content rendering
 * without requiring authentication. It uses mocked chat responses.
 *
 * Access at: http://localhost:8080/whim-sidebar-test
 */

export default function WhimSidebarTestPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Mock folders
  const mockFolders: FolderClient[] = [
    {
      id: 'folder-1',
      userId: 'test-user',
      name: 'Test Folder',
      createdAt: '2025-11-20T00:00:00.000Z',
    },
  ];

  // Mock whim with simple content
  const mockWhim: WhimClient = {
    id: 'test-whim-sidebar',
    userId: 'test-user',
    title: 'AI Chat Sidebar Test - Rich Content Rendering',
    folderId: 'folder-1',
    blocks: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'AI Chat Sidebar Rich Content Test' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'This page tests the AI Chat Sidebar\'s ability to render rich content like LaTeX math, code blocks, and markdown.' },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'The sidebar on the right has pre-populated messages with various rich content types.' },
          ],
        },
      ],
    },
    createdAt: '2025-11-20T00:00:00.000Z',
    updatedAt: '2025-11-20T00:00:00.000Z',
  };

  const [whim, setWhim] = useState<WhimClient>(mockWhim);

  // Mock update handler
  const handleUpdate = async (whimId: string, updates: any) => {
    console.log('Mock update called:', whimId, updates);
    await new Promise(resolve => setTimeout(resolve, 100));
  };

  // Mock delete handler
  const handleDelete = async (whimId: string) => {
    console.log('Mock delete called:', whimId);
  };

  // Mock apply edit handler
  const handleApplyEdit = (newContent: string) => {
    console.log('Mock apply edit called:', newContent);
    alert('In production, this would update the editor content');
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Test Page Header */}
      <div className="bg-indigo-800 text-white px-6 py-4 flex-shrink-0">
        <h1 className="text-xl font-bold">AI Chat Sidebar Test Page (No Auth Required)</h1>
        <p className="text-sm text-indigo-200 mt-1">
          Testing rich content rendering in the sidebar: <strong className="text-yellow-300">LaTeX, Code Blocks, Markdown</strong>
        </p>
        <p className="text-xs text-indigo-300 mt-2">
          The sidebar has pre-populated messages demonstrating all rich content types
        </p>
      </div>

      {/* Main Content Area with Editor and Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto py-8 px-6">
            <WhimEditor
              whim={whim}
              folders={mockFolders}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          </div>
        </div>

        {/* AI Chat Sidebar - Always Open for Testing */}
        <AIChatSidebar
          whimId={whim.id}
          whimContent={JSON.stringify(whim.blocks)}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onApplyEdit={handleApplyEdit}
        />
      </div>

      {/* Debug Panel */}
      <div className="fixed bottom-4 left-4 z-50">
        <details className="bg-white border border-slate-300 rounded-lg shadow-lg">
          <summary className="cursor-pointer font-semibold text-slate-700 px-4 py-2 text-xs">
            Test Info
          </summary>
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs space-y-2">
            <div><strong>Whim ID:</strong> {whim.id}</div>
            <div><strong>Sidebar Open:</strong> {isSidebarOpen ? 'Yes' : 'No'}</div>
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="mt-2 px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700"
            >
              {isSidebarOpen ? 'Close' : 'Open'} Sidebar
            </button>
            <div className="mt-2 pt-2 border-t border-slate-300 text-slate-600">
              <div className="font-semibold">Expected Content:</div>
              <ul className="mt-1 space-y-1 text-xs">
                <li>✓ LaTeX inline & block formulas</li>
                <li>✓ Syntax-highlighted code blocks</li>
                <li>✓ Markdown (bold, italic, lists)</li>
                <li>✓ Tables</li>
                <li>✓ Copy and Apply buttons</li>
              </ul>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
