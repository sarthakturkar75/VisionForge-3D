// store.js
import { create } from "zustand";

export const useAppStore = create((set) => ({
    controlMode: "mouse",
    setControlMode: (mode) => set({ controlMode: mode }),

    // Appearance
    modelColor: "#99aab5",
    setModelColor: (color) =>
        set({ modelColor: color, useOriginalColors: false }), // Set color and disable "original"

    useOriginalColors: true, // Default to true to see original colors first
    setUseOriginalColors: (val) => set({ useOriginalColors: val }),

    isTracking: false,
    setIsTracking: (status) => set({ isTracking: status }),

    explodeFactor: 0,
    setExplodeFactor: (val) => set({ explodeFactor: val }),

    xRayMode: false,
    setXRayMode: (isActive) => set({ xRayMode: isActive }),
}));

export const handData = {
    hand1: { x: 0, y: 0, z: 0, gesture: "NONE", detected: false },
    hand2: { x: 0, y: 0, z: 0, gesture: "NONE", detected: false },
    centroid: { x: 0, y: 0 },
    distance: 0,
    angle: 0,
};
