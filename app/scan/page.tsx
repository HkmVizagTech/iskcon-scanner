"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { CheckCircle, XCircle, ArrowLeft, Camera } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface AssignedStation {
  _id: string;
  name: string;
  stationLabel: string;
  type: string;
  allowGroupCount?: boolean;
}

export default function ScanPage() {
  const router = useRouter();
  const [volunteerName, setVolunteerName] = useState("");
  const [assignedStations, setAssignedStations] = useState<AssignedStation[]>(
    [],
  );
  const [selectedStation, setSelectedStation] = useState("");
  const [lastResult, setLastResult] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [scanCount, setScanCount] = useState(0);
  const [availableCameras, setAvailableCameras] = useState<any[]>([]);
  const [currentCameraId, setCurrentCameraId] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [showGroupInput, setShowGroupInput] = useState(false);
  const [groupCount, setGroupCount] = useState(1);
  const [stationAllowsGroup, setStationAllowsGroup] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const resultTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Refs so callbacks always read current values (avoids stale closure)
  const selectedStationRef = useRef("");
  const assignedStationsRef = useRef<AssignedStation[]>([]);
  const groupCountRef = useRef(1);
  const currentCameraIdRef = useRef("");

  // Keep refs in sync with state
  useEffect(() => {
    selectedStationRef.current = selectedStation;
  }, [selectedStation]);
  useEffect(() => {
    assignedStationsRef.current = assignedStations;
  }, [assignedStations]);
  useEffect(() => {
    groupCountRef.current = groupCount;
  }, [groupCount]);
  useEffect(() => {
    currentCameraIdRef.current = currentCameraId;
  }, [currentCameraId]);

  // ─── Camera helpers ───────────────────────────────────────────────
  const pickBackCamera = (cameras: any[]) => {
    const back = cameras.find((c) => /back|environment|rear/i.test(c.label));
    return back ?? cameras[0];
  };

  // ─── Stable callback ref ──────────────────────────────────────────
  // html5-qrcode internally registers whichever function you pass to
  // scanner.start(). If you pass a new function reference on each
  // startScanner() call it accumulates listeners → double/triple fire.
  // Solution: always pass the SAME stable wrapper; the wrapper reads
  // the latest logic from onScanSuccessImpl via a ref.
  const onScanSuccessImplRef = useRef<(text: string) => Promise<void>>(
    async () => {},
  );
  // Stable wrapper — identity never changes, so html5-qrcode only ever
  // has ONE listener registered regardless of how many restarts happen.
  const stableCallback = useRef((decodedText: string) => {
    onScanSuccessImplRef.current(decodedText);
  }).current;

  // ─── Start scanner ────────────────────────────────────────────────
  const startScanner = useCallback(
    async (cameraId: string) => {
      // Tear down any existing instance first
      if (scannerRef.current) {
        try {
          const state = scannerRef.current.getState();
          if (
            state === Html5QrcodeScannerState.SCANNING ||
            state === Html5QrcodeScannerState.PAUSED
          ) {
            await scannerRef.current.stop();
          }
        } catch (_) {}
        scannerRef.current = null;
      }

      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      try {
        await scanner.start(
          cameraId,
          {
            fps: 20,
            aspectRatio: window.innerHeight / window.innerWidth,
            disableFlip: false,
          },
          stableCallback, // ← same reference every time, never accumulates
          () => {},
        );
        setIsScanning(true);
      } catch (err: any) {
        console.error("startScanner error:", err);
        toast.error("Camera failed to start. Check permissions.");
      }
    },
    [stableCallback],
  );

  // ─── Stop scanner ─────────────────────────────────────────────────
  const stopScanner = useCallback(async () => {
    setIsScanning(false);
    if (!scannerRef.current) return;
    try {
      const state = scannerRef.current.getState();
      if (
        state === Html5QrcodeScannerState.SCANNING ||
        state === Html5QrcodeScannerState.PAUSED
      ) {
        await scannerRef.current.stop();
      }
    } catch (_) {}
    scannerRef.current = null;
  }, []);

  // ─── Scan success implementation (updated every render via ref) ───
  // This is NOT passed to html5-qrcode directly — stableCallback is.
  // So it can safely read fresh state/refs without closure issues.
  onScanSuccessImplRef.current = async (decodedText: string) => {
    // Synchronous guard — must be FIRST, before any await
    if (processingRef.current) return;
    processingRef.current = true;

    // Null-out scanner ref synchronously so any in-flight frame
    // callbacks from html5-qrcode hit a dead instance
    const activeScanner = scannerRef.current;
    scannerRef.current = null;
    setIsScanning(false);

    try {
      await activeScanner?.stop();
    } catch (_) {}

    try {
      const token = localStorage.getItem("scannerToken");
      const currentStationId = selectedStationRef.current;
      const currentStations = assignedStationsRef.current;
      const currentGroupCount = groupCountRef.current;

      const stationData = currentStations.find(
        (s) => s._id === currentStationId,
      );
      const effectiveCount = stationData?.allowGroupCount
        ? currentGroupCount
        : 1;

      if (!currentStationId) {
        setLastResult({
          success: false,
          result: "invalid",
          message: "No station selected.",
        });
        processingRef.current = false;
        return;
      }

      const response = await axios.post(
        `${API_URL}/scan`,
        {
          qrData: decodedText,
          epId: currentStationId,
          stationLabel: stationData?.stationLabel || "",
          groupCount: effectiveCount,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setLastResult(response.data);

      if (response.data.success) {
        setScanCount((prev) => prev + effectiveCount);
        navigator.vibrate?.(200);
      } else {
        navigator.vibrate?.([100, 100, 100]);
      }

      setShowGroupInput(false);
      setGroupCount(1);
    } catch (error: any) {
      setLastResult({
        success: false,
        result: "invalid",
        message: error.response?.data?.message || "Scan failed.",
      });
      navigator.vibrate?.([100, 100, 100]);
    }

    // Auto-restart after 2 s
    resultTimerRef.current = setTimeout(() => {
      setLastResult(null);
      processingRef.current = false;
      const camId = currentCameraIdRef.current;
      if (camId) startScanner(camId);
    }, 2000);
  };

  // ─── Initialise on mount ──────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("scannerToken");
    const name = localStorage.getItem("volunteerName");
    const stations: AssignedStation[] = JSON.parse(
      localStorage.getItem("assignedEntryPoints") || "[]",
    );

    if (!token || stations.length === 0) {
      router.push("/");
      return;
    }

    setVolunteerName(name || "Volunteer");
    setAssignedStations(stations);
    setIsOnline(navigator.onLine);

    Html5Qrcode.getCameras()
      .then((cameras) => {
        if (!cameras?.length) {
          toast.error("No cameras found.");
          return;
        }
        setAvailableCameras(cameras);
        const preferred = pickBackCamera(cameras);
        setCurrentCameraId(preferred.id);

        // Pre-select station
        const firstStation = stations.length === 1 ? stations[0] : null;
        if (firstStation) {
          setSelectedStation(firstStation._id);
          setStationAllowsGroup(firstStation.allowGroupCount ?? false);
        }
      })
      .catch(() => toast.error("Camera permission denied."));

    return () => {
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      stopScanner();
    };
  }, []);

  // ─── (Re)start scanner when camera or station changes ────────────
  useEffect(() => {
    if (!currentCameraId || !selectedStation) return;
    const t = setTimeout(() => startScanner(currentCameraId), 300);
    return () => clearTimeout(t);
  }, [currentCameraId, selectedStation]);

  // ─── Switch camera ────────────────────────────────────────────────
  const switchCamera = async () => {
    if (availableCameras.length < 2) return;
    await stopScanner();
    const idx = availableCameras.findIndex((c) => c.id === currentCameraId);
    const next = availableCameras[(idx + 1) % availableCameras.length];
    setCurrentCameraId(next.id);
  };

  // ─── Station change ───────────────────────────────────────────────
  const handleStationChange = async (stationId: string) => {
    await stopScanner();
    processingRef.current = false;
    setLastResult(null);
    setShowGroupInput(false);
    setGroupCount(1);

    const station = assignedStations.find((s) => s._id === stationId);
    setStationAllowsGroup(station?.allowGroupCount ?? false);
    setSelectedStation(stationId);
    // startScanner will be triggered by the useEffect above
  };

  // ─── Go back ──────────────────────────────────────────────────────
  const handleGoBack = async () => {
    await stopScanner();
    localStorage.removeItem("scannerToken");
    localStorage.removeItem("volunteerName");
    localStorage.removeItem("assignedEntryPoints");
    router.push("/");
  };

  const selectedStationData = assignedStations.find(
    (s) => s._id === selectedStation,
  );

  // ─── Manual resume ────────────────────────────────────────────────
  const handleContinue = () => {
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    setLastResult(null);
    processingRef.current = false;
    const camId = currentCameraIdRef.current;
    if (camId) startScanner(camId);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* ── Header ── */}
      <div className="flex-shrink-0 z-30 bg-gradient-to-r from-orange-500 to-red-600">
        <div className="flex items-center px-3 py-2">
          <button onClick={handleGoBack} className="text-white p-1.5 -ml-1">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 text-center mx-2 min-w-0">
            <div className="font-bold text-sm text-white truncate">
              {selectedStationData?.stationLabel || "Scanner"}
            </div>
            <div className="text-[10px] text-white/70">{volunteerName}</div>
          </div>
          <div className="bg-white/20 px-2.5 py-0.5 rounded-full">
            <span className="font-bold text-xs text-white">{scanCount}</span>
          </div>
        </div>

        {assignedStations.length > 1 && (
          <div className="px-3 pb-2">
            <select
              value={selectedStation}
              onChange={(e) => handleStationChange(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-white/20 text-white text-xs border border-white/30"
            >
              {assignedStations.map((station) => (
                <option
                  key={station._id}
                  value={station._id}
                  className="text-gray-900"
                >
                  {station.stationLabel}
                  {station.allowGroupCount ? " 👨‍👩‍👧‍👦" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Camera viewport ── */}
      <div className="flex-1 relative bg-black overflow-hidden">
        {/* html5-qrcode mounts here; full-screen via CSS below */}
        <div id="qr-reader" className="absolute inset-0" />

        {/* Switch camera button */}
        {availableCameras.length > 1 && (
          <button
            onClick={switchCamera}
            className="absolute top-3 right-3 z-20 bg-black/50 text-white p-2 rounded-full"
          >
            <Camera className="w-4 h-4" />
          </button>
        )}

        {/* Corner brackets overlay (cosmetic only – no qrbox restriction!) */}
        {isScanning && !lastResult && (
          <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
            <div className="relative w-[240px] h-[240px]">
              <div className="absolute top-0 left-0 w-9 h-9 border-t-[3px] border-l-[3px] border-orange-400 rounded-tl" />
              <div className="absolute top-0 right-0 w-9 h-9 border-t-[3px] border-r-[3px] border-orange-400 rounded-tr" />
              <div className="absolute bottom-0 left-0 w-9 h-9 border-b-[3px] border-l-[3px] border-orange-400 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-9 h-9 border-b-[3px] border-r-[3px] border-orange-400 rounded-br" />
              {/* Scanning line animation */}
              <div className="absolute left-1 right-1 h-[2px] bg-orange-400/70 animate-scan-line" />
            </div>

            {!isOnline && (
              <div className="absolute bottom-[20%] left-0 right-0 flex justify-center">
                <span className="bg-yellow-500/90 text-white text-xs px-3 py-1 rounded-full">
                  Offline – Scans will sync
                </span>
              </div>
            )}
          </div>
        )}

        {/* Result overlay */}
        {lastResult && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
            <div
              className={`w-full max-w-[260px] rounded-2xl p-6 text-center shadow-xl ${
                lastResult.success ? "bg-green-50" : "bg-red-50"
              }`}
            >
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 ${
                  lastResult.success ? "bg-green-500" : "bg-red-500"
                }`}
              >
                {lastResult.success ? (
                  <CheckCircle className="w-7 h-7 text-white" />
                ) : (
                  <XCircle className="w-7 h-7 text-white" />
                )}
              </div>
              <h2
                className={`text-lg font-bold mb-1 ${
                  lastResult.success ? "text-green-900" : "text-red-900"
                }`}
              >
                {lastResult.success ? "Access Granted" : "Access Denied"}
              </h2>
              {lastResult.success ? (
                <p className="text-base text-green-800 font-medium truncate">
                  {lastResult.holderName || lastResult.holder_name}
                </p>
              ) : (
                <p className="text-sm text-red-700">{lastResult.message}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Group count modal ── */}
      {stationAllowsGroup && showGroupInput && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl p-6 w-full max-w-[280px] text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Number of People
            </h3>
            <div className="flex items-center justify-center space-x-3 mb-6">
              <button
                onClick={() => setGroupCount((n) => Math.max(1, n - 1))}
                className="w-12 h-12 rounded-full bg-orange-100 text-orange-600 text-2xl font-bold"
              >
                −
              </button>
              <input
                type="number"
                value={groupCount}
                onChange={(e) =>
                  setGroupCount(Math.max(1, parseInt(e.target.value) || 1))
                }
                className="w-20 h-12 text-center text-2xl font-bold border-2 border-orange-500 rounded-lg"
                min="1"
              />
              <button
                onClick={() => setGroupCount((n) => n + 1)}
                className="w-12 h-12 rounded-full bg-orange-100 text-orange-600 text-2xl font-bold"
              >
                +
              </button>
            </div>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  setShowGroupInput(false);
                  setGroupCount(1);
                  try {
                    await scannerRef.current?.resume();
                    setIsScanning(true);
                  } catch (_) {}
                }}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowGroupInput(false);
                  try {
                    await scannerRef.current?.resume();
                    setIsScanning(true);
                  } catch (_) {}
                }}
                className="flex-1 py-2.5 bg-orange-600 text-white rounded-lg font-medium"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group quick-button */}
      {stationAllowsGroup && isScanning && !lastResult && !showGroupInput && (
        <button
          onClick={async () => {
            setShowGroupInput(true);
            try {
              await scannerRef.current?.pause(true);
              setIsScanning(false);
            } catch (_) {}
          }}
          className="absolute bottom-24 left-4 right-4 z-20 py-3 bg-white/90 text-orange-700 font-medium rounded-xl text-sm shadow-lg"
        >
          👨‍👩‍👧‍👦 Family/Group: {groupCount} {groupCount > 1 ? "people" : "person"}
          <span className="block text-xs text-gray-500">Tap to change</span>
        </button>
      )}

      {/* ── Footer ── */}
      <div className="bg-white px-4 py-3 flex-shrink-0 z-30 border-t border-gray-200">
        <div className="flex gap-3">
          <button
            onClick={handleGoBack}
            className="flex-1 py-2.5 text-gray-600 font-medium rounded-lg bg-white text-sm border border-gray-300"
          >
            Exit
          </button>
          <button
            onClick={handleContinue}
            className="flex-1 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white font-medium rounded-lg text-sm"
          >
            Continue
          </button>
        </div>
      </div>

      <style jsx global>{`
        /* Make html5-qrcode fill its container completely */
        #qr-reader {
          border: none !important;
          padding: 0 !important;
          margin: 0 !important;
          width: 100% !important;
          height: 100% !important;
        }
        #qr-reader__scan_region {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
        }
        #qr-reader__scan_region video {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
        /* Hide html5-qrcode's own UI chrome */
        #qr-reader__dashboard,
        #qr-reader__status_span,
        #qr-reader__scan_region > img,
        #qr-shaded-region,
        div[id^="qr-shaded-region"] {
          display: none !important;
        }

        /* Scanning line animation */
        @keyframes scan-line {
          0% {
            top: 0;
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
          100% {
            top: calc(100% - 2px);
            opacity: 1;
          }
        }
        .animate-scan-line {
          animation: scan-line 2s ease-in-out infinite alternate;
        }
      `}</style>
    </div>
  );
}
