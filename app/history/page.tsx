"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
} from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";

interface ScanRecord {
  id: string;
  qrData: string;
  station: string;
  timestamp: string;
  result: "granted" | "denied";
  holderName?: string;
  synced: boolean;
}

export default function HistoryPage() {
  const router = useRouter();
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [station, setStation] = useState("");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("scannerToken");
    const savedStation = localStorage.getItem("station");

    if (!token) {
      router.push("/");
      return;
    }

    setStation(savedStation || "");
    setIsOnline(navigator.onLine);

    // Load scans from IndexedDB/localStorage
    loadScans();
  }, []);

  const loadScans = () => {
    const storedScans = JSON.parse(localStorage.getItem("scanHistory") || "[]");
    setScans(storedScans.reverse());
  };

  const clearHistory = () => {
    if (confirm("Clear all scan history?")) {
      localStorage.setItem("scanHistory", "[]");
      setScans([]);
      toast.success("History cleared");
    }
  };

  const syncOfflineScans = async () => {
    const offlineScans = JSON.parse(
      localStorage.getItem("offlineScans") || "[]",
    );

    if (offlineScans.length === 0) {
      toast.success("No offline scans to sync");
      return;
    }

    setSyncing(true);
    const API_URL =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
    const token = localStorage.getItem("scannerToken");

    try {
      const response = await fetch(`${API_URL}/scan/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ scans: offlineScans }),
      });

      const data = await response.json();

      if (data.success) {
        // Clear offline scans
        localStorage.setItem("offlineScans", "[]");

        // Mark scans as synced
        const updatedScans = scans.map((scan) => ({
          ...scan,
          synced: true,
        }));
        setScans(updatedScans);
        localStorage.setItem("scanHistory", JSON.stringify(updatedScans));

        toast.success(`Synced ${data.synced} scans`);
      }
    } catch (error) {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const offlineCount = JSON.parse(
    localStorage.getItem("offlineScans") || "[]",
  ).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-red-600 text-white p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link href="/scan" className="text-white">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h1 className="text-xl font-semibold">Scan History</h1>
          </div>
          <div className="flex items-center space-x-2">
            {isOnline ? (
              <Wifi className="w-5 h-5 text-green-300" />
            ) : (
              <WifiOff className="w-5 h-5 text-yellow-300" />
            )}
            <span className="text-sm">{station}</span>
          </div>
        </div>
      </div>

      {/* Sync Bar */}
      {offlineCount > 0 && (
        <div className="bg-yellow-50 border-b border-yellow-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center text-yellow-800">
              <WifiOff className="w-5 h-5 mr-2" />
              <span>{offlineCount} offline scans pending</span>
            </div>
            <button
              onClick={syncOfflineScans}
              disabled={syncing || !isOnline}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 flex items-center"
            >
              <Upload className="w-4 h-4 mr-2" />
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="p-4 bg-white border-b border-gray-200">
        <div className="flex justify-around">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{scans.length}</p>
            <p className="text-sm text-gray-500">Total Scans</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {scans.filter((s) => s.result === "granted").length}
            </p>
            <p className="text-sm text-gray-500">Granted</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">
              {scans.filter((s) => s.result === "denied").length}
            </p>
            <p className="text-sm text-gray-500">Denied</p>
          </div>
        </div>
      </div>

      {/* Scan List */}
      <div className="p-4">
        {scans.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No scans yet</p>
            <Link
              href="/scan"
              className="mt-4 inline-block px-6 py-2 bg-orange-600 text-white rounded-lg"
            >
              Start Scanning
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {scans.map((scan) => (
              <div
                key={scan.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    {scan.result === "granted" ? (
                      <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
                    )}
                    <div>
                      <p className="font-medium text-gray-900">
                        {scan.holderName || "Unknown"}
                      </p>
                      <p className="text-sm text-gray-500">
                        {format(new Date(scan.timestamp), "h:mm a")}
                      </p>
                      {!scan.synced && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                          Pending sync
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      scan.result === "granted"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {scan.result}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clear Button */}
      {scans.length > 0 && (
        <div className="p-4">
          <button
            onClick={clearHistory}
            className="w-full py-3 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 flex items-center justify-center"
          >
            <Trash2 className="w-5 h-5 mr-2" />
            Clear History
          </button>
        </div>
      )}
    </div>
  );
}
