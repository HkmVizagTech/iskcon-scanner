import { api } from "./api";
import { db, getUnsyncedScans, markScansAsSynced, ScanRecord } from "./db";

const SYNC_INTERVAL = 30000; // 30 seconds

class SyncService {
  private syncTimer: NodeJS.Timeout | null = null;
  private isSyncing = false;

  start() {
    // Initial sync
    this.sync();

    // Periodic sync
    this.syncTimer = setInterval(() => {
      this.sync();
    }, SYNC_INTERVAL);

    // Sync when online
    window.addEventListener("online", () => {
      this.sync();
    });
  }

  stop() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  async sync() {
    if (!navigator.onLine || this.isSyncing) {
      return;
    }

    this.isSyncing = true;

    try {
      const unsyncedScans = await getUnsyncedScans();

      if (unsyncedScans.length === 0) {
        this.isSyncing = false;
        return;
      }

      console.log(`Syncing ${unsyncedScans.length} offline scans...`);

      // Format scans for API
      const scansToSync = unsyncedScans.map((scan) => ({
        qrData: scan.qrData,
        epId: scan.epId,
        stationLabel: scan.station,
        client_scan_id: `scan-${scan.id}`,
        timestamp: scan.timestamp,
      }));

      // Send to server
      const response = await api.syncOfflineScans(scansToSync);

      if (response.success) {
        // Mark as synced
        const syncedIds = unsyncedScans
          .filter((_, index) => index < response.synced)
          .map((scan) => scan.id!);

        await markScansAsSynced(syncedIds);

        console.log(
          `Synced ${response.synced} scans, ${response.duplicates} duplicates`,
        );

        // Update localStorage
        this.updateLocalStorageSyncStatus(syncedIds);
      }
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      this.isSyncing = false;
    }
  }

  private updateLocalStorageSyncStatus(ids: number[]) {
    try {
      const scans = JSON.parse(localStorage.getItem("scanHistory") || "[]");
      const updatedScans = scans.map((scan: any) => {
        if (ids.includes(parseInt(scan.id))) {
          return { ...scan, synced: true };
        }
        return scan;
      });
      localStorage.setItem("scanHistory", JSON.stringify(updatedScans));
    } catch (error) {
      console.error("Failed to update localStorage:", error);
    }
  }

  async forceSync() {
    return this.sync();
  }
}

export const syncService = new SyncService();
