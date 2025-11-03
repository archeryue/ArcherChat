import { Timestamp } from "firebase-admin/firestore";
import { FileAttachment } from "./file";
import { ProgressEvent } from "@/lib/progress/types";

// Re-export memory types
export * from "./memory";
// Re-export file types
export * from "./file";

export interface User {
  email: string;
  name: string;
  avatar_url: string;
  is_admin: boolean;
  created_at: Timestamp;
  last_login: Timestamp;
}

export interface Conversation {
  user_id: string;
  title: string;
  model: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  image_url?: string;  // URL for generated/external images
  image_data?: string;  // Base64 encoded image data
  files?: FileAttachment[];  // Uploaded file attachments
  created_at: Timestamp;
}

export interface WhitelistEntry {
  added_by: string;
  added_at: Timestamp;
  notes?: string;
}

// Client-side versions (Timestamp converted to Date)
export interface UserClient {
  email: string;
  name: string;
  avatar_url: string;
  is_admin: boolean;
  created_at: Date;
  last_login: Date;
}

export interface ConversationClient {
  id: string;
  user_id: string;
  title: string;
  model: string;
  created_at: Date;
  updated_at: Date;
}

export interface MessageClient {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image_url?: string;  // URL for generated/external images
  image_data?: string;  // Base64 encoded image data
  files?: FileAttachment[];  // Uploaded file attachments
  created_at: Date;
  progressEvents?: ProgressEvent[];  // Progress tracking for assistant messages
}

export interface WhitelistEntryClient {
  email: string;
  added_by: string;
  added_at: Date;
  notes?: string;
}

// User stats for admin panel
export interface UserStats {
  email: string;
  name: string;
  message_count: number;
  last_active: Date;
}
