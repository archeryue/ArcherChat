/**
 * File attachment types for chat messages
 */

export enum FileType {
  IMAGE = "image",
  PDF = "pdf",
  AUDIO = "audio",
  VIDEO = "video",
}

export interface FileAttachment {
  id: string;
  name: string;
  type: FileType;
  mimeType: string;
  size: number; // bytes
  data: string; // base64 encoded data
  url?: string; // optional public URL if stored
  thumbnail?: string; // base64 thumbnail for images
}

export interface FileUploadConfig {
  maxFileSize: number; // bytes
  allowedMimeTypes: string[];
  allowedExtensions: string[];
}

// File size limits (cost-optimized)
export const FILE_LIMITS = {
  [FileType.IMAGE]: 10 * 1024 * 1024, // 10MB
  [FileType.PDF]: 20 * 1024 * 1024, // 20MB
  [FileType.AUDIO]: 25 * 1024 * 1024, // 25MB
  [FileType.VIDEO]: 50 * 1024 * 1024, // 50MB
} as const;

// Supported MIME types
export const SUPPORTED_MIME_TYPES = {
  [FileType.IMAGE]: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ],
  [FileType.PDF]: ["application/pdf"],
  [FileType.AUDIO]: ["audio/mpeg", "audio/mp3", "audio/wav"],
  [FileType.VIDEO]: ["video/mp4", "video/webm"],
} as const;

// File extensions
export const FILE_EXTENSIONS = {
  [FileType.IMAGE]: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
  [FileType.PDF]: [".pdf"],
  [FileType.AUDIO]: [".mp3", ".wav"],
  [FileType.VIDEO]: [".mp4", ".webm"],
} as const;

/**
 * Get file type from MIME type
 */
export function getFileTypeFromMime(mimeType: string): FileType | null {
  if (SUPPORTED_MIME_TYPES[FileType.IMAGE].includes(mimeType)) {
    return FileType.IMAGE;
  }
  if (SUPPORTED_MIME_TYPES[FileType.PDF].includes(mimeType)) {
    return FileType.PDF;
  }
  if (SUPPORTED_MIME_TYPES[FileType.AUDIO].includes(mimeType)) {
    return FileType.AUDIO;
  }
  if (SUPPORTED_MIME_TYPES[FileType.VIDEO].includes(mimeType)) {
    return FileType.VIDEO;
  }
  return null;
}

/**
 * Validate file size
 */
export function validateFileSize(file: File, fileType: FileType): boolean {
  return file.size <= FILE_LIMITS[fileType];
}

/**
 * Validate file MIME type
 */
export function validateFileMimeType(file: File): FileType | null {
  const fileType = getFileTypeFromMime(file.type);
  if (!fileType) return null;

  return SUPPORTED_MIME_TYPES[fileType].includes(file.type) ? fileType : null;
}

/**
 * Convert file to base64
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === "string") {
        // Remove data URL prefix (e.g., "data:image/png;base64,")
        const base64 = reader.result.split(",")[1];
        resolve(base64);
      } else {
        reject(new Error("Failed to read file as base64"));
      }
    };
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Create thumbnail for images
 */
export async function createImageThumbnail(
  file: File,
  maxWidth: number = 200,
  maxHeight: number = 200
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const thumbnail = canvas.toDataURL("image/jpeg", 0.7);
        resolve(thumbnail);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
