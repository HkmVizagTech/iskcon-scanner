import toast from "react-hot-toast";
import { api } from "./api";
import { generateClientScanId, getUnsyncedScans, markScansAsSynced, migrateLegacyFallbackScans, updateScan } from "./db";

const SYNC_INTERVAL = 30000; // 30 seconds
export const SYNC_DONE_EVENT = "scanner:sync-done";

interface ServerSyncResult {
  clientScanId?: string;
  client_scan_id?: string;
  result?: string;
  success?: boolean;
  holderName?: string;
  message?: string;
}

const reasonLabel = (reason: string) => reason.replace(/_/g, " ");

class SyncService {
  private syncTimer: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private onlineHandler = () => { this.sync(); };

  start() {
    // FIX: guard against double-start (component remount / hot reload)
    if (this.syncTimer !== null) return;
    migrateLegacyFallbackScans().then(() => this.sync());
    this.syncTimer = setInterval(() => { this.sync(); }, SYNC_INTERVAL);
    window.addEventListener("online", this.onlineHandler);
  }

  stop() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    window.removeEventListener("online", this.onlineHandler);
  }

  // Token rejected by the server — stop retrying and send the volunteer back to login
  private handleUnauthorized() {
    this.stop();
    localStorage.removeItem("scannerToken");
    toast.error("Session expired. Please log in again to sync your offline scans.", { duration: 8000 });
    window.location.assign("/");
  }

  async sync() {
    if (!navigator.onLine || this.isSyncing) return;
    if (!localStorage.getItem("scannerToken")) { this.stop(); return; }

    this.isSyncing = true;

    try {
      await migrateLegacyFallbackScans();
      const unsyncedScans = await getUnsyncedScans();

      if (unsyncedScans.length === 0) {
        this.isSyncing = false;
        return;
      }

      // Legacy rows without a clientScanId get a stable one now, so a retry is
      // recognised by the server and the verdict can be matched back to the row
      for (const scan of unsyncedScans) {
        if (!scan.clientScanId) {
          scan.clientScanId = generateClientScanId();
          await updateScan(scan.id!, { clientScanId: scan.clientScanId });
        }
      }

      const scansToSync = unsyncedScans.map((scan) => ({
        qrData: scan.qrData,
        epId: scan.epId,
        stationLabel: scan.station,
        venue: scan.venue,
        groupCount: scan.groupCount || 1,
        client_scan_id: scan.clientScanId,
        timestamp: scan.timestamp,
      }));

      const { status, data: response } = await api.syncOfflineScans(scansToSync);

      if (status === 401) {
        this.handleUnauthorized();
        return;
      }

      if (response?.success) {
        // FIX: Use the actual clientScanId stored in each record to match
        // against the server's syncedIds list. Was using `scan-${scan.id}` which
        // never matched the UUID-style clientScanId, so scans were never marked synced.
        const syncedClientIds: string[] = response.syncedIds || [];
        const results: ServerSyncResult[] = Array.isArray(response.results) ? response.results : [];
        const rejected: { name: string; reason: string }[] = [];

        if (syncedClientIds.length > 0) {
          for (const scan of unsyncedScans) {
            if (!scan.clientScanId || !syncedClientIds.includes(scan.clientScanId)) continue;

            const r = results.find((x) => (x.clientScanId || x.client_scan_id) === scan.clientScanId);
            if (!r || (r.result === undefined && r.success === undefined)) {
              // Server accepted it (or already had it) but gave no verdict — don't claim granted
              await updateScan(scan.id!, { synced: true });
              continue;
            }

            const granted = r.success === true || r.result === "granted";
            const reason = !granted ? (r.result && r.result !== "granted" ? r.result : "denied") : undefined;
            await updateScan(scan.id!, {
              synced: true,
              result: granted ? "granted" : "denied",
              serverResult: r.result || (granted ? "granted" : "denied"),
              holderName: r.holderName || scan.holderName,
              message: r.message,
            });
            if (!granted) rejected.push({ name: r.holderName || "Unknown holder", reason: reason! });
          }
        } else if (response.synced > 0) {
          // Fallback: server didn't return syncedIds (older backend) — use count
          const syncedIds = unsyncedScans
            .slice(0, response.synced)
            .map((scan) => scan.id!);
          await markScansAsSynced(syncedIds);
        }

        if (rejected.length > 0) {
          const shown = rejected.slice(0, 3).map((x) => `${x.name} (${reasonLabel(x.reason)})`).join(", ");
          const more = rejected.length > 3 ? ` +${rejected.length - 3} more` : "";
          toast.error(
            `${rejected.length} offline scan${rejected.length > 1 ? "s were" : " was"} REJECTED on sync: ${shown}${more}. These people may already have entered — see History.`,
            { duration: 15000 }
          );
        }

        window.dispatchEvent(new CustomEvent(SYNC_DONE_EVENT));
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
