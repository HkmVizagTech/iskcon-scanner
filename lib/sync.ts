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
        // FIX: use the stable UUID stored in the record — not derived from auto-increment id
        // which resets after DB clear and causes false duplicate detection on the server
        client_scan_id: scan.clientScanId || `scan-${scan.id}-${Date.now()}`,
        timestamp: scan.timestamp,
      }));

      const response = await api.syncOfflineScans(scansToSync);

      if (response.success) {
        // FIX: Use the server's syncedIds list to mark exactly the right records,
        // not "the first N by index" which broke when records partially failed.
        const syncedClientIds: string[] = response.syncedIds || [];

        if (syncedClientIds.length > 0) {
          // Map client IDs back to IndexedDB numeric IDs
          const syncedDbIds = unsyncedScans
            .filter((scan) => syncedClientIds.includes(`scan-${scan.id}`))
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
