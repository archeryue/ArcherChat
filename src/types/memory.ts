export enum MemoryTier {
  CORE = "core",           // Permanent profile info
  IMPORTANT = "important", // Key preferences
  CONTEXT = "context",     // Recent work/topics
}

export enum MemoryCategory {
  PROFILE = "profile",         // Name, job, interests
  PREFERENCE = "preference",   // User preferences
  TECHNICAL = "technical",     // Tech stack, languages
  PROJECT = "project",         // Current work
}

export interface MemoryFact {
  id: string;
  content: string;              // "Prefers TypeScript over JavaScript"
  category: MemoryCategory;
  tier: MemoryTier;
  confidence: number;           // 0-1 (how sure we are)

  // Metadata
  created_at: Date;
  last_used_at: Date;
  use_count: number;            // How many times referenced
  expires_at: Date | null;      // Null for CORE tier

  // Source tracking
  extracted_from: string;       // conversationId
  auto_extracted: boolean;      // true = AI extracted, false = user created
}

export interface UserMemory {
  user_id: string;
  facts: MemoryFact[];
  stats: {
    total_facts: number;
    token_usage: number;        // Estimated tokens
    last_cleanup: Date;
  };
  updated_at: Date;
}

// Memory limits configuration
export const MEMORY_LIMITS = {
  core: {
    max_facts: 8,
    max_age: Infinity,
  },
  important: {
    max_facts: 12,
    max_age: 90, // days
  },
  context: {
    max_facts: 6,
    max_age: 30, // days
  },
  max_total_tokens: 500,
} as const;

// Client-safe version (Date as string)
export interface MemoryFactClient {
  id: string;
  content: string;
  category: MemoryCategory;
  tier: MemoryTier;
  confidence: number;
  created_at: string;
  last_used_at: string;
  use_count: number;
  expires_at: string | null;
  extracted_from: string;
  auto_extracted: boolean;
}

export interface UserMemoryClient {
  user_id: string;
  facts: MemoryFactClient[];
  stats: {
    total_facts: number;
    token_usage: number;
    last_cleanup: string;
  };
  updated_at: string;
}
