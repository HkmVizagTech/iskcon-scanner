"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff } from "lucide-react";

interface ScannerProps {
  onScan: (data: string) => void;
  onError?: (error: string) => void;
  enabled?: boolean;
}

export default function Scanner({
  onScan,
  onError,
  enabled = true,
}: ScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [hasCamera, setHasCamera] = useState(true);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const initScanner = async () => {
      try {
        const devices = await Html5Qrcode.getCameras();

        if (devices && devices.length > 0) {
          const scanner = new Html5Qrcode("qr-reader");
          scannerRef.current = scanner;

          // Use back camera if available
          const cameraId = devices.length > 1 ? devices[1].id : devices[0].id;

          await scanner.start(
            cameraId,
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1.0,
            },
            (decodedText) => {
              onScan(decodedText);
            },
            (errorMessage) => {
              // Silent fail for continuous scanning
            },
          );

          setIsScanning(true);
        } else {
          setHasCamera(false);
        }
      } catch (error) {
        console.error("Scanner initialization error:", error);
        setHasCamera(false);
        onError?.("Failed to access camera");
      }
    };

    initScanner();

    return () => {
      if (scannerRef.current && isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [enabled]);

  const handleRetry = async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop();
    }
    setHasCamera(true);
  };

  if (!hasCamera) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <CameraOff className="w-16 h-16 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Camera not available
        </h3>
        <p className="text-gray-500 mb-4">
          Please ensure camera permissions are granted
        </p>
        <button
          onClick={handleRetry}
          className="px-6 py-2 bg-orange-600 text-white rounded-lg"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black">
      <div id="qr-reader" className="w-full h-full" />
      {!isScanning && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Camera className="w-12 h-12 text-white animate-pulse" />
        </div>
      )}
    </div>
  );
}
