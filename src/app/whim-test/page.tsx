'use client';

import { useState } from 'react';
import { WhimClient, FolderClient } from '@/types/whim';
import { WhimEditor } from '@/components/whim/WhimEditor';

/**
 * Test page for WhimEditor - NO AUTHENTICATION REQUIRED
 *
 * This page is used for E2E testing of the WhimEditor component
 * without requiring authentication. It uses mocked data.
 *
 * Access at: http://localhost:8080/whim-test
 */

export default function WhimTestPage() {
  // Mock folders (using fixed timestamps to avoid hydration errors)
  const mockFolders: FolderClient[] = [
    {
      id: 'folder-1',
      userId: 'test-user',
      name: 'Test Folder',
      createdAt: '2025-11-20T00:00:00.000Z',
    },
    {
      id: 'folder-2',
      userId: 'test-user',
      name: 'Another Folder',
      createdAt: '2025-11-20T00:00:00.000Z',
    },
  ];

  // Mock initial whim with JSON blocks - includes complex examples
  const mockWhim: WhimClient = {
    id: 'test-whim-1',
    userId: 'test-user',
    title: 'WhimEditor Demo - Phase 1 Features Showcase',
    folderId: 'folder-1',
    blocks: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'WhimEditor Phase 1 Features Demo' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'This page demonstrates all Phase 1 Notion-like editor features. Use the ' },
            { type: 'text', text: 'floating toolbar at the bottom', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' to add more content!' },
          ],
        },

        // Math Examples
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: '📐 Mathematics (LaTeX)' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Inline math example: The famous equation ' },
            { type: 'inlineMath', attrs: { latex: 'E = mc^2' } },
            { type: 'text', text: ' relates energy and mass.' },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Another inline example: ' },
            { type: 'inlineMath', attrs: { latex: '\\alpha + \\beta = \\gamma' } },
            { type: 'text', text: ' and ' },
            { type: 'inlineMath', attrs: { latex: 'x^2 + y^2 = z^2' } },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Display math (centered):' }],
        },
        {
          type: 'blockMath',
          attrs: { latex: '\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}' },
        },
        {
          type: 'blockMath',
          attrs: { latex: '\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}' },
        },
        {
          type: 'blockMath',
          attrs: { latex: '\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}' },
        },

        // Table Example
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: '📊 Tables' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Example table with data:' }],
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Feature' }] }] },
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Status' }] }] },
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Notes' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Math Formulas' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '✅ Working' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Inline & Display' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tables' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '✅ Working' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Resizable columns' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Images' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '✅ Working' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'URL & Base64' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Code Blocks' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '✅ Working' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Syntax highlighting' }] }] },
              ],
            },
          ],
        },

        // Image Example
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: '🖼️ Images' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Example image:' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'image',
              attrs: {
                src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNjAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzRGNDZFNSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiNGRkZGRkYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5XaGltRWRpdG9yIFBoYXNlIDE8L3RleHQ+PC9zdmc+',
                alt: 'WhimEditor Demo',
              },
            },
          ],
        },

        // Code Block Example
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: '💻 Code Blocks' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Example TypeScript code with syntax highlighting:' }],
        },
        {
          type: 'codeBlock',
          attrs: { language: 'typescript' },
          content: [
            {
              type: 'text',
              text: `function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const result = fibonacci(10);
console.log(\`Fibonacci(10) = \${result}\`);`,
            },
          ],
        },

        // Text Formatting
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: '✨ Text Formatting' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'This is ' },
            { type: 'text', text: 'bold text', marks: [{ type: 'bold' }] },
            { type: 'text', text: ', this is ' },
            { type: 'text', text: 'italic text', marks: [{ type: 'italic' }] },
            { type: 'text', text: ', and this is ' },
            { type: 'text', text: 'bold and italic', marks: [{ type: 'bold' }, { type: 'italic' }] },
            { type: 'text', text: '!' },
          ],
        },

        // Final note
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '💡 ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'Tip: Use the toolbar buttons at the bottom to add more content!', marks: [{ type: 'italic' }] },
          ],
        },
      ],
    },
    createdAt: '2025-11-20T00:00:00.000Z',
    updatedAt: '2025-11-20T00:00:00.000Z',
  };

  const [whim, setWhim] = useState<WhimClient>(mockWhim);

  // Debug: Log whim data
  console.log('Test page whim data:', {
    id: whim.id,
    title: whim.title,
    hasBlocks: !!whim.blocks,
    blocksType: whim.blocks?.type,
    contentLength: whim.blocks?.content?.length,
  });

  // Mock update handler
  const handleUpdate = async (whimId: string, updates: { title?: string; content?: string; blocks?: any; folderId?: string }) => {
    console.log('Mock update called:', {
      whimId,
      hasBlocks: !!updates.blocks,
      blocksContentLength: updates.blocks?.content?.length,
      updates
    });

    // DON'T update state at all - just log for debugging
    // This prevents the feedback loop
    console.log('Update prevented to preserve initial content');

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));
  };

  // Mock delete handler
  const handleDelete = async (whimId: string) => {
    console.log('Mock delete called:', whimId);
    alert('Delete is mocked - this would delete the whim in production');
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Test Page Header */}
      <div className="bg-slate-800 text-white px-6 py-4 flex-shrink-0">
        <h1 className="text-xl font-bold">WhimEditor Test Page (No Auth Required)</h1>
        <p className="text-sm text-slate-300 mt-1">
          Test all Phase 1 editor features using the <strong className="text-yellow-300">floating toolbar at the bottom</strong>
        </p>
        <p className="text-xs text-slate-400 mt-2">
          Toolbar buttons: Bold, Italic, Heading, List, Code Block, Table, Image, Math (Inline), Math (Display)
        </p>
      </div>

      {/* Editor - full height with scroll */}
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-4xl mx-auto py-8">
          <WhimEditor
            whim={whim}
            folders={mockFolders}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        </div>
      </div>

      {/* Debug Panel - Fixed at bottom right corner */}
      <div className="fixed bottom-4 right-4 z-50">
        <details className="bg-white border border-slate-300 rounded-lg shadow-lg">
          <summary className="cursor-pointer font-semibold text-slate-700 px-4 py-2 text-xs">
            Debug Info
          </summary>
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 font-mono text-xs overflow-auto max-h-60 max-w-sm">
            <div><strong>Title:</strong> {whim.title}</div>
            <div><strong>Folder ID:</strong> {whim.folderId}</div>
            <div className="mt-2 text-xs text-slate-600">
              (Scroll down to see the floating toolbar at the bottom)
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
