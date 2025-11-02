// Google Custom Search API types
export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
}

export interface GoogleSearchResponse {
  items?: SearchResult[];
  searchInformation?: {
    totalResults: string;
    searchTime: number;
  };
}

// Web search settings
export interface WebSearchSettings {
  enabled: boolean;
  rateLimit?: {
    hourly: number;
    daily: number;
  };
}

// Search usage tracking
export interface SearchUsage {
  user_id: string;
  query: string;
  results_count: number;
  timestamp: Date;
  cost_estimate: number; // in cents
}
