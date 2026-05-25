import { useThree, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { handData, useAppStore } from './store';

export default function GestureControls({ enabled }) {
    const { camera } = useThree();

    // We update Zustand store from inside the loop for UI effects
    const setExplodeFactor = useAppStore(s => s.setExplodeFactor);
    const setXRayMode = useAppStore(s => s.setXRayMode);

    const state = useRef({
        // Camera Physics
        radius: 25,
        phi: Math.PI / 2,
        theta: 0,
        roll: 0,
        target: new THREE.Vector3(0, 0, 0),

        // Reference Points (Lock-on)
        refCentroid: { x: 0, y: 0 },
        refAngle: 0,
        refDist: 0,

        // Camera Reference State
        refRadius: 25,
        refPhi: 0,
        refTheta: 0,
        refRoll: 0,

        // Logic
        mode: 'IDLE', // 'GOD_MODE' | 'EXPLODE' | 'XRAY'
        debounce: 0,

        // Smoothing
        smoothPhi: Math.PI / 2,
        smoothTheta: 0,
        smoothRadius: 25,
        smoothRoll: 0,
        smoothTarget: new THREE.Vector3(0, 0, 0)
    });

    useFrame((_, delta) => {
        if (!enabled) return;

        const s = state.current;
        const h1 = handData.hand1;
        const h2 = handData.hand2;

        // --- 1. GESTURE RECOGNITION ---
        const isTwoHands = h1.detected && h2.detected;
        const isFists = isTwoHands && h1.gesture === 'FIST' && h2.gesture === 'FIST';
        const isPalms = isTwoHands && h1.gesture === 'PALM' && h2.gesture === 'PALM';
        const isOnePalm = (h1.detected && h1.gesture === 'PALM' && !h2.detected) || (!h1.detected && h2.detected && h2.gesture === 'PALM');

        // State Transition Logic (Debounced)
        let nextMode = 'IDLE';
        if (isFists) nextMode = 'GOD_MODE';
        else if (isPalms) nextMode = 'EXPLODE';
        else if (isOnePalm) nextMode = 'XRAY';

        if (nextMode === s.mode) {
            s.debounce = Math.min(s.debounce + 1, 10);
        } else {
            s.debounce = Math.max(s.debounce - 1, 0);
            if (s.debounce === 0) {
                // Initialize New Mode
                s.mode = nextMode;
                s.debounce = 0;

                // If entering God Mode, Lock References
                if (s.mode === 'GOD_MODE') {
                    s.refCentroid = { ...handData.centroid };
                    s.refAngle = handData.angle;
                    s.refDist = handData.distance;
                    s.refPhi = s.phi;
                    s.refTheta = s.theta;
                    s.refRoll = s.roll;
                    s.refRadius = s.radius;
                }
            }
        }

        const active = s.debounce > 5; // Require 5 frames of consistency

        // --- 2. EXECUTE MODE PHYSICS ---

        if (active) {
            if (s.mode === 'GOD_MODE') {
                // --- GOD MODE (6DoF) ---

                // A. Orbit (X/Y)
                const deltaX = handData.centroid.x - s.refCentroid.x;
                const deltaY = handData.centroid.y - s.refCentroid.y;
                s.theta = s.refTheta - (deltaX * 5);
                s.phi = s.refPhi - (deltaY * 5);
                s.phi = Math.max(0.1, Math.min(Math.PI - 0.1, s.phi));

                // B. Zoom
                if (s.refDist > 0) {
                    const ratio = s.refDist / Math.max(0.01, handData.distance);
                    s.radius = s.refRadius * ratio;
                    // Unlocked limits for Macro Zoom
                    s.radius = Math.max(0.5, Math.min(200, s.radius));
                }

                // C. Roll (Steering Wheel)
                const deltaAngle = handData.angle - s.refAngle;
                s.roll = s.refRoll + deltaAngle;

            }
            else if (s.mode === 'EXPLODE') {
                // --- EXPLODE MODE ---
                // Map distance (0.1 to 0.6) to Explode Factor (0 to 1)
                const dist = handData.distance;
                const factor = Math.max(0, Math.min(1, (dist - 0.1) * 2.5));
                setExplodeFactor(factor);
            }
            else if (s.mode === 'XRAY') {
                // --- X-RAY MODE ---
                setXRayMode(true);
            }
        } else {
            // Reset temp modes when hands drop
            if (s.mode !== 'EXPLODE') setExplodeFactor(0); // Auto-close explode
            if (s.mode !== 'XRAY') setXRayMode(false);
        }

        // --- 3. CAMERA UPDATE (Smoothed) ---
        const damp = 0.15;
        s.smoothTheta += (s.theta - s.smoothTheta) * damp;
        s.smoothPhi += (s.smoothPhi - s.smoothPhi) * damp;
        s.smoothRadius += (s.radius - s.smoothRadius) * damp;

        // Z-Roll needs special handling to avoid "spinning" when switching modes
        if (s.mode === 'GOD_MODE') {
            // eslint-disable-next-line react-hooks/immutability
            camera.rotation.z += (s.roll - camera.rotation.z) * damp;
        } else {
            // Slowly return to level horizon if not controlling
            // eslint-disable-next-line react-hooks/immutability
            camera.rotation.z += (0 - camera.rotation.z) * 0.05;
        }

        // Spherical to Cartesian
        const x = s.smoothRadius * Math.sin(s.smoothPhi) * Math.sin(s.smoothTheta);
        const y = s.smoothRadius * Math.cos(s.smoothPhi);
        const z = s.smoothRadius * Math.sin(s.smoothPhi) * Math.cos(s.smoothTheta);

        // eslint-disable-next-line react-hooks/immutability
        camera.position.set(x, y, z);
        // eslint-disable-next-line react-hooks/immutability
        camera.lookAt(s.smoothTarget);
    });

    return null;
}