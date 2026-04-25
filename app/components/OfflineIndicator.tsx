"use client";

import { WifiOff, Wifi, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

interface OfflineIndicatorProps {
  pendingCount?: number;
  onSync?: () => void;
}

export default function OfflineIndicator({
  pendingCount = 0,
  onSync,
}: OfflineIndicatorProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setShowBanner(true);
      setTimeout(() => setShowBanner(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowBanner(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!showBanner && isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div className={`fixed bottom-20 left-4 right-4 z-40 transition-all`}>
      <div
        className={`max-w-md mx-auto rounded-xl shadow-lg p-4 ${
          isOnline
            ? "bg-green-50 border border-green-200"
            : "bg-yellow-50 border border-yellow-200"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {isOnline ? (
              <Wifi className="w-5 h-5 text-green-600 mr-3" />
            ) : (
              <WifiOff className="w-5 h-5 text-yellow-600 mr-3" />
            )}
            <div>
              <p
                className={`font-medium ${
                  isOnline ? "text-green-800" : "text-yellow-800"
                }`}
              >
                {isOnline ? "Back Online" : "Offline Mode"}
              </p>
              <p className="text-sm text-gray-600">
                {isOnline
                  ? `${pendingCount} scans synced`
                  : `${pendingCount} scans pending sync`}
              </p>
            </div>
          </div>

          {!isOnline && pendingCount > 0 && onSync && (
            <button
              onClick={onSync}
              className="px-3 py-1 bg-yellow-600 text-white rounded-lg text-sm flex items-center"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Sync
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
