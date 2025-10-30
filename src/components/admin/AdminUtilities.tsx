"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, AlertCircle, CheckCircle } from "lucide-react";

export function AdminUtilities() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);

  const handleCleanupEmptyConversations = async () => {
    if (
      !confirm(
        "Are you sure you want to delete all empty conversations? This action cannot be undone."
      )
    ) {
      return;
    }

    setIsDeleting(true);
    setResult(null);

    try {
      const response = await fetch("/api/admin/cleanup-conversations", {
        method: "POST",
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          message: `Successfully deleted ${data.deletedCount} empty conversation(s). ${data.remainingCount} conversation(s) remaining.`,
          details: data,
        });
      } else {
        setResult({
          success: false,
          message: data.error || "Failed to cleanup conversations",
        });
      }
    } catch (error) {
      console.error("Error cleaning up conversations:", error);
      setResult({
        success: false,
        message: "An error occurred while cleaning up conversations",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Database Utilities</h2>

      <div className="space-y-6">
        {/* Cleanup Empty Conversations */}
        <div className="border rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-medium text-gray-900 flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                Clean Up Empty Conversations
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Delete all conversations that have no messages. This helps keep
                the database clean and reduces clutter in the conversation list.
              </p>
            </div>
            <Button
              onClick={handleCleanupEmptyConversations}
              disabled={isDeleting}
              variant="destructive"
              size="sm"
              className="ml-4"
            >
              {isDeleting ? "Deleting..." : "Clean Up"}
            </Button>
          </div>

          {/* Result Message */}
          {result && (
            <div
              className={`mt-4 p-3 rounded-md flex items-start gap-2 ${
                result.success
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              }`}
            >
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p
                  className={`text-sm font-medium ${
                    result.success ? "text-green-900" : "text-red-900"
                  }`}
                >
                  {result.message}
                </p>
                {result.success && result.details && (
                  <div className="mt-2 text-xs text-gray-600">
                    <p>Total conversations scanned: {result.details.totalConversations}</p>
                    <p>Deleted: {result.details.deletedCount}</p>
                    <p>Remaining: {result.details.remainingCount}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Future utilities can be added here */}
        <div className="text-sm text-gray-500 italic">
          More database utilities will be added here as needed.
        </div>
      </div>
    </div>
  );
}
