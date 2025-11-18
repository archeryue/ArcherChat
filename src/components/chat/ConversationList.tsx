"use client";

import { ConversationClient } from "@/types";
import { MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConversationListProps {
  conversations: ConversationClient[];
  activeConversationId?: string;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
}

export function ConversationList({
  conversations,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
}: ConversationListProps) {
  return (
    <div className="space-y-0.5">
      {conversations.map((conversation) => (
        <div
          key={conversation.id}
          className={cn(
            "group relative px-3 py-1.5 rounded-lg cursor-pointer transition-all duration-200",
            activeConversationId === conversation.id
              ? "bg-blue-50 text-blue-900 shadow-sm"
              : "hover:bg-slate-50"
          )}
          onClick={() => onSelectConversation(conversation.id)}
        >
          <div className="pr-2">
            <p className="text-sm font-medium truncate leading-snug">{conversation.title}</p>
            <p className="text-xs text-slate-500 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {new Date(conversation.updated_at).toLocaleDateString()}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 h-7 w-7 hover:bg-red-50 transition-all"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteConversation(conversation.id);
            }}
          >
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
          </Button>
        </div>
      ))}

      {conversations.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No conversations yet</p>
          <p className="text-xs mt-1 text-slate-400">Start chatting to create one</p>
        </div>
      )}
    </div>
  );
}
