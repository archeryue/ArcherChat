export interface PromptConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  temperature: number;
}

// Firestore version with Timestamps
export interface PromptConfigFirestore {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  isActive: boolean;
  isDefault: boolean;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}
