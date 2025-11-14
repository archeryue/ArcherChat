/**
 * Tests for JSON Sanitization Utilities
 *
 * These tests validate the JSON repair and sanitization functions
 * used to handle malformed JSON from LLM responses.
 */

import { sanitizeJsonString, parseJsonFromLLM, validateJsonStructure } from '@/lib/utils/json-sanitizer';

describe('JSON Sanitizer', () => {
  describe('sanitizeJsonString - Basic Sanitization', () => {
    it('should handle valid JSON without modification', () => {
      const input = '{"name": "test", "value": 123}';
      const result = sanitizeJsonString(input);
      expect(JSON.parse(result)).toEqual({ name: 'test', value: 123 });
    });

    it('should replace undefined with null', () => {
      const input = '{"field": undefined}';
      const result = sanitizeJsonString(input);
      expect(JSON.parse(result)).toEqual({ field: null });
    });

    it('should replace "undefined" string with null', () => {
      const input = '{"field": "undefined"}';
      const result = sanitizeJsonString(input);
      expect(JSON.parse(result)).toEqual({ field: null });
    });

    it('should handle multiple undefined values', () => {
      const input = '{"a": undefined, "b": undefined, "c": "undefined"}';
      const result = sanitizeJsonString(input);
      expect(JSON.parse(result)).toEqual({ a: null, b: null, c: null });
    });

    it('should remove trailing commas before closing braces', () => {
      const input = '{"name": "test", "value": 123,}';
      const result = sanitizeJsonString(input);
      expect(JSON.parse(result)).toEqual({ name: 'test', value: 123 });
    });

    it('should remove trailing commas before closing brackets', () => {
      const input = '["item1", "item2",]';
      const result = sanitizeJsonString(input);
      expect(JSON.parse(result)).toEqual(['item1', 'item2']);
    });

    it('should remove single-line comments', () => {
      const input = `{
        "name": "test", // this is a comment
        "value": 123
      }`;
      const result = sanitizeJsonString(input);
      expect(JSON.parse(result)).toEqual({ name: 'test', value: 123 });
    });

    it('should remove multi-line comments', () => {
      const input = `{
        "name": "test", /* this is a
        multi-line comment */
        "value": 123
      }`;
      const result = sanitizeJsonString(input);
      expect(JSON.parse(result)).toEqual({ name: 'test', value: 123 });
    });
  });

  describe('sanitizeJsonString - Markdown Removal', () => {
    it('should remove markdown code blocks with json tag', () => {
      const input = '```json\n{"name": "test"}\n```';
      const result = sanitizeJsonString(input);
      expect(JSON.parse(result)).toEqual({ name: 'test' });
    });

    it('should remove markdown code blocks without language tag', () => {
      const input = '```\n{"name": "test"}\n```';
      const result = sanitizeJsonString(input);
      expect(JSON.parse(result)).toEqual({ name: 'test' });
    });

    it('should extract JSON from text with extra content', () => {
      const input = 'Here is the JSON: {"name": "test"} - end of response';
      const result = sanitizeJsonString(input);
      expect(JSON.parse(result)).toEqual({ name: 'test' });
    });
  });

  describe('sanitizeJsonString - Unterminated Strings', () => {
    it('should attempt to close unterminated strings (limited effectiveness)', () => {
      const input = '{"name": "test}';
      const result = sanitizeJsonString(input);

      // NOTE: repairUnterminatedStrings() has limited effectiveness
      // It closes the string but creates: {"name": "test}"}
      // The closing brace gets escaped inside the string
      // This test documents actual behavior showing the limitation
      expect(result).toContain('"test}"');

      // This shows why we can't rely on it for complex repairs
      // It's a best-effort attempt, not a guarantee
    });

    it('should handle simple unterminated string case', () => {
      // This is a case that DOES work
      const input = '{"name": "value';
      const result = sanitizeJsonString(input);
      expect(result).toContain('"value"');
    });

    it('should not break when encountering complex unterminated strings', () => {
      // Multiple unterminated strings are complex - function may not fix perfectly
      const input = '{"a": "value1, "b": "value2}';
      const result = sanitizeJsonString(input);

      // At minimum, should not crash and should attempt repair
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('sanitizeJsonString - Edge Cases from Production', () => {
    it('should NOT corrupt valid JSON with backslashes', () => {
      // This was the production bug: valid JSON was being corrupted
      const input = '{"language": "english", "sentiment": "neutral"}';
      const result = sanitizeJsonString(input);
      expect(JSON.parse(result)).toEqual({ language: 'english', sentiment: 'neutral' });
    });

    it('should handle escaped quotes in strings correctly', () => {
      const input = '{"message": "He said \\"hello\\""}';
      const result = sanitizeJsonString(input);
      expect(JSON.parse(result)).toEqual({ message: 'He said "hello"' });
    });

    it('should handle complex nested structures', () => {
      const input = `{
        "actions": {
          "web_search": {"needed": false},
          "memory": {"needed": true}
        }
      }`;
      const result = sanitizeJsonString(input);
      expect(JSON.parse(result)).toEqual({
        actions: {
          web_search: { needed: false },
          memory: { needed: true }
        }
      });
    });

    it('should handle arrays of objects', () => {
      const input = `{
        "facts": [
          {"content": "William Peebles", "tier": "CONTEXT"},
          {"content": "UC Berkeley", "tier": "CONTEXT"}
        ]
      }`;
      const result = sanitizeJsonString(input);
      const parsed = JSON.parse(result);
      expect(parsed.facts).toHaveLength(2);
      expect(parsed.facts[0].content).toBe('William Peebles');
    });
  });

  describe('parseJsonFromLLM', () => {
    it('should successfully parse valid JSON', () => {
      const input = '{"name": "test", "value": 123}';
      const result = parseJsonFromLLM(input, 'TestContext');
      expect(result).toEqual({ name: 'test', value: 123 });
    });

    it('should parse JSON with markdown wrapper', () => {
      const input = '```json\n{"name": "test"}\n```';
      const result = parseJsonFromLLM(input, 'TestContext');
      expect(result).toEqual({ name: 'test' });
    });

    it('should parse JSON with undefined values', () => {
      const input = '{"field": undefined}';
      const result = parseJsonFromLLM(input, 'TestContext');
      expect(result).toEqual({ field: null });
    });

    it('should parse JSON with trailing commas', () => {
      const input = '{"a": 1, "b": 2,}';
      const result = parseJsonFromLLM(input, 'TestContext');
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should throw error for completely invalid JSON', () => {
      const input = 'This is not JSON at all';
      expect(() => parseJsonFromLLM(input, 'TestContext')).toThrow();
    });

    it('should throw error for structurally broken JSON', () => {
      const input = '{"name": "test"'; // Missing closing brace
      expect(() => parseJsonFromLLM(input, 'TestContext')).toThrow();
    });
  });

  describe('validateJsonStructure', () => {
    it('should validate object with all required fields', () => {
      const obj = {
        intent: 'question',
        actions: {
          web_search: { needed: false }
        },
        confidence: 0.9
      };

      expect(() => {
        validateJsonStructure(obj, ['intent', 'actions', 'confidence'], 'Test');
      }).not.toThrow();
    });

    it('should validate nested fields', () => {
      const obj = {
        actions: {
          web_search: { needed: false }
        }
      };

      expect(() => {
        validateJsonStructure(obj, ['actions.web_search', 'actions.web_search.needed'], 'Test');
      }).not.toThrow();
    });

    it('should throw error for missing top-level field', () => {
      const obj = { intent: 'question' };

      expect(() => {
        validateJsonStructure(obj, ['intent', 'confidence'], 'Test');
      }).toThrow('Missing required field: confidence');
    });

    it('should throw error for missing nested field', () => {
      const obj = {
        actions: {
          web_search: {}
        }
      };

      expect(() => {
        validateJsonStructure(obj, ['actions.web_search.needed'], 'Test');
      }).toThrow('Missing required field: actions.web_search.needed');
    });

    it('should throw error for null values in required path', () => {
      const obj = {
        actions: null
      };

      expect(() => {
        validateJsonStructure(obj, ['actions.web_search'], 'Test');
      }).toThrow();
    });

    it('should throw error for undefined values in required path', () => {
      const obj = {
        actions: undefined
      };

      expect(() => {
        validateJsonStructure(obj, ['actions.web_search'], 'Test');
      }).toThrow();
    });
  });

  describe('Real-world LLM Responses', () => {
    it('should handle typical Gemini response with undefined', () => {
      const input = `{
        "intent": "question",
        "actions": {
          "web_search": {"needed": false, "query": undefined},
          "memory_retrieval": {"needed": true}
        },
        "confidence": 0.8
      }`;

      const result = parseJsonFromLLM(input, 'Gemini');
      expect(result.actions.web_search.query).toBeNull();
      expect(result.actions.memory_retrieval.needed).toBe(true);
    });

    it('should handle response with trailing commas', () => {
      const input = `{
        "intent": "question",
        "actions": {
          "web_search": {"needed": false,},
          "memory": {"needed": true,},
        },
        "confidence": 0.9,
      }`;

      const result = parseJsonFromLLM(input, 'Gemini');
      expect(result.confidence).toBe(0.9);
    });

    it('should handle response with comments', () => {
      const input = `{
        // User intent analysis
        "intent": "question",
        "actions": {
          "web_search": {"needed": false}, // No web search needed
          "memory": {"needed": true}
        },
        "confidence": 0.85 /* high confidence */
      }`;

      const result = parseJsonFromLLM(input, 'Gemini');
      expect(result.intent).toBe('question');
      expect(result.confidence).toBe(0.85);
    });

    it('should handle response in markdown', () => {
      const input = `Here is the analysis:

\`\`\`json
{
  "intent": "question",
  "confidence": 0.9
}
\`\`\`

That's the result.`;

      const result = parseJsonFromLLM(input, 'Gemini');
      expect(result.intent).toBe('question');
      expect(result.confidence).toBe(0.9);
    });
  });

  describe('Regression Tests - Production Bugs', () => {
    it('should NOT introduce backslashes where they don\'t belong (regression)', () => {
      // This was the actual production error that made responses "stupid"
      const input = '{"language": "english", "urgency": "normal", "sentiment": "neutral"}';
      const result = sanitizeJsonString(input);

      // Should NOT become: "language\": "english", "urgency": "normal\"
      expect(result).not.toContain('language\\');
      expect(result).not.toContain('normal\\');

      // Should parse successfully
      const parsed = JSON.parse(result);
      expect(parsed.language).toBe('english');
      expect(parsed.urgency).toBe('normal');
      expect(parsed.sentiment).toBe('neutral');
    });

    it('should handle the exact production error case', () => {
      // The actual malformed JSON from production logs
      const input = `{
        "language": "english",
        "urgency": "normal",
        "sentiment": "neutral",
        "confidence": 0.75
      }`;

      const result = parseJsonFromLLM(input, 'PromptAnalyzer');
      expect(result.language).toBe('english');
      expect(result.sentiment).toBe('neutral');

      // Validate structure
      expect(() => {
        validateJsonStructure(result, ['language', 'sentiment', 'confidence'], 'Test');
      }).not.toThrow();
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle empty string', () => {
      expect(() => parseJsonFromLLM('', 'Test')).toThrow();
    });

    it('should handle whitespace only', () => {
      expect(() => parseJsonFromLLM('   \n\n  ', 'Test')).toThrow();
    });

    it('should handle very large JSON', () => {
      const largeArray = Array(1000).fill(null).map((_, i) => ({ id: i, name: `item${i}` }));
      const input = JSON.stringify({ items: largeArray });

      const result = parseJsonFromLLM(input, 'Test');
      expect(result.items).toHaveLength(1000);
    });

    it('should handle deeply nested objects', () => {
      const input = `{
        "level1": {
          "level2": {
            "level3": {
              "level4": {
                "value": "deep"
              }
            }
          }
        }
      }`;

      const result = parseJsonFromLLM(input, 'Test');
      expect(result.level1.level2.level3.level4.value).toBe('deep');
    });

    it('should handle arrays with mixed types', () => {
      const input = '{"mixed": [1, "string", true, null, {"nested": "object"}]}';
      const result = parseJsonFromLLM(input, 'Test');

      expect(result.mixed).toHaveLength(5);
      expect(result.mixed[0]).toBe(1);
      expect(result.mixed[1]).toBe('string');
      expect(result.mixed[2]).toBe(true);
      expect(result.mixed[3]).toBeNull();
      expect(result.mixed[4]).toEqual({ nested: 'object' });
    });
  });
});
