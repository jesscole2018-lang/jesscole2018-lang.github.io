/* CIC Merch Review — GitHub Pages boot (shared by every client folder, e.g. /FND, /MOV).
   Signs the reviewer in with Supabase, loads that client's private site data (items, prices, inventory)
   from the database, and provides the small storage API the page was written against
   (claude.use('db'|'user'|'downloads')).
   No pricing or inventory data lives in this repository; it is loaded only after an approved person signs in,
   and every row is scoped to CFG.client so one client's reviewers can never read another's data. */
(function(){
  const CFG = window.SITE_CONFIG || window.FND_CONFIG;
  const CLIENT = CFG.client;
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
  window.__sb = sb;
  /* products with no store photo (e.g. new SKUs added by the daily refresh) show the logo instead of a broken image */
  window.addEventListener('error', e => { const t = e.target; if (t && t.tagName === 'IMG' && !t.dataset.fb){ t.dataset.fb = '1'; t.src = CFG.fallbackLogo || 'brand/logo.png'; t.style.objectFit = 'contain'; t.style.padding = '18%'; t.alt = 'No photo in the store yet'; } }, true);
  const $g = id => document.getElementById(id);
  let me = null;            // { email, name, role }

  /* ---------- sign-in gate ---------- */
  function gate(html){ $g('gateBody').innerHTML = html; $g('gate').hidden = false; }
  function gateMsg(t, bad){ const m = $g('gateMsg'); if (m){ m.textContent = t; m.style.color = bad ? '#E4002B' : '#555'; } }
  function showSignIn(note){
    gate(`<h1>Merchandise Review</h1><p class="gsub">${esc(CFG.storeName || '')}${CFG.storeName ? ' · ' : ''}prepared by CIC</p>
      <form id="signin" autocomplete="on">
        <label>Email<input id="gEmail" type="email" required autocomplete="username"></label>
        <label>Password<input id="gPass" type="password" required autocomplete="current-password"></label>
        <button class="gbtn" type="submit">Sign in</button>
        <p id="gateMsg" class="gmsg">${note || 'Use the email and password CIC sent you.'}</p>
      </form>`);
    $g('signin').onsubmit = async e => {
      e.preventDefault(); gateMsg('Signing in…');
      const { error } = await sb.auth.signInWithPassword({ email: $g('gEmail').value.trim(), password: $g('gPass').value });
      if (error) gateMsg('Sign-in failed: ' + error.message, true); else start();
    };
  }
  async function signOut(){ await sb.auth.signOut(); location.hash = ''; location.reload(); }
  window.fndSignOut = signOut;

  async function loadMe(){
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const email = (user.email || '').toLowerCase();
    const { data, error } = await sb.from('allowed_users').select('email,name,role,clients').eq('email', email).maybeSingle();
    if (error || !data) return { email, name: '', role: null, clients: [] };
    if (data.role !== 'admin' && !(data.clients || []).includes(CLIENT)) return { email, name: data.name || '', role: null, clients: data.clients || [] };
    return { email, name: data.name || '', role: data.role, clients: data.clients || [] };
  }

  async function loadSite(){
    const { data, error } = await sb.from('kv').select('id,data').eq('client', CLIENT).eq('collection', 'site').eq('id', 'bundle').maybeSingle();
    if (error) throw error;
    return data ? data.data : null;
  }

  /* ---------- admin: import the private data file ---------- */
  function showImport(msg){
    gate(`<h1>Load site data</h1><p class="gsub">Signed in as ${esc(me.email)} (admin) · ${esc(CLIENT)}</p>
      <p class="gmsg">${msg || 'Pick the INTERNAL ONLY site-data file CIC prepared. It loads the items, prices, current inventory and any saved decisions.'}</p>
      <input id="gFile" type="file" accept=".json,application/json">
      <button class="gbtn" id="gImport" type="button">Load data</button>
      <p id="gateMsg" class="gmsg"></p>
      <p class="gmsg"><a href="#" id="gOut">Sign out</a></p>`);
    $g('gOut').onclick = e => { e.preventDefault(); signOut(); };
    $g('gImport').onclick = async () => {
      const f = $g('gFile').files[0]; if (!f){ gateMsg('Choose the file first.', true); return; }
      try{
        gateMsg('Reading…');
        const bundle = JSON.parse(await f.text());
        const site = bundle.site || bundle;           // {WHY, ITEMS, CURRENT, ...}
        const rows = [{ collection: 'site', id: 'bundle', client: CLIENT, data: site }];
        for (const d of (bundle.docs || [])) rows.push({ collection: d.collection, id: d.id, client: CLIENT, data: d.data });
        gateMsg('Uploading ' + rows.length + ' records…');
        for (let i = 0; i < rows.length; i += 50){
          const { error } = await sb.from('kv').upsert(rows.slice(i, i + 50), { onConflict: 'client,collection,id' });
          if (error) throw error;
        }
        gateMsg('Loaded. Opening the site…'); setTimeout(() => location.reload(), 600);
      }catch(err){ console.error(err); gateMsg('Could not load: ' + (err.message || err), true); }
    };
  }

  /* ---------- storage API used by the page ---------- */
  const listeners = {};      // collection -> [{next, err}]
  const lastSeen = {};       // collection -> ISO timestamp
  async function pull(coll, initial){
    let q = sb.from('kv').select('id,data,updated_at').eq('client', CLIENT).eq('collection', coll).order('updated_at', { ascending: true });
    if (!initial && lastSeen[coll]) q = q.gt('updated_at', lastSeen[coll]);
    const { data, error } = await q;
    if (error){ (listeners[coll] || []).forEach(l => l.err && l.err({ code: 'unavailable', message: error.message })); return; }
    if (!data || !data.length) return;
    lastSeen[coll] = data[data.length - 1].updated_at;
    const changes = data.map(r => ({ type: initial ? 'added' : 'modified', doc: { id: r.id, exists: true, data: () => r.data } }));
    const snap = { docChanges: () => changes, metadata: { fromCache: false, hasPendingWrites: false } };
    (listeners[coll] || []).forEach(l => { try{ l.next(snap); }catch(e){ console.error(e); } });
  }
  setInterval(() => Object.keys(listeners).forEach(c => pull(c, false)), 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) Object.keys(listeners).forEach(c => pull(c, false)); });

  const split = path => { const i = path.indexOf('/'); return [path.slice(0, i), path.slice(i + 1)]; };
  const db = {
    doc(path){
      const [coll, id] = split(path);
      return {
        async set(data){
          if (coll === 'site') throw { code: 'invalid_argument', message: 'read only' };
          const { error } = await sb.from('kv').upsert({ collection: coll, id, client: CLIENT, data }, { onConflict: 'client,collection,id' });
          if (error) throw { code: /row-level security|permission/i.test(error.message) ? 'invalid_argument' : 'unavailable', message: error.message };
          setTimeout(() => pull(coll, false), 300);
        },
        async get(){
          const { data, error } = await sb.from('kv').select('data').eq('client', CLIENT).eq('collection', coll).eq('id', id).maybeSingle();
          if (error) throw { code: 'unavailable', message: error.message };
          return { id, exists: !!data, data: () => data ? data.data : undefined };
        },
        async delete(){
          const { error } = await sb.from('kv').delete().eq('client', CLIENT).eq('collection', coll).eq('id', id);
          if (error) throw { code: 'invalid_argument', message: error.message };
        }
      };
    },
    collection(coll){
      return {
        onSnapshot(next, err){ (listeners[coll] = listeners[coll] || []).push({ next, err }); pull(coll, true); return () => { listeners[coll] = (listeners[coll] || []).filter(l => l.next !== next); }; },
        doc(id){ return db.doc(coll + '/' + id); }
      };
    }
  };
  const user = {
    async can(what){ return what === 'data.write' ? !!(me && me.role) : null; },
    async canEdit(){ return !!(me && me.role === 'admin'); },
    async isOwner(){ return !!(me && me.role === 'admin'); },
    async me(){ return { id: me ? me.email : '', name: me ? (me.name || me.email) : '' }; },
    async id(){ return me ? me.email : ''; }
  };
  const downloads = {
    async save({ filename, data }){
      const blob = data instanceof Blob ? data : new Blob([data], { type: /\.csv$/i.test(filename) ? 'text/csv' : 'text/plain' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
  };
  window.claude = { use: async name => name === 'db' ? db : name === 'user' ? user : name === 'downloads' ? downloads : null };

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* ---------- start ---------- */
  async function start(){
    gate('<p class="gmsg">Loading…</p>');
    me = await loadMe();
    if (!me){ showSignIn(); return; }
    if (!me.role){ gate(`<h1>No access yet</h1><p class="gmsg">${esc(me.email)} is signed in but isn’t on the reviewer list for this site. Ask CIC to add this email.</p><p class="gmsg"><a href="#" id="gOut">Sign out</a></p>`); $g('gOut').onclick = e => { e.preventDefault(); signOut(); }; return; }
    let site = null;
    try{ site = await loadSite(); }catch(e){ console.error(e); }
    if (!site){
      if (me.role === 'admin'){ showImport(); return; }
      gate('<h1>Almost ready</h1><p class="gmsg">CIC is still loading this site. Please check back shortly.</p>'); return;
    }
    if (me.role === 'admin' && /[?&]import\b/.test(location.search)){ showImport('Load an updated INTERNAL ONLY site-data file. Saved decisions are kept.'); return; }
    window.__D = site;
    const s = document.createElement('script'); s.src = 'app.js?v=' + CFG.version;
    s.onload = () => { $g('gate').hidden = true; addAccountChip(); };
    s.onerror = () => gateMsg('Could not load the page script.', true);
    document.body.appendChild(s);
  }
  function addAccountChip(){
    const links = document.querySelector('.hdr-links'); if (!links) return;
    const a = document.createElement('a'); a.href = '#'; a.className = 'hdr-link'; a.title = 'Signed in as ' + me.email + ' — click to sign out';
    a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>Sign out';
    a.onclick = e => { e.preventDefault(); signOut(); };
    links.appendChild(a);
  }
  sb.auth.getSession().then(({ data }) => data.session ? start() : showSignIn());
})();
