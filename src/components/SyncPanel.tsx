import { useState } from "react";
import { useSync } from "@/hooks/useSync";
import { useToast } from "@/components/Toast";

export default function SyncPanel() {
  const {
    status,
    loading,
    available,
    error,
    syncing,
    pairingOffer,
    initiatePairing,
    completePairing,
    syncNow,
    unpair,
    resolveConflict,
    updateDeviceName,
  } = useSync();
  const { showToast } = useToast();
  const [joinCode, setJoinCode] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [conflictPending, setConflictPending] = useState(false);

  if (loading) {
    return <p className="text-sm text-gray-500">Loading sync status...</p>;
  }

  if (!available) return null;

  const handleSync = async () => {
    const result = await syncNow();
    if (!result) return;
    if (result.action === "conflict") {
      setConflictPending(true);
    } else if (result.action === "pushed") {
      showToast("Changes pushed to relay", "success");
    } else if (result.action === "pulled") {
      showToast("Data synced from other device. Reloading...", "success");
      setTimeout(() => window.location.reload(), 1000);
    } else {
      showToast("Already up to date", "info");
    }
  };

  const handleConflict = async (choice: "keep_remote" | "keep_local" | "export_first") => {
    if (choice === "export_first") {
      showToast("Export a backup first, then choose Keep Remote", "info");
      return;
    }
    const result = await resolveConflict(choice);
    if (result) {
      setConflictPending(false);
      showToast(
        choice === "keep_remote" ? "Remote data restored" : "Local data pushed",
        "success"
      );
    }
  };

  const handleJoin = async () => {
    const trimmed = joinCode.trim();
    if (!trimmed) return;
    const ok = await completePairing(trimmed);
    if (ok) {
      setShowJoin(false);
      setJoinCode("");
      showToast("Paired successfully!", "success");
    }
  };

  const handleInitiate = async () => {
    await initiatePairing();
  };

  const handleSaveName = async () => {
    await updateDeviceName(deviceName);
    setEditingName(false);
    showToast("Device name updated", "success");
  };

  // Sync status indicator
  const getSyncIndicator = () => {
    if (!status?.paired) return { color: "bg-gray-400", label: "Not paired" };
    if (!status.lastSyncedAt) return { color: "bg-gray-400", label: "Never synced" };

    const lastSync = new Date(status.lastSyncedAt);
    const minutesAgo = (Date.now() - lastSync.getTime()) / 60000;

    if (minutesAgo < 5) return { color: "bg-green-500", label: "Synced just now" };
    if (minutesAgo < 60)
      return { color: "bg-green-500", label: `Synced ${Math.round(minutesAgo)}m ago` };
    if (minutesAgo < 1440)
      return {
        color: "bg-orange-500",
        label: `Synced ${Math.round(minutesAgo / 60)}h ago`,
      };
    return {
      color: "bg-orange-500",
      label: `Synced ${Math.round(minutesAgo / 1440)}d ago`,
    };
  };

  const indicator = getSyncIndicator();

  // Conflict dialog
  if (conflictPending) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg">
          <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
            Sync Conflict
          </h3>
          <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
            Your other device has newer changes, but you also have local changes.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleConflict("keep_remote")}
              disabled={syncing}
              className="btn btn-secondary text-sm"
            >
              Keep Remote
            </button>
            <button
              onClick={() => handleConflict("keep_local")}
              disabled={syncing}
              className="btn btn-secondary text-sm"
            >
              Keep Local
            </button>
            <button
              onClick={() => handleConflict("export_first")}
              className="btn btn-secondary text-sm"
            >
              Export Backup First
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {status?.paired ? (
        // Paired state
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${indicator.color}`} />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {indicator.label}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">This device:</span>
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                  className="input text-sm py-1 px-2 w-48"
                  autoFocus
                />
                <button onClick={handleSaveName} className="text-sm text-blue-600 hover:underline">
                  Save
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="text-sm text-gray-500 hover:underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setDeviceName(status.deviceName || "");
                  setEditingName(true);
                }}
                className="text-sm font-medium hover:underline"
              >
                {status.deviceName || "Unnamed device"}
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn btn-secondary"
            >
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
            <button
              onClick={async () => {
                await unpair();
                showToast("Device unpaired", "info");
              }}
              className="btn btn-secondary text-red-600 dark:text-red-400"
            >
              Unpair
            </button>
          </div>
        </div>
      ) : (
        // Not paired state
        <div className="space-y-3">
          {pairingOffer ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Share this code with your other device:
              </p>
              <div className="flex justify-center">
                <img
                  src={`data:image/png;base64,${pairingOffer.qrCodePng}`}
                  alt="Pairing QR code"
                  className="w-48 h-48 border rounded"
                />
              </div>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={pairingOffer.textCode}
                  className="input text-xs font-mono pr-16 w-full"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(pairingOffer.textCode);
                    showToast("Code copied!", "success");
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-600 hover:underline"
                >
                  Copy
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={handleInitiate} className="btn btn-secondary">
                Link a Device
              </button>
              <button onClick={() => setShowJoin(true)} className="btn btn-secondary">
                Join Existing
              </button>
            </div>
          )}

          {showJoin && (
            <div className="space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Paste the pairing code from your other device:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  className="input flex-1 text-sm font-mono"
                  placeholder="Paste pairing code..."
                  autoFocus
                />
                <button onClick={handleJoin} className="btn btn-secondary">
                  Pair
                </button>
                <button
                  onClick={() => {
                    setShowJoin(false);
                    setJoinCode("");
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
