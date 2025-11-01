"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut, Settings, Brain, User, Target } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const [imageError, setImageError] = useState(false);

  return (
    <div className="bg-white border-b border-slate-200 px-4 py-1 flex items-center justify-between shadow-sm">
      {/* Logo/Title */}
      <div className="flex items-center gap-2">
        <Target className="w-7 h-7 text-blue-600" strokeWidth={1.5} />
        <h1 className="text-base font-bold">
          <span className="text-blue-600">Archer</span>
          <span className="text-slate-800">Chat</span>
        </h1>
      </div>

      {/* User Menu Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors">
            {userAvatar && !imageError ? (
              <Image
                src={userAvatar}
                alt={userName || "User"}
                width={24}
                height={24}
                className="w-6 h-6 rounded-full"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-semibold shadow-sm">
                {userName?.charAt(0).toUpperCase() || "U"}
              </div>
            )}
            <span className="font-medium text-sm text-slate-700">{userName}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild>
            <Link href="/profile" className="flex items-center cursor-pointer">
              <Brain className="w-4 h-4 mr-2" />
              Memory Profile
            </Link>
          </DropdownMenuItem>
          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/admin" className="flex items-center cursor-pointer">
                  <Settings className="w-4 h-4 mr-2" />
                  Admin Panel
                </Link>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-red-600 focus:text-red-600 cursor-pointer"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
