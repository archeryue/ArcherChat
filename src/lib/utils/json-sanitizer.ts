/**
 * Utility functions for sanitizing and parsing JSON from LLM responses
 *
 * LLMs often return malformed JSON with:
 * - JavaScript `undefined` instead of `null`
 * - Extra markdown formatting (```json ... ```)
 * - Trailing commas
 * - Comments
 * - Extra text before/after JSON
 */

/**
 * Sanitize JSON string from LLM output
 * Handles common malformations like `undefined`, trailing commas, etc.
 */
export function sanitizeJsonString(rawText: string): string {
  let cleaned = rawText.trim();

  // Remove markdown code blocks if present
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/i, '');

  // Extract JSON object/array (match outermost braces/brackets)
  const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    cleaned = jsonMatch[1];
  }

  // Replace JavaScript `undefined` with JSON `null`
  // Handle variations: undefined, "undefined", 'undefined'
  cleaned = cleaned.replace(/:\s*undefined\s*([,}\]])/g, ': null$1');
  cleaned = cleaned.replace(/:\s*"undefined"\s*([,}\]])/g, ': null$1');
  cleaned = cleaned.replace(/:\s*'undefined'\s*([,}\]])/g, ': null$1');

  // Remove trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

  // Remove single-line comments (// ...)
  cleaned = cleaned.replace(/\/\/[^\n]*/g, '');

  // Remove multi-line comments (/* ... */)
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  return cleaned.trim();
}

/**
 * Safely parse JSON from LLM output with sanitization
 *
 * @param rawText - Raw text from LLM (may contain extra formatting)
 * @param context - Context string for better error messages (e.g., "PromptAnalyzer")
 * @returns Parsed JSON object
 * @throws Error if parsing fails after sanitization
 */
export function parseJsonFromLLM(rawText: string, context: string = "LLM"): any {
  try {
    // First attempt: sanitize and parse
    const sanitized = sanitizeJsonString(rawText);
    return JSON.parse(sanitized);
  } catch (error) {
    console.error(`[${context}] JSON parsing failed after sanitization`);
    console.error(`[${context}] Raw text:`, rawText);
    console.error(`[${context}] Sanitized text:`, sanitizeJsonString(rawText));
    console.error(`[${context}] Parse error:`, error);
    throw new Error(`Failed to parse JSON from ${context}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate that parsed JSON contains required fields
 *
 * @param obj - Parsed JSON object
 * @param requiredFields - Array of required field paths (e.g., ["intent", "actions.web_search"])
 * @param context - Context string for error messages
 * @throws Error if validation fails
 */
export function validateJsonStructure(
  obj: any,
  requiredFields: string[],
  context: string = "JSON"
): void {
  for (const field of requiredFields) {
    const path = field.split('.');
    let current = obj;

    for (let i = 0; i < path.length; i++) {
      const key = path[i];
      if (current === null || current === undefined || !(key in current)) {
        throw new Error(
          `[${context}] Missing required field: ${field} (failed at '${key}')`
        );
      }
      current = current[key];
    }
  }
}
