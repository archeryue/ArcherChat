/**
 * Whim Assistant Prompts
 *
 * Contextual prompts for the AI assistant that helps edit and improve whim content.
 */

export interface WhimAssistantContext {
  fullContent: string;
  selectedText?: string;
  lineRange?: { start: number; end: number };
}

/**
 * Build the system prompt for the whim assistant
 */
export function buildWhimAssistantPrompt(context: WhimAssistantContext): string {
  const parts: string[] = [];

  // Base instructions
  parts.push(`You are an AI writing assistant helping to edit and improve content.
Your role is to help the user refine, clarify, expand, or transform their text.

## Guidelines
- Be concise and actionable in your responses
- When providing edits, format them clearly so they can be easily applied
- Maintain the original tone and style unless asked to change it
- Support both English and Chinese content naturally
- If asked to translate, preserve the original meaning accurately`);

  // Document context
  parts.push(`\n## Current Document
\`\`\`
${context.fullContent}
\`\`\``);

  // Selected text context
  if (context.selectedText) {
    parts.push(`\n## Selected Text (User is asking about this specific part)
\`\`\`
${context.selectedText}
\`\`\`

Focus your response on this selected portion. When suggesting improvements, provide the replacement text clearly.`);
  } else {
    parts.push(`\n## Note
The user is working with the full document. Consider the entire content when providing suggestions.`);
  }

  // Response format instructions
  parts.push(`\n## Response Format
When providing edited or improved text, use this format:

\`\`\`suggestion
[Your improved text here]
\`\`\`

This allows the user to easily apply your suggestions.

For explanations or answers, respond naturally without the suggestion block.`);

  return parts.join('\n');
}

/**
 * Detect if user is asking for a specific type of task
 */
export function detectWhimTaskType(message: string): 'improve' | 'explain' | 'translate' | 'summarize' | 'custom' {
  const lowerMessage = message.toLowerCase();

  // Improve patterns
  if (lowerMessage.includes('improve') ||
      lowerMessage.includes('make it better') ||
      lowerMessage.includes('enhance') ||
      lowerMessage.includes('refine') ||
      lowerMessage.includes('改进') ||
      lowerMessage.includes('优化') ||
      lowerMessage.includes('润色')) {
    return 'improve';
  }

  // Explain patterns
  if (lowerMessage.includes('explain') ||
      lowerMessage.includes('what does') ||
      lowerMessage.includes('what is') ||
      lowerMessage.includes('meaning') ||
      lowerMessage.includes('解释') ||
      lowerMessage.includes('什么意思')) {
    return 'explain';
  }

  // Translate patterns
  if (lowerMessage.includes('translate') ||
      lowerMessage.includes('翻译') ||
      lowerMessage.includes('to english') ||
      lowerMessage.includes('to chinese') ||
      lowerMessage.includes('转换')) {
    return 'translate';
  }

  // Summarize patterns
  if (lowerMessage.includes('summarize') ||
      lowerMessage.includes('summary') ||
      lowerMessage.includes('key points') ||
      lowerMessage.includes('总结') ||
      lowerMessage.includes('概括') ||
      lowerMessage.includes('要点')) {
    return 'summarize';
  }

  return 'custom';
}
