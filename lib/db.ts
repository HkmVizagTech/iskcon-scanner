import Dexie, { Table } from "dexie";

export interface ScanRecord {
  id?: number;
  // FIX: clientScanId stored at creation time (UUID) so it is stable and unique
  // across DB clears — previously derived from id at sync time which reset after clear
  clientScanId: string;
  qrData: string;
  station: string;
  timestamp: Date;
  result: "granted" | "denied";
  holderName?: string;
  synced: boolean;
  epId: string;
  // Venue (name) where this scan physically happened. Optional; legacy offline
  // records won't have it. Sent to the backend so per-venue rules and reports work.
  venue?: string;
  response?: any;
}

export class ScannerDatabase extends Dexie {
  scans!: Table<ScanRecord>;

  constructor() {
    super("ISKCONScannerDB");
    this.version(1).stores({
      scans: "++id, timestamp, synced, station, result",
    });
    // FIX: version 2 adds clientScanId index for dedup
    this.version(2).stores({
      scans: "++id, clientScanId, timestamp, synced, station, result",
    });
    // version 3 adds optional venue index (backward compatible with v2 records)
    this.version(3).stores({
      scans: "++id, clientScanId, timestamp, synced, station, result, venue",
    });
  }
}

// Generate a UUID-like unique scan ID
export function generateClientScanId(): string {
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const db = new ScannerDatabase();

// Save scan to IndexedDB
export async function saveScan(scan: Omit<ScanRecord, "id">) {
  try {
    const id = await db.scans.add(scan);
    return id;
  } catch (error) {
    console.error("Failed to save scan:", error);
    // Fallback to localStorage
    const scans = JSON.parse(localStorage.getItem("scanHistory") || "[]");
    scans.push({
      ...scan,
      id: Date.now().toString(),
    });
    localStorage.setItem("scanHistory", JSON.stringify(scans));
    return Date.now();
  }
}

export async function getUnsyncedScans() {
  try {
    return await db.scans.filter((scan) => !scan.synced).toArray();
  } catch (error) {
    console.error("Failed to get unsynced scans:", error);
    return [];
  }
}

// Mark scans as synced
export async function markScansAsSynced(ids: number[]) {
  try {
    await db.scans.where("id").anyOf(ids).modify({ synced: true });
  } catch (error) {
    console.error("Failed to mark scans as synced:", error);
  }
}

export async function getScanStats() {
  try {
    const allScans = await db.scans.toArray();
    const total = allScans.length;
    const granted = allScans.filter((scan) => scan.result === "granted").length;
    const denied = allScans.filter((scan) => scan.result === "denied").length;
    const unsynced = allScans.filter((scan) => !scan.synced).length;

    return { total, granted, denied, unsynced };
  } catch (error) {
    console.error("Failed to get scan stats:", error);
    return { total: 0, granted: 0, denied: 0, unsynced: 0 };
  }
}

// Clear all scans
export async function clearAllScans() {
  try {
    await db.scans.clear();
    localStorage.removeItem("scanHistory");
  } catch (error) {
    console.error("Failed to clear scans:", error);
  }
}
