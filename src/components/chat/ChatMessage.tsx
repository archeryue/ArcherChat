"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github.css";
import { MessageClient } from "@/types";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  message: MessageClient;
  userName?: string;
  userAvatar?: string;
}

export function ChatMessage({ message, userName, userAvatar }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex gap-3 p-4",
        isUser ? "bg-gray-50" : "bg-white"
      )}
    >
      <div className="flex-shrink-0">
        {isUser ? (
          userAvatar ? (
            <img
              src={userAvatar}
              alt={userName || "User"}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
              {userName?.charAt(0).toUpperCase() || "U"}
            </div>
          )
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold">
            AI
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="font-semibold text-sm mb-1">
          {isUser ? userName || "You" : "Assistant"}
        </div>
        <div className="prose prose-sm max-w-none break-words overflow-x-auto">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                return !inline ? (
                  <code className={className} {...props}>
                    {children}
                  </code>
                ) : (
                  <code
                    className="bg-gray-100 rounded px-1 py-0.5 text-sm"
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
              pre({ children, ...props }) {
                return (
                  <pre className="overflow-x-auto" {...props}>
                    {children}
                  </pre>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>

          {/* Display image if present */}
          {(message.image_url || message.image_data) && (
            <div className="mt-4">
              <img
                src={message.image_url || `data:image/png;base64,${message.image_data}`}
                alt="Generated image"
                className="rounded-lg max-w-full h-auto shadow-lg"
                style={{ maxHeight: '500px' }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
