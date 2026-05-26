import { useRef, useMemo, useEffect } from "react";
import { useLoader, useFrame, useThree } from "@react-three/fiber";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import { useAppStore, handData } from "./store";
import * as THREE from "three";

// Deterministic Random for consistent explosion directions per mesh part
const pseudoRandom = (seed) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++)
        hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    const x = (Math.sin(hash) * 10000) % 1;
    const y = (Math.cos(hash) * 10000) % 1;
    const z = (Math.sin(hash * 2) * 10000) % 1;
    return new THREE.Vector3(x, y, z).normalize();
};

export default function ModelViewer({ url }) {
    const meshRef = useRef();
    const { camera } = useThree();

    // Global State from Zustand
    const {
        modelColor,
        useOriginalColors,
        controlMode,
    } = useAppStore();

    const isHandMode = controlMode === "hand";

    // Physics/Transform State Buffer (Mutable for performance)
    const state = useRef({
        scale: 1,
        rotation: new THREE.Quaternion(),
        position: new THREE.Vector3(0, 0, 0),

        // Reference points for gesture "Lock-on"
        refCentroid: { x: 0, y: 0 },
        refDist: 0,

        // Base Transforms captured at the moment gestures start
        baseScale: 1,
        baseRotation: new THREE.Quaternion(),
        basePosition: new THREE.Vector3(),

        mode: "IDLE",
        debounce: 0,
    });

    // --- MODE TRANSITION LOGIC ---
    // When switching to mouse mode, we reset targets to origin so OrbitControls works.
    useEffect(() => {
        if (controlMode === "mouse") {
            const s = state.current;

            s.scale = 1;

            s.position.set(0, 0, 0);

            s.rotation.identity();

            s.mode = "IDLE";
        }
    }, [controlMode]);

    const obj = useLoader(OBJLoader, url);

    // 1. MODEL INITIALIZATION (Centering, Scaling, Data Caching)
    useMemo(() => {
        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3());

        // Center geometry to local (0,0,0)
        obj.position.sub(center);

        // Auto-Scale model to a standard size of 10
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 10 / maxDim;
        obj.scale.setScalar(scale);

        obj.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;

                // Save original materials for "Original Color" mode
                if (!child.userData.originalMaterial) {
                    child.userData.originalMaterial = child.material.clone();
                }

                child.userData.originalPos = child.position.clone();
                child.userData.explodeDir = child.position.clone().normalize();
                if (child.userData.explodeDir.lengthSq() < 0.001) {
                    child.userData.explodeDir = pseudoRandom(child.uuid);
                }
            }
        });
    }, [obj]);

    // 2. MATERIAL UPDATES (Original vs Custom vs X-Ray)
    useEffect(() => {
        obj.traverse((child) => {
            if (child.isMesh) {
                if (useOriginalColors) {
                    child.material = child.userData.originalMaterial;
                } else {
                    child.material = new THREE.MeshStandardMaterial({
                        color: new THREE.Color(modelColor),
                        roughness: 0.3,
                        metalness: 0.6,
                    });
                }
            }
        });
    }, [obj, modelColor, useOriginalColors]);

    // 3. PHYSICS & ANIMATION LOOP
    useFrame((_, delta) => {
        if (!meshRef.current) return;
        const s = state.current;

        // --- A. GESTURE PROCESSING ---
        if (isHandMode) {
            // Focus on primary hand (h1) for 1-hand gestures
            const h = handData.hand1.detected ? handData.hand1 : handData.hand2;

            let nextMode = "IDLE";
            if (h.detected) {
                if (h.gesture === "PALM") nextMode = "ROTATE";
                else if (h.gesture === "FIST") nextMode = "PAN";
                else if (h.gesture === "PINCH") nextMode = "ZOOM";
            }

            // Debounce state transitions
            if (nextMode === s.mode) {
                s.debounce = Math.min(s.debounce + 1, 10);
            } else {
                s.debounce = Math.max(s.debounce - 1, 0);
                if (s.debounce === 0) {
                    s.mode = nextMode;
                    if (s.mode === "ROTATE" || s.mode === "PAN" || s.mode === "ZOOM") {
                        s.refCentroid = { ...handData.centroid };
                        s.baseScale = meshRef.current.scale.x;
                        s.baseRotation.copy(meshRef.current.quaternion);
                        s.basePosition.copy(meshRef.current.position);
                    }
                }
            }

            if (s.debounce > 5) {
                if (s.mode === "ROTATE") {
                    // Orbit (PALM)
                    const moveX = (handData.centroid.x - s.refCentroid.x) * 5;
                    const moveY = (handData.centroid.y - s.refCentroid.y) * 5;
                    const axis = new THREE.Vector3(-moveY, moveX, 0).normalize();
                    const angle = Math.sqrt(moveX * moveX + moveY * moveY);

                    if (angle > 0.001) {
                        const cameraQ = camera.quaternion.clone();
                        const worldAxis = axis.clone().applyQuaternion(cameraQ);
                        const deltaQ = new THREE.Quaternion().setFromAxisAngle(worldAxis, angle);
                        s.rotation.multiplyQuaternions(deltaQ, s.baseRotation);
                    }
                } else if (s.mode === "PAN") {
                    // Pan (FIST)
                    const dX = (handData.centroid.x - s.refCentroid.x) * 15;
                    const dY = (handData.centroid.y - s.refCentroid.y) * -15;
                    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
                    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
                    const panOffset = new THREE.Vector3().addScaledVector(camRight, dX).addScaledVector(camUp, dY);
                    s.position.copy(s.basePosition).add(panOffset);
                } else if (s.mode === "ZOOM") {
                    // Zoom (PINCH)
                    const dY = (handData.centroid.y - s.refCentroid.y) * 4; 
                    const ratio = Math.exp(dY);
                    s.scale = s.baseScale * ratio;
                }
            }
        }

        // --- B. TRANSFORMS & SMOOTHING ---
        const damp = isHandMode ? 0.15 : 0.05;
        meshRef.current.scale.setScalar(
            THREE.MathUtils.lerp(meshRef.current.scale.x, s.scale, damp),
        );
        meshRef.current.position.lerp(s.position, damp);
        meshRef.current.quaternion.slerp(s.rotation, damp);
    });

    return (
        <group ref={meshRef}>
            <primitive object={obj} />
        </group>
    );
}
