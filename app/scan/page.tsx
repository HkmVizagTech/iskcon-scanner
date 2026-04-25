"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Html5Qrcode } from "html5-qrcode";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowLeft,
  MapPin,
  Camera,
} from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface AssignedStation {
  _id: string;
  name: string;
  stationLabel: string;
  type: string;
}

export default function ScanPage() {
  const router = useRouter();
  const [volunteerName, setVolunteerName] = useState("");
  const [assignedStations, setAssignedStations] = useState<AssignedStation[]>(
    [],
  );
  const [selectedStation, setSelectedStation] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [scanCount, setScanCount] = useState(0);
  const [availableCameras, setAvailableCameras] = useState<any[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fix video size once
  const fixVideoOnce = () => {
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    const video = container.querySelector("video") as HTMLVideoElement;
    if (video && w > 0 && h > 0) {
      video.style.width = w + "px";
      video.style.height = h + "px";
      video.style.objectFit = "cover";
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("scannerToken");
    const name = localStorage.getItem("volunteerName");
    const stations = JSON.parse(
      localStorage.getItem("assignedEntryPoints") || "[]",
    );

    if (!token || stations.length === 0) {
      router.push("/");
      return;
    }

    setVolunteerName(name || "Volunteer");
    setAssignedStations(stations);

    if (stations.length === 1) {
      setSelectedStation(stations[0]._id);
    }

    setIsOnline(navigator.onLine);

    Html5Qrcode.getCameras()
      .then((cameras) => {
        setAvailableCameras(cameras || []);
        const backIdx = cameras?.findIndex(
          (cam) =>
            cam.label.toLowerCase().includes("back") ||
            cam.label.toLowerCase().includes("environment"),
        );
        if (backIdx !== -1) setCurrentCameraIndex(backIdx);
      })
      .catch(() => {});

    // Handle resize
    const handleResize = () => fixVideoOnce();
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (selectedStation) {
      const timer = setTimeout(() => startScanner(), 200);
      return () => clearTimeout(timer);
    }
  }, [selectedStation, currentCameraIndex]);

  const startScanner = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }

      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) {
        toast.error("No camera found");
        return;
      }

      const cameraId = cameras[currentCameraIndex]?.id || cameras[0].id;

      await scanner.start(
        cameraId,
        { fps: 10, aspectRatio: 1.0 },
        onScanSuccess,
        () => {},
      );

      setScanning(true);

      // Fix video after scanner initializes
      setTimeout(fixVideoOnce, 800);
      setTimeout(fixVideoOnce, 1500);
      setTimeout(fixVideoOnce, 3000);
    } catch (error: any) {
      console.error("Scanner error:", error);
      toast.error("Failed to start camera");
    }
  };

  const switchCamera = () => {
    if (availableCameras.length > 1) {
      setCurrentCameraIndex((prev) => (prev + 1) % availableCameras.length);
    }
  };

  const onScanSuccess = async (decodedText: string) => {
    if (!scanning) return;
    setScanning(false);
    try {
      await scannerRef.current?.pause();
    } catch (e) {}

    try {
      const token = localStorage.getItem("scannerToken");
      const stationData = assignedStations.find(
        (s) => s._id === selectedStation,
      );

      const response = await axios.post(
        `${API_URL}/scan`,
        {
          qrData: decodedText,
          epId: selectedStation,
          stationLabel: stationData?.stationLabel || "",
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setLastResult(response.data);
      if (response.data.success) {
        setScanCount((prev) => prev + 1);
        navigator.vibrate?.(200);
      } else {
        navigator.vibrate?.([100, 100, 100]);
      }
    } catch (error: any) {
      setLastResult({
        success: false,
        result: "invalid",
        message: error.response?.data?.message || "Scan failed.",
      });
    }

    setTimeout(async () => {
      setLastResult(null);
      setScanning(true);
      try {
        await scannerRef.current?.resume();
      } catch (e) {}
      fixVideoOnce();
    }, 2000);
  };

  const handleGoBack = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
    localStorage.removeItem("scannerToken");
    localStorage.removeItem("volunteerName");
    localStorage.removeItem("assignedEntryPoints");
    router.push("/");
  };

  const handleStationChange = async (stationId: string) => {
    setSelectedStation(stationId);
    setScanning(false);
    if (scannerRef.current) {
      await scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
  };

  const selectedStationData = assignedStations.find(
    (s) => s._id === selectedStation,
  );

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Header */}
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
          <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto">
            {assignedStations.map((station) => (
              <button
                key={station._id}
                onClick={() => handleStationChange(station._id)}
                className={`px-3 py-1 rounded-full text-[10px] flex-shrink-0 ${
                  selectedStation === station._id
                    ? "bg-white text-orange-700 font-semibold"
                    : "bg-white/20 text-white/90"
                }`}
              >
                <MapPin className="w-3 h-3 inline mr-0.5" />
                {station.stationLabel}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scanner - FULL SCREEN */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-black overflow-hidden"
      >
        <div
          id="qr-reader"
          style={{
            width: "100%",
            height: "100%",
            position: "absolute",
            inset: 0,
          }}
        />

        {availableCameras.length > 1 && (
          <button
            onClick={switchCamera}
            className="absolute top-3 right-3 z-20 bg-black/50 text-white p-2 rounded-full"
          >
            <Camera className="w-4 h-4" />
          </button>
        )}

        {/* Scan Overlay */}
        {scanning && !lastResult && (
          <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
            <div className="relative w-[200px] h-[200px] sm:w-[240px] sm:h-[240px]">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-orange-500" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-orange-500" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-orange-500" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-orange-500" />
            </div>
            {!isOnline && (
              <div className="absolute bottom-[20%] left-0 right-0 flex justify-center">
                <span className="bg-yellow-500/90 text-white text-xs px-3 py-1 rounded-full">
                  Offline - Scans will sync
                </span>
              </div>
            )}
          </div>
        )}

        {/* Result */}
        {lastResult && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
            <div
              className={`w-full max-w-[260px] rounded-2xl p-6 text-center ${
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
                className={`text-lg font-bold mb-1 ${lastResult.success ? "text-green-900" : "text-red-900"}`}
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

      {/* Footer */}
      <div className="bg-white px-4 py-3 flex-shrink-0 z-30 border-t border-gray-200">
        <div className="flex gap-3">
          <button
            onClick={handleGoBack}
            className="flex-1 py-2.5 text-gray-600 font-medium rounded-lg bg-white text-sm border border-gray-300"
          >
            Exit
          </button>
          <button
            onClick={() => {
              setLastResult(null);
              setScanning(true);
              scannerRef.current?.resume();
              fixVideoOnce();
            }}
            className="flex-1 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white font-medium rounded-lg text-sm"
          >
            Continue
          </button>
        </div>
      </div>

      <style jsx global>{`
        #qr-reader {
          border: none !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        #qr-reader__scan_region {
          position: absolute !important;
          inset: 0 !important;
        }
        #qr-reader__scan_region video {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          object-fit: cover !important;
        }
        #qr-reader__dashboard,
        #qr-reader__dashboard_section,
        #qr-reader__status_span,
        #qr-reader__scan_region > img,
        #qr-reader__viewport,
        #qr-shaded-region,
        div[id^="qr-shaded-region"] {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
