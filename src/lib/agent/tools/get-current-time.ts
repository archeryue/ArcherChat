/**
 * Get Current Time Tool
 *
 * Returns the current date and time in various formats.
 */

import { ToolParameter, ToolResult } from '@/types/agent';
import { BaseTool, successResult, errorResult } from './base';

export class GetCurrentTimeTool extends BaseTool {
  name = 'get_current_time';

  description = `Get the current date and time. Use this when you need to know the current
time, date, day of week, or need to provide time-sensitive information.`;

  parameters: ToolParameter[] = [
    {
      name: 'timezone',
      type: 'string',
      description: 'Timezone to use (e.g., "America/New_York", "Asia/Shanghai"). Defaults to UTC.',
      required: false,
    },
    {
      name: 'format',
      type: 'string',
      description: 'Output format: "full", "date", "time", "iso". Defaults to "full".',
      required: false,
      enum: ['full', 'date', 'time', 'iso'],
    },
  ];

  protected async run(params: Record<string, unknown>): Promise<ToolResult> {
    const timezone = (params.timezone as string) || 'UTC';
    const format = (params.format as string) || 'full';

    try {
      const now = new Date();

      // Format date based on timezone
      const options: Intl.DateTimeFormatOptions = {
        timeZone: timezone,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      };

      let result: Record<string, string | number>;

      switch (format) {
        case 'iso':
          result = {
            iso: now.toISOString(),
            timezone,
          };
          break;

        case 'date':
          result = {
            date: now.toLocaleDateString('en-US', {
              timeZone: timezone,
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            }),
            timezone,
          };
          break;

        case 'time':
          result = {
            time: now.toLocaleTimeString('en-US', {
              timeZone: timezone,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            }),
            timezone,
          };
          break;

        case 'full':
        default:
          const fullDate = now.toLocaleDateString('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
          });
          const fullTime = now.toLocaleTimeString('en-US', {
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          });
          result = {
            datetime: `${fullDate} at ${fullTime}`,
            date: fullDate,
            time: fullTime,
            timezone,
            timestamp: now.getTime(),
            iso: now.toISOString(),
          };
          break;
      }

      return successResult(result, {
        executionTime: 0,
        tokensUsed: 0,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to get time';
      return errorResult(`Get current time failed: ${message}`);
    }
  }
}

// Export singleton instance
export const getCurrentTimeTool = new GetCurrentTimeTool();
