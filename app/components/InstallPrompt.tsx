"use client";

import { useEffect, useState } from "react";
import { Download, Share, X, PlusSquare } from "lucide-react";

// Remember dismissal for 7 days so it doesn't nag on every login,
// but still resurfaces occasionally for volunteers who haven't installed yet.
const DISMISS_KEY = "installPromptDismissedAt";
const DISMISS_DAYS = 7;

function isDismissedRecently() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const dismissedAt = parseInt(raw, 10);
    if (isNaN(dismissedAt)) return false;
    const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
    return daysSince < DISMISS_DAYS;
  } catch {
    return false;
  }
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's own flag for "already added to home screen"
    (window.navigator as any).standalone === true
  );
}

function isIOSSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIOS && isSafari;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    // Already installed, or user dismissed recently — stay quiet.
    if (isStandalone() || isDismissedRecently()) return;

    // Android/Chrome: capture the native install prompt instead of letting
    // the browser show its own mini-infobar, so we control when/how it's shown.
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // iOS Safari never fires beforeinstallprompt — show manual instructions
    // instead, since "Add to Home Screen" only exists in the Share sheet there.
    if (isIOSSafari()) {
      setShowBanner(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setShowBanner(false);
    setShowIOSInstructions(false);
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setShowBanner(false);
      // "dismissed" still counts as a real answer — don't nag again immediately
      if (outcome === "dismissed") {
        try {
          localStorage.setItem(DISMISS_KEY, String(Date.now()));
        } catch {}
      }
      return;
    }
    // iOS has no programmatic install — show the manual steps instead.
    setShowIOSInstructions(true);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40">
      <div className="max-w-md mx-auto rounded-xl shadow-lg p-4 bg-orange-50 border border-orange-200">
        {!showIOSInstructions ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center min-w-0">
              <Download className="w-5 h-5 text-orange-600 mr-3 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-orange-900 text-sm">Install Scanner App</p>
                <p className="text-xs text-gray-600 truncate">
                  Add to your home screen for faster access
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleInstallClick}
                className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-sm font-medium"
              >
                Install
              </button>
              <button
                onClick={dismiss}
                className="p-1.5 text-gray-400"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium text-orange-900 text-sm">Add to Home Screen</p>
              <button onClick={dismiss} className="p-1 text-gray-400" aria-label="Dismiss">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ol className="text-xs text-gray-700 space-y-1.5 list-decimal list-inside">
              <li className="flex items-center gap-1.5">
                Tap the Share icon <Share className="w-3.5 h-3.5 inline" /> in Safari's toolbar
              </li>
              <li className="flex items-center gap-1.5">
                Scroll down and tap <PlusSquare className="w-3.5 h-3.5 inline" /> "Add to Home Screen"
              </li>
              <li>Tap "Add" in the top right</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
