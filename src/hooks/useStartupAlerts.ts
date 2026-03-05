import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "@/components/Toast";

interface StartupAlert {
  title: string;
  body: string;
}

export function useStartupAlerts() {
  const fired = useRef(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    (async () => {
      try {
        const alerts = await invoke<StartupAlert[]>("get_startup_alerts");
        for (const alert of alerts) {
          showToast(`${alert.title}: ${alert.body}`, "info");
        }
      } catch (e) {
        console.warn("[startup-alerts] Failed:", e);
      }
    })();
  }, [showToast]);
}
