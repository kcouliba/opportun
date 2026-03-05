import type { ReactNode } from "react";
import { useFileDrop } from "@/hooks/useFileDrop";

interface FileDropZoneProps {
  onFileDrop: (path: string) => void;
  onError?: (message: string) => void;
  enabled?: boolean;
  label?: string;
  children: ReactNode;
}

export default function FileDropZone({
  onFileDrop,
  onError,
  enabled = true,
  label = "Drop file here (PDF, TXT, MD)",
  children,
}: FileDropZoneProps) {
  const { isDragging } = useFileDrop({ onDrop: onFileDrop, onError, enabled });

  return (
    <div className="relative">
      {children}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-blue-400 dark:border-blue-500 bg-blue-50/90 dark:bg-blue-900/80 backdrop-blur-sm">
          <div className="text-center">
            <svg
              className="w-10 h-10 mx-auto mb-2 text-blue-500 dark:text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
              />
            </svg>
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
              {label}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
