"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  WifiOff,
  Database,
  HardDrive,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";

export default function OfflinePage() {
  const [storageInfo, setStorageInfo] = useState({
    used: 0,
    total: 0,
    percentage: 0,
  });
  const [offlineScans, setOfflineScans] = useState<any[]>([]);
  const [cacheSize, setCacheSize] = useState(0);

  useEffect(() => {
    loadStorageInfo();
    loadOfflineScans();
    estimateCacheSize();
  }, []);

  const loadStorageInfo = () => {
    if ("storage" in navigator && "estimate" in navigator.storage) {
      navigator.storage.estimate().then((estimate) => {
        const used = estimate.usage || 0;
        const total = estimate.quota || 0;
        setStorageInfo({
          used,
          total,
          percentage: total > 0 ? (used / total) * 100 : 0,
        });
      });
    }
  };

  const loadOfflineScans = () => {
    const scans = JSON.parse(localStorage.getItem("offlineScans") || "[]");
    setOfflineScans(scans);
  };

  const estimateCacheSize = () => {
    let size = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key || "");
      size += (key?.length || 0) + (value?.length || 0);
    }
    setCacheSize(size * 2); // Rough estimate in bytes
  };

  const clearCache = () => {
    if (
      confirm(
        "Clear all cached data? This will remove offline scans and settings.",
      )
    ) {
      // Keep only essential data
      const token = localStorage.getItem("scannerToken");
      const station = localStorage.getItem("station");
      const volunteerName = localStorage.getItem("volunteerName");

      localStorage.clear();

      if (token) localStorage.setItem("scannerToken", token);
      if (station) localStorage.setItem("station", station);
      if (volunteerName) localStorage.setItem("volunteerName", volunteerName);

      loadStorageInfo();
      loadOfflineScans();
      estimateCacheSize();
      toast.success("Cache cleared");
    }
  };

  const clearOfflineScans = () => {
    if (confirm("Delete all offline scans?")) {
      localStorage.setItem("offlineScans", "[]");
      setOfflineScans([]);
      toast.success("Offline scans cleared");
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-red-600 text-white p-4">
        <div className="flex items-center space-x-3">
          <Link href="/scan" className="text-white">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-xl font-semibold">Offline Mode</h1>
        </div>
      </div>

      {/* Status Card */}
      <div className="p-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
          <div className="flex items-start">
            <WifiOff className="w-5 h-5 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-yellow-800">You are offline</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Scans will be saved locally and synced when you reconnect to the
                internet.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Storage Info */}
      <div className="p-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center mb-4">
            <HardDrive className="w-5 h-5 text-gray-600 mr-2" />
            <h3 className="font-medium text-gray-900">Storage</h3>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Used</span>
                <span className="text-gray-900">
                  {formatBytes(storageInfo.used)} /{" "}
                  {formatBytes(storageInfo.total)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-orange-500 h-2 rounded-full"
                  style={{ width: `${storageInfo.percentage}%` }}
                />
              </div>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Cache Size</span>
              <span className="text-gray-900">{formatBytes(cacheSize)}</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Offline Scans</span>
              <span className="text-gray-900">
                {offlineScans.length} pending
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 space-y-3">
        <button
          onClick={clearOfflineScans}
          className="w-full py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center justify-center"
        >
          <Database className="w-5 h-5 mr-2" />
          Clear Offline Scans
        </button>

        <button
          onClick={clearCache}
          className="w-full py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center justify-center"
        >
          <RefreshCw className="w-5 h-5 mr-2" />
          Clear Cache
        </button>

        <button
          onClick={() => window.location.reload()}
          className="w-full py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center justify-center"
        >
          <AlertCircle className="w-5 h-5 mr-2" />
          Check Connection
        </button>
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>How offline mode works:</strong>
            <br />
            • Scans are saved to your device
            <br />
            • Data syncs automatically when online
            <br />• Maximum storage: 10,000 offline scans
          </p>
        </div>
      </div>
    </div>
  );
}
