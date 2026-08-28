import os
import sys
import json
import time
import cv2
import numpy as np
import base64
import threading
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# Add current directory to sys.path to allow importing from core and config
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from core.identity_pipeline import IdentityPipeline
    from core.schedule import get_current_mode, is_within_auth_schedule
    from config.camera_config import load_camera_config, save_default_config, DEFAULT_CONFIG, SENSITIVITY_PRESETS
    
    from core.capture import CaptureSession
    from core.motion_router import MotionRouter
    from core.hazard_pipeline import HazardPipeline
    from core.enhancement_pipeline import LowLightEnhancer
    from core.person_detector import PersonDetector
except ImportError as e:
    print(f"Warning: Could not import some core modules. Make sure you are running from the project root. Error: {e}")
    # Mocking for the sake of starting up if modules are missing, though not strictly required if environment is sound.
    IdentityPipeline = None
    get_current_mode = None
    is_within_auth_schedule = None
    load_camera_config = None
    save_default_config = None
    DEFAULT_CONFIG = {}
    SENSITIVITY_PRESETS = {}
    CaptureSession = None
    MotionRouter = None
    HazardPipeline = None
    LowLightEnhancer = None
    PersonDetector = None

# Initialize Flask app
# Serve static files from the 'frontend' directory
frontend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'frontend')
app = Flask(__name__, static_folder=frontend_dir, static_url_path='')
CORS(app)

# Global state
START_TIME = time.time()
EVENT_LOG = []
MAX_EVENTS = 500
EVENT_LOCK = threading.Lock()

LATEST_FRAME_JPEG = b""
FRAME_LOCK = threading.Lock()

# Initialize models
print("Initializing IdentityPipeline (this may take a moment)...")
if IdentityPipeline is not None:
    try:
        identity_pipeline = IdentityPipeline(db_path='known_faces.json')
        print("Identity pipeline initialized successfully.")
    except Exception as e:
        print(f"Error initializing IdentityPipeline: {e}")
        identity_pipeline = None
else:
    identity_pipeline = None


def add_event(event_type, title, severity="low", detail=None):
    """Add an event to the in-memory log."""
    with EVENT_LOCK:
        event = {
            "id": int(time.time() * 1000),
            "timestamp": time.time(),
            "type": event_type,
            "title": title,
            "severity": severity,
            "detail": detail or ""
        }
        EVENT_LOG.insert(0, event)
        if len(EVENT_LOG) > MAX_EVENTS:
            EVENT_LOG.pop()
    return event


@app.route('/')
def index():
    """Serve the frontend index.html."""
    if os.path.exists(os.path.join(app.static_folder, 'index.html')):
        return send_from_directory(app.static_folder, 'index.html')
    return "Frontend not found. Please create the frontend/index.html file.", 404


@app.route('/api/status', methods=['GET'])
def get_status():
    """System status (mode, uptime, cameras count, enrolled faces count)."""
    uptime_seconds = int(time.time() - START_TIME)
    
    # Calculate mode using schedule if available, else unknown
    current_mode = "unknown"
    if get_current_mode and DEFAULT_CONFIG:
        try:
            current_mode = get_current_mode(DEFAULT_CONFIG)
        except Exception:
            pass

    # Count json files for cameras
    cameras_count = 0
    project_dir = os.path.dirname(os.path.abspath(__file__))
    for f in os.listdir(project_dir):
        if f.endswith('.json') and 'camera' in f.lower():
            cameras_count += 1
            
    if cameras_count == 0:
        # Default camera config file might be named something else, let's just assume at least 1 if we can load it
        cameras_count = 1

    # Count enrolled faces
    faces_count = 0
    if identity_pipeline and hasattr(identity_pipeline, 'db') and hasattr(identity_pipeline.db, 'entries'):
        faces_count = len(identity_pipeline.db.entries)

    return jsonify({
        "status": "online",
        "uptime_seconds": uptime_seconds,
        "mode": current_mode,
        "cameras_count": cameras_count,
        "enrolled_faces": faces_count,
        "enrolled_faces_count": faces_count,
        "timestamp": datetime.now().isoformat()
    })


@app.route('/api/cameras', methods=['GET'])
def get_cameras():
    """List camera configs (read from JSON files in project dir)."""
    cameras = []
    project_dir = os.path.dirname(os.path.abspath(__file__))
    for f in os.listdir(project_dir):
        if f.endswith('.json') and 'camera' in f.lower():
            try:
                if load_camera_config:
                    cfg = load_camera_config(os.path.join(project_dir, f))
                    cameras.append({"filename": f, "config": cfg})
            except Exception as e:
                print(f"Failed to load camera config {f}: {e}")
    
    # If none found, return default
    if not cameras and DEFAULT_CONFIG:
        cameras.append({"filename": "my_camera.json", "config": DEFAULT_CONFIG})
        
    return jsonify({"cameras": cameras})


@app.route('/api/cameras', methods=['POST'])
def save_camera():
    """Save/update camera config."""
    try:
        data = request.json
        filename = data.get("filename", "my_camera.json")
        config_data = data.get("config", {})
        
        project_dir = os.path.dirname(os.path.abspath(__file__))
        file_path = os.path.join(project_dir, filename)
        
        with open(file_path, 'w') as f:
            json.dump(config_data, f, indent=4)
            
        add_event("config_update", f"Camera configuration updated: {filename}")
        return jsonify({"success": True, "message": f"Camera config {filename} saved successfully."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route('/api/events', methods=['GET'])
def get_events():
    """Get event log."""
    limit = request.args.get('limit', default=100, type=int)
    with EVENT_LOCK:
        events = EVENT_LOG[:limit]
    return jsonify({"events": events})


@app.route('/api/faces', methods=['GET'])
def list_faces():
    """List enrolled face names."""
    if not identity_pipeline or not hasattr(identity_pipeline, 'db'):
        return jsonify({"success": False, "error": "Identity pipeline not available"}), 500
        
    names = list(identity_pipeline.db.entries.keys())
    return jsonify({"faces": names, "count": len(names)})


@app.route('/api/faces/enroll', methods=['POST'])
def enroll_face():
    """
    Enroll face. Accept JSON with {name: string, images: [base64_jpeg_strings]}
    where images is an array of 5 base64-encoded face photos.
    """
    if not identity_pipeline or not hasattr(identity_pipeline, 'db'):
        return jsonify({"success": False, "error": "Identity pipeline not available"}), 500

    try:
        data = request.json
        name = data.get('name')
        images_b64 = data.get('images', [])
        
        if not name:
            return jsonify({"success": False, "error": "Name is required"}), 400
            
        if not images_b64 or len(images_b64) == 0:
            return jsonify({"success": False, "error": "At least one image is required"}), 400

        valid_embeddings = []
        temp_name_prefix = f"_temp_enroll_{name}_{int(time.time())}"
        
        for idx, img_b64 in enumerate(images_b64):
            # Strip header if present
            if ',' in img_b64:
                img_b64 = img_b64.split(',', 1)[1]
                
            img_bytes = base64.b64decode(img_b64)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            frame_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            
            if frame_bgr is None:
                continue
                
            # Use enroll_from_image to extract embedding to the temp name
            temp_name = f"{temp_name_prefix}_{idx}"
            success = identity_pipeline.enroll_from_image(temp_name, frame_bgr)
            
            if success and temp_name in identity_pipeline.db.entries:
                embedding = identity_pipeline.db.entries[temp_name]
                valid_embeddings.append(embedding)
                # Cleanup temp entry
                identity_pipeline.db.remove(temp_name)
        
        if not valid_embeddings:
            return jsonify({"success": False, "error": "Could not extract faces from any of the provided images"}), 400
            
        # Average embeddings
        avg_embedding = np.mean(valid_embeddings, axis=0)
        # Normalize
        avg_embedding = avg_embedding / np.linalg.norm(avg_embedding)
        
        # Save to db
        identity_pipeline.db.add(name, avg_embedding)
        identity_pipeline.db.save()
        
        add_event("face_enrollment", f"Enrolled new face: {name}", severity="info")
        return jsonify({
            "success": True, 
            "message": f"Successfully enrolled {name} using {len(valid_embeddings)} valid images."
        })
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/faces/<name>', methods=['DELETE'])
def remove_face(name):
    """Remove enrolled face."""
    if not identity_pipeline or not hasattr(identity_pipeline, 'db'):
        return jsonify({"success": False, "error": "Identity pipeline not available"}), 500
        
    if name in identity_pipeline.db.entries:
        try:
            identity_pipeline.db.remove(name)
            identity_pipeline.db.save()
            add_event("face_removal", f"Removed face: {name}", severity="info")
            return jsonify({"success": True, "message": f"Face '{name}' removed."})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500
    else:
        return jsonify({"success": False, "error": f"Face '{name}' not found."}), 404


@app.route('/api/config', methods=['GET'])
def get_config():
    """Get current camera config and sensitivity presets."""
    project_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(project_dir, 'my_camera.json')
    cfg = dict(DEFAULT_CONFIG)
    if os.path.exists(path):
        try:
            with open(path, 'r') as f:
                cfg.update(json.load(f))
        except Exception:
            pass
    return jsonify({
        "config": cfg,
        "default_config": DEFAULT_CONFIG,
        "sensitivity_presets": SENSITIVITY_PRESETS
    })


@app.route('/api/config', methods=['POST'])
def update_config():
    """Update config file."""
    try:
        data = request.json
        project_dir = os.path.dirname(os.path.abspath(__file__))
        path = os.path.join(project_dir, 'my_camera.json')
        
        with open(path, 'w') as f:
            json.dump(data, f, indent=4)
            
        add_event("config_update", "Global configuration updated")
        return jsonify({"success": True, "message": "Config updated successfully."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/schedule', methods=['GET'])
def get_schedule():
    """Get current schedule and mode."""
    project_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(project_dir, 'my_camera.json')
    cfg = dict(DEFAULT_CONFIG)
    if os.path.exists(path):
        try:
            with open(path, 'r') as f:
                cfg.update(json.load(f))
        except Exception:
            pass
    try:
        mode = get_current_mode(cfg) if get_current_mode else "unknown"
    except Exception:
        mode = "unknown"
    return jsonify({
        "mode": mode,
        "ai_schedule": cfg.get("schedule", {}).get("ai_mode", [["00:00", "23:59"]]),
        "auth_schedule": cfg.get("auth_schedule", {"days": ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], "start": "00:00", "end": "23:59"})
    })


@app.route('/api/schedule', methods=['POST'])
def update_schedule():
    """Update schedule."""
    try:
        new_schedule = request.json
        # Here we would typically load the main config, update schedule, and save
        project_dir = os.path.dirname(os.path.abspath(__file__))
        path = os.path.join(project_dir, 'my_camera.json')
        
        if os.path.exists(path):
            with open(path, 'r') as f:
                cfg = json.load(f)
        else:
            cfg = DEFAULT_CONFIG.copy()
            
        cfg['auth_schedule'] = new_schedule
        
        with open(path, 'w') as f:
            json.dump(cfg, f, indent=4)
            
        add_event("schedule_update", "Authentication schedule updated")
        return jsonify({"success": True, "message": "Schedule updated successfully."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


def demo_event_generator():
    """Optional simulated event generator."""
    event_types = [
        ("auth_success", "Authorized person detected", "success"),
        ("auth_failure", "Unauthorized person detected", "warning"),
        ("hazard", "Hazard detected (fire/smoke)", "critical"),
        ("system", "Camera connection restored", "info")
    ]
    import random
    while True:
        time.sleep(random.randint(60, 300)) # Random event every 1-5 minutes
        evt_type, desc, severity = random.choice(event_types)
        add_event(evt_type, desc, severity=severity)

def generate_video_stream():
    """Generator for MJPEG stream. Uses polling to avoid GIL deadlock."""
    global LATEST_FRAME_JPEG
    last_frame = b""
    while True:
        with FRAME_LOCK:
            frame_data = LATEST_FRAME_JPEG
        if frame_data and frame_data != last_frame:
            last_frame = frame_data
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_data + b'\r\n')
        else:
            time.sleep(0.033)  # ~30fps polling

@app.route('/api/video_feed')
def video_feed():
    """Video streaming route."""
    from flask import Response
    return Response(generate_video_stream(), mimetype='multipart/x-mixed-replace; boundary=frame')

# Pre-load all models at module level BEFORE Flask starts
# This avoids GIL deadlock when loading in a background thread
print("Loading detection models (this may take a minute)...")
try:
    from main import make_on_clip_ready, make_on_hazard_check
    _person_detector = PersonDetector() if PersonDetector else None
    print("  PersonDetector loaded.")
    _hazard_pipeline = HazardPipeline() if HazardPipeline else None
    print("  HazardPipeline loaded.")
    _enhancer = LowLightEnhancer() if LowLightEnhancer else None
    print("  LowLightEnhancer loaded.")
    print("All detection models loaded successfully.")
except Exception as e:
    print(f"Warning: Could not load detection models: {e}")
    _person_detector = None
    _hazard_pipeline = None
    _enhancer = None
    make_on_clip_ready = None
    make_on_hazard_check = None


def start_live_pipeline():
    """Start the real detection pipeline in a background thread."""
    import traceback as tb
    try:
        if not all([CaptureSession, MotionRouter, _person_detector, _hazard_pipeline, _enhancer]):
            print("[PIPELINE] Missing models. Falling back to demo mode.")
            demo_event_generator()
            return

        cfg = dict(DEFAULT_CONFIG)
        project_dir = os.path.dirname(os.path.abspath(__file__))
        path = os.path.join(project_dir, 'my_camera.json')
        if os.path.exists(path):
            try:
                with open(path, 'r') as f:
                    cfg.update(json.load(f))
            except Exception:
                pass

        router = MotionRouter(cfg)

        def on_log(log_entry):
            decision = log_entry.get("decision", {})
            action = decision.get("final_action", "")
            print(f"[DETECTION] on_log fired: action={action}", flush=True)
            if action == "SAFE_ENTRY":
                identity = decision.get("identity", {})
                detail = identity.get("detail", "Known face")
                add_event("auth_success", f"Authorized: {detail}", severity="success")
            elif action == "UNAUTHORIZED_ALERT_UNKNOWN_FACE":
                add_event("auth_failure", "Unauthorized Face Detected", severity="warning")
            elif action == "UNAUTHORIZED_ALERT_HAZARD":
                detail = decision.get("detail", "fire/smoke")
                add_event("hazard", f"Hazard Detected: {detail}", severity="critical")
            elif action == "LOG_ONLY":
                ps = decision.get("person_score", 0)
                if ps > 0.4:
                    add_event("person", f"Person Detected (score: {ps:.2f})", severity="info")
                else:
                    add_event("motion", "Motion Detected", severity="low")
            elif decision.get("mode") == "cctv_mode":
                add_event("motion", "Motion (CCTV Mode)", severity="low")
            else:
                add_event("system", f"Detection: {action or 'unknown'}", severity="info")

        on_clip_ready = make_on_clip_ready(cfg, router, identity_pipeline, _enhancer, _person_detector, on_log=on_log)
        on_hazard_check = make_on_hazard_check(_hazard_pipeline, _enhancer, on_log=on_log)

        _fc = [0]

        def on_frame(frame, sig_contours, is_recording):
            global LATEST_FRAME_JPEG
            _fc[0] += 1
            if _fc[0] % 150 == 0:
                print(f"[PIPELINE] frame #{_fc[0]}, blobs={len(sig_contours)}, rec={is_recording}", flush=True)
            display = frame.copy()
            for c in sig_contours:
                x, y, w, h = cv2.boundingRect(c)
                cv2.rectangle(display, (x, y), (x + w, y + h), (0, 255, 0), 2)
            status_text = "RECORDING" if is_recording else "watching..."
            status_color = (0, 0, 255) if is_recording else (200, 200, 200)
            cv2.putText(display, status_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, status_color, 2)
            cv2.putText(display, f"motion blobs: {len(sig_contours)}", (10, 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)
            ret, buf = cv2.imencode('.jpg', display)
            if ret:
                with FRAME_LOCK:
                    LATEST_FRAME_JPEG = buf.tobytes()
            return True

        print(f"[PIPELINE] Creating CaptureSession (source={cfg.get('source')})...", flush=True)
        session = CaptureSession(
            cfg,
            on_clip_ready=on_clip_ready,
            on_frame=on_frame,
            on_hazard_check=on_hazard_check,
            hazard_check_interval=2.0,
        )
        print(f"[PIPELINE] CaptureSession ready. threshold={session.motion_threshold}, cooldown={session.cooldown}", flush=True)
        print("[PIPELINE] Starting capture loop...", flush=True)
        session.run()

    except Exception as e:
        print(f"[PIPELINE] *** FATAL ERROR: {e}", flush=True)
        tb.print_exc()
        demo_event_generator()


if __name__ == '__main__':
    add_event("system_start", "Security Pipeline API started", severity="info")
    pipeline_thread = threading.Thread(target=start_live_pipeline, daemon=True)
    pipeline_thread.start()
    print("Starting Flask server on port 5000...")
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
