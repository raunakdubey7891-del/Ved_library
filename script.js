/* ════════════════════════════════════════════
   VED LIBRARY — script.js
   ════════════════════════════════════════════ */

/* ── Config ──────────────────────────────────────────────────────────────── */
const SUPABASE_URL      = 'https://dmolzoagnzjwtrdroqeg.supabase.co';
const SUPABASE_ANON     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtb2x6b2Fnbnpqd3RyZHJvcWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODUxODEsImV4cCI6MjA5MDg2MTE4MX0.5Culb-inMvITeplysy6_BJJXngd_SPMWG13_hT0GV5w';
const ADMIN_EMAIL       = 'raunakdubey7891@gmail.com';
const LIBRARY_LAT       = 28.6139;
const LIBRARY_LON       = 77.2090;
const LIBRARY_RADIUS_KM = 0.5;

/* ── Supabase client ─────────────────────────────────────────────────────── */
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

/* ── State ───────────────────────────────────────────────────────────────── */
let currentUser    = null;
let currentProfile = null;
let allStudents    = [];
let allSeats       = [];
let allPayments    = [];
let allAttendance  = [];
let allNotices     = [];
let photoBase64    = null;
let aadhaarBase64  = null;

/* ── Constants ───────────────────────────────────────────────────────────── */
const STUDY_PLANS = {
  full_time: 'Full Time (12 Hours)',
  shift_a:   'Shift A (4 Hours)',
  shift_b:   'Shift B (4 Hours)',
  custom:    'Custom Shift',
};
const PLAN_PRICES = { full_time: 1200, shift_a: 500, shift_b: 500, custom: 800 };

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const $       = id  => document.getElementById(id);
const show    = id  => $(id).classList.remove('hidden');
const hide    = id  => $(id).classList.add('hidden');
const fmt     = iso => { if (!iso) return 'N/A'; try { return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }); } catch { return 'N/A'; } };
const fmtTime = iso => { if (!iso) return 'N/A'; try { return new Date(iso).toLocaleString('en-IN',   { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }); } catch { return 'N/A'; } };
const today   = ()  => new Date().toISOString().slice(0, 10);

/* Add 30 days to a date string, returns ISO string */
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/* ══════════════════════════════════════════
   AUTH
══════════════════════════════════════════ */
async function init() {
  const { data: { session } } = await db.auth.getSession();
  if (session?.user) {
    await onSignIn(session.user);
  } else {
    hide('loading-screen');
    show('auth-page');
  }
  db.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user && !currentUser) {
      await onSignIn(session.user);
    } else if (!session) {
      currentUser = null; currentProfile = null;
      hide('app'); hide('reg-page'); show('auth-page');
    }
  });
}

async function onSignIn(user) {
  currentUser = user;
  let { data: profile } = await db.from('users').select('*').eq('uid', user.id).single();
  if (!profile) {
    const isAdmin = user.email === ADMIN_EMAIL;
    const np = { uid: user.id, name: user.user_metadata?.full_name || user.email, email: user.email, role: isAdmin ? 'admin' : 'student', created_at: new Date().toISOString() };
    const { data } = await db.from('users').insert(np).select().single();
    profile = data;
  }
  currentProfile = profile;
  hide('loading-screen'); hide('auth-page');
  if (profile.role === 'student' && !profile.registration_completed) { show('reg-page'); return; }
  launchApp();
}

async function logout() { await db.auth.signOut(); location.reload(); }

$('google-login-btn').onclick = async () => {
  $('google-btn-text').textContent = 'Connecting...';
  $('google-login-btn').disabled = true;
  await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });
};

/* ══════════════════════════════════════════
   APP LAUNCH
══════════════════════════════════════════ */
function launchApp() {
  show('app');
  $('nav-user-name').textContent = currentProfile.name;
  const roleEl = $('nav-user-role');
  if (currentProfile.role === 'admin') {
    roleEl.textContent = 'Admin'; roleEl.className = 'badge badge-indigo';
    show('admin-dashboard'); loadAdminData();
  } else {
    roleEl.textContent = 'Student'; roleEl.className = 'badge badge-green';
    show('student-dashboard'); loadStudentData();
  }
}

/* ══════════════════════════════════════════
   STUDENT DASHBOARD
══════════════════════════════════════════ */
async function loadStudentData() {
  const p = currentProfile;
  $('student-welcome').textContent  = `Welcome back, ${p.name}!`;
  $('student-seat-num').textContent = p.seat_number || 'N/A';
  $('student-plan-name').textContent= STUDY_PLANS[p.plan_id] || 'No plan selected';
  $('amount-due').textContent       = '₹' + (p.amount_due || 0);

  if (p.expiry_date) {
    const exp  = new Date(p.expiry_date);
    const diff = Math.max(0, Math.floor((exp - new Date()) / 86400000));
    $('days-remaining').textContent        = diff + ' Days';
    $('expiry-text').textContent           = 'Expiry: ' + fmt(p.expiry_date);
    $('subscription-progress').style.width = Math.min(100, (diff / 30) * 100) + '%';
  } else {
    $('days-remaining').textContent = '0 Days';
    $('expiry-text').textContent    = 'Expiry: Not set';
    $('subscription-progress').style.width = '0%';
  }

  // Due date = expiry date (set by admin based on session start + 30 days)
  if (p.expiry_date) {
    $('due-date-text').textContent = 'Due by ' + fmt(p.expiry_date);
  } else {
    $('due-date-text').textContent = 'Contact admin to set your session';
  }

  const { data: todayAttend } = await db.from('attendance').select('*').eq('uid', currentUser.id).eq('date', today()).maybeSingle();
  updateAttendanceUI(!!todayAttend);

  const { data: notices } = await db.from('notices').select('*').order('created_at', { ascending: false });
  allNotices = notices || [];
  renderNoticeList('student-notices-list', false);

  db.channel('student-rt')
    .on('postgres_changes', { event:'*', schema:'public', table:'attendance', filter:`uid=eq.${currentUser.id}` }, async () => {
      const { data } = await db.from('attendance').select('*').eq('uid', currentUser.id).eq('date', today()).maybeSingle();
      updateAttendanceUI(!!data);
    })
    .on('postgres_changes', { event:'*', schema:'public', table:'users', filter:`uid=eq.${currentUser.id}` }, async () => {
      const { data } = await db.from('users').select('*').eq('uid', currentUser.id).single();
      currentProfile = data; loadStudentData();
    })
    .on('postgres_changes', { event:'*', schema:'public', table:'notices' }, async () => {
      const { data } = await db.from('notices').select('*').order('created_at', { ascending: false });
      allNotices = data || []; renderNoticeList('student-notices-list', false);
    })
    .subscribe();
}

function updateAttendanceUI(marked) {
  const dot = $('attend-status-dot'), text = $('attend-status-text'), btn = $('mark-attend-btn');
  if (marked) {
    dot.className = 'status-dot dot-green'; text.textContent = 'Attendance Marked';
    btn.textContent = '✅ Attendance Done'; btn.disabled = true;
    btn.style.cssText = 'background:#f0fdf4;color:#16a34a;cursor:default;width:100%;justify-content:center;padding:10px 20px;border-radius:12px;font-weight:700;display:flex;align-items:center;border:none';
  } else {
    dot.className = 'status-dot dot-amber'; text.textContent = 'Attendance Pending';
    btn.textContent = "Mark Today's Attendance"; btn.disabled = false;
    btn.className = 'btn btn-primary w-full'; btn.style.cssText = '';
  }
}

async function markAttendance() {
  hide('student-location-error');
  try {
    const loc = await getLocation();
    if (!isAtLibrary(loc.lat, loc.lon)) { showLocationError('You must be at the library to mark attendance.'); return; }
    await db.from('attendance').upsert({ id: `${currentUser.id}_${today()}`, uid: currentUser.id, date: today(), timestamp: new Date().toISOString(), status: 'present' });
  } catch (e) { showLocationError(e.message || 'Location error. Please allow location access.'); }
}
function showLocationError(msg) { $('student-location-error').textContent = msg; show('student-location-error'); }
function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported.')); return; }
    navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }), () => reject(new Error('Could not get location. Please allow location access.')));
  });
}
function isAtLibrary(lat, lon) {
  const R = 6371, dLat = (lat - LIBRARY_LAT) * Math.PI/180, dLon = (lon - LIBRARY_LON) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(LIBRARY_LAT*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) <= LIBRARY_RADIUS_KM;
}

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
  btn.textContent = 'Submitting...'; btn.disabled = true;
  await db.from('payments').insert({ uid: currentUser.id, amount: currentProfile.amount_due || 0, transaction_id: utr, status: 'pending', timestamp: new Date().toISOString() });
  closeModal('payment-modal');
  btn.textContent = 'Submit Payment Details'; btn.disabled = false;
  alert('Payment request submitted! Admin will verify it soon.');
}

/* ══════════════════════════════════════════
   ADMIN DASHBOARD
══════════════════════════════════════════ */
async function loadAdminData() {
  await Promise.all([fetchStudents(), fetchSeats(), fetchPayments(), fetchAttendance(), fetchNotices()]);
  renderAll();
  db.channel('admin-rt')
    .on('postgres_changes', { event:'*', schema:'public', table:'users'      }, async () => { await fetchStudents();   renderAll(); })
    .on('postgres_changes', { event:'*', schema:'public', table:'seats'      }, async () => { await fetchSeats();      renderAll(); })
    .on('postgres_changes', { event:'*', schema:'public', table:'payments'   }, async () => { await fetchPayments();   renderAll(); })
    .on('postgres_changes', { event:'*', schema:'public', table:'attendance' }, async () => { await fetchAttendance(); renderAll(); })
    .on('postgres_changes', { event:'*', schema:'public', table:'notices'    }, async () => { await fetchNotices();    renderAll(); })
    .subscribe();
}

async function fetchStudents()  { const { data } = await db.from('users').select('*').eq('role','student').order('name'); allStudents  = data||[]; }
async function fetchSeats()     { const { data } = await db.from('seats').select('*').order('number');                   allSeats     = data||[]; }
async function fetchPayments()  { const { data } = await db.from('payments').select('*').order('timestamp',{ascending:false}); allPayments = data||[]; }
async function fetchAttendance(){ const { data } = await db.from('attendance').select('*').order('timestamp',{ascending:false}); allAttendance= data||[]; }
async function fetchNotices()   { const { data } = await db.from('notices').select('*').order('created_at',{ascending:false}); allNotices  = data||[]; }

function renderAll() {
  renderStudentTable();
  renderSeats();
  renderPayments();
  renderAttendanceList();
  renderNoticeList('admin-notices-list', true);
  renderStats();
}

/* ── Students table ──────────────────────────────────────────────────────── */
function renderStudentTable() {
  const q = ($('student-search')?.value || '').toLowerCase();
  const filtered = allStudents.filter(s => !q || s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.seat_number?.toLowerCase().includes(q));
  const tbody = $('students-tbody');
  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:24px;font-style:italic">No students found.</td></tr>'; return; }
  tbody.innerHTML = filtered.map(s => {
    const isExpired = s.expiry_date && new Date(s.expiry_date) < new Date();
    const expiryClass = isExpired ? 'color:#dc2626;font-weight:700' : 'color:#64748b';
    return `
    <tr>
      <td>
        <div style="font-weight:700">${s.name}</div>
        <div style="font-size:12px;color:#94a3b8">${s.email}</div>
      </td>
      <td><span class="badge badge-indigo">${s.seat_number || 'Unassigned'}</span></td>
      <td style="font-size:13px;color:#64748b">${STUDY_PLANS[s.plan_id] || 'None'}</td>
      <td style="font-size:13px;${expiryClass}">${fmt(s.expiry_date)}${isExpired ? ' ⚠️' : ''}</td>
      <td style="font-weight:700;color:${s.amount_due > 0 ? '#dc2626' : '#16a34a'}">₹${s.amount_due || 0}</td>
      <td style="font-size:12px;color:#94a3b8">${s.session_start ? fmt(s.session_start) : 'Not set'}</td>
      <td class="text-right">
        <button class="btn btn-ghost btn-sm btn-icon" title="Download Docs" onclick="downloadStudentDocs('${s.uid}')">📥</button>
        <button class="btn btn-ghost btn-sm btn-icon" title="Edit" onclick="openEditModal('${s.uid}')" style="margin-left:4px">✏️</button>
      </td>
    </tr>`;
  }).join('');
}

/* ── Seats ───────────────────────────────────────────────────────────────── */
function renderSeats() {
  const filter = $('seat-filter')?.value || 'all';
  const filtered = allSeats.filter(s => filter === 'all' || s.status === filter);
  const grid = $('seats-grid');
  if (!filtered.length) { grid.innerHTML = '<div style="color:#94a3b8;font-style:italic;padding:16px">No seats found.</div>'; return; }
  grid.innerHTML = filtered.map(seat => {
    const student = allStudents.find(s => s.uid === seat.occupied_by);
    const isOcc   = seat.status === 'occupied';
    const opts    = allStudents.filter(s => !s.seat_number).map(s => `<option value="${s.uid}">${s.name}</option>`).join('');
    return `
      <div class="seat-card ${isOcc ? 'seat-occupied' : 'seat-available'}">
        <div class="seat-card-header">
          <span class="seat-num ${isOcc ? 'seat-num-occupied' : 'seat-num-available'}">${seat.number}</span>
          <div class="seat-card-actions">
            <button class="btn btn-icon ${isOcc ? 'btn-reject' : 'btn-verify'}" title="${isOcc?'Free seat':'Mark occupied'}" onclick="toggleSeat('${seat.id}','${seat.status}','${seat.occupied_by||''}')">${isOcc?'✕':'✓'}</button>
            <button class="btn btn-icon" style="background:#f1f5f9;color:#94a3b8" onclick="removeSeat('${seat.id}')" title="Delete">🗑</button>
          </div>
        </div>
        ${isOcc
          ? `<div class="seat-student-name">${student?.name||'Assigned'}</div><div class="seat-plan-label">${seat.plan_type||'No Plan'}</div>`
          : `<select class="seat-assign-select" onchange="assignSeat('${seat.id}',this.value)"><option value="" disabled selected>Assign Student</option>${opts}</select>`}
      </div>`;
  }).join('');
}

/* ── Payments (pending + history) ────────────────────────────────────────── */
function renderPayments() {
  const pending  = allPayments.filter(p => p.status === 'pending');
  const history  = allPayments.filter(p => p.status !== 'pending');
  const el       = $('payments-list');

  const pendingHtml = pending.length
    ? pending.map(p => paymentItemHtml(p, true)).join('')
    : '<div class="empty-text">No pending requests.</div>';

  const historyHtml = history.length
    ? history.map(p => paymentItemHtml(p, false)).join('')
    : '<div class="empty-text">No payment history yet.</div>';

  el.innerHTML = `
    <div class="payment-section-title">⏳ Pending Requests</div>
    <div id="pending-payments">${pendingHtml}</div>
    <div class="payment-section-title" style="margin-top:24px">📋 Payment History</div>
    <div id="history-payments">${historyHtml}</div>`;
}

function paymentItemHtml(p, showActions) {
  const s = allStudents.find(x => x.uid === p.uid);
  const statusBadge = p.status === 'verified'
    ? '<span class="badge badge-green">✓ Verified</span>'
    : p.status === 'rejected'
    ? '<span class="badge badge-red">✕ Rejected</span>'
    : '<span class="badge badge-amber">⏳ Pending</span>';
  return `
    <div class="payment-item">
      <div class="payment-item-left">
        <div class="payment-avatar">${(s?.name||'?').charAt(0)}</div>
        <div>
          <div class="payment-name">${s?.name||'Unknown'}</div>
          <div class="payment-meta">UTR: ${p.transaction_id} · ₹${p.amount} · ${fmtTime(p.timestamp)}</div>
        </div>
      </div>
      <div class="payment-item-actions">
        ${showActions
          ? `<button class="btn btn-verify btn-sm" onclick="verifyPayment('${p.id}','verified','${p.uid}')">✓ Verify</button>
             <button class="btn btn-reject  btn-sm" onclick="verifyPayment('${p.id}','rejected','${p.uid}')">✕ Reject</button>`
          : statusBadge}
      </div>
    </div>`;
}

/* ── Attendance ───────────────────────────────────────────────────────────── */
function renderAttendanceList() {
  const el = $('attendance-list');
  if (!allAttendance.length) { el.innerHTML = '<div class="empty-text">No records yet.</div>'; return; }
  el.innerHTML = allAttendance.map(a => {
    const s = allStudents.find(x => x.uid === a.uid);
    return `
      <div class="attend-item">
        <div class="attend-avatar">${(s?.name||'?').charAt(0)}</div>
        <div style="flex:1"><div class="attend-name">${s?.name||'Unknown'}</div><div class="attend-time">${fmtTime(a.timestamp)}</div></div>
        <span class="attend-check">✓</span>
      </div>`;
  }).join('');
}

/* ── Notices ─────────────────────────────────────────────────────────────── */
function renderNoticeList(elId, isAdmin) {
  const el = $(elId);
  if (!allNotices.length) { el.innerHTML = '<div class="empty-text">No notices at the moment.</div>'; return; }
  el.innerHTML = allNotices.map(n => `
    <div class="notice-card">
      <div class="notice-card-header">
        <div class="notice-title">${n.title}</div>
        <span class="notice-date">${fmtTime(n.created_at)}</span>
      </div>
      <div class="notice-body">${n.content}</div>
      ${isAdmin ? `<button class="notice-delete" onclick="deleteNotice('${n.id}')" title="Delete">🗑</button>` : ''}
    </div>`).join('');
}

/* ── Stats ───────────────────────────────────────────────────────────────── */
function renderStats() {
  $('stat-students').textContent  = allStudents.length;
  $('stat-today').textContent     = new Set(allAttendance.filter(a => a.date === today()).map(a => a.uid)).size;
  $('stat-occupied').textContent  = allSeats.filter(s => s.status === 'occupied').length;
  $('stat-available').textContent = allSeats.filter(s => s.status === 'available').length;
  // Extra stats
  const el = $('stat-revenue');
  if (el) el.textContent = '₹' + allPayments.filter(p => p.status === 'verified').reduce((sum, p) => sum + p.amount, 0);
  const el2 = $('stat-pending-due');
  if (el2) el2.textContent = '₹' + allStudents.reduce((sum, s) => sum + (s.amount_due || 0), 0);
}

/* ══════════════════════════════════════════
   ADMIN ACTIONS
══════════════════════════════════════════ */

async function verifyPayment(id, status, uid) {
  await db.from('payments').update({ status }).eq('id', id);
  if (status === 'verified') await db.from('users').update({ amount_due: 0 }).eq('uid', uid);
}

/* ── Edit student modal ──────────────────────────────────────────────────── */
function openEditModal(uid) {
  const s = allStudents.find(x => x.uid === uid);
  if (!s) return;
  $('edit-uid').value          = uid;
  $('edit-name').value         = s.name;
  $('edit-phone').value        = s.phone || '';
  $('edit-aadhaar-view').value = s.aadhaar_number || '';
  $('edit-seat').value         = s.seat_number || '';
  $('edit-plan').value         = s.plan_id || '';
  $('edit-session-start').value= s.session_start ? s.session_start.slice(0,10) : '';
  $('edit-expiry').value       = s.expiry_date   ? s.expiry_date.slice(0,10)   : '';
  $('edit-amount-due').value   = s.amount_due || 0;
  show('edit-student-modal');
}

/* Auto-calculate expiry and amount due when session start is set */
$('edit-session-start').addEventListener('change', function () {
  const sessionDate = this.value;
  if (!sessionDate) return;
  // Expiry = session start + 30 days
  const expiry = new Date(sessionDate);
  expiry.setDate(expiry.getDate() + 30);
  $('edit-expiry').value = expiry.toISOString().slice(0, 10);
  // Amount due = price of selected plan
  const planId = $('edit-plan').value;
  if (planId && PLAN_PRICES[planId]) {
    $('edit-amount-due').value = PLAN_PRICES[planId];
  }
});

/* Also update amount due when plan changes */
$('edit-plan').addEventListener('change', function () {
  const sessionDate = $('edit-session-start').value;
  if (sessionDate && PLAN_PRICES[this.value]) {
    $('edit-amount-due').value = PLAN_PRICES[this.value];
  }
});

async function saveStudentEdit() {
  const uid          = $('edit-uid').value;
  const sessionStart = $('edit-session-start').value;
  const expiryDate   = $('edit-expiry').value;

  await db.from('users').update({
    seat_number:   $('edit-seat').value,
    plan_id:       $('edit-plan').value,
    session_start: sessionStart || null,
    expiry_date:   expiryDate   || null,
    amount_due:    parseInt($('edit-amount-due').value) || 0,
  }).eq('uid', uid);
  closeModal('edit-student-modal');
}

/* ── Seats ───────────────────────────────────────────────────────────────── */
function showAddSeatModal() { $('new-seat-num').value = ''; show('add-seat-modal'); }
async function addSeat() {
  const num = $('new-seat-num').value.trim();
  if (!num) return;
  await db.from('seats').insert({ id: `seat_${num}`, number: num, status: 'available' });
  closeModal('add-seat-modal');
}
async function toggleSeat(id, currentStatus, occupiedBy) {
  const newStatus = currentStatus === 'available' ? 'occupied' : 'available';
  await db.from('seats').update({ status: newStatus, occupied_by: newStatus === 'available' ? null : occupiedBy }).eq('id', id);
}
async function assignSeat(seatId, studentUid) {
  const student = allStudents.find(s => s.uid === studentUid);
  const seat    = allSeats.find(s => s.id === seatId);
  if (!student || !seat) return;
  await db.from('seats').update({ status: 'occupied', occupied_by: studentUid, plan_type: STUDY_PLANS[student.plan_id] || 'N/A' }).eq('id', seatId);
  await db.from('users').update({ seat_number: seat.number }).eq('uid', studentUid);
  const prevSeat = allSeats.find(s => s.number === student.seat_number && s.id !== seatId);
  if (prevSeat) await db.from('seats').update({ status: 'available', occupied_by: null, plan_type: null }).eq('id', prevSeat.id);
}
async function removeSeat(id) {
  if (!confirm('Delete this seat?')) return;
  await db.from('seats').delete().eq('id', id);
}

/* ── Notices ─────────────────────────────────────────────────────────────── */
function showAddNoticeModal() { $('notice-title-input').value = ''; $('notice-content-input').value = ''; show('add-notice-modal'); }
async function addNotice() {
  const title = $('notice-title-input').value.trim(), content = $('notice-content-input').value.trim();
  if (!title || !content) return;
  await db.from('notices').insert({ title, content, created_at: new Date().toISOString(), author_id: currentUser.id });
  closeModal('add-notice-modal');
}
async function deleteNotice(id) {
  if (!confirm('Delete this notice?')) return;
  await db.from('notices').delete().eq('id', id);
}

/* ── Tab switching ───────────────────────────────────────────────────────── */
function switchTab(event, tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  $('tab-' + tab).classList.add('active');
  event.target.classList.add('active');
}

/* ══════════════════════════════════════════
   EXPORTS & DOWNLOADS
══════════════════════════════════════════ */

/* ── CSV helper ──────────────────────────────────────────────────────────── */
function makeCSV(rows) {
  return rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
}
function downloadCSV(filename, rows) {
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(makeCSV(rows));
  a.download = filename; a.click();
}

/* ── Individual CSV exports ──────────────────────────────────────────────── */
function exportCSV(type) {
  if (type === 'students') {
    downloadCSV(`students_${today()}.csv`, [
      ['Name','Email','Phone','Aadhaar','Seat','Plan','Session Start','Expiry Date','Amount Due'],
      ...allStudents.map(s => [s.name, s.email, s.phone||'', s.aadhaar_number||'', s.seat_number||'', STUDY_PLANS[s.plan_id]||'', s.session_start ? fmt(s.session_start) : '', s.expiry_date ? fmt(s.expiry_date) : '', s.amount_due||0]),
    ]);
  } else if (type === 'attendance') {
    downloadCSV(`attendance_${today()}.csv`, [
      ['Student Name','Email','Date','Time','Status'],
      ...allAttendance.map(a => { const s = allStudents.find(x => x.uid === a.uid); return [s?.name||'Unknown', s?.email||'', a.date, a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : '', a.status]; }),
    ]);
  } else if (type === 'payments') {
    downloadCSV(`payments_${today()}.csv`, [
      ['Student Name','Email','Amount','UTR / Transaction ID','Status','Date & Time'],
      ...allPayments.map(p => { const s = allStudents.find(x => x.uid === p.uid); return [s?.name||'Unknown', s?.email||'', p.amount, p.transaction_id, p.status, fmtTime(p.timestamp)]; }),
    ]);
  }
}

/* ── Full data export (ZIP with all CSVs) ────────────────────────────────── */
async function exportAllData() {
  const btn = $('export-all-btn');
  btn.textContent = '⏳ Preparing export...'; btn.disabled = true;

  try {
    // Build ZIP content as multiple CSV files in one download
    // Since we can't use JSZip easily without npm, we'll download each CSV separately with a delay
    const exportDate = today();

    // 1. Students CSV
    downloadCSV(`VedLibrary_Export_${exportDate}/1_Students.csv`, [
      ['Name','Email','Phone','Aadhaar Number','Seat','Plan','Session Start','Expiry Date','Amount Due','Registration Completed','Joined On'],
      ...allStudents.map(s => [s.name, s.email, s.phone||'', s.aadhaar_number||'', s.seat_number||'', STUDY_PLANS[s.plan_id]||'', s.session_start ? fmt(s.session_start) : '', s.expiry_date ? fmt(s.expiry_date) : '', s.amount_due||0, s.registration_completed ? 'Yes' : 'No', fmt(s.created_at)]),
    ]);

    await delay(500);

    // 2. Payments CSV
    downloadCSV(`VedLibrary_Export_${exportDate}/2_Payments.csv`, [
      ['Student Name','Student Email','Amount (₹)','UTR / Transaction ID','Status','Submitted On'],
      ...allPayments.map(p => { const s = allStudents.find(x => x.uid === p.uid); return [s?.name||'Unknown', s?.email||'', p.amount, p.transaction_id, p.status, fmtTime(p.timestamp)]; }),
    ]);

    await delay(500);

    // 3. Attendance CSV
    downloadCSV(`VedLibrary_Export_${exportDate}/3_Attendance.csv`, [
      ['Student Name','Student Email','Date','Time','Status'],
      ...allAttendance.map(a => { const s = allStudents.find(x => x.uid === a.uid); return [s?.name||'Unknown', s?.email||'', a.date, a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : '', a.status]; }),
    ]);

    await delay(500);

    // 4. Seats CSV
    downloadCSV(`VedLibrary_Export_${exportDate}/4_Seats.csv`, [
      ['Seat Number','Status','Occupied By (Name)','Occupied By (Email)','Plan Type'],
      ...allSeats.map(seat => { const s = allStudents.find(x => x.uid === seat.occupied_by); return [seat.number, seat.status, s?.name||'', s?.email||'', seat.plan_type||'']; }),
    ]);

    await delay(500);

    // 5. Notices CSV
    downloadCSV(`VedLibrary_Export_${exportDate}/5_Notices.csv`, [
      ['Title','Content','Posted On','Posted By (Email)'],
      ...allNotices.map(n => { const admin = n.author_id; return [n.title, n.content, fmtTime(n.created_at), admin]; }),
    ]);

    await delay(500);

    // 6. Summary CSV
    const totalRevenue  = allPayments.filter(p => p.status === 'verified').reduce((sum,p) => sum + p.amount, 0);
    const totalPending  = allPayments.filter(p => p.status === 'pending').reduce((sum,p) => sum + p.amount, 0);
    const totalDue      = allStudents.reduce((sum,s) => sum + (s.amount_due||0), 0);
    downloadCSV(`VedLibrary_Export_${exportDate}/0_Summary.csv`, [
      ['Metric','Value'],
      ['Export Date', exportDate],
      ['Total Students', allStudents.length],
      ['Active Seats (Occupied)', allSeats.filter(s=>s.status==='occupied').length],
      ['Available Seats', allSeats.filter(s=>s.status==='available').length],
      ['Total Attendance Records', allAttendance.length],
      ['Students Present Today', new Set(allAttendance.filter(a=>a.date===today()).map(a=>a.uid)).size],
      ['Total Verified Revenue (₹)', totalRevenue],
      ['Pending Payment Requests (₹)', totalPending],
      ['Total Amount Due from Students (₹)', totalDue],
      ['Total Notices', allNotices.length],
      ['Total Payments Recorded', allPayments.length],
    ]);

    alert(`✅ Export complete!\n\n6 CSV files downloaded:\n• 0_Summary\n• 1_Students\n• 2_Payments\n• 3_Attendance\n• 4_Seats\n• 5_Notices\n\nAll files are prefixed with "VedLibrary_Export_${exportDate}" so they stay grouped together in your downloads folder.`);

  } catch (err) {
    alert('Export failed: ' + err.message);
  } finally {
    btn.textContent = '📦 Export All Data'; btn.disabled = false;
  }
}

const delay = ms => new Promise(res => setTimeout(res, ms));

/* ── Student documents download ──────────────────────────────────────────── */
async function downloadStudentDocs(uid) {
  const s = allStudents.find(x => x.uid === uid);
  if (!s?.photo_url && !s?.aadhaar_photo_url) { alert('No documents for this student.'); return; }
  const safeName = s.name.replace(/\s+/g, '_');
  if (s.photo_url)         downloadBase64(s.photo_url,         `VedLibrary_Docs/${safeName}/photo.png`);
  if (s.aadhaar_photo_url) {
    await delay(300);
    downloadBase64(s.aadhaar_photo_url, `VedLibrary_Docs/${safeName}/aadhaar.png`);
  }
}

/* ── Download all student documents ─────────────────────────────────────── */
async function downloadAllDocs() {
  const btn = $('download-docs-btn');
  btn.textContent = '⏳ Downloading...'; btn.disabled = true;
  let count = 0;
  for (const s of allStudents) {
    const safeName = s.name.replace(/\s+/g,'_');
    if (s.photo_url)         { downloadBase64(s.photo_url,         `VedLibrary_Docs/${safeName}_photo.png`);   count++; await delay(200); }
    if (s.aadhaar_photo_url) { downloadBase64(s.aadhaar_photo_url, `VedLibrary_Docs/${safeName}_aadhaar.png`); count++; await delay(200); }
  }
  btn.textContent = '📁 Download All Docs'; btn.disabled = false;
  if (!count) alert('No documents found.');
  else alert(`✅ ${count} document(s) downloaded.\nAll files are prefixed with "VedLibrary_Docs/" so they group together in your downloads folder.`);
}

function downloadBase64(dataUrl, filename) {
  const a = document.createElement('a'); a.href = dataUrl; a.download = filename; a.click();
}

/* ══════════════════════════════════════════
   REGISTRATION
══════════════════════════════════════════ */
function handleFileUpload(input, type) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 300 * 1024) { alert('File too large. Maximum size is 300KB.'); return; }
  const reader = new FileReader();
  reader.onloadend = () => {
    const b64 = reader.result;
    if (type === 'photo') { photoBase64 = b64; $('photo-preview').src = b64; show('photo-preview'); hide('photo-placeholder'); show('remove-photo'); $('photo-upload-area').classList.add('has-file'); }
    else { aadhaarBase64 = b64; $('aadhaar-preview').src = b64; show('aadhaar-preview'); hide('aadhaar-placeholder'); show('remove-aadhaar'); $('aadhaar-upload-area').classList.add('has-file'); }
  };
  reader.readAsDataURL(file);
}
function removeFile(e, type) {
  e.stopPropagation();
  if (type === 'photo') { photoBase64 = null; $('photo-input').value = ''; hide('photo-preview'); show('photo-placeholder'); hide('remove-photo'); $('photo-upload-area').classList.remove('has-file'); }
  else { aadhaarBase64 = null; $('aadhaar-input').value = ''; hide('aadhaar-preview'); show('aadhaar-placeholder'); hide('remove-aadhaar'); $('aadhaar-upload-area').classList.remove('has-file'); }
}
async function submitRegistration() {
  hide('reg-error');
  const phone = $('reg-phone').value.replace(/\s/g,''), aadhaar = $('reg-aadhaar').value.replace(/\s/g,''), agreed = $('reg-agree').checked;
  if (!phone || !aadhaar || !agreed || !photoBase64 || !aadhaarBase64) { showRegError('Please fill all fields, upload both photos, and agree to rules.'); return; }
  if (phone.length < 10 || phone.length > 15) { showRegError('Enter a valid phone number (10–15 digits).'); return; }
  if (aadhaar.length !== 12 || !/^\d+$/.test(aadhaar)) { showRegError('Enter a valid 12-digit Aadhaar number.'); return; }
  const btn = $('reg-submit-btn'); btn.textContent = 'Completing Registration...'; btn.disabled = true;
  try {
    const { error } = await db.from('users').update({ phone, aadhaar_number: aadhaar, registration_completed: true, agreed_to_rules: true, photo_url: photoBase64, aadhaar_photo_url: aadhaarBase64 }).eq('uid', currentUser.id);
    if (error) throw error;
    const { data } = await db.from('users').select('*').eq('uid', currentUser.id).single();
    currentProfile = data; hide('reg-page'); launchApp();
  } catch (err) { showRegError(err.message || 'Registration failed. Please try again.'); }
  finally { btn.textContent = 'Complete Registration'; btn.disabled = false; }
}
function showRegError(msg) { $('reg-error').textContent = msg; show('reg-error'); }

/* ── Modals ──────────────────────────────────────────────────────────────── */
function closeModal(id) { hide(id); }
document.querySelectorAll('.overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) hide(el.id); });
});

/* ── Boot ────────────────────────────────────────────────────────────────── */
init();
