import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SyncStatus, PairingOffer, SyncResult } from "@/types";

export function useSync() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pairingOffer, setPairingOffer] = useState<PairingOffer | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await invoke<SyncStatus>("get_sync_status");
      setStatus(s);
      setAvailable(true);
      setError(null);
    } catch (e) {
      // If the command doesn't exist, sync feature is not compiled in
      const msg = String(e);
      if (msg.includes("unknown command")) {
        setAvailable(false);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const initiatePairing = useCallback(async () => {
    try {
      setError(null);
      const offer = await invoke<PairingOffer>("initiate_pairing");
      setPairingOffer(offer);
      await refresh();
      return offer;
    } catch (e) {
      setError(String(e));
      return null;
    }
  }, [refresh]);

  const completePairing = useCallback(
    async (code: string) => {
      try {
        setError(null);
        const s = await invoke<SyncStatus>("complete_pairing", { code });
        setStatus(s);
        setPairingOffer(null);
        return true;
      } catch (e) {
        setError(String(e));
        return false;
      }
    },
    []
  );

  const syncPush = useCallback(async () => {
    try {
      setSyncing(true);
      setError(null);
      const result = await invoke<SyncResult>("sync_push");
      await refresh();
      return result;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  const syncPull = useCallback(async () => {
    try {
      setSyncing(true);
      setError(null);
      const result = await invoke<SyncResult>("sync_pull");
      await refresh();
      return result;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  const syncNow = useCallback(async () => {
    const pullResult = await syncPull();
    if (pullResult?.action === "conflict") return pullResult;
    if (pullResult?.action === "pulled") return pullResult;
    return await syncPush();
  }, [syncPull, syncPush]);

  const unpair = useCallback(async () => {
    try {
      setError(null);
      await invoke("unpair_device");
      setPairingOffer(null);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }, [refresh]);

  const resolveConflict = useCallback(
    async (choice: "keep_remote" | "keep_local" | "export_first") => {
      try {
        setSyncing(true);
        setError(null);
        const result = await invoke<SyncResult>("resolve_conflict", { choice });
        if (result.action === "pulled") {
          setTimeout(() => window.location.reload(), 500);
        }
        await refresh();
        return result;
      } catch (e) {
        setError(String(e));
        return null;
      } finally {
        setSyncing(false);
      }
    },
    [refresh]
  );

  const updateDeviceName = useCallback(
    async (name: string) => {
      try {
        setError(null);
        await invoke("update_device_name", { name });
        await refresh();
      } catch (e) {
        setError(String(e));
      }
    },
    [refresh]
  );

  return {
    status,
    loading,
    available,
    error,
    syncing,
    pairingOffer,
    initiatePairing,
    completePairing,
    syncNow,
    syncPush,
    syncPull,
    unpair,
    resolveConflict,
    updateDeviceName,
    refresh,
  };
}
