# 🛡️ SecureVision AI — Security, Compliance & Regulation Pipeline

A real-time, multi-modal security monitoring platform that streams live video, runs multiple state-of-the-art machine-learning models for hazard detection and identity verification, and presents everything on a live web dashboard — with an intelligent alert system built in.

📋 Table of Contents
-----------------
- [Overview](#-overview)
- [System Architecture](#-system-architecture)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Hardware](#-hardware)
- [Machine Learning Models](#-machine-learning-models)
- [Project Structure](#-project-structure)
- [Getting Started (Local)](#-getting-started-local)
- [API Reference](#-api-reference)
- [Deployment](#-deployment)
- [License](#-license)

🎯 Overview
-----------
Security and compliance monitoring is critical for modern infrastructure. SecureVision AI is an end-to-end system that captures live video feeds, analyzes them with a suite of AI models, and surfaces actionable insights in real time:

- **Multi-modal sensing** — Motion tracking, object detection, and face recognition.
- **On-server AI inference** — Specialized models for hazard classification (fire/smoke) and identity verification.
- **Live web dashboard** — Real-time MJPEG streams, bounding boxes, and event logs.
- **Low-light enhancement** — Automatically brightens dark frames for 24/7 reliability.
- **Dynamic routing** — Configurable zones and scheduling (AI Mode vs. CCTV Mode) to save compute power.

🏗 System Architecture
----------------------
```text
┌────────────┐                                   ┌───────────────────────────────────────────────┐
│   Camera   │ ────(Video Feed)────────────────▶ │         Flask API Server (:5000)              │
│ (Webcam/IP)│                                   │                                               │
└────────────┘                                   │  /api/video_feed → MJPEG Stream               │
                                                 │  /api/events     → JSON Event Log             │
┌────────────┐           HTTP (Polling)          │                                               │
│            │ ◀───────────────────────────────▶ │     ┌───────────────────────────────────┐     │
│  Browser   │                                   │     │       Background Pipeline         │     │
│(Dashboard) │ ────────────────────────────────▶ │     │                                   │     │
│            │           REST API Calls          │     │  ▶ CaptureSession (Motion)        │     │
└────────────┘                                   │     │  ▶ PersonDetector (YOLOv8n)       │     │
                                                 │     │  ▶ HazardPipeline (YOLO-Fire)     │     │
                                                 │     │  ▶ IdentityPipeline (InsightFace) │     │
                                                 │     │  ▶ LowLightEnhancer (Zero-DCE)    │     │
                                                 │     └───────────────────────────────────┘     │
                                                 └───────────────────────────────────────────────┘
```
The Flask API acts as the hub: it manages the background threading for the AI pipeline, serves the live video stream, and provides REST endpoints for the frontend dashboard to poll events and statuses.

⭐ Features
-----------
| Feature | Description |
|---------|-------------|
| **Real-time streaming** | Live MJPEG video feed with overlaid bounding boxes and status text |
| **Identity verification** | Uses InsightFace to recognize enrolled personnel (SAFE_ENTRY vs UNAUTHORIZED) |
| **Hazard detection** | A dedicated YOLOv8 model continuously scans for fire and smoke |
| **Low-light enhancement** | Zero-DCE model enhances visibility in dark environments before AI analysis |
| **Motion routing** | Configurable detection zones filter out background noise to save CPU/GPU cycles |
| **Interactive dashboard** | Modern UI to view live feeds, recent events, and system statuses |
| **Dynamic scheduling** | Easily switch between full AI Mode and basic CCTV (motion-only) Mode |
| **Face enrollment UI** | Capture and enroll new authorized faces directly through the web interface |

🛠 Tech Stack
-------------
- **Frontend:** Vanilla JavaScript, HTML5, CSS3, dynamic DOM updates
- **Backend — Python:** Flask (Web Server), threading, JSON logging
- **Computer Vision:** OpenCV (cv2)
- **Machine Learning:** 
  - Ultralytics (YOLOv8)
  - InsightFace (Face Recognition)
  - PyTorch (Zero-DCE Low-Light Enhancement)
  - ONNX Runtime

🔌 Hardware
-----------
| Component | Purpose |
|-----------|---------|
| **Camera** | Standard USB Webcam (source `0`) or RTSP IP Camera stream |
| **Compute** | CPU (Intel/AMD) or NVIDIA GPU (CUDA highly recommended for real-time FPS) |

🤖 Machine Learning Models
--------------------------
| Model | Task | Framework | Output |
|-------|------|-----------|--------|
| **YOLOv8n (Base)** | General human detection | Ultralytics / PyTorch | Bounding boxes & confidence for persons |
| **YOLOv8n (Fire)** | Hazard detection (Fire/Smoke) | Ultralytics / PyTorch | `UNAUTHORIZED_ALERT_HAZARD` events |
| **InsightFace** | Face detection & recognition | ONNX Runtime | Identity matching against `known_faces.json` |
| **Zero-DCE++** | Low-light image enhancement | PyTorch | Brightened image tensor (passed to other models) |

*Note: Model weights (like `yolov8n.pt`, `fire_yolov8n.pt`, and InsightFace `.onnx` files) are automatically downloaded or generated upon first run.*

📂 Project Structure
--------------------
```text
Security_compliance_and_regulation/
├── api.py                  # Main Flask API and dashboard server
├── main.py                 # Core CLI pipeline and callback definitions
├── core/                   # Modular AI logic
│   ├── capture.py          # Frame buffering and motion detection
│   ├── motion_router.py    # Zone filtering and heuristics
│   ├── identity_pipeline.py# InsightFace integration
│   ├── hazard_pipeline.py  # Fire/smoke detection
│   ├── person_detector.py  # Base YOLOv8 human detection
│   └── enhancement_pipeline.py # Zero-DCE low-light enhancement
├── frontend/               # Dashboard UI assets
│   ├── index.html          
│   ├── app.js              
│   └── styles.css          
├── config/                 
│   └── camera_config.py    # Configuration and thresholds
├── models/                 # Directory for stored PyTorch/YOLO weights
├── my_camera.json          # User-defined camera zones and schedules
├── known_faces.json        # Database of authorized personnel embeddings
└── requirements.txt        # Python dependencies
```

🚀 Getting Started (Local)
--------------------------
### Prerequisites
- Python 3.9+ 
- A working webcam or IP camera

### 1. Clone the Repository
```bash
git clone https://github.com/hanan1hub/Security_compliance_and_regulation.git
cd Security_compliance_and_regulation
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```
*(Note: If you have an NVIDIA GPU, ensure you install the CUDA-enabled versions of PyTorch and ONNX Runtime for optimal performance).*

### 3. Run the Server
```bash
python api.py
```
The system will initialize the AI pipelines (this may take a minute on the first run as it downloads model weights). Once you see `Starting Flask server on port 5000...`, you are ready!

### 4. Access the Dashboard
Open your web browser and navigate to:
**[http://127.0.0.1:5000](http://127.0.0.1:5000)**

📡 API Reference
----------------
### Flask Endpoints (Port 5000)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/` | Serves the main dashboard UI |
| `GET` | `/api/video_feed` | Streams the live MJPEG video with AI bounding boxes |
| `GET` | `/api/status` | Returns the current system status (Recording, Watching, etc.) |
| `GET` | `/api/events` | Polling endpoint for the latest AI detection events |
| `GET` | `/api/faces` | Returns a list of currently enrolled faces |
| `POST` | `/api/enroll` | Accepts an image to register a new authorized person |

☁️ Deployment
------------
The system is designed to be easily deployed on a dedicated local machine (like an Intel NUC or a PC acting as an NVR) or on an edge-compute device (like an NVIDIA Jetson). 
1. Simply clone the repository onto the edge device.
2. Configure `my_camera.json` with your RTSP camera streams.
3. Use a process manager like `pm2` or a `systemd` service to keep `api.py` running continuously.
4. Access the dashboard remotely over your local network via the device's IP address (e.g., `http://192.168.1.100:5000`).

📜 License
----------
Licensed under the MIT License.
