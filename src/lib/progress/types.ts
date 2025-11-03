/**
 * Progress tracking types for chat operations
 */

export enum ProgressStep {
  ANALYZING_PROMPT = 'analyzing_prompt',
  RETRIEVING_MEMORY = 'retrieving_memory',
  SEARCHING_WEB = 'searching_web',
  FETCHING_CONTENT = 'fetching_content',
  EXTRACTING_INFO = 'extracting_info',
  BUILDING_CONTEXT = 'building_context',
  GENERATING_RESPONSE = 'generating_response',
}

export const STEP_LABELS: Record<ProgressStep, string> = {
  [ProgressStep.ANALYZING_PROMPT]: 'Analyzing',
  [ProgressStep.RETRIEVING_MEMORY]: 'Retrieving Memory',
  [ProgressStep.SEARCHING_WEB]: 'Searching',
  [ProgressStep.FETCHING_CONTENT]: 'Fetching Content',
  [ProgressStep.EXTRACTING_INFO]: 'Extracting Info',
  [ProgressStep.BUILDING_CONTEXT]: 'Building Context',
  [ProgressStep.GENERATING_RESPONSE]: 'Generating',
};

export interface ProgressEvent {
  step: ProgressStep;
  status: 'started' | 'in_progress' | 'completed' | 'error';
  message: string;
  timestamp: number;
  details?: {
    url?: string;
    current?: number;
    total?: number;
    percentage?: number;
    subItems?: Array<{
      label: string;
      status?: 'pending' | 'in_progress' | 'completed' | 'error';
      url?: string;
    }>;
  };
}
