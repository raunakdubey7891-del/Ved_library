/* ═══════════════════════════════════════
   VED LIBRARY — script.js  v3.0
   + Active/Inactive students
   + Delete actually works
   + Day-wise data tracking
   + Monthly attendance circle graph
═══════════════════════════════════════ */

const SUPABASE_URL      = 'https://dmolzoagnzjwtrdroqeg.supabase.co';
const SUPABASE_ANON     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtb2x6b2Fnbnpqd3RyZHJvcWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODUxODEsImV4cCI6MjA5MDg2MTE4MX0.5Culb-inMvITeplysy6_BJJXngd_SPMWG13_hT0GV5w';
const ADMIN_EMAIL       = 'raunakdubey7891@gmail.com';
const LIBRARY_LAT       = 28.6139;
const LIBRARY_LON       = 77.2090;
const LIBRARY_RADIUS_KM = 0.5;

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
});

window.addEventListener('error', e => {
  const d = document.createElement('div');
  d.style = 'position:fixed;top:0;left:0;width:100%;background:#f43f5e;color:white;padding:12px;z-index:999999;font-size:12px;font-family:monospace;';
  d.textContent = 'JS Error: ' + (e.message || String(e));
  document.body.appendChild(d);
});
window.addEventListener('unhandledrejection', e => {
  const d = document.createElement('div');
  d.style = 'position:fixed;top:40px;left:0;width:100%;background:#f59e0b;color:white;padding:12px;z-index:999999;font-size:12px;font-family:monospace;';
  d.textContent = 'Promise Error: ' + (e.reason ? (e.reason.message || String(e.reason)) : String(e));
  document.body.appendChild(d);
});

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
let initDone       = false;
let studentSortField = 'status'; // 'status','name','expiry','due'
let studentSortDir   = 'asc';
let dayViewDate      = today();

const STUDY_PLANS = { full_time:'Full Time (12h)', shift_a:'Shift A (4h)', shift_b:'Shift B (4h)', custom:'Custom Shift' };
const PLAN_PRICES = { full_time:1200, shift_a:500, shift_b:500, custom:800 };

const $       = id  => document.getElementById(id);
const show    = id  => { const el=$(id); if(el) el.classList.remove('hidden'); };
const hide    = id  => { const el=$(id); if(el) el.classList.add('hidden'); };
const fmt     = iso => { if(!iso) return 'N/A'; try{ return new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); }catch{ return 'N/A'; } };
const fmtTime = iso => { if(!iso) return 'N/A'; try{ return new Date(iso).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}); }catch{ return 'N/A'; } };
function today(){ return new Date().toISOString().slice(0,10); }
const delay   = ms  => new Promise(r=>setTimeout(r,ms));
const safeSet = (id,val) => { const el=$(id); if(el) el.textContent=val; };
const esc     = s   => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ═══ AUTH ═══════════════════════════════ */
async function init() {
  show('loading-screen'); hide('auth-page'); hide('app'); hide('reg-page');
  if (window.location.search.includes('error')) {
    history.replaceState(null,'',window.location.pathname);
    hide('loading-screen'); show('auth-page'); return;
  }
  try {
    const { data:{ session }, error } = await db.auth.getSession();
    if (error) throw error;
    if (session?.user) { await onSignIn(session.user); }
    else { hide('loading-screen'); show('auth-page'); }
  } catch(err) { hide('loading-screen'); show('auth-page'); }

  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) { await onSignIn(session.user); }
    else if (event === 'SIGNED_OUT') {
      currentUser=null; currentProfile=null; initDone=false;
      if (adminChannel) { db.removeChannel(adminChannel); adminChannel=null; }
      hide('app'); hide('reg-page'); show('auth-page');
    }
  });
}

async function onSignIn(user) {
  if (initDone && currentUser?.id === user.id) return;
  try {
    currentUser = user;
    let { data:profile, error } = await db.from('users').select('*').eq('uid',user.id).single();
    if (error && error.code !== 'PGRST116') throw error;
    if (!profile) {
      const isAdmin = user.email === ADMIN_EMAIL;
      const np = { uid:user.id, name:user.user_metadata?.full_name||user.email, email:user.email, role:isAdmin?'admin':'student', created_at:new Date().toISOString() };
      const { data:created, error:insErr } = await db.from('users').insert(np).select().single();
      if (insErr) throw insErr;
      profile = created;
    }
    currentProfile = profile; initDone = true;
    hide('loading-screen'); hide('auth-page');
    if (profile.role === 'student' && !profile.registration_completed) { show('reg-page'); return; }
    launchApp();
  } catch(e) { currentUser=null; initDone=false; hide('loading-screen'); show('auth-page'); }
}

async function logout() {
  try { await db.auth.signOut(); } catch(e) {}
  location.reload();
}

$('google-login-btn').onclick = async () => {
  try {
    $('google-btn-text').textContent = 'Connecting…';
    $('google-login-btn').disabled = true;
    const redirectTo = window.location.origin + window.location.pathname;
    await db.auth.signInWithOAuth({ provider:'google', options:{ redirectTo } });
  } catch(e) {
    $('google-btn-text').textContent = 'Continue with Google';
    $('google-login-btn').disabled = false;
    alert('Login failed: ' + e.message);
  }
};

/* ═══ APP LAUNCH ══════════════════════════ */
function launchApp() {
  show('app');
  safeSet('nav-user-name', currentProfile.name);
  safeSet('brand-name-text', 'Ved Library');
  const roleEl = $('nav-user-role');
  if (roleEl) {
    roleEl.textContent = currentProfile.role === 'admin' ? 'Admin' : 'Student';
    roleEl.className = 'badge ' + (currentProfile.role === 'admin' ? 'badge-indigo' : 'badge-green');
  }
  const chipDot = $('chip-dot');
  if (chipDot) chipDot.style.background = currentProfile.role === 'admin' ? '#818cf8' : '#10d9a0';

  if (currentProfile.role === 'admin') { show('admin-dashboard'); loadAdminData(); }
  else { show('student-dashboard'); loadStudentData(); }
}

/* ═══ STUDENT DASHBOARD ═══════════════════ */
async function loadStudentData() {
  try {
    const p = currentProfile;
    safeSet('student-welcome', `Welcome back, ${p.name.split(' ')[0]} 👋`);
    safeSet('student-seat-num', p.seat_number || 'N/A');
    safeSet('student-plan-name', STUDY_PLANS[p.plan_id] || 'No plan');
    safeSet('amount-due', '₹' + (p.amount_due || 0));

    if (p.expiry_date) {
      const exp = new Date(p.expiry_date), diff = Math.max(0, Math.floor((exp - new Date()) / 86400000));
      safeSet('days-remaining', diff + ' Days');
      safeSet('expiry-text', 'Expiry: ' + fmt(p.expiry_date));
      const pbar = $('subscription-progress');
      if (pbar) pbar.style.width = Math.min(100,(diff/30)*100) + '%';
      safeSet('due-date-text', 'Due by ' + fmt(p.expiry_date));
    } else {
      safeSet('days-remaining', '0 Days');
      safeSet('expiry-text', 'Not set');
      safeSet('due-date-text', 'Contact admin');
    }
    const nextMonth = new Date(new Date().getFullYear(), new Date().getMonth()+1, 1);
    safeSet('days-next-month', Math.floor((nextMonth - new Date())/86400000) + ' Days');

    const { data:todayAttend } = await db.from('attendance').select('*').eq('uid',currentUser.id).eq('date',today()).maybeSingle();
    updateAttendanceUI(todayAttend ? todayAttend.status : null);
    await checkAndMarkAbsent();

    // Load attendance for circular graph
    await renderAttendanceGraph();

    const { data:notices } = await db.from('notices').select('*').order('created_at',{ ascending:false });
    allNotices = notices || [];
    renderNoticeList('student-notices-list', false);

    db.channel('student-rt')
      .on('postgres_changes',{ event:'*', schema:'public', table:'attendance', filter:`uid=eq.${currentUser.id}` }, async () => {
        try { const { data } = await db.from('attendance').select('*').eq('uid',currentUser.id).eq('date',today()).maybeSingle(); updateAttendanceUI(data ? data.status : null); await renderAttendanceGraph(); } catch(e){}
      })
      .on('postgres_changes',{ event:'*', schema:'public', table:'users', filter:`uid=eq.${currentUser.id}` }, async () => {
        try { const { data } = await db.from('users').select('*').eq('uid',currentUser.id).single(); if(data){ currentProfile=data; loadStudentData(); } } catch(e){}
      })
      .on('postgres_changes',{ event:'*', schema:'public', table:'notices' }, async () => {
        try { const { data } = await db.from('notices').select('*').order('created_at',{ ascending:false }); allNotices=data||[]; renderNoticeList('student-notices-list',false); } catch(e){}
      })
      .subscribe();
  } catch(e) { console.error('loadStudentData error:',e); }
}

/* ─── Attendance Circular Graph ─────────── */
async function renderAttendanceGraph() {
  const wrap = $('attendance-graph-wrap');
  if (!wrap) return;
  try {
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth();
    const monthStart = new Date(year, month, 1).toISOString().slice(0,10);
    const monthEnd   = new Date(year, month+1, 0).toISOString().slice(0,10);
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const todayDate = now.getDate();

    const { data:records } = await db.from('attendance')
      .select('date,status')
      .eq('uid', currentUser.id)
      .gte('date', monthStart)
      .lte('date', monthEnd);

    const attended = (records||[]).filter(r => r.status === 'present').length;
    const absent   = (records||[]).filter(r => r.status === 'absent').length;
    const totalSoFar = todayDate;
    const pct = totalSoFar > 0 ? Math.round((attended/totalSoFar)*100) : 0;

    const radius = 60, circ = 2 * Math.PI * radius;
    const offset = circ - (pct/100) * circ;
    const strokeColor = pct >= 75 ? '#10d9a0' : pct >= 50 ? '#f59e0b' : '#f43f5e';

    // Build mini day dots
    const dots = Array.from({length: daysInMonth}, (_,i) => {
      const d = i+1;
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const rec = (records||[]).find(r => r.date === dateStr);
      if (d > todayDate) return `<div class="att-day-sq future" title="Day ${d}"></div>`;
      if (rec?.status === 'present') return `<div class="att-day-sq present" title="Day ${d} — Present"></div>`;
      if (rec?.status === 'absent') return `<div class="att-day-sq absent" title="Day ${d} — Absent"></div>`;
      return `<div class="att-day-sq future" title="Day ${d}"></div>`;
    }).join('');

    const monthName = now.toLocaleString('en-IN', { month:'long', year:'numeric' });

    wrap.innerHTML = `
      <div class="att-graph-card">
        <div class="att-graph-inner">
          <div class="att-circle-wrap">
            <svg class="att-circle-svg" width="160" height="160" viewBox="0 0 160 160">
              <circle class="att-circle-bg" cx="80" cy="80" r="${radius}" stroke-width="12"/>
              <circle class="att-circle-fill" cx="80" cy="80" r="${radius}" stroke-width="12"
                stroke="${strokeColor}"
                stroke-dasharray="${circ}"
                stroke-dashoffset="${offset}"/>
            </svg>
            <div class="att-circle-center">
              <div class="att-circle-pct" style="color:${strokeColor}">${pct}%</div>
              <div class="att-circle-sub">Attendance</div>
            </div>
          </div>
          <div class="att-graph-details">
            <div class="att-month-title">📅 ${monthName}</div>
            <div class="att-legend-row">
              <div class="att-legend-dot" style="background:#10d9a0"></div>
              <span class="att-legend-label">Present</span>
              <span class="att-legend-val" style="color:#10d9a0">${attended}</span>
            </div>
            <div class="att-legend-row">
              <div class="att-legend-dot" style="background:#f43f5e"></div>
              <span class="att-legend-label">Absent</span>
              <span class="att-legend-val" style="color:#f43f5e">${absent}</span>
            </div>
            <div class="att-legend-row">
              <div class="att-legend-dot" style="background:#3d4f6e"></div>
              <span class="att-legend-label">Remaining</span>
              <span class="att-legend-val" style="color:#8896b3">${daysInMonth - todayDate}</span>
            </div>
            <div class="att-bar-label">This month</div>
            <div class="att-bar-track"><div class="att-bar-fill" style="width:${pct}%;background:${strokeColor}"></div></div>
            <div class="att-days-mini">${dots}</div>
          </div>
        </div>
      </div>`;
  } catch(e) { console.error('Graph error:',e); }
}

function updateAttendanceUI(status) {
  try {
    const dot = $('attend-status-dot'), text = $('attend-status-text'), btn = $('mark-attend-btn');
    if (!dot||!text||!btn) return;
    if (status === 'present') {
      dot.className='status-dot dot-green'; text.textContent='Present Today';
      btn.textContent='✓ Attendance Marked'; btn.disabled=true;
      btn.className='btn btn-full'; btn.style.cssText='background:rgba(16,217,160,.1);color:#10d9a0;cursor:default;width:100%;justify-content:center;padding:10px;border-radius:8px;font-weight:600;display:flex;align-items:center;border:1px solid rgba(16,217,160,.2)';
    } else if (status === 'absent') {
      dot.className='status-dot dot-red'; text.textContent='Marked Absent';
      btn.textContent='✗ Absent Today'; btn.disabled=true;
      btn.className='btn btn-full'; btn.style.cssText='background:rgba(244,63,94,.1);color:#fb7185;cursor:default;width:100%;justify-content:center;padding:10px;border-radius:8px;font-weight:600;display:flex;align-items:center;border:1px solid rgba(244,63,94,.2)';
    } else {
      dot.className='status-dot dot-amber'; text.textContent='Not Marked Yet';
      btn.textContent="Mark Today's Attendance"; btn.disabled=false;
      btn.className='btn btn-primary btn-full'; btn.style.cssText='';
    }
  } catch(e){}
}

async function checkAndMarkAbsent() {
  try {
    if (!currentProfile?.plan_id || !currentProfile?.session_start || !currentProfile?.expiry_date) return;
    const now = new Date();
    if (now.getHours() < 21) return;
    const sessionStart = new Date(currentProfile.session_start), expiryDate = new Date(currentProfile.expiry_date);
    if (now < sessionStart || now > expiryDate) return;
    const { data:existing } = await db.from('attendance').select('*').eq('uid',currentUser.id).eq('date',today()).maybeSingle();
    if (existing) return;
    await db.from('attendance').upsert({ id:`${currentUser.id}_${today()}`, uid:currentUser.id, date:today(), timestamp:new Date().toISOString(), status:'absent' });
  } catch(e){}
}

async function markAttendance() {
  hide('student-location-error');
  try {
    const loc = await getLocation();
    if (!isAtLibrary(loc.lat, loc.lon)) { showErr('student-location-error','You must be at the library to mark attendance.'); return; }
    await db.from('attendance').upsert({ id:`${currentUser.id}_${today()}`, uid:currentUser.id, date:today(), timestamp:new Date().toISOString(), status:'present' });
    updateAttendanceUI('present');
    await renderAttendanceGraph();
  } catch(e) { showErr('student-location-error', e.message || 'Location error. Please allow location access.'); }
}

function getLocation() {
  return new Promise((res,rej) => {
    if (!navigator.geolocation) { rej(new Error('Geolocation not supported.')); return; }
    navigator.geolocation.getCurrentPosition(p => res({lat:p.coords.latitude,lon:p.coords.longitude}), () => rej(new Error('Could not get location. Please allow access.')));
  });
}

function isAtLibrary(lat,lon) {
  const R=6371, dLat=(lat-LIBRARY_LAT)*Math.PI/180, dLon=(lon-LIBRARY_LON)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(LIBRARY_LAT*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)) <= LIBRARY_RADIUS_KM;
}

function showPaymentModal() {
  const amt = currentProfile.amount_due || 0;
  const qr=$('payment-qr'), link=$('payment-upi-link'), desc=$('payment-modal-desc'), utr=$('utr-input');
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
  if (btn) { btn.textContent='Submitting…'; btn.disabled=true; }
  try {
    await db.from('payments').insert({ uid:currentUser.id, amount:currentProfile.amount_due||0, transaction_id:utr, status:'pending', timestamp:new Date().toISOString() });
    closeModal('payment-modal');
    alert('Payment submitted! Admin will verify it soon.');
  } catch(e) { alert('Failed: '+e.message); }
  finally { if(btn){ btn.textContent='Submit Payment Details'; btn.disabled=false; } }
}

/* ═══ ADMIN DASHBOARD ══════════════════════ */
async function loadAdminData() {
  try {
    await Promise.all([fetchStudents(), fetchSeats(), fetchPayments(), fetchAttendance(), fetchNotices()]);
    renderAll();
    if (adminChannel) db.removeChannel(adminChannel);
    adminChannel = db.channel('admin-rt')
      .on('postgres_changes',{ event:'*', schema:'public', table:'users' },      async () => { try { await fetchStudents(); renderAll(); } catch(e){} })
      .on('postgres_changes',{ event:'*', schema:'public', table:'seats' },      async () => { try { await Promise.all([fetchSeats(),fetchStudents()]); renderAll(); } catch(e){} })
      .on('postgres_changes',{ event:'*', schema:'public', table:'payments' },   async () => { try { await fetchPayments(); renderAll(); } catch(e){} })
      .on('postgres_changes',{ event:'*', schema:'public', table:'attendance' }, async () => { try { await fetchAttendance(); renderAll(); } catch(e){} })
      .on('postgres_changes',{ event:'*', schema:'public', table:'notices' },    async () => { try { await fetchNotices(); renderAll(); } catch(e){} })
      .subscribe();
  } catch(e) { console.error('loadAdminData error:',e); }
}

async function fetchStudents()   { try { const { data } = await db.from('users').select('*').eq('role','student').order('name'); allStudents = data||[]; } catch(e){} }
async function fetchSeats()      { try { const { data } = await db.from('seats').select('*').order('number'); allSeats = data||[]; } catch(e){} }
async function fetchPayments()   { try { const { data } = await db.from('payments').select('*').order('timestamp',{ ascending:false }); allPayments = data||[]; } catch(e){} }
async function fetchAttendance() { try { const { data } = await db.from('attendance').select('*').order('timestamp',{ ascending:false }); allAttendance = data||[]; } catch(e){} }
async function fetchNotices()    { try { const { data } = await db.from('notices').select('*').order('created_at',{ ascending:false }); allNotices = data||[]; } catch(e){} }

function renderAll() {
  try { renderStudentTable(); } catch(e){}
  try { renderSeats(); } catch(e){}
  try { renderPayments(); } catch(e){}
  try { renderAttendanceList(); } catch(e){}
  try { renderNoticeList('admin-notices-list',true); } catch(e){}
  try { renderStats(); } catch(e){}
  try { renderDayPanel(); } catch(e){}
}

/* ─── Students table with active/inactive ── */
function setSortField(field) {
  if (studentSortField === field) { studentSortDir = studentSortDir === 'asc' ? 'desc' : 'asc'; }
  else { studentSortField = field; studentSortDir = 'asc'; }
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  const btn = $('sort-' + field);
  if (btn) btn.classList.add('active');
  renderStudentTable();
}

function renderStudentTable() {
  const q = ($('student-search')?.value||'').toLowerCase();
  let list = allStudents.filter(s => !q || s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.seat_number?.toLowerCase().includes(q));

  // Sort: active always first, then by chosen field
  list = list.sort((a,b) => {
    const aActive = a.status !== 'inactive';
    const bActive = b.status !== 'inactive';
    if (aActive !== bActive) return aActive ? -1 : 1; // active on top

    let av, bv;
    if (studentSortField === 'name') { av=(a.name||'').toLowerCase(); bv=(b.name||'').toLowerCase(); }
    else if (studentSortField === 'expiry') { av=a.expiry_date||''; bv=b.expiry_date||''; }
    else if (studentSortField === 'due') { av=a.amount_due||0; bv=b.amount_due||0; }
    else { av=(a.name||'').toLowerCase(); bv=(b.name||'').toLowerCase(); }

    if (av < bv) return studentSortDir === 'asc' ? -1 : 1;
    if (av > bv) return studentSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const tbody = $('students-tbody');
  if (!tbody) return;
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--t3);padding:32px;font-size:13px">No students found.</td></tr>'; return; }

  tbody.innerHTML = list.map(s => {
    const isExp = s.expiry_date && new Date(s.expiry_date) < new Date();
    const isInactive = s.status === 'inactive';
    const dotClass = isInactive ? 'sdot sdot-inactive' : 'sdot sdot-active';
    const toggleLabel = isInactive ? 'Set Active' : 'Set Inactive';
    const toggleClass = isInactive ? 'btn btn-status-toggle btn-set-active' : 'btn btn-status-toggle btn-set-inactive';
    return `<tr class="${isInactive ? 'student-inactive' : ''}">
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="${dotClass}" title="${isInactive?'Inactive':'Active'}"></span>
          <div>
            <div style="font-weight:600">${esc(s.name)}</div>
            <div style="font-size:12px;color:var(--t2)">${esc(s.email)}</div>
          </div>
        </div>
      </td>
      <td><span class="badge badge-indigo">${esc(s.seat_number||'None')}</span></td>
      <td style="font-size:13px;color:var(--t2)">${esc(STUDY_PLANS[s.plan_id]||'—')}</td>
      <td style="font-size:12px;color:var(--t3)">${s.session_start?fmt(s.session_start):'Not set'}</td>
      <td style="font-size:13px;color:${isExp?'#fb7185':'var(--t2)'};font-weight:${isExp?'600':'400'}">${fmt(s.expiry_date)}${isExp?' ⚠':''}</td>
      <td style="font-weight:600;color:${(s.amount_due||0)>0?'#fb7185':'#10d9a0'}">₹${s.amount_due||0}</td>
      <td><button class="${toggleClass}" onclick="toggleStudentStatus('${s.uid}','${isInactive?'active':'inactive'}')">${toggleLabel}</button></td>
      <td class="text-right" style="white-space:nowrap">
        <button class="btn btn-ghost btn-icon" title="Docs" onclick="downloadStudentDocs('${s.uid}')">📥</button>
        <button class="btn btn-ghost btn-icon" title="Edit" onclick="openEditModal('${s.uid}')" style="margin-left:4px">✏️</button>
      </td>
    </tr>`;
  }).join('');
}

/* ─── Toggle student active/inactive ─────── */
async function toggleStudentStatus(uid, newStatus) {
  try {
    await db.from('users').update({ status: newStatus }).eq('uid', uid);
    await fetchStudents();
    renderStudentTable();
    renderStats();
  } catch(e) { alert('Failed to update status: ' + e.message); }
}

/* ─── Day-wise data panel ────────────────── */
function renderDayPanel() {
  const el = $('day-panel-wrap');
  if (!el) return;

  const d = dayViewDate;
  const dayAttend = allAttendance.filter(a => a.date === d);
  const presentUids = new Set(dayAttend.filter(a => a.status==='present').map(a => a.uid));
  const absentUids  = new Set(dayAttend.filter(a => a.status==='absent').map(a => a.uid));
  const dayPayments = allPayments.filter(p => p.timestamp && p.timestamp.slice(0,10) === d);
  const dayLabel = d === today() ? 'Today' : new Date(d+'T00:00:00').toLocaleDateString('en-IN',{ weekday:'long', day:'numeric', month:'long', year:'numeric' });

  const rows = allStudents.map(s => {
    const isPresent = presentUids.has(s.uid);
    const isAbsent  = absentUids.has(s.uid);
    const statusBadge = isPresent
      ? '<span class="badge badge-active">Present</span>'
      : isAbsent ? '<span class="badge badge-inactive">Absent</span>'
      : '<span class="badge" style="background:var(--glass2);color:var(--t3);border:1px solid var(--bd)">—</span>';
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="${s.status==='inactive'?'sdot sdot-inactive':'sdot sdot-active'}"></span>
          <div>
            <div style="font-weight:600">${esc(s.name)}</div>
            <div style="font-size:12px;color:var(--t2)">${esc(s.email)}</div>
          </div>
        </div>
      </td>
      <td>${statusBadge}</td>
      <td style="font-size:12px;color:var(--t2)">${esc(s.seat_number||'—')}</td>
      <td style="font-size:12px;color:var(--t2)">${esc(STUDY_PLANS[s.plan_id]||'—')}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="day-panel">
      <div class="day-panel-header">
        <div>
          <div class="day-panel-date">📆 ${dayLabel}</div>
          <div class="day-panel-sub">Daily snapshot — all student records</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="date" class="date-filter-input" id="day-date-picker" value="${d}" onchange="setDayView(this.value)" max="${today()}"/>
          <button class="btn btn-ghost btn-sm" onclick="setDayView(today())" ${d===today()?'disabled':''}>Today</button>
        </div>
      </div>
      <div class="day-stats" style="margin-bottom:20px">
        <div class="day-stat"><div class="day-stat-num">${presentUids.size}</div><div class="day-stat-lbl">Present</div></div>
        <div class="day-stat"><div class="day-stat-num" style="color:#fb7185">${absentUids.size}</div><div class="day-stat-lbl">Absent</div></div>
        <div class="day-stat"><div class="day-stat-num" style="color:#f59e0b">${allStudents.length - presentUids.size - absentUids.size}</div><div class="day-stat-lbl">Not Marked</div></div>
        <div class="day-stat"><div class="day-stat-num" style="color:#818cf8">${dayPayments.length}</div><div class="day-stat-lbl">Payments</div></div>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Student</th><th>Status</th><th>Seat</th><th>Plan</th></tr></thead>
        <tbody>${rows||'<tr><td colspan="4" class="empty-text">No student data</td></tr>'}</tbody>
      </table></div>
    </div>`;
}

function setDayView(date) {
  dayViewDate = date;
  renderDayPanel();
}

/* ─── Seats ────────────────────────────── */
function renderSeats() {
  const filter = $('seat-filter')?.value || 'all';
  const list = allSeats.filter(s => filter==='all'||s.status===filter);
  const grid = $('seats-grid');
  if (!grid) return;
  if (!list.length) { grid.innerHTML='<div class="empty-text">No seats.</div>'; return; }
  const occupiedUids = allSeats.filter(s=>s.status==='occupied').map(s=>s.occupied_by);
  const freeStudents = allStudents.filter(s=>!occupiedUids.includes(s.uid) && s.status!=='inactive');
  const PLAN_COLORS = { 'Full Time (12h)':'plan-fulltime','Shift A (4h)':'plan-shifta','Shift B (4h)':'plan-shiftb','Custom Shift':'plan-custom','N/A':'' };
  grid.innerHTML = list.map(seat => {
    const student = allStudents.find(s=>s.uid===seat.occupied_by);
    const isOcc = seat.status === 'occupied';
    const planClass = PLAN_COLORS[seat.plan_type]||'';
    const opts = freeStudents.map(s=>`<option value="${s.uid}">${esc(s.name)} — ${esc(STUDY_PLANS[s.plan_id]||'No plan')}</option>`).join('');
    return `<div class="s-card ${isOcc?'occ '+planClass:''}">
      <div class="s-card-top">
        <span class="s-num ${isOcc?'occ':'free'}">${esc(seat.number)}</span>
        <div class="s-actions">
          <button class="btn btn-icon btn-ghost" onclick="removeSeat('${seat.id}')" title="Delete">🗑</button>
          ${isOcc?`<button class="btn btn-icon btn-no" title="Free" onclick="toggleSeat('${seat.id}','${seat.status}','${seat.occupied_by||''}')">✕</button>`:''}
        </div>
      </div>
      ${isOcc
        ?`<div class="s-student">${esc(student?.name||'Assigned')}</div><div class="s-plan-badge ${planClass}-badge">${esc(seat.plan_type||'—')}</div>`
        :`<div class="s-empty">Unassigned</div><select class="s-sel" onchange="assignSeat('${seat.id}',this.value)"><option value="" disabled selected>Assign student…</option>${opts}</select>`}
    </div>`;
  }).join('');
}

/* ─── Payments ─────────────────────────── */
function renderPayments() {
  const el = $('payments-list');
  if (!el) return;
  const pending = allPayments.filter(p=>p.status==='pending');
  const history = allPayments.filter(p=>p.status!=='pending');
  el.innerHTML = `
    <div class="payment-section-title">⏳ Pending Requests (${pending.length})</div>
    <div>${pending.length?pending.map(p=>paymentHTML(p,true)).join(''):'<div class="empty-text">No pending requests.</div>'}</div>
    <div class="payment-section-title" style="margin-top:4px">📋 Payment History</div>
    <div>${history.length?history.map(p=>paymentHTML(p,false)).join(''):'<div class="empty-text">No history yet.</div>'}</div>`;
}

function paymentHTML(p, showActions) {
  const s = allStudents.find(x=>x.uid===p.uid);
  const badge = p.status==='verified'?'<span class="badge badge-active">Verified</span>':p.status==='rejected'?'<span class="badge badge-red">Rejected</span>':'<span class="badge badge-amber">Pending</span>';
  return `<div class="pay-item">
    <div class="pay-item-left">
      <div class="pay-av">${esc((s?.name||'?').charAt(0))}</div>
      <div><div class="pay-name">${esc(s?.name||'Unknown')}</div><div class="pay-meta">UTR: ${esc(p.transaction_id)} · ₹${p.amount} · ${fmtTime(p.timestamp)}</div></div>
    </div>
    <div class="pay-item-actions">
      ${showActions
        ?`<button class="btn btn-verify btn-sm" onclick="verifyPayment('${p.id}','verified','${p.uid}')">✓ Verify</button><button class="btn btn-reject btn-sm" onclick="verifyPayment('${p.id}','rejected','${p.uid}')">✕ Reject</button>`
        :badge}
    </div>
  </div>`;
}

/* ─── Attendance list ───────────────────── */
function renderAttendanceList() {
  const el = $('attendance-list');
  if (!el) return;
  if (!allAttendance.length) { el.innerHTML='<div class="empty-text">No records yet.</div>'; return; }
  el.innerHTML = allAttendance.map(a => {
    const s = allStudents.find(x=>x.uid===a.uid);
    const isAbsent = a.status === 'absent';
    return `<div class="att-item">
      <div class="att-av" style="${isAbsent?'background:rgba(244,63,94,.1);color:#fb7185':''}">${esc((s?.name||'?').charAt(0))}</div>
      <div style="flex:1"><div class="att-name">${esc(s?.name||'Unknown')}</div><div class="att-time">${fmtTime(a.timestamp)}</div></div>
      <span class="${isAbsent?'att-abs':'att-tick'}">${isAbsent?'✗':'✓'}</span>
    </div>`;
  }).join('');
}

/* ─── Notices ──────────────────────────── */
function renderNoticeList(elId, isAdmin) {
  const el = $(elId);
  if (!el) return;
  if (!allNotices.length) { el.innerHTML='<div class="empty-text">No notices.</div>'; return; }
  el.innerHTML = allNotices.map(n => `<div class="notice-card">
    <div class="notice-card-header">
      <div class="notice-title">${esc(n.title)}</div>
      <span class="notice-date">${fmtTime(n.created_at)}</span>
    </div>
    <div class="notice-body">${esc(n.content)}</div>
    ${isAdmin?`<button class="notice-delete" onclick="deleteNotice('${n.id}')" title="Delete">🗑</button>`:''}
  </div>`).join('');
}

/* ─── Stats ────────────────────────────── */
function renderStats() {
  const activeStudents = allStudents.filter(s=>s.status!=='inactive');
  const inactiveStudents = allStudents.filter(s=>s.status==='inactive');
  safeSet('stat-students', allStudents.length);
  safeSet('stat-active-students', activeStudents.length);
  safeSet('stat-inactive-students', inactiveStudents.length);
  safeSet('stat-today', new Set(allAttendance.filter(a=>a.date===today()&&a.status==='present').map(a=>a.uid)).size);
  safeSet('stat-occupied', allSeats.filter(s=>s.status==='occupied').length);
  safeSet('stat-available', allSeats.filter(s=>s.status==='available').length);
  safeSet('stat-revenue', '₹'+allPayments.filter(p=>p.status==='verified').reduce((sum,p)=>sum+p.amount,0));
  safeSet('stat-pending-due', '₹'+allStudents.reduce((sum,s)=>sum+(s.amount_due||0),0));
}

/* ═══ ADMIN ACTIONS ════════════════════════ */
async function verifyPayment(id, status, uid) {
  try {
    await db.from('payments').update({ status }).eq('id',id);
    if (status==='verified') await db.from('users').update({ amount_due:0 }).eq('uid',uid);
    await Promise.all([fetchPayments(),fetchStudents()]);
    renderAll();
  } catch(e) { alert('Failed: '+e.message); }
}

/* ─── Edit student ─────────────────────── */
function openEditModal(uid) {
  const s = allStudents.find(x=>x.uid===uid);
  if (!s) return;
  const fields = {
    'edit-uid':uid,'edit-name':s.name,'edit-phone':s.phone||'',
    'edit-aadhaar-view':s.aadhaar_number||'','edit-seat':s.seat_number||'',
    'edit-plan':s.plan_id||'','edit-amount-due':s.amount_due||0,
    'edit-session-start':s.session_start?s.session_start.slice(0,10):'',
    'edit-expiry':s.expiry_date?s.expiry_date.slice(0,10):''
  };
  Object.entries(fields).forEach(([id,val]) => { const el=$(id); if(el) el.value=val; });
  show('edit-student-modal');
}

const sessionInput = $('edit-session-start');
if (sessionInput) sessionInput.addEventListener('change', function(){
  if (!this.value) return;
  const exp = new Date(this.value); exp.setDate(exp.getDate()+30);
  const expiryEl = $('edit-expiry'); if(expiryEl) expiryEl.value = exp.toISOString().slice(0,10);
  const planEl = $('edit-plan'); if(planEl && PLAN_PRICES[planEl.value]){ const amt=$('edit-amount-due'); if(amt) amt.value=PLAN_PRICES[planEl.value]; }
});

const planInput = $('edit-plan');
if (planInput) planInput.addEventListener('change', function(){
  const sess=$('edit-session-start'); if(sess?.value && PLAN_PRICES[this.value]){ const amt=$('edit-amount-due'); if(amt) amt.value=PLAN_PRICES[this.value]; }
});

async function saveStudentEdit() {
  try {
    const uid = $('edit-uid')?.value;
    const sessionStart = $('edit-session-start')?.value;
    const expiryDate = $('edit-expiry')?.value;
    const newSeatNum = ($('edit-seat')?.value||'').trim();
    const oldStudent = allStudents.find(s=>s.uid===uid);
    await db.from('users').update({
      seat_number:newSeatNum||null, plan_id:$('edit-plan')?.value||null,
      session_start:sessionStart||null, expiry_date:expiryDate||null,
      amount_due:parseInt($('edit-amount-due')?.value)||0
    }).eq('uid',uid);
    if (oldStudent && oldStudent.seat_number !== newSeatNum) {
      if (oldStudent.seat_number) { const old=allSeats.find(s=>s.number===oldStudent.seat_number); if(old) await db.from('seats').update({status:'available',occupied_by:null,plan_type:null}).eq('id',old.id); }
      if (newSeatNum) { const nw=allSeats.find(s=>s.number===newSeatNum); if(nw&&nw.status==='available'){ await db.from('seats').update({status:'occupied',occupied_by:uid,plan_type:STUDY_PLANS[$('edit-plan')?.value]||'N/A'}).eq('id',nw.id); } else if(newSeatNum){ alert(`Seat ${newSeatNum} is not available or doesn't exist.`); } }
    }
    await Promise.all([fetchStudents(),fetchSeats()]);
    renderAll();
    closeModal('edit-student-modal');
  } catch(e) { alert('Save failed: '+e.message); }
}

/* ─── Delete student — with custom confirm ─ */
async function deleteStudent() {
  const uid = $('edit-uid')?.value;
  const s = allStudents.find(x=>x.uid===uid);
  if (!s) return;

  // Show custom confirm dialog instead of browser confirm
  showDeleteConfirm(s, async () => {
    try {
      const btn = $('delete-student-btn');
      if (btn) { btn.textContent='Removing…'; btn.disabled=true; }
      if (s.seat_number) { const seat=allSeats.find(x=>x.number===s.seat_number); if(seat) await db.from('seats').update({status:'available',occupied_by:null,plan_type:null}).eq('id',seat.id); }
      await db.from('attendance').delete().eq('uid',uid);
      await db.from('payments').delete().eq('uid',uid);
      const { error } = await db.from('users').delete().eq('uid',uid);
      if (error) throw error;
      await Promise.all([fetchStudents(),fetchSeats(),fetchPayments(),fetchAttendance()]);
      renderAll();
      closeModal('edit-student-modal');
      showToast(`${s.name} has been removed.`, 'success');
    } catch(e) {
      showToast('Failed to remove: ' + e.message, 'error');
      const btn = $('delete-student-btn');
      if (btn) { btn.textContent='Remove Student'; btn.disabled=false; }
    }
  });
}

function showDeleteConfirm(student, onConfirm) {
  // Remove existing confirm if any
  const existing = $('custom-confirm-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.id = 'custom-confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <div class="confirm-icon">⚠️</div>
      <div class="confirm-title">Remove Student?</div>
      <div class="confirm-msg">
        This will permanently remove <span class="confirm-student-name">${esc(student.name)}</span> from the system.<br><br>
        Their seat will be freed, and all attendance & payment records will be deleted. This cannot be undone.
      </div>
      <div class="confirm-actions">
        <button class="btn btn-ghost" id="confirm-cancel-btn">Cancel</button>
        <button class="btn btn-danger" id="confirm-delete-btn">Yes, Remove</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  $('confirm-cancel-btn').onclick = () => overlay.remove();
  $('confirm-delete-btn').onclick = () => { overlay.remove(); onConfirm(); };
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function showToast(msg, type='success') {
  const t = document.createElement('div');
  t.style = `position:fixed;bottom:24px;right:24px;background:${type==='success'?'rgba(16,217,160,.15)':'rgba(244,63,94,.15)'};color:${type==='success'?'#10d9a0':'#fb7185'};border:1px solid ${type==='success'?'rgba(16,217,160,.3)':'rgba(244,63,94,.3)'};padding:14px 20px;border-radius:12px;font-size:14px;font-weight:600;z-index:3000;backdrop-filter:blur(10px);box-shadow:0 8px 24px rgba(0,0,0,.4);max-width:320px`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

/* ─── Seats ─────────────────────────────── */
function showAddSeatModal() { const el=$('new-seat-num'); if(el) el.value=''; show('add-seat-modal'); }
async function addSeat() {
  try {
    const num = ($('new-seat-num')?.value||'').trim();
    if (!num) return;
    if (allSeats.find(s=>s.number===num)) { alert(`Seat ${num} already exists!`); return; }
    await db.from('seats').insert({ id:`seat_${Date.now()}`, number:num, status:'available' });
    await fetchSeats(); renderSeats(); closeModal('add-seat-modal');
  } catch(e) { alert('Failed: '+e.message); }
}

async function toggleSeat(id, currentStatus, occupiedBy) {
  try {
    const seat = allSeats.find(s=>s.id===id);
    if (!seat) { alert('Seat not found'); return; }
    if (currentStatus === 'available') { alert('Please use the dropdown to select a student for this seat'); return; }
    if (!confirm(`Free seat ${seat.number}?`)) return;
    await db.from('seats').update({status:'available',occupied_by:null,plan_type:null}).eq('id',id);
    if (occupiedBy) { await db.from('users').update({seat_number:null}).eq('uid',occupiedBy); }
    await Promise.all([fetchSeats(),fetchStudents()]); renderSeats(); renderStudentTable();
  } catch(e) { alert('Failed: '+e.message); }
}

async function assignSeat(seatId, studentUid) {
  try {
    if (!seatId||!studentUid) { alert('Invalid seat or student'); return; }
    const student=allStudents.find(s=>s.uid===studentUid), seat=allSeats.find(s=>s.id===seatId);
    if (!student||!seat) { alert('Not found'); return; }
    if (seat.status !== 'available') { alert(`Seat ${seat.number} is already occupied.`); return; }
    await db.from('seats').update({status:'occupied',occupied_by:studentUid,plan_type:STUDY_PLANS[student.plan_id]||'N/A'}).eq('id',seatId);
    await db.from('users').update({seat_number:seat.number}).eq('uid',studentUid);
    const prev = allSeats.find(s=>s.number===student.seat_number&&s.id!==seatId);
    if (prev) await db.from('seats').update({status:'available',occupied_by:null,plan_type:null}).eq('id',prev.id);
    await Promise.all([fetchSeats(),fetchStudents()]); renderSeats(); renderStudentTable();
  } catch(e) { alert('Failed to assign seat: '+e.message); }
}

async function removeSeat(id) {
  if (!confirm('Delete this seat?')) return;
  try {
    const seat = allSeats.find(s=>s.id===id);
    if (seat?.occupied_by) await db.from('users').update({seat_number:null}).eq('uid',seat.occupied_by);
    await db.from('seats').delete().eq('id',id);
    await Promise.all([fetchSeats(),fetchStudents()]); renderSeats(); renderStudentTable();
  } catch(e) { alert('Failed: '+e.message); }
}

/* ─── Notices ───────────────────────────── */
function showAddNoticeModal() { const t=$('notice-title-input'),c=$('notice-content-input'); if(t) t.value=''; if(c) c.value=''; show('add-notice-modal'); }
async function addNotice() {
  try {
    const title=($('notice-title-input')?.value||'').trim(), content=($('notice-content-input')?.value||'').trim();
    if (!title||!content) return;
    await db.from('notices').insert({ title, content, created_at:new Date().toISOString(), author_id:currentUser.id });
    await fetchNotices(); renderNoticeList('admin-notices-list',true); renderNoticeList('student-notices-list',false); closeModal('add-notice-modal');
  } catch(e) { alert('Failed: '+e.message); }
}
async function deleteNotice(id) {
  if (!confirm('Delete this notice?')) return;
  try {
    await db.from('notices').delete().eq('id',id);
    await fetchNotices(); renderNoticeList('admin-notices-list',true); renderNoticeList('student-notices-list',false);
  } catch(e) { alert('Failed: '+e.message); }
}

/* ─── Tab switching ─────────────────────── */
function switchTab(event, tab) {
  document.querySelectorAll('.tab-pane').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(el=>el.classList.remove('active'));
  const tc=$('tab-'+tab); if(tc) tc.classList.add('active');
  if (event?.target) event.target.classList.add('active');
}

/* ═══ EXPORTS ══════════════════════════════ */
function makeCSV(rows){ return rows.map(r=>r.map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n'); }
function downloadCSV(filename,rows){ const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(makeCSV(rows)); a.download=filename; a.click(); }

function exportCSV(type) {
  try {
    if (type==='students') downloadCSV(`VedLibrary_Students_${today()}.csv`,[
      ['Name','Email','Phone','Aadhaar','Seat','Plan','Session Start','Expiry','Due','Status'],
      ...allStudents.map(s=>[s.name,s.email,s.phone||'',s.aadhaar_number||'',s.seat_number||'',STUDY_PLANS[s.plan_id]||'',s.session_start?fmt(s.session_start):'',s.expiry_date?fmt(s.expiry_date):'',s.amount_due||0,s.status||'active'])
    ]);
    else if (type==='attendance') downloadCSV(`VedLibrary_Attendance_${today()}.csv`,[
      ['Student','Email','Date','Time','Status'],
      ...allAttendance.map(a=>{ const s=allStudents.find(x=>x.uid===a.uid); return [s?.name||'Unknown',s?.email||'',a.date,a.timestamp?new Date(a.timestamp).toLocaleTimeString():'',a.status]; })
    ]);
    else if (type==='payments') downloadCSV(`VedLibrary_Payments_${today()}.csv`,[
      ['Student','Email','Amount','UTR','Status','Date'],
      ...allPayments.map(p=>{ const s=allStudents.find(x=>x.uid===p.uid); return [s?.name||'Unknown',s?.email||'',p.amount,p.transaction_id,p.status,fmtTime(p.timestamp)]; })
    ]);
  } catch(e) { alert('Export failed: '+e.message); }
}

async function exportAllData() {
  const btn=$('export-all-btn');
  if (btn){ btn.textContent='Exporting…'; btn.disabled=true; }
  try {
    const d=today(), totalRev=allPayments.filter(p=>p.status==='verified').reduce((s,p)=>s+p.amount,0), totalDue=allStudents.reduce((s,x)=>s+(x.amount_due||0),0);
    downloadCSV(`VedLibrary_Export_${d}/00_Summary.csv`,[
      ['Metric','Value'],['Export Date',d],['Total Students',allStudents.length],['Active Students',allStudents.filter(s=>s.status!=='inactive').length],['Inactive Students',allStudents.filter(s=>s.status==='inactive').length],
      ['Occupied Seats',allSeats.filter(s=>s.status==='occupied').length],['Available Seats',allSeats.filter(s=>s.status==='available').length],
      ['Today Attendance',new Set(allAttendance.filter(a=>a.date===today()&&a.status==='present').map(a=>a.uid)).size],
      ['Total Verified Revenue (₹)',totalRev],['Total Amount Due (₹)',totalDue]
    ]);
    await delay(400);
    downloadCSV(`VedLibrary_Export_${d}/01_Students.csv`,[
      ['Name','Email','Phone','Aadhaar','Seat','Plan','Session Start','Expiry','Due','Status','Registered','Joined'],
      ...allStudents.map(s=>[s.name,s.email,s.phone||'',s.aadhaar_number||'',s.seat_number||'',STUDY_PLANS[s.plan_id]||'',s.session_start?fmt(s.session_start):'',s.expiry_date?fmt(s.expiry_date):'',s.amount_due||0,s.status||'active',s.registration_completed?'Yes':'No',fmt(s.created_at)])
    ]);
    await delay(400);
    downloadCSV(`VedLibrary_Export_${d}/02_Payments.csv`,[
      ['Student','Email','Amount','UTR','Status','Date'],
      ...allPayments.map(p=>{ const s=allStudents.find(x=>x.uid===p.uid); return [s?.name||'Unknown',s?.email||'',p.amount,p.transaction_id,p.status,fmtTime(p.timestamp)]; })
    ]);
    await delay(400);
    downloadCSV(`VedLibrary_Export_${d}/03_Attendance.csv`,[
      ['Student','Email','Date','Time','Status'],
      ...allAttendance.map(a=>{ const s=allStudents.find(x=>x.uid===a.uid); return [s?.name||'Unknown',s?.email||'',a.date,a.timestamp?new Date(a.timestamp).toLocaleTimeString():'',a.status]; })
    ]);
    showToast('All data exported successfully!','success');
  } catch(e) { alert('Export failed: '+e.message); }
  finally { if(btn){ btn.textContent='Export All'; btn.disabled=false; } }
}

async function downloadStudentDocs(uid) {
  const s=allStudents.find(x=>x.uid===uid);
  if (!s?.photo_url&&!s?.aadhaar_photo_url){ alert('No documents for this student.'); return; }
  const name=s.name.replace(/\s+/g,'_');
  if (s.photo_url) downloadBase64(s.photo_url,`VedLibrary_Docs/${name}/photo.png`);
  if (s.aadhaar_photo_url){ await delay(300); downloadBase64(s.aadhaar_photo_url,`VedLibrary_Docs/${name}/aadhaar.pdf`); }
}

async function downloadAllDocs() {
  const btn=$('download-docs-btn');
  if (btn){ btn.textContent='Downloading…'; btn.disabled=true; }
  let count=0;
  try {
    for (const s of allStudents) {
      const name=s.name.replace(/\s+/g,'_');
      if (s.photo_url){ downloadBase64(s.photo_url,`VedLibrary_Docs/${name}/photo.png`); count++; await delay(200); }
      if (s.aadhaar_photo_url){ downloadBase64(s.aadhaar_photo_url,`VedLibrary_Docs/${name}/aadhaar.pdf`); count++; await delay(200); }
    }
    if (!count) alert('No documents found.');
    else showToast(`${count} file(s) downloaded.`,'success');
  } catch(e){ alert('Download failed: '+e.message); }
  finally { if(btn){ btn.textContent='↓ Docs'; btn.disabled=false; } }
}

function downloadBase64(dataUrl,filename){ const a=document.createElement('a'); a.href=dataUrl; a.download=filename; a.click(); }

/* ═══ REGISTRATION ═════════════════════════ */
function handleFileUpload(input, type) {
  const file = input.files[0];
  if (!file) return;
  if (type==='photo'){ if (!file.type.startsWith('image/')){ alert('Please upload an image for Profile Photo.'); input.value=''; return; } }
  else { if (file.type!=='application/pdf'){ alert('Please upload a PDF for Aadhaar.'); input.value=''; return; } }
  if (file.size>100*1024){ alert('File too large. Maximum 100KB.'); input.value=''; return; }
  const reader=new FileReader();
  reader.onloadend=() => {
    const b64=reader.result;
    if (type==='photo'){ photoBase64=b64; const p=$('photo-preview'); if(p){ p.src=b64; } show('photo-preview'); hide('photo-placeholder'); show('remove-photo'); $('photo-upload-area')?.classList.add('has-file'); }
    else { aadhaarBase64=b64; const ph=$('aadhaar-placeholder'); if(ph) ph.innerHTML=`<span class="ul-emoji">📄</span><span class="ul-hint" style="color:#10d9a0">✓ ${file.name}</span>`; show('remove-aadhaar'); $('aadhaar-upload-area')?.classList.add('has-file'); }
  };
  reader.readAsDataURL(file);
}

function removeFile(e,type) {
  e.stopPropagation();
  if (type==='photo'){ photoBase64=null; const i=$('photo-input'); if(i) i.value=''; hide('photo-preview'); show('photo-placeholder'); hide('remove-photo'); $('photo-upload-area')?.classList.remove('has-file'); }
  else { aadhaarBase64=null; const i=$('aadhaar-input'); if(i) i.value=''; const ph=$('aadhaar-placeholder'); if(ph) ph.innerHTML='<span class="ul-emoji">📄</span><span class="ul-hint">PDF only · max 100KB</span>'; hide('remove-aadhaar'); $('aadhaar-upload-area')?.classList.remove('has-file'); }
}

async function submitRegistration() {
  const errEl=$('reg-error'); if(errEl) errEl.classList.add('hidden');
  const phone=($('reg-phone')?.value||'').replace(/\s/g,'');
  const aadhaar=($('reg-aadhaar')?.value||'').replace(/\s/g,'');
  const agreed=$('reg-agree')?.checked;
  if (!phone||!aadhaar||!agreed||!photoBase64||!aadhaarBase64){ showErr('reg-error','Please fill all fields, upload photo + Aadhaar PDF, and agree to rules.'); return; }
  if (phone.length<10||phone.length>15){ showErr('reg-error','Enter a valid phone number (10–15 digits).'); return; }
  if (aadhaar.length!==12||!/^\d+$/.test(aadhaar)){ showErr('reg-error','Enter a valid 12-digit Aadhaar number.'); return; }
  const btn=$('reg-submit-btn');
  if (btn){ btn.textContent='Completing…'; btn.disabled=true; }
  try {
    const { error }=await db.from('users').update({ phone, aadhaar_number:aadhaar, registration_completed:true, agreed_to_rules:true, photo_url:photoBase64, aadhaar_photo_url:aadhaarBase64, status:'active' }).eq('uid',currentUser.id);
    if (error) throw error;
    const { data }=await db.from('users').select('*').eq('uid',currentUser.id).single();
    currentProfile=data; hide('reg-page'); launchApp();
  } catch(e){ showErr('reg-error',e.message||'Registration failed. Please try again.'); }
  finally { if(btn){ btn.textContent='Complete Registration'; btn.disabled=false; } }
}

function showErr(id,msg){ const el=$(id); if(el){ el.textContent=msg; el.classList.remove('hidden'); } }

/* ─── Modals ────────────────────────────── */
function closeModal(id){ hide(id); }
document.querySelectorAll('.overlay').forEach(el => {
  el.addEventListener('click', e => { if(e.target===el) hide(el.id); });
});

init();
