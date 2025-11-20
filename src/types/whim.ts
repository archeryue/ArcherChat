import { Timestamp } from 'firebase-admin/firestore';
import { JSONContent } from '@tiptap/core';

// Server-side types (with Firestore Timestamps)
export interface Whim {
  id: string;
  userId: string;
  title: string;
  content?: string; // Markdown content (legacy, for backward compatibility)
  blocks?: JSONContent; // TipTap JSON blocks (new format)
  folderId?: string;
  conversationId?: string; // Optional reference to source conversation
  createdAt: Timestamp | string; // Timestamp on server, string on client
  updatedAt: Timestamp | string; // Timestamp on server, string on client
}

export interface Folder {
  id: string;
  userId: string;
  name: string;
  createdAt: Timestamp | string; // Timestamp on server, string on client
}

// Client-side types (with ISO string dates)
export interface WhimClient {
  id: string;
  userId: string;
  title: string;
  content?: string; // Markdown content (legacy, for backward compatibility)
  blocks?: JSONContent; // TipTap JSON blocks (new format)
  folderId?: string;
  conversationId?: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface FolderClient {
  id: string;
  userId: string;
  name: string;
  createdAt: string; // ISO string
}

export interface CreateWhimRequest {
  title: string;
  content?: string; // Legacy markdown
  blocks?: JSONContent; // New JSON blocks format
  folderId?: string;
  conversationId?: string;
}

export interface UpdateWhimRequest {
  title?: string;
  content?: string; // Legacy markdown
  blocks?: JSONContent; // New JSON blocks format
  folderId?: string;
}

export interface CreateFolderRequest {
  name: string;
}

export interface UpdateFolderRequest {
  name: string;
}
