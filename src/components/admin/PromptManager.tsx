"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PromptConfig, PromptTemplate } from "@/types/prompts";

export function PromptManager() {
  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
  const [defaultTemplates, setDefaultTemplates] = useState<PromptTemplate[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptConfig | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({
    id: "",
    name: "",
    description: "",
    systemPrompt: "",
    temperature: 0.7,
    isActive: false,
    isDefault: false,
  });

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/prompts");
      const data = await response.json();
      setPrompts(data.prompts || []);
      setDefaultTemplates(data.defaultTemplates || []);
    } catch (error) {
      console.error("Error fetching prompts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPrompt = (prompt: PromptConfig) => {
    setSelectedPrompt(prompt);
    setForm({
      id: prompt.id,
      name: prompt.name,
      description: prompt.description,
      systemPrompt: prompt.systemPrompt,
      temperature: prompt.temperature || 0.7,
      isActive: prompt.isActive,
      isDefault: prompt.isDefault,
    });
    setIsEditing(false);
    setIsCreating(false);
  };

  const handleStartEdit = () => {
    setIsEditing(true);
  };

  const handleStartCreate = () => {
    setSelectedPrompt(null);
    setForm({
      id: `custom-${Date.now()}`,
      name: "",
      description: "",
      systemPrompt: "",
      temperature: 0.7,
      isActive: false,
      isDefault: false,
    });
    setIsCreating(true);
    setIsEditing(true);
  };

  const handleLoadTemplate = (template: PromptTemplate) => {
    setSelectedPrompt(null);
    setForm({
      id: `custom-${Date.now()}`,
      name: template.name,
      description: template.description,
      systemPrompt: template.systemPrompt,
      temperature: template.temperature,
      isActive: false,
      isDefault: false,
    });
    setIsCreating(true);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setIsCreating(false);
    if (selectedPrompt) {
      handleSelectPrompt(selectedPrompt);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const response = await fetch("/api/admin/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: form }),
      });

      if (!response.ok) {
        throw new Error("Failed to save prompt");
      }

      await fetchPrompts();
      setIsEditing(false);
      setIsCreating(false);

      // Select the saved prompt
      const saved = prompts.find((p) => p.id === form.id);
      if (saved) {
        setSelectedPrompt(saved);
      }
    } catch (error) {
      console.error("Error saving prompt:", error);
      alert("Failed to save prompt");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (promptId: string) => {
    if (!confirm("Are you sure you want to delete this prompt?")) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/prompts?id=${promptId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete prompt");
      }

      await fetchPrompts();
      setSelectedPrompt(null);
      setIsEditing(false);
      setIsCreating(false);
    } catch (error: any) {
      console.error("Error deleting prompt:", error);
      alert(error.message || "Failed to delete prompt");
    }
  };

  const handleResetToDefaults = async () => {
    if (
      !confirm(
        "This will delete all custom prompts and reset to defaults. Are you sure?"
      )
    ) {
      return;
    }

    try {
      setSaving(true);
      const response = await fetch("/api/admin/prompts/reset", {
        method: "PUT",
      });

      if (!response.ok) {
        throw new Error("Failed to reset prompts");
      }

      await fetchPrompts();
      setSelectedPrompt(null);
      setIsEditing(false);
      setIsCreating(false);
    } catch (error) {
      console.error("Error resetting prompts:", error);
      alert("Failed to reset prompts");
    } finally {
      setSaving(false);
    }
  };

  const handleSetActive = async (promptId: string) => {
    const prompt = prompts.find((p) => p.id === promptId);
    if (!prompt) return;

    try {
      setSaving(true);
      const response = await fetch("/api/admin/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: { ...prompt, isActive: true },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to activate prompt");
      }

      await fetchPrompts();
    } catch (error) {
      console.error("Error activating prompt:", error);
      alert("Failed to activate prompt");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-4">Loading prompts...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Prompt Engineering</h2>
        <div className="flex gap-2">
          <Button onClick={handleStartCreate} variant="default">
            Create New Prompt
          </Button>
          <Button onClick={handleResetToDefaults} variant="outline">
            Reset to Defaults
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Prompt List */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="font-semibold text-lg">Saved Prompts</h3>
          <div className="space-y-2">
            {prompts.map((prompt) => (
              <div
                key={prompt.id}
                className={`p-3 rounded border cursor-pointer transition-colors ${
                  selectedPrompt?.id === prompt.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                } ${prompt.isActive ? "ring-2 ring-green-500" : ""}`}
                onClick={() => handleSelectPrompt(prompt)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium">{prompt.name}</div>
                    <div className="text-sm text-gray-500">
                      {prompt.description}
                    </div>
                    {prompt.isActive && (
                      <div className="text-xs text-green-600 font-medium mt-1">
                        ✓ Active
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t">
            <h3 className="font-semibold text-lg mb-2">Default Templates</h3>
            <div className="space-y-2">
              {defaultTemplates.map((template) => (
                <div
                  key={template.id}
                  className="p-3 rounded border border-gray-200 hover:border-gray-300 cursor-pointer"
                  onClick={() => handleLoadTemplate(template)}
                >
                  <div className="font-medium">{template.name}</div>
                  <div className="text-sm text-gray-500">
                    {template.description}
                  </div>
                  <div className="text-xs text-blue-600 mt-1">
                    Click to create from template
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Prompt Details/Editor */}
        <div className="lg:col-span-2">
          {!selectedPrompt && !isCreating ? (
            <div className="border rounded p-8 text-center text-gray-500">
              Select a prompt or create a new one to get started
            </div>
          ) : (
            <div className="border rounded p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">
                  {isCreating ? "Create New Prompt" : "Prompt Details"}
                </h3>
                <div className="flex gap-2">
                  {!isEditing && !isCreating && (
                    <>
                      {!form.isActive && (
                        <Button
                          onClick={() => handleSetActive(form.id)}
                          variant="default"
                          size="sm"
                          disabled={saving}
                        >
                          Set as Active
                        </Button>
                      )}
                      <Button
                        onClick={handleStartEdit}
                        variant="outline"
                        size="sm"
                      >
                        Edit
                      </Button>
                      {!form.isDefault && (
                        <Button
                          onClick={() => handleDelete(form.id)}
                          variant="outline"
                          size="sm"
                        >
                          Delete
                        </Button>
                      )}
                    </>
                  )}
                  {(isEditing || isCreating) && (
                    <>
                      <Button
                        onClick={handleSave}
                        variant="default"
                        size="sm"
                        disabled={saving || !form.name || !form.systemPrompt}
                      >
                        {saving ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        onClick={handleCancel}
                        variant="outline"
                        size="sm"
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Name
                  </label>
                  {isEditing || isCreating ? (
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      className="w-full border rounded px-3 py-2"
                      placeholder="E.g., Helpful Assistant"
                    />
                  ) : (
                    <div className="text-gray-900">{form.name}</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Description
                  </label>
                  {isEditing || isCreating ? (
                    <input
                      type="text"
                      value={form.description}
                      onChange={(e) =>
                        setForm({ ...form, description: e.target.value })
                      }
                      className="w-full border rounded px-3 py-2"
                      placeholder="Brief description of this prompt"
                    />
                  ) : (
                    <div className="text-gray-900">{form.description}</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Temperature ({form.temperature})
                  </label>
                  {isEditing || isCreating ? (
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={form.temperature}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            temperature: parseFloat(e.target.value),
                          })
                        }
                        className="flex-1"
                      />
                      <div className="text-sm text-gray-500 w-32">
                        {form.temperature < 0.3
                          ? "Focused"
                          : form.temperature < 0.7
                          ? "Balanced"
                          : "Creative"}
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-900">{form.temperature}</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    System Prompt
                  </label>
                  {isEditing || isCreating ? (
                    <textarea
                      value={form.systemPrompt}
                      onChange={(e) =>
                        setForm({ ...form, systemPrompt: e.target.value })
                      }
                      className="w-full border rounded px-3 py-2 font-mono text-sm"
                      rows={20}
                      placeholder="Enter the system prompt here..."
                    />
                  ) : (
                    <pre className="bg-gray-50 border rounded p-4 text-sm whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
                      {form.systemPrompt}
                    </pre>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    Available variables: {"{userName}"}, {"{currentDate}"},{" "}
                    {"{currentTime}"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
