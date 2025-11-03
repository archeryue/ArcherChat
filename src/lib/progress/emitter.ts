/**
 * Progress event emitter for chat operations
 */

import { ProgressEvent } from './types';

type ProgressListener = (event: ProgressEvent) => void;

export class ProgressEmitter {
  private listeners: Set<ProgressListener> = new Set();
  private requestId: string;

  constructor() {
    this.requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getRequestId(): string {
    return this.requestId;
  }

  subscribe(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: ProgressEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('[ProgressEmitter] Listener error:', error);
      }
    });
  }
}

// Global registry for active emitters
const activeEmitters = new Map<string, ProgressEmitter>();

export function registerEmitter(emitter: ProgressEmitter): void {
  activeEmitters.set(emitter.getRequestId(), emitter);
  console.log(`[ProgressEmitter] Registered emitter: ${emitter.getRequestId()}, total active: ${activeEmitters.size}`);
}

export function removeEmitter(requestId: string): void {
  activeEmitters.delete(requestId);
  console.log(`[ProgressEmitter] Removed emitter: ${requestId}, total active: ${activeEmitters.size}`);
}

export function getEmitter(requestId: string): ProgressEmitter | undefined {
  return activeEmitters.get(requestId);
}
