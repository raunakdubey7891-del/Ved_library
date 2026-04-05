/* ═══════════════════════════════════════
   VED LIBRARY — script.js
═══════════════════════════════════════ */

/* ── CONFIG — paste your keys here ──── */
const SUPABASE_URL      = 'https://dmolzoagnzjwtrdroqeg.supabase.co';
const SUPABASE_ANON     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtb2x6b2Fnbnpqd3RyZHJvcWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODUxODEsImV4cCI6MjA5MDg2MTE4MX0.5Culb-inMvITeplysy6_BJJXngd_SPMWG13_hT0GV5w';
const ADMIN_EMAIL       = 'raunakdubey7891@gmail.com';
const LIBRARY_LAT       = 28.6139;
const LIBRARY_LON       = 77.2090;
const LIBRARY_RADIUS_KM = 0.5;

/* ── Supabase client ─────────────────── */
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
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
let adminChannel   = null;

const STUDY_PLANS  = { full_time:'Full Time (12h)', shift_a:'Shift A (4h)', shift_b:'Shift B (4h)', custom:'Custom Shift' };
const PLAN_PRICES  = { full_time:1200, shift_a:500, shift_b:500, custom:800 };

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
   AUTH
═══════════════════════════════════════ */
async function init() {
  // Set up auth listener FIRST
  db.auth.onAuthStateChange(async (event, session) => {
    if ((event==='SIGNED_IN'||event==='TOKEN_REFRESHED') && session?.user && !currentUser) {
      hide('loading-screen'); hide('auth-page');
      await onSignIn(session.user);
    } else if (event==='SIGNED_OUT') {
      currentUser=null; currentProfile=null;
      if(adminChannel){ db.removeChannel(adminChannel); adminChannel=null; }
      hide('app'); hide('reg-page'); hide('loading-screen');
      show('auth-page');
    }
  });

  // Check existing session
  try {
    const { data:{ session } } = await db.auth.getSession();
    if (session?.user) {
      await onSignIn(session.user);
    } else if (!window.location.hash.includes('access_token') && !window.location.search.includes('error')) {
      hide('loading-screen');
      show('auth-page');
    }
    // If error in URL (bad oauth state etc), clear it and show login
    if (window.location.search.includes('error')) {
      history.replaceState(null,'',window.location.pathname);
      hide('loading-screen');
      show('auth-page');
    }
  } catch(e) {
    console.error('Init error:', e);
    hide('loading-screen');
    show('auth-page');
  }
}

async function onSignIn(user) {
  try {
    currentUser = user;
    let { data:profile, error } = await db.from('users').select('*').eq('uid',user.id).single();
    if (error && error.code !== 'PGRST116') throw error;
    if (!profile) {
      const isAdmin = user.email===ADMIN_EMAIL;
      const np = { uid:user.id, name:user.user_metadata?.full_name||user.email, email:user.email, role:isAdmin?'admin':'student', created_at:new Date().toISOString() };
      const { data:created, error:insErr } = await db.from('users').insert(np).select().single();
      if(insErr) throw insErr;
      profile = created;
    }
    currentProfile = profile;
    hide('loading-screen'); hide('auth-page');
    if (profile.role==='student' && !profile.registration_completed) { show('reg-page'); return; }
    launchApp();
  } catch(e) {
    console.error('Sign-in error:', e);
    hide('loading-screen');
    show('auth-page');
  }
}

async function logout() {
  try { await db.auth.signOut(); } catch(e){ console.error(e); }
  location.reload();
}

$('google-login-btn').onclick = async () => {
  try {
    $('google-btn-text').textContent = 'Connecting...';
    $('google-login-btn').disabled = true;
    const redirectTo = window.location.origin + window.location.pathname;
    await db.auth.signInWithOAuth({ provider:'google', options:{ redirectTo } });
  } catch(e) {
    $('google-btn-text').textContent = 'Continue with Google';
    $('google-login-btn').disabled = false;
    alert('Login failed: ' + e.message);
  }
};

/* ═══════════════════════════════════════
   APP LAUNCH
═══════════════════════════════════════ */
function launchApp() {
  show('app');
  safeSet('nav-user-name', currentProfile.name);
  const roleEl = $('nav-user-role');
  if (roleEl) {
    roleEl.textContent = currentProfile.role==='admin' ? 'Admin' : 'Student';
    roleEl.className   = 'badge ' + (currentProfile.role==='admin' ? 'badge-indigo' : 'badge-green');
  }
  if (currentProfile.role==='admin') {
    show('admin-dashboard');
    loadAdminData();
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
    safeSet('student-welcome', `Welcome back, ${p.name}!`);
    safeSet('student-seat-num', p.seat_number||'N/A');
    safeSet('student-plan-name', STUDY_PLANS[p.plan_id]||'No plan');
    safeSet('amount-due', '₹'+(p.amount_due||0));

    if (p.expiry_date) {
      const exp=new Date(p.expiry_date), diff=Math.max(0,Math.floor((exp-new Date())/86400000));
      safeSet('days-remaining', diff+' Days');
      safeSet('expiry-text', 'Expiry: '+fmt(p.expiry_date));
      const pbar=$('subscription-progress');
      if(pbar) pbar.style.width=Math.min(100,(diff/30)*100)+'%';
      safeSet('due-date-text', 'Due by '+fmt(p.expiry_date));
    } else {
      safeSet('days-remaining','0 Days');
      safeSet('expiry-text','Expiry: Not set');
      safeSet('due-date-text','Contact admin to set your session');
    }
    const nextMonth=new Date(new Date().getFullYear(),new Date().getMonth()+1,1);
    safeSet('days-next-month', Math.floor((nextMonth-new Date())/86400000)+' Days');

    const { data:todayAttend } = await db.from('attendance').select('*').eq('uid',currentUser.id).eq('date',today()).maybeSingle();
    updateAttendanceUI(!!todayAttend);

    const { data:notices } = await db.from('notices').select('*').order('created_at',{ascending:false});
    allNotices = notices||[];
    renderNoticeList('student-notices-list',false);

    // Realtime for student
    db.channel('student-rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'attendance',filter:`uid=eq.${currentUser.id}`}, async()=>{
        try{ const {data}=await db.from('attendance').select('*').eq('uid',currentUser.id).eq('date',today()).maybeSingle(); updateAttendanceUI(!!data); }catch(e){}
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'users',filter:`uid=eq.${currentUser.id}`}, async()=>{
        try{ const {data}=await db.from('users').select('*').eq('uid',currentUser.id).single(); if(data){currentProfile=data;loadStudentData();} }catch(e){}
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'notices'}, async()=>{
        try{ const {data}=await db.from('notices').select('*').order('created_at',{ascending:false}); allNotices=data||[]; renderNoticeList('student-notices-list',false); }catch(e){}
      })
      .subscribe();
  } catch(e) { console.error('loadStudentData error:',e); }
}

function updateAttendanceUI(marked) {
  try {
    const dot=$('attend-status-dot'), text=$('attend-status-text'), btn=$('mark-attend-btn');
    if(!dot||!text||!btn) return;
    if (marked) {
      dot.className='status-dot dot-green'; text.textContent='Attendance Marked';
      btn.textContent='✅ Attendance Done'; btn.disabled=true;
      btn.style.cssText='background:rgba(16,185,129,.15);color:#6ee7b7;cursor:default;width:100%;justify-content:center;padding:10px;border-radius:9px;font-weight:700;display:flex;align-items:center;border:1px solid rgba(16,185,129,.3)';
    } else {
      dot.className='status-dot dot-amber'; text.textContent='Attendance Pending';
      btn.textContent="Mark Today's Attendance"; btn.disabled=false;
      btn.className='btn btn-primary w-full'; btn.style.cssText='';
    }
  } catch(e){}
}

async function markAttendance() {
  hide('student-location-error');
  try {
    const loc = await getLocation();
    if (!isAtLibrary(loc.lat,loc.lon)) { showErr('student-location-error','You must be at the library to mark attendance.'); return; }
    await db.from('attendance').upsert({ id:`${currentUser.id}_${today()}`, uid:currentUser.id, date:today(), timestamp:new Date().toISOString(), status:'present' });
  } catch(e) { showErr('student-location-error', e.message||'Location error. Please allow location access.'); }
}

function getLocation() {
  return new Promise((res,rej)=>{
    if(!navigator.geolocation){rej(new Error('Geolocation not supported.'));return;}
    navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lon:p.coords.longitude}),()=>rej(new Error('Could not get location. Please allow access.')));
  });
}

function isAtLibrary(lat,lon) {
  const R=6371,dLat=(lat-LIBRARY_LAT)*Math.PI/180,dLon=(lon-LIBRARY_LON)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(LIBRARY_LAT*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))<=LIBRARY_RADIUS_KM;
}

function showPaymentModal() {
  const amt=currentProfile.amount_due||0;
  const qr=$('payment-qr'), link=$('payment-upi-link'), desc=$('payment-modal-desc'), utr=$('utr-input');
  if(desc) desc.textContent=`Pay ₹${amt} using any UPI app`;
  if(qr)   qr.src=`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=raunakdubey7891@ybl%26pn=Ved%20Library%26am=${amt}%26cu=INR`;
  if(link) link.href=`upi://pay?pa=raunakdubey7891@ybl&pn=Ved%20Library&am=${amt}&cu=INR`;
  if(utr)  utr.value='';
  show('payment-modal');
}

async function submitPayment() {
  const utr=($('utr-input')?.value||'').trim();
  if(!utr){alert('Please enter UTR / Transaction ID');return;}
  const btn=$('submit-payment-btn');
  if(btn){btn.textContent='Submitting...';btn.disabled=true;}
  try {
    await db.from('payments').insert({ uid:currentUser.id, amount:currentProfile.amount_due||0, transaction_id:utr, status:'pending', timestamp:new Date().toISOString() });
    closeModal('payment-modal');
    alert('Payment submitted! Admin will verify it soon.');
  } catch(e){ alert('Failed: '+e.message); }
  finally { if(btn){btn.textContent='Submit Payment Details';btn.disabled=false;} }
}

/* ═══════════════════════════════════════
   ADMIN DASHBOARD
═══════════════════════════════════════ */
async function loadAdminData() {
  try {
    await Promise.all([fetchStudents(),fetchSeats(),fetchPayments(),fetchAttendance(),fetchNotices()]);
    renderAll();
    if(adminChannel) db.removeChannel(adminChannel);
    adminChannel = db.channel('admin-rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'users'},      async()=>{ try{await fetchStudents();renderAll();}catch(e){} })
      .on('postgres_changes',{event:'*',schema:'public',table:'seats'},      async()=>{ try{await Promise.all([fetchSeats(),fetchStudents()]);renderAll();}catch(e){} })
      .on('postgres_changes',{event:'*',schema:'public',table:'payments'},   async()=>{ try{await fetchPayments();renderAll();}catch(e){} })
      .on('postgres_changes',{event:'*',schema:'public',table:'attendance'}, async()=>{ try{await fetchAttendance();renderAll();}catch(e){} })
      .on('postgres_changes',{event:'*',schema:'public',table:'notices'},    async()=>{ try{await fetchNotices();renderAll();}catch(e){} })
      .subscribe();
  } catch(e){ console.error('loadAdminData error:',e); }
}

async function fetchStudents()  { try{ const{data}=await db.from('users').select('*').eq('role','student').order('name'); allStudents=data||[]; }catch(e){} }
async function fetchSeats()     { try{ const{data}=await db.from('seats').select('*').order('number'); allSeats=data||[]; }catch(e){} }
async function fetchPayments()  { try{ const{data}=await db.from('payments').select('*').order('timestamp',{ascending:false}); allPayments=data||[]; }catch(e){} }
async function fetchAttendance(){ try{ const{data}=await db.from('attendance').select('*').order('timestamp',{ascending:false}); allAttendance=data||[]; }catch(e){} }
async function fetchNotices()   { try{ const{data}=await db.from('notices').select('*').order('created_at',{ascending:false}); allNotices=data||[]; }catch(e){} }

function renderAll() {
  try{ renderStudentTable(); }catch(e){}
  try{ renderSeats(); }catch(e){}
  try{ renderPayments(); }catch(e){}
  try{ renderAttendanceList(); }catch(e){}
  try{ renderNoticeList('admin-notices-list',true); }catch(e){}
  try{ renderStats(); }catch(e){}
}

/* ── Students table ───────────────────── */
function renderStudentTable() {
  const q=($('student-search')?.value||'').toLowerCase();
  const list=allStudents.filter(s=>!q||s.name?.toLowerCase().includes(q)||s.email?.toLowerCase().includes(q)||s.seat_number?.toLowerCase().includes(q));
  const tbody=$('students-tbody');
  if(!tbody) return;
  if(!list.length){tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:24px;font-style:italic">No students found.</td></tr>';return;}
  tbody.innerHTML=list.map(s=>{
    const isExp=s.expiry_date&&new Date(s.expiry_date)<new Date();
    return `<tr>
      <td><div style="font-weight:700">${esc(s.name)}</div><div style="font-size:12px;color:var(--text3)">${esc(s.email)}</div></td>
      <td><span class="badge badge-indigo">${esc(s.seat_number||'None')}</span></td>
      <td style="font-size:13px;color:var(--text2)">${esc(STUDY_PLANS[s.plan_id]||'—')}</td>
      <td style="font-size:12px;color:var(--text3)">${s.session_start?fmt(s.session_start):'Not set'}</td>
      <td style="font-size:13px;color:${isExp?'#fca5a5':'var(--text2)'};font-weight:${isExp?'700':'400'}">${fmt(s.expiry_date)}${isExp?' ⚠️':''}</td>
      <td style="font-weight:700;color:${(s.amount_due||0)>0?'#fca5a5':'#6ee7b7'}">₹${s.amount_due||0}</td>
      <td class="text-right" style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm btn-icon" title="Download Docs" onclick="downloadStudentDocs('${s.uid}')">📥</button>
        <button class="btn btn-ghost btn-sm btn-icon" title="Edit" onclick="openEditModal('${s.uid}')" style="margin-left:4px">✏️</button>
      </td>
    </tr>`;
  }).join('');
}

/* ── Seats ────────────────────────────── */
function renderSeats() {
  const filter=$('seat-filter')?.value||'all';
  const list=allSeats.filter(s=>filter==='all'||s.status===filter);
  const grid=$('seats-grid');
  if(!grid) return;
  if(!list.length){grid.innerHTML='<div style="color:var(--text3);font-style:italic;padding:16px">No seats.</div>';return;}
  const occupiedUids=allSeats.filter(s=>s.status==='occupied').map(s=>s.occupied_by);
  const freeStudents=allStudents.filter(s=>!occupiedUids.includes(s.uid));
  grid.innerHTML=list.map(seat=>{
    const student=allStudents.find(s=>s.uid===seat.occupied_by);
    const isOcc=seat.status==='occupied';
    const opts=freeStudents.map(s=>`<option value="${s.uid}">${esc(s.name)}</option>`).join('');
    return `<div class="seat-card ${isOcc?'seat-occupied':'seat-available'}">
      <div class="seat-card-header">
        <span class="seat-num ${isOcc?'seat-num-occupied':'seat-num-available'}">${esc(seat.number)}</span>
        <div class="seat-card-actions">
          <button class="btn btn-icon ${isOcc?'btn-reject':'btn-verify'}" title="${isOcc?'Free':'Occupy'}" onclick="toggleSeat('${seat.id}','${seat.status}','${seat.occupied_by||''}')">${isOcc?'✕':'✓'}</button>
          <button class="btn btn-icon btn-ghost" onclick="removeSeat('${seat.id}')" title="Delete">🗑</button>
        </div>
      </div>
      ${isOcc
        ?`<div class="seat-student-name">${esc(student?.name||'Assigned')}</div><div class="seat-plan-label">${esc(seat.plan_type||'—')}</div>`
        :`<select class="seat-assign-select" onchange="assignSeat('${seat.id}',this.value)"><option value="" disabled selected>Assign Student</option>${opts}</select>`}
    </div>`;
  }).join('');
}

/* ── Payments ─────────────────────────── */
function renderPayments() {
  const el=$('payments-list');
  if(!el) return;
  const pending=allPayments.filter(p=>p.status==='pending');
  const history=allPayments.filter(p=>p.status!=='pending');
  el.innerHTML=`
    <div class="payment-section-title">⏳ Pending Requests</div>
    <div>${pending.length?pending.map(p=>paymentHTML(p,true)).join(''):'<div class="empty-text">No pending requests.</div>'}</div>
    <div class="payment-section-title" style="margin-top:20px">📋 Payment History</div>
    <div>${history.length?history.map(p=>paymentHTML(p,false)).join(''):'<div class="empty-text">No history yet.</div>'}</div>`;
}

function paymentHTML(p, showActions) {
  const s=allStudents.find(x=>x.uid===p.uid);
  const badge=p.status==='verified'?'<span class="badge badge-green">✓ Verified</span>':p.status==='rejected'?'<span class="badge badge-red">✕ Rejected</span>':'<span class="badge badge-amber">⏳ Pending</span>';
  return `<div class="payment-item">
    <div class="payment-item-left">
      <div class="payment-avatar">${esc((s?.name||'?').charAt(0))}</div>
      <div><div class="payment-name">${esc(s?.name||'Unknown')}</div><div class="payment-meta">UTR: ${esc(p.transaction_id)} · ₹${p.amount} · ${fmtTime(p.timestamp)}</div></div>
    </div>
    <div class="payment-item-actions">
      ${showActions
        ?`<button class="btn btn-verify btn-sm" onclick="verifyPayment('${p.id}','verified','${p.uid}')">✓ Verify</button><button class="btn btn-reject btn-sm" onclick="verifyPayment('${p.id}','rejected','${p.uid}')">✕ Reject</button>`
        :badge}
    </div>
  </div>`;
}

/* ── Attendance ───────────────────────── */
function renderAttendanceList() {
  const el=$('attendance-list');
  if(!el) return;
  if(!allAttendance.length){el.innerHTML='<div class="empty-text">No records yet.</div>';return;}
  el.innerHTML=allAttendance.map(a=>{
    const s=allStudents.find(x=>x.uid===a.uid);
    return `<div class="attend-item">
      <div class="attend-avatar">${esc((s?.name||'?').charAt(0))}</div>
      <div style="flex:1"><div class="attend-name">${esc(s?.name||'Unknown')}</div><div class="attend-time">${fmtTime(a.timestamp)}</div></div>
      <span class="attend-check">✓</span>
    </div>`;
  }).join('');
}

/* ── Notices ──────────────────────────── */
function renderNoticeList(elId, isAdmin) {
  const el=$(elId);
  if(!el) return;
  if(!allNotices.length){el.innerHTML='<div class="empty-text">No notices.</div>';return;}
  el.innerHTML=allNotices.map(n=>`<div class="notice-card">
    <div class="notice-card-header"><div class="notice-title">${esc(n.title)}</div><span class="notice-date">${fmtTime(n.created_at)}</span></div>
    <div class="notice-body">${esc(n.content)}</div>
    ${isAdmin?`<button class="notice-delete" onclick="deleteNotice('${n.id}')" title="Delete">🗑</button>`:''}
  </div>`).join('');
}

/* ── Stats ────────────────────────────── */
function renderStats() {
  safeSet('stat-students', allStudents.length);
  safeSet('stat-today', new Set(allAttendance.filter(a=>a.date===today()).map(a=>a.uid)).size);
  safeSet('stat-occupied', allSeats.filter(s=>s.status==='occupied').length);
  safeSet('stat-available', allSeats.filter(s=>s.status==='available').length);
  safeSet('stat-revenue', '₹'+allPayments.filter(p=>p.status==='verified').reduce((sum,p)=>sum+p.amount,0));
  safeSet('stat-pending-due', '₹'+allStudents.reduce((sum,s)=>sum+(s.amount_due||0),0));
}

/* ═══════════════════════════════════════
   ADMIN ACTIONS
═══════════════════════════════════════ */

async function verifyPayment(id, status, uid) {
  try {
    await db.from('payments').update({status}).eq('id',id);
    if(status==='verified') await db.from('users').update({amount_due:0}).eq('uid',uid);
  } catch(e){ alert('Failed: '+e.message); }
}

/* ── Edit / Delete student ────────────── */
function openEditModal(uid) {
  const s=allStudents.find(x=>x.uid===uid);
  if(!s) return;
  const fields={
    'edit-uid':uid,'edit-name':s.name,'edit-phone':s.phone||'',
    'edit-aadhaar-view':s.aadhaar_number||'','edit-seat':s.seat_number||'',
    'edit-plan':s.plan_id||'','edit-amount-due':s.amount_due||0,
    'edit-session-start':s.session_start?s.session_start.slice(0,10):'',
    'edit-expiry':s.expiry_date?s.expiry_date.slice(0,10):''
  };
  Object.entries(fields).forEach(([id,val])=>{ const el=$(id); if(el) el.value=val; });
  show('edit-student-modal');
}

// Auto-fill expiry and amount when session start changes
const sessionInput = $('edit-session-start');
if(sessionInput) sessionInput.addEventListener('change', function(){
  if(!this.value) return;
  const exp=new Date(this.value); exp.setDate(exp.getDate()+30);
  const expiryEl=$('edit-expiry'); if(expiryEl) expiryEl.value=exp.toISOString().slice(0,10);
  const planEl=$('edit-plan'); if(planEl&&PLAN_PRICES[planEl.value]){ const amt=$('edit-amount-due'); if(amt) amt.value=PLAN_PRICES[planEl.value]; }
});

const planInput = $('edit-plan');
if(planInput) planInput.addEventListener('change', function(){
  const sess=$('edit-session-start'); if(sess?.value&&PLAN_PRICES[this.value]){ const amt=$('edit-amount-due'); if(amt) amt.value=PLAN_PRICES[this.value]; }
});

async function saveStudentEdit() {
  try {
    const uid=$('edit-uid')?.value;
    const sessionStart=$('edit-session-start')?.value;
    const expiryDate=$('edit-expiry')?.value;
    const newSeatNum=($('edit-seat')?.value||'').trim();
    const oldStudent=allStudents.find(s=>s.uid===uid);

    await db.from('users').update({
      seat_number:newSeatNum||null, plan_id:$('edit-plan')?.value||null,
      session_start:sessionStart||null, expiry_date:expiryDate||null,
      amount_due:parseInt($('edit-amount-due')?.value)||0
    }).eq('uid',uid);

    if(oldStudent && oldStudent.seat_number!==newSeatNum) {
      if(oldStudent.seat_number){ const old=allSeats.find(s=>s.number===oldStudent.seat_number); if(old) await db.from('seats').update({status:'available',occupied_by:null,plan_type:null}).eq('id',old.id); }
      if(newSeatNum){ const nw=allSeats.find(s=>s.number===newSeatNum); if(nw) await db.from('seats').update({status:'occupied',occupied_by:uid,plan_type:STUDY_PLANS[$('edit-plan')?.value]||'N/A'}).eq('id',nw.id); }
    }
    closeModal('edit-student-modal');
  } catch(e){ alert('Save failed: '+e.message); }
}

async function deleteStudent() {
  const uid=$('edit-uid')?.value;
  const s=allStudents.find(x=>x.uid===uid);
  if(!s) return;
  if(!confirm(`⚠️ Remove "${s.name}" permanently?\n\nThis will:\n• Delete their account\n• Free their seat\n• Delete their attendance & payments\n\nThis cannot be undone.`)) return;
  try {
    const btn=$('delete-student-btn');
    if(btn){btn.textContent='Removing...';btn.disabled=true;}
    // Free their seat
    if(s.seat_number){ const seat=allSeats.find(x=>x.number===s.seat_number); if(seat) await db.from('seats').update({status:'available',occupied_by:null,plan_type:null}).eq('id',seat.id); }
    // Delete related data
    await db.from('attendance').delete().eq('uid',uid);
    await db.from('payments').delete().eq('uid',uid);
    // Delete the user profile
    await db.from('users').delete().eq('uid',uid);
    closeModal('edit-student-modal');
    alert(`✅ ${s.name} has been removed.`);
  } catch(e){
    alert('Failed to remove student: '+e.message);
    const btn=$('delete-student-btn');
    if(btn){btn.textContent='🗑 Remove Student';btn.disabled=false;}
  }
}

/* ── Seats ────────────────────────────── */
function showAddSeatModal(){const el=$('new-seat-num');if(el)el.value='';show('add-seat-modal');}
async function addSeat(){
  try{
    const num=($('new-seat-num')?.value||'').trim();
    if(!num) return;
    await db.from('seats').insert({id:`seat_${num}`,number:num,status:'available'});
    closeModal('add-seat-modal');
  }catch(e){alert('Failed: '+e.message);}
}
async function toggleSeat(id,currentStatus,occupiedBy){
  try{
    const newStatus=currentStatus==='available'?'occupied':'available';
    await db.from('seats').update({status:newStatus,occupied_by:newStatus==='available'?null:occupiedBy}).eq('id',id);
    if(newStatus==='available'&&occupiedBy) await db.from('users').update({seat_number:null}).eq('uid',occupiedBy);
  }catch(e){alert('Failed: '+e.message);}
}
async function assignSeat(seatId,studentUid){
  try{
    const student=allStudents.find(s=>s.uid===studentUid);
    const seat=allSeats.find(s=>s.id===seatId);
    if(!student||!seat) return;
    await db.from('seats').update({status:'occupied',occupied_by:studentUid,plan_type:STUDY_PLANS[student.plan_id]||'N/A'}).eq('id',seatId);
    await db.from('users').update({seat_number:seat.number}).eq('uid',studentUid);
    const prev=allSeats.find(s=>s.number===student.seat_number&&s.id!==seatId);
    if(prev) await db.from('seats').update({status:'available',occupied_by:null,plan_type:null}).eq('id',prev.id);
  }catch(e){alert('Failed: '+e.message);}
}
async function removeSeat(id){
  if(!confirm('Delete this seat?')) return;
  try{
    const seat=allSeats.find(s=>s.id===id);
    if(seat?.occupied_by) await db.from('users').update({seat_number:null}).eq('uid',seat.occupied_by);
    await db.from('seats').delete().eq('id',id);
  }catch(e){alert('Failed: '+e.message);}
}

/* ── Notices ──────────────────────────── */
function showAddNoticeModal(){const t=$('notice-title-input'),c=$('notice-content-input');if(t)t.value='';if(c)c.value='';show('add-notice-modal');}
async function addNotice(){
  try{
    const title=($('notice-title-input')?.value||'').trim();
    const content=($('notice-content-input')?.value||'').trim();
    if(!title||!content) return;
    await db.from('notices').insert({title,content,created_at:new Date().toISOString(),author_id:currentUser.id});
    closeModal('add-notice-modal');
  }catch(e){alert('Failed: '+e.message);}
}
async function deleteNotice(id){
  if(!confirm('Delete this notice?')) return;
  try{ await db.from('notices').delete().eq('id',id); }catch(e){alert('Failed: '+e.message);}
}

/* ── Tab switching ────────────────────── */
function switchTab(event,tab){
  document.querySelectorAll('.tab-content').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el=>el.classList.remove('active'));
  const tc=$('tab-'+tab); if(tc) tc.classList.add('active');
  if(event?.target) event.target.classList.add('active');
}

/* ═══════════════════════════════════════
   EXPORTS & DOWNLOADS
═══════════════════════════════════════ */
function makeCSV(rows){ return rows.map(r=>r.map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n'); }
function downloadCSV(filename,rows){ const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(makeCSV(rows)); a.download=filename; a.click(); }

function exportCSV(type){
  try{
    if(type==='students') downloadCSV(`VedLibrary_Students_${today()}.csv`,[
      ['Name','Email','Phone','Aadhaar','Seat','Plan','Session Start','Expiry','Amount Due'],
      ...allStudents.map(s=>[s.name,s.email,s.phone||'',s.aadhaar_number||'',s.seat_number||'',STUDY_PLANS[s.plan_id]||'',s.session_start?fmt(s.session_start):'',s.expiry_date?fmt(s.expiry_date):'',s.amount_due||0])
    ]);
    else if(type==='attendance') downloadCSV(`VedLibrary_Attendance_${today()}.csv`,[
      ['Student','Email','Date','Time','Status'],
      ...allAttendance.map(a=>{const s=allStudents.find(x=>x.uid===a.uid);return[s?.name||'Unknown',s?.email||'',a.date,a.timestamp?new Date(a.timestamp).toLocaleTimeString():'',a.status];})
    ]);
    else if(type==='payments') downloadCSV(`VedLibrary_Payments_${today()}.csv`,[
      ['Student','Email','Amount','UTR','Status','Date'],
      ...allPayments.map(p=>{const s=allStudents.find(x=>x.uid===p.uid);return[s?.name||'Unknown',s?.email||'',p.amount,p.transaction_id,p.status,fmtTime(p.timestamp)];})
    ]);
  }catch(e){alert('Export failed: '+e.message);}
}

async function exportAllData(){
  const btn=$('export-all-btn');
  if(btn){btn.textContent='⏳ Exporting...';btn.disabled=true;}
  try{
    const d=today();
    const totalRev=allPayments.filter(p=>p.status==='verified').reduce((s,p)=>s+p.amount,0);
    const totalDue=allStudents.reduce((s,x)=>s+(x.amount_due||0),0);

    downloadCSV(`VedLibrary_Export_${d}/00_Summary.csv`,[
      ['Metric','Value'],['Export Date',d],['Total Students',allStudents.length],
      ['Occupied Seats',allSeats.filter(s=>s.status==='occupied').length],
      ['Available Seats',allSeats.filter(s=>s.status==='available').length],
      ['Today Attendance',new Set(allAttendance.filter(a=>a.date===today()).map(a=>a.uid)).size],
      ['Total Attendance Records',allAttendance.length],
      ['Total Verified Revenue (₹)',totalRev],['Total Amount Due (₹)',totalDue],
      ['Total Payments',allPayments.length],['Total Notices',allNotices.length]
    ]);
    await delay(400);

    downloadCSV(`VedLibrary_Export_${d}/01_Students.csv`,[
      ['Name','Email','Phone','Aadhaar','Seat','Plan','Session Start','Expiry','Due','Registered','Joined'],
      ...allStudents.map(s=>[s.name,s.email,s.phone||'',s.aadhaar_number||'',s.seat_number||'',STUDY_PLANS[s.plan_id]||'',s.session_start?fmt(s.session_start):'',s.expiry_date?fmt(s.expiry_date):'',s.amount_due||0,s.registration_completed?'Yes':'No',fmt(s.created_at)])
    ]);
    await delay(400);

    downloadCSV(`VedLibrary_Export_${d}/02_Payments.csv`,[
      ['Student','Email','Amount','UTR','Status','Date'],
      ...allPayments.map(p=>{const s=allStudents.find(x=>x.uid===p.uid);return[s?.name||'Unknown',s?.email||'',p.amount,p.transaction_id,p.status,fmtTime(p.timestamp)];})
    ]);
    await delay(400);

    downloadCSV(`VedLibrary_Export_${d}/03_Attendance.csv`,[
      ['Student','Email','Date','Time','Status'],
      ...allAttendance.map(a=>{const s=allStudents.find(x=>x.uid===a.uid);return[s?.name||'Unknown',s?.email||'',a.date,a.timestamp?new Date(a.timestamp).toLocaleTimeString():'',a.status];})
    ]);
    await delay(400);

    downloadCSV(`VedLibrary_Export_${d}/04_Seats.csv`,[
      ['Seat No','Status','Student Name','Student Email','Plan'],
      ...allSeats.map(seat=>{const s=allStudents.find(x=>x.uid===seat.occupied_by);return[seat.number,seat.status,s?.name||'',s?.email||'',seat.plan_type||''];})
    ]);
    await delay(400);

    downloadCSV(`VedLibrary_Export_${d}/05_Notices.csv`,[
      ['Title','Content','Posted On'],
      ...allNotices.map(n=>[n.title,n.content,fmtTime(n.created_at)])
    ]);

    alert(`✅ Export complete!\n\n6 CSV files downloaded.\nAll named "VedLibrary_Export_${d}/..." so they group together.`);
  }catch(e){ alert('Export failed: '+e.message); }
  finally{ if(btn){btn.textContent='📦 Export All';btn.disabled=false;} }
}

/* ── Documents download ───────────────── */
async function downloadStudentDocs(uid){
  const s=allStudents.find(x=>x.uid===uid);
  if(!s?.photo_url&&!s?.aadhaar_photo_url){alert('No documents for this student.');return;}
  const name=s.name.replace(/\s+/g,'_');
  if(s.photo_url)        { downloadBase64(s.photo_url,        `VedLibrary_Docs/Student_Data/${name}/photo.png`); }
  if(s.aadhaar_photo_url){ await delay(300); downloadBase64(s.aadhaar_photo_url,`VedLibrary_Docs/Student_Data/${name}/aadhaar.png`); }
}

async function downloadAllDocs(){
  const btn=$('download-docs-btn');
  if(btn){btn.textContent='⏳ Downloading...';btn.disabled=true;}
  let count=0;
  try{
    for(const s of allStudents){
      const name=s.name.replace(/\s+/g,'_');
      if(s.photo_url)        { downloadBase64(s.photo_url,        `VedLibrary_Docs/Student_Data/${name}/photo.png`);   count++; await delay(200); }
      if(s.aadhaar_photo_url){ downloadBase64(s.aadhaar_photo_url,`VedLibrary_Docs/Student_Data/${name}/aadhaar.png`); count++; await delay(200); }
    }
    if(!count) alert('No documents found.');
    else alert(`✅ ${count} file(s) downloaded.\nCheck your downloads folder — files are organized as:\nVedLibrary_Docs/Student_Data/[Name]/photo.png`);
  }catch(e){ alert('Download failed: '+e.message); }
  finally{ if(btn){btn.textContent='📁 All Docs';btn.disabled=false;} }
}

function downloadBase64(dataUrl,filename){ const a=document.createElement('a'); a.href=dataUrl; a.download=filename; a.click(); }

/* ═══════════════════════════════════════
   REGISTRATION
═══════════════════════════════════════ */
function handleFileUpload(input,type){
  const file=input.files[0];
  if(!file) return;
  if(file.size>300*1024){alert('File too large. Max 300KB.');return;}
  const reader=new FileReader();
  reader.onloadend=()=>{
    const b64=reader.result;
    if(type==='photo'){photoBase64=b64;const p=$('photo-preview');if(p){p.src=b64;}show('photo-preview');hide('photo-placeholder');show('remove-photo');$('photo-upload-area')?.classList.add('has-file');}
    else{aadhaarBase64=b64;const p=$('aadhaar-preview');if(p){p.src=b64;}show('aadhaar-preview');hide('aadhaar-placeholder');show('remove-aadhaar');$('aadhaar-upload-area')?.classList.add('has-file');}
  };
  reader.readAsDataURL(file);
}

function removeFile(e,type){
  e.stopPropagation();
  if(type==='photo'){photoBase64=null;const i=$('photo-input');if(i)i.value='';hide('photo-preview');show('photo-placeholder');hide('remove-photo');$('photo-upload-area')?.classList.remove('has-file');}
  else{aadhaarBase64=null;const i=$('aadhaar-input');if(i)i.value='';hide('aadhaar-preview');show('aadhaar-placeholder');hide('remove-aadhaar');$('aadhaar-upload-area')?.classList.remove('has-file');}
}

async function submitRegistration(){
  const errEl=$('reg-error'); if(errEl) errEl.classList.add('hidden');
  const phone=($('reg-phone')?.value||'').replace(/\s/g,'');
  const aadhaar=($('reg-aadhaar')?.value||'').replace(/\s/g,'');
  const agreed=$('reg-agree')?.checked;
  if(!phone||!aadhaar||!agreed||!photoBase64||!aadhaarBase64){showErr('reg-error','Please fill all fields, upload both photos, and agree to rules.');return;}
  if(phone.length<10||phone.length>15){showErr('reg-error','Enter a valid phone number (10–15 digits).');return;}
  if(aadhaar.length!==12||!/^\d+$/.test(aadhaar)){showErr('reg-error','Enter a valid 12-digit Aadhaar number.');return;}
  const btn=$('reg-submit-btn');
  if(btn){btn.textContent='Completing...';btn.disabled=true;}
  try{
    const{error}=await db.from('users').update({phone,aadhaar_number:aadhaar,registration_completed:true,agreed_to_rules:true,photo_url:photoBase64,aadhaar_photo_url:aadhaarBase64}).eq('uid',currentUser.id);
    if(error) throw error;
    const{data}=await db.from('users').select('*').eq('uid',currentUser.id).single();
    currentProfile=data; hide('reg-page'); launchApp();
  }catch(e){showErr('reg-error',e.message||'Registration failed. Please try again.');}
  finally{if(btn){btn.textContent='Complete Registration';btn.disabled=false;}}
}

function showErr(id,msg){ const el=$(id); if(el){el.textContent=msg;el.classList.remove('hidden');} }

/* ── Modals ───────────────────────────── */
function closeModal(id){ hide(id); }
document.querySelectorAll('.overlay').forEach(el=>{
  el.addEventListener('click',e=>{ if(e.target===el) hide(el.id); });
});

/* ── Boot ─────────────────────────────── */
init();
