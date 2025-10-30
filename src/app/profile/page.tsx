"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2, Brain } from "lucide-react";
import Link from "next/link";
import { UserMemoryClient, MemoryFactClient, MemoryTier, MemoryCategory } from "@/types/memory";
import { LoadingPage } from "@/components/ui/loading";

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [memory, setMemory] = useState<UserMemoryClient | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      loadMemory();
    }
  }, [status, router]);

  const loadMemory = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/memory");
      if (res.ok) {
        const data = await res.json();
        setMemory(data);
      }
    } catch (error) {
      console.error("Failed to load memory:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteFact = async (factId: string) => {
    if (!confirm("Are you sure you want to delete this memory?")) return;

    try {
      const res = await fetch(`/api/memory/${factId}`, { method: "DELETE" });
      if (res.ok) {
        await loadMemory();
      }
    } catch (error) {
      console.error("Failed to delete memory:", error);
    }
  };

  const clearAllMemory = async () => {
    if (!confirm("Are you sure you want to clear all your memory? This cannot be undone.")) return;

    try {
      const res = await fetch("/api/memory", { method: "DELETE" });
      if (res.ok) {
        await loadMemory();
      }
    } catch (error) {
      console.error("Failed to clear memory:", error);
    }
  };

  if (status === "loading" || isLoading) {
    return <LoadingPage message="Loading memory profile..." />;
  }

  if (!session) {
    return null;
  }

  const getTierColor = (tier: MemoryTier) => {
    switch (tier) {
      case "core":
        return "bg-purple-100 text-purple-800";
      case "important":
        return "bg-blue-100 text-blue-800";
      case "context":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getCategoryIcon = (category: MemoryCategory) => {
    switch (category) {
      case "profile":
        return "👤";
      case "preference":
        return "⚙️";
      case "technical":
        return "💻";
      case "project":
        return "📁";
      default:
        return "📝";
    }
  };

  const groupedFacts = memory?.facts.reduce((acc, fact) => {
    if (!acc[fact.category]) {
      acc[fact.category] = [];
    }
    acc[fact.category].push(fact);
    return acc;
  }, {} as Record<MemoryCategory, MemoryFactClient[]>);

  const categoryNames: Record<MemoryCategory, string> = {
    profile: "About You",
    preference: "Preferences",
    technical: "Technical Context",
    project: "Current Work",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/chat">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Chat
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Brain className="w-6 h-6 text-blue-600" />
                <h1 className="text-2xl font-bold">Memory Profile</h1>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllMemory}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg border">
            <p className="text-sm text-gray-600">Total Memories</p>
            <p className="text-2xl font-bold text-gray-900">{memory?.stats.total_facts || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <p className="text-sm text-gray-600">Token Usage</p>
            <p className="text-2xl font-bold text-gray-900">
              {memory?.stats.token_usage || 0} <span className="text-sm text-gray-500">/ 500</span>
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <p className="text-sm text-gray-600">Last Cleanup</p>
            <p className="text-sm font-medium text-gray-900">
              {memory?.stats.last_cleanup
                ? new Date(memory.stats.last_cleanup).toLocaleDateString()
                : "Never"}
            </p>
          </div>
        </div>

        {/* Memory Facts */}
        {!memory || memory.facts.length === 0 ? (
          <div className="bg-white p-12 rounded-lg border text-center">
            <Brain className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Memories Yet</h2>
            <p className="text-gray-600 mb-4">
              As you chat, I'll automatically learn about your preferences and remember important facts.
            </p>
            <Link href="/chat">
              <Button>Start Chatting</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(categoryNames).map(([category, name]) => {
              const facts = groupedFacts?.[category as MemoryCategory] || [];
              if (facts.length === 0) return null;

              return (
                <div key={category} className="bg-white rounded-lg border">
                  <div className="p-4 border-b bg-gray-50">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <span>{getCategoryIcon(category as MemoryCategory)}</span>
                      {name}
                      <span className="text-sm font-normal text-gray-500">({facts.length})</span>
                    </h2>
                  </div>
                  <div className="divide-y">
                    {facts.map((fact) => (
                      <div key={fact.id} className="p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="text-gray-900 mb-2">{fact.content}</p>
                            <div className="flex items-center gap-2 text-xs">
                              <span className={`px-2 py-1 rounded-full font-medium ${getTierColor(fact.tier)}`}>
                                {fact.tier.toUpperCase()}
                              </span>
                              <span className="text-gray-500">
                                Confidence: {(fact.confidence * 100).toFixed(0)}%
                              </span>
                              <span className="text-gray-500">•</span>
                              <span className="text-gray-500">
                                Used {fact.use_count} times
                              </span>
                              <span className="text-gray-500">•</span>
                              <span className="text-gray-500">
                                {new Date(fact.created_at).toLocaleDateString()}
                              </span>
                              {fact.expires_at && (
                                <>
                                  <span className="text-gray-500">•</span>
                                  <span className="text-gray-500">
                                    Expires: {new Date(fact.expires_at).toLocaleDateString()}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteFact(fact.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Info */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">How Memory Works</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>Automatic:</strong> I learn from your conversations without you needing to do anything</li>
            <li>• <strong>Smart Retention:</strong> Core facts never expire, important ones last 90 days, context lasts 30 days</li>
            <li>• <strong>Privacy:</strong> Your memory is private and only used to personalize your experience</li>
            <li>• <strong>Control:</strong> You can delete individual memories or clear everything anytime</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
