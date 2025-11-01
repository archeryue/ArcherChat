"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Send, Plus, Loader2 } from "lucide-react";
import { FilePreview } from "./FilePreview";
import {
  FileAttachment,
  FileType,
  validateFileMimeType,
  validateFileSize,
  fileToBase64,
  createImageThumbnail,
} from "@/types/file";

interface ChatInputProps {
  onSendMessage: (message: string, files?: FileAttachment[]) => void;
  disabled?: boolean;
}

export function ChatInput({ onSendMessage, disabled }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((message.trim() || files.length > 0) && !disabled && !isProcessing) {
      onSendMessage(message.trim(), files.length > 0 ? files : undefined);
      setMessage("");
      setFiles([]);
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFileSelect = async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    setIsProcessing(true);

    try {
      const newFiles: FileAttachment[] = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];

        // Validate file type
        const fileType = validateFileMimeType(file);
        if (!fileType) {
          alert(`Unsupported file type: ${file.type}`);
          continue;
        }

        // Validate file size
        if (!validateFileSize(file, fileType)) {
          alert(`File too large: ${file.name}. Maximum size depends on file type.`);
          continue;
        }

        // Convert to base64
        const base64Data = await fileToBase64(file);

        // Create thumbnail for images
        let thumbnail: string | undefined;
        if (fileType === FileType.IMAGE) {
          try {
            thumbnail = await createImageThumbnail(file);
          } catch (error) {
            console.error("Failed to create thumbnail:", error);
          }
        }

        // Create file attachment
        const attachment: FileAttachment = {
          id: `${Date.now()}-${i}`,
          name: file.name,
          type: fileType,
          mimeType: file.type,
          size: file.size,
          data: base64Data,
          thumbnail,
        };

        newFiles.push(attachment);
      }

      setFiles((prev) => [...prev, ...newFiles]);
    } catch (error) {
      console.error("Error processing files:", error);
      alert("Failed to process some files. Please try again.");
    } finally {
      setIsProcessing(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  return (
    <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* File Preview */}
        <FilePreview files={files} onRemove={handleRemoveFile} />

        {/* Input Area */}
        <div
          className={`relative flex gap-3 ${
            isDragging ? "ring-4 ring-blue-300 rounded-xl" : ""
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag Overlay */}
          {isDragging && (
            <div className="absolute inset-0 bg-blue-50 bg-opacity-90 rounded-xl flex items-center justify-center z-10 border-2 border-dashed border-blue-400">
              <p className="text-blue-600 font-medium">Drop files here</p>
            </div>
          )}

          {/* Add File Button */}
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isProcessing}
            size="icon"
            variant="outline"
            className="h-[52px] w-[52px] rounded-xl shadow-sm hover:shadow-md transition-all flex-shrink-0"
          >
            {isProcessing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Plus className="h-5 w-5" />
            )}
          </Button>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
          />

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message or drop files here..."
            disabled={disabled || isProcessing}
            rows={1}
            className="flex-1 resize-none rounded-xl border-2 border-slate-200 px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 min-h-[52px] max-h-[200px] transition-all shadow-sm"
          />

          {/* Send Button */}
          <Button
            type="submit"
            disabled={disabled || isProcessing || (!message.trim() && files.length === 0)}
            size="icon"
            className="h-[52px] w-[52px] rounded-xl shadow-sm hover:shadow-md transition-all flex-shrink-0"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>

        <p className="text-xs text-slate-500 text-center mt-3">
          Press Enter to send • Shift+Enter for new line • Drag & drop files to upload
        </p>
      </div>
    </form>
  );
}
