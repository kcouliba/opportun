import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSync } from "@/hooks/useSync";
import { useToast } from "@/components/Toast";

export default function SyncPanel() {
  const { t } = useTranslation();
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
    return <p className="text-sm text-gray-500">{t("sync.loading")}</p>;
  }

  if (!available) return null;

  const handleSync = async () => {
    const result = await syncNow();
    if (!result) return;
    if (result.action === "conflict") {
      setConflictPending(true);
    } else if (result.action === "pushed") {
      showToast(t("sync.pushedToRelay"), "success");
    } else if (result.action === "pulled") {
      showToast(t("sync.syncedFromDevice"), "success");
      setTimeout(() => window.location.reload(), 1000);
    } else {
      showToast(t("sync.upToDate"), "info");
    }
  };

  const handleConflict = async (choice: "keep_remote" | "keep_local" | "export_first") => {
    if (choice === "export_first") {
      showToast(t("sync.exportFirst"), "info");
      return;
    }
    const result = await resolveConflict(choice);
    if (result) {
      setConflictPending(false);
      showToast(
        choice === "keep_remote" ? t("sync.remoteRestored") : t("sync.localPushed"),
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
      showToast(t("sync.pairedSuccess"), "success");
    }
  };

  const handleInitiate = async () => {
    await initiatePairing();
  };

  const handleSaveName = async () => {
    await updateDeviceName(deviceName);
    setEditingName(false);
    showToast(t("sync.deviceNameUpdated"), "success");
  };

  // Sync status indicator
  const getSyncIndicator = () => {
    if (!status?.paired) return { color: "bg-gray-400", label: t("sync.notPaired") };
    if (!status.lastSyncedAt) return { color: "bg-gray-400", label: t("sync.neverSynced") };

    const lastSync = new Date(status.lastSyncedAt);
    const minutesAgo = (Date.now() - lastSync.getTime()) / 60000;

    if (minutesAgo < 5) return { color: "bg-green-500", label: t("sync.syncedJustNow") };
    if (minutesAgo < 60)
      return { color: "bg-green-500", label: t("sync.syncedMinutes", { count: Math.round(minutesAgo) }) };
    if (minutesAgo < 1440)
      return {
        color: "bg-orange-500",
        label: t("sync.syncedHours", { count: Math.round(minutesAgo / 60) }),
      };
    return {
      color: "bg-orange-500",
      label: t("sync.syncedDays", { count: Math.round(minutesAgo / 1440) }),
    };
  };

  const indicator = getSyncIndicator();

  // Conflict dialog
  if (conflictPending) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg">
          <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
            {t("sync.conflictTitle")}
          </h3>
          <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
            {t("sync.conflictDesc")}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleConflict("keep_remote")}
              disabled={syncing}
              className="btn btn-secondary text-sm"
            >
              {t("sync.keepRemote")}
            </button>
            <button
              onClick={() => handleConflict("keep_local")}
              disabled={syncing}
              className="btn btn-secondary text-sm"
            >
              {t("sync.keepLocal")}
            </button>
            <button
              onClick={() => handleConflict("export_first")}
              className="btn btn-secondary text-sm"
            >
              {t("sync.exportBackupFirst")}
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
            <span className="text-sm text-gray-500">{t("sync.thisDevice")}</span>
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
                  {t("common.save")}
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="text-sm text-gray-500 hover:underline"
                >
                  {t("common.cancel")}
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
                {status.deviceName || t("sync.unnamedDevice")}
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn btn-secondary"
            >
              {syncing ? t("sync.syncing") : t("sync.syncNow")}
            </button>
            <button
              onClick={async () => {
                await unpair();
                showToast(t("sync.unpaired"), "info");
              }}
              className="btn btn-secondary text-red-600 dark:text-red-400"
            >
              {t("sync.unpair")}
            </button>
          </div>
        </div>
      ) : (
        // Not paired state
        <div className="space-y-3">
          {pairingOffer ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t("sync.shareCode")}
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
                    showToast(t("sync.codeCopied"), "success");
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-600 hover:underline"
                >
                  {t("common.copyToClipboard")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={handleInitiate} className="btn btn-secondary">
                {t("sync.linkDevice")}
              </button>
              <button onClick={() => setShowJoin(true)} className="btn btn-secondary">
                {t("sync.joinExisting")}
              </button>
            </div>
          )}

          {showJoin && (
            <div className="space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t("sync.pasteCode")}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  className="input flex-1 text-sm font-mono"
                  placeholder={t("sync.pairingPlaceholder")}
                  autoFocus
                />
                <button onClick={handleJoin} className="btn btn-secondary">
                  {t("sync.pair")}
                </button>
                <button
                  onClick={() => {
                    setShowJoin(false);
                    setJoinCode("");
                  }}
                  className="btn btn-secondary"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
