"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import "highlight.js/styles/atom-one-dark.css";
import "katex/dist/katex.min.css";
import { MessageClient } from "@/types";
import { cn } from "@/lib/utils";
import { FileType, formatFileSize } from "@/types/file";
import { FileText, Image as ImageIcon, Copy, Check } from "lucide-react";
import { ProgressEvent } from "@/lib/progress/types";
import { ProgressMessage } from "./ProgressMessage";

interface ChatMessageProps {
  message: MessageClient;
  userName?: string;
  userAvatar?: string;
  progressEvents?: ProgressEvent[];
  isGenerating?: boolean;
}

// Code block component with copy functionality
function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    // Extract text content from children
    const codeElement = children as any;
    const codeText = codeElement?.props?.children?.[0] || '';

    navigator.clipboard.writeText(codeText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-2 rounded-md bg-slate-700 hover:bg-slate-600 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
        title={copied ? "Copied!" : "Copy code"}
      >
        {copied ? (
          <Check className="w-4 h-4" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </button>
      <pre className="overflow-x-auto">{children}</pre>
    </div>
  );
}

export function ChatMessage({ message, userName, userAvatar, progressEvents: externalProgressEvents, isGenerating }: ChatMessageProps) {
  const isUser = message.role === "user";
  // Use progress events from message if available, otherwise use external ones
  const progressEvents = message.progressEvents || externalProgressEvents;

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
            // eslint-disable-next-line @next/next/no-img-element
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

        {/* Progress Tracking - Show above content when available */}
        {!isUser && progressEvents && progressEvents.length > 0 && (
          <div className="mb-4">
            <ProgressMessage events={progressEvents} />
          </div>
        )}

        <div className="prose prose-slate prose-sm max-w-none break-words overflow-x-auto">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex, rehypeHighlight]}
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
                    className="bg-slate-100 text-slate-800 rounded px-1.5 py-0.5 text-sm font-mono !border-0 before:content-none after:content-none"
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
              pre({ children, ...props }) {
                return <CodeBlock>{children}</CodeBlock>;
              },
            }}
          >
            {message.content}
          </ReactMarkdown>

          {/* Display uploaded file attachments */}
          {message.files && message.files.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {message.files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 max-w-xs"
                >
                  {/* File Icon/Thumbnail */}
                  {file.type === FileType.IMAGE && file.thumbnail ? (
                    <div className="w-10 h-10 rounded overflow-hidden bg-slate-200 flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={file.thumbnail}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : file.type === FileType.IMAGE ? (
                    <div className="w-10 h-10 rounded bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <ImageIcon className="w-5 h-5 text-blue-600" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded bg-red-100 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-red-600" />
                    </div>
                  )}
                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Display image if present */}
          {(message.image_url || message.image_data) && (
            <div className="mt-4 relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
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
