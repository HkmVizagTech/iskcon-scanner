"use client";

import { CheckCircle, XCircle, AlertCircle, User, Clock } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

interface ScanResultProps {
  result: {
    success: boolean;
    result: string;
    holderName?: string;
    message?: string;
  } | null;
  onClose?: () => void;
}

export default function ScanResult({ result, onClose }: ScanResultProps) {
  if (!result) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={`fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50 p-4`}
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 20 }}
          animate={{ y: 0 }}
          className={`max-w-sm w-full rounded-3xl shadow-2xl overflow-hidden ${
            result.success ? "bg-green-50" : "bg-red-50"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-8 text-center">
            {result.success ? (
              <>
                <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-12 h-12 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-green-900 mb-2">
                  Access Granted
                </h2>
                <div className="flex items-center justify-center text-green-700 mb-4">
                  <User className="w-5 h-5 mr-2" />
                  <span className="text-xl font-medium">
                    {result.holderName}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <XCircle className="w-12 h-12 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-red-900 mb-2">
                  Access Denied
                </h2>
                <p className="text-red-700 text-lg mb-4">{result.message}</p>

                <div className="bg-white/50 rounded-xl p-4">
                  <div className="flex items-center justify-center text-red-600">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    <span className="font-medium capitalize">
                      {result.result?.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              </>
            )}

            <div className="mt-6 flex items-center justify-center text-sm text-gray-500">
              <Clock className="w-4 h-4 mr-1" />
              {format(new Date(), "h:mm a")}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
