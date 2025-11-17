import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIMessage } from '@/types/ai-providers';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Convert a conversation to markdown format
 */
export function conversationToMarkdown(messages: AIMessage[]): string {
  let markdown = '';

  for (const message of messages) {
    const role = message.role === 'user' ? 'User' : 'AI';
    markdown += `## ${role}\n\n`;
    markdown += `${message.content}\n\n`;
    markdown += `---\n\n`;
  }

  return markdown.trim();
}

/**
 * Generate a concise title for a conversation using AI
 */
export async function generateConversationTitle(messages: AIMessage[]): Promise<string> {
  try {
    // Use Gemini Flash Lite for cost-effective title generation
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

    // Build a summary of the conversation
    const conversationSummary = messages
      .slice(0, 6) // Take first 6 messages for context
      .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.slice(0, 200)}`)
      .join('\n');

    const prompt = `Analyze this conversation and generate a short, concise title (4-5 words maximum).
The title should capture the main topic. Be brief and direct.
Use title case. Do not use quotes, articles (a, an, the), or special formatting.

Conversation:
${conversationSummary}

Title:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let title = response.text().trim();

    // Clean up the title
    title = title.replace(/^["']|["']$/g, ''); // Remove quotes
    title = title.replace(/^Title:\s*/i, ''); // Remove "Title:" prefix
    title = title.slice(0, 100); // Max 100 chars

    // Fallback if title generation fails
    if (!title || title.length < 3) {
      const firstUserMessage = messages.find(m => m.role === 'user');
      if (firstUserMessage) {
        title = firstUserMessage.content.slice(0, 50).trim();
        if (firstUserMessage.content.length > 50) {
          title += '...';
        }
      } else {
        title = 'Untitled Whim';
      }
    }

    return title;
  } catch (error) {
    console.error('Error generating title:', error);

    // Fallback: Use first user message
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      let title = firstUserMessage.content.slice(0, 50).trim();
      if (firstUserMessage.content.length > 50) {
        title += '...';
      }
      return title;
    }

    return 'Untitled Whim';
  }
}

/**
 * Convert conversation to whim (markdown + title)
 */
export async function convertConversationToWhim(messages: AIMessage[]): Promise<{
  title: string;
  content: string;
}> {
  const [title, content] = await Promise.all([
    generateConversationTitle(messages),
    Promise.resolve(conversationToMarkdown(messages))
  ]);

  return { title, content };
}
