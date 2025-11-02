import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, COLLECTIONS } from "@/lib/firebase-admin";
import { generateConversationTitle } from "@/lib/gemini";
import { getActivePrompt, processPromptVariables } from "@/lib/prompts";
import { ProviderFactory } from "@/lib/providers/provider-factory";
import { AIMessage } from "@/types/ai-providers";
import { NextRequest } from "next/server";
import { loadMemoryForChat, cleanupUserMemory } from "@/lib/memory";
import { FileAttachment } from "@/types/file";
import { keywordSystem } from "@/lib/keywords/triggers";
import { KeywordTriggerType } from "@/lib/keywords/system";
import { isIntelligentAnalysisEnabled, isWebSearchEnabled } from "@/config/feature-flags";
import { promptAnalyzer } from "@/lib/prompt-analysis/analyzer";
import { contextOrchestrator } from "@/lib/context-engineering/orchestrator";
import { addMemoryFacts, generateMemoryId, calculateExpiry, getUserMemory, saveUserMemory } from "@/lib/memory/storage";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { conversationId, message, files } = await req.json();

    if (!conversationId || (!message && (!files || files.length === 0))) {
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
    // Store file metadata without base64 data to avoid Firestore size limits
    // Fixed: Conditionally include thumbnail field to prevent undefined values
    const fileMetadata = files?.map((file: FileAttachment) => {
      const metadata: any = {
        id: file.id,
        name: file.name,
        type: file.type,
        mimeType: file.mimeType,
        size: file.size,
      };

      // Only include thumbnail if it exists (images have thumbnails, PDFs don't)
      if (file.thumbnail) {
        metadata.thumbnail = file.thumbnail;
      }

      return metadata;
    });

    const userMessageData: any = {
      role: "user",
      content: message || "",
      created_at: new Date(),
    };

    if (fileMetadata && fileMetadata.length > 0) {
      userMessageData.files = fileMetadata;
    }

    const userMessageRef = await conversationRef
      .collection(COLLECTIONS.MESSAGES)
      .add(userMessageData);

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

    // NEW: Intelligent Analysis (if enabled)
    let finalPrompt = processedPrompt;
    let selectedModelName: string | undefined;
    let webSearchResults: any[] | undefined;
    let extractedFacts: any[] | undefined;
    let analysis: any | undefined;

    if (isIntelligentAnalysisEnabled()) {
      console.log('[Chat API] Using intelligent analysis');

      // Step 1: Analyze user input
      const t1 = Date.now();
      analysis = await promptAnalyzer.analyze({
        message,
        files,
        conversationHistory: messages.slice(-5), // Last 5 messages for context
        userSettings: {
          webSearchEnabled: isWebSearchEnabled(),
          languagePreference: undefined, // Auto-detect
        },
      });
      const t2 = Date.now();
      console.log(`[Performance] PromptAnalysis took ${t2 - t1}ms`);

      console.log('[Chat API] Analysis result:', {
        intent: analysis.intent,
        confidence: analysis.confidence,
        actions: Object.keys(analysis.actions).filter(
          (k) => (analysis.actions as any)[k].needed
        ),
      });

      // Step 2: Orchestrate context preparation
      const t3 = Date.now();
      const contextResult = await contextOrchestrator.prepare(
        analysis,
        session.user.id,
        conversationId
      );
      const t4 = Date.now();
      console.log(`[Performance] Context preparation took ${t4 - t3}ms`);

      // Step 3: Build final prompt with context
      if (contextResult.context) {
        finalPrompt = `${processedPrompt}\n\n${contextResult.context}`;
      }

      // Use selected model from analysis
      selectedModelName = contextResult.modelName;
      webSearchResults = contextResult.webSearchResults;

      // Save extracted facts from analysis
      extractedFacts = analysis.actions.memory_extraction.facts;

      if (contextResult.rateLimitError) {
        console.warn('[Chat API] Rate limit error:', contextResult.rateLimitError);
      }
    } else {
      // OLD: Load user's memory and append to system prompt (keyword-based)
      console.log('[Chat API] Using keyword-based system');
      const memoryContext = await loadMemoryForChat(session.user.id);
      finalPrompt = memoryContext
        ? `${processedPrompt}\n\n${memoryContext}`
        : processedPrompt;
    }

    // Create AI provider instance
    const provider = ProviderFactory.createDefaultProvider(selectedModelName);

    // Stream response from AI provider
    // Pass files from current request (with full base64 data) for AI processing
    const encoder = new TextEncoder();
    let fullResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of provider.streamResponse(
            messages,
            finalPrompt,
            promptConfig.temperature,
            files // Pass files with full base64 data to AI
          )) {
            fullResponse += chunk;
            controller.enqueue(encoder.encode(chunk));
          }

          // Add source citations if we have web search results
          if (webSearchResults && webSearchResults.length > 0) {
            const citations = contextOrchestrator.formatSourceCitations(webSearchResults);
            if (citations) {
              fullResponse += citations;
              controller.enqueue(encoder.encode(citations));
            }
          }

          // Save assistant message
          // Strip base64 image data to avoid Firestore size limits (1MB max)
          // Images will display during session but won't persist after reload
          const contentToSave = fullResponse.replace(
            /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g,
            'data:image/png;base64,[image-data-removed-due-to-size]'
          );

          await conversationRef.collection(COLLECTIONS.MESSAGES).add({
            role: "assistant",
            content: contentToSave,
            created_at: new Date(),
          });

          // Update conversation timestamp
          await conversationRef.update({
            updated_at: new Date(),
          });

          // Post-processing: Save extracted memories or use keyword system
          if (isIntelligentAnalysisEnabled()) {
            // NEW: Save extracted facts from PromptAnalysis
            if (extractedFacts && extractedFacts.length > 0) {
              console.log(`[Chat API] Saving ${extractedFacts.length} extracted facts`);

              // Transform raw facts from PromptAnalyzer into complete MemoryFact objects
              const completedFacts = extractedFacts.map((rawFact: any) => ({
                id: generateMemoryId(),
                content: rawFact.content,
                category: rawFact.category,
                tier: rawFact.tier,
                confidence: rawFact.confidence,
                created_at: new Date(),
                last_used_at: new Date(),
                use_count: 0,
                expires_at: calculateExpiry(rawFact.tier),
                extracted_from: conversationId,
                auto_extracted: true,
                keywords: rawFact.keywords || [],
                source: rawFact.source || 'AI analysis',
              }));

              console.log(`[Chat API] Transformed facts:`, completedFacts.map((f: any) => ({
                content: f.content,
                tier: f.tier,
                category: f.category
              })));

              addMemoryFacts(session.user.id, completedFacts, analysis?.language)
                .then(() => cleanupUserMemory(session.user.id))
                .catch((err) => console.error("Memory save error:", err));
            } else if (analysis?.language) {
              // No facts extracted but language preference detected
              addMemoryFacts(session.user.id, [], analysis.language)
                .catch((err) => console.error("Language preference save error:", err));
            }
          } else {
            // OLD: Check for keyword triggers in user message
            const keywordResults = keywordSystem.check(message);
            const hasMemoryTrigger = keywordResults.some(
              (r) => r.matched && r.type === KeywordTriggerType.MEMORY_GENERAL
            );

            // Execute keyword-triggered actions in background (don't await)
            if (hasMemoryTrigger) {
              keywordSystem
                .execute(KeywordTriggerType.MEMORY_GENERAL, {
                  conversationId,
                  userId: session.user.id,
                  message,
                })
                .then(() => cleanupUserMemory(session.user.id))
                .catch((err) => console.error("Keyword action error:", err));
            }
          }

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
