"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, Mail, Phone, Lock, LogIn, AlertCircle } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export default function VolunteerLoginPage() {
  const router = useRouter();
  const [loginMethod, setLoginMethod] = useState<"email" | "phone">("phone");
  const [credentials, setCredentials] = useState({ email: "", phone: "", password: "" });
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const loginData: any = { password: credentials.password };
      if (loginMethod === "email") loginData.email = credentials.email;
      else loginData.phone = credentials.phone;

      const response = await axios.post(`${API_URL}/volunteers/login`, loginData);
      const { token, volunteer } = response.data;

      const stations = volunteer.assignedEntryPoints || [];
      if (stations.length === 0) {
        toast.error("No scanning stations assigned. Please contact your administrator.", { duration: 6000 });
        setLoading(false);
        return;
      }

      // FIX: store assignedEvents so scan page can display festival name
      const events = volunteer.assignedEvents || [];

      localStorage.setItem("scannerToken", token);
      localStorage.setItem("volunteerName", volunteer.name);
      localStorage.setItem("assignedEntryPoints", JSON.stringify(stations));
      localStorage.setItem("assignedEvents", JSON.stringify(events)); // NEW

      toast.success(`Welcome, ${volunteer.name}! 🙏`);
      router.push("/scan");
    } catch (error: any) {
      const msg = error.response?.data?.error || "Login failed. Check your credentials.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-xl">
            <QrCode className="w-14 h-14 text-orange-600" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-1">ISKCON Scanner</h1>
          <p className="text-white/80 text-lg">Hare Krishna 🙏</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-5">Volunteer Login</h2>

          {/* Login method toggle */}
          <div className="flex rounded-xl bg-gray-100 p-1 mb-5">
            <button
              type="button"
              onClick={() => setLoginMethod("phone")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                loginMethod === "phone" ? "bg-white text-gray-900 shadow" : "text-gray-500"
              }`}
            >
              <Phone className="w-4 h-4 inline mr-1" />Phone
            </button>
            <button
              type="button"
              onClick={() => setLoginMethod("email")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                loginMethod === "email" ? "bg-white text-gray-900 shadow" : "text-gray-500"
              }`}
            >
              <Mail className="w-4 h-4 inline mr-1" />Email
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginMethod === "phone" ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="tel"
                    value={credentials.phone}
                    onChange={(e) => setCredentials({ ...credentials, phone: e.target.value })}
                    placeholder="9876543210"
                    required
                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={credentials.email}
                    onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
                    placeholder="volunteer@iskcon.org"
                    required
                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={credentials.password}
                  onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold hover:from-orange-600 hover:to-red-700 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center text-lg mt-2"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <><LogIn className="w-5 h-5 mr-2" />Start Scanning</>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
