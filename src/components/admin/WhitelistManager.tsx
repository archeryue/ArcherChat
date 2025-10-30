"use client";

import { useState } from "react";
import { WhitelistEntryClient } from "@/types";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";

interface WhitelistManagerProps {
  initialWhitelist: WhitelistEntryClient[];
  onUpdate: () => void;
}

export function WhitelistManager({
  initialWhitelist,
  onUpdate,
}: WhitelistManagerProps) {
  const [whitelist, setWhitelist] = useState(initialWhitelist);
  const [newEmail, setNewEmail] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState("");

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!newEmail || !newEmail.includes("@")) {
      setError("Please enter a valid email");
      return;
    }

    setIsAdding(true);

    try {
      const response = await fetch("/api/admin/whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          notes: newNotes,
        }),
      });

      if (response.ok) {
        setNewEmail("");
        setNewNotes("");
        onUpdate();
      } else {
        const text = await response.text();
        setError(text || "Failed to add email");
      }
    } catch (error) {
      setError("Failed to add email");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveEmail = async (email: string) => {
    if (!confirm(`Are you sure you want to remove ${email} from whitelist?`)) {
      return;
    }

    try {
      const response = await fetch("/api/admin/whitelist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        onUpdate();
      } else {
        const text = await response.text();
        alert(text || "Failed to remove email");
      }
    } catch (error) {
      alert("Failed to remove email");
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4">Whitelist Management</h2>

      {/* Add Email Form */}
      <form onSubmit={handleAddEmail} className="mb-6 space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">
            Email Address
          </label>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isAdding}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Notes (optional)
          </label>
          <input
            type="text"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            placeholder="Family member, friend, etc."
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isAdding}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={isAdding}>
          <Plus className="w-4 h-4 mr-2" />
          {isAdding ? "Adding..." : "Add Email"}
        </Button>
      </form>

      {/* Whitelist Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-3">Email</th>
              <th className="text-left py-2 px-3">Notes</th>
              <th className="text-left py-2 px-3">Added</th>
              <th className="text-right py-2 px-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {initialWhitelist.map((entry) => (
              <tr key={entry.email} className="border-b hover:bg-gray-50">
                <td className="py-2 px-3 font-medium">{entry.email}</td>
                <td className="py-2 px-3 text-sm text-gray-600">
                  {entry.notes || "-"}
                </td>
                <td className="py-2 px-3 text-sm text-gray-600">
                  {new Date(entry.added_at).toLocaleDateString()}
                </td>
                <td className="py-2 px-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveEmail(entry.email)}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {initialWhitelist.length === 0 && (
        <p className="text-center py-8 text-gray-500">
          No whitelisted emails yet
        </p>
      )}
    </div>
  );
}
