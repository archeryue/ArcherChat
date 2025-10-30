"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut, Settings } from "lucide-react";
import Link from "next/link";

interface ChatTopBarProps {
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
  isAdmin?: boolean;
}

export function ChatTopBar({
  userName,
  userEmail,
  userAvatar,
  isAdmin,
}: ChatTopBarProps) {
  return (
    <div className="bg-white border-b px-4 py-2 flex items-center justify-between">
      {/* Logo/Title */}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold">ArcherChat</h1>
      </div>

      {/* User Info & Actions */}
      <div className="flex items-center gap-2">
        {isAdmin && (
          <Link href="/admin">
            <Button variant="ghost" size="sm">
              <Settings className="w-4 h-4 mr-1" />
              Admin
            </Button>
          </Link>
        )}

        {/* User Menu */}
        <div className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-50">
          {userAvatar ? (
            <img
              src={userAvatar}
              alt={userName || "User"}
              className="w-7 h-7 rounded-full"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-medium">
              {userName?.charAt(0).toUpperCase() || "U"}
            </div>
          )}
          <div className="text-sm">
            <p className="font-medium">{userName}</p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          <LogOut className="w-4 h-4 mr-1" />
          Logout
        </Button>
      </div>
    </div>
  );
}
