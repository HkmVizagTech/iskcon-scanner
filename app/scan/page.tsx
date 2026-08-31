"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { CheckCircle, XCircle, ArrowLeft, Camera, Wifi, WifiOff } from "lucide-react";
import toast from "react-hot-toast";
import { saveScan, generateClientScanId } from "@/lib/db";
import { syncService } from "@/lib/sync";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface SevaSlot {
  code: string;
  name: string;
  time?: string;
  displayLabel?: string;
}

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
  // Venue names for this event (from the backend /me & /login responses).
  // Optional; missing → legacy behavior (no venue sent, valid everywhere).
  venues?: string[];
}


// ─── Result presentation: distinct look/sound/vibration per outcome ──────────
function getResultPresentation(r: any) {
  const result = r?.result || (r?.success ? "granted" : "invalid");
  switch (result) {
    case "granted":
      return { title: "Access Granted", emoji: "✅", bg: "bg-green-50", ring: "bg-green-500", text: "text-green-900", sub: "text-green-800", vibrate: [200], sound: "success" };
    case "offline_saved":
      return { title: "Saved Offline", emoji: "📥", bg: "bg-blue-50", ring: "bg-blue-500", text: "text-blue-900", sub: "text-blue-800", vibrate: [200], sound: "success" };
    case "duplicate":
      return { title: "Already Scanned", emoji: "🔁", bg: "bg-yellow-50", ring: "bg-yellow-500", text: "text-yellow-900", sub: "text-yellow-800", vibrate: [100, 80, 100], sound: "warn" };
    case "already_used":
      return { title: "Already Scanned Here", emoji: "🔁", bg: "bg-yellow-50", ring: "bg-yellow-500", text: "text-yellow-900", sub: "text-yellow-800", vibrate: [100, 80, 100], sound: "warn" };
    case "expired":
      return { title: "Pass Expired", emoji: "⌛", bg: "bg-red-50", ring: "bg-red-500", text: "text-red-900", sub: "text-red-700", vibrate: [120, 80, 120, 80, 120], sound: "error" };
    case "not_yet_valid":
      return { title: "Event Not Started", emoji: "🕐", bg: "bg-orange-50", ring: "bg-orange-500", text: "text-orange-900", sub: "text-orange-700", vibrate: [120, 80, 120], sound: "warn" };
    case "revoked":
      return { title: "Pass Revoked", emoji: "🚫", bg: "bg-red-50", ring: "bg-red-600", text: "text-red-900", sub: "text-red-700", vibrate: [120, 80, 120, 80, 120], sound: "error" };
    case "not_included":
      // When the backend includes allowedVenues, this is a venue mismatch
      // (pass valid at a different venue), not a station mismatch.
      return {
        title: (r && r.allowedVenues && r.allowedVenues.length > 0) ? "Wrong Venue" : "Wrong Station",
        emoji: "↪️", bg: "bg-red-50", ring: "bg-red-500", text: "text-red-900", sub: "text-red-700", vibrate: [120, 80, 120, 80, 120], sound: "error",
      };
    case "capacity_full":
      return { title: "Capacity Full", emoji: "🈵", bg: "bg-red-50", ring: "bg-red-500", text: "text-red-900", sub: "text-red-700", vibrate: [120, 80, 120, 80, 120], sound: "error" };
    case "link_required":
      return { title: "Scan Prerequisite First", emoji: "🔗", bg: "bg-orange-50", ring: "bg-orange-500", text: "text-orange-900", sub: "text-orange-700", vibrate: [120, 80, 120], sound: "warn" };
    default:
      return { title: "Access Denied", emoji: "❌", bg: "bg-red-50", ring: "bg-red-500", text: "text-red-900", sub: "text-red-700", vibrate: [120, 80, 120, 80, 120], sound: "error" };
  }
}

// Simple beep via WebAudio — distinct tones for success / warn / error
let audioCtx: AudioContext | null = null;
function playBeep(kind: "success" | "warn" | "error") {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx;
    const beep = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };
    if (kind === "success") { beep(880, 0, 0.12); beep(1320, 0.13, 0.15); }       // rising chirp
    else if (kind === "warn") { beep(600, 0, 0.15); beep(600, 0.2, 0.15); }        // double mid tone
    else { beep(280, 0, 0.25); beep(220, 0.28, 0.3); }                              // low falling buzz
  } catch (_) {}
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
  const [selectedVenue, setSelectedVenue] = useState("");
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
  const selectedVenueRef = useRef("");
  const selectedStationRef = useRef("");
  const stationsRef = useRef<Station[]>([]);
  const groupCountRef = useRef(1);
  const cameraIdRef = useRef("");
  const cooldownRef = useRef<Map<string, number>>(new Map());
  const cooldownNoticeRef = useRef<Map<string, number>>(new Map()); // throttles "already scanned" toast
  const watchdogRef = useRef<NodeJS.Timeout | null>(null); // force-recovers a stuck scanner
  const busyNoticeRef = useRef(0); // throttles "finishing previous scan" toast
  const lastResultRef = useRef<any>(null);
  const prevEventsRef = useRef<string[]>([]); // tracks event IDs from the last applyVolunteerData call
  const COOLDOWN_MS = 5000;

  useEffect(() => { selectedStationRef.current = selectedStation; }, [selectedStation]);
  useEffect(() => { selectedVenueRef.current = selectedVenue; }, [selectedVenue]);
  useEffect(() => { lastResultRef.current = lastResult; }, [lastResult]);
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

  // Stations that belong to a given event (used to label events with no stations)
  const eventsForStation = (eventId: string) =>
    stations.filter((s) => String(s.eventId) === String(eventId));

  // All events the volunteer can toggle between. Include events that come from
  // stations' eventIds even if they aren't in the assignedEvents list, so a
  // freshly assigned event/venue is never hidden from the toggle.
  const toggleableEvents = (() => {
    const map = new Map<string, EventInfo>();
    for (const ev of events) if (ev?._id) map.set(String(ev._id), ev);
    for (const s of stations) {
      if (s.eventId && !map.has(String(s.eventId))) {
        map.set(String(s.eventId), {
          _id: s.eventId,
          name: s.eventName || "Event",
          eventCode: s.eventCode,
        });
      }
    }
    return Array.from(map.values());
  })();

  // Display name for an event — prefer eventCode-based label for compactness
  const sortableEventName = (ev: EventInfo) =>
    ev.eventCode ? `${ev.eventCode} · ${ev.name}` : ev.name;

  const selectedStationData = stations.find((s) => s._id === selectedStation);
  const selectedEventData = events.find((e) => e._id === selectedEvent);
  const stationAllowsGroup = selectedStationData?.allowGroupCount ?? false;

  // Venues available for the currently selected event. Events may be served with
  // a `venues[]` list (names). If absent, we show no venue selector (legacy).
  const eventVenues: string[] = (() => {
    const list = selectedEventData?.venues;
    if (!Array.isArray(list) || list.length === 0) return [];
    return list.map((v) => String(v ?? "").trim()).filter(Boolean);
  })();

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
      // Refresh the localStorage cache so any fallback uses CURRENT data
      try {
        if (data.volunteer) {
          localStorage.setItem("assignedEntryPoints", JSON.stringify(data.volunteer.assignedEntryPoints || []));
          localStorage.setItem("assignedEvents", JSON.stringify(data.volunteer.assignedEvents || []));
          localStorage.setItem("volunteerName", data.volunteer.name || "Volunteer");
        }
      } catch (_) {}
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
      // eventId may be a populated object {_id, name, ...} or a plain string
      eventId: String(
        (s.eventId && typeof s.eventId === "object" ? s.eventId._id : s.eventId) || ""
      ),
      eventName: s.eventId && typeof s.eventId === "object" ? s.eventId.name : undefined,
      eventCode: s.eventId && typeof s.eventId === "object" ? s.eventId.eventCode : undefined,
    }));
    let freshEvents: EventInfo[] = (volunteer.assignedEvents || []).map((e: any) => ({
      ...e,
      _id: String(e._id),
      // Normalise the venues list into simple name strings. The backend serves
      // `venue` as an array of objects ({name, building, ...}); the scanner only
      // needs the names for its selector and scan payload.
      venues: (Array.isArray(e.venue) ? e.venue : [])
        .map((v: any) => String(v?.name ?? v ?? "").trim())
        .filter(Boolean),
    }));

    // Fallback: if no assignedEvents, derive them from the stations' embedded
    // event info (eventName/eventCode were pulled from the populated eventId).
    if (freshEvents.length === 0) {
      const seen = new Set<string>();
      freshEvents = freshStations
        .filter((s) => s.eventId && !seen.has(s.eventId) && seen.add(s.eventId))
        .map((s) => ({ _id: s.eventId, name: s.eventName || "Event", eventCode: s.eventCode }));
    } else {
      // Enrich existing events with name from stations if missing
      freshEvents = freshEvents.map((e) => {
        if (e.name) return e;
        const st = freshStations.find((s) => s.eventId === e._id);
        return { ...e, name: st?.eventName || e.name, eventCode: e.eventCode || st?.eventCode };
      });
    }

    console.log("[Scanner] freshStations:", freshStations.length, freshStations.map(s => s.eventId));
    console.log("[Scanner] freshEvents:", freshEvents.length, freshEvents.map(e => ({ id: e._id, name: e.name })));
    setStations(freshStations);
    setEvents(freshEvents);
    setVolunteerName(volunteer.name || localStorage.getItem("volunteerName") || "Volunteer");

    // Detect newly added events (not present in the previous assignment)
    const prevEventIds = prevEventsRef.current;
    const currentEventIds = freshEvents.map((e) => e._id);
    const newEventIds = currentEventIds.filter((id) => !prevEventIds.includes(id));
    prevEventsRef.current = currentEventIds;

    // Pick an event: prefer NEW events over previously selected ones so the
    // volunteer always lands on their latest assignment. Falls back to keeping
    // the current selection if nothing changed.
    setSelectedEvent((prev) => {
      const eventIdsWithStations = new Set(freshStations.map((s) => s.eventId));
      // If there are brand-new events, switch to the first one that has stations
      if (newEventIds.length > 0) {
        const newEventWithStations = newEventIds.find((id) => eventIdsWithStations.has(id));
        if (newEventWithStations) return newEventWithStations;
      }
      // No new events — keep the current selection if still valid
      if (prev && eventIdsWithStations.has(prev)) return prev;
      // Fallback: first event that has stations
      return freshEvents.find((e) => eventIdsWithStations.has(e._id))?._id
        || freshStations[0]?.eventId
        || "";
    });

    setLoading(false);

    if (freshStations.length === 0) {
      toast.error("No active stations assigned to you. Contact your admin.");
    }
  }, []);

  // When the selected event changes, auto-pick its first venue
  useEffect(() => {
    const venues = (() => {
      const ev = events.find((e) => e._id === selectedEvent);
      const list = ev?.venues;
      return (Array.isArray(list) ? list : []).map((v) => String(v ?? "").trim()).filter(Boolean);
    })();
    if (venues.length === 0) {
      // No venues on this event (legacy data) — clear selection
      if (selectedVenue !== "") setSelectedVenue("");
      return;
    }
    setSelectedVenue((prev) => {
      if (prev && venues.includes(prev)) return prev;
      return venues[0];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent]);

  // When the selected event changes, auto-pick its first station
  useEffect(() => {
    if (visibleStations.length === 0) {
      setSelectedStation("");
      // FIX: tell the volunteer why scanning can't start for this event
      if (selectedEvent && events.length > 1) {
        const ev = events.find((e) => e._id === selectedEvent);
        toast(`No stations assigned for ${ev?.name || "this event"}. Contact your admin.`, {
          icon: "⚠️",
          duration: 4000,
        });
      }
      return;
    }
    setSelectedStation((prev) => {
      if (prev && visibleStations.some((s) => s._id === prev)) return prev;
      return visibleStations[0]._id;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent, stations]);

  // ─── Scanner lifecycle ─────────────────────────────────────────────────────
  const onScanRef = useRef<(text: string) => Promise<void>>(async () => {});
  const stableCallback = useRef((text: string) => { onScanRef.current(text); }).current;

  // Resume decoding after a result. Falls back to a full restart if the
  // paused scanner was torn down (tab switch, camera change, etc).
  const resumeScanning = useCallback(() => {
    try {
      scannerRef.current?.resume();
      setIsScanning(true);
    } catch (_) {
      if (cameraIdRef.current) startScanner(cameraIdRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dismiss the result card immediately (tap anywhere on it) and resume scanning
  const dismissResult = useCallback(() => {
    if (resultTimerRef.current) { clearTimeout(resultTimerRef.current); resultTimerRef.current = null; }
    setLastResult(null);
    processingRef.current = false;
    resumeScanning();
  }, [resumeScanning]);

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
    const scanner = new Html5Qrcode("qr-reader", {
      // Use the browser's native BarcodeDetector when present — far faster
      // and far more tolerant of screen glare / angle than the JS decoder.
      useBarCodeDetectorIfSupported: true,
      verbose: false,
    });
    scannerRef.current = scanner;
    // Try the back camera with continuous autofocus; fall back gracefully.
    const configs = [
      { facingMode: { exact: "environment" } },
      camId,
      { facingMode: "environment" },
    ];
    let started = false;
    for (const camConfig of configs) {
      try {
        await scanner.start(
          camConfig as any,
          {
            fps: 15,
            // NO qrbox → decode the ENTIRE frame. The 250px box was the bug:
            // a QR held anywhere outside the centre box was never decoded.
            aspectRatio: undefined,
            disableFlip: false,
          },
          stableCallback,
          () => {},
        );
        started = true;
        break;
      } catch (err) {
        // try next config
      }
    }
    if (started) {
      setIsScanning(true);
    } else {
      console.error("startScanner: all camera configs failed");
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
  onScanRef.current = async (decodedTextRaw: string) => {
    // DEFENSIVE FIX: some Android/Chrome versions' native BarcodeDetector,
    // as wrapped by html5-qrcode's useBarCodeDetectorIfSupported path,
    // occasionally hand back a stringified wrapper object instead of the
    // raw value — e.g. '{"String":"ISK-SKJ26V-SP-0000391",...}' — which
    // then fails signature validation on the backend ("invalid" result).
    // Unwrap it here so a corrupted decode never reaches the API.
    let decodedText = decodedTextRaw;
    if (typeof decodedText === "string" && decodedText.startsWith('{"String"')) {
      try {
        const parsed = JSON.parse(decodedText);
        if (parsed && typeof parsed.String === "string") {
          decodedText = parsed.String;
        }
      } catch (_) {
        // fall through with the raw text — better than crashing
      }
    }

    if (processingRef.current) {
      const nowB = Date.now();
      if (nowB - busyNoticeRef.current > 2000) {
        busyNoticeRef.current = nowB;
        toast("Hold on — finishing previous scan", { icon: "⏳", duration: 1200 });
      }
      return;
    }

    const stationId = selectedStationRef.current;
    if (!stationId) {
      toast.error("Select a station first");
      return;
    }

    // ── Cooldown with FEEDBACK — never silent ──
    const key = `${decodedText.slice(-24)}::${stationId}`;
    const now = Date.now();
    const last = cooldownRef.current.get(key) || 0;
    if (now - last < COOLDOWN_MS) {
      const lastNotice = cooldownNoticeRef.current.get(key) || 0;
      if (now - lastNotice > 2500) {
        cooldownNoticeRef.current.set(key, now);
        toast("Already scanned — show the next pass", { icon: "🔁", duration: 1800 });
        try { navigator.vibrate?.(80); } catch (_) {}
      }
      return;
    }
    cooldownRef.current.set(key, now);

    processingRef.current = true;

    // ── WATCHDOG: whatever goes wrong below, the scanner recovers in 20s ──
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => {
      if (processingRef.current) {
        processingRef.current = false;
        setLastResult(null);
        resumeScanning();
        toast.error("Scanner recovered — please scan again");
      }
    }, 20000);

    // PAUSE decoding only — keep the camera stream alive for instant resume
    try { scannerRef.current?.pause(true); } catch (_) {}

    const station = stationsRef.current.find((s) => s._id === stationId);
    const count = station?.allowGroupCount ? groupCountRef.current : 1;
    const clientScanId = generateClientScanId();
    let resultShown: any = null;

    try {
      const token = localStorage.getItem("scannerToken");
      if (!token || isTokenExpired(token)) {
        toast.error("Session expired. Please log in again.");
        localStorage.removeItem("scannerToken");
        router.push("/");
        return;
      }

      toast("Verifying...", { icon: "⏳", duration: 1200 });

      // ── 10s timeout: a sleeping/slow server must NEVER freeze the scanner ──
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      let res: Response;
      try {
        res = await fetch(`${API_URL}/scan`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            qrData: decodedText,
            epId: stationId,
            stationLabel: station?.stationLabel || "",
            venue: selectedVenueRef.current || undefined,
            groupCount: count,
            clientScanId,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      let result: any = null;
      try { result = await res.json(); } catch (_) { result = null; }

      if (result && typeof result.success === "boolean") {
        // Proper server verdict — granted or denied with reason
        resultShown = result;
        if (result.success) {
          setScanCount((p) => p + (result.groupCount || count));
        }
        setShowGroupInput(false);
      } else {
        // Server reachable but returned garbage (502 HTML etc).
        // Do NOT save as granted offline — show explicit server error.
        resultShown = { success: false, result: "invalid", message: `Server error (${res.status}). Please scan again.` };
      }
    } catch (err: any) {
      // True network failure or 10s timeout → queue offline for sync
      console.error("Scan network error:", err?.name || err);
      try {
        await saveScan({
          clientScanId,
          qrData: decodedText,
          epId: stationId,
          station: station?.stationLabel || stationId,
          venue: selectedVenueRef.current || undefined,
          timestamp: new Date(),
          result: "granted",
          synced: false,
        });
      } catch (_) {}
      resultShown = { success: true, result: "offline_saved", message: "No connection — saved offline, will sync", holderName: "" };
    } finally {
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }

      if (resultShown) {
        // ── GUARANTEED notification: card + vibration + sound, every time ──
        setLastResult(resultShown);
        lastResultRef.current = resultShown;
        const pres = getResultPresentation(resultShown);
        try { navigator.vibrate?.(pres.vibrate); } catch (_) {}
        playBeep(pres.sound as any);

        // Keep the result visible long enough to read & act on it.
        // Granted/duplicate: 6s. Denied/error: 10s (needs more attention).
        // The volunteer can also tap the card to dismiss immediately.
        const resumeDelay =
          resultShown.success ? 6000 :
          resultShown.result === "duplicate" ? 6000 : 10000;
        if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
        resultTimerRef.current = setTimeout(() => {
          setLastResult(null);
          processingRef.current = false;
          resumeScanning();
        }, resumeDelay);
      }
      // If no resultShown we navigated to login — nothing to resume.
    }
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

  const handleEventChange = (eventId: string) => {
    processingRef.current = false;
    setLastResult(null);
    setSelectedEvent(eventId);
    resumeScanning(); // camera never stops — switching is instant
  };

  const handleStationChange = (stationId: string) => {
    processingRef.current = false;
    setLastResult(null);
    setGroupCount(1);
    setSelectedStation(stationId);
    resumeScanning();
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
    resumeScanning();
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

        {/* Event selector — show whenever the volunteer has more than one event
            (or stations spanning multiple events) so they can always toggle. */}
        {toggleableEvents.length > 1 && (
          <div className="px-3 pb-2">
            <label className="block text-[10px] text-white/70 mb-1">Venue / Event</label>
            <select
              value={selectedEvent}
              onChange={(e) => handleEventChange(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-white/20 text-white text-xs border border-white/30"
            >
              {toggleableEvents.map((ev) => (
                <option key={ev._id} value={ev._id} className="text-gray-900">
                  🕉️ {sortableEventName(ev)}{eventsForStation(ev._id).length > 0 ? "" : " (no stations)"}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Venue selector — per-event. Shown whenever the current event has
            more than one venue (or any venue) so every scan is tagged with
            where it physically happened. */}
        {eventVenues.length > 0 && (
          <div className="px-3 pb-2">
            <label className="block text-[10px] text-white/70 mb-1">Venue</label>
            <select
              value={selectedVenue}
              onChange={(e) => setSelectedVenue(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-white/20 text-white text-xs border border-white/30"
            >
              {eventVenues.map((v) => (
                <option key={v} value={v} className="text-gray-900">📍 {v}</option>
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
          <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center">
            <div className="relative w-[78vw] h-[78vw] max-w-[340px] max-h-[340px]">
              <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-white/90 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-white/90 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-white/90 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-white/90 rounded-br-lg" />
            </div>
            <div className="mt-5 px-3 py-1 rounded-full bg-black/55 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-white/90">Point at the QR — fill the box</span>
            </div>
          </div>
        )}

        {lastResult && (() => {
          const pres = getResultPresentation(lastResult);
          const holderName = lastResult.holderName || lastResult.holder_name || "";
          return (
            <div
              className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 cursor-pointer"
              onClick={dismissResult}
            >
              <div className={`w-full max-w-[280px] rounded-2xl p-6 text-center shadow-xl ${pres.bg}`}>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${pres.ring}`}>
                  <span className="text-3xl">{pres.emoji}</span>
                </div>
                <h2 className={`text-xl font-bold mb-1 ${pres.text}`}>{pres.title}</h2>
                {holderName && (
                  <p className={`text-lg font-semibold truncate ${pres.sub}`}>{holderName}</p>
                )}
                {(lastResult.subCategory || lastResult.sevaSlot || lastResult.categoryName) && (
                  <div className="mt-3 flex flex-col items-center gap-2">
                    {/* BAHUMANA TIER — the big chip the desk reads to give the right gift */}
                    {lastResult.subCategory && (
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] uppercase tracking-widest font-semibold opacity-60 mb-0.5">Bahumana</span>
                        <span className={`text-4xl font-black px-6 py-2 rounded-2xl border-2 shadow ${
                          lastResult.subCategory === "A" ? "bg-amber-100 text-amber-800 border-amber-400" :
                          lastResult.subCategory === "B" ? "bg-slate-100 text-slate-700 border-slate-400" :
                          lastResult.subCategory === "C" ? "bg-orange-100 text-orange-800 border-orange-400" :
                          "bg-purple-100 text-purple-800 border-purple-400"}`}>
                          {lastResult.subCategory}
                        </span>
                      </div>
                    )}
                    {/* SEVA SLOT — the timing/seating, shown separately below the tier */}
                    {lastResult.sevaSlot ? (
                      <div className="text-center mt-1 px-3 py-1.5 rounded-xl bg-black/5">
                        <p className={`text-sm font-bold ${pres.sub}`}>{lastResult.sevaSlot.name}</p>
                        {lastResult.sevaSlot.time && (
                          <p className={`text-xs mt-0.5 ${pres.sub} opacity-80`}>🕐 {lastResult.sevaSlot.time}</p>
                        )}
                      </div>
                    ) : lastResult.categoryName ? (
                      <span className={`text-sm font-medium ${pres.sub}`}>{lastResult.categoryName}</span>
                    ) : null}
                  </div>
                )}
                {lastResult.message && lastResult.message !== "Access granted" && (
                  <p className={`text-sm mt-1 ${pres.sub}`}>{lastResult.message}</p>
                )}
                {lastResult.success && lastResult.groupCount > 1 && (
                  <p className={`text-sm mt-2 font-medium ${pres.sub}`}>
                    👨‍👩‍👧‍👦 {lastResult.groupCount} people
                  </p>
                )}
                <p className="text-xs mt-4 opacity-50">Tap anywhere to scan next</p>
              </div>
            </div>
          );
        })()}
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
        {/* Debug: test scan without camera */}
        <button
          onClick={async () => {
            const token = localStorage.getItem("scannerToken");
            const stationId = selectedStationRef.current || visibleStations[0]?._id;
            if (!token) { toast.error("No token"); return; }
            if (!stationId) { toast.error("No station"); return; }
            toast("Testing scan API...", { icon: "🧪" });
            try {
              const r = await fetch(`${API_URL}/scan`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ qrData: "test-invalid-qr", epId: stationId, stationLabel: "test", groupCount: 1, clientScanId: `test-${Date.now()}` }),
              });
              const data = await r.json();
              toast(`API responded: ${r.status} — ${data.message || data.error || JSON.stringify(data).slice(0, 80)}`, { duration: 5000 });
              setLastResult(data);
            } catch (e: any) {
              toast.error(`Fetch failed: ${e.message}`, { duration: 5000 });
            }
          }}
          className="w-full mt-2 py-2 text-xs text-gray-400 border border-dashed border-gray-300 rounded-lg"
        >
          🧪 Test Scan (bypass camera)
        </button>
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
