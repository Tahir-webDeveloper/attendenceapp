// ===== Reactive State =====
const USE_API = true; // set false to revert to localStorage fallback
const API_BASE = '/api';

let authToken = localStorage.getItem('attendly_auth_token') || '';

const state = {
    classes: [],
    attendance: [],
    currentView: 'dashboard',
};

function setAuthToken(token) {
    authToken = token || '';
    if (token) localStorage.setItem('attendly_auth_token', token);
    else localStorage.removeItem('attendly_auth_token');
}

function authHeaders() {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

async function apiFetch(path, options = {}) {
    const headers = options.headers || {};
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { ...headers, ...authHeaders(), ...options.headers },
    });
    if (res.status === 401) {
        await showLoginModal();
        throw new Error('Unauthorized');
    }
    return res;
}


async function loadState() {
    if (USE_API) {
        try {
            const res = await apiFetch('/state');
            if (!res.ok) throw new Error('API state fetch failed');
            const data = await res.json();
            state.classes = data.classes || [];
            state.attendance = data.attendance || [];
            return;
        } catch (err) {
            console.error('API loadState error:', err);
            showToast('Failed to load data from server, falling back to local storage.', 'error');
        }
    }

    const saved = localStorage.getItem('attendly_data');
    if (saved) {
        const data = JSON.parse(saved);
        state.classes = data.classes || [];
        state.attendance = data.attendance || [];
    }
}

async function saveState() {
    if (USE_API) {
        try {
            const res = await apiFetch('/state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ classes: state.classes, attendance: state.attendance }),
            });
            if (!res.ok) throw new Error('API state save failed');
            return;
        } catch (err) {
            console.error('API saveState error:', err);
            showToast('Failed to save data to server; saving locally.', 'error');
        }
    }

    localStorage.setItem('attendly_data', JSON.stringify({
        classes: state.classes,
        attendance: state.attendance,
    }));
}

// ===== Auth/UI State =====
function setAuthUIVisible(show) {
    const loginModal = document.getElementById('authModal');
    if (!loginModal) return;
    if (show) {
        loginModal.classList.add('active');
    } else {
        loginModal.classList.remove('active');
    }
}

async function showLoginModal() {
    setAuthUIVisible(true);
}

async function hiddenLoginModal() {
    setAuthUIVisible(false);
}

async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) {
        showToast('Email and password are required.', 'error');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
            const body = await res.json();
            return showToast(body.error || 'Login failed', 'error');
        }

        const data = await res.json();
        setAuthToken(data.token);
        await initApp();
        showToast('Logged in successfully');
    } catch (err) {
        console.error('Login error', err);
        showToast('Login failed, check your network.', 'error');
    }
}

async function handleRegister(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password || password.length < 6) {
        showToast('Password must be at least 6 characters.', 'error');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
            const body = await res.json();
            return showToast(body.error || 'Sign up failed', 'error');
        }

        const data = await res.json();
        setAuthToken(data.token);
        await initApp();
        showToast('Account created and logged in.');
    } catch (err) {
        console.error('Register error', err);
        showToast('Registration failed, check your network.', 'error');
    }
}

async function ensureAuthenticated() {
    if (!authToken) {
        await showLoginModal();
        return false;
    }

    try {
        const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
        if (!res.ok) {
            setAuthToken('');
            await showLoginModal();
            return false;
        }
        return true;
    } catch (err) {
        console.error('Ensure auth error', err);
        setAuthToken('');
        await showLoginModal();
        return false;
    }
}

function handleLogout() {
    setAuthToken('');
    state.classes = [];
    state.attendance = [];
    showLoginModal();
    showToast('Logged out successfully', 'info');
}

async function initApp() {
    const auth = await ensureAuthenticated();
    if (!auth) return;

    hiddenLoginModal();
    await loadState();
    updateDateDisplay();
    renderDashboard();
    populateClassSelects();
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('authForm');
    const registerBtn = document.getElementById('registerBtn');
    const loginBtn = document.getElementById('loginBtn');

    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (registerBtn) registerBtn.addEventListener('click', handleRegister);

    initApp();
});

function updateDateDisplay() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('dateDisplay').textContent = now.toLocaleDateString('en-US', options);
}

// ===== Navigation =====
function switchView(view) {
    state.currentView = view;

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');

    document.querySelectorAll('.nav-item[data-view]').forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-view="${view}"]`).classList.add('active');

    const titles = { dashboard: 'Dashboard', classes: 'Classes', attendance: 'Take Attendance', reports: 'Reports' };
    document.getElementById('pageTitle').textContent = titles[view];

    if (view === 'dashboard') renderDashboard();
    if (view === 'classes') renderClasses();
    if (view === 'attendance') populateClassSelects();
    if (view === 'reports') populateClassSelects();

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
    const overlay = document.querySelector('.sidebar-overlay');
    if (overlay) overlay.classList.remove('active');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');

    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.onclick = () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        };
        document.body.appendChild(overlay);
    }
    overlay.classList.toggle('active');
}

// ===== Modal Management =====
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    if (id === 'classModal') {
        document.getElementById('className').value = '';
        document.getElementById('classCode').value = '';
        document.getElementById('editClassId').value = '';
        document.getElementById('classModalTitle').textContent = 'Add New Class';
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        document.querySelector('.color-swatch').classList.add('active');
    }
    if (id === 'studentModal') {
        document.getElementById('studentName').value = '';
        document.getElementById('studentRoll').value = '';
        document.getElementById('studentClassId').value = '';
        document.getElementById('editStudentId').value = '';
        document.getElementById('bulkStudentData').value = '';
        document.getElementById('studentModalTitle').textContent = 'Add Student';
    }
}

// Close modals on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => {
            closeModal(m.id);
        });
    }
});

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(overlay.id);
    });
});

// ===== Toast =====
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
        error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    };

    toast.innerHTML = `${icons[type] || ''}${message}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ===== Color Picker =====
function selectColor(el) {
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
}

function getSelectedColor() {
    const active = document.querySelector('.color-swatch.active');
    return active ? active.dataset.color : '#6C5CE7';
}

// ===== Classes CRUD =====
function saveClass() {
    const name = document.getElementById('className').value.trim();
    const code = document.getElementById('classCode').value.trim();
    const color = getSelectedColor();
    const editId = document.getElementById('editClassId').value;

    if (!name) {
        showToast('Please enter a class name.', 'error');
        return;
    }

    if (editId) {
        const cls = state.classes.find(c => c.id === editId);
        if (cls) {
            cls.name = name;
            cls.code = code;
            cls.color = color;
            showToast('Class updated successfully!');
        }
    } else {
        state.classes.push({
            id: generateId(),
            name,
            code,
            color,
            students: [],
            createdAt: new Date().toISOString(),
        });
        showToast('Class created successfully!');
    }

    saveState();
    closeModal('classModal');
    renderClasses();
    populateClassSelects();
}

function editClass(classId) {
    const cls = state.classes.find(c => c.id === classId);
    if (!cls) return;

    document.getElementById('editClassId').value = cls.id;
    document.getElementById('className').value = cls.name;
    document.getElementById('classCode').value = cls.code;
    document.getElementById('classModalTitle').textContent = 'Edit Class';

    document.querySelectorAll('.color-swatch').forEach(s => {
        s.classList.toggle('active', s.dataset.color === cls.color);
    });

    openModal('classModal');
}

function deleteClass(classId) {
    showConfirm('Delete Class', 'This will delete the class and all its attendance records. Continue?', () => {
        state.classes = state.classes.filter(c => c.id !== classId);
        state.attendance = state.attendance.filter(a => a.classId !== classId);
        saveState();
        renderClasses();
        populateClassSelects();
        renderDashboard();
        showToast('Class deleted.', 'info');
    });
}

function renderClasses() {
    const grid = document.getElementById('classesGrid');

    if (state.classes.length === 0) {
        grid.innerHTML = `
            <div class="empty-state-large">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                <h3>No classes yet</h3>
                <p>Create your first class to start tracking attendance.</p>
                <button class="btn btn-primary" onclick="openModal('classModal')">Create Class</button>
            </div>`;
        return;
    }

    grid.innerHTML = state.classes.map(cls => {
        const sessions = state.attendance.filter(a => a.classId === cls.id);
        const avgRate = getClassAttendanceRate(cls.id);

        return `
        <div class="class-card">
            <div class="class-card-accent" style="background: ${cls.color}"></div>
            <div class="class-card-body">
                <div class="class-card-top">
                    <div class="class-card-info">
                        <h3>${escapeHtml(cls.name)}</h3>
                        <span class="code">${escapeHtml(cls.code || 'No code')}</span>
                    </div>
                    <div class="class-card-actions">
                        <button class="icon-btn" onclick="editClass('${cls.id}')" title="Edit">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="icon-btn danger" onclick="deleteClass('${cls.id}')" title="Delete">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </div>
                <div class="class-card-stats">
                    <div class="class-stat">
                        <span class="class-stat-value">${cls.students.length}</span>
                        <span class="class-stat-label">Students</span>
                    </div>
                    <div class="class-stat">
                        <span class="class-stat-value">${sessions.length}</span>
                        <span class="class-stat-label">Sessions</span>
                    </div>
                    <div class="class-stat">
                        <span class="class-stat-value">${avgRate}%</span>
                        <span class="class-stat-label">Avg Rate</span>
                    </div>
                </div>
            </div>
            <div class="class-card-footer">
                <button class="btn btn-outline btn-sm" onclick="openAddStudent('${cls.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                    Add Student
                </button>
                <button class="btn btn-outline btn-sm" onclick="viewStudents('${cls.id}')">
                    View Students (${cls.students.length})
                </button>
            </div>
        </div>`;
    }).join('');
}

// ===== Students =====
function openAddStudent(classId) {
    document.getElementById('studentClassId').value = classId;
    document.getElementById('editStudentId').value = '';
    document.getElementById('studentName').value = '';
    document.getElementById('studentRoll').value = '';
    document.getElementById('studentModalTitle').textContent = 'Add Student';
    openModal('studentModal');
    setTimeout(() => document.getElementById('studentName').focus(), 100);
}

function editStudent(classId, studentId) {
    const cls = state.classes.find(c => c.id === classId);
    if (!cls) return;
    const student = cls.students.find(s => s.id === studentId);
    if (!student) return;

    // If a confirm modal is open, close it first so edit modal is on top.
    closeModal('confirmModal');

    document.getElementById('studentClassId').value = classId;
    document.getElementById('editStudentId').value = studentId;
    document.getElementById('studentName').value = student.name;
    document.getElementById('studentRoll').value = student.roll;
    document.getElementById('studentModalTitle').textContent = 'Edit Student';
    openModal('studentModal');
    setTimeout(() => document.getElementById('studentName').focus(), 100);
}

function parseBulkStudents(bulkData) {
    if (!bulkData) return [];

    const lines = bulkData
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line);

    const students = [];

    if (lines.length === 1 && lines[0].includes(',') && lines[0].split(',').length > 2) {
        const tokens = lines[0].split(',').map(token => token.trim()).filter(token => token);
        for (let i = 0; i + 1 < tokens.length; i += 2) {
            if (!tokens[i]) continue;
            students.push({ name: tokens[i], roll: tokens[i + 1] || '' });
        }
        return students;
    }

    lines.forEach(line => {
        const parts = line.split(',').map(p => p.trim()).filter(p => p);
        if (parts.length === 1) {
            students.push({ name: parts[0], roll: '' });
        } else if (parts.length === 2) {
            students.push({ name: parts[0], roll: parts[1] });
        } else if (parts.length > 2) {
            for (let i = 0; i + 1 < parts.length; i += 2) {
                students.push({ name: parts[i], roll: parts[i + 1] });
            }
        }
    });

    return students;
}

function saveStudent() {
    const classId = document.getElementById('studentClassId').value;
    const name = document.getElementById('studentName').value.trim();
    const roll = document.getElementById('studentRoll').value.trim();
    const bulkData = document.getElementById('bulkStudentData').value.trim();

    const cls = state.classes.find(c => c.id === classId);
    if (!cls) return;

    const editStudentId = document.getElementById('editStudentId').value;
    if (editStudentId) {
        const student = cls.students.find(s => s.id === editStudentId);
        if (!student) {
            showToast('Student not found for editing.', 'error');
            return;
        }

        student.name = name;
        student.roll = roll;
        saveState();
        closeModal('studentModal');
        renderClasses();
        showToast(`${name} updated in ${cls.name}!`);
        return;
    }

    const bulkStudents = parseBulkStudents(bulkData);

    if (bulkStudents.length > 0) {
        bulkStudents.forEach(student => {
            if (student.name) {
                cls.students.push({ id: generateId(), name: student.name, roll: student.roll });
            }
        });

        saveState();
        closeModal('studentModal');
        renderClasses();
        showToast(`${bulkStudents.length} students added to ${cls.name}!`);
        return;
    }

    if (!name) {
        showToast('Please enter student name or bulk student data.', 'error');
        return;
    }

    cls.students.push({
        id: generateId(),
        name,
        roll,
    });

    saveState();
    closeModal('studentModal');
    renderClasses();
    showToast(`${name} added to ${cls.name}!`);
}

function viewStudents(classId) {
    const cls = state.classes.find(c => c.id === classId);
    if (!cls) return;

    const panel = document.getElementById('studentListPanel');
    panel.classList.remove('hidden');

    if (cls.students.length === 0) {
        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h3>${escapeHtml(cls.name)} - Students</h3>
                <button class="btn btn-secondary" onclick="closeStudentList()">Close</button>
            </div>
            <p>No students in this class yet.</p>
            <button class="btn btn-primary" onclick="openAddStudent('${classId}')">Add Student</button>
        `;
        return;
    }

    const rows = cls.students.map(s => `
        <div class="student-list-row" id="student-row-${s.id}">
            <div style="flex-grow:1">
                <div class="student-name">${escapeHtml(s.name)}</div>
                <div class="student-roll">${escapeHtml(s.roll || 'No ID')}</div>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
                <button class="icon-btn" onclick="openInlineEdit('${classId}', '${s.id}')" title="Edit">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="icon-btn danger" onclick="removeStudent('${classId}','${s.id}'); viewStudents('${classId}')" title="Remove">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </div>
    `).join('');

    panel.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <h3>${escapeHtml(cls.name)} - Students</h3>
            <button class="btn btn-secondary" onclick="closeStudentList()">Close</button>
        </div>
        <div>${rows}</div>
    `;
}

function closeStudentList() {
    document.getElementById('studentListPanel').classList.add('hidden');
}

function openInlineEdit(classId, studentId) {
    const cls = state.classes.find(c => c.id === classId);
    if (!cls) return;
    const student = cls.students.find(s => s.id === studentId);
    if (!student) return;

    const row = document.getElementById(`student-row-${studentId}`);
    if (!row) return;

    row.innerHTML = `
        <input type="text" id="editName-${studentId}" value="${escapeHtml(student.name)}" />
        <input type="text" id="editRoll-${studentId}" value="${escapeHtml(student.roll || '')}" />
        <button class="btn btn-primary" onclick="saveInlineEdit('${classId}', '${studentId}')">Save</button>
        <button class="btn btn-secondary" onclick="viewStudents('${classId}')">Cancel</button>
    `;
}

function saveInlineEdit(classId, studentId) {
    const cls = state.classes.find(c => c.id === classId);
    if (!cls) return;
    const student = cls.students.find(s => s.id === studentId);
    if (!student) return;

    const newName = document.getElementById(`editName-${studentId}`).value.trim();
    const newRoll = document.getElementById(`editRoll-${studentId}`).value.trim();

    if (!newName) {
        showToast('Student name cannot be empty.', 'error');
        return;
    }

    student.name = newName;
    student.roll = newRoll;
    saveState();
    showToast('Student updated successfully');
    viewStudents(classId);
}

function removeStudent(classId, studentId) {
    const cls = state.classes.find(c => c.id === classId);
    if (!cls) return;

    const student = cls.students.find(s => s.id === studentId);
    cls.students = cls.students.filter(s => s.id !== studentId);
    saveState();
    renderClasses();
    showToast(`${student ? student.name : 'Student'} removed.`, 'info');
    closeModal('confirmModal');
}

// ===== Attendance Taking =====
function populateClassSelects() {
    const selects = [
        document.getElementById('attendanceClassSelect'),
        document.getElementById('reportsClassSelect'),
    ];

    selects.forEach(sel => {
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">-- Choose a class --</option>';
        state.classes.forEach(cls => {
            const opt = document.createElement('option');
            opt.value = cls.id;
            opt.textContent = `${cls.name}${cls.code ? ' (' + cls.code + ')' : ''}`;
            sel.appendChild(opt);
        });
        if (current) sel.value = current;
    });
}

function loadAttendanceView() {
    const classId = document.getElementById('attendanceClassSelect').value;
    const container = document.getElementById('attendanceContent');

    if (!classId) {
        container.innerHTML = `
            <div class="empty-state-large">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                <h3>Select a class</h3>
                <p>Choose a class above to take attendance.</p>
            </div>`;
        return;
    }

    const cls = state.classes.find(c => c.id === classId);
    if (!cls || cls.students.length === 0) {
        container.innerHTML = `
            <div class="empty-state-large">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                <h3>No students</h3>
                <p>Add students to this class first.</p>
                <button class="btn btn-primary" onclick="openAddStudent('${classId}')">Add Students</button>
            </div>`;
        return;
    }

    const today = new Date().toISOString().split('T')[0];

    // Check for existing session today
    const existingSession = state.attendance.find(a => a.classId === classId && a.date === today);
    const records = existingSession ? existingSession.records : {};

    container.innerHTML = `
        <div class="attendance-date-row">
            <input type="date" id="attendanceDate" value="${today}" onchange="refreshAttendanceForDate()">
            <div class="mark-all-btns">
                <button class="btn btn-sm btn-success" onclick="markAll('present')">All Present</button>
                <button class="btn btn-sm btn-danger" onclick="markAll('absent')">All Absent</button>
            </div>
        </div>
        <div class="student-attendance-list" id="studentAttendanceList">
            ${cls.students.map(s => {
                const status = records[s.id] || 'present';
                return `
                <div class="student-attendance-row" data-student-id="${s.id}">
                    <div class="student-info">
                        <div class="student-name">${escapeHtml(s.name)}</div>
                        <div class="student-roll">${escapeHtml(s.roll || '')}</div>
                    </div>
                    <div class="attendance-toggle">
                        <button class="toggle-btn present ${status === 'present' ? 'active' : ''}" onclick="setStatus(this, '${s.id}', 'present')">Present</button>
                        <button class="toggle-btn late ${status === 'late' ? 'active' : ''}" onclick="setStatus(this, '${s.id}', 'late')">Late</button>
                        <button class="toggle-btn absent ${status === 'absent' ? 'active' : ''}" onclick="setStatus(this, '${s.id}', 'absent')">Absent</button>
                    </div>
                </div>`;
            }).join('')}
        </div>
        <button class="btn btn-primary" onclick="saveAttendance('${classId}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            Save Attendance
        </button>
    `;
}

function refreshAttendanceForDate() {
    const classId = document.getElementById('attendanceClassSelect').value;
    const date = document.getElementById('attendanceDate').value;
    if (!classId || !date) return;

    const cls = state.classes.find(c => c.id === classId);
    if (!cls) return;

    const session = state.attendance.find(a => a.classId === classId && a.date === date);
    const records = session ? session.records : {};

    cls.students.forEach(s => {
        const row = document.querySelector(`[data-student-id="${s.id}"]`);
        if (!row) return;
        const status = records[s.id] || 'present';
        row.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.classList.contains(status)) btn.classList.add('active');
        });
    });
}

function setStatus(btn, studentId, status) {
    const row = btn.closest('.student-attendance-row');
    row.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function markAll(status) {
    document.querySelectorAll('.student-attendance-row').forEach(row => {
        row.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        row.querySelector(`.toggle-btn.${status}`).classList.add('active');
    });
}

function saveAttendance(classId) {
    const date = document.getElementById('attendanceDate').value;
    if (!date) {
        showToast('Please select a date.', 'error');
        return;
    }

    const records = {};
    document.querySelectorAll('.student-attendance-row').forEach(row => {
        const studentId = row.dataset.studentId;
        const active = row.querySelector('.toggle-btn.active');
        if (active) {
            if (active.classList.contains('present')) records[studentId] = 'present';
            else if (active.classList.contains('late')) records[studentId] = 'late';
            else if (active.classList.contains('absent')) records[studentId] = 'absent';
        }
    });

    // Update or create session
    const existing = state.attendance.findIndex(a => a.classId === classId && a.date === date);
    if (existing >= 0) {
        state.attendance[existing].records = records;
    } else {
        state.attendance.push({
            id: generateId(),
            classId,
            date,
            records,
            createdAt: new Date().toISOString(),
        });
    }

    saveState();
    showToast('Attendance saved successfully!');
    renderDashboard();
}

// ===== Reports =====
function loadReportsView() {
    const classId = document.getElementById('reportsClassSelect').value;
    const container = document.getElementById('reportsContent');

    if (!classId) {
        container.innerHTML = `
            <div class="empty-state-large">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <h3>Select a class</h3>
                <p>Choose a class to view attendance reports.</p>
            </div>`;
        return;
    }

    const cls = state.classes.find(c => c.id === classId);
    if (!cls) return;

    const sessions = state.attendance.filter(a => a.classId === classId).sort((a, b) => b.date.localeCompare(a.date));

    if (sessions.length === 0 || cls.students.length === 0) {
        container.innerHTML = `
            <div class="empty-state-large">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <h3>No data</h3>
                <p>Take attendance first to see reports.</p>
            </div>`;
        return;
    }

    // Calculate per-student stats
    const studentStats = cls.students.map(s => {
        let present = 0, absent = 0, late = 0;
        sessions.forEach(sess => {
            const status = sess.records[s.id];
            if (status === 'present') present++;
            else if (status === 'late') late++;
            else absent++;
        });
        const total = sessions.length;
        const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
        return { ...s, present, absent, late, total, rate };
    });

    const totalPresent = studentStats.reduce((sum, s) => sum + s.present, 0);
    const totalLate = studentStats.reduce((sum, s) => sum + s.late, 0);
    const totalAbsent = studentStats.reduce((sum, s) => sum + s.absent, 0);
    const totalRecords = totalPresent + totalLate + totalAbsent;
    const overallRate = totalRecords > 0 ? Math.round(((totalPresent + totalLate) / totalRecords) * 100) : 0;

    const activityTable = `
        <div style="overflow-x:auto; border-radius: var(--radius-md); margin-top: 18px;">
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>Roll #</th>
                        <th>Present</th>
                        <th>Late</th>
                        <th>Absent</th>
                        <th>Rate</th>
                    </tr>
                </thead>
                <tbody>
                    ${studentStats.map(s => `
                        <tr>
                            <td><strong>${escapeHtml(s.name)}</strong></td>
                            <td>${escapeHtml(s.roll || '-')}</td>
                            <td><a class="report-link" href="#" onclick="event.preventDefault(); showStudentDetail('${classId}','${s.id}','present')">${s.present}</a></td>
                            <td><a class="report-link" href="#" onclick="event.preventDefault(); showStudentDetail('${classId}','${s.id}','late')">${s.late}</a></td>
                            <td><a class="report-link" href="#" onclick="event.preventDefault(); showStudentDetail('${classId}','${s.id}','absent')">${s.absent}</a></td>
                            <td><span class="attendance-badge ${s.rate >= 75 ? 'badge-good' : s.rate >= 50 ? 'badge-warning' : 'badge-danger'}">${s.rate}%</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = `
        <div class="report-summary">
            <div class="report-stat">
                <div class="report-stat-value green">${overallRate}%</div>
                <div class="report-stat-label">Overall Attendance</div>
            </div>
            <div class="report-stat">
                <div class="report-stat-value orange">${sessions.length}</div>
                <div class="report-stat-label">Total Sessions</div>
            </div>
            <div class="report-stat">
                <div class="report-stat-value red">${studentStats.filter(s => s.rate < 75).length}</div>
                <div class="report-stat-label">Below 75%</div>
            </div>
        </div>

        <div class="export-btn-row">
            <button class="btn btn-outline btn-sm" onclick="exportCSV('${classId}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export CSV
            </button>
        </div>

        ${activityTable}
    `;
}

function showStudentDetail(classId, studentId, mode) {
    const container = document.getElementById('reportsContent');
    const cls = state.classes.find(c => c.id === classId);
    const student = cls ? cls.students.find(s => s.id === studentId) : null;
    if (!cls || !student) {
        showToast('Student or class not found.', 'error');
        return;
    }

    const sessions = state.attendance
        .filter(a => a.classId === classId)
        .sort((a, b) => a.date.localeCompare(b.date));

    const rows = sessions.map(sess => {
        const status = sess.records[studentId] || 'absent';
        return `
            <tr>
                <td>${formatDate(sess.date)}</td>
                <td>${status.charAt(0).toUpperCase() + status.slice(1)}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="report-summary">
            <div class="report-stat">
                <div class="report-stat-value green">${student.name}</div>
                <div class="report-stat-label">Student Name</div>
            </div>
            <div class="report-stat">
                <div class="report-stat-value orange">${student.roll || '-'}</div>
                <div class="report-stat-label">Student ID</div>
            </div>
            <div class="report-stat">
                <div class="report-stat-value red">${mode.toUpperCase()} DETAIL</div>
                <div class="report-stat-label">Showing <strong>${mode}</strong> statuses</div>
            </div>
        </div>

        <div class="export-btn-row">
            <button class="btn btn-outline btn-sm" onclick="loadReportsView()">Back to class report</button>
        </div>

        <div style="overflow-x:auto; border-radius: var(--radius-md); margin-top: 18px;">
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

function exportCSV(classId) {
    const cls = state.classes.find(c => c.id === classId);
    if (!cls) return;

    const sessions = state.attendance.filter(a => a.classId === classId).sort((a, b) => a.date.localeCompare(b.date));
    if (sessions.length === 0) {
        showToast('No attendance data to export.', 'error');
        return;
    }

    let csv = 'Student Name,Roll Number,' + sessions.map(s => s.date).join(',') + ',Attendance Rate\n';

    cls.students.forEach(s => {
        let present = 0;
        const statuses = sessions.map(sess => {
            const status = sess.records[s.id] || 'absent';
            if (status === 'present' || status === 'late') present++;
            return status.charAt(0).toUpperCase() + status.slice(1);
        });
        const rate = Math.round((present / sessions.length) * 100);
        csv += `"${s.name}","${s.roll || ''}",${statuses.join(',')},${rate}%\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cls.name.replace(/\s+/g, '_')}_attendance.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported!');
}

// ===== Dashboard =====
function renderDashboard() {
    const totalClasses = state.classes.length;
    const totalStudents = state.classes.reduce((sum, c) => sum + c.students.length, 0);
    const totalSessions = state.attendance.length;
    const avgAttendance = getOverallAttendanceRate();

    document.getElementById('totalClasses').textContent = totalClasses;
    document.getElementById('totalStudents').textContent = totalStudents;
    document.getElementById('totalSessions').textContent = totalSessions;
    document.getElementById('avgAttendance').textContent = avgAttendance + '%';

    renderRecentSessions();
    renderOverviewChart();
}

function renderRecentSessions() {
    const container = document.getElementById('recentSessions');
    const recent = [...state.attendance].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

    if (recent.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <p>No sessions yet. Take attendance to get started!</p>
            </div>`;
        return;
    }

    container.innerHTML = recent.map(session => {
        const cls = state.classes.find(c => c.id === session.classId);
        if (!cls) return '';
        const records = Object.values(session.records);
        const presentCount = records.filter(r => r === 'present' || r === 'late').length;
        const absentCount = records.filter(r => r === 'absent').length;
        const dateStr = formatDate(session.date);

        return `
            <div class="session-item">
                <div class="session-dot" style="background: ${cls.color}"></div>
                <div class="session-details">
                    <div class="session-class">${escapeHtml(cls.name)}</div>
                    <div class="session-date">${dateStr}</div>
                </div>
                <div class="session-stats">
                    <span class="session-present">${presentCount} present</span>
                    <span class="session-absent">${absentCount} absent</span>
                </div>
            </div>`;
    }).join('');
}

function renderOverviewChart() {
    const container = document.getElementById('overviewChart');

    if (state.classes.length === 0 || state.attendance.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <p>Charts will appear after recording attendance.</p>
            </div>`;
        return;
    }

    const classRates = state.classes.map(cls => ({
        name: cls.code || cls.name.substring(0, 8),
        rate: parseInt(getClassAttendanceRate(cls.id)),
        color: cls.color,
    })).filter(c => {
        return state.attendance.some(a => a.classId === state.classes.find(cl => (cl.code || cl.name.substring(0, 8)) === c.name)?.id);
    });

    if (classRates.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <p>Charts will appear after recording attendance.</p>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="bar-chart">
            ${classRates.map(c => `
                <div class="bar-group">
                    <div class="bar-value">${c.rate}%</div>
                    <div class="bar" style="height: ${Math.max(c.rate, 4)}%; background: ${c.color};"></div>
                    <div class="bar-label" title="${c.name}">${c.name}</div>
                </div>
            `).join('')}
        </div>`;
}

// ===== Calculations =====
function getClassAttendanceRate(classId) {
    const cls = state.classes.find(c => c.id === classId);
    if (!cls || cls.students.length === 0) return '0';

    const sessions = state.attendance.filter(a => a.classId === classId);
    if (sessions.length === 0) return '0';

    let totalPresent = 0;
    let totalRecords = 0;

    sessions.forEach(sess => {
        cls.students.forEach(s => {
            const status = sess.records[s.id];
            if (status === 'present' || status === 'late') totalPresent++;
            totalRecords++;
        });
    });

    return totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100).toString() : '0';
}

function getOverallAttendanceRate() {
    if (state.classes.length === 0 || state.attendance.length === 0) return 0;

    let totalPresent = 0;
    let totalRecords = 0;

    state.attendance.forEach(session => {
        const cls = state.classes.find(c => c.id === session.classId);
        if (!cls) return;

        cls.students.forEach(s => {
            const status = session.records[s.id];
            if (status === 'present' || status === 'late') totalPresent++;
            totalRecords++;
        });
    });

    return totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0;
}

// ===== Confirm Dialog =====
function showConfirm(title, message, onConfirm) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    const btn = document.getElementById('confirmAction');
    btn.textContent = 'Confirm';
    btn.className = 'btn btn-danger';
    btn.onclick = () => {
        onConfirm();
        closeModal('confirmModal');
    };
    openModal('confirmModal');
}

function confirmReset() {
    showConfirm('Reset All Data', 'This will permanently delete all classes, students, and attendance records. This cannot be undone.', () => {
        state.classes = [];
        state.attendance = [];
        saveState();
        renderDashboard();
        renderClasses();
        populateClassSelects();
        showToast('All data has been reset.', 'info');
    });
}

// ===== Utilities =====
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
