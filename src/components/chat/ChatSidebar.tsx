"use client";

import { useState, useEffect, useRef } from "react";
import { ConversationClient } from "@/types";
import { ConversationList } from "./ConversationList";
import { Button } from "@/components/ui/button";
import { PlusCircle, FileText } from "lucide-react";
import Link from "next/link";

interface ChatSidebarProps {
  conversations: ConversationClient[];
  activeConversationId?: string;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
}

export function ChatSidebar({
  conversations,
  activeConversationId,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
}: ChatSidebarProps) {
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      if (newWidth >= 200 && newWidth <= 400) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  return (
    <div
      ref={sidebarRef}
      className="flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-full relative"
      style={{ width: `${sidebarWidth}px` }}
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-200 space-y-2 select-none cursor-default">
        <Button
          onClick={onNewConversation}
          variant="outline"
          className="w-full border-slate-300 hover:bg-slate-50 transition-colors"
          size="sm"
        >
          <PlusCircle className="w-4 h-4 mr-2" />
          New Chat
        </Button>
        <Link href="/whim" className="block">
          <Button
            variant="outline"
            className="w-full border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors"
            size="sm"
          >
            <FileText className="w-4 h-4 mr-2" />
            View Whims
          </Button>
        </Link>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-3">
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={onSelectConversation}
          onDeleteConversation={onDeleteConversation}
        />
      </div>

      {/* Resize Handle */}
      <div
        className="absolute top-0 right-0 w-1 h-full cursor-ew-resize hover:bg-blue-400 bg-transparent transition-colors"
        onMouseDown={() => setIsResizing(true)}
      />
    </div>
  );
}
