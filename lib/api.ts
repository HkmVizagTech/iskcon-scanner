const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export interface ScanRequest {
  qrData: string;
  epId: string;
  stationLabel: string;
  deviceInfo?: any;
}

export interface ScanResponse {
  success: boolean;
  result: string;
  holderName?: string;
  message?: string;
}

export const api = {
  async scan(data: ScanRequest): Promise<ScanResponse> {
    const token = localStorage.getItem("scannerToken");

    const response = await fetch(`${API_URL}/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    return response.json();
  },

  async syncOfflineScans(scans: any[]): Promise<any> {
    const token = localStorage.getItem("scannerToken");

    const response = await fetch(`${API_URL}/scan/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ scans }),
    });

    return response.json();
  },

  async getStationStats(epId: string): Promise<any> {
    const token = localStorage.getItem("scannerToken");

    const response = await fetch(`${API_URL}/scan/station/${epId}/stats`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.json();
  },

  getStationId(stationName: string): string {
    const stationMap: Record<string, string> = {
      "Main Gate": "venue_entry",
      "Darshan Queue": "darshan",
      "Prasadam Counter": "prasadam",
      "Bahumana Desk": "bahumana",
      "VIP Gate": "vip_seat",
    };
    return stationMap[stationName] || "custom";
  },
};
