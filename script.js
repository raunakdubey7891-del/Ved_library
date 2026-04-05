/* ════════════════════════════════════════════
   VED LIBRARY — script.js
   ════════════════════════════════════════════ */

/* ── Config ── REPLACE THESE WITH YOUR REAL KEYS ────────────────────────── */
const SUPABASE_URL      = 'https://dmolzoagnzjwtrdroqeg.supabase.co';
const SUPABASE_ANON     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtb2x6b2Fnbnpqd3RyZHJvcWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODUxODEsImV4cCI6MjA5MDg2MTE4MX0.5Culb-inMvITeplysy6_BJJXngd_SPMWG13_hT0GV5w';
const ADMIN_EMAIL       = 'raunakdubey7891@gmail.com';
const LIBRARY_LAT       = 28.6139;
const LIBRARY_LON       = 77.2090;
const LIBRARY_RADIUS_KM = 0.5;

/* ── Validate config before doing anything ───────────────────────────────── */
if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_URL') {
  document.body.innerHTML = `
    <div style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fef2f2;padding:24px">
      <div style="background:#fff;border:1px solid #fecaca;border-radius:16px;padding:32px;max-width:480px;text-align:center">
        <div style="font-size:48px;margin-bottom:16px">⚠️</div>
        <h2 style="color:#dc2626;margin-bottom:12px">Supabase Keys Not Set</h2>
        <p style="color:#64748b;line-height:1.6">Open <strong>script.js</strong> and replace<br>
        <code style="background:#f1f5f9;padding:2px 8px;border-radius:4px">YOUR_SUPABASE_URL</code> and<br>
        <code style="background:#f1f5f9;padding:2px 8px;border-radius:4px">YOUR_SUPABASE_ANON_KEY</code><br>
        with your actual Supabase project keys.</p>
      </div>
    </div>`;
  throw new Error('Supabase keys not configured.');
}

/* ── Supabase client ─────────────────────────────────────────────────────── */
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    detectSessionInUrl: true,
    persistSession:     true,
    autoRefreshToken:   true,
  }
});

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
let adminChannel   = null;
let studentChannel = null;

/* ── Constants ───────────────────────────────────────────────────────────── */
const STUDY_PLANS  = { full_time:'Full Time (12 Hours)', shift_a:'Shift A (4 Hours)', shift_b:'Shift B (4 Hours)', custom:'Custom Shift' };
const PLAN_PRICES  = { full_time:1200, shift_a:500, shift_b:500, custom:800 };

/* ══════════════════════════════════════════
   SAFE HELPERS — never crash
══════════════════════════════════════════ */
const $       = id  => document.getElementById(id);
const show    = id  => { const el = $(id); if (el) el.classList.remove('hidden'); };
const hide    = id  => { const el = $(id); if (el) el.classList.add('hidden'); };
const setText = (id, val) => { const el = $(id); if (el) el.textContent = val; };
const setVal  = (id, val) => { const el = $(id); if (el) el.value = val; };

const fmt = iso => {
  if (!iso) return 'N/A';
  try { return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }); }
  catch { return 'N/A'; }
};
const fmtTime = iso => {
  if (!iso) return 'N/A';
  try { return new Date(iso).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }); }
  catch { return 'N/A'; }
};
const today = () => new Date().toISOString().slice(0, 10);
const delay = ms  => new Promise(res => setTimeout(res, ms));
const safeStr = v => String(v ?? '').replace(/"/g, '""');

/* Safe DB wrapper — logs errors but never crashes the page */
async function safeQuery(fn, fallback = null) {
  try {
    return await fn();
  } catch (err) {
    console.error('DB error:', err?.message || err);
    return fallback;
  }
}

/* Global error handler — shows a toast instead of crashing */
window.addEventListener('unhandledrejection', e => {
  console.error('Unhandled error:', e.reason);
  showToast('Something went wrong. Please refresh if the issue persists.', 'error');
  e.preventDefault();
});
window.addEventListener('error', e => {
  console.error('JS error:', e.message);
});

/* ── Toast notification ──────────────────────────────────────────────────── */
function showToast(msg, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const colors = { info:'#4f46e5', error:'#dc2626', success:'#059669' };
  const t = document.createElement('div');
  t.className = 'toast';
  t.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:${colors[type]||colors.info};color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.2);max-width:90vw;text-align:center`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

/* ══════════════════════════════════════════
   AUTH
══════════════════════════════════════════ */
async function init() {
  /* Listen for auth events first */
  db.auth.onAuthStateChange(async (event, session) => {
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user && !currentUser) {
      hide('loading-screen');
      hide('auth-page');
      await onSignIn(session.user);
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentProfile = null;
      hide('app');
      hide('reg-page');
      hide('loading-screen');
      show('auth-page');
    }
  });

  /* Check for existing session */
  try {
    const { data: { session } } = await db.auth.getSession();
    if (session?.user) {
      await onSignIn(session.user);
    } else if (!window.location.hash.includes('access_token') && !window.location.search.includes('error')) {
      hide('loading-screen');
      show('auth-page');
    } else if (window.location.search.includes('error')) {
      /* OAuth error — show login with message */
      hide('loading-screen');
      show('auth-page');
      showToast('Login was cancelled or failed. Please try again.', 'error');
      /* Clean the URL */
      history.replaceState(null, '', window.location.pathname);
    }
  } catch (err) {
    console.error('Session check failed:', err);
    hide('loading-screen');
    show('auth-page');
  }
}

async function onSignIn(user) {
  if (currentUser) return; /* Prevent double-fire */
  currentUser = user;

  try {
    let { data: profile, error } = await db.from('users').select('*').eq('uid', user.id).maybeSingle();

    if (error) throw error;

    if (!profile) {
      const isAdmin = user.email === ADMIN_EMAIL;
      const np = {
        uid:        user.id,
        name:       user.user_metadata?.full_name || user.email || 'Unknown',
        email:      user.email || '',
        role:       isAdmin ? 'admin' : 'student',
        created_at: new Date().toISOString(),
      };
      const { data: created, error: insertErr } = await db.from('users').insert(np).select().single();
      if (insertErr) throw insertErr;
      profile = created;
    }

    currentProfile = profile;
    hide('loading-screen');
    hide('auth-page');

    /* Clean URL after OAuth redirect */
    if (window.location.hash || window.location.search) {
      history.replaceState(null, '', window.location.pathname);
    }

    if (profile.role === 'student' && !profile.registration_completed) {
      show('reg-page');
      return;
    }

    launchApp();
  } catch (err) {
    console.error('Sign-in error:', err);
    showToast('Sign-in failed. Please try again.', 'error');
    currentUser = null;
    hide('loading-screen');
    show('auth-page');
  }
}

async function logout() {
  try {
    /* Unsubscribe realtime channels */
    if (adminChannel)   { await db.removeChannel(adminChannel);   adminChannel = null; }
    if (studentChannel) { await db.removeChannel(studentChannel); studentChannel = null; }
    await db.auth.signOut();
  } catch (err) {
    console.error('Logout error:', err);
  }
  location.reload();
}

const loginBtn = $('google-login-btn');
if (loginBtn) {
  loginBtn.onclick = async () => {
    setText('google-btn-text', 'Connecting...');
    loginBtn.disabled = true;
    try {
      const redirectTo = window.location.origin + window.location.pathname;
      await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    } catch (err) {
      setText('google-btn-text', 'Continue with Google');
      loginBtn.disabled = false;
      showToast('Could not start Google login. Please try again.', 'error');
    }
  };
}

/* ══════════════════════════════════════════
   APP LAUNCH
══════════════════════════════════════════ */
function launchApp() {
  show('app');
  setText('nav-user-name', currentProfile.name);
  const roleEl = $('nav-user-role');
  if (roleEl) {
    roleEl.textContent = currentProfile.role === 'admin' ? 'Admin' : 'Student';
    roleEl.className   = 'badge ' + (currentProfile.role === 'admin' ? 'badge-indigo' : 'badge-green');
  }
  if (currentProfile.role === 'admin') {
    show('admin-dashboard');
    loadAdminData();
  } else {
    show('student-dashboard');
    loadStudentData();
  }
}

/* ══════════════════════════════════════════
   STUDENT DASHBOARD
══════════════════════════════════════════ */
async function loadStudentData() {
  const p = currentProfile;
  if (!p) return;

  setText('student-welcome',   `Welcome back, ${p.name}!`);
  setText('student-seat-num',  p.seat_number || 'N/A');
  setText('student-plan-name', STUDY_PLANS[p.plan_id] || 'No plan selected');
  setText('amount-due',        '₹' + (p.amount_due || 0));

  /* Subscription */
  if (p.expiry_date) {
    const diff = Math.max(0, Math.floor((new Date(p.expiry_date) - new Date()) / 86400000));
    setText('days-remaining', diff + ' Days');
    setText('expiry-text',    'Expiry: ' + fmt(p.expiry_date));
    const prog = $('subscription-progress');
    if (prog) prog.style.width = Math.min(100, (diff / 30) * 100) + '%';
    setText('due-date-text', 'Due by ' + fmt(p.expiry_date));
  } else {
    setText('days-remaining', '0 Days');
    setText('expiry-text',    'Expiry: Not set');
    const prog = $('subscription-progress');
    if (prog) prog.style.width = '0%';
    setText('due-date-text', 'Contact admin to set your session');
  }

  /* Next month */
  const nextMonth  = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
  const daysToNext = Math.floor((nextMonth - new Date()) / 86400000);
  setText('days-next-month', daysToNext + ' Days');

  /* Today attendance */
  const { data: todayAttend } = await safeQuery(() =>
    db.from('attendance').select('id').eq('uid', currentUser.id).eq('date', today()).maybeSingle(), null);
  updateAttendanceUI(!!todayAttend);

  /* Notices */
  const { data: notices } = await safeQuery(() =>
    db.from('notices').select('*').order('created_at', { ascending: false }), { data: [] });
  allNotices = notices || [];
  renderNoticeList('student-notices-list', false);

  /* Realtime */
  if (studentChannel) db.removeChannel(studentChannel);
  studentChannel = db.channel('student-rt-' + user.id)
    .on('postgres_changes', { event:'*', schema:'public', table:'attendance', filter:`uid=eq.${currentUser.id}` },
      async () => {
        const { data } = await safeQuery(() => db.from('attendance').select('id').eq('uid', currentUser.id).eq('date', today()).maybeSingle(), null);
        updateAttendanceUI(!!data);
      })
    .on('postgres_changes', { event:'*', schema:'public', table:'users', filter:`uid=eq.${currentUser.id}` },
      async () => {
        const { data } = await safeQuery(() => db.from('users').select('*').eq('uid', currentUser.id).single(), null);
        if (data) { currentProfile = data; loadStudentData(); }
      })
    .on('postgres_changes', { event:'*', schema:'public', table:'notices' },
      async () => {
        const { data } = await safeQuery(() => db.from('notices').select('*').order('created_at', { ascending: false }), { data: [] });
        allNotices = data || [];
        renderNoticeList('student-notices-list', false);
      })
    .subscribe();
}

function updateAttendanceUI(marked) {
  const dot  = $('attend-status-dot');
  const text = $('attend-status-text');
  const btn  = $('mark-attend-btn');
  if (!dot || !text || !btn) return;
  if (marked) {
    dot.className     = 'status-dot dot-green';
    text.textContent  = 'Attendance Marked';
    btn.textContent   = '✅ Attendance Done';
    btn.disabled      = true;
    btn.style.cssText = 'background:#f0fdf4;color:#16a34a;cursor:default;width:100%;justify-content:center;padding:10px 20px;border-radius:12px;font-weight:700;display:flex;align-items:center;border:none';
  } else {
    dot.className    = 'status-dot dot-amber';
    text.textContent = 'Attendance Pending';
    btn.textContent  = "Mark Today's Attendance";
    btn.disabled     = false;
    btn.className    = 'btn btn-primary w-full';
    btn.style.cssText= '';
  }
}

async function markAttendance() {
  hide('student-location-error');
  try {
    const loc = await getLocation();
    if (!isAtLibrary(loc.lat, loc.lon)) {
      showLocationError('You must be at the library to mark attendance.');
      return;
    }
    const { error } = await db.from('attendance').upsert({
      id: `${currentUser.id}_${today()}`, uid: currentUser.id,
      date: today(), timestamp: new Date().toISOString(), status: 'present'
    });
    if (error) throw error;
  } catch (e) {
    showLocationError(e.message || 'Location error. Please allow location access.');
  }
}

function showLocationError(msg) { setText('student-location-error', msg); show('student-location-error'); }

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported.')); return; }
    navigator.geolocation.getCurrentPosition(
      p  => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => reject(new Error('Could not get location. Please allow location access.'))
    );
  });
}

function isAtLibrary(lat, lon) {
  const R = 6371, dLat = (lat - LIBRARY_LAT) * Math.PI/180, dLon = (lon - LIBRARY_LON) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(LIBRARY_LAT*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) <= LIBRARY_RADIUS_KM;
}

/* ── Payment modal ───────────────────────────────────────────────────────── */
function showPaymentModal() {
  const amt = currentProfile?.amount_due || 0;
  setText('payment-modal-desc', `Pay ₹${amt} using any UPI app`);
  const qr = $('payment-qr');
  if (qr) qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=raunakdubey7891@ybl%26pn=Ved%20Library%26am=${amt}%26cu=INR`;
  const link = $('payment-upi-link');
  if (link) link.href = `upi://pay?pa=raunakdubey7891@ybl&pn=Ved%20Library&am=${amt}&cu=INR`;
  setVal('utr-input', '');
  show('payment-modal');
}

async function submitPayment() {
  const utr = $('utr-input')?.value.trim();
  if (!utr) { showToast('Please enter UTR / Transaction ID', 'error'); return; }
  const btn = $('submit-payment-btn');
  if (btn) { btn.textContent = 'Submitting...'; btn.disabled = true; }
  try {
    const { error } = await db.from('payments').insert({
      uid: currentUser.id, amount: currentProfile?.amount_due || 0,
      transaction_id: utr, status: 'pending', timestamp: new Date().toISOString()
    });
    if (error) throw error;
    closeModal('payment-modal');
    showToast('Payment submitted! Admin will verify it soon.', 'success');
  } catch (err) {
    showToast('Payment submission failed. Please try again.', 'error');
  } finally {
    if (btn) { btn.textContent = 'Submit Payment Details'; btn.disabled = false; }
  }
}

/* ══════════════════════════════════════════
   ADMIN DASHBOARD
══════════════════════════════════════════ */
async function loadAdminData() {
  await Promise.all([fetchStudents(), fetchSeats(), fetchPayments(), fetchAttendance(), fetchNotices()]);
  renderAll();

  if (adminChannel) db.removeChannel(adminChannel);
  adminChannel = db.channel('admin-rt')
    .on('postgres_changes', { event:'*', schema:'public', table:'users'      }, async () => { await fetchStudents();                              renderAll(); })
    .on('postgres_changes', { event:'*', schema:'public', table:'seats'      }, async () => { await Promise.all([fetchSeats(), fetchStudents()]); renderAll(); })
    .on('postgres_changes', { event:'*', schema:'public', table:'payments'   }, async () => { await fetchPayments();                              renderAll(); })
    .on('postgres_changes', { event:'*', schema:'public', table:'attendance' }, async () => { await fetchAttendance();                            renderAll(); })
    .on('postgres_changes', { event:'*', schema:'public', table:'notices'    }, async () => { await fetchNotices();                               renderAll(); })
    .subscribe();
}

async function fetchStudents()  { const r = await safeQuery(() => db.from('users').select('*').eq('role','student').order('name'),          { data:[] }); allStudents   = r?.data || []; }
async function fetchSeats()     { const r = await safeQuery(() => db.from('seats').select('*').order('number'),                             { data:[] }); allSeats      = r?.data || []; }
async function fetchPayments()  { const r = await safeQuery(() => db.from('payments').select('*').order('timestamp',{ascending:false}),     { data:[] }); allPayments   = r?.data || []; }
async function fetchAttendance(){ const r = await safeQuery(() => db.from('attendance').select('*').order('timestamp',{ascending:false}),   { data:[] }); allAttendance = r?.data || []; }
async function fetchNotices()   { const r = await safeQuery(() => db.from('notices').select('*').order('created_at',{ascending:false}),     { data:[] }); allNotices    = r?.data || []; }

function renderAll() {
  try { renderStudentTable();  } catch(e) { console.error('renderStudentTable:', e); }
  try { renderSeats();         } catch(e) { console.error('renderSeats:', e); }
  try { renderPayments();      } catch(e) { console.error('renderPayments:', e); }
  try { renderAttendanceList();} catch(e) { console.error('renderAttendanceList:', e); }
  try { renderNoticeList('admin-notices-list', true); } catch(e) { console.error('renderNotices:', e); }
  try { renderStats();         } catch(e) { console.error('renderStats:', e); }
}

/* ── Students table ──────────────────────────────────────────────────────── */
function renderStudentTable() {
  const q = ($('student-search')?.value || '').toLowerCase();
  const filtered = allStudents.filter(s =>
    !q || s.name?.toLowerCase().includes(q) ||
    s.email?.toLowerCase().includes(q) ||
    s.seat_number?.toLowerCase().includes(q)
  );
  const tbody = $('students-tbody');
  if (!tbody) return;
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:24px;font-style:italic">No students found.</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(s => {
    const isExpired  = s.expiry_date && new Date(s.expiry_date) < new Date();
    const expiryClr  = isExpired ? 'color:#dc2626;font-weight:700' : 'color:#64748b';
    const dueClr     = (s.amount_due || 0) > 0 ? '#dc2626' : '#16a34a';
    return `<tr>
      <td>
        <div style="font-weight:700">${s.name || '—'}</div>
        <div style="font-size:12px;color:#94a3b8">${s.email || '—'}</div>
      </td>
      <td><span class="badge badge-indigo">${s.seat_number || 'Unassigned'}</span></td>
      <td style="font-size:13px;color:#64748b">${STUDY_PLANS[s.plan_id] || 'None'}</td>
      <td style="font-size:13px;${expiryClr}">${fmt(s.expiry_date)}${isExpired ? ' ⚠️' : ''}</td>
      <td style="font-weight:700;color:${dueClr}">₹${s.amount_due || 0}</td>
      <td style="font-size:12px;color:#94a3b8">${s.session_start ? fmt(s.session_start) : 'Not set'}</td>
      <td class="text-right" style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm btn-icon" title="Download Docs"  onclick="downloadStudentDocs('${s.uid}')">📥</button>
        <button class="btn btn-ghost btn-sm btn-icon" title="Edit"           onclick="openEditModal('${s.uid}')"       style="margin-left:4px">✏️</button>
        <button class="btn btn-icon"                  title="Remove Student" onclick="confirmRemoveStudent('${s.uid}','${s.name?.replace(/'/g,"\\'")||''}')" style="margin-left:4px;background:#fee2e2;color:#dc2626">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

/* ── Remove student ──────────────────────────────────────────────────────── */
function confirmRemoveStudent(uid, name) {
  /* Set values in confirm modal */
  const nameEl = $('remove-student-name');
  const uidEl  = $('remove-student-uid');
  if (nameEl) nameEl.textContent = name;
  if (uidEl)  uidEl.value        = uid;
  show('remove-student-modal');
}

async function removeStudent() {
  const uid  = $('remove-student-uid')?.value;
  const btn  = $('confirm-remove-btn');
  if (!uid) return;

  if (btn) { btn.textContent = 'Removing...'; btn.disabled = true; }

  try {
    const student = allStudents.find(s => s.uid === uid);

    /* 1. Free their seat if assigned */
    if (student?.seat_number) {
      const seat = allSeats.find(s => s.number === student.seat_number);
      if (seat) {
        await safeQuery(() => db.from('seats').update({ status:'available', occupied_by:null, plan_type:null }).eq('id', seat.id));
      }
    }

    /* 2. Delete attendance records */
    await safeQuery(() => db.from('attendance').delete().eq('uid', uid));

    /* 3. Delete payment records */
    await safeQuery(() => db.from('payments').delete().eq('uid', uid));

    /* 4. Delete the user profile */
    const { error } = await db.from('users').delete().eq('uid', uid);
    if (error) throw error;

    closeModal('remove-student-modal');
    showToast(`Student removed successfully.`, 'success');
  } catch (err) {
    showToast('Failed to remove student: ' + (err.message || 'Unknown error'), 'error');
  } finally {
    if (btn) { btn.textContent = 'Yes, Remove Student'; btn.disabled = false; }
  }
}

/* ── Seats ───────────────────────────────────────────────────────────────── */
function renderSeats() {
  const filter   = $('seat-filter')?.value || 'all';
  const filtered = allSeats.filter(s => filter === 'all' || s.status === filter);
  const grid     = $('seats-grid');
  if (!grid) return;
  if (!filtered.length) {
    grid.innerHTML = '<div style="color:#94a3b8;font-style:italic;padding:16px">No seats found.</div>';
    return;
  }
  const occupiedUids = allSeats.filter(s => s.status === 'occupied').map(s => s.occupied_by).filter(Boolean);
  grid.innerHTML = filtered.map(seat => {
    const student = allStudents.find(s => s.uid === seat.occupied_by);
    const isOcc   = seat.status === 'occupied';
    const opts    = allStudents
      .filter(s => !occupiedUids.includes(s.uid))
      .map(s => `<option value="${s.uid}">${s.name}</option>`)
      .join('');
    return `
      <div class="seat-card ${isOcc ? 'seat-occupied' : 'seat-available'}">
        <div class="seat-card-header">
          <span class="seat-num ${isOcc ? 'seat-num-occupied' : 'seat-num-available'}">${seat.number}</span>
          <div class="seat-card-actions">
            <button class="btn btn-icon ${isOcc ? 'btn-reject' : 'btn-verify'}"
              title="${isOcc ? 'Free seat' : 'Mark occupied'}"
              onclick="toggleSeat('${seat.id}','${seat.status}','${seat.occupied_by||''}')">
              ${isOcc ? '✕' : '✓'}
            </button>
            <button class="btn btn-icon" style="background:#f1f5f9;color:#94a3b8"
              onclick="removeSeat('${seat.id}')" title="Delete">🗑</button>
          </div>
        </div>
        ${isOcc
          ? `<div class="seat-student-name">${student?.name || 'Assigned'}</div>
             <div class="seat-plan-label">${seat.plan_type || 'No Plan'}</div>`
          : `<select class="seat-assign-select" onchange="assignSeat('${seat.id}',this.value)">
               <option value="" disabled selected>${opts ? 'Assign Student' : 'No unassigned students'}</option>
               ${opts}
             </select>`
        }
      </div>`;
  }).join('');
}

/* ── Payments ────────────────────────────────────────────────────────────── */
function renderPayments() {
  const pending = allPayments.filter(p => p.status === 'pending');
  const history = allPayments.filter(p => p.status !== 'pending');
  const el      = $('payments-list');
  if (!el) return;
  el.innerHTML = `
    <div class="payment-section-title">⏳ Pending Requests</div>
    <div>${pending.length ? pending.map(p => paymentItemHtml(p, true)).join('') : '<div class="empty-text">No pending requests.</div>'}</div>
    <div class="payment-section-title" style="margin-top:24px">📋 Payment History</div>
    <div>${history.length ? history.map(p => paymentItemHtml(p, false)).join('') : '<div class="empty-text">No payment history yet.</div>'}</div>`;
}

function paymentItemHtml(p, showActions) {
  const s = allStudents.find(x => x.uid === p.uid);
  const badge = p.status === 'verified'
    ? '<span class="badge badge-green">✓ Verified</span>'
    : p.status === 'rejected'
    ? '<span class="badge badge-red">✕ Rejected</span>'
    : '<span class="badge badge-amber">⏳ Pending</span>';
  return `
    <div class="payment-item">
      <div class="payment-item-left">
        <div class="payment-avatar">${(s?.name || '?').charAt(0)}</div>
        <div>
          <div class="payment-name">${s?.name || 'Unknown'}</div>
          <div class="payment-meta">UTR: ${p.transaction_id} · ₹${p.amount} · ${fmtTime(p.timestamp)}</div>
        </div>
      </div>
      <div class="payment-item-actions">
        ${showActions
          ? `<button class="btn btn-verify btn-sm" onclick="verifyPayment('${p.id}','verified','${p.uid}')">✓ Verify</button>
             <button class="btn btn-reject  btn-sm" onclick="verifyPayment('${p.id}','rejected','${p.uid}')">✕ Reject</button>`
          : badge}
      </div>
    </div>`;
}

/* ── Attendance ───────────────────────────────────────────────────────────── */
function renderAttendanceList() {
  const el = $('attendance-list');
  if (!el) return;
  if (!allAttendance.length) { el.innerHTML = '<div class="empty-text">No records yet.</div>'; return; }
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
      </div>`;
  }).join('');
}

/* ── Notices ─────────────────────────────────────────────────────────────── */
function renderNoticeList(elId, isAdmin) {
  const el = $(elId);
  if (!el) return;
  if (!allNotices.length) { el.innerHTML = '<div class="empty-text">No notices at the moment.</div>'; return; }
  el.innerHTML = allNotices.map(n => `
    <div class="notice-card">
      <div class="notice-card-header">
        <div class="notice-title">${n.title || ''}</div>
        <span class="notice-date">${fmtTime(n.created_at)}</span>
      </div>
      <div class="notice-body">${n.content || ''}</div>
      ${isAdmin ? `<button class="notice-delete" onclick="deleteNotice('${n.id}')" title="Delete">🗑</button>` : ''}
    </div>`).join('');
}

/* ── Stats ───────────────────────────────────────────────────────────────── */
function renderStats() {
  setText('stat-students',  allStudents.length);
  setText('stat-today',     new Set(allAttendance.filter(a => a.date === today()).map(a => a.uid)).size);
  setText('stat-occupied',  allSeats.filter(s => s.status === 'occupied').length);
  setText('stat-available', allSeats.filter(s => s.status === 'available').length);
  const rev = $('stat-revenue');
  if (rev) rev.textContent = '₹' + allPayments.filter(p => p.status === 'verified').reduce((s,p) => s + p.amount, 0);
  const due = $('stat-pending-due');
  if (due) due.textContent = '₹' + allStudents.reduce((s,st) => s + (st.amount_due || 0), 0);
}

/* ══════════════════════════════════════════
   ADMIN ACTIONS
══════════════════════════════════════════ */
async function verifyPayment(id, status, uid) {
  try {
    const { error } = await db.from('payments').update({ status }).eq('id', id);
    if (error) throw error;
    if (status === 'verified') await db.from('users').update({ amount_due: 0 }).eq('uid', uid);
    showToast(status === 'verified' ? 'Payment verified!' : 'Payment rejected.', status === 'verified' ? 'success' : 'info');
  } catch (err) { showToast('Action failed: ' + err.message, 'error'); }
}

/* ── Edit student ────────────────────────────────────────────────────────── */
function openEditModal(uid) {
  const s = allStudents.find(x => x.uid === uid);
  if (!s) return;
  setVal('edit-uid',          uid);
  setVal('edit-name',         s.name || '');
  setVal('edit-phone',        s.phone || '');
  setVal('edit-aadhaar-view', s.aadhaar_number || '');
  setVal('edit-seat',         s.seat_number || '');
  setVal('edit-plan',         s.plan_id || '');
  setVal('edit-session-start',s.session_start ? s.session_start.slice(0,10) : '');
  setVal('edit-expiry',       s.expiry_date   ? s.expiry_date.slice(0,10)   : '');
  setVal('edit-amount-due',   s.amount_due || 0);
  show('edit-student-modal');
}

/* Auto-fill expiry + amount when session start changes */
const sessEl = $('edit-session-start');
if (sessEl) {
  sessEl.addEventListener('change', function () {
    if (!this.value) return;
    const expiry = new Date(this.value);
    expiry.setDate(expiry.getDate() + 30);
    setVal('edit-expiry', expiry.toISOString().slice(0, 10));
    const planId = $('edit-plan')?.value;
    if (planId && PLAN_PRICES[planId]) setVal('edit-amount-due', PLAN_PRICES[planId]);
  });
}
const planEl = $('edit-plan');
if (planEl) {
  planEl.addEventListener('change', function () {
    if ($('edit-session-start')?.value && PLAN_PRICES[this.value]) {
      setVal('edit-amount-due', PLAN_PRICES[this.value]);
    }
  });
}

async function saveStudentEdit() {
  const uid        = $('edit-uid')?.value;
  const newSeatNum = $('edit-seat')?.value.trim() || null;
  const oldStudent = allStudents.find(s => s.uid === uid);
  const btn        = document.querySelector('#edit-student-modal .btn-primary');
  if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }

  try {
    const { error } = await db.from('users').update({
      seat_number:   newSeatNum,
      plan_id:       $('edit-plan')?.value      || null,
      session_start: $('edit-session-start')?.value || null,
      expiry_date:   $('edit-expiry')?.value    || null,
      amount_due:    parseInt($('edit-amount-due')?.value) || 0,
    }).eq('uid', uid);
    if (error) throw error;

    /* Sync seat records if seat changed */
    if (oldStudent && oldStudent.seat_number !== newSeatNum) {
      if (oldStudent.seat_number) {
        const oldSeat = allSeats.find(s => s.number === oldStudent.seat_number);
        if (oldSeat) await safeQuery(() => db.from('seats').update({ status:'available', occupied_by:null, plan_type:null }).eq('id', oldSeat.id));
      }
      if (newSeatNum) {
        const newSeat = allSeats.find(s => s.number === newSeatNum);
        if (newSeat) {
          await safeQuery(() => db.from('seats').update({
            status:'occupied', occupied_by:uid,
            plan_type: STUDY_PLANS[$('edit-plan')?.value] || 'N/A'
          }).eq('id', newSeat.id));
        }
      }
    }

    closeModal('edit-student-modal');
    showToast('Student updated successfully!', 'success');
  } catch (err) {
    showToast('Save failed: ' + err.message, 'error');
  } finally {
    if (btn) { btn.textContent = 'Save Changes'; btn.disabled = false; }
  }
}

/* ── Seats ───────────────────────────────────────────────────────────────── */
function showAddSeatModal() { setVal('new-seat-num', ''); show('add-seat-modal'); }

async function addSeat() {
  const num = $('new-seat-num')?.value.trim();
  if (!num) { showToast('Please enter a seat number.', 'error'); return; }
  try {
    const { error } = await db.from('seats').insert({ id:`seat_${num}`, number:num, status:'available' });
    if (error) throw error;
    closeModal('add-seat-modal');
    showToast('Seat added!', 'success');
  } catch (err) { showToast('Failed to add seat: ' + err.message, 'error'); }
}

async function toggleSeat(id, currentStatus, occupiedBy) {
  const newStatus = currentStatus === 'available' ? 'occupied' : 'available';
  try {
    await db.from('seats').update({ status:newStatus, occupied_by:newStatus==='available'?null:occupiedBy }).eq('id', id);
    if (newStatus === 'available' && occupiedBy) {
      await db.from('users').update({ seat_number:null }).eq('uid', occupiedBy);
    }
  } catch (err) { showToast('Failed to update seat: ' + err.message, 'error'); }
}

async function assignSeat(seatId, studentUid) {
  const student = allStudents.find(s => s.uid === studentUid);
  const seat    = allSeats.find(s => s.id === seatId);
  if (!student || !seat) return;
  try {
    await db.from('seats').update({ status:'occupied', occupied_by:studentUid, plan_type:STUDY_PLANS[student.plan_id]||'N/A' }).eq('id', seatId);
    await db.from('users').update({ seat_number:seat.number }).eq('uid', studentUid);
    const prev = allSeats.find(s => s.number === student.seat_number && s.id !== seatId);
    if (prev) await db.from('seats').update({ status:'available', occupied_by:null, plan_type:null }).eq('id', prev.id);
    showToast(`Seat ${seat.number} assigned to ${student.name}`, 'success');
  } catch (err) { showToast('Assignment failed: ' + err.message, 'error'); }
}

async function removeSeat(id) {
  if (!confirm('Delete this seat?')) return;
  try {
    const seat = allSeats.find(s => s.id === id);
    if (seat?.occupied_by) await db.from('users').update({ seat_number:null }).eq('uid', seat.occupied_by);
    const { error } = await db.from('seats').delete().eq('id', id);
    if (error) throw error;
    showToast('Seat removed.', 'success');
  } catch (err) { showToast('Failed to remove seat: ' + err.message, 'error'); }
}

/* ── Notices ─────────────────────────────────────────────────────────────── */
function showAddNoticeModal() { setVal('notice-title-input',''); setVal('notice-content-input',''); show('add-notice-modal'); }

async function addNotice() {
  const title   = $('notice-title-input')?.value.trim();
  const content = $('notice-content-input')?.value.trim();
  if (!title || !content) { showToast('Please fill in title and content.', 'error'); return; }
  try {
    const { error } = await db.from('notices').insert({ title, content, created_at:new Date().toISOString(), author_id:currentUser.id });
    if (error) throw error;
    closeModal('add-notice-modal');
    showToast('Notice posted!', 'success');
  } catch (err) { showToast('Failed to post notice: ' + err.message, 'error'); }
}

async function deleteNotice(id) {
  if (!confirm('Delete this notice?')) return;
  try {
    const { error } = await db.from('notices').delete().eq('id', id);
    if (error) throw error;
    showToast('Notice deleted.', 'success');
  } catch (err) { showToast('Failed to delete: ' + err.message, 'error'); }
}

/* ── Tab switching ───────────────────────────────────────────────────────── */
function switchTab(event, tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  const tc = $('tab-' + tab);
  if (tc) tc.classList.add('active');
  if (event?.target) event.target.classList.add('active');
}

/* ══════════════════════════════════════════
   EXPORTS & DOWNLOADS
══════════════════════════════════════════ */
function makeCSV(rows) {
  return rows.map(r => r.map(c => `"${safeStr(c)}"`).join(',')).join('\n');
}
function downloadCSV(filename, rows) {
  try {
    const a  = document.createElement('a');
    a.href   = 'data:text/csv;charset=utf-8,' + encodeURIComponent(makeCSV(rows));
    a.download = filename;
    a.click();
  } catch (err) { showToast('Download failed: ' + err.message, 'error'); }
}

function exportCSV(type) {
  if (type === 'students') {
    downloadCSV(`students_${today()}.csv`, [
      ['Name','Email','Phone','Aadhaar','Seat','Plan','Session Start','Expiry Date','Amount Due'],
      ...allStudents.map(s => [s.name,s.email,s.phone||'',s.aadhaar_number||'',s.seat_number||'',STUDY_PLANS[s.plan_id]||'',s.session_start?fmt(s.session_start):'',s.expiry_date?fmt(s.expiry_date):'',s.amount_due||0]),
    ]);
  } else if (type === 'attendance') {
    downloadCSV(`attendance_${today()}.csv`, [
      ['Student Name','Email','Date','Time','Status'],
      ...allAttendance.map(a => { const s = allStudents.find(x=>x.uid===a.uid); return [s?.name||'Unknown',s?.email||'',a.date,a.timestamp?new Date(a.timestamp).toLocaleTimeString():'',a.status]; }),
    ]);
  } else if (type === 'payments') {
    downloadCSV(`payments_${today()}.csv`, [
      ['Student Name','Email','Amount','UTR','Status','Date & Time'],
      ...allPayments.map(p => { const s = allStudents.find(x=>x.uid===p.uid); return [s?.name||'Unknown',s?.email||'',p.amount,p.transaction_id,p.status,fmtTime(p.timestamp)]; }),
    ]);
  }
}

async function exportAllData() {
  const btn = $('export-all-btn');
  if (btn) { btn.textContent = '⏳ Preparing...'; btn.disabled = true; }
  try {
    const d = today();
    const totalRevenue = allPayments.filter(p=>p.status==='verified').reduce((s,p)=>s+p.amount,0);
    const totalDue     = allStudents.reduce((s,st)=>s+(st.amount_due||0),0);

    downloadCSV(`VedLibrary_Export_${d}_0_Summary.csv`, [
      ['Metric','Value'],
      ['Export Date',d],['Total Students',allStudents.length],
      ['Occupied Seats',allSeats.filter(s=>s.status==='occupied').length],
      ['Available Seats',allSeats.filter(s=>s.status==='available').length],
      ['Total Attendance Records',allAttendance.length],
      ['Present Today',new Set(allAttendance.filter(a=>a.date===today()).map(a=>a.uid)).size],
      ['Total Verified Revenue (₹)',totalRevenue],['Total Amount Due (₹)',totalDue],
      ['Total Notices',allNotices.length],['Total Payments',allPayments.length],
    ]);
    await delay(400);

    downloadCSV(`VedLibrary_Export_${d}_1_Students.csv`, [
      ['Name','Email','Phone','Aadhaar','Seat','Plan','Session Start','Expiry','Amount Due','Registered','Joined'],
      ...allStudents.map(s=>[s.name,s.email,s.phone||'',s.aadhaar_number||'',s.seat_number||'',STUDY_PLANS[s.plan_id]||'',s.session_start?fmt(s.session_start):'',s.expiry_date?fmt(s.expiry_date):'',s.amount_due||0,s.registration_completed?'Yes':'No',fmt(s.created_at)]),
    ]);
    await delay(400);

    downloadCSV(`VedLibrary_Export_${d}_2_Payments.csv`, [
      ['Student','Email','Amount (₹)','UTR','Status','Date'],
      ...allPayments.map(p=>{ const s=allStudents.find(x=>x.uid===p.uid); return [s?.name||'Unknown',s?.email||'',p.amount,p.transaction_id,p.status,fmtTime(p.timestamp)]; }),
    ]);
    await delay(400);

    downloadCSV(`VedLibrary_Export_${d}_3_Attendance.csv`, [
      ['Student','Email','Date','Time','Status'],
      ...allAttendance.map(a=>{ const s=allStudents.find(x=>x.uid===a.uid); return [s?.name||'Unknown',s?.email||'',a.date,a.timestamp?new Date(a.timestamp).toLocaleTimeString():'',a.status]; }),
    ]);
    await delay(400);

    downloadCSV(`VedLibrary_Export_${d}_4_Seats.csv`, [
      ['Seat Number','Status','Student Name','Student Email','Plan'],
      ...allSeats.map(seat=>{ const s=allStudents.find(x=>x.uid===seat.occupied_by); return [seat.number,seat.status,s?.name||'',s?.email||'',seat.plan_type||'']; }),
    ]);
    await delay(400);

    downloadCSV(`VedLibrary_Export_${d}_5_Notices.csv`, [
      ['Title','Content','Posted On'],
      ...allNotices.map(n=>[n.title,n.content,fmtTime(n.created_at)]),
    ]);

    showToast('✅ Export complete! 6 CSV files downloaded.', 'success');
  } catch (err) {
    showToast('Export failed: ' + err.message, 'error');
  } finally {
    if (btn) { btn.textContent = '📦 Export All Data'; btn.disabled = false; }
  }
}

async function downloadStudentDocs(uid) {
  const s = allStudents.find(x => x.uid === uid);
  if (!s?.photo_url && !s?.aadhaar_photo_url) { showToast('No documents for this student.', 'info'); return; }
  const name = (s.name || 'student').replace(/\s+/g,'_');
  if (s.photo_url)         downloadBase64(s.photo_url,         `VedLibrary_${name}_photo.png`);
  if (s.aadhaar_photo_url) { await delay(300); downloadBase64(s.aadhaar_photo_url, `VedLibrary_${name}_aadhaar.png`); }
}

async function downloadAllDocs() {
  const btn = $('download-docs-btn');
  if (btn) { btn.textContent = '⏳ Downloading...'; btn.disabled = true; }
  let count = 0;
  for (const s of allStudents) {
    const name = (s.name||'student').replace(/\s+/g,'_');
    if (s.photo_url)         { downloadBase64(s.photo_url,         `VedLibrary_Docs_${name}_photo.png`);   count++; await delay(200); }
    if (s.aadhaar_photo_url) { downloadBase64(s.aadhaar_photo_url, `VedLibrary_Docs_${name}_aadhaar.png`); count++; await delay(200); }
  }
  if (btn) { btn.textContent = '📁 Download All Docs'; btn.disabled = false; }
  showToast(count ? `✅ ${count} file(s) downloaded.` : 'No documents found.', count ? 'success' : 'info');
}

function downloadBase64(dataUrl, filename) {
  try { const a = document.createElement('a'); a.href = dataUrl; a.download = filename; a.click(); }
  catch (err) { console.error('Download error:', err); }
}

/* ══════════════════════════════════════════
   REGISTRATION
══════════════════════════════════════════ */
function handleFileUpload(input, type) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 300 * 1024) { showToast('File too large. Max 300KB.', 'error'); return; }
  const reader = new FileReader();
  reader.onloadend = () => {
    const b64 = reader.result;
    if (type === 'photo') {
      photoBase64 = b64;
      const prev = $('photo-preview');
      if (prev) { prev.src = b64; show('photo-preview'); hide('photo-placeholder'); show('remove-photo'); }
      $('photo-upload-area')?.classList.add('has-file');
    } else {
      aadhaarBase64 = b64;
      const prev = $('aadhaar-preview');
      if (prev) { prev.src = b64; show('aadhaar-preview'); hide('aadhaar-placeholder'); show('remove-aadhaar'); }
      $('aadhaar-upload-area')?.classList.add('has-file');
    }
  };
  reader.readAsDataURL(file);
}

function removeFile(e, type) {
  e.stopPropagation();
  if (type === 'photo') {
    photoBase64 = null; setVal('photo-input','');
    hide('photo-preview'); show('photo-placeholder'); hide('remove-photo');
    $('photo-upload-area')?.classList.remove('has-file');
  } else {
    aadhaarBase64 = null; setVal('aadhaar-input','');
    hide('aadhaar-preview'); show('aadhaar-placeholder'); hide('remove-aadhaar');
    $('aadhaar-upload-area')?.classList.remove('has-file');
  }
}

async function submitRegistration() {
  hide('reg-error');
  const phone   = $('reg-phone')?.value.replace(/\s/g,'') || '';
  const aadhaar = $('reg-aadhaar')?.value.replace(/\s/g,'') || '';
  const agreed  = $('reg-agree')?.checked;
  if (!phone || !aadhaar || !agreed || !photoBase64 || !aadhaarBase64) {
    showRegError('Please fill all fields, upload both photos, and agree to rules.'); return;
  }
  if (phone.length < 10 || phone.length > 15) { showRegError('Enter a valid phone number (10–15 digits).'); return; }
  if (aadhaar.length !== 12 || !/^\d+$/.test(aadhaar)) { showRegError('Enter a valid 12-digit Aadhaar number.'); return; }

  const btn = $('reg-submit-btn');
  if (btn) { btn.textContent = 'Completing Registration...'; btn.disabled = true; }
  try {
    const { error } = await db.from('users').update({
      phone, aadhaar_number:aadhaar, registration_completed:true,
      agreed_to_rules:true, photo_url:photoBase64, aadhaar_photo_url:aadhaarBase64,
    }).eq('uid', currentUser.id);
    if (error) throw error;
    const { data } = await db.from('users').select('*').eq('uid', currentUser.id).single();
    currentProfile = data;
    hide('reg-page');
    launchApp();
  } catch (err) {
    showRegError(err.message || 'Registration failed. Please try again.');
  } finally {
    if (btn) { btn.textContent = 'Complete Registration'; btn.disabled = false; }
  }
}

function showRegError(msg) { setText('reg-error', msg); show('reg-error'); }

/* ── Modals ──────────────────────────────────────────────────────────────── */
function closeModal(id) { hide(id); }
document.querySelectorAll('.overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) hide(el.id); });
});

/* ── Boot ────────────────────────────────────────────────────────────────── */
init();
