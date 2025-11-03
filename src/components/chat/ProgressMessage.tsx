"use client";

import { ProgressEvent, ProgressStep, STEP_LABELS } from "@/lib/progress/types";
import { cn } from "@/lib/utils";
import {
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface ProgressMessageProps {
  events: ProgressEvent[];
  className?: string;
}

// Get status icon
function getStatusIcon(status: ProgressEvent['status']) {
  switch (status) {
    case 'completed':
      return CheckCircle2;
    case 'error':
      return XCircle;
    case 'started':
    case 'in_progress':
    default:
      return Loader2;
  }
}

// Get status color
function getStatusColor(status: ProgressEvent['status']) {
  switch (status) {
    case 'completed':
      return 'text-green-500';
    case 'error':
      return 'text-red-500';
    case 'started':
    case 'in_progress':
    default:
      return 'text-blue-500';
  }
}

export function ProgressMessage({ events, className }: ProgressMessageProps) {
  if (!events || events.length === 0) return null;

  // Get the latest event (current step)
  const currentEvent = events[events.length - 1];
  const StatusIcon = getStatusIcon(currentEvent.status);
  const statusColor = getStatusColor(currentEvent.status);

  // Check if all steps are completed
  const isComplete = currentEvent.step === ProgressStep.GENERATING_RESPONSE &&
                     currentEvent.status === 'completed';

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all duration-300",
          isComplete
            ? "bg-green-100 text-green-700 border border-green-200" :
          currentEvent.status === 'error'
            ? "bg-red-100 text-red-700 border border-red-200" :
            "bg-blue-100 text-blue-700 border border-blue-200"
        )}
      >
        <StatusIcon
          className={cn(
            "w-3.5 h-3.5 flex-shrink-0",
            isComplete ? "text-green-500" : statusColor,
            (currentEvent.status === 'in_progress' || currentEvent.status === 'started') && "animate-spin"
          )}
        />
        <span>{isComplete ? "Completed" : currentEvent.message}</span>
      </div>
    </div>
  );
}
