"use client";

import { signOut } from "next-auth/react";
import { ConversationClient } from "@/types";
import { ConversationList } from "./ConversationList";
import { Button } from "@/components/ui/button";
import { PlusCircle, LogOut, Settings } from "lucide-react";
import Link from "next/link";

interface ChatSidebarProps {
  conversations: ConversationClient[];
  activeConversationId?: string;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
  isAdmin?: boolean;
}

export function ChatSidebar({
  conversations,
  activeConversationId,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  userName,
  userEmail,
  userAvatar,
  isAdmin,
}: ChatSidebarProps) {
  return (
    <div className="w-64 bg-white border-r flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <h1 className="text-xl font-bold mb-3">ArcherChat</h1>
        <Button
          onClick={onNewConversation}
          className="w-full"
          size="sm"
        >
          <PlusCircle className="w-4 h-4 mr-2" />
          New Chat
        </Button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-2">
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={onSelectConversation}
          onDeleteConversation={onDeleteConversation}
        />
      </div>

      {/* User Info & Actions */}
      <div className="border-t p-4 space-y-2">
        {isAdmin && (
          <Link href="/admin">
            <Button variant="outline" className="w-full" size="sm">
              <Settings className="w-4 h-4 mr-2" />
              Admin Panel
            </Button>
          </Link>
        )}

        <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
          {userAvatar ? (
            <img
              src={userAvatar}
              alt={userName || "User"}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
              {userName?.charAt(0).toUpperCase() || "U"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-gray-500 truncate">{userEmail}</p>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full"
          size="sm"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </div>
    </div>
  );
}
