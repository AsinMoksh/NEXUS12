(()=>{
  const $=id=>document.getElementById(id);

  let db=null;
  let qr=null;
  let students=[];
  let records=[];

  const day=()=>{
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  const initials=n=>String(n||'ST').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();

  function toast(message){
    $('toast').textContent=message;
    $('toast').classList.add('show');
    clearTimeout(toast.timer);
    toast.timer=setTimeout(()=>$('toast').classList.remove('show'),3000);
  }

  function showApp(){
    $('loginScreen').style.display='none';
    $('appShell').style.display='block';
  }

  function showLogin(message=''){
    $('appShell').style.display='none';
    $('loginScreen').style.display='flex';
    $('loginError').textContent=message;
  }

  function connect(url,key){
    if(!window.supabase?.createClient){
      throw new Error('Supabase library did not load. Check your internet connection and refresh.');
    }

    db=window.supabase.createClient(url,key);
    $('connection').textContent='Supabase configured';
  }

  // NAVIGATION
  function page(p){
    document.querySelectorAll('.page').forEach(x=>{
      x.classList.toggle('active',x.id===p);
    });

    document.querySelectorAll('[data-page]').forEach(x=>{
      x.classList.toggle('active',x.dataset.page===p);
    });

    const names={
      overview:'Overview',
      scanner:'Live Scanner',
      students:'Students',
      attendance:'Attendance',
      devices:'IoT Devices',
      settings:'Settings'
    };

    $('crumb').textContent='/ '+(names[p]||p);
    $('side').classList.remove('open');

    if(['overview','students','attendance'].includes(p)){
      load();
    }
  }

  document.querySelectorAll('[data-page]').forEach(b=>{
    b.onclick=()=>page(b.dataset.page);
  });

  document.querySelectorAll('[data-go]').forEach(b=>{
    b.onclick=()=>page(b.dataset.go);
  });

  $('menu').onclick=()=>$('side').classList.toggle('open');
  $('refresh').onclick=load;

  $('today').textContent=new Date().toLocaleDateString(undefined,{
    weekday:'short',month:'short',day:'numeric',year:'numeric'
  });

  $('attDate').value=day();

  // DASHBOARD RENDERING
  function render(){
    const todayCount=records.filter(x=>x.attendance_date===day()).length;

    $('total').textContent=students.length;
    $('present').textContent=todayCount;
    $('rate').textContent=students.length
      ?Math.round(todayCount/students.length*100)+'%'
      :'0%';

    $('recent').innerHTML=records.slice(0,6).map(a=>`
      <tr>
        <td>
          <div class="student">
            <span class="miniavatar">${safe(initials(a.students?.student_name))}</span>
            ${safe(a.students?.student_name||'Unknown')}
          </div>
        </td>
        <td>${safe(a.students?.enrollment_number||'—')}</td>
        <td>${a.attendance_time?new Date(a.attendance_time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'—'}</td>
        <td><span class="badge">Present</span></td>
      </tr>
    `).join('')||'<tr><td class="empty" colspan="4">No attendance records yet.</td></tr>';

    $('studentCount').textContent=students.length+' students';

    renderStudents();
    renderAttendance();
  }

  // LOAD DATABASE DATA
  async function load(){
    if(!db){
      render();
      return;
    }

    const {data:{session}}=await db.auth.getSession();

    if(!session){
      showLogin('Your session expired. Please log in again.');
      return;
    }

    try{
      const [s,a]=await Promise.all([
        db.from('students')
          .select('id,student_name,enrollment_number,barcode_value,created_at')
          .order('student_name'),

        db.from('attendance')
          .select('id,student_id,attendance_date,attendance_time,students(student_name,enrollment_number)')
          .order('attendance_time',{ascending:false})
          .limit(500)
      ]);

      if(s.error)throw s.error;
      if(a.error)throw a.error;

      students=s.data||[];
      records=a.data||[];

      $('connection').textContent='Database connected';
      render();

    }catch(e){
      $('connection').textContent='Database access error';
      console.error(e);
      toast('Could not load data: '+(e.message||'Check RLS policies.'));
      render();
    }
  }

  // STUDENT TABLE
  function renderStudents(){
    const q=$('studentSearch').value.toLowerCase();

    const list=students.filter(s=>
      [s.student_name,s.enrollment_number,s.barcode_value]
      .some(v=>String(v||'').toLowerCase().includes(q))
    );

    $('studentRows').innerHTML=list.map(s=>`
      <tr>
        <td>
          <div class="student">
            <span class="miniavatar">${safe(initials(s.student_name))}</span>
            ${safe(s.student_name)}
          </div>
        </td>
        <td>${safe(s.enrollment_number)}</td>
        <td>${safe(s.barcode_value)}</td>
        <td>${s.created_at?new Date(s.created_at).toLocaleDateString():'—'}</td>
      </tr>
    `).join('')||'<tr><td class="empty" colspan="4">No students found.</td></tr>';
  }

  // ATTENDANCE TABLE
  function renderAttendance(){
    const q=$('attSearch').value.toLowerCase();
    const d=$('attDate').value;

    const list=records.filter(a=>
      (!d||a.attendance_date===d)&&
      [a.students?.student_name,a.students?.enrollment_number]
      .some(v=>String(v||'').toLowerCase().includes(q))
    );

    $('attRows').innerHTML=list.map(a=>`
      <tr>
        <td>${safe(a.students?.student_name||'Unknown')}</td>
        <td>${safe(a.students?.enrollment_number||'—')}</td>
        <td>${safe(a.attendance_date)}</td>
        <td>${a.attendance_time?new Date(a.attendance_time).toLocaleTimeString():''}</td>
        <td><span class="badge">Present</span></td>
      </tr>
    `).join('')||'<tr><td class="empty" colspan="5">No matching records.</td></tr>';
  }

  $('studentSearch').oninput=renderStudents;
  $('attSearch').oninput=renderAttendance;
  $('attDate').onchange=renderAttendance;

  // ADD STUDENT
  $('add').onclick=()=>$('modal').classList.add('show');

  function close(){
    $('modal').classList.remove('show');
  }

  $('close').onclick=$('cancel').onclick=close;

  $('studentForm').onsubmit=async e=>{
    e.preventDefault();

    if(!db)return toast('Not connected to Supabase.');

    const data=Object.fromEntries(new FormData(e.target));

    const {error}=await db.from('students').insert(data);

    if(error){
      return toast(
        error.code==='23505'
        ?'Enrollment number or barcode already exists.'
        :error.message
      );
    }

    e.target.reset();
    close();
    toast('Student registered successfully.');
    load();
  };

  // STOP CAMERA
  async function stop(){
    if(qr){
      try{
        if(qr.isScanning)await qr.stop();
        await qr.clear();
      }catch(e){}

      qr=null;
    }

    $('start').disabled=false;
    $('stop').disabled=true;

    $('reader').innerHTML=`
      <div class="placeholder">
        <span class="symbol">⌗</span>
        <b>Camera preview</b>
        <small>Start the scanner to activate your camera.</small>
      </div>
    `;
  }

  // SEND BARCODE TO EDGE FUNCTION
  async function process(value){
    value=String(value||'').trim();

    if(!value)return;

    $('result').innerHTML=`
      <span class="symbol">⌗</span>
      <b>Processing barcode...</b>
      <small>${safe(value)}</small>
    `;

    if(!db)return toast('Supabase is not connected.');

    const {data:{session}}=await db.auth.getSession();

    if(!session){
      showLogin('Please log in to mark attendance.');
      return;
    }

    const {data,error}=await db.functions.invoke(
      'mark-attendance',
      {
        body:{barcode:value}
      }
    );

    if (error) {
  console.error('Attendance error:', error);

  let message = error.message || 'Attendance failed';

  if (error.context) {
    try {
      const details = await error.context.json();
      message = details.error || details.message || message;
      console.error('Backend response:', details);
    } catch (e) {
      console.error('Could not read backend response:', e);
    }
  }

  alert(message);
  return;
}

if (!data?.success) {
  alert(data?.message || 'Attendance was not marked', 'error');
  return;
}
alert(data.message);

    if(!data?.success){
      $('rname').textContent=data?.student||'—';
      $('renroll').textContent=data?.enrollment||'—';
      $('rstatus').textContent=data?.error||'Not recorded';

      $('result').innerHTML=`
        <span class="symbol">!</span>
        <b>${safe(data?.error||'Attendance not recorded')}</b>
        <small>${safe(data?.student||value)}</small>
      `;

      toast(data?.error||'Attendance not recorded.');
      return;
    }

    $('rname').textContent=data.student||'—';
    $('renroll').textContent=data.enrollment||'—';
    $('rstatus').textContent='Present';

    $('result').innerHTML=`
      <span class="symbol">✓</span>
      <b>Attendance marked successfully</b>
      <small>${safe(data.student)} · ${safe(data.enrollment)}</small>
    `;

    toast('Attendance marked successfully!');
    await load();
  }

  // CAMERA SCANNER
  $('start').onclick=async()=>{
    if(!window.Html5Qrcode){
      return toast('Scanner library unavailable. Check internet and refresh.');
    }

    if(location.protocol!=='https:'&&
       location.hostname!=='localhost'&&
       location.hostname!=='127.0.0.1'){
      return toast('Camera requires HTTPS or localhost.');
    }

    qr=new Html5Qrcode('reader');

    try{
      await qr.start(
        {facingMode:'environment'},
        {
          fps:10,
          qrbox:{width:270,height:130},
          aspectRatio:1.5
        },
        async text=>{
          await stop();
          await process(text);
        },
        ()=>{}
      );

      $('start').disabled=true;
      $('stop').disabled=false;

    }catch(e){
      toast('Camera error: '+(e.message||'Check permission.'));
      await stop();
    }
  };

  $('stop').onclick=stop;

  // MANUAL BARCODE ENTRY
  $('manual').onclick=()=>{
    const v=prompt('Enter decoded barcode value');
    if(v?.trim())process(v.trim());
  };

  // EXPORT CSV
  $('export').onclick=()=>{
    const list=records.filter(a=>
      !$('attDate').value||a.attendance_date===$('attDate').value
    );

    const csv=[
      ['Student','Enrollment','Date','Time'],
      ...list.map(a=>[
        a.students?.student_name||'',
        a.students?.enrollment_number||'',
        a.attendance_date||'',
        a.attendance_time||''
      ])
    ].map(r=>
      r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')
    ).join('\n');

    const u=URL.createObjectURL(
      new Blob([csv],{type:'text/csv'})
    );

    const a=document.createElement('a');
    a.href=u;
    a.download='nexus-attendance.csv';
    a.click();

    URL.revokeObjectURL(u);
  };

  // SAVE SETTINGS
  $('save').onclick=()=>{
    const url=$('url').value.trim();
    const key=$('key').value.trim();

    if(!url.startsWith('https://')||!key){
      return toast('Enter a valid Supabase URL and publishable key.');
    }

    localStorage.setItem('nexus_db',JSON.stringify({url,key}));

    try{
      connect(url,key);
      toast('Supabase connection details saved.');
    }catch(e){
      toast(e.message);
    }
  };

  // CLEAR SETTINGS
  $('clear').onclick=()=>{
    localStorage.removeItem('nexus_db');
    $('url').value='';
    $('key').value='';
    db=null;
    showLogin('Connection cleared. Enter your Supabase details to continue.');
  };

  // ADMIN LOGIN
  $('loginForm').onsubmit=async e=>{
    e.preventDefault();
    $('loginError').textContent='';

    const url=$('loginUrl').value.trim();
    const key=$('loginKey').value.trim();
    const email=$('loginEmail').value.trim();
    const password=$('loginPassword').value;

    if(!url.startsWith('https://')||!key){
      $('loginError').textContent='Enter a valid Supabase URL and publishable key.';
      return;
    }

    try{
      connect(url,key);

      localStorage.setItem('nexus_db',JSON.stringify({url,key}));

      const {data,error}=await db.auth.signInWithPassword({
        email,
        password
      });

      if(error)throw error;

      $('loginPassword').value='';
      showApp();

      $('connection').textContent='Admin authenticated';

      await load();

    }catch(err){
      $('loginError').textContent=err.message||'Login failed.';
    }
  };

  // LOGOUT
  $('logout').onclick=async()=>{
    if(db)await db.auth.signOut();

    students=[];
    records=[];

    showLogin('You have been logged out.');
  };

  // RESTORE SAVED CONNECTION AND SESSION
(async () => {
  try {
    const saved = JSON.parse(
      localStorage.getItem('nexus_db') || 'null'
    );

    if (!saved?.url || !saved?.key) {
      showLogin();
      return;
    }

    $('loginUrl').value = saved.url;
    $('loginKey').value = saved.key;

    $('url').value = saved.url;
    $('key').value = saved.key;

    connect(saved.url, saved.key);

    // Wait for Supabase to restore the saved session
    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    if (data.session) {
      showApp();
      $('connection').textContent = 'Admin authenticated';
      await load();
    } else {
      showLogin('Please log in to continue.');
    }

  } catch (error) {
    console.error('Session restoration error:', error);
    showLogin('Could not restore your session. Please log in again.');
  }
})();
})();
