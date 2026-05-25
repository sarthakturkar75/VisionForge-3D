import { Canvas, useThree } from "@react-three/fiber";
import {
    OrbitControls,
    Environment,
    Grid,
    GizmoHelper,
    GizmoViewport,
    ContactShadows,
} from "@react-three/drei";
import ModelViewer from "./ModelViewer";
import { Suspense, useCallback } from "react";
import { useAppStore } from "./store";
import * as THREE from "three";

function CameraController({ isMouse }) {
    const { camera, scene } = useThree();

    // Implementation of Fusion 360's "Fit to Screen" (Double-Click MMB)
    const handleDoubleClick = useCallback(
        (event) => {
            // 1 = Middle Mouse Button
            if (event.button !== 1) return;

            const box = new THREE.Box3().setFromObject(scene);
            if (box.isEmpty()) return;

            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            // Calculate distance required to fit the box in view
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = camera.fov * (Math.PI / 180);
            let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));

            // Add padding
            cameraZ *= 1.5;

            camera.position.set(
                center.x,
                center.y + maxDim * 0.2,
                center.z + cameraZ,
            );
            camera.lookAt(center);
        },
        [camera, scene],
    );

    return (
        <OrbitControls
            makeDefault
            enabled={isMouse}
            enableDamping
            dampingFactor={0.05}
            /* Professional Fusion 360 Bindings + Trackpad Compatibility 
                     By removing domElement={document.body}, we prevent the browser 
                     from intercepting pinch gestures as global page zooms.
                  */
            mouseButtons={{
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: THREE.MOUSE.ROTATE,
            }}
            /* Enable native trackpad/touch multi-finger gestures */
            touches={{
                ONE: THREE.TOUCH.ROTATE,
                TWO: THREE.TOUCH.DOLLY_PAN,
            }}
            /* Event now properly scoped to the Canvas element */
            onPointerMissed={(e) => e.button === 1 && handleDoubleClick(e)}
        />
    );
}

export default function InteractiveScene() {
    const controlMode = useAppStore((state) => state.controlMode);
    const isMouse = controlMode === "mouse";

    return (
        <Canvas
            shadows
            camera={{ position: [0, 5, 20], fov: 45, near: 0.1, far: 1000 }}
            dpr={[1, 2]}
        >
            {/* Professional Light Gray background for CAD clarity */}
            <color attach="background" args={["#f0f2f5"]} />
            <fog attach="fog" args={["#f0f2f5", 20, 100]} />

            <ambientLight intensity={0.6} />
            <directionalLight
                position={[10, 10, 5]}
                intensity={1.5}
                castShadow
                shadow-mapSize={[2048, 2048]}
            />
            <directionalLight
                position={[-10, -5, -5]}
                intensity={0.5}
                color="#b0b0ff"
            />
            <Environment preset="city" />

            {/* Reference Grid and Shadows */}
            <group position={[0, -4, 0]}>
                <Grid
                    args={[40, 40]}
                    cellSize={1}
                    cellThickness={0.6}
                    cellColor="#a0a0a0"
                    sectionSize={5}
                    sectionThickness={1.2}
                    sectionColor="#707070"
                    fadeDistance={30}
                />
                <ContactShadows
                    resolution={1024}
                    scale={50}
                    blur={2}
                    opacity={0.4}
                    far={10}
                    color="#000000"
                />
            </group>

            <Suspense fallback={null}>
                <ModelViewer url="/output_human1.obj" />
            </Suspense>

            {/* Professional Orientation Tripod */}
            <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
                <GizmoViewport
                    axisColors={["#ff3e3e", "#4caf50", "#2f74c0"]}
                    labelColor="black"
                />
            </GizmoHelper>

            <CameraController isMouse={isMouse} />
        </Canvas>
    );
}
