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
        explodeFactor,
        xRayMode,
        controlMode,
        setExplodeFactor,
        setXRayMode,
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
                if (xRayMode) {
                    child.material = new THREE.MeshBasicMaterial({
                        color: "#4cd137",
                        wireframe: true,
                        transparent: true,
                        opacity: 0.15,
                        depthTest: false,
                    });
                } else if (useOriginalColors) {
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
    }, [obj, modelColor, xRayMode, useOriginalColors]);

    // 3. PHYSICS & ANIMATION LOOP
    useFrame((_, delta) => {
        if (!meshRef.current) return;
        const s = state.current;

        // --- A. GESTURE PROCESSING ---
        if (isHandMode) {
            const h1 = handData.hand1;
            const h2 = handData.hand2;

            const fistCount = (h1.detected && h1.gesture === "FIST" ? 1 : 0) + (h2.detected && h2.gesture === "FIST" ? 1 : 0);
            const palmCount = (h1.detected && h1.gesture === "PALM" ? 1 : 0) + (h2.detected && h2.gesture === "PALM" ? 1 : 0);

            let nextMode = "IDLE";
            if (fistCount === 2) nextMode = "GOD_MODE_2";
            else if (fistCount === 1) nextMode = "GOD_MODE_1";
            else if (palmCount === 2) nextMode = "EXPLODE";
            else if (palmCount === 1) nextMode = "XRAY";

            // Debounce state transitions
            if (nextMode === s.mode) {
                s.debounce = Math.min(s.debounce + 1, 10);
            } else {
                s.debounce = Math.max(s.debounce - 1, 0);
                if (s.debounce === 0) {
                    s.mode = nextMode;
                    if (s.mode === "GOD_MODE_1" || s.mode === "GOD_MODE_2" || s.mode === "EXPLODE") {
                        s.refCentroid = { ...handData.centroid };
                        s.refDist = handData.distance;
                        s.refAngle = handData.angle;
                        s.baseScale = meshRef.current.scale.x;
                        s.baseRotation.copy(meshRef.current.quaternion);
                        s.basePosition.copy(meshRef.current.position);
                    }
                }
            }

            if (s.debounce > 5) {
                if (s.mode === "GOD_MODE_1") {
                    // Orbit (1 Fist)
                    const moveX = (handData.centroid.x - s.refCentroid.x) * 5;
                    const moveY = (handData.centroid.y - s.refCentroid.y) * 5;
                    const axis = new THREE.Vector3(-moveY, moveX, 0).normalize();
                    const angle = Math.sqrt(moveX * moveX + moveY * moveY);

                    if (angle > 0.001) {
                        const cameraQ = camera.quaternion.clone();
                        const worldAxis = axis.clone().applyQuaternion(cameraQ);
                        const deltaQ = new THREE.Quaternion().setFromAxisAngle(
                            worldAxis,
                            angle,
                        );
                        s.rotation.multiplyQuaternions(deltaQ, s.baseRotation);
                    }
                } else if (s.mode === "GOD_MODE_2") {
                    // Pan, Zoom, Roll (2 Fists)
                    // Zoom
                    if (s.refDist > 0) {
                        const ratio = handData.distance / Math.max(0.01, s.refDist);
                        s.scale = s.baseScale * ratio;
                    }

                    // Pan
                    const dX = (handData.centroid.x - s.refCentroid.x) * 15;
                    const dY = (handData.centroid.y - s.refCentroid.y) * -15;
                    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
                    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
                    const panOffset = new THREE.Vector3().addScaledVector(camRight, dX).addScaledVector(camUp, dY);
                    s.position.copy(s.basePosition).add(panOffset);

                    // Roll
                    const deltaAngle = handData.angle - s.refAngle;
                    if (Math.abs(deltaAngle) > 0.05) {
                        const cameraZ = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
                        const deltaQ = new THREE.Quaternion().setFromAxisAngle(cameraZ, deltaAngle);
                        s.rotation.multiplyQuaternions(deltaQ, s.baseRotation);
                    }
                } else if (s.mode === "EXPLODE") {
                    const distDelta = handData.distance - s.refDist;
                    const factor = Math.max(
                        0,
                        Math.min(1, distDelta * 2.5),
                    );
                    setExplodeFactor(factor);
                } else if (s.mode === "XRAY") {
                    setXRayMode(true);
                }
            } else {
                if (s.mode !== "EXPLODE") setExplodeFactor(0);
                if (s.mode !== "XRAY") setXRayMode(false);
            }
        }

        // --- B. TRANSFORMS & SMOOTHING ---
        const damp = isHandMode ? 0.15 : 0.05;
        meshRef.current.scale.setScalar(
            THREE.MathUtils.lerp(meshRef.current.scale.x, s.scale, damp),
        );
        meshRef.current.position.lerp(s.position, damp);
        meshRef.current.quaternion.slerp(s.rotation, damp);

        // --- C. EXPLOSION ANIMATION ---
        if (explodeFactor > 0.01 || meshRef.current.userData.isExpanded) {
            meshRef.current.userData.isExpanded = true;
            meshRef.current.traverse((child) => {
                if (child.isMesh && child.userData.originalPos) {
                    const target = child.userData.originalPos.clone();
                    const dir = child.userData.explodeDir;
                    target.addScaledVector(dir, explodeFactor * 8);
                    child.position.lerp(target, 0.25);
                }
            });
            if (explodeFactor <= 0.01) {
                meshRef.current.userData.isExpanded = false;
                meshRef.current.traverse((child) => {
                    if (child.isMesh && child.userData.originalPos) {
                        child.position.copy(child.userData.originalPos);
                    }
                });
            }
        }
    });

    return (
        <group ref={meshRef}>
            <primitive object={obj} />
        </group>
    );
}
