/* ════════════════════════════════════════════
   VED LIBRARY — script.js
   ════════════════════════════════════════════ */

/* ── Config: paste your Supabase keys here ───────────────────────────────── */
const SUPABASE_URL  = 'https://dmolzoagnzjwtrdroqeg.supabase.co';       // e.g. https://xxxx.supabase.co
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtb2x6b2Fnbnpqd3RyZHJvcWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODUxODEsImV4cCI6MjA5MDg2MTE4MX0.5Culb-inMvITeplysy6_BJJXngd_SPMWG13_hT0GV5w';  // starts with eyJ...
const ADMIN_EMAIL   = 'raunakdubey7891@gmail.com';

/* ── Library GPS for attendance verification ─────────────────────────────── */
const LIBRARY_LAT       = 26.46141163972251;  // ← change to your library's latitude
const LIBRARY_LON       = 80.35654168267091;  // ← change to your library's longitude
const LIBRARY_RADIUS_KM = 0.05;      // 50 metres radius

/* ── Supabase client ─────────────────────────────────────────────────────── */
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

/* ── App state ───────────────────────────────────────────────────────────── */
let currentUser    = null;
let currentProfile = null;
let allStudents    = [];
let allSeats       = [];
let allPayments    = [];
let allAttendance  = [];
let allNotices     = [];
let photoBase64    = null;
let aadhaarBase64  = null;

/* ── Study plans lookup ──────────────────────────────────────────────────── */
const STUDY_PLANS = {
  full_time: 'Full Time (12 Hours)',
  shift_a:   'Shift A (4 Hours)',
  shift_b:   'Shift B (4 Hours)',
  custom:    'Custom Shift',
};

/* ══════════════════════════════════════════
   HELPER FUNCTIONS
══════════════════════════════════════════ */

/** Get element by id */
const $ = id => document.getElementById(id);

/** Show element (remove hidden class) */
const show = id => $(id).classList.remove('hidden');

/** Hide element (add hidden class) */
const hide = id => $(id).classList.add('hidden');

/** Format ISO date to readable date */
const fmt = iso => {
  if (!iso) return 'N/A';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return 'N/A'; }
};

/** Format ISO date to readable date + time */
const fmtTime = iso => {
  if (!iso) return 'N/A';
  try {
    return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return 'N/A'; }
};

/** Get today's date as YYYY-MM-DD */
const today = () => new Date().toISOString().slice(0, 10);

/* ══════════════════════════════════════════
   AUTH FUNCTIONS
══════════════════════════════════════════ */

/** Boot the app — check for existing session */
async function init() {
  const { data: { session } } = await db.auth.getSession();
  if (session?.user) {
    await onSignIn(session.user);
  } else {
    hide('loading-screen');
    show('auth-page');
  }

  // Listen for auth state changes (e.g. after Google redirect)
  db.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user && !currentUser) {
      await onSignIn(session.user);
    } else if (!session) {
      currentUser = null;
      currentProfile = null;
      hide('app');
      hide('reg-page');
      show('auth-page');
    }
  });
}

/** Called after successful Google sign-in */
async function onSignIn(user) {
  currentUser = user;

  // Fetch existing profile or create a new one
  let { data: profile } = await db.from('users').select('*').eq('uid', user.id).single();

  if (!profile) {
    const isAdmin = user.email === ADMIN_EMAIL;
    const newProfile = {
      uid:        user.id,
      name:       user.user_metadata?.full_name || user.email,
      email:      user.email,
      role:       isAdmin ? 'admin' : 'student',
      created_at: new Date().toISOString(),
    };
    const { data } = await db.from('users').insert(newProfile).select().single();
    profile = data;
  }

  currentProfile = profile;
  hide('loading-screen');
  hide('auth-page');

  // Student must complete registration before accessing dashboard
  if (profile.role === 'student' && !profile.registration_completed) {
    show('reg-page');
    return;
  }

  launchApp();
}

/** Sign out */
async function logout() {
  await db.auth.signOut();
  location.reload();
}

/** Google OAuth sign-in button */
$('google-login-btn').onclick = async () => {
  $('google-btn-text').textContent = 'Connecting...';
  $('google-login-btn').disabled = true;
  await db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href },
  });
};

/* ══════════════════════════════════════════
   APP LAUNCH
══════════════════════════════════════════ */

function launchApp() {
  show('app');
  $('nav-user-name').textContent = currentProfile.name;

  const roleEl = $('nav-user-role');
  if (currentProfile.role === 'admin') {
    roleEl.textContent = 'Admin';
    roleEl.className   = 'badge badge-indigo';
    show('admin-dashboard');
    loadAdminData();
  } else {
    roleEl.textContent = 'Student';
    roleEl.className   = 'badge badge-green';
    show('student-dashboard');
    loadStudentData();
  }
}

/* ══════════════════════════════════════════
   STUDENT DASHBOARD
══════════════════════════════════════════ */

async function loadStudentData() {
  const p = currentProfile;

  // Header
  $('student-welcome').textContent = `Welcome back, ${p.name}!`;

  // Seat & plan
  $('student-seat-num').textContent  = p.seat_number || 'N/A';
  $('student-plan-name').textContent = STUDY_PLANS[p.plan_id] || 'No plan selected';

  // Payment
  $('amount-due').textContent = '₹' + (p.amount_due || 0);

  // Subscription
  if (p.expiry_date) {
    const exp  = new Date(p.expiry_date);
    const diff = Math.max(0, Math.floor((exp - new Date()) / 86400000));
    $('days-remaining').textContent      = diff + ' Days';
    $('expiry-text').textContent         = 'Expiry: ' + fmt(p.expiry_date);
    $('subscription-progress').style.width = Math.min(100, (diff / 30) * 100) + '%';
  }

  const nextMonth    = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
  const daysToNext   = Math.floor((nextMonth - new Date()) / 86400000);
  $('days-next-month').textContent = daysToNext + ' Days';
  $('due-date-text').textContent   = 'Due by ' + nextMonth.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  // Today's attendance
  const { data: todayAttend } = await db
    .from('attendance')
    .select('*')
    .eq('uid', currentUser.id)
    .eq('date', today())
    .maybeSingle();

  updateAttendanceUI(!!todayAttend);

  // Notices
  const { data: notices } = await db.from('notices').select('*').order('created_at', { ascending: false });
  allNotices = notices || [];
  renderNoticeList('student-notices-list', false);

  // Realtime subscriptions
  db.channel('student-rt')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `uid=eq.${currentUser.id}` },
      async () => {
        const { data } = await db.from('attendance').select('*').eq('uid', currentUser.id).eq('date', today()).maybeSingle();
        updateAttendanceUI(!!data);
      })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: `uid=eq.${currentUser.id}` },
      async () => {
        const { data } = await db.from('users').select('*').eq('uid', currentUser.id).single();
        currentProfile = data;
        loadStudentData();
      })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notices' },
      async () => {
        const { data } = await db.from('notices').select('*').order('created_at', { ascending: false });
        allNotices = data || [];
        renderNoticeList('student-notices-list', false);
      })
    .subscribe();
}

/** Update the attendance button + status pill */
function updateAttendanceUI(marked) {
  const dot  = $('attend-status-dot');
  const text = $('attend-status-text');
  const btn  = $('mark-attend-btn');

  if (marked) {
    dot.className    = 'status-dot dot-green';
    text.textContent = 'Attendance Marked';
    btn.textContent  = '✅ Attendance Done';
    btn.disabled     = true;
    btn.style.cssText = 'background:#f0fdf4;color:#16a34a;cursor:default;width:100%;justify-content:center';
  } else {
    dot.className    = 'status-dot dot-amber';
    text.textContent = 'Attendance Pending';
    btn.innerHTML    = "Mark Today's Attendance";
    btn.disabled     = false;
    btn.className    = 'btn btn-primary w-full';
    btn.style.cssText = '';
  }
}

/** Mark attendance after verifying location */
async function markAttendance() {
  hide('student-location-error');
  try {
    const loc = await getLocation();
    if (!isAtLibrary(loc.lat, loc.lon)) {
      showLocationError('You must be at the library to mark attendance.');
      return;
    }
    await db.from('attendance').upsert({
      id:        `${currentUser.id}_${today()}`,
      uid:       currentUser.id,
      date:      today(),
      timestamp: new Date().toISOString(),
      status:    'present',
    });
  } catch (e) {
    showLocationError(e.message || 'Location error. Please allow location access.');
  }
}

function showLocationError(msg) {
  $('student-location-error').textContent = msg;
  show('student-location-error');
}

/** Get user's GPS coordinates */
function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      ()  => reject(new Error('Could not get location. Please allow location access.'))
    );
  });
}

/** Check if user is within library radius */
function isAtLibrary(lat, lon) {
  const R    = 6371;
  const dLat = (lat - LIBRARY_LAT) * Math.PI / 180;
  const dLon = (lon - LIBRARY_LON) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2
             + Math.cos(LIBRARY_LAT * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= LIBRARY_RADIUS_KM;
}

/* ── Payment Modal (Student) ─────────────────────────────────────────────── */

function showPaymentModal() {
  const amt = currentProfile.amount_due || 0;
  $('payment-modal-desc').textContent = `Pay ₹${amt} using any UPI app`;
  $('payment-qr').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=raunakdubey7891@ybl%26pn=Ved%20Library%26am=${amt}%26cu=INR`;
  $('payment-upi-link').href = `upi://pay?pa=raunakdubey7891@ybl&pn=Ved%20Library&am=${amt}&cu=INR`;
  $('utr-input').value = '';
  show('payment-modal');
}

async function submitPayment() {
  const utr = $('utr-input').value.trim();
  if (!utr) { alert('Please enter UTR / Transaction ID'); return; }

  const btn = $('submit-payment-btn');
  btn.textContent = 'Submitting...';
  btn.disabled    = true;

  await db.from('payments').insert({
    uid:            currentUser.id,
    amount:         currentProfile.amount_due || 0,
    transaction_id: utr,
    status:         'pending',
    timestamp:      new Date().toISOString(),
  });

  closeModal('payment-modal');
  btn.textContent = 'Submit Payment Details';
  btn.disabled    = false;
  alert('Payment request submitted! Admin will verify it soon.');
}

/* ══════════════════════════════════════════
   ADMIN DASHBOARD
══════════════════════════════════════════ */

async function loadAdminData() {
  await Promise.all([
    fetchStudents(),
    fetchSeats(),
    fetchPayments(),
    fetchAttendance(),
    fetchNotices(),
  ]);
  renderAll();

  // Realtime — refresh on any table change
  db.channel('admin-rt')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'users' },
      async () => { await fetchStudents(); renderAll(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'seats' },
      async () => { await fetchSeats(); renderAll(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' },
      async () => { await fetchPayments(); renderAll(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' },
      async () => { await fetchAttendance(); renderAll(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notices' },
      async () => { await fetchNotices(); renderAll(); })
    .subscribe();
}

/* ── Data fetchers ────────────────────────────────────────────────────────── */
async function fetchStudents()  {
  const { data } = await db.from('users').select('*').eq('role', 'student');
  allStudents = data || [];
}
async function fetchSeats() {
  const { data } = await db.from('seats').select('*').order('number');
  allSeats = data || [];
}
async function fetchPayments() {
  const { data } = await db.from('payments').select('*').order('timestamp', { ascending: false });
  allPayments = data || [];
}
async function fetchAttendance() {
  const { data } = await db.from('attendance').select('*').order('timestamp', { ascending: false });
  allAttendance = data || [];
}
async function fetchNotices() {
  const { data } = await db.from('notices').select('*').order('created_at', { ascending: false });
  allNotices = data || [];
}

/** Re-render all admin sections */
function renderAll() {
  renderStudentTable();
  renderSeats();
  renderPayments();
  renderAttendanceList();
  renderNoticeList('admin-notices-list', true);
  renderStats();
}

/* ── Render: Students table ──────────────────────────────────────────────── */
function renderStudentTable() {
  const q      = ($('student-search')?.value || '').toLowerCase();
  const filtered = allStudents.filter(s =>
    !q ||
    s.name?.toLowerCase().includes(q) ||
    s.email?.toLowerCase().includes(q) ||
    s.seat_number?.toLowerCase().includes(q)
  );
  const tbody = $('students-tbody');

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px;font-style:italic">No students found.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(s => `
    <tr>
      <td>
        <div style="font-weight:700">${s.name}</div>
        <div style="font-size:12px;color:#94a3b8">${s.email}</div>
      </td>
      <td><span class="badge badge-indigo">${s.seat_number || 'Unassigned'}</span></td>
      <td style="font-size:13px;color:#64748b">${STUDY_PLANS[s.plan_id] || 'None'}</td>
      <td style="font-size:13px;color:#64748b">${fmt(s.expiry_date)}</td>
      <td style="font-weight:700">₹${s.amount_due || 0}</td>
      <td class="text-right">
        <button class="btn btn-ghost btn-sm btn-icon" title="Download Docs" onclick="downloadStudentDocs('${s.uid}')">📥</button>
        <button class="btn btn-ghost btn-sm btn-icon" title="Edit" onclick="openEditModal('${s.uid}')" style="margin-left:4px">✏️</button>
      </td>
    </tr>
  `).join('');
}

/* ── Render: Seats grid ──────────────────────────────────────────────────── */
function renderSeats() {
  const filter   = $('seat-filter')?.value || 'all';
  const filtered = allSeats.filter(s => filter === 'all' || s.status === filter);
  const grid     = $('seats-grid');

  if (!filtered.length) {
    grid.innerHTML = '<div style="color:#94a3b8;font-style:italic;padding:16px">No seats found.</div>';
    return;
  }

  grid.innerHTML = filtered.map(seat => {
    const student       = allStudents.find(s => s.uid === seat.occupied_by);
    const isOcc         = seat.status === 'occupied';
    const studentOptions = allStudents
      .filter(s => !s.seat_number)
      .map(s => `<option value="${s.uid}">${s.name}</option>`)
      .join('');

    return `
      <div class="seat-card ${isOcc ? 'seat-occupied' : 'seat-available'}">
        <div class="seat-card-header">
          <span class="seat-num ${isOcc ? 'seat-num-occupied' : 'seat-num-available'}">${seat.number}</span>
          <div class="seat-card-actions">
            <button class="btn btn-icon ${isOcc ? 'btn-reject' : 'btn-verify'}"
              title="${isOcc ? 'Free seat' : 'Mark occupied'}"
              onclick="toggleSeat('${seat.id}','${seat.status}','${seat.occupied_by || ''}')">
              ${isOcc ? '✕' : '✓'}
            </button>
            <button class="btn btn-icon" style="background:#f1f5f9;color:#94a3b8"
              onclick="removeSeat('${seat.id}')" title="Delete">🗑</button>
          </div>
        </div>
        ${isOcc
          ? `<div class="seat-student-name">${student?.name || 'Assigned'}</div>
             <div class="seat-plan-label">${seat.plan_type || 'No Plan'}</div>`
          : `<select class="seat-assign-select" onchange="assignSeat('${seat.id}', this.value)">
               <option value="" disabled selected>Assign Student</option>
               ${studentOptions}
             </select>`
        }
      </div>
    `;
  }).join('');
}

/* ── Render: Payments ────────────────────────────────────────────────────── */
function renderPayments() {
  const pending = allPayments.filter(p => p.status === 'pending');
  const el      = $('payments-list');

  if (!pending.length) {
    el.innerHTML = '<div class="empty-text">No pending requests.</div>';
    return;
  }

  el.innerHTML = pending.map(p => {
    const s = allStudents.find(x => x.uid === p.uid);
    return `
      <div class="payment-item">
        <div class="payment-item-left">
          <div class="payment-avatar">${(s?.name || '?').charAt(0)}</div>
          <div>
            <div class="payment-name">${s?.name || 'Unknown'}</div>
            <div class="payment-meta">UTR: ${p.transaction_id} · ₹${p.amount}</div>
          </div>
        </div>
        <div class="payment-item-actions">
          <button class="btn btn-verify btn-sm" onclick="verifyPayment('${p.id}','verified','${p.uid}')">✓ Verify</button>
          <button class="btn btn-reject  btn-sm" onclick="verifyPayment('${p.id}','rejected','${p.uid}')">✕ Reject</button>
        </div>
      </div>
    `;
  }).join('');
}

/* ── Render: Attendance list ─────────────────────────────────────────────── */
function renderAttendanceList() {
  const el = $('attendance-list');

  if (!allAttendance.length) {
    el.innerHTML = '<div class="empty-text">No records yet.</div>';
    return;
  }

  el.innerHTML = allAttendance.map(a => {
    const s = allStudents.find(x => x.uid === a.uid);
    return `
      <div class="attend-item">
        <div class="attend-avatar">${(s?.name || '?').charAt(0)}</div>
        <div style="flex:1">
          <div class="attend-name">${s?.name || 'Unknown'}</div>
          <div class="attend-time">${fmtTime(a.timestamp)}</div>
        </div>
        <span class="attend-check">✓</span>
      </div>
    `;
  }).join('');
}

/* ── Render: Notices ─────────────────────────────────────────────────────── */
function renderNoticeList(elId, isAdmin) {
  const el = $(elId);

  if (!allNotices.length) {
    el.innerHTML = '<div class="empty-text">No notices at the moment.</div>';
    return;
  }

  el.innerHTML = allNotices.map(n => `
    <div class="notice-card">
      <div class="notice-card-header">
        <div class="notice-title">${n.title}</div>
        <span class="notice-date">${fmtTime(n.created_at)}</span>
      </div>
      <div class="notice-body">${n.content}</div>
      ${isAdmin ? `<button class="notice-delete" onclick="deleteNotice('${n.id}')" title="Delete">🗑</button>` : ''}
    </div>
  `).join('');
}

/* ── Render: Stats ───────────────────────────────────────────────────────── */
function renderStats() {
  $('stat-students').textContent  = allStudents.length;
  $('stat-today').textContent     = new Set(allAttendance.filter(a => a.date === today()).map(a => a.uid)).size;
  $('stat-occupied').textContent  = allSeats.filter(s => s.status === 'occupied').length;
  $('stat-available').textContent = allSeats.filter(s => s.status === 'available').length;
}

/* ══════════════════════════════════════════
   ADMIN ACTIONS
══════════════════════════════════════════ */

/** Verify or reject a payment */
async function verifyPayment(id, status, uid) {
  await db.from('payments').update({ status }).eq('id', id);
  if (status === 'verified') {
    await db.from('users').update({ amount_due: 0 }).eq('uid', uid);
  }
}

/** Open edit modal for a student */
function openEditModal(uid) {
  const s = allStudents.find(x => x.uid === uid);
  if (!s) return;

  $('edit-uid').value          = uid;
  $('edit-name').value         = s.name;
  $('edit-phone').value        = s.phone || '';
  $('edit-aadhaar-view').value = s.aadhaar_number || '';
  $('edit-seat').value         = s.seat_number || '';
  $('edit-plan').value         = s.plan_id || '';
  $('edit-expiry').value       = s.expiry_date ? s.expiry_date.slice(0, 10) : '';
  $('edit-amount-due').value   = s.amount_due || 0;

  show('edit-student-modal');
}

/** Save edits to a student */
async function saveStudentEdit() {
  const uid = $('edit-uid').value;
  await db.from('users').update({
    seat_number: $('edit-seat').value,
    plan_id:     $('edit-plan').value,
    expiry_date: $('edit-expiry').value || null,
    amount_due:  parseInt($('edit-amount-due').value) || 0,
  }).eq('uid', uid);
  closeModal('edit-student-modal');
}

/** Show add seat modal */
function showAddSeatModal() {
  $('new-seat-num').value = '';
  show('add-seat-modal');
}

/** Add a new seat */
async function addSeat() {
  const num = $('new-seat-num').value.trim();
  if (!num) return;
  await db.from('seats').insert({ id: `seat_${num}`, number: num, status: 'available' });
  closeModal('add-seat-modal');
}

/** Toggle seat between available/occupied */
async function toggleSeat(id, currentStatus, occupiedBy) {
  const newStatus = currentStatus === 'available' ? 'occupied' : 'available';
  await db.from('seats').update({
    status:      newStatus,
    occupied_by: newStatus === 'available' ? null : occupiedBy,
  }).eq('id', id);
}

/** Assign a seat to a student */
async function assignSeat(seatId, studentUid) {
  const student = allStudents.find(s => s.uid === studentUid);
  const seat    = allSeats.find(s => s.id === seatId);
  if (!student || !seat) return;

  // Update seat
  await db.from('seats').update({
    status:      'occupied',
    occupied_by: studentUid,
    plan_type:   STUDY_PLANS[student.plan_id] || 'N/A',
  }).eq('id', seatId);

  // Update student
  await db.from('users').update({ seat_number: seat.number }).eq('uid', studentUid);

  // Free student's previous seat if any
  const prevSeat = allSeats.find(s => s.number === student.seat_number && s.id !== seatId);
  if (prevSeat) {
    await db.from('seats').update({ status: 'available', occupied_by: null, plan_type: null }).eq('id', prevSeat.id);
  }
}

/** Remove a seat */
async function removeSeat(id) {
  if (!confirm('Delete this seat?')) return;
  await db.from('seats').delete().eq('id', id);
}

/** Show add notice modal */
function showAddNoticeModal() {
  $('notice-title-input').value   = '';
  $('notice-content-input').value = '';
  show('add-notice-modal');
}

/** Post a new notice */
async function addNotice() {
  const title   = $('notice-title-input').value.trim();
  const content = $('notice-content-input').value.trim();
  if (!title || !content) return;

  await db.from('notices').insert({
    title,
    content,
    created_at: new Date().toISOString(),
    author_id:  currentUser.id,
  });
  closeModal('add-notice-modal');
}

/** Delete a notice */
async function deleteNotice(id) {
  if (!confirm('Delete this notice?')) return;
  await db.from('notices').delete().eq('id', id);
}

/* ── Admin tab switching ──────────────────────────────────────────────────── */
function switchTab(event, tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  $('tab-' + tab).classList.add('active');
  event.target.classList.add('active');
}

/* ── CSV / Download exports ───────────────────────────────────────────────── */
function exportCSV(type) {
  let rows = [];

  if (type === 'students') {
    rows = [
      ['Name', 'Email', 'Phone', 'Aadhaar', 'Seat', 'Plan', 'Expiry', 'Due'],
      ...allStudents.map(s => [
        s.name, s.email, s.phone || '', s.aadhaar_number || '',
        s.seat_number || '', STUDY_PLANS[s.plan_id] || '', s.expiry_date || '', s.amount_due || 0,
      ]),
    ];
  } else {
    rows = [
      ['Student', 'Date', 'Time', 'Status'],
      ...allAttendance.map(a => {
        const s = allStudents.find(x => x.uid === a.uid);
        return [s?.name || 'Unknown', a.date, a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : '', a.status];
      }),
    ];
  }

  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const a   = document.createElement('a');
  a.href    = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = `${type}_${today()}.csv`;
  a.click();
}

/** Download a single student's documents */
async function downloadStudentDocs(uid) {
  const s = allStudents.find(x => x.uid === uid);
  if (!s?.photo_url && !s?.aadhaar_photo_url) {
    alert('No documents for this student.');
    return;
  }
  if (s.photo_url)        downloadBase64(s.photo_url,        `${s.name}_photo.png`);
  if (s.aadhaar_photo_url) downloadBase64(s.aadhaar_photo_url, `${s.name}_aadhaar.png`);
}

/** Download all students' documents */
async function downloadAllDocs() {
  let count = 0;
  allStudents.forEach(s => {
    if (s.photo_url)         { downloadBase64(s.photo_url,         `${s.name}_photo.png`);   count++; }
    if (s.aadhaar_photo_url) { downloadBase64(s.aadhaar_photo_url, `${s.name}_aadhaar.png`); count++; }
  });
  if (!count) alert('No documents found.');
}

/** Trigger a base64 file download */
function downloadBase64(dataUrl, filename) {
  const a   = document.createElement('a');
  a.href    = dataUrl;
  a.download = filename;
  a.click();
}

/* ══════════════════════════════════════════
   REGISTRATION
══════════════════════════════════════════ */

/** Handle photo/aadhaar file upload */
function handleFileUpload(input, type) {
  const file = input.files[0];
  if (!file) return;

  if (file.size > 300 * 1024) {
    alert('File too large. Maximum size is 300KB.');
    return;
  }

  const reader = new FileReader();
  reader.onloadend = () => {
    const b64 = reader.result;

    if (type === 'photo') {
      photoBase64 = b64;
      $('photo-preview').src = b64;
      show('photo-preview');
      hide('photo-placeholder');
      show('remove-photo');
      $('photo-upload-area').classList.add('has-file');
    } else {
      aadhaarBase64 = b64;
      $('aadhaar-preview').src = b64;
      show('aadhaar-preview');
      hide('aadhaar-placeholder');
      show('remove-aadhaar');
      $('aadhaar-upload-area').classList.add('has-file');
    }
  };
  reader.readAsDataURL(file);
}

/** Remove uploaded photo */
function removeFile(e, type) {
  e.stopPropagation();

  if (type === 'photo') {
    photoBase64 = null;
    $('photo-input').value = '';
    hide('photo-preview');
    show('photo-placeholder');
    hide('remove-photo');
    $('photo-upload-area').classList.remove('has-file');
  } else {
    aadhaarBase64 = null;
    $('aadhaar-input').value = '';
    hide('aadhaar-preview');
    show('aadhaar-placeholder');
    hide('remove-aadhaar');
    $('aadhaar-upload-area').classList.remove('has-file');
  }
}

/** Submit registration form */
async function submitRegistration() {
  hide('reg-error');

  const phone   = $('reg-phone').value.replace(/\s/g, '');
  const aadhaar = $('reg-aadhaar').value.replace(/\s/g, '');
  const agreed  = $('reg-agree').checked;

  // Validation
  if (!phone || !aadhaar || !agreed || !photoBase64 || !aadhaarBase64) {
    showRegError('Please fill all fields, upload both photos, and agree to rules.');
    return;
  }
  if (phone.length < 10 || phone.length > 15) {
    showRegError('Enter a valid phone number (10–15 digits).');
    return;
  }
  if (aadhaar.length !== 12 || !/^\d+$/.test(aadhaar)) {
    showRegError('Enter a valid 12-digit Aadhaar number.');
    return;
  }

  const btn = $('reg-submit-btn');
  btn.textContent = 'Completing Registration...';
  btn.disabled    = true;

  try {
    const { error } = await db.from('users').update({
      phone,
      aadhaar_number:          aadhaar,
      registration_completed:  true,
      agreed_to_rules:         true,
      photo_url:               photoBase64,
      aadhaar_photo_url:       aadhaarBase64,
    }).eq('uid', currentUser.id);

    if (error) throw error;

    const { data } = await db.from('users').select('*').eq('uid', currentUser.id).single();
    currentProfile = data;
    hide('reg-page');
    launchApp();
  } catch (err) {
    showRegError(err.message || 'Registration failed. Please try again.');
  } finally {
    btn.textContent = 'Complete Registration';
    btn.disabled    = false;
  }
}

function showRegError(msg) {
  $('reg-error').textContent = msg;
  show('reg-error');
}

/* ══════════════════════════════════════════
   MODAL HELPERS
══════════════════════════════════════════ */

function closeModal(id) {
  hide(id);
}

// Close modal when clicking the dark overlay background
document.querySelectorAll('.overlay').forEach(el => {
  el.addEventListener('click', e => {
    if (e.target === el) hide(el.id);
  });
});

/* ══════════════════════════════════════════
   BOOT
══════════════════════════════════════════ */
init();
