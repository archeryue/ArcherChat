"use client";

import { X, File, FileText, Image as ImageIcon } from "lucide-react";
import { FileAttachment, FileType, formatFileSize } from "@/types/file";

interface FilePreviewProps {
  files: FileAttachment[];
  onRemove: (fileId: string) => void;
}

export function FilePreview({ files, onRemove }: FilePreviewProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {files.map((file) => (
        <div
          key={file.id}
          className="group relative flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 pr-8 max-w-xs hover:bg-slate-200 transition-colors"
        >
          {/* File Icon */}
          <div className="flex-shrink-0">
            {file.type === FileType.IMAGE && file.thumbnail ? (
              <div className="w-10 h-10 rounded overflow-hidden bg-slate-200">
                <img
                  src={file.thumbnail}
                  alt={file.name}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-10 h-10 rounded bg-blue-100 flex items-center justify-center">
                {file.type === FileType.IMAGE && <ImageIcon className="w-5 h-5 text-blue-600" />}
                {file.type === FileType.PDF && <FileText className="w-5 h-5 text-red-600" />}
                {(file.type === FileType.AUDIO || file.type === FileType.VIDEO) && (
                  <File className="w-5 h-5 text-slate-600" />
                )}
              </div>
            )}
          </div>

          {/* File Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700 truncate">
              {file.name}
            </p>
            <p className="text-xs text-slate-500">
              {formatFileSize(file.size)}
            </p>
          </div>

          {/* Remove Button */}
          <button
            onClick={() => onRemove(file.id)}
            className="absolute top-1 right-1 p-1 rounded-full bg-slate-300 hover:bg-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Remove file"
          >
            <X className="w-3 h-3 text-slate-700" />
          </button>
        </div>
      ))}
    </div>
  );
}
