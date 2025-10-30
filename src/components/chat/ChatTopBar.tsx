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
    <div className="bg-white border-b px-4 py-1.5 flex items-center justify-between">
      {/* Logo/Title */}
      <div className="flex items-center gap-2">
        <h1 className="text-base font-bold">ArcherChat</h1>
      </div>

      {/* User Info & Actions */}
      <div className="flex items-center gap-1.5">
        {isAdmin && (
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="h-8">
              <Settings className="w-3.5 h-3.5 mr-1" />
              <span className="text-sm">Admin</span>
            </Button>
          </Link>
        )}

        {/* User Menu */}
        <div className="flex items-center gap-2 px-2 py-0.5 rounded-lg hover:bg-gray-50">
          {userAvatar ? (
            <img
              src={userAvatar}
              alt={userName || "User"}
              className="w-6 h-6 rounded-full"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-medium">
              {userName?.charAt(0).toUpperCase() || "U"}
            </div>
          )}
          <div className="text-sm">
            <p className="font-medium text-sm">{userName}</p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          <LogOut className="w-3.5 h-3.5 mr-1" />
          <span className="text-sm">Logout</span>
        </Button>
      </div>
    </div>
  );
}
