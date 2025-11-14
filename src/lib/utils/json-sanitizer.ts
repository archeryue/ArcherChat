/**
 * Utility functions for sanitizing and parsing JSON from LLM responses
 *
 * LLMs often return malformed JSON with:
 * - JavaScript `undefined` instead of `null`
 * - Extra markdown formatting (```json ... ```)
 * - Trailing commas
 * - Comments
 * - Extra text before/after JSON
 * - Unterminated strings
 * - Missing commas between array/object elements
 * - Unescaped quotes inside strings
 */

/**
 * Repair unterminated strings in JSON
 * Finds strings that don't have closing quotes and adds them
 */
function repairUnterminatedStrings(text: string): string {
  let result = '';
  let inString = false;
  let stringChar: '"' | "'" | null = null;
  let escapeNext = false;
  let braceDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escapeNext = true;
      continue;
    }

    if (!inString) {
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        result += char;
        continue;
      }
      if (char === '{') braceDepth++;
      if (char === '}') braceDepth--;
      if (char === '[') bracketDepth++;
      if (char === ']') bracketDepth--;
      result += char;
    } else {
      // Inside string
      if (char === stringChar) {
        inString = false;
        stringChar = null;
        result += char;
      } else {
        result += char;
      }
    }
  }

  // If we're still in a string at the end, close it
  if (inString && stringChar) {
    result += stringChar;
  }

  return result;
}

/**
 * Add missing commas between array/object elements
 */
function addMissingCommas(text: string): string {
  let result = '';
  let inString = false;
  let stringChar: '"' | "'" | null = null;
  let escapeNext = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escapeNext = true;
      continue;
    }

    if (char === '"' || char === "'") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = null;
      }
      result += char;
      continue;
    }

    if (inString) {
      result += char;
      continue;
    }

    // Outside string - check for missing commas
    // Pattern: "] [" should be "], [" (array elements)
    // Pattern: "} {" should be "}, {" (object elements)
    // Pattern: '" "' should be '", "' (string elements in array)
    if (char === ']' || char === '}' || char === '"') {
      result += char;
      // Skip whitespace to find next character
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) {
        result += text[j];
        j++;
      }
      if (j < text.length && (text[j] === '[' || text[j] === '{' || text[j] === '"')) {
        // Check if there's already a comma
        let hasComma = false;
        for (let k = i + 1; k < j; k++) {
          if (text[k] === ',') {
            hasComma = true;
            break;
          }
        }
        if (!hasComma) {
          result += ',';
        }
      }
      i = j - 1; // Continue from where we checked
    } else {
      result += char;
    }
  }

  return result;
}

/**
 * Fix unescaped quotes inside strings
 * This is a best-effort approach - we escape quotes that appear to be inside strings
 */
function fixUnescapedQuotes(text: string): string {
  // This is complex - for now, we'll use a simpler approach:
  // Replace common patterns like: "He said "hello"" with "He said \"hello\""
  // This regex looks for: " followed by text, then " not followed by : or , or } or ]
  return text.replace(/"([^"]*)"([^"]*)"(?![:\s]*[,}\]])/g, (match, p1, p2) => {
    // Only fix if it looks like nested quotes (has content on both sides)
    if (p1 && p2) {
      return `"${p1}\\"${p2}"`;
    }
    return match;
  });
}

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

  // Remove single-line comments (// ...)
  cleaned = cleaned.replace(/\/\/[^\n]*/g, '');

  // Remove multi-line comments (/* ... */)
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  // Replace JavaScript `undefined` with JSON `null`
  // Handle variations: undefined, "undefined", 'undefined'
  cleaned = cleaned.replace(/:\s*undefined\s*([,}\]])/g, ': null$1');
  cleaned = cleaned.replace(/:\s*"undefined"\s*([,}\]])/g, ': null$1');
  cleaned = cleaned.replace(/:\s*'undefined'\s*([,}\]])/g, ': null$1');

  // Apply advanced repairs
  cleaned = repairUnterminatedStrings(cleaned);
  cleaned = fixUnescapedQuotes(cleaned);
  cleaned = addMissingCommas(cleaned);

  // Remove trailing commas before closing braces/brackets (after adding commas)
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

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
