/* ═══════════════════════════════════════
   VED LIBRARY — script.js  (v3.0 - FULL FEATURES)
═══════════════════════════════════════ */

/* ── CONFIG ─────────────────────────── */
const SUPABASE_URL      = 'https://dmolzoagnzjwtrdroqeg.supabase.co';
const SUPABASE_ANON     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtb2x6b2Fnbnpqd3RyZHJvcWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODUxODEsImV4cCI6MjA5MDg2MTE4MX0.5Culb-inMvITeplysy6_BJJXngd_SPMWG13_hT0GV5w';
const ADMIN_EMAIL       = 'raunakdubey7891@gmail.com';
const ADMIN_PHONE       = '+919876543210';
const LIBRARY_LAT       = 28.6139;
const LIBRARY_LON       = 77.2090;
const LIBRARY_RADIUS_KM = 0.5;

/* ── Supabase client ─────────────────── */
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true
  }
});

/* ── Global Error Catch ──────────────── */
window.addEventListener('error', function(e) {
  const errDiv = document.createElement('div');
  errDiv.style = 'position:fixed;top:0;left:0;width:100%;background:#ef4444;color:white;padding:12px;z-index:999999;font-size:12px;font-family:monospace;';
  errDiv.textContent = 'JS Error: ' + (e.message || String(e));
  document.body.appendChild(errDiv);
});
window.addEventListener('unhandledrejection', function(e) {
  const errDiv = document.createElement('div');
  errDiv.style = 'position:fixed;top:0;left:0;width:100%;background:#f59e0b;color:white;padding:12px;z-index:999999;font-size:12px;font-family:monospace;marginTop:40px;';
  errDiv.textContent = 'Promise Error: ' + (e.reason ? (e.reason.message || String(e.reason)) : String(e));
  document.body.appendChild(errDiv);
});

/* ── State ───────────────────────────── */
let currentUser    = null;
let currentProfile = null;
let allStudents    = [];
let allSeats       = [];
let allPayments    = [];
let allAttendance  = [];
let allNotices     = [];
let photoBase64    = null;
let aadhaarBase64  = null;
let aadhaarFileType = null;
let adminChannel   = null;
let initDone       = false;
let autoAttendanceInterval = null;

const STUDY_PLANS  = { full_time:'Full Time (12h)', shift_a:'Shift A (4h)', shift_b:'Shift B (4h)', custom:'Custom Shift' };
const PLAN_PRICES  = { full_time:1200, shift_a:500, shift_b:500, custom:800 };
const PLAN_HOURS   = { full_time:12, shift_a:4, shift_b:4, custom:8 };

/* ── Safe helpers ────────────────────── */
const $       = id  => document.getElementById(id);
const show    = id  => { const el=$(id); if(el) el.classList.remove('hidden'); };
const hide    = id  => { const el=$(id); if(el) el.classList.add('hidden'); };
const fmt     = iso => { if(!iso) return 'N/A'; try{ return new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); }catch{ return 'N/A'; } };
const fmtTime = iso => { if(!iso) return 'N/A'; try{ return new Date(iso).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}); }catch{ return 'N/A'; } };
const today   = ()  => new Date().toISOString().slice(0,10);
const delay   = ms  => new Promise(r=>setTimeout(r,ms));
const safeSet = (id,val) => { const el=$(id); if(el) el.textContent=val; };
const esc     = s   => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ═══════════════════════════════════════
   AUTH — Fixed refresh issue
═══════════════════════════════════════ */
async function init() {
  show('loading-screen');
  hide('auth-page');
  hide('app');
  hide('reg-page');

  if (window.location.search.includes('error')) {
    history.replaceState(null, '', window.location.pathname);
    hide('loading-screen');
    show('auth-page');
    return;
  }

  try {
    const { data: { session }, error } = await db.auth.getSession();
    if (error) throw error;
    if (session?.user) {
      await onSignIn(session.user);
    } else {
      hide('loading-screen');
      show('auth-page');
    }
  } catch (err) {
    console.error('Session check error:', err);
    hide('loading-screen');
    show('auth-page');
  }

  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      await onSignIn(session.user);
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentProfile = null;
      initDone = false;
      if (autoAttendanceInterval) clearInterval(autoAttendanceInterval);
      if (adminChannel) {
        db.removeChannel(adminChannel);
        adminChannel = null;
      }
      hide('app');
      hide('reg-page');
      show('auth-page');
    }
  });
}

async function onSignIn(user) {
  if (initDone && currentUser?.id === user.id) return;

  try {
    currentUser = user;
    let { data: profile, error } = await db.from('users').select('*').eq('uid', user.id).single();
    if (error && error.code !== 'PGRST116') throw error;
    if (!profile) {
      const isAdmin = user.email === ADMIN_EMAIL;
      const np = {
        uid: user.id,
        name: user.user_metadata?.full_name || user.email,
        email: user.email,
        role: isAdmin ? 'admin' : 'student',
        created_at: new Date().toISOString()
      };
      const { data: created, error: insErr } = await db.from('users').insert(np).select().single();
      if (insErr) throw insErr;
      profile = created;
    }
    currentProfile = profile;
    initDone = true;
    hide('loading-screen'); hide('auth-page');
    
    // Show contact admin button for students
    if (profile.role === 'student') {
      const contactBtn = document.getElementById('contact-admin-btn');
      if (contactBtn) contactBtn.style.display = 'inline-flex';
    }
    
    if (profile.role === 'student' && !profile.registration_completed) { show('reg-page'); return; }
    launchApp();
  } catch (e) {
    console.error('Sign-in error:', e);
    currentUser = null;
    initDone = false;
    hide('loading-screen');
    show('auth-page');
  }
}

async function logout() {
  if (autoAttendanceInterval) clearInterval(autoAttendanceInterval);
  try { await db.auth.signOut(); } catch(e) { console.error(e); }
  location.reload();
}

$('google-login-btn').onclick = async () => {
  try {
    $('google-btn-text').textContent = 'Connecting…';
    $('google-login-btn').disabled = true;
    const redirectTo = window.location.origin + window.location.pathname;
    await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  } catch (e) {
    $('google-btn-text').textContent = 'Continue with Google';
    $('google-login-btn').disabled = false;
    alert('Login failed: ' + e.message);
  }
};

/* ═══════════════════════════════════════
   AUTO ATTENDANCE MARKING
═══════════════════════════════════════ */
async function markAbsentForMissing() {
  const todayDate = today();
  const currentHour = new Date().getHours();
  
  for (const student of allStudents) {
    if (!student.plan_id || student.plan_id === 'custom') continue;
    
    const planHour = PLAN_HOURS[student.plan_id];
    let shouldMark = false;
    
    if (student.plan_id === 'full_time') {
      shouldMark = currentHour >= 20;
    } else if (student.plan_id === 'shift_a') {
      shouldMark = currentHour >= 12;
    } else if (student.plan_id === 'shift_b') {
      shouldMark = currentHour >= 20;
    }
    
    if (shouldMark) {
      const { data: existing } = await db.from('attendance').select('*').eq('uid', student.uid).eq('date', todayDate).maybeSingle();
      if (!existing) {
        await db.from('attendance').insert({ 
          id: `${student.uid}_${todayDate}`, 
          uid: student.uid, 
          date: todayDate, 
          timestamp: new Date().toISOString(), 
          status: 'absent' 
        });
      }
    }
  }
}

/* ═══════════════════════════════════════
   APP LAUNCH
═══════════════════════════════════════ */
function launchApp() {
  show('app');
  safeSet('nav-user-name', currentProfile.name);
  const roleEl = $('nav-user-role');
  if (roleEl) {
    roleEl.textContent = currentProfile.role === 'admin' ? 'Admin' : 'Student';
    roleEl.className   = 'badge ' + (currentProfile.role === 'admin' ? 'badge-indigo' : 'badge-green');
  }
  if (currentProfile.role === 'admin') {
    show('admin-dashboard');
    loadAdminData();
    // Run auto attendance marking every hour
    if (autoAttendanceInterval) clearInterval(autoAttendanceInterval);
    autoAttendanceInterval = setInterval(() => { markAbsentForMissing(); }, 3600000);
  } else {
    show('student-dashboard');
    loadStudentData();
  }
}

/* ═══════════════════════════════════════
   STUDENT DASHBOARD
═══════════════════════════════════════ */
async function loadStudentData() {
  try {
    const p = currentProfile;
    safeSet('student-welcome', `Welcome, ${p.name}`);
    safeSet('student-seat-num', p.seat_number || 'N/A');
    safeSet('student-plan-name', STUDY_PLANS[p.plan_id] || 'No plan');
    safeSet('amount-due', '₹' + (p.amount_due || 0));

    if (p.expiry_date) {
      const exp = new Date(p.expiry_date), diff = Math.max(0, Math.floor((exp - new Date()) / 86400000));
      safeSet('days-remaining', diff + ' Days');
      safeSet('expiry-text', 'Expiry: ' + fmt(p.expiry_date));
      const pbar = $('subscription-progress');
      if (pbar) pbar.style.width = Math.min(100, (diff / 30) * 100) + '%';
      safeSet('due-date-text', 'Due by ' + fmt(p.expiry_date));
    } else {
      safeSet('days-remaining', '0 Days');
      safeSet('expiry-text', 'Expiry: Not set');
      safeSet('due-date-text', 'Contact admin to set your session');
    }
    const nextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
    safeSet('days-next-month', Math.floor((nextMonth - new Date()) / 86400000) + ' Days');

    const { data: todayAttend } = await db.from('attendance').select('*').eq('uid', currentUser.id).eq('date', today()).maybeSingle();
    updateAttendanceUI(!!todayAttend && todayAttend.status === 'present');

    const { data: notices } = await db.from('notices').select('*').order('created_at', { ascending: false });
    allNotices = notices || [];
    renderNoticeList('student-notices-list', false);

    db.channel('student-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `uid=eq.${currentUser.id}` }, async () => {
        try { const { data } = await db.from('attendance').select('*').eq('uid', currentUser.id).eq('date', today()).maybeSingle(); updateAttendanceUI(!!data && data.status === 'present'); } catch (e) {}
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: `uid=eq.${currentUser.id}` }, async () => {
        try { const { data } = await db.from('users').select('*').eq('uid', currentUser.id).single(); if (data) { currentProfile = data; loadStudentData(); } } catch (e) {}
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notices' }, async () => {
        try { const { data } = await db.from('notices').select('*').order('created_at', { ascending: false }); allNotices = data || []; renderNoticeList('student-notices-list', false); } catch (e) {}
      })
      .subscribe();
  } catch (e) { console.error('loadStudentData error:', e); }
}

function updateAttendanceUI(marked) {
  try {
    const dot = $('attend-status-dot'), text = $('attend-status-text'), btn = $('mark-attend-btn');
    if (!dot || !text || !btn) return;
    if (marked) {
      dot.className = 'status-dot dot-green';
      text.textContent = 'Present ✓';
      btn.textContent = '✓ Attendance Done';
      btn.disabled = true;
      btn.className = 'btn w-full';
      btn.style.cssText = 'background:rgba(16,185,129,.1);color:#6ee7b7;cursor:default;width:100%;justify-content:center;padding:10px;border-radius:8px;font-weight:600;display:flex;align-items:center;border:1px solid rgba(16,185,129,.15)';
    } else {
      dot.className = 'status-dot dot-amber';
      text.textContent = 'Not Marked';
      btn.textContent = "Mark Today's Attendance";
      btn.disabled = false;
      btn.className = 'btn btn-primary w-full';
      btn.style.cssText = '';
    }
  } catch (e) {}
}

async function markAttendance() {
  hide('student-location-error');
  try {
    const loc = await getLocation();
    if (!isAtLibrary(loc.lat, loc.lon)) { showErr('student-location-error', 'You must be at the library to mark attendance.'); return; }
    await db.from('attendance').upsert({ id: `${currentUser.id}_${today()}`, uid: currentUser.id, date: today(), timestamp: new Date().toISOString(), status: 'present' });
    alert('Attendance marked successfully!');
  } catch (e) { showErr('student-location-error', e.message || 'Location error. Please allow location access.'); }
}

function getLocation() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) { rej(new Error('Geolocation not supported.')); return; }
    navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lon: p.coords.longitude }), () => rej(new Error('Could not get location. Please allow access.')));
  });
}

function isAtLibrary(lat, lon) {
  const R = 6371, dLat = (lat - LIBRARY_LAT) * Math.PI / 180, dLon = (lon - LIBRARY_LON) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(LIBRARY_LAT * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= LIBRARY_RADIUS_KM;
}

function showPaymentModal() {
  const amt = currentProfile.amount_due || 0;
  const qr = $('payment-qr'), link = $('payment-upi-link'), desc = $('payment-modal-desc'), utr = $('utr-input');
  if (desc) desc.textContent = `Pay ₹${amt} using any UPI app`;
  if (qr)   qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=raunakdubey7891@ybl%26pn=Ved%20Library%26am=${amt}%26cu=INR`;
  if (link) link.href = `upi://pay?pa=raunakdubey7891@ybl&pn=Ved%20Library&am=${amt}&cu=INR`;
  if (utr)  utr.value = '';
  show('payment-modal');
}

async function submitPayment() {
  const utr = ($('utr-input')?.value || '').trim();
  if (!utr) { alert('Please enter UTR / Transaction ID'); return; }
  const btn = $('submit-payment-btn');
  if (btn) { btn.textContent = 'Submitting…'; btn.disabled = true; }
  try {
    await db.from('payments').insert({ uid: currentUser.id, amount: currentProfile.amount_due || 0, transaction_id: utr, status: 'pending', timestamp: new Date().toISOString() });
    closeModal('payment-modal');
    alert('Payment submitted! Admin will verify it soon.');
  } catch (e) { alert('Failed: ' + e.message); }
  finally { if (btn) { btn.textContent = 'Submit Payment Details'; btn.disabled = false; } }
}

/* ═══════════════════════════════════════
   ADMIN DASHBOARD
═══════════════════════════════════════ */
async function loadAdminData() {
  try {
    await Promise.all([fetchStudents(), fetchSeats(), fetchPayments(), fetchAttendance(), fetchNotices()]);
    renderAll();
    if (adminChannel) db.removeChannel(adminChannel);
    adminChannel = db.channel('admin-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' },      async () => { try { await fetchStudents(); renderAll(); } catch (e) {} })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seats' },      async () => { try { await Promise.all([fetchSeats(), fetchStudents()]); renderAll(); } catch (e) {} })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' },   async () => { try { await fetchPayments(); renderAll(); } catch (e) {} })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, async () => { try { await fetchAttendance(); renderAll(); } catch (e) {} })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notices' },    async () => { try { await fetchNotices(); renderAll(); } catch (e) {} })
      .subscribe();
  } catch (e) { console.error('loadAdminData error:', e); }
}

async function fetchStudents()   { try { const { data } = await db.from('users').select('*').eq('role', 'student').order('name'); allStudents = data || []; } catch (e) {} }
async function fetchSeats()      { try { const { data } = await db.from('seats').select('*').order('number'); allSeats = data || []; } catch (e) {} }
async function fetchPayments()   { try { const { data } = await db.from('payments').select('*').order('timestamp', { ascending: false }); allPayments = data || []; } catch (e) {} }
async function fetchAttendance() { try { const { data } = await db.from('attendance').select('*').order('timestamp', { ascending: false }); allAttendance = data || []; } catch (e) {} }
async function fetchNotices()    { try { const { data } = await db.from('notices').select('*').order('created_at', { ascending: false }); allNotices = data || []; } catch (e) {} }

function renderAll() {
  try { renderStudentTable(); } catch (e) {}
  try { renderSeats(); } catch (e) {}
  try { renderPayments(); } catch (e) {}
  try { renderAttendanceList(); } catch (e) {}
  try { renderNoticeList('admin-notices-list', true); } catch (e) {}
  try { renderStats(); } catch (e) {}
}

function renderStudentTable() {
  const q = ($('student-search')?.value || '').toLowerCase();
  const list = allStudents.filter(s => !q || s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.seat_number?.toLowerCase().includes(q));
  const tbody = $('students-tbody');
  if (!tbody) return;
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:32px;font-size:13px">No students found.审理</tr>'; return; }
  tbody.innerHTML = list.map(s => {
    const isExp = s.expiry_date && new Date(s.expiry_date) < new Date();
    return `<tr>
      <td><div style="font-weight:600">${esc(s.name)}</div><div style="font-size:12px;color:var(--text3)">${esc(s.email)}</div></td>
      <td><span class="badge badge-indigo">${esc(s.seat_number || 'None')}</span></td>
      <td style="font-size:13px;color:var(--text2)">${esc(STUDY_PLANS[s.plan_id] || '—')}</td>
      <td style="font-size:12px;color:var(--text3)">${s.session_start ? fmt(s.session_start) : 'Not set'}</td>
      <td style="font-size:13px;color:${isExp ? '#fca5a5' : 'var(--text2)'};font-weight:${isExp ? '600' : '400'}">${fmt(s.expiry_date)}${isExp ? ' ⚠' : ''}</td>
      <td style="font-weight:600;color:${(s.amount_due || 0) > 0 ? '#fca5a5' : '#6ee7b7'}">₹${s.amount_due || 0}</td>
      <td class="text-right" style="white-space:nowrap">
        <button class="btn btn-ghost btn-icon" title="Download Docs" onclick="downloadStudentDocs('${s.uid}')">📥</button>
        <button class="btn btn-ghost btn-icon" title="Edit" onclick="openEditModal('${s.uid}')" style="margin-left:4px">✏️</button>
      </td>
    </tr>`;
  }).join('');
}

function renderSeats() {
  const filter = $('seat-filter')?.value || 'all';
  const list = allSeats.filter(s => filter === 'all' || s.status === filter);
  const grid = $('seats-grid');
  if (!grid) return;
  if (!list.length) { grid.innerHTML = '<div class="empty-text">No seats.</div>'; return; }
  const occupiedUids = allSeats.filter(s => s.status === 'occupied').map(s => s.occupied_by);
  const freeStudents = allStudents.filter(s => !occupiedUids.includes(s.uid));
  
  grid.innerHTML = list.map(seat => {
    const student = allStudents.find(s => s.uid === seat.occupied_by);
    const isOcc = seat.status === 'occupied';
    const opts = freeStudents.map(s => `<option value="${s.uid}">${esc(s.name)} (${STUDY_PLANS[s.plan_id] || 'No plan'})</option>`).join('');
    return `<div class="seat-card ${isOcc ? 'seat-occupied' : 'seat-available'}">
      <div class="s-card-top">
        <span class="seat-number">${esc(seat.number)}</span>
        <span class="seat-status ${isOcc ? 'status-occupied' : 'status-available'}">${isOcc ? 'Occupied' : 'Available'}</span>
      </div>
      <div class="s-actions">
        ${!isOcc ? 
          `<select class="s-sel" onchange="assignSeat('${seat.id}',this.value)"><option value="" disabled selected>Assign Student</option>${opts}</select>` :
          `<button class="btn btn-icon btn-reject" title="Free seat" onclick="toggleSeat('${seat.id}','${seat.status}','${seat.occupied_by || ''}')">✕ Free</button>`
        }
        <button class="btn btn-icon btn-ghost" onclick="removeSeat('${seat.id}')" title="Delete Seat">🗑</button>
      </div>
      ${isOcc ? `<div class="seat-student">👤 ${esc(student?.name || 'Assigned')}</div><div class="seat-plan-badge">${esc(seat.plan_type || '—')}</div>` : ''}
    </div>`;
  }).join('');
}

function renderPayments() {
  const el = $('payments-list');
  if (!el) return;
  const pending = allPayments.filter(p => p.status === 'pending');
  const history = allPayments.filter(p => p.status !== 'pending');
  el.innerHTML = `
    <div class="payment-section-title">Pending Requests</div>
    <div>${pending.length ? pending.map(p => paymentHTML(p, true)).join('') : '<div class="empty-text">No pending requests.</div>'}</div>
    <div class="payment-section-title" style="margin-top:20px">Payment History</div>
    <div>${history.length ? history.map(p => paymentHTML(p, false)).join('') : '<div class="empty-text">No history yet.</div>'}</div>`;
}

function paymentHTML(p, showActions) {
  const s = allStudents.find(x => x.uid === p.uid);
  const badge = p.status === 'verified' ? '<span class="badge badge-green">Verified</span>' : p.status === 'rejected' ? '<span class="badge badge-red">Rejected</span>' : '<span class="badge badge-amber">Pending</span>';
  return `<div class="pay-item">
    <div class="pay-item-left">
      <div class="pay-av">${esc((s?.name || '?').charAt(0))}</div>
      <div><div class="pay-name">${esc(s?.name || 'Unknown')}</div><div class="pay-meta">UTR: ${esc(p.transaction_id)} · ₹${p.amount} · ${fmtTime(p.timestamp)}</div></div>
    </div>
    <div class="pay-item-actions">
      ${showActions
        ? `<button class="btn btn-verify btn-sm" onclick="verifyPayment('${p.id}','verified','${p.uid}')">✓ Verify</button><button class="btn btn-reject btn-sm" onclick="verifyPayment('${p.id}','rejected','${p.uid}')">✕ Reject</button>`
        : badge}
    </div>
  </div>`;
}

function renderAttendanceList() {
  const el = $('attendance-list');
  if (!el) return;
  if (!allAttendance.length) { el.innerHTML = '<div class="empty-text">No records yet.</div>'; return; }
  el.innerHTML = allAttendance.slice(0, 100).map(a => {
    const s = allStudents.find(x => x.uid === a.uid);
    const statusIcon = a.status === 'present' ? '✅' : a.status === 'absent' ? '❌' : '⏳';
    return `<div class="att-item">
      <div class="att-av">${esc((s?.name || '?').charAt(0))}</div>
      <div style="flex:1"><div class="att-name">${esc(s?.name || 'Unknown')}</div><div class="att-time">${a.date} · ${fmtTime(a.timestamp)}</div></div>
      <span style="font-size:14px;">${statusIcon} ${a.status || 'present'}</span>
    </div>`;
  }).join('');
}

function renderNoticeList(elId, isAdmin) {
  const el = $(elId);
  if (!el) return;
  if (!allNotices.length) { el.innerHTML = '<div class="empty-text">No notices.</div>'; return; }
  el.innerHTML = allNotices.map(n => `<div class="notice-card">
    <div class="notice-card-header"><div class="notice-title">${esc(n.title)}</div><span class="notice-date">${fmtTime(n.created_at)}</span></div>
    <div class="notice-body">${esc(n.content)}</div>
    ${isAdmin ? `<button class="notice-delete" onclick="deleteNotice('${n.id}')" title="Delete">🗑</button>` : ''}
  </div>`).join('');
}

function renderStats() {
  safeSet('stat-students', allStudents.length);
  safeSet('stat-today', allAttendance.filter(a => a.date === today() && a.status === 'present').length);
  safeSet('stat-occupied', allSeats.filter(s => s.status === 'occupied').length);
  safeSet('stat-available', allSeats.filter(s => s.status === 'available').length);
  safeSet('stat-revenue', '₹' + allPayments.filter(p => p.status === 'verified').reduce((sum, p) => sum + p.amount, 0));
  safeSet('stat-pending-due', '₹' + allStudents.reduce((sum, s) => sum + (s.amount_due || 0), 0));
}

/* ═══════════════════════════════════════
   ADMIN ACTIONS
═══════════════════════════════════════ */

async function verifyPayment(id, status, uid) {
  try {
    await db.from('payments').update({ status }).eq('id', id);
    if (status === 'verified') await db.from('users').update({ amount_due: 0 }).eq('uid', uid);
    await Promise.all([fetchPayments(), fetchStudents()]);
    renderAll();
  } catch (e) { alert('Failed: ' + e.message); }
}

function openEditModal(uid) {
  const s = allStudents.find(x => x.uid === uid);
  if (!s) return;
  const fields = {
    'edit-uid': uid, 'edit-name': s.name, 'edit-phone': s.phone || '',
    'edit-aadhaar-view': s.aadhaar_number || '', 'edit-seat': s.seat_number || '',
    'edit-plan': s.plan_id || '', 'edit-amount-due': s.amount_due || 0,
    'edit-session-start': s.session_start ? s.session_start.slice(0, 10) : '',
    'edit-expiry': s.expiry_date ? s.expiry_date.slice(0, 10) : ''
  };
  Object.entries(fields).forEach(([id, val]) => { const el = $(id); if (el) el.value = val; });
  show('edit-student-modal');
}

const sessionInput = $('edit-session-start');
if (sessionInput) sessionInput.addEventListener('change', function() {
  if (!this.value) return;
  const exp = new Date(this.value); exp.setDate(exp.getDate() + 30);
  const expiryEl = $('edit-expiry'); if (expiryEl) expiryEl.value = exp.toISOString().slice(0, 10);
  const planEl = $('edit-plan'); if (planEl && PLAN_PRICES[planEl.value]) { const amt = $('edit-amount-due'); if (amt) amt.value = PLAN_PRICES[planEl.value]; }
});

const planInput = $('edit-plan');
if (planInput) planInput.addEventListener('change', function() {
  const sess = $('edit-session-start'); if (sess?.value && PLAN_PRICES[this.value]) { const amt = $('edit-amount-due'); if (amt) amt.value = PLAN_PRICES[this.value]; }
});

async function saveStudentEdit() {
  try {
    const uid = $('edit-uid')?.value;
    const sessionStart = $('edit-session-start')?.value;
    const expiryDate = $('edit-expiry')?.value;
    const newSeatNum = ($('edit-seat')?.value || '').trim();
    const oldStudent = allStudents.find(s => s.uid === uid);

    await db.from('users').update({
      seat_number: newSeatNum || null, plan_id: $('edit-plan')?.value || null,
      session_start: sessionStart || null, expiry_date: expiryDate || null,
      amount_due: parseInt($('edit-amount-due')?.value) || 0
    }).eq('uid', uid);

    if (oldStudent && oldStudent.seat_number !== newSeatNum) {
      if (oldStudent.seat_number) { const old = allSeats.find(s => s.number === oldStudent.seat_number); if (old) await db.from('seats').update({ status: 'available', occupied_by: null, plan_type: null }).eq('id', old.id); }
      if (newSeatNum) { const nw = allSeats.find(s => s.number === newSeatNum); if (nw && nw.status === 'available') { await db.from('seats').update({ status: 'occupied', occupied_by: uid, plan_type: STUDY_PLANS[$('edit-plan')?.value] || 'N/A' }).eq('id', nw.id); } else if (newSeatNum) { alert(`Seat ${newSeatNum} is not available or doesn't exist.`); } }
    }
    await Promise.all([fetchStudents(), fetchSeats()]);
    renderAll();
    closeModal('edit-student-modal');
  } catch (e) { alert('Save failed: ' + e.message); }
}

async function deleteStudent() {
  const uid = $('edit-uid')?.value;
  const s = allStudents.find(x => x.uid === uid);
  if (!s) return;
  if (!confirm(`Remove "${s.name}" permanently?`)) return;
  try {
    const btn = $('delete-student-btn');
    if (btn) { btn.textContent = 'Removing…'; btn.disabled = true; }
    if (s.seat_number) { const seat = allSeats.find(x => x.number === s.seat_number); if (seat) await db.from('seats').update({ status: 'available', occupied_by: null, plan_type: null }).eq('id', seat.id); }
    await db.from('attendance').delete().eq('uid', uid);
    await db.from('payments').delete().eq('uid', uid);
    await db.from('users').delete().eq('uid', uid);
    await Promise.all([fetchStudents(), fetchSeats(), fetchPayments(), fetchAttendance()]);
    renderAll();
    closeModal('edit-student-modal');
    alert(`${s.name} has been removed.`);
  } catch (e) {
    alert('Failed to remove student: ' + e.message);
    const btn = $('delete-student-btn');
    if (btn) { btn.textContent = 'Remove Student'; btn.disabled = false; }
  }
}

function showAddSeatModal() { const el = $('new-seat-num'); if (el) el.value = ''; show('add-seat-modal'); }
async function addSeat() {
  try {
    const num = ($('new-seat-num')?.value || '').trim();
    if (!num) return;
    const existing = allSeats.find(s => s.number === num);
    if (existing) { alert(`Seat ${num} already exists!`); return; }
    await db.from('seats').insert({ id: `seat_${Date.now()}`, number: num, status: 'available' });
    await fetchSeats();
    renderSeats();
    closeModal('add-seat-modal');
  } catch (e) { alert('Failed: ' + e.message); }
}

async function toggleSeat(id, currentStatus, occupiedBy) {
  try {
    const seat = allSeats.find(s => s.id === id);
    if (!seat) { alert('Seat not found'); return; }
    if (currentStatus === 'available') {
      alert('Please use the dropdown to select a student for this seat');
      return;
    } else {
      if (!confirm(`Free seat ${seat.number}?`)) return;
      await db.from('seats').update({ status: 'available', occupied_by: null, plan_type: null }).eq('id', id);
      if (occupiedBy) { await db.from('users').update({ seat_number: null }).eq('uid', occupiedBy); }
    }
    await Promise.all([fetchSeats(), fetchStudents()]);
    renderSeats();
    renderStudentTable();
  } catch (e) { alert('Failed: ' + e.message); }
}

async function assignSeat(seatId, studentUid) {
  try {
    if (!seatId || !studentUid) { alert('Invalid selection'); return; }
    const student = allStudents.find(s => s.uid === studentUid);
    const seat = allSeats.find(s => s.id === seatId);
    if (!student || !seat) { alert('Student or seat not found'); return; }
    if (seat.status !== 'available') { alert(`Seat ${seat.number} is already occupied.`); return; }
    if (!student.plan_id) { alert('Student must have a plan assigned first.'); return; }
    
    await db.from('seats').update({ status: 'occupied', occupied_by: studentUid, plan_type: STUDY_PLANS[student.plan_id] }).eq('id', seatId);
    await db.from('users').update({ seat_number: seat.number }).eq('uid', studentUid);
    
    const prev = allSeats.find(s => s.number === student.seat_number && s.id !== seatId);
    if (prev) { await db.from('seats').update({ status: 'available', occupied_by: null, plan_type: null }).eq('id', prev.id); }
    
    await Promise.all([fetchSeats(), fetchStudents()]);
    renderSeats();
    renderStudentTable();
  } catch (e) { alert('Failed: ' + e.message); }
}

async function removeSeat(id) {
  if (!confirm('Delete this seat?')) return;
  try {
    const seat = allSeats.find(s => s.id === id);
    if (seat?.occupied_by) { await db.from('users').update({ seat_number: null }).eq('uid', seat.occupied_by); }
    await db.from('seats').delete().eq('id', id);
    await Promise.all([fetchSeats(), fetchStudents()]);
    renderSeats();
    renderStudentTable();
  } catch (e) { alert('Failed: ' + e.message); }
}

function showAddNoticeModal() { const t = $('notice-title-input'), c = $('notice-content-input'); if (t) t.value = ''; if (c) c.value = ''; show('add-notice-modal'); }
async function addNotice() {
  try {
    const title = ($('notice-title-input')?.value || '').trim();
    const content = ($('notice-content-input')?.value || '').trim();
    if (!title || !content) return;
    await db.from('notices').insert({ title, content, created_at: new Date().toISOString(), author_id: currentUser.id });
    await fetchNotices();
    renderNoticeList('admin-notices-list', true);
    renderNoticeList('student-notices-list', false);
    closeModal('add-notice-modal');
  } catch (e) { alert('Failed: ' + e.message); }
}
async function deleteNotice(id) {
  if (!confirm('Delete this notice?')) return;
  try { 
    await db.from('notices').delete().eq('id', id);
    await fetchNotices();
    renderNoticeList('admin-notices-list', true);
    renderNoticeList('student-notices-list', false);
  } catch (e) { alert('Failed: ' + e.message); }
}

function switchTab(event, tab) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  const tc = $('tab-' + tab); if (tc) tc.classList.add('active');
  if (event?.target) event.target.classList.add('active');
}

/* ═══════════════════════════════════════
   EXPORTS & DOWNLOADS
═══════════════════════════════════════ */
function makeCSV(rows) { return rows.map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n'); }
function downloadCSV(filename, rows) { const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(makeCSV(rows)); a.download = filename; a.click(); }

function exportCSV(type) {
  try {
    if (type === 'students') downloadCSV(`VedLibrary_Students_${today()}.csv`, [
      ['Name', 'Email', 'Phone', 'Aadhaar', 'Seat', 'Plan', 'Session Start', 'Expiry', 'Amount Due'],
      ...allStudents.map(s => [s.name, s.email, s.phone || '', s.aadhaar_number || '', s.seat_number || '', STUDY_PLANS[s.plan_id] || '', s.session_start ? fmt(s.session_start) : '', s.expiry_date ? fmt(s.expiry_date) : '', s.amount_due || 0])
    ]);
    else if (type === 'attendance') downloadCSV(`VedLibrary_Attendance_${today()}.csv`, [
      ['Student', 'Email', 'Date', 'Time', 'Status'],
      ...allAttendance.map(a => { const s = allStudents.find(x => x.uid === a.uid); return [s?.name || 'Unknown', s?.email || '', a.date, a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : '', a.status]; })
    ]);
    else if (type === 'payments') downloadCSV(`VedLibrary_Payments_${today()}.csv`, [
      ['Student', 'Email', 'Amount', 'UTR', 'Status', 'Date'],
      ...allPayments.map(p => { const s = allStudents.find(x => x.uid === p.uid); return [s?.name || 'Unknown', s?.email || '', p.amount, p.transaction_id, p.status, fmtTime(p.timestamp)]; })
    ]);
  } catch (e) { alert('Export failed: ' + e.message); }
}

async function exportAllData() {
  const btn = $('export-all-btn');
  if (btn) { btn.textContent = 'Exporting…'; btn.disabled = true; }
  try {
    const d = today();
    downloadCSV(`VedLibrary_Students_${d}.csv`, [
      ['Name', 'Email', 'Phone', 'Aadhaar', 'Seat', 'Plan', 'Expiry', 'Due'],
      ...allStudents.map(s => [s.name, s.email, s.phone || '', s.aadhaar_number || '', s.seat_number || '', STUDY_PLANS[s.plan_id] || '', fmt(s.expiry_date), s.amount_due || 0])
    ]);
    alert(`Export complete!`);
  } catch (e) { alert('Export failed: ' + e.message); }
  finally { if (btn) { btn.textContent = 'Export All'; btn.disabled = false; } }
}

async function downloadStudentDocs(uid) {
  const s = allStudents.find(x => x.uid === uid);
  if (!s?.photo_url && !s?.aadhaar_photo_url) { alert('No documents for this student.'); return; }
  const name = s.name.replace(/\s+/g, '_');
  if (s.photo_url) { downloadBase64(s.photo_url, `${name}_photo.png`); }
  if (s.aadhaar_photo_url) { await delay(300); downloadBase64(s.aadhaar_photo_url, `${name}_aadhaar`); }
}

async function downloadAllDocs() {
  const btn = $('download-docs-btn');
  if (btn) { btn.textContent = 'Downloading…'; btn.disabled = true; }
  let count = 0;
  try {
    for (const s of allStudents) {
      const name = s.name.replace(/\s+/g, '_');
      if (s.photo_url) { downloadBase64(s.photo_url, `${name}_photo.png`); count++; await delay(200); }
      if (s.aadhaar_photo_url) { downloadBase64(s.aadhaar_photo_url, `${name}_aadhaar`); count++; await delay(200); }
    }
    alert(`${count} file(s) downloaded.`);
  } catch (e) { alert('Download failed: ' + e.message); }
  finally { if (btn) { btn.textContent = 'All Docs'; btn.disabled = false; } }
}

function downloadBase64(dataUrl, filename) { 
  const a = document.createElement('a'); 
  a.href = dataUrl; 
  a.download = filename; 
  a.click(); 
}

/* ═══════════════════════════════════════
   REGISTRATION with PDF support & 100KB limit
═══════════════════════════════════════ */
function handleFileUpload(input, type, maxSizeKB = 100) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > maxSizeKB * 1024) { alert(`File too large. Max ${maxSizeKB}KB.`); input.value = ''; return; }
  
  const reader = new FileReader();
  reader.onloadend = () => {
    const b64 = reader.result;
    if (type === 'photo') { 
      photoBase64 = b64; 
      const p = $('photo-preview'); 
      if (p) { p.src = b64; p.classList.remove('hidden'); } 
      hide('photo-placeholder'); 
      show('remove-photo'); 
      $('photo-upload-area')?.classList.add('has-file');
    } else { 
      aadhaarBase64 = b64;
      aadhaarFileType = file.type;
      if (file.type === 'application/pdf') {
        const pdfName = $('aadhaar-pdf-name');
        if (pdfName) { pdfName.textContent = `📄 ${file.name}`; pdfName.classList.remove('hidden'); }
        hide('aadhaar-preview');
      } else {
        const p = $('aadhaar-preview');
        if (p) { p.src = b64; p.classList.remove('hidden'); }
        hide('aadhaar-pdf-name');
      }
      hide('aadhaar-placeholder'); 
      show('remove-aadhaar'); 
      $('aadhaar-upload-area')?.classList.add('has-file');
    }
  };
  reader.readAsDataURL(file);
}

function removeFile(e, type) {
  e.stopPropagation();
  if (type === 'photo') { 
    photoBase64 = null; 
    const i = $('photo-input'); if (i) i.value = ''; 
    hide('photo-preview'); 
    show('photo-placeholder'); 
    hide('remove-photo'); 
    $('photo-upload-area')?.classList.remove('has-file');
  } else { 
    aadhaarBase64 = null; 
    aadhaarFileType = null;
    const i = $('aadhaar-input'); if (i) i.value = ''; 
    hide('aadhaar-preview'); 
    hide('aadhaar-pdf-name');
    show('aadhaar-placeholder'); 
    hide('remove-aadhaar'); 
    $('aadhaar-upload-area')?.classList.remove('has-file');
  }
}

async function submitRegistration() {
  const errEl = $('reg-error'); if (errEl) errEl.classList.add('hidden');
  const phone = ($('reg-phone')?.value || '').replace(/\s/g, '');
  const aadhaar = ($('reg-aadhaar')?.value || '').replace(/\s/g, '');
  const agreed = $('reg-agree')?.checked;
  if (!phone || !aadhaar || !agreed || !photoBase64 || !aadhaarBase64) { showErr('reg-error', 'Please fill all fields, upload both documents, and agree to rules.'); return; }
  if (phone.length < 10 || phone.length > 15) { showErr('reg-error', 'Enter a valid phone number (10–15 digits).'); return; }
  if (aadhaar.length !== 12 || !/^\d+$/.test(aadhaar)) { showErr('reg-error', 'Enter a valid 12-digit Aadhaar number.'); return; }
  const btn = $('reg-submit-btn');
  if (btn) { btn.textContent = 'Completing…'; btn.disabled = true; }
  try {
    const { error } = await db.from('users').update({ 
      phone, aadhaar_number: aadhaar, registration_completed: true, 
      agreed_to_rules: true, photo_url: photoBase64, aadhaar_photo_url: aadhaarBase64,
      aadhaar_file_type: aadhaarFileType
    }).eq('uid', currentUser.id);
    if (error) throw error;
    const { data } = await db.from('users').select('*').eq('uid', currentUser.id).single();
    currentProfile = data; hide('reg-page'); launchApp();
  } catch (e) { showErr('reg-error', e.message || 'Registration failed. Please try again.'); }
  finally { if (btn) { btn.textContent = 'Complete Registration'; btn.disabled = false; } }
}

function showErr(id, msg) { const el = $(id); if (el) { el.textContent = msg; el.classList.remove('hidden'); } }

function closeModal(id) { hide(id); }
document.querySelectorAll('.overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) hide(el.id); });
});

/* ── Boot ─────────────────────────────── */
init();