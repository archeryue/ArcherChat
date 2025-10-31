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
        "flex gap-4 px-6 py-6 transition-colors",
        isUser ? "bg-slate-50/50" : "bg-white hover:bg-slate-50/30"
      )}
    >
      <div className="flex-shrink-0">
        {isUser ? (
          userAvatar ? (
            <img
              src={userAvatar}
              alt={userName || "User"}
              className="w-9 h-9 rounded-full ring-2 ring-slate-200"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-semibold shadow-sm">
              {userName?.charAt(0).toUpperCase() || "U"}
            </div>
          )
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold shadow-md">
            AI
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="font-semibold text-sm mb-2 text-slate-700">
          {isUser ? userName || "You" : "Assistant"}
        </div>
        <div className="prose prose-slate prose-sm max-w-none break-words overflow-x-auto">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              code({ node, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || "");
                const inline = !match;
                return !inline ? (
                  <code className={className} {...props}>
                    {children}
                  </code>
                ) : (
                  <code
                    className="bg-slate-100 text-slate-800 rounded px-1.5 py-0.5 text-sm font-mono"
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
            <div className="mt-4 relative inline-block">
              <img
                src={message.image_url || `data:image/png;base64,${message.image_data}`}
                alt="Generated image"
                className="rounded-lg max-w-full h-auto shadow-lg"
                style={{ maxHeight: '500px' }}
              />
              <button
                onClick={() => {
                  const imageData = message.image_url || `data:image/png;base64,${message.image_data}`;
                  const link = document.createElement('a');
                  link.href = imageData;
                  link.download = `generated-image-${Date.now()}.png`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="absolute top-2 right-2 p-1.5 bg-white/90 hover:bg-white rounded-lg shadow-md transition-all hover:scale-110"
                title="Download image"
              >
                <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
