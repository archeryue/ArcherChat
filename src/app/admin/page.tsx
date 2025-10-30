"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { WhitelistManager } from "@/components/admin/WhitelistManager";
import { UserStats } from "@/components/admin/UserStats";
import { PromptManager } from "@/components/admin/PromptManager";
import { LoadingPage } from "@/components/ui/loading";
import { WhitelistEntryClient, UserStats as UserStatsType } from "@/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

type Tab = "whitelist" | "users" | "prompts";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("prompts");
  const [whitelist, setWhitelist] = useState<WhitelistEntryClient[]>([]);
  const [userStats, setUserStats] = useState<UserStatsType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated" && !session?.user.isAdmin) {
      router.push("/chat");
    } else if (status === "authenticated" && session?.user.isAdmin) {
      loadData();
    }
  }, [status, session, router]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [whitelistRes, usersRes] = await Promise.all([
        fetch("/api/admin/whitelist"),
        fetch("/api/admin/users"),
      ]);

      if (whitelistRes.ok) {
        const data = await whitelistRes.json();
        setWhitelist(
          data.map((entry: any) => ({
            ...entry,
            added_at: new Date(entry.added_at),
          }))
        );
      }

      if (usersRes.ok) {
        const data = await usersRes.json();
        setUserStats(
          data.map((user: any) => ({
            ...user,
            last_active: new Date(user.last_active),
          }))
        );
      }
    } catch (error) {
      console.error("Failed to load admin data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "loading" || isLoading) {
    return <LoadingPage message="Loading admin panel..." />;
  }

  if (!session?.user.isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/chat">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Chat
                </Button>
              </Link>
              <h1 className="text-2xl font-bold">Admin Panel</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">{session.user.email}</span>
              {session.user.image && (
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
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab("prompts")}
              className={`${
                activeTab === "prompts"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Prompt Engineering
            </button>
            <button
              onClick={() => setActiveTab("whitelist")}
              className={`${
                activeTab === "whitelist"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Whitelist
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`${
                activeTab === "users"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              User Statistics
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === "prompts" && <PromptManager />}
          {activeTab === "whitelist" && (
            <WhitelistManager initialWhitelist={whitelist} onUpdate={loadData} />
          )}
          {activeTab === "users" && <UserStats users={userStats} />}
        </div>
      </main>
    </div>
  );
}
