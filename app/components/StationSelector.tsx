"use client";

import { useState } from "react";
import { MapPin, ChevronRight } from "lucide-react";

interface Station {
  id: string;
  name: string;
  label: string;
  icon?: string;
}

interface StationSelectorProps {
  stations: Station[];
  selectedStation: string;
  onSelect: (stationId: string) => void;
  onContinue: () => void;
}

export default function StationSelector({
  stations,
  selectedStation,
  onSelect,
  onContinue,
}: StationSelectorProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 p-6">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <MapPin className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Select Station</h1>
          <p className="text-gray-600 mt-2">Choose your scanning location</p>
        </div>

        <div className="space-y-3">
          {stations.map((station) => (
            <button
              key={station.id}
              onClick={() => onSelect(station.id)}
              className={`w-full p-4 rounded-xl text-left transition-all ${
                selectedStation === station.id
                  ? "bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg"
                  : "bg-white text-gray-900 hover:bg-orange-50 border border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{station.icon || "📍"}</span>
                  <div>
                    <p className="font-medium">{station.name}</p>
                    <p
                      className={`text-sm ${
                        selectedStation === station.id
                          ? "text-white/80"
                          : "text-gray-500"
                      }`}
                    >
                      {station.label}
                    </p>
                  </div>
                </div>
                {selectedStation === station.id && (
                  <ChevronRight className="w-5 h-5" />
                )}
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={onContinue}
          disabled={!selectedStation}
          className="w-full mt-8 py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
