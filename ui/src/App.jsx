import HandTracker from "./HandTracker";
import InteractiveScene from "./InteractiveScene";
import { useAppStore } from "./store";

export default function App() {
	const {
		controlMode,
		setControlMode,
		modelColor,
		setModelColor,
		useOriginalColors,
		setUseOriginalColors,
		isTracking,
		explodeFactor,
		xRayMode,
	} = useAppStore();

	return (
		<div className="app-container">
			<HandTracker />

			<div className="scene-wrapper">
				<InteractiveScene />
			</div>

			<div className="palette">
				<div className="palette__header">
					<h1>VISION FORGE</h1>
				</div>

				<div className="status-bar">
					<div
						className={`status-indicator ${isTracking ? "status-indicator--active" : "status-indicator--inactive"}`}
					/>
					<span>
						{controlMode === "mouse"
							? "INPUT PAUSED"
							: isTracking
								? "NEURAL LINK ACTIVE"
								: "CALIBRATING SENSORS..."}
					</span>
				</div>

				<div className="mode-switch">
					<button
						onClick={() => setControlMode("mouse")}
						className={`mode-btn ${controlMode === "mouse" ? "mode-btn--mouse-active" : ""}`}
					>
						Mouse
					</button>
					<button
						onClick={() => setControlMode("hand")}
						className={`mode-btn ${controlMode === "hand" ? "mode-btn--hand-active" : ""}`}
					>
						Hands
					</button>
				</div>

				{controlMode === "hand" && (
					<div className="gesture-section">
						<div className="section-label">GESTURE PROTOCOLS</div>
						{[
							{
								icon: "✊",
								title: "God Mode",
								desc: "Two Fists • Move & Rotate",
								active: false,
							},
							{
								icon: "👐",
								title: "Explode View",
								desc: "Two Palms • Pull Apart",
								active: explodeFactor > 0,
							},
							{
								icon: "✋",
								title: "X-Ray Scan",
								desc: "One Palm • Hold Steady",
								active: xRayMode,
							},
						].map((item, idx) => (
							<div key={idx} className="gesture-item">
								<div
									className={`gesture-icon ${item.active ? "gesture-icon--active" : ""}`}
								>
									{item.icon}
								</div>
								<div>
									<div
										className={`gesture-info__title ${item.active ? "gesture-info__title--active" : ""}`}
									>
										{item.title}
									</div>
									<div className="gesture-info__desc">{item.desc}</div>
								</div>
							</div>
						))}
					</div>
				)}

				<div className="appearance-section">
					<div className="section-label">APPEARANCE</div>
					<div className="appearance-controls">
						<button
							onClick={() => setUseOriginalColors(true)}
							className={`btn-original ${useOriginalColors ? "btn-original--active" : ""}`}
						>
							ORIGINAL
						</button>

						{["#99aab5", "#fab1a0", "#74b9ff", "#55efc4", "#a29bfe"].map(
							(c) => {
								const isSelected = !useOriginalColors && modelColor === c;
								return (
									<button
										key={c}
										onClick={() => setModelColor(c)}
										className={`color-swatch ${isSelected ? "color-swatch--selected" : ""}`}
										style={{
											backgroundColor: c,
											boxShadow: isSelected ? `0 0 15px ${c}` : "none",
										}}
									/>
								);
							},
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
