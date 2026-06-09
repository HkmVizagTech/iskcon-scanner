"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { CheckCircle, XCircle, ArrowLeft, Camera, Wifi, WifiOff } from "lucide-react";
import toast from "react-hot-toast";
import { saveScan, generateClientScanId } from "@/lib/db";
import { syncService } from "@/lib/sync";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface Station {
  _id: string;
  name: string;
  stationLabel: string;
  type: string;
  allowGroupCount?: boolean;
  eventId: string;
  eventName?: string;
  eventCode?: string;
}

interface EventInfo {
  _id: string;
  name: string;
  eventCode?: string;
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export default function ScanPage() {
  const router = useRouter();

  // Data
  const [volunteerName, setVolunteerName] = useState("");
  const [stations, setStations] = useState<Station[]>([]);
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection
  const [selectedEvent, setSelectedEvent] = useState("");
  const [selectedStation, setSelectedStation] = useState("");

  // Scanner UI
  const [isOnline, setIsOnline] = useState(true);
  const [scanCount, setScanCount] = useState(0);
  const [lastResult, setLastResult] = useState<any>(null);
  const [cameras, setCameras] = useState<any[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [groupCount, setGroupCount] = useState(1);
  const [showGroupInput, setShowGroupInput] = useState(false);

  // Refs for scan callback (always latest values)
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const resultTimerRef = useRef<NodeJS.Timeout | null>(null);
  const selectedStationRef = useRef("");
  const stationsRef = useRef<Station[]>([]);
  const groupCountRef = useRef(1);
  const cameraIdRef = useRef("");
  const cooldownRef = useRef<Map<string, number>>(new Map());
  const COOLDOWN_MS = 8000;

  useEffect(() => { selectedStationRef.current = selectedStation; }, [selectedStation]);
  useEffect(() => { stationsRef.current = stations; }, [stations]);
  useEffect(() => { groupCountRef.current = groupCount; }, [groupCount]);
  useEffect(() => { cameraIdRef.current = cameraId; }, [cameraId]);

  // Stations visible for the currently selected event, deduped by _id.
  // If selectedEvent is not yet set (initial load), show all stations as a fallback
  // so the dropdown is never unexpectedly empty.
  const visibleStations = (() => {
    const seen = new Set<string>();
    const pool = selectedEvent
      ? stations.filter((s) => String(s.eventId) === String(selectedEvent))
      : stations;
    return pool.filter((s) => {
      if (seen.has(s._id)) return false;
      seen.add(s._id);
      return true;
    });
  })();

  const selectedStationData = stations.find((s) => s._id === selectedStation);
  const selectedEventData = events.find((e) => e._id === selectedEvent);
  const stationAllowsGroup = selectedStationData?.allowGroupCount ?? false;

  // ─── Load assignments from server (single source of truth) ─────────────────
  const loadAssignments = useCallback(async () => {
    const token = localStorage.getItem("scannerToken");
    if (!token) { router.push("/"); return; }
    if (isTokenExpired(token)) {
      toast.error("Session expired. Please log in again.");
      localStorage.removeItem("scannerToken");
      router.push("/");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/volunteers/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        localStorage.removeItem("scannerToken");
        router.push("/");
        return;
      }
      if (!res.ok) {
        // Server error — try fallback from login data in localStorage
        console.error("loadAssignments: server returned", res.status);
        const fallbackStations = tryLocalStorageFallback();
        if (fallbackStations) return;
        toast.error(`Server error (${res.status}). Tap Retry.`);
        setLoading(false);
        return;
      }

      const data = await res.json();
      applyVolunteerData(data.volunteer);
    } catch (err) {
      console.error("loadAssignments fetch error:", err);
      // Network error — try fallback from login data
      const fallbackStations = tryLocalStorageFallback();
      if (fallbackStations) return;
      toast.error("Could not load stations. Check your connection.");
      setLoading(false);
    }
  }, [router]);

  // Fallback: use data saved by the login page in localStorage
  const tryLocalStorageFallback = useCallback(() => {
    try {
      const savedStations = localStorage.getItem("assignedEntryPoints");
      const savedEvents = localStorage.getItem("assignedEvents");
      if (savedStations) {
        const parsed = JSON.parse(savedStations);
        if (parsed.length > 0) {
          applyVolunteerData({
            name: localStorage.getItem("volunteerName") || "Volunteer",
            assignedEntryPoints: parsed,
            assignedEvents: savedEvents ? JSON.parse(savedEvents) : [],
          });
          return true;
        }
      }
    } catch (_) {}
    return false;
  }, []);

  // Common function to apply volunteer data from either /me or localStorage
  const applyVolunteerData = useCallback((volunteer: any) => {
    if (!volunteer) { setLoading(false); return; }

    const freshStations: Station[] = (volunteer.assignedEntryPoints || []).map((s: any) => ({
      ...s,
      _id: String(s._id),
      eventId: String(s.eventId || ""),
    }));
    const freshEvents: EventInfo[] = (volunteer.assignedEvents || []).map((e: any) => ({
      ...e,
      _id: String(e._id),
    }));

    setStations(freshStations);
    setEvents(freshEvents);
    setVolunteerName(volunteer.name || localStorage.getItem("volunteerName") || "Volunteer");

    // Pick an event: keep current if still valid, else first event that has stations
    setSelectedEvent((prev) => {
      const eventIdsWithStations = new Set(freshStations.map((s) => s.eventId));
      if (prev && eventIdsWithStations.has(prev)) return prev;
      return freshEvents.find((e) => eventIdsWithStations.has(e._id))?._id
        || freshStations[0]?.eventId
        || "";
    });

    setLoading(false);

    if (freshStations.length === 0) {
      toast.error("No active stations assigned to you. Contact your admin.");
    }
  }, []);

  // When the selected event changes, auto-pick its first station
  useEffect(() => {
    if (visibleStations.length === 0) { setSelectedStation(""); return; }
    setSelectedStation((prev) => {
      if (prev && visibleStations.some((s) => s._id === prev)) return prev;
      return visibleStations[0]._id;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent, stations]);

  // ─── Scanner lifecycle ─────────────────────────────────────────────────────
  const onScanRef = useRef<(text: string) => Promise<void>>(async () => {});
  const stableCallback = useRef((text: string) => { onScanRef.current(text); }).current;

  const startScanner = useCallback(async (camId: string) => {
    if (!camId) return;
    if (scannerRef.current) {
      try {
        const st = scannerRef.current.getState();
        if (st === Html5QrcodeScannerState.SCANNING || st === Html5QrcodeScannerState.PAUSED) {
          await scannerRef.current.stop();
        }
      } catch (_) {}
      scannerRef.current = null;
    }
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;
    try {
      await scanner.start(
        camId,
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: window.innerHeight / window.innerWidth },
        stableCallback,
        () => {},
      );
      setIsScanning(true);
    } catch (err) {
      console.error("startScanner:", err);
      toast.error("Camera failed to start. Check permissions.");
    }
  }, [stableCallback]);

  const stopScanner = useCallback(async () => {
    setIsScanning(false);
    if (!scannerRef.current) return;
    try {
      const st = scannerRef.current.getState();
      if (st === Html5QrcodeScannerState.SCANNING || st === Html5QrcodeScannerState.PAUSED) {
        await scannerRef.current.stop();
      }
    } catch (_) {}
    scannerRef.current = null;
  }, []);

  // ─── Scan handler ────────────────────────────────────────────────────────
  onScanRef.current = async (decodedText: string) => {
    if (processingRef.current) return;

    const stationId = selectedStationRef.current;
    if (!stationId) {
      toast.error("Select a station first");
      return;
    }

    // Cooldown — same QR at same station within 8s is ignored
    const key = `${decodedText.slice(-20)}::${stationId}`;
    const last = cooldownRef.current.get(key) || 0;
    if (Date.now() - last < COOLDOWN_MS) return;
    cooldownRef.current.set(key, Date.now());

    processingRef.current = true;
    const active = scannerRef.current;
    scannerRef.current = null;
    setIsScanning(false);
    try { await active?.stop(); } catch (_) {}

    const station = stationsRef.current.find((s) => s._id === stationId);
    const count = station?.allowGroupCount ? groupCountRef.current : 1;
    const clientScanId = generateClientScanId();

    try {
      const token = localStorage.getItem("scannerToken");
      if (!token || isTokenExpired(token)) {
        toast.error("Session expired. Please log in again.");
        localStorage.removeItem("scannerToken");
        router.push("/");
        return;
      }

      toast("Scanning...", { icon: "⏳", duration: 1500 });

      const res = await fetch(`${API_URL}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          qrData: decodedText,
          epId: stationId,
          stationLabel: station?.stationLabel || "",
          groupCount: count,
          clientScanId,
        }),
      });
      const result = await res.json();
      if (!res.ok && !result.success) {
        console.error("Scan API error:", res.status, result);
      }
      setLastResult(result);
      if (result.success) {
        setScanCount((p) => p + count);
        navigator.vibrate?.(200);
      } else {
        navigator.vibrate?.([100, 100, 100]);
      }
      setShowGroupInput(false);
    } catch (err: any) {
      console.error("Scan fetch error:", err);
      // Offline — save locally
      try {
        await saveScan({
          clientScanId,
          qrData: decodedText,
          epId: stationId,
          station: station?.stationLabel || stationId,
          timestamp: new Date(),
          result: "granted",
          synced: false,
        });
      } catch (_) {}
      setLastResult({ success: true, result: "offline_saved", message: "Saved offline — will sync", holderName: "" });
      navigator.vibrate?.(200);
    }

    resultTimerRef.current = setTimeout(() => {
      setLastResult(null);
      processingRef.current = false;
      if (cameraIdRef.current) startScanner(cameraIdRef.current);
    }, 2000);
  };

  // ─── Mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    setIsOnline(navigator.onLine);
    loadAssignments();
    syncService.start();

    const onOnline = () => { setIsOnline(true); loadAssignments(); };
    const onOffline = () => setIsOnline(false);
    const onFocus = () => loadAssignments();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onFocus);

    Html5Qrcode.getCameras()
      .then((cams) => {
        if (!cams?.length) { toast.error("No camera found"); return; }
        setCameras(cams);
        const back = cams.find((c) => /back|environment|rear/i.test(c.label)) || cams[0];
        setCameraId(back.id);
      })
      .catch(() => toast.error("Camera permission denied"));

    return () => {
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      stopScanner();
      syncService.stop();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start camera once we have both a camera and a selected station
  useEffect(() => {
    if (!cameraId || !selectedStation) return;
    const t = setTimeout(() => startScanner(cameraId), 300);
    return () => clearTimeout(t);
  }, [cameraId, selectedStation, startScanner]);

  const switchCamera = async () => {
    if (cameras.length < 2) return;
    await stopScanner();
    const idx = cameras.findIndex((c) => c.id === cameraId);
    setCameraId(cameras[(idx + 1) % cameras.length].id);
  };

  const handleEventChange = async (eventId: string) => {
    await stopScanner();
    processingRef.current = false;
    setLastResult(null);
    setSelectedEvent(eventId);
  };

  const handleStationChange = async (stationId: string) => {
    await stopScanner();
    processingRef.current = false;
    setLastResult(null);
    setGroupCount(1);
    setSelectedStation(stationId);
  };

  const handleExit = async () => {
    await stopScanner();
    localStorage.removeItem("scannerToken");
    localStorage.removeItem("volunteerName");
    localStorage.removeItem("assignedEntryPoints");
    localStorage.removeItem("assignedEvents");
    router.push("/");
  };

  const handleContinue = () => {
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    setLastResult(null);
    processingRef.current = false;
    if (cameraIdRef.current) startScanner(cameraIdRef.current);
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center text-white gap-4">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-white/70">Loading your stations...</p>
      </div>
    );
  }

  if (stations.length === 0) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center text-white gap-4 px-8 text-center">
        <p className="font-semibold">No stations assigned</p>
        <p className="text-sm text-white/60">You have no active event stations. Please contact your administrator.</p>
        <div className="flex gap-3 mt-2">
          <button onClick={() => loadAssignments()} className="px-4 py-2 bg-orange-600 rounded-lg text-sm">Retry</button>
          <button onClick={handleExit} className="px-4 py-2 border border-white/30 rounded-lg text-sm">Log out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 z-30 bg-gradient-to-r from-orange-500 to-red-600">
        <div className="flex items-center px-3 py-2">
          <button onClick={handleExit} className="text-white p-1.5 -ml-1"><ArrowLeft className="w-5 h-5" /></button>
          <div className="flex-1 text-center mx-2 min-w-0">
            <div className="font-bold text-sm text-white truncate">
              {selectedStationData?.stationLabel || "Scanner"}
            </div>
            {selectedEventData?.name && (
              <div className="text-[10px] text-white/90 font-medium truncate">🕉️ {selectedEventData.name}</div>
            )}
            <div className="text-[10px] text-white/70 flex items-center justify-center gap-1">
              {volunteerName}
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3 opacity-60" />}
            </div>
          </div>
          <div className="bg-white/20 px-2.5 py-0.5 rounded-full"><span className="font-bold text-xs text-white">{scanCount}</span></div>
        </div>

        {/* Event selector — only if more than one event */}
        {events.length > 1 && (
          <div className="px-3 pb-2">
            <label className="block text-[10px] text-white/70 mb-1">Festival / Event</label>
            <select value={selectedEvent} onChange={(e) => handleEventChange(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-white/20 text-white text-xs border border-white/30">
              {events.map((ev) => (
                <option key={ev._id} value={ev._id} className="text-gray-900">🕉️ {ev.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Station selector — only this event's stations */}
        {visibleStations.length > 1 && (
          <div className="px-3 pb-2">
            <label className="block text-[10px] text-white/70 mb-1">Station</label>
            <select value={selectedStation} onChange={(e) => handleStationChange(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-white/20 text-white text-xs border border-white/30">
              {visibleStations.map((s) => (
                <option key={s._id} value={s._id} className="text-gray-900">
                  {s.stationLabel}{s.allowGroupCount ? " 👨‍👩‍👧‍👦" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Camera */}
      <div className="flex-1 relative bg-black overflow-hidden">
        <div id="qr-reader" className="absolute inset-0" />
        {cameras.length > 1 && (
          <button onClick={switchCamera} className="absolute top-3 right-3 z-20 bg-black/50 text-white p-2 rounded-full">
            <Camera className="w-4 h-4" />
          </button>
        )}

        {isScanning && !lastResult && (
          <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
            <div className="relative w-[240px] h-[240px]">
              <div className="absolute top-0 left-0 w-9 h-9 border-t-[3px] border-l-[3px] border-orange-400 rounded-tl" />
              <div className="absolute top-0 right-0 w-9 h-9 border-t-[3px] border-r-[3px] border-orange-400 rounded-tr" />
              <div className="absolute bottom-0 left-0 w-9 h-9 border-b-[3px] border-l-[3px] border-orange-400 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-9 h-9 border-b-[3px] border-r-[3px] border-orange-400 rounded-br" />
            </div>
          </div>
        )}

        {lastResult && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
            <div className={`w-full max-w-[260px] rounded-2xl p-6 text-center shadow-xl ${lastResult.success ? "bg-green-50" : "bg-red-50"}`}>
              <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 ${lastResult.success ? "bg-green-500" : "bg-red-500"}`}>
                {lastResult.success ? <CheckCircle className="w-7 h-7 text-white" /> : <XCircle className="w-7 h-7 text-white" />}
              </div>
              <h2 className={`text-lg font-bold mb-1 ${lastResult.success ? "text-green-900" : "text-red-900"}`}>
                {lastResult.success ? "Access Granted" : "Access Denied"}
              </h2>
              {lastResult.success
                ? <p className="text-base text-green-800 font-medium truncate">{lastResult.holderName || lastResult.holder_name || ""}</p>
                : <p className="text-sm text-red-700">{lastResult.message}</p>}
            </div>
          </div>
        )}
      </div>

      {/* Group count modal */}
      {stationAllowsGroup && showGroupInput && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl p-6 w-full max-w-[280px] text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Number of People</h3>
            <div className="flex items-center justify-center space-x-3 mb-6">
              <button onClick={() => setGroupCount((n) => Math.max(1, n - 1))} className="w-12 h-12 rounded-full bg-orange-100 text-orange-600 text-2xl font-bold">−</button>
              <input type="number" value={groupCount} onChange={(e) => setGroupCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 h-12 text-center text-2xl font-bold border-2 border-orange-500 rounded-lg" min="1" />
              <button onClick={() => setGroupCount((n) => n + 1)} className="w-12 h-12 rounded-full bg-orange-100 text-orange-600 text-2xl font-bold">+</button>
            </div>
            <button onClick={() => setShowGroupInput(false)} className="w-full py-2.5 bg-orange-600 text-white rounded-lg font-medium">Done</button>
          </div>
        </div>
      )}

      {stationAllowsGroup && isScanning && !lastResult && !showGroupInput && (
        <button onClick={() => setShowGroupInput(true)}
          className="absolute bottom-24 left-4 right-4 z-20 py-3 bg-white/90 text-orange-700 font-medium rounded-xl text-sm shadow-lg">
          👨‍👩‍👧‍👦 Group: {groupCount} {groupCount > 1 ? "people" : "person"} — tap to change
        </button>
      )}

      {/* Footer */}
      <div className="bg-white px-4 py-3 flex-shrink-0 z-30 border-t border-gray-200">
        <div className="flex gap-3">
          <button onClick={handleExit} className="flex-1 py-2.5 text-gray-600 font-medium rounded-lg bg-white text-sm border border-gray-300">Exit</button>
          <button onClick={handleContinue} className="flex-1 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white font-medium rounded-lg text-sm">Continue</button>
        </div>
      </div>

      <style jsx global>{`
        #qr-reader { border: none !important; padding: 0 !important; margin: 0 !important; width: 100% !important; height: 100% !important; }
        #qr-reader__scan_region { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; }
        #qr-reader__scan_region video { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; object-fit: cover !important; }
        #qr-reader__dashboard, #qr-reader__status_span, #qr-reader__scan_region > img, #qr-shaded-region, div[id^="qr-shaded-region"] { display: none !important; }
      `}</style>
    </div>
  );
}
