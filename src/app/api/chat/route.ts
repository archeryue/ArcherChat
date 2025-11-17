import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, COLLECTIONS } from "@/lib/firebase-admin";
import { generateConversationTitle } from "@/lib/gemini";
import { getActivePrompt, processPromptVariables } from "@/lib/prompts";
import { ProviderFactory } from "@/lib/providers/provider-factory";
import { AIMessage } from "@/types/ai-providers";
import { NextRequest } from "next/server";
import { loadMemoryForChat, cleanupUserMemory } from "@/lib/memory";
import { FileAttachment, Message } from "@/types";
import { keywordSystem } from "@/lib/keywords/triggers";
import { KeywordTriggerType } from "@/lib/keywords/system";
import { isIntelligentAnalysisEnabled, isWebSearchEnabled } from "@/config/feature-flags";
import { promptAnalyzer } from "@/lib/prompt-analysis/analyzer";
import { contextOrchestrator } from "@/lib/context-engineering/orchestrator";
import { addMemoryFacts, generateMemoryId, calculateExpiry, getUserMemory, saveUserMemory } from "@/lib/memory/storage";
import { ProgressEmitter, registerEmitter, removeEmitter } from "@/lib/progress/emitter";
import { ProgressStep, ProgressEvent } from "@/lib/progress/types";
import { SearchResult } from "@/types/web-search";
import { PromptAnalysisResult } from "@/types/prompt-analysis";
import { MemoryFact } from "@/types/memory";
import { convertConversationToWhim } from "@/lib/whim/converter";
import { Timestamp } from 'firebase-admin/firestore';
import { Whim } from "@/types/whim";

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

    // Create progress emitter for this request
    const progressEmitter = new ProgressEmitter();
    const requestId = progressEmitter.getRequestId();
    registerEmitter(progressEmitter);

    console.log(`[Chat API] Created progress tracker: ${requestId}`);

    // Create the encoder and stream controller reference early
    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;

    // Subscribe to send progress events in real-time to the stream
    const progressUnsubscribe = progressEmitter.subscribe((event) => {
      if (streamController) {
        try {
          const progressLine = `[PROGRESS]${JSON.stringify(event)}\n`;
          streamController.enqueue(encoder.encode(progressLine));
          console.log('[Server] Sent real-time progress event:', event.step, event.status);
        } catch (err) {
          console.error('[Stream] Error sending progress:', err);
        }
      }
    });

    // Save user message
    // Store file metadata without base64 data to avoid Firestore size limits
    // Fixed: Conditionally include thumbnail field to prevent undefined values
    const fileMetadata = files?.map((file: FileAttachment) => {
      const metadata: Partial<FileAttachment> = {
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

    interface UserMessageData {
      role: "user";
      content: string;
      created_at: Date;
      files?: Partial<FileAttachment>[];
    }

    const userMessageData: UserMessageData = {
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

    // Check for slash commands (/save or /whim)
    const trimmedMessage = message.trim().toLowerCase();
    if (trimmedMessage === '/save' || trimmedMessage === '/whim') {
      console.log('[Chat API] Slash command detected, converting conversation to whim');

      // Exclude the /save command itself from the whim
      // Filter out the last message (which is the /save or /whim command)
      const messagesWithoutCommand = messages.slice(0, -1);

      // Convert conversation to whim
      const { title, content } = await convertConversationToWhim(messagesWithoutCommand);

      // Save whim to database
      const now = Timestamp.now();
      const whimData: Omit<Whim, 'id'> = {
        userId: session.user.id,
        title,
        content,
        conversationId,
        createdAt: now,
        updatedAt: now,
      };

      const whimRef = await db.collection('whims').add(whimData);
      const whimId = whimRef.id;

      console.log('[Chat API] Whim created:', whimId);

      // Return success message as a stream
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const successMessage = `✅ Whim saved successfully!\n\n**${title}**\n\nYou can view and edit this whim in the [Whims page](/whim).`;
          controller.enqueue(encoder.encode(`[CONTENT]${JSON.stringify(successMessage)}\n`));
          controller.close();
        },
      });

      // Save AI response to conversation
      await conversationRef.collection(COLLECTIONS.MESSAGES).add({
        role: "assistant",
        content: `✅ Whim saved successfully!\n\n**${title}**\n\nYou can view and edit this whim in the Whims page.`,
        created_at: new Date(),
      });

      // Update conversation timestamp
      await conversationRef.update({
        updated_at: new Date(),
      });

      // Cleanup
      removeEmitter(requestId);
      progressUnsubscribe();

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Request-Id": requestId,
        },
      });
    }

    // Check if this is the first message and update title
    if (messages.length === 1) {
      const title = await generateConversationTitle(message);
      await conversationRef.update({
        title: title,
        updated_at: new Date(),
      });
    }

    // Create stream immediately to send real-time progress
    let fullResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Set the stream controller so progress events can be sent in real-time
          streamController = controller;

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
          let webSearchResults: SearchResult[] | undefined;
          let extractedFacts: Partial<MemoryFact>[] | undefined;
          let analysis: PromptAnalysisResult | undefined;

          if (isIntelligentAnalysisEnabled()) {
            console.log('[Chat API] Using intelligent analysis');

            // Emit progress: Analyzing prompt
            progressEmitter.emit({
              step: ProgressStep.ANALYZING_PROMPT,
              status: 'started',
              message: 'Analyzing your question...',
              timestamp: Date.now(),
            });

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

            // Emit progress: Analysis complete
            progressEmitter.emit({
              step: ProgressStep.ANALYZING_PROMPT,
              status: 'completed',
              message: 'Analysis complete',
              timestamp: Date.now(),
            });

            console.log('[Chat API] Analysis result:', {
              intent: analysis.intent,
              confidence: analysis.confidence,
              actions: Object.keys(analysis.actions).filter(
                (k) => (analysis!.actions as any)[k].needed
              ),
            });

            // Emit progress for context preparation steps
            const needsWebSearch = analysis.actions.web_search?.needed;
            const needsMemory = analysis.actions.memory_retrieval?.needed;

            if (needsWebSearch) {
              progressEmitter.emit({
                step: ProgressStep.SEARCHING_WEB,
                status: 'started',
                message: `Searching for: ${analysis.actions.web_search.query}`,
                timestamp: Date.now(),
              });
            }

            if (needsMemory) {
              progressEmitter.emit({
                step: ProgressStep.RETRIEVING_MEMORY,
                status: 'started',
                message: 'Retrieving relevant memories...',
                timestamp: Date.now(),
              });
            }

            // Step 2: Orchestrate context preparation
            const t3 = Date.now();
            const contextResult = await contextOrchestrator.prepare(
              analysis,
              session.user.id,
              conversationId,
              progressEmitter  // Pass progress emitter for content fetching/extraction tracking
            );
            const t4 = Date.now();
            console.log(`[Performance] Context preparation took ${t4 - t3}ms`);

            // Emit progress: Context preparation complete
            if (needsWebSearch) {
              const searchResults = contextResult.webSearchResults || [];
              progressEmitter.emit({
                step: ProgressStep.SEARCHING_WEB,
                status: 'completed',
                message: `Found ${searchResults.length} results`,
                timestamp: Date.now(),
              });
            }

            if (needsMemory) {
              progressEmitter.emit({
                step: ProgressStep.RETRIEVING_MEMORY,
                status: 'completed',
                message: `Retrieved ${contextResult.memoriesRetrieved?.length || 0} memories`,
                timestamp: Date.now(),
              });
            }

            // Emit progress: Building context
            progressEmitter.emit({
              step: ProgressStep.BUILDING_CONTEXT,
              status: 'started',
              message: 'Building context for AI...',
              timestamp: Date.now(),
            });

            // Step 3: Build final prompt with context
            if (contextResult.context) {
              finalPrompt = `${processedPrompt}\n\n${contextResult.context}`;
            }

            // Use selected model from analysis
            selectedModelName = contextResult.modelName;
            webSearchResults = contextResult.webSearchResults;

            // Emit progress: Context built
            progressEmitter.emit({
              step: ProgressStep.BUILDING_CONTEXT,
              status: 'completed',
              message: 'Context ready',
              timestamp: Date.now(),
            });

            // Save extracted facts from analysis
            extractedFacts = analysis.actions.memory_extraction.facts;

            if (contextResult.rateLimitError) {
              console.warn('[Chat API] Rate limit error:', contextResult.rateLimitError);
            }
          } else {
            // OLD: Load user's memory and append to system prompt (keyword-based)
            console.log('[Chat API] Using keyword-based system');

            progressEmitter.emit({
              step: ProgressStep.RETRIEVING_MEMORY,
              status: 'started',
              message: 'Loading context...',
              timestamp: Date.now(),
            });

            const memoryContext = await loadMemoryForChat(session.user.id);
            finalPrompt = memoryContext
              ? `${processedPrompt}\n\n${memoryContext}`
              : processedPrompt;

            progressEmitter.emit({
              step: ProgressStep.RETRIEVING_MEMORY,
              status: 'completed',
              message: 'Context loaded',
              timestamp: Date.now(),
            });
          }

          // Create AI provider instance
          const provider = ProviderFactory.createDefaultProvider(selectedModelName);

          // Emit progress: Starting to generate response
          progressEmitter.emit({
            step: ProgressStep.GENERATING_RESPONSE,
            status: 'started',
            message: 'Generating response...',
            timestamp: Date.now(),
          });

          // Stream AI response content
          for await (const chunk of provider.streamResponse(
            messages,
            finalPrompt,
            promptConfig.temperature,
            files // Pass files with full base64 data to AI
          )) {
            fullResponse += chunk;
            // Send content with [CONTENT] prefix, JSON-encoded to preserve newlines
            const contentLine = `[CONTENT]${JSON.stringify(chunk)}\n`;
            controller.enqueue(encoder.encode(contentLine));
          }

          // Add source citations if we have web search results
          if (webSearchResults && webSearchResults.length > 0) {
            const citations = contextOrchestrator.formatSourceCitations(webSearchResults);
            if (citations) {
              fullResponse += citations;
              const citationLine = `[CONTENT]${JSON.stringify(citations)}\n`;
              controller.enqueue(encoder.encode(citationLine));
            }
          }

          // Send completion progress event directly to ensure it's received
          const completionEvent = {
            step: ProgressStep.GENERATING_RESPONSE,
            status: 'completed' as const,
            message: 'Response complete',
            timestamp: Date.now(),
          };
          const completionLine = `[PROGRESS]${JSON.stringify(completionEvent)}\n`;
          controller.enqueue(encoder.encode(completionLine));
          console.log('[Server] Sent completion event:', completionEvent.step, completionEvent.status);

          // Unsubscribe from progress updates
          progressUnsubscribe();

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

          console.log(`[Chat API] Completed request: ${requestId}`);

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
        "X-Request-Id": requestId, // Include requestId for tracking
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
