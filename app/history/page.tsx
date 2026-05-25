"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle, XCircle, Clock, Trash2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { db, clearAllScans, getScanStats, getUnsyncedScans, type ScanRecord } from "@/lib/db";
import { syncService } from "@/lib/sync";

export const dynamic = "force-dynamic";

export default function HistoryPage() {
  const router = useRouter();
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [stats, setStats] = useState({ total: 0, granted: 0, denied: 0, unsynced: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem("scannerToken");
    if (!token) { router.push("/"); return; }

    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // FIX: read from IndexedDB — previously read from localStorage("scanHistory")
    // which was never written to (scans are saved to IndexedDB via saveScan())
    loadScans();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const loadScans = async () => {
    try {
      const all = await db.scans.orderBy("timestamp").reverse().limit(200).toArray();
      setScans(all);
      const s = await getScanStats();
      setStats(s);
    } catch (err) {
      console.error("Failed to load scans from IndexedDB:", err);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm("Clear all local scan history? This cannot be undone.")) return;
    await clearAllScans();
    setScans([]);
    setStats({ total: 0, granted: 0, denied: 0, unsynced: 0 });
    toast.success("History cleared");
  };

  // FIX: sync button now uses syncService.forceSync() which reads from IndexedDB
  // Previously read from localStorage("offlineScans") which was always empty
  const handleSync = async () => {
    if (!navigator.onLine) { toast.error("No connection — sync when online"); return; }
    setSyncing(true);
    try {
      await syncService.forceSync();
      await loadScans();
      toast.success("Sync complete");
    } catch (err) {
      toast.error("Sync failed — try again");
    } finally {
      setSyncing(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-red-600 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Link href="/scan" className="text-white"><ArrowLeft className="w-6 h-6" /></Link>
          <div>
            <h1 className="text-lg font-bold text-white">Scan History</h1>
            <p className="text-white/80 text-xs">{stats.total} total • {stats.unsynced} unsynced</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isOnline ? <Wifi className="w-5 h-5 text-white" /> : <WifiOff className="w-5 h-5 text-white/60" />}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex justify-around">
        <div className="text-center">
          <div className="text-xl font-bold text-green-600">{stats.granted}</div>
          <div className="text-xs text-gray-500">Granted</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-red-500">{stats.denied}</div>
          <div className="text-xs text-gray-500">Denied</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-orange-500">{stats.unsynced}</div>
          <div className="text-xs text-gray-500">Unsynced</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 px-4 py-3">
        <button
          onClick={handleSync}
          disabled={syncing || !isOnline}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-orange-600 text-white rounded-xl text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : `Sync${stats.unsynced > 0 ? ` (${stats.unsynced})` : ""}`}
        </button>
        <button
          onClick={handleClearHistory}
          className="flex items-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm"
        >
          <Trash2 className="w-4 h-4" />Clear
        </button>
      </div>

      {/* Scan List */}
      <div className="px-4 pb-8 space-y-2">
        {scans.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No scans yet</p>
            <p className="text-sm mt-1">Scans will appear here as you scan QR codes</p>
          </div>
        ) : (
          scans.map((scan) => (
            <div key={scan.id} className="bg-white rounded-xl p-4 flex items-center gap-3 shadow-sm">
              {scan.result === "granted"
                ? <CheckCircle className="w-8 h-8 text-green-500 flex-shrink-0" />
                : <XCircle className="w-8 h-8 text-red-500 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">
                  {scan.holderName || "Unknown Holder"}
                </p>
                <p className="text-xs text-gray-500">
                  {scan.station} • {format(new Date(scan.timestamp), "h:mm a")}
                </p>
              </div>
              {!scan.synced && (
                <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full flex-shrink-0">
                  Unsynced
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
