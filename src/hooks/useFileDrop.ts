import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

const VALID_EXTENSIONS = ["pdf", "txt", "md"];

interface UseFileDropOptions {
  onDrop: (path: string) => void;
  onError?: (message: string) => void;
  enabled?: boolean;
}

export function useFileDrop({ onDrop, onError, enabled = true }: UseFileDropOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const onDropRef = useRef(onDrop);
  const onErrorRef = useRef(onError);

  onDropRef.current = onDrop;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled) return;

    let unlisten: (() => void) | undefined;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setIsDragging(true);
        } else if (event.payload.type === "drop") {
          setIsDragging(false);
          const paths = event.payload.paths;
          if (!paths || paths.length === 0) return;

          const path = paths[0];
          const ext = path.split(".").pop()?.toLowerCase();
          if (ext && VALID_EXTENSIONS.includes(ext)) {
            onDropRef.current(path);
          } else {
            onErrorRef.current?.(`Unsupported file type. Use ${VALID_EXTENSIONS.join(", ")}`);
          }
        } else if (event.payload.type === "leave") {
          setIsDragging(false);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      unlisten?.();
    };
  }, [enabled]);

  return { isDragging };
}
