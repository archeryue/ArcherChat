"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { WhitelistManager } from "@/components/admin/WhitelistManager";
import { UserStats } from "@/components/admin/UserStats";
import { PromptManager } from "@/components/admin/PromptManager";
import { AdminUtilities } from "@/components/admin/AdminUtilities";
import { LoadingPage } from "@/components/ui/loading";
import { WhitelistEntryClient, UserStats as UserStatsType } from "@/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

type Tab = "whitelist" | "users" | "prompts" | "utilities";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [from, setFrom] = useState<string | null>(null);

  // Get 'from' parameter on client side
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFrom(params.get("from"));
  }, []);
  const [activeTab, setActiveTab] = useState<Tab>("prompts");
  const [whitelist, setWhitelist] = useState<WhitelistEntryClient[]>([]);
  const [userStats, setUserStats] = useState<UserStatsType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated" && !session?.user.isAdmin) {
      router.push("/chat");
    } else if (status === "authenticated" && session?.user.isAdmin) {
      loadInitialData();
    }
  }, [status, session, router]);

  // Load only whitelist initially (fast)
  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const whitelistRes = await fetch("/api/admin/whitelist");

      if (whitelistRes.ok) {
        const data = await whitelistRes.json();
        setWhitelist(
          data.map((entry: any) => ({
            ...entry,
            added_at: new Date(entry.added_at),
          }))
        );
      }
    } catch (error) {
      console.error("Failed to load admin data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Lazy load user stats when users tab is selected
  const loadUserStats = async () => {
    if (usersLoaded || isLoadingUsers) return;

    setIsLoadingUsers(true);
    try {
      const usersRes = await fetch("/api/admin/users");

      if (usersRes.ok) {
        const data = await usersRes.json();
        setUserStats(
          data.map((user: any) => ({
            ...user,
            last_active: new Date(user.last_active),
          }))
        );
        setUsersLoaded(true);
      }
    } catch (error) {
      console.error("Failed to load user stats:", error);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Load user stats when tab is selected
  useEffect(() => {
    if (activeTab === "users" && !usersLoaded && !isLoadingUsers) {
      loadUserStats();
    }
  }, [activeTab, usersLoaded, isLoadingUsers]);

  const loadData = async () => {
    await loadInitialData();
    setUsersLoaded(false); // Reset to allow reload
  };

  if (status === "loading" || isLoading) {
    return <LoadingPage message="Loading admin panel..." />;
  }

  if (!session?.user.isAdmin) {
    return null;
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-slate-200 shadow-sm select-none cursor-default">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={from === "whim" ? "/whim" : "/chat"}>
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  {from === "whim" ? "Back to Whims" : "Back to Chat"}
                </Button>
              </Link>
              <h1 className="text-2xl font-bold text-slate-900">Admin Panel</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">{session.user.email}</span>
              {session.user.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt={session.user.name || "Admin"}
                  className="w-8 h-8 rounded-full"
                />
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 pt-2 pb-4">
        {/* Tabs */}
        <div className="border-b border-slate-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab("prompts")}
              className={`${
                activeTab === "prompts"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Prompt Engineering
            </button>
            <button
              onClick={() => setActiveTab("whitelist")}
              className={`${
                activeTab === "whitelist"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Whitelist
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`${
                activeTab === "users"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              User Statistics
            </button>
            <button
              onClick={() => setActiveTab("utilities")}
              className={`${
                activeTab === "utilities"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Utilities
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === "prompts" && <PromptManager />}
          {activeTab === "whitelist" && (
            <WhitelistManager initialWhitelist={whitelist} onUpdate={loadData} />
          )}
          {activeTab === "users" && (
            isLoadingUsers ? (
              <div className="text-center py-8 text-slate-500">Loading user statistics...</div>
            ) : (
              <UserStats users={userStats} />
            )
          )}
          {activeTab === "utilities" && <AdminUtilities />}
        </div>
        </div>
      </main>
    </div>
  );
}
