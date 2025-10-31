"use client";

import { ConversationClient } from "@/types";
import { ConversationList } from "./ConversationList";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";

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
  return (
    <div className="w-64 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-200">
        <Button
          onClick={onNewConversation}
          variant="outline"
          className="w-full border-slate-300 hover:bg-slate-50 transition-colors"
          size="sm"
        >
          <PlusCircle className="w-4 h-4 mr-2" />
          New Chat
        </Button>
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
    </div>
  );
}
