import { api } from "./api";
import { getUnsyncedScans, markScansAsSynced } from "./db";

const SYNC_INTERVAL = 30000; // 30 seconds

class SyncService {
  private syncTimer: NodeJS.Timeout | null = null;
  private isSyncing = false;

  start() {
    // FIX: guard against double-start (component remount / hot reload)
    if (this.syncTimer !== null) return;
    this.sync();
    this.syncTimer = setInterval(() => { this.sync(); }, SYNC_INTERVAL);
    window.addEventListener("online", () => { this.sync(); });
  }

  stop() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  async sync() {
    if (!navigator.onLine || this.isSyncing) return;

    this.isSyncing = true;

    try {
      const unsyncedScans = await getUnsyncedScans();

      if (unsyncedScans.length === 0) {
        this.isSyncing = false;
        return;
      }

      console.log(`Syncing ${unsyncedScans.length} offline scans...`);

      const scansToSync = unsyncedScans.map((scan) => ({
        qrData: scan.qrData,
        epId: scan.epId,
        stationLabel: scan.station,
        venue: scan.venue,
        // FIX: use the stable UUID stored in the record — not derived from auto-increment id
        // which resets after DB clear and causes false duplicate detection on the server
        client_scan_id: scan.clientScanId || `scan-${scan.id}-${Date.now()}`,
        timestamp: scan.timestamp,
      }));

      const response = await api.syncOfflineScans(scansToSync);

      if (response.success) {
        // FIX: Use the actual clientScanId stored in each record to match
        // against the server's syncedIds list. Was using `scan-${scan.id}` which
        // never matched the UUID-style clientScanId, so scans were never marked synced.
        const syncedClientIds: string[] = response.syncedIds || [];

        if (syncedClientIds.length > 0) {
          const syncedDbIds = unsyncedScans
            .filter((scan) => syncedClientIds.includes(scan.clientScanId))
            .map((scan) => scan.id!);

          await markScansAsSynced(syncedDbIds);
        } else if (response.synced > 0) {
          // Fallback: server didn't return syncedIds (older backend) — use count
          const syncedIds = unsyncedScans
            .slice(0, response.synced)
            .map((scan) => scan.id!);
          await markScansAsSynced(syncedIds);
        }

        console.log(`Synced ${response.synced} scans, ${response.duplicates} duplicates`);
      }
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      this.isSyncing = false;
    }
  }

  async forceSync() {
    return this.sync();
  }
}

export const syncService = new SyncService();
