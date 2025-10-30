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
    <div className="space-y-1">
      {conversations.map((conversation) => (
        <div
          key={conversation.id}
          className={cn(
            "group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
            activeConversationId === conversation.id
              ? "bg-blue-50 text-blue-900"
              : "hover:bg-gray-100"
          )}
          onClick={() => onSelectConversation(conversation.id)}
        >
          <MessageSquare className="w-4 h-4 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{conversation.title}</p>
            <p className="text-xs text-gray-500">
              {new Date(conversation.updated_at).toLocaleDateString()}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteConversation(conversation.id);
            }}
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      ))}

      {conversations.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No conversations yet</p>
        </div>
      )}
    </div>
  );
}
