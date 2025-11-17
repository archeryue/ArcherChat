'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { WhimClient, FolderClient } from '@/types/whim';
import { WhimEditor } from '@/components/whim/WhimEditor';
import { WhimSidebar } from '@/components/whim/WhimSidebar';

export default function WhimPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [whims, setWhims] = useState<WhimClient[]>([]);
  const [folders, setFolders] = useState<FolderClient[]>([]);
  const [selectedWhim, setSelectedWhim] = useState<WhimClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      loadData();
    }
  }, [status]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [whimsRes, foldersRes] = await Promise.all([
        fetch('/api/whims'),
        fetch('/api/folders'),
      ]);

      if (!whimsRes.ok || !foldersRes.ok) {
        throw new Error('Failed to load data');
      }

      const whimsData = await whimsRes.json();
      const foldersData = await foldersRes.json();

      setWhims(whimsData.whims);
      setFolders(foldersData.folders);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load whims and folders');
    } finally {
      setLoading(false);
    }
  };

  const handleWhimSelect = (whim: WhimClient) => {
    setSelectedWhim(whim);
  };

  const handleWhimUpdate = async (whimId: string, updates: { title?: string; content?: string; folderId?: string }) => {
    try {
      const res = await fetch(`/api/whims/${whimId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        throw new Error('Failed to update whim');
      }

      const { whim: updatedWhim } = await res.json();

      // Update state
      setWhims(whims.map(w => w.id === whimId ? updatedWhim : w));
      setSelectedWhim(updatedWhim);
    } catch (err) {
      console.error('Error updating whim:', err);
      setError('Failed to update whim');
    }
  };

  const handleWhimDelete = async (whimId: string) => {
    if (!confirm('Are you sure you want to delete this whim?')) {
      return;
    }

    try {
      const res = await fetch(`/api/whims/${whimId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete whim');
      }

      // Update state
      setWhims(whims.filter(w => w.id !== whimId));
      if (selectedWhim?.id === whimId) {
        setSelectedWhim(null);
      }
    } catch (err) {
      console.error('Error deleting whim:', err);
      setError('Failed to delete whim');
    }
  };

  const handleFolderCreate = async (name: string) => {
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        throw new Error('Failed to create folder');
      }

      const { folder } = await res.json();
      setFolders([...folders, folder]);
    } catch (err) {
      console.error('Error creating folder:', err);
      setError('Failed to create folder');
    }
  };

  const handleFolderUpdate = async (folderId: string, name: string) => {
    try {
      const res = await fetch(`/api/folders/${folderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        throw new Error('Failed to update folder');
      }

      const { folder: updatedFolder } = await res.json();
      setFolders(folders.map(f => f.id === folderId ? updatedFolder : f));
    } catch (err) {
      console.error('Error updating folder:', err);
      setError('Failed to update folder');
    }
  };

  const handleFolderDelete = async (folderId: string) => {
    if (!confirm('Are you sure you want to delete this folder?')) {
      return;
    }

    try {
      const res = await fetch(`/api/folders/${folderId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete folder');
      }

      setFolders(folders.filter(f => f.id !== folderId));
    } catch (err: any) {
      console.error('Error deleting folder:', err);
      setError(err.message || 'Failed to delete folder');
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <WhimSidebar
        whims={whims}
        folders={folders}
        selectedWhim={selectedWhim}
        onWhimSelect={handleWhimSelect}
        onFolderCreate={handleFolderCreate}
        onFolderUpdate={handleFolderUpdate}
        onFolderDelete={handleFolderDelete}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 m-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Editor or Empty State */}
        {selectedWhim ? (
          <WhimEditor
            whim={selectedWhim}
            folders={folders}
            onUpdate={handleWhimUpdate}
            onDelete={handleWhimDelete}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-slate-500">
              <svg
                className="mx-auto h-12 w-12 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-slate-900">No whim selected</h3>
              <p className="mt-1 text-sm text-slate-500">
                Select a whim from the sidebar or save a conversation using /save or /whim
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
