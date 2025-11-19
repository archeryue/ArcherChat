"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { LoadingPage } from "@/components/ui/loading";
import { MessageClient, ConversationClient } from "@/types";
import { FileAttachment } from "@/types/file";

export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<MessageClient[]>([]);
  const [conversations, setConversations] = useState<ConversationClient[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Load conversations on mount
  useEffect(() => {
    if (session?.user) {
      loadConversations();
    }
  }, [session]);

  // Don't auto-create conversations - wait for user to send first message

  // Scroll to bottom when messages change
  // Force layout recalculation after KaTeX renders (makes content shorter)
  useEffect(() => {
    const scrollToBottom = () => {
      const container = messagesEndRef.current?.parentElement;
      if (container) {
        // Use requestAnimationFrame to ensure layout is complete
        requestAnimationFrame(() => {
          // Force layout recalculation on multiple elements
          const _ = container.offsetHeight;
          const __ = container.scrollHeight;
          // Then scroll to bottom
          container.scrollTop = container.scrollHeight;
        });
      }
    };

    // Initial scroll
    scrollToBottom();

    // Use MutationObserver to detect when KaTeX adds rendered elements
    const messagesContainer = messagesEndRef.current?.parentElement;
    if (!messagesContainer) return;

    // Debounce: Only scroll after KaTeX finishes all mutations
    let mutationTimer: NodeJS.Timeout | null = null;
    const observer = new MutationObserver(() => {
      // Clear previous timer
      if (mutationTimer) {
        clearTimeout(mutationTimer);
      }

      // Wait for mutations to settle (50ms after last mutation)
      mutationTimer = setTimeout(() => {
        scrollToBottom();
      }, 50);
    });

    // Watch for DOM changes (KaTeX adding rendered math)
    observer.observe(messagesContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });

    // Also scroll after longer delay as fallback
    const fallbackTimer = setTimeout(scrollToBottom, 800);

    return () => {
      observer.disconnect();
      if (mutationTimer) clearTimeout(mutationTimer);
      clearTimeout(fallbackTimer);
    };
  }, [messages]);

  const loadConversations = async () => {
    try {
      const response = await fetch("/api/conversations");
      if (response.ok) {
        const data = await response.json();
        const convList = data.conversations || [];
        setConversations(
          convList.map((conv: any) => ({
            ...conv,
            created_at: new Date(conv.created_at),
            updated_at: new Date(conv.updated_at),
          }))
        );
      }
    } catch (error) {
      console.error("Failed to load conversations:", error);
    }
  };

  const createConversation = () => {
    // Reset to new conversation state without creating in database
    // Conversation will be created when first message is sent
    setConversationId(null);
    setMessages([]);
  };

  const loadConversation = async (id: string) => {
    try {
      const response = await fetch(`/api/conversations/${id}`);
      if (response.ok) {
        const data = await response.json();
        setConversationId(id);
        setMessages(
          data.messages.map((msg: any) => ({
            ...msg,
            created_at: new Date(msg.created_at),
          }))
        );
      }
    } catch (error) {
      console.error("Failed to load conversation:", error);
    }
  };

  const deleteConversation = async (id: string) => {
    if (!confirm("Are you sure you want to delete this conversation?")) {
      return;
    }

    try {
      const response = await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await loadConversations();
        if (conversationId === id) {
          setConversationId(null);
          setMessages([]);
          // Create a new conversation
          createConversation();
        }
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  };

  const handleSendMessage = async (content: string, files?: FileAttachment[]) => {
    // Create conversation if it doesn't exist
    let currentConversationId = conversationId;
    if (!currentConversationId) {
      try {
        const response = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "New Conversation",
          }),
        });

        if (response.ok) {
          const data = await response.json();
          currentConversationId = data.id;
          setConversationId(data.id);
        } else {
          console.error("Failed to create conversation");
          return;
        }
      } catch (error) {
        console.error("Failed to create conversation:", error);
        return;
      }
    }

    // Add user message immediately
    const userMessage: MessageClient = {
      id: Date.now().toString(),
      role: "user",
      content,
      created_at: new Date(),
      files,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Add placeholder for assistant message
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: MessageClient = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      created_at: new Date(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: currentConversationId,
          message: content,
          files,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      // Stream the response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let assistantContent = "";
        let buffer = ""; // Buffer for incomplete lines
        const progressEventsList: any[] = [];
        let lastUpdateTime = 0;
        const UPDATE_THROTTLE_MS = 50; // Update UI every 50ms max

        const updateUI = () => {
          // Extract image data if present and store separately
          const imageMatch = assistantContent.match(/!\[Generated Image\]\(data:(image\/[^;]+);base64,([A-Za-z0-9+/=]+)\)/);

          let contentToDisplay = assistantContent;
          let imageData = undefined;

          if (imageMatch) {
            // Extract image data and remove from content
            imageData = imageMatch[2];
            contentToDisplay = assistantContent.replace(/!\[Generated Image\]\(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+\)/, '');
          }

          // Update assistant message with streamed content AND progress events
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    content: contentToDisplay,
                    image_data: imageData,
                    progressEvents: progressEventsList.length > 0 ? [...progressEventsList] : undefined,
                  }
                : msg
            )
          );
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ""; // Keep last incomplete line in buffer

          let shouldUpdate = false;

          for (const line of lines) {
            if (line.startsWith('[PROGRESS]')) {
              // Parse and store progress event
              try {
                const progressData = JSON.parse(line.substring(10)); // Remove '[PROGRESS]' prefix
                progressEventsList.push(progressData);
                console.log('[Chat] Progress:', progressData);
                shouldUpdate = true; // Always update UI for progress events
              } catch (err) {
                console.error('[Chat] Failed to parse progress:', err);
              }
            } else if (line.startsWith('[CONTENT]')) {
              // Extract content chunk (JSON-encoded to preserve newlines)
              try {
                const contentChunk = JSON.parse(line.substring(9)); // Remove '[CONTENT]' prefix and parse JSON
                assistantContent += contentChunk;
                shouldUpdate = true;
              } catch (err) {
                console.error('[Chat] Failed to parse content:', err);
              }
            }
          }

          // Throttle UI updates to prevent React from rendering partial states
          const now = Date.now();
          if (shouldUpdate && (now - lastUpdateTime >= UPDATE_THROTTLE_MS)) {
            updateUI();
            lastUpdateTime = now;
          }
        }

        // Final update to ensure we show complete content
        updateUI();
      }

      // Reload conversations to update title if it was the first message
      await loadConversations();
    } catch (error) {
      console.error("Error sending message:", error);
      // Remove the placeholder assistant message on error
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId));
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "loading") {
    return <LoadingPage message="Loading your chat..." />;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="h-screen flex">
      {/* Sidebar */}
      <ChatSidebar
        conversations={conversations}
        activeConversationId={conversationId || undefined}
        onNewConversation={createConversation}
        onSelectConversation={loadConversation}
        onDeleteConversation={deleteConversation}
        userName={session.user.name || undefined}
        userEmail={session.user.email || undefined}
        userAvatar={session.user.image || undefined}
        isAdmin={session.user.isAdmin}
      />

        {/* Main Chat Area */}
        <div className="flex-1 min-w-0 flex flex-col relative bg-slate-50">
          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto cursor-default pb-32 messages-container"
            onMouseDown={(e) => {
              // Prevent clicks in empty area from focusing the input, but allow text selection
              const target = e.target as HTMLElement;
              // Allow selection in prose content (message text)
              if (target.closest('.prose')) {
                return;
              }
              if (!target.closest('button') && !target.closest('a') && !target.closest('input') && !target.closest('textarea')) {
                e.preventDefault();
              }
            }}
          >
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-4 px-6 select-none">
                  <div className="text-6xl mb-2">💬</div>
                  <h2 className="text-2xl font-bold">
                    Welcome to <span className="text-blue-600">Whim</span><span className="text-slate-900">Craft</span>
                  </h2>
                  <p className="text-slate-600 max-w-md mx-auto">
                    Start a conversation with AI. I can help answer questions, generate images, and remember your preferences.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {messages.map((message, index) => {
                  // Check if this is the last assistant message being generated
                  const isLastMessage = index === messages.length - 1;
                  const isAssistant = message.role === "assistant";
                  const isGeneratingThis = isLastMessage && isAssistant && isLoading;

                  return (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      userName={session.user.name || undefined}
                      userAvatar={session.user.image || undefined}
                      isGenerating={isGeneratingThis}
                    />
                  );
                })}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Floating Input */}
          <div className="absolute bottom-0 left-0 right-0 pointer-events-none bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pt-8">
            <div className="pointer-events-auto">
              <ChatInput onSendMessage={handleSendMessage} disabled={isLoading} />
            </div>
          </div>
        </div>
    </div>
  );
}
