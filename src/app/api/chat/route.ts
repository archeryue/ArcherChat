import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, COLLECTIONS } from "@/lib/firebase-admin";
import { generateConversationTitle } from "@/lib/gemini";
import { getActivePrompt, processPromptVariables } from "@/lib/prompts";
import { ProviderFactory } from "@/lib/providers/provider-factory";
import { AIMessage } from "@/types/ai-providers";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { conversationId, message } = await req.json();

    if (!message || !conversationId) {
      return new Response("Missing required fields", { status: 400 });
    }

    // Verify conversation belongs to user
    const conversationRef = db
      .collection(COLLECTIONS.CONVERSATIONS)
      .doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return new Response("Conversation not found", { status: 404 });
    }

    const conversationData = conversationDoc.data();
    if (conversationData?.user_id !== session.user.id) {
      return new Response("Forbidden", { status: 403 });
    }

    // Save user message
    const userMessageRef = await conversationRef
      .collection(COLLECTIONS.MESSAGES)
      .add({
        role: "user",
        content: message,
        created_at: new Date(),
      });

    // Get all messages for context
    const messagesSnapshot = await conversationRef
      .collection(COLLECTIONS.MESSAGES)
      .orderBy("created_at", "asc")
      .get();

    const messages: AIMessage[] = messagesSnapshot.docs.map((doc) => ({
      role: doc.data().role as "user" | "assistant",
      content: doc.data().content,
    }));

    // Check if this is the first message and update title
    if (messages.length === 1) {
      const title = await generateConversationTitle(message);
      await conversationRef.update({
        title: title,
        updated_at: new Date(),
      });
    }

    // Get active prompt configuration
    const promptConfig = await getActivePrompt();

    // Process prompt variables
    const processedPrompt = processPromptVariables(promptConfig.systemPrompt, {
      userName: session.user.name || "User",
      currentDate: new Date().toLocaleDateString(),
      currentTime: new Date().toLocaleTimeString(),
    });

    // Create AI provider instance
    const provider = ProviderFactory.createDefaultProvider();

    // Stream response from AI provider
    const encoder = new TextEncoder();
    let fullResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of provider.streamResponse(
            messages,
            processedPrompt,
            promptConfig.temperature
          )) {
            fullResponse += chunk;
            controller.enqueue(encoder.encode(chunk));
          }

          // Save assistant message
          await conversationRef.collection(COLLECTIONS.MESSAGES).add({
            role: "assistant",
            content: fullResponse,
            created_at: new Date(),
          });

          // Update conversation timestamp
          await conversationRef.update({
            updated_at: new Date(),
          });

          controller.close();
        } catch (error) {
          console.error("Streaming error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
