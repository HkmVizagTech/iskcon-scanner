"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, Mail, Phone, Lock, LogIn } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export default function VolunteerLoginPage() {
  const router = useRouter();
  const [loginMethod, setLoginMethod] = useState<"email" | "phone">("email");
  const [credentials, setCredentials] = useState({
    email: "",
    phone: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const loginData: any = {
        password: credentials.password,
      };

      if (loginMethod === "email") {
        loginData.email = credentials.email;
      } else {
        loginData.phone = credentials.phone;
      }

      const response = await axios.post(
        `${API_URL}/volunteers/login`,
        loginData,
      );

      // Save token and volunteer data
      localStorage.setItem("scannerToken", response.data.token);
      localStorage.setItem("volunteerName", response.data.volunteer.name);
      localStorage.setItem(
        "assignedEntryPoints",
        JSON.stringify(response.data.volunteer.assignedEntryPoints),
      );

      toast.success(`Welcome, ${response.data.volunteer.name}!`);
      router.push("/scan");
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-xl">
            <QrCode className="w-14 h-14 text-orange-600" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">ISKCON Scanner</h1>
          <p className="text-white/90 text-lg">Volunteer Login</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          {/* Login Method Toggle */}
          <div className="flex rounded-xl bg-gray-100 p-1 mb-6">
            <button
              onClick={() => setLoginMethod("email")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                loginMethod === "email"
                  ? "bg-white text-gray-900 shadow"
                  : "text-gray-500"
              }`}
            >
              <Mail className="w-4 h-4 inline mr-1" />
              Email
            </button>
            <button
              onClick={() => setLoginMethod("phone")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                loginMethod === "phone"
                  ? "bg-white text-gray-900 shadow"
                  : "text-gray-500"
              }`}
            >
              <Phone className="w-4 h-4 inline mr-1" />
              Phone
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginMethod === "email" ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={credentials.email}
                  onChange={(e) =>
                    setCredentials({ ...credentials, email: e.target.value })
                  }
                  placeholder="volunteer@iskcon.org"
                  required
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 text-gray-900 bg-white"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  value={credentials.phone}
                  onChange={(e) =>
                    setCredentials({ ...credentials, phone: e.target.value })
                  }
                  placeholder="+91 98765 43210"
                  required
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 text-gray-900 bg-white"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={credentials.password}
                  onChange={(e) =>
                    setCredentials({ ...credentials, password: e.target.value })
                  }
                  placeholder="Enter password"
                  required
                  className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 text-gray-900 bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold hover:from-orange-600 hover:to-red-700 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center text-lg"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <LogIn className="w-5 h-5 mr-2" />
                  Login & Start Scanning
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-white/80 text-sm text-center mt-6">
          🕉️ Hare Krishna 🙏
        </p>
      </div>
    </div>
  );
}
