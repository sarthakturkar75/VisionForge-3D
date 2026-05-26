import { useEffect, useRef } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { useAppStore, handData } from "./store";

const SMOOTHING = 0.1; // 0.1 (Heavy) -> 0.5 (Fast)

// Helper: Linear Interpolation
const lerp = (start, end, amt) => (1 - amt) * start + amt * end;

// Helper: Detect Gesture Shape
const detectGesture = (landmarks) => {
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const tips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]]; // Index, Middle, Ring, Pinky

    // Check for PINCH first
    const pinchDist = Math.sqrt(
        Math.pow(indexTip.x - thumbTip.x, 2) +
        Math.pow(indexTip.y - thumbTip.y, 2) +
        Math.pow(indexTip.z - thumbTip.z, 2)
    );
    
    // Check if index is somewhat extended from wrist (to avoid confusing with fist)
    const indexDist = Math.sqrt(
        Math.pow(indexTip.x - wrist.x, 2) +
        Math.pow(indexTip.y - wrist.y, 2) +
        Math.pow(indexTip.z - wrist.z, 2)
    );

    if (pinchDist < 0.08 && indexDist > 0.15) return "PINCH";

    let extendedCount = 0;

    tips.forEach((tip) => {
        const dist = Math.sqrt(
            Math.pow(tip.x - wrist.x, 2) +
            Math.pow(tip.y - wrist.y, 2) +
            Math.pow(tip.z - wrist.z, 2)
        );
        // Threshold: 0.25 is relative to screen size/depth.
        if (dist > 0.25) extendedCount++;
    });

    if (extendedCount >= 3) return "PALM"; // Open Hand
    if (extendedCount === 0) return "FIST"; // Closed Fist
    return "UNKNOWN"; // Transition state
};

export default function HandTracker() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const { controlMode, setIsTracking } = useAppStore();

    // Internal refs for smoothing
    const rawRefs = useRef({
        h1: { x: 0, y: 0 },
        h2: { x: 0, y: 0 },
    });

    useEffect(() => {
        if (controlMode === "mouse") {
            setIsTracking(false);
            return;
        }

        let handLandmarker;
        let animationFrameId;
        let stream;

        const setup = async () => {
            const vision = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
            );
            handLandmarker = await HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath:
                        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                    delegate: "GPU",
                },
                runningMode: "VIDEO",
                numHands: 2,
            });
            startWebcam();
        };

        const startWebcam = () => {
            navigator.mediaDevices
                .getUserMedia({
                    video: { width: 640, height: 480, frameRate: { ideal: 60 } },
                })
                .then((s) => {
                    stream = s;
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        videoRef.current.addEventListener("loadeddata", loop);
                        setIsTracking(true);
                    }
                });
        };

        const loop = () => {
            if (!videoRef.current || videoRef.current.readyState < 2) return;

            const results = handLandmarker.detectForVideo(
                videoRef.current,
                performance.now()
            );

            drawHUD(results.landmarks);

            if (results.landmarks && results.landmarks.length > 0) {
                processHands(results.landmarks);
            } else {
                handData.hand1.detected = false;
                handData.hand2.detected = false;
            }
            animationFrameId = requestAnimationFrame(loop);
        };

        const processHands = (landmarks) => {
            const raw = rawRefs.current;

            // Sort hands by X position so Left is always Left
            landmarks.sort((a, b) => a[9].x - b[9].x);

            // --- Hand 1 ---
            const h1 = landmarks[0];
            const anchor1 = h1[9]; // Middle Knuckle

            // Smooth X/Y
            raw.h1.x = lerp(raw.h1.x, 1 - anchor1.x, SMOOTHING); // Mirror X
            raw.h1.y = lerp(raw.h1.y, 1 - anchor1.y, SMOOTHING); // Invert Y

            handData.hand1.x = raw.h1.x;
            handData.hand1.y = raw.h1.y;
            handData.hand1.gesture = detectGesture(h1);
            handData.hand1.detected = true;

            // --- Hand 2 ---
            if (landmarks.length > 1) {
                const h2 = landmarks[1];
                const anchor2 = h2[9];

                raw.h2.x = lerp(raw.h2.x, 1 - anchor2.x, SMOOTHING);
                raw.h2.y = lerp(raw.h2.y, 1 - anchor2.y, SMOOTHING);

                handData.hand2.x = raw.h2.x;
                handData.hand2.y = raw.h2.y;
                handData.hand2.gesture = detectGesture(h2);
                handData.hand2.detected = true;

                // --- Shared Metrics ---
                handData.distance = Math.sqrt(
                    Math.pow(handData.hand1.x - handData.hand2.x, 2) +
                    Math.pow(handData.hand1.y - handData.hand2.y, 2)
                );

                handData.centroid.x = (handData.hand1.x + handData.hand2.x) / 2;
                handData.centroid.y = (handData.hand1.y + handData.hand2.y) / 2;

                handData.angle = Math.atan2(
                    handData.hand2.y - handData.hand1.y,
                    handData.hand2.x - handData.hand1.x
                );
            } else {
                handData.hand2.detected = false;
                handData.centroid.x = handData.hand1.x;
                handData.centroid.y = handData.hand1.y;
                handData.distance = 0;
                handData.angle = 0;
            }
        };

        const drawHUD = (landmarks) => {
            const canvas = canvasRef.current;
            if (!canvas || !videoRef.current) return;
            const ctx = canvas.getContext("2d");
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.save();
            ctx.scale(-1, 1);
            ctx.translate(-canvas.width, 0);

            if (landmarks) {
                ctx.lineWidth = 3;
                for (const hand of landmarks) {
                    const gesture = detectGesture(hand);
                    ctx.strokeStyle =
                        gesture === "FIST"
                            ? "#ff4757"
                            : gesture === "PALM"
                                ? "#2ed573"
                                : "#ffa502";
                    ctx.fillStyle = ctx.strokeStyle;

                    // Draw key points
                    for (let i = 0; i < 21; i++) {
                        ctx.beginPath();
                        ctx.arc(
                            hand[i].x * canvas.width,
                            hand[i].y * canvas.height,
                            4,
                            0,
                            2 * Math.PI
                        );
                        ctx.fill();
                    }
                }
            }
            ctx.restore();
        };

        setup();
        return () => {
            cancelAnimationFrame(animationFrameId);
            if (stream) stream.getTracks().forEach((t) => t.stop());
            if (handLandmarker) handLandmarker.close();
            setIsTracking(false);
        };
    }, [controlMode, setIsTracking]);

    if (controlMode === "mouse") return null;

    return (
        <>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{ opacity: 0, position: "absolute", pointerEvents: "none" }}
            />
            <canvas
                ref={canvasRef}
                style={{
                    position: "absolute",
                    bottom: 20,
                    right: 20,
                    width: "240px",
                    height: "180px",
                    borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(0,0,0,0.6)",
                    zIndex: 50,
                }}
            />
        </>
    );
}
