import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const MODEL_NAME = "gemini-2.0-flash-exp";

export async function* streamGeminiResponse(
  messages: { role: string; content: string }[],
  systemPrompt?: string,
  temperature?: number
) {
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: temperature ?? 0.7,
    },
  });

  // Convert messages to Gemini format
  const history = messages.slice(0, -1).map((msg) => ({
    role: msg.role === "user" ? "user" : "model",
    parts: [{ text: msg.content }],
  }));

  const lastMessage = messages[messages.length - 1];

  const chat = model.startChat({
    history: history,
  });

  try {
    const result = await chat.sendMessageStream(lastMessage.content);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      yield text;
    }
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}

// Generate a conversation title from the first message
export async function generateConversationTitle(
  firstMessage: string
): Promise<string> {
  // Simple approach: use first 50 chars
  if (firstMessage.length <= 50) {
    return firstMessage;
  }

  // Try to cut at a word boundary
  const truncated = firstMessage.substring(0, 50);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > 0) {
    return truncated.substring(0, lastSpace) + "...";
  }

  return truncated + "...";
}
