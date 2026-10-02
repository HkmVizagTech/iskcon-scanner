const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export const api = {
  async syncOfflineScans(scans: any[]): Promise<{ status: number; data: any }> {
    const token = localStorage.getItem("scannerToken");

    const response = await fetch(`${API_URL}/scan/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ scans }),
    });

    let data: any = null;
    try { data = await response.json(); } catch (_) {}
    return { status: response.status, data };
  },
};
