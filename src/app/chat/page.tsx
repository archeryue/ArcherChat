"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatTopBar } from "@/components/chat/ChatTopBar";
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
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversations = async () => {
    try {
      const response = await fetch("/api/conversations");
      if (response.ok) {
        const data = await response.json();
        setConversations(
          data.map((conv: any) => ({
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

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          assistantContent += chunk;

          // Extract image data if present and store separately
          const imageMatch = assistantContent.match(/!\[Generated Image\]\(data:(image\/[^;]+);base64,([A-Za-z0-9+/=]+)\)/);

          let contentToDisplay = assistantContent;
          let imageData = undefined;

          if (imageMatch) {
            // Extract image data and remove from content
            imageData = imageMatch[2];
            contentToDisplay = assistantContent.replace(/!\[Generated Image\]\(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+\)/, '');
          }

          // Update assistant message with streamed content
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    content: contentToDisplay.trim(),
                    image_data: imageData
                  }
                : msg
            )
          );
        }
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
    <div className="h-screen flex flex-col">
      {/* Top Bar */}
      <ChatTopBar
        userName={session.user.name || undefined}
        userEmail={session.user.email || undefined}
        userAvatar={session.user.image || undefined}
        isAdmin={session.user.isAdmin}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <ChatSidebar
          conversations={conversations}
          activeConversationId={conversationId || undefined}
          onNewConversation={createConversation}
          onSelectConversation={loadConversation}
          onDeleteConversation={deleteConversation}
        />

        {/* Main Chat Area */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto bg-slate-50">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-4 px-6">
                  <div className="text-6xl mb-2">💬</div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    Welcome to ArcherChat
                  </h2>
                  <p className="text-slate-600 max-w-md mx-auto">
                    Start a conversation with AI. I can help answer questions, generate images, and remember your preferences.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    userName={session.user.name || undefined}
                    userAvatar={session.user.image || undefined}
                  />
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <ChatInput onSendMessage={handleSendMessage} disabled={isLoading} />
        </div>
      </div>
    </div>
  );
}
