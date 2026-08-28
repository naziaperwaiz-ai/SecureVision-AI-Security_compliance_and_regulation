/**
 * SecureVision AI — Dashboard Application
 * Complete JavaScript logic for the security pipeline frontend.
 */

const API_BASE = window.location.origin;

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
const Toast = {
    container: null,
    init() {
        this.container = document.getElementById('toastContainer');
    },
    show(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icons = {
            success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };
        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-message">${message}</div>
            <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
        `;
        this.container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
};

// ============================================================
// API HELPER
// ============================================================
const API = {
    async get(endpoint) {
        try {
            const res = await fetch(`${API_BASE}${endpoint}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            console.warn(`API GET ${endpoint} failed:`, e.message);
            return null;
        }
    },
    async post(endpoint, data) {
        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            console.warn(`API POST ${endpoint} failed:`, e.message);
            return null;
        }
    },
    async delete(endpoint) {
        try {
            const res = await fetch(`${API_BASE}${endpoint}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            console.warn(`API DELETE ${endpoint} failed:`, e.message);
            return null;
        }
    }
};

// ============================================================
// MAIN APP
// ============================================================
const App = {
    currentSection: 'dashboard',
    events: [],
    enrolledFaces: [],
    startTime: Date.now(),
    apiOnline: false,

    // ---------- INITIALIZATION ----------
    async init() {
        Toast.init();
        this.initNavigation();
        this.initSidebar();
        this.initClock();
        this.initRangeInputs();
        this.initFilterTabs();
        this.initDayToggles();
        this.initModal();
        this.enrollment.init();

        // Try to connect to API
        await this.checkApiStatus();

        // Load data
        await this.loadFaces();
        await this.loadEvents();
        await this.loadCameraConfig();
        await this.loadSchedule();

        // Start periodic updates
        setInterval(() => this.updateUptime(), 1000);
        setInterval(() => this.checkApiStatus(), 15000);
        setInterval(() => this.loadEvents(), 3000);

        // Generate demo events if API is offline
        if (!this.apiOnline) {
            this.generateDemoData();
        }

        console.log('SecureVision AI Dashboard initialized');
    },

    // ---------- NAVIGATION ----------
    initNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                this.navigateTo(section);
            });
        });
    },

    navigateTo(section) {
        // Update nav
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const navItem = document.querySelector(`.nav-item[data-section="${section}"]`);
        if (navItem) navItem.classList.add('active');

        // Update sections
        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        const sectionEl = document.getElementById(`section-${section}`);
        if (sectionEl) sectionEl.classList.add('active');

        // Update title
        const titles = {
            dashboard: 'Dashboard Overview',
            monitoring: 'Live Monitoring',
            enrollment: 'Face Enrollment',
            alerts: 'Alerts & Events',
            cameras: 'Camera Configuration',
            schedule: 'Schedule Management',
            settings: 'System Settings'
        };
        document.getElementById('pageTitle').textContent = titles[section] || 'Dashboard';
        this.currentSection = section;

        // Close mobile sidebar
        document.getElementById('sidebar').classList.remove('open');

        // Handle section-specific init
        if (section === 'enrollment') {
            this.enrollment.onSectionVisible();
        }
    },

    // ---------- SIDEBAR ----------
    initSidebar() {
        const toggle = document.getElementById('sidebarToggle');
        const sidebar = document.getElementById('sidebar');
        const main = document.getElementById('mainContent');

        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            main.classList.toggle('sidebar-collapsed');
        });

        // Mobile menu
        document.getElementById('mobileMenuBtn').addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });

        // Close on outside click (mobile)
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) {
                if (!sidebar.contains(e.target) && !document.getElementById('mobileMenuBtn').contains(e.target)) {
                    sidebar.classList.remove('open');
                }
            }
        });
    },

    // ---------- CLOCK ----------
    initClock() {
        const update = () => {
            const now = new Date();
            document.getElementById('headerTime').textContent = now.toLocaleTimeString('en-US', { hour12: false });
        };
        update();
        setInterval(update, 1000);
    },

    // ---------- UPTIME ----------
    updateUptime() {
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
        const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
        const s = String(elapsed % 60).padStart(2, '0');
        const el = document.getElementById('uptimeValue');
        if (el) el.textContent = `${h}:${m}:${s}`;
    },

    // ---------- API STATUS ----------
    async checkApiStatus() {
        const data = await API.get('/api/status');
        const dot = document.getElementById('apiStatusDot');
        const text = document.getElementById('apiStatusText');
        const sysDot = document.getElementById('systemStatusDot');
        const sysText = document.getElementById('systemStatusText');

        if (data) {
            this.apiOnline = true;
            dot.className = 'health-dot online';
            text.textContent = 'Connected';
            sysDot.className = 'status-indicator online';
            sysText.textContent = 'System Online';

            if (data.mode) {
                document.getElementById('statMode').textContent = data.mode === 'ai_mode' ? 'AI Mode' : 'CCTV Mode';
                document.getElementById('sidebarModeText').textContent = data.mode === 'ai_mode' ? 'AI Mode' : 'CCTV Mode';
            }
            if (data.enrolled_faces_count !== undefined) {
                document.getElementById('statFaces').textContent = data.enrolled_faces_count;
            }
            if (data.uptime_seconds !== undefined) {
                this.startTime = Date.now() - data.uptime_seconds * 1000;
            }
        } else {
            this.apiOnline = false;
            dot.className = 'health-dot offline';
            text.textContent = 'Offline (Demo)';
            sysDot.className = 'status-indicator offline';
            sysText.textContent = 'Demo Mode';
        }
    },

    // ---------- RANGE INPUTS ----------
    initRangeInputs() {
        const ranges = [
            ['settPersonThreshold', 'settPersonThresholdVal'],
            ['settMatchThreshold', 'settMatchThresholdVal'],
            ['settHazardConfidence', 'settHazardConfidenceVal'],
            ['settDarknessThreshold', 'settDarknessThresholdVal'],
            ['settMaxBboxFraction', 'settMaxBboxFractionVal']
        ];
        ranges.forEach(([inputId, displayId]) => {
            const input = document.getElementById(inputId);
            const display = document.getElementById(displayId);
            if (input && display) {
                input.addEventListener('input', () => {
                    display.textContent = parseFloat(input.value).toFixed(2);
                });
            }
        });
    },

    // ---------- FILTER TABS ----------
    initFilterTabs() {
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.filterEvents(tab.dataset.filter);
            });
        });
    },

    // ---------- DAY TOGGLES ----------
    initDayToggles() {
        document.querySelectorAll('.day-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('active');
            });
        });
    },

    // ---------- MODAL ----------
    initModal() {
        const overlay = document.getElementById('modalOverlay');
        const closeBtn = document.getElementById('modalClose');
        closeBtn.addEventListener('click', () => overlay.classList.remove('active'));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    },

    showModal(content) {
        document.getElementById('modalContent').innerHTML = content;
        document.getElementById('modalOverlay').classList.add('active');
    },

    closeModal() {
        document.getElementById('modalOverlay').classList.remove('active');
    },

    // ============================================================
    // EVENTS
    // ============================================================
    async loadEvents() {
        if (this.apiOnline) {
            const data = await API.get('/api/events');
            if (data && data.events) {
                this.events = data.events;
            }
        }
        this.renderEvents();
    },

    renderEvents() {
        this.renderDashboardFeed();
        this.renderEventsPage();
        this.updateAlertCount();
    },

    renderDashboardFeed() {
        const feed = document.getElementById('dashboardEventFeed');
        if (!this.events.length) {
            feed.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><p>No events recorded yet</p><span>Events will appear here in real-time</span></div>`;
            return;
        }
        const recent = this.events.slice(-20).reverse();
        feed.innerHTML = recent.map(e => this.renderEventItem(e)).join('');
    },

    renderEventsPage() {
        const list = document.getElementById('eventsList');
        const activeFilter = document.querySelector('.filter-tab.active')?.dataset.filter || 'all';
        let filtered = this.events;
        if (activeFilter !== 'all') {
            filtered = this.events.filter(e => e.type === activeFilter);
        }
        if (!filtered.length) {
            list.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>No events to display</p><span>Events will appear here as the system detects activity</span></div>`;
            return;
        }
        list.innerHTML = filtered.slice().reverse().map(e => this.renderEventItem(e, true)).join('');
    },

    renderEventItem(event, detailed = false) {
        const icons = {
            person: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
            hazard: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            unauthorized: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
            motion: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
            safe: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
        };
        const type = event.type || 'motion';
        const severity = event.severity || 'low';
        const time = event.timestamp ? new Date(event.timestamp * 1000).toLocaleTimeString('en-US', { hour12: false }) : '--:--';
        const date = event.timestamp ? new Date(event.timestamp * 1000).toLocaleDateString() : '';

        return `
            <div class="event-item severity-${severity}" data-type="${type}">
                <div class="event-icon ${type}">${icons[type] || icons.motion}</div>
                <div class="event-details">
                    <span class="event-title">${event.title || 'Event'}</span>
                    ${detailed && event.detail ? `<span class="event-detail">${event.detail}</span>` : ''}
                    <span class="event-time">${time}${detailed ? ' · ' + date : ''}</span>
                </div>
                <span class="event-badge ${severity}">${severity}</span>
            </div>
        `;
    },

    filterEvents(filter) {
        this.renderEventsPage();
    },

    updateAlertCount() {
        const count = this.events.filter(e => e.severity === 'critical' || e.severity === 'high').length;
        const badge = document.getElementById('alertCount');
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';

        const dot = document.getElementById('notificationDot');
        dot.style.display = count > 0 ? 'block' : 'none';

        document.getElementById('statAlerts').textContent = count;
    },

    clearEvents() {
        this.events = [];
        this.renderEvents();
        Toast.show('Event log cleared', 'info');
    },

    exportEvents() {
        const data = JSON.stringify(this.events, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `securevision_events_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        Toast.show('Events exported successfully', 'success');
    },

    // ============================================================
    // FACES
    // ============================================================
    async loadFaces() {
        if (this.apiOnline) {
            const data = await API.get('/api/faces');
            if (data && data.faces) {
                this.enrolledFaces = data.faces;
            }
        }
        this.renderEnrolledFaces();
    },

    renderEnrolledFaces() {
        const list = document.getElementById('enrolledList');
        const badge = document.getElementById('enrolledCountBadge');
        badge.textContent = this.enrolledFaces.length;
        document.getElementById('statFaces').textContent = this.enrolledFaces.length;

        if (!this.enrolledFaces.length) {
            list.innerHTML = `<div class="empty-state small"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><p>No persons enrolled</p><span>Use the wizard to enroll authorized persons</span></div>`;
            return;
        }

        list.innerHTML = this.enrolledFaces.map(name => `
            <div class="enrolled-person">
                <div class="person-avatar">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>
                    </svg>
                </div>
                <div class="person-info">
                    <span class="person-name">${name}</span>
                    <span class="person-status">Authorized</span>
                </div>
                <button class="btn-ghost btn-sm btn-icon" onclick="App.removeFace('${name}')" title="Remove">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        `).join('');
    },

    async removeFace(name) {
        if (!confirm(`Remove "${name}" from the authorization database?`)) return;

        if (this.apiOnline) {
            const result = await API.delete(`/api/faces/${encodeURIComponent(name)}`);
            if (result) {
                this.enrolledFaces = this.enrolledFaces.filter(n => n !== name);
                Toast.show(`"${name}" removed from database`, 'success');
            } else {
                Toast.show('Failed to remove face', 'error');
            }
        } else {
            this.enrolledFaces = this.enrolledFaces.filter(n => n !== name);
            Toast.show(`"${name}" removed (demo mode)`, 'success');
        }
        this.renderEnrolledFaces();
    },

    // ============================================================
    // CAMERA CONFIG
    // ============================================================
    async loadCameraConfig() {
        if (this.apiOnline) {
            const data = await API.get('/api/config');
            if (data && data.config) {
                this.populateCameraForm(data.config);
                return;
            }
        }
        // Default values
        this.populateCameraForm({
            camera_id: 'default_cam',
            source: 0,
            sensitivity: 'normal',
            ignore_pets: false,
            cooldown_seconds: 2.5,
            max_clip_seconds: 45,
            pre_buffer_seconds: 1.5,
            repetitive_motion_window: 60,
            repetitive_motion_max_triggers: 5,
            detection_zones: [],
            ignore_zones: []
        });
    },

    populateCameraForm(cfg) {
        document.getElementById('cfgCameraId').value = cfg.camera_id || 'default_cam';
        document.getElementById('cfgSource').value = cfg.source ?? 0;
        document.getElementById('cfgSensitivity').value = cfg.sensitivity || 'normal';
        document.getElementById('cfgIgnorePets').checked = cfg.ignore_pets || false;
        document.getElementById('cfgCooldown').value = cfg.cooldown_seconds ?? 2.5;
        document.getElementById('cfgMaxClip').value = cfg.max_clip_seconds ?? 45;
        document.getElementById('cfgPreBuffer').value = cfg.pre_buffer_seconds ?? 1.5;
        document.getElementById('cfgRepWindow').value = cfg.repetitive_motion_window ?? 60;
        document.getElementById('cfgRepMaxTriggers').value = cfg.repetitive_motion_max_triggers ?? 5;
        document.getElementById('cfgDetectionZones').value = JSON.stringify(cfg.detection_zones || [], null, 2);
        document.getElementById('cfgIgnoreZones').value = JSON.stringify(cfg.ignore_zones || [], null, 2);
        document.getElementById('cameraSourceDisplay').textContent = cfg.source === 0 ? 'Webcam (0)' : cfg.source;
    },

    async saveCameraConfig(e) {
        e.preventDefault();
        let detZones, ignZones;
        try {
            detZones = JSON.parse(document.getElementById('cfgDetectionZones').value || '[]');
            ignZones = JSON.parse(document.getElementById('cfgIgnoreZones').value || '[]');
        } catch (err) {
            Toast.show('Invalid JSON in zone configuration', 'error');
            return;
        }

        const config = {
            camera_id: document.getElementById('cfgCameraId').value,
            source: isNaN(document.getElementById('cfgSource').value) ? document.getElementById('cfgSource').value : parseInt(document.getElementById('cfgSource').value),
            sensitivity: document.getElementById('cfgSensitivity').value,
            ignore_pets: document.getElementById('cfgIgnorePets').checked,
            cooldown_seconds: parseFloat(document.getElementById('cfgCooldown').value),
            max_clip_seconds: parseInt(document.getElementById('cfgMaxClip').value),
            pre_buffer_seconds: parseFloat(document.getElementById('cfgPreBuffer').value),
            repetitive_motion_window: parseInt(document.getElementById('cfgRepWindow').value),
            repetitive_motion_max_triggers: parseInt(document.getElementById('cfgRepMaxTriggers').value),
            detection_zones: detZones,
            ignore_zones: ignZones
        };

        if (this.apiOnline) {
            const result = await API.post('/api/config', config);
            if (result) {
                Toast.show('Camera configuration saved', 'success');
            } else {
                Toast.show('Failed to save configuration', 'error');
            }
        } else {
            Toast.show('Configuration saved (demo mode)', 'success');
        }
    },

    // ============================================================
    // SCHEDULE
    // ============================================================
    async loadSchedule() {
        if (this.apiOnline) {
            const data = await API.get('/api/schedule');
            if (data) {
                this.populateSchedule(data);
                return;
            }
        }
        this.updateScheduleTimeline();
    },

    populateSchedule(data) {
        if (data.ai_schedule && data.ai_schedule.length > 0) {
            document.getElementById('schedAiStart').value = data.ai_schedule[0][0];
            document.getElementById('schedAiEnd').value = data.ai_schedule[0][1];
        }
        if (data.auth_schedule) {
            document.getElementById('authStart').value = data.auth_schedule.start || '00:00';
            document.getElementById('authEnd').value = data.auth_schedule.end || '23:59';
            const days = data.auth_schedule.days || [];
            document.querySelectorAll('.day-toggle').forEach(btn => {
                btn.classList.toggle('active', days.includes(btn.dataset.day));
            });
        }
        if (data.mode) {
            const badge = document.getElementById('currentModeScheduleBadge');
            badge.textContent = data.mode === 'ai_mode' ? 'AI Mode' : 'CCTV Mode';
            badge.className = `status-badge ${data.mode === 'ai_mode' ? 'online' : 'offline'}`;
        }
        this.updateScheduleTimeline();
    },

    updateScheduleTimeline() {
        const start = document.getElementById('schedAiStart').value || '00:00';
        const end = document.getElementById('schedAiEnd').value || '23:59';
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        const startPct = ((sh * 60 + sm) / 1440) * 100;
        const endPct = ((eh * 60 + em) / 1440) * 100;
        const fill = document.getElementById('scheduleTimelineFill');
        fill.style.left = startPct + '%';
        fill.style.width = (endPct - startPct) + '%';

        const now = new Date();
        const nowPct = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;
        document.getElementById('scheduleTimelineNow').style.left = nowPct + '%';
    },

    async saveSchedule() {
        const activeDays = Array.from(document.querySelectorAll('.day-toggle.active')).map(b => b.dataset.day);
        const scheduleData = {
            ai_schedule: [[document.getElementById('schedAiStart').value, document.getElementById('schedAiEnd').value]],
            auth_schedule: {
                days: activeDays,
                start: document.getElementById('authStart').value,
                end: document.getElementById('authEnd').value
            }
        };

        if (this.apiOnline) {
            const result = await API.post('/api/schedule', scheduleData);
            if (result) {
                Toast.show('Schedule saved successfully', 'success');
            } else {
                Toast.show('Failed to save schedule', 'error');
            }
        } else {
            Toast.show('Schedule saved (demo mode)', 'success');
        }
        this.updateScheduleTimeline();
    },

    resetSchedule() {
        document.getElementById('schedAiStart').value = '00:00';
        document.getElementById('schedAiEnd').value = '23:59';
        document.getElementById('authStart').value = '00:00';
        document.getElementById('authEnd').value = '23:59';
        document.querySelectorAll('.day-toggle').forEach(b => b.classList.add('active'));
        this.updateScheduleTimeline();
        Toast.show('Schedule reset to defaults', 'info');
    },

    // ============================================================
    // SETTINGS
    // ============================================================
    async saveSettings() {
        const settings = {
            person_threshold: parseFloat(document.getElementById('settPersonThreshold').value),
            match_threshold: parseFloat(document.getElementById('settMatchThreshold').value),
            hazard_confidence: parseFloat(document.getElementById('settHazardConfidence').value),
            hazard_interval: parseInt(document.getElementById('settHazardInterval').value),
            darkness_threshold: parseInt(document.getElementById('settDarknessThreshold').value),
            max_bbox_fraction: parseFloat(document.getElementById('settMaxBboxFraction').value)
        };
        Toast.show('Settings saved successfully', 'success');
    },

    resetSettings() {
        document.getElementById('settPersonThreshold').value = 0.4;
        document.getElementById('settPersonThresholdVal').textContent = '0.40';
        document.getElementById('settMatchThreshold').value = 0.45;
        document.getElementById('settMatchThresholdVal').textContent = '0.45';
        document.getElementById('settHazardConfidence').value = 0.2;
        document.getElementById('settHazardConfidenceVal').textContent = '0.20';
        document.getElementById('settHazardInterval').value = 2;
        document.getElementById('settDarknessThreshold').value = 90;
        document.getElementById('settDarknessThresholdVal').textContent = '90';
        document.getElementById('settMaxBboxFraction').value = 0.3;
        document.getElementById('settMaxBboxFractionVal').textContent = '0.30';
        Toast.show('Settings reset to defaults', 'info');
    },

    // ============================================================
    // DETECTION LOG (Monitoring)
    // ============================================================
    addDetectionLog(entry) {
        const log = document.getElementById('detectionLog');
        const item = document.createElement('div');
        item.className = `detection-item ${entry.type || ''}`;
        item.innerHTML = `
            <span class="detection-time">${new Date().toLocaleTimeString('en-US', { hour12: false })}</span>
            <span class="detection-msg">${entry.message}</span>
        `;
        if (log.querySelector('.empty-state')) log.innerHTML = '';
        log.insertBefore(item, log.firstChild);
        if (log.children.length > 50) log.lastChild.remove();
    },

    clearDetectionLog() {
        document.getElementById('detectionLog').innerHTML = `<div class="empty-state small"><p>Waiting for detections...</p></div>`;
    },

    // ============================================================
    // DEMO DATA GENERATOR
    // ============================================================
    generateDemoData() {
        // Pre-populate with sample enrolled faces
        this.enrolledFaces = ['T1', 'AhmedAli'];
        this.renderEnrolledFaces();

        // Generate sample events
        const eventTypes = [
            { type: 'motion', title: 'Motion Detected', severity: 'low', detail: 'Movement detected in detection zone' },
            { type: 'person', title: 'Person Detected', severity: 'medium', detail: 'Person score: 0.87 — Running identity pipeline' },
            { type: 'safe', title: 'Authorized Entry', severity: 'low', detail: 'Face matched: T1 (similarity: 0.92)' },
            { type: 'unauthorized', title: 'Unknown Person', severity: 'high', detail: 'No face match found (best similarity: 0.21)' },
            { type: 'hazard', title: 'Fire/Smoke Detected', severity: 'critical', detail: 'Fire detected with confidence 0.78' },
            { type: 'motion', title: 'Repetitive Motion Filtered', severity: 'low', detail: 'Motion suppressed — same region triggered 6 times in 60s' },
            { type: 'person', title: 'Person in Detection Zone', severity: 'medium', detail: 'YOLOv8 person confidence: 0.93' },
            { type: 'safe', title: 'Authorized Entry', severity: 'low', detail: 'Face matched: AhmedAli (similarity: 0.88)' },
        ];

        const now = Date.now() / 1000;
        for (let i = 0; i < 15; i++) {
            const evt = { ...eventTypes[Math.floor(Math.random() * eventTypes.length)] };
            evt.timestamp = now - (15 - i) * 300 + Math.random() * 60;
            this.events.push(evt);
        }
        this.renderEvents();

        // Periodically add new demo events
        setInterval(() => {
            if (Math.random() < 0.3) {
                const evt = { ...eventTypes[Math.floor(Math.random() * eventTypes.length)] };
                evt.timestamp = Date.now() / 1000;
                this.events.push(evt);
                if (this.events.length > 500) this.events.shift();
                this.renderEvents();
                this.addDetectionLog({ type: evt.type, message: evt.title });
            }
        }, 5000);
    },

    // ============================================================
    // ENROLLMENT MODULE (5-Photo Capture)
    // ============================================================
    enrollment: {
        currentStep: 1,
        totalSteps: 4,
        photos: [], // Array of base64 strings
        stream: null,
        videoEl: null,

        angleInstructions: [
            { text: 'Look straight at the camera', label: 'Front' },
            { text: 'Turn your head slightly LEFT', label: 'Left' },
            { text: 'Turn your head slightly RIGHT', label: 'Right' },
            { text: 'Tilt your head slightly UP', label: 'Up' },
            { text: 'Tilt your head slightly DOWN', label: 'Down' }
        ],

        init() {
            this.videoEl = document.getElementById('enrollWebcam');
            this.photos = [];
        },

        onSectionVisible() {
            // Don't auto-start webcam, wait for step 2
        },

        async startWebcam() {
            try {
                this.stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
                });
                this.videoEl.srcObject = this.stream;
                document.getElementById('webcamStatus').innerHTML = '<span class="webcam-status-dot active"></span> Camera Active';
                return true;
            } catch (err) {
                console.error('Webcam error:', err);
                document.getElementById('webcamStatus').innerHTML = '<span class="webcam-status-dot error"></span> Camera Unavailable';
                Toast.show('Could not access webcam. Please allow camera permissions.', 'error');
                return false;
            }
        },

        stopWebcam() {
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
            if (this.videoEl) {
                this.videoEl.srcObject = null;
            }
        },

        async nextStep() {
            if (this.currentStep === 1) {
                const name = document.getElementById('enrollName').value.trim();
                if (!name) {
                    Toast.show('Please enter a name', 'warning');
                    return;
                }
                this.goToStep(2);
                await this.startWebcam();
            } else if (this.currentStep === 2) {
                if (this.photos.length < 5) {
                    Toast.show('Please capture all 5 photos', 'warning');
                    return;
                }
                this.stopWebcam();
                this.goToStep(3);
                this.renderReview();
            } else if (this.currentStep === 3) {
                this.goToStep(4);
                this.submitEnrollment();
            }
        },

        prevStep() {
            if (this.currentStep === 2) {
                this.stopWebcam();
                this.photos = [];
                this.resetPhotoSlots();
                this.goToStep(1);
            } else if (this.currentStep === 3) {
                this.photos = [];
                this.resetPhotoSlots();
                this.goToStep(2);
                this.startWebcam();
            } else if (this.currentStep === 4) {
                this.goToStep(3);
            }
        },

        goToStep(step) {
            this.currentStep = step;

            // Update step indicator
            document.getElementById('stepIndicator').textContent = `Step ${step} of ${this.totalSteps}`;

            // Update progress dots
            document.querySelectorAll('.progress-step').forEach(s => {
                const sNum = parseInt(s.dataset.step);
                s.classList.remove('active', 'completed');
                if (sNum === step) s.classList.add('active');
                if (sNum < step) s.classList.add('completed');
            });

            // Show correct wizard step
            for (let i = 1; i <= this.totalSteps; i++) {
                const el = document.getElementById(`wizardStep${i}`);
                if (el) {
                    el.classList.toggle('active', i === step);
                }
            }

            // Update angle guide for step 2
            if (step === 2) {
                this.updateAngleGuide();
            }
        },

        capturePhoto() {
            if (this.photos.length >= 5) return;

            const canvas = document.createElement('canvas');
            canvas.width = this.videoEl.videoWidth || 640;
            canvas.height = this.videoEl.videoHeight || 480;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(this.videoEl, 0, 0);

            const base64 = canvas.toDataURL('image/jpeg', 0.9);
            this.photos.push(base64);

            // Update photo slot
            const slotIndex = this.photos.length - 1;
            const slot = document.querySelector(`.photo-slot[data-slot="${slotIndex}"]`);
            if (slot) {
                slot.classList.add('captured');
                slot.innerHTML = `<img src="${base64}" alt="Photo ${slotIndex + 1}"><div class="photo-check"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>`;
            }

            // Flash effect
            const captureBtn = document.getElementById('captureBtn');
            captureBtn.classList.add('flash');
            setTimeout(() => captureBtn.classList.remove('flash'), 300);

            Toast.show(`Photo ${this.photos.length}/5 captured`, 'success', 2000);
            this.updateAngleGuide();

            // Enable next button when all 5 are captured
            if (this.photos.length >= 5) {
                document.getElementById('captureNextBtn').disabled = false;
                document.getElementById('captureBtn').disabled = true;
                Toast.show('All 5 photos captured! Click "Review Photos" to continue.', 'success');
            }
        },

        updateAngleGuide() {
            const idx = Math.min(this.photos.length, 4);
            if (this.photos.length < 5) {
                const instruction = this.angleInstructions[idx];
                document.getElementById('angleText').textContent = instruction.text;
                document.getElementById('angleCount').textContent = `Photo ${idx + 1} of 5`;
            } else {
                document.getElementById('angleText').textContent = 'All photos captured!';
                document.getElementById('angleCount').textContent = '5/5 Complete';
            }
        },

        resetPhotoSlots() {
            const labels = ['Front', 'Left', 'Right', 'Up', 'Down'];
            document.querySelectorAll('.photo-slot').forEach((slot, i) => {
                slot.classList.remove('captured');
                slot.innerHTML = `<div class="photo-slot-inner"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg><span>${labels[i]}</span></div>`;
            });
            document.getElementById('captureNextBtn').disabled = true;
            document.getElementById('captureBtn').disabled = false;
        },

        renderReview() {
            const grid = document.getElementById('reviewGrid');
            const labels = ['Front', 'Left', 'Right', 'Up', 'Down'];
            grid.innerHTML = this.photos.map((photo, i) => `
                <div class="review-photo">
                    <img src="${photo}" alt="${labels[i]}">
                    <span class="review-photo-label">${labels[i]}</span>
                    <span class="review-photo-status good">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                        Good
                    </span>
                </div>
            `).join('');
            document.getElementById('reviewPhotoCount').textContent = `${this.photos.length}/5`;
        },

        async submitEnrollment() {
            const name = document.getElementById('enrollName').value.trim();
            const loadingEl = document.getElementById('enrollmentLoading');
            const successEl = document.getElementById('enrollmentSuccess');
            const errorEl = document.getElementById('enrollmentError');

            loadingEl.classList.remove('hidden');
            successEl.classList.add('hidden');
            errorEl.classList.add('hidden');

            // Strip the data:image/jpeg;base64, prefix
            const images = this.photos.map(p => p.split(',')[1]);

            if (App.apiOnline) {
                try {
                    const result = await API.post('/api/faces/enroll', { name, images });
                    if (result && result.success) {
                        loadingEl.classList.add('hidden');
                        successEl.classList.remove('hidden');
                        document.getElementById('enrollmentSuccessName').textContent = result.message || `"${name}" has been added to the authorization database with ${images.length} photos.`;
                        App.enrolledFaces.push(name);
                        App.renderEnrolledFaces();
                        Toast.show(`${name} enrolled successfully!`, 'success');
                    } else {
                        throw new Error(result?.message || 'Enrollment failed');
                    }
                } catch (err) {
                    loadingEl.classList.add('hidden');
                    errorEl.classList.remove('hidden');
                    document.getElementById('enrollmentErrorMsg').textContent = err.message;
                    Toast.show('Enrollment failed: ' + err.message, 'error');
                }
            } else {
                // Demo mode - simulate success
                await new Promise(r => setTimeout(r, 2000));
                loadingEl.classList.add('hidden');
                successEl.classList.remove('hidden');
                document.getElementById('enrollmentSuccessName').textContent = `"${name}" has been added to the authorization database with 5 photos (demo mode).`;
                App.enrolledFaces.push(name);
                App.renderEnrolledFaces();
                Toast.show(`${name} enrolled successfully (demo mode)!`, 'success');
            }
        },

        reset() {
            this.photos = [];
            this.currentStep = 1;
            this.resetPhotoSlots();
            this.goToStep(1);
            document.getElementById('enrollName').value = '';
            document.getElementById('enrollRole').value = '';
            document.getElementById('enrollNotes').value = '';
            document.getElementById('enrollmentLoading').classList.remove('hidden');
            document.getElementById('enrollmentSuccess').classList.add('hidden');
            document.getElementById('enrollmentError').classList.add('hidden');
        }
    }
};

// ============================================================
// BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', () => App.init());
