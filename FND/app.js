
const BRANDS = [
  {id:'fnd', name:'Floor & Decor', short:'Standard', blurb:'Standard Floor & Decor logo program. Items for the general store catalog, decorated with the master Floor & Decor Tile · Wood · Stone signature.'},
  {id:'proaccess', name:'Pro Access', short:'Pro Access', blurb:'Pro Access sub-brand catalog. Decorated with the stacked Pro Access lockup with the Floor & Decor logo wherever the imprint area can carry it (replaces the former Pro Premier program).'},
  {id:'designservices', name:'Design Services', short:'Design Services', blurb:'Design Services department catalog.'},
  {id:'designstudio', name:'Design Studio', short:'Design Studio', blurb:'Design Studio sub-brand lockup catalog.'},
  {id:'commercial', name:'Commercial', short:'Commercial', blurb:'Commercial sub-brand lockup catalog.'},
  {id:'dcops', name:'DC Operations', short:'DC Operations', blurb:'Distribution Center Operations catalog.'},
  {id:'fndcares', name:'FND Cares', short:'FND Cares', blurb:'FND Cares program catalog.'}
];

const WHY=__D.WHY;
const ITEMS=__D.ITEMS;


/* ---------- current store inventory: CIC keep / discontinue recommendations ----------
   Source: Titan report 123 (Inventory with Booked Qtys) and report 109 (Catalog Sales Booked by Product), FND store, pulled 10/19/26. */
const INV_ASOF=__D.INV_ASOF;
const CURRENT=__D.CURRENT;
const isIncStock=c=>c.storeStatus==='Incomplete'&&(c.avail>0||c.onHand>0);
const CORE_DP=new Set(__D.CORE_DP||[]);
const coreBand=c=>CORE_DP.has(c.id)?'<span class="coreband">'+esc(__D.CORE_LABEL||'Core Product')+'</span>':'';
const INVREC={keep:{label:'Keep',cls:'keep'},disc:{label:'Discontinue',cls:'disc'}};
const INVDEC={agree:{label:'Agree with CIC',cls:'ok',icon:'✓'},keep:{label:'Keep',cls:'ok',icon:'✓'},disc:{label:'Discontinue',cls:'bad',icon:'✕'},discuss:{label:'Discuss',cls:'warn',icon:'?'}};
let invDecisions={};
const fmtA=c=>c.avail<0?`0 · ${fmtN(-c.avail)} back-ordered`:fmtN(c.avail);
const fmtN=n=>(n<0?'-':'')+Math.abs(n).toLocaleString('en-US');
const pct=(a,b)=>b?Math.round((a-b)/b*100):null;
const monthsSupply=c=>{if(c.ms!==undefined) return c.ms; const m=c.sold90/3; return m>0?(c.avail+c.onOrder)/m:(c.sold12>0?(c.avail+c.onOrder)/(c.sold12/12):null);};
const STATUS = {approved:{label:'Approved',cls:'ok',icon:'✓'}, changes:{label:'Approved w/ changes',cls:'warn',icon:'✎'}, declined:{label:'Declined',cls:'bad',icon:'✕'}};
const PRIO = {1:'Low interest',2:'Maybe',3:'Nice to have',4:'Want it',5:'Must have'};

let db=null, userApi=null, downloadsApi=null, dbReady=false, canWrite=null, myName='';
const layouts={}; let arranging=false, arrangeOrder=null, dragId=null;
const decisions = {};   // itemId -> doc data
/* ---- sample cart: picked per reviewer in this browser, submitted once with one ship-to ---- */
let cart = {};            // itemId -> {size}
let shipto = {};          // remembered ship-to (this browser)
let myOrders = [];        // request ids placed from this browser
try{ myOrders = JSON.parse(localStorage.getItem('fnd-myorders')||'[]')||[]; }catch(e){ myOrders=[]; }
const ORDER_STATUS={new:{label:'Received',cls:'pend',step:1}, received:{label:'Processing',cls:'warn',step:2}, shipped:{label:'Shipped',cls:'ok',step:3}};
const ostat=st=>ORDER_STATUS[st]||ORDER_STATUS.new;
const sampleRequests = {};// requestId -> doc (from the shared decision log)
try{ cart = JSON.parse(localStorage.getItem('fnd-samplecart')||'{}')||{}; }catch(e){ cart={}; }
try{ shipto = JSON.parse(localStorage.getItem('fnd-shipto')||'{}')||{}; }catch(e){ shipto={}; }
function saveCart(){ try{ localStorage.setItem('fnd-samplecart', JSON.stringify(cart)); }catch(e){} const n=Object.keys(cart).length; const p=document.getElementById('samplePill'); if(p){ p.textContent=n; p.hidden=n<1; } }
function inCart(id){ return !!cart[id]; }
function toggleCart(it,size){ if(cart[it.id]) delete cart[it.id]; else cart[it.id]={size: size||'', addedAt:new Date().toISOString()}; saveCart(); }
const SIZES=it=>{ if(!it.quote||!it.quote.ext) return null; const base=(it.quote.base||'').split('–'); const order=['XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL']; const a=order.indexOf(base[0]), b=order.indexOf(base[1]); const list=(a>=0&&b>=0)?order.slice(a,b+1):[]; return list.concat(it.quote.ext.map(e=>e[0])); };
let unsub=null;
let current = {brand:null, item:null, mediaIdx:0, draft:null, cat:'all', sort:'featured'};
const CAT_ORDER=['Apparel','Desk','Drinkware','Bags','Tech','Tools'];
/* item-type order used on every catalog page: polos, jackets/layers, shirts & tees, headwear, other apparel, then office, drinkware, bags, tech, tools, outdoor, events, giveaways */
function typeRank(name,cat){ const n=String(name||'').toLowerCase(), c=String(cat||'').toLowerCase();
  const top=c.split('/')[0].trim();
  if(/golf/.test(n)) return 11;
  if(top==='apparel'||top==='headwear'){
    if(/\bpolo/.test(n)||c.includes('polos')) return 0;
    if(/jacket|softshell|soft shell|\bvest|puffer|fleece|full zip|1\/4 zip|quarter zip|pullover|hood|sweatshirt/.test(n)||/jackets|fleece|hoodies|outerwear/.test(c)) return 1;
    if(/\bkit\b|\bset\b/.test(n)) return 4.5;
    if(/\btees?\b|t-shirt|shirt|button ?down|flannel/.test(n)||c.includes('shirts')) return 2;
    if(top==='headwear'||c.includes('headwear')||/\bcaps?\b|\bhat\b|beanie|visor|trucker/.test(n)) return 3;
    return 4; }
  const order={desk:5,drinkware:6,bags:7,tech:8,tools:9,outdoor:10,events:11,'fun & giveaways':12};
  return order[top]!==undefined?order[top]:13; }
const money=v=>{const [d,c]=v.toFixed(2).split('.');return d.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+c};
window.addEventListener('hashchange',()=>{arranging=false; arrangeOrder=null;});
const catOf=i=>(i.category||'Other').split('/')[0].trim();
const SORTS={featured:'Featured',price_asc:'Price: low to high',price_desc:'Price: high to low',min_asc:'Lowest minimum first',name:'Name A-Z'};
/* Apparel order on every catalog page: tees, polos, lighter jackets, fleece jackets, other jackets, then shirts, headwear, kits, accessories. Men's and women's of the same style + color sit side by side. */
const APP_PAIR={FND020086:'FND020006',FND020010:'FND020007',FND020089:'FND020088'};
function appGroup(name,cat){ const n=String(name||'').toLowerCase().replace(/[’‑–]/g,m=>m==='’'?"'":'-'), c=String(cat||'').toLowerCase(); const top=c.split('/')[0].trim();
  if(top!=='apparel'&&top!=='headwear') return null; if(/golf/.test(n)) return null;
  if(/\bkit\b|\bset\b/.test(n)) return 7;
  if(top==='headwear'||c.includes('headwear')||/\bcaps?\b|\bhat\b|beanie|visor|trucker/.test(n)) return 6;
  if(/\btees?\b|t-shirt/.test(n)) return 0;
  if(/\bpolo/.test(n)||c.includes('polos')) return 1;
  if(/puffer|\bvest\b|\bdown (jacket|vest)|down puffer/.test(n)) return 4;
  if(/soft ?shell|lightweight|1\/4 zip|quarter zip/.test(n)) return 2;
  if(/fleece|hood|sweatshirt/.test(n)||/fleece|hoodies/.test(c)) return 3;
  if(/jacket|full zip|pullover/.test(n)||/jackets|outerwear/.test(c)) return 4;
  if(/shirt|button ?down|flannel/.test(n)||c.includes('shirts')) return 5;
  return 8; }
const appFam=it=>String(it.name||'').toLowerCase().replace(/’/g,"'").replace(/\b(men'?s|mens|men|women'?s|womens|women|ladies'?|lds|lady)(?=\s|$)/g,' ').replace(/floor (&|and) decor/g,' ').replace(/\bls\b/g,'long sleeve').replace(/[^a-z0-9]+/g,' ').trim();
const appGender=it=>/\b(women|womens|ladies|lds|lady)\b|women's|ladies'/i.test(String(it.name||'').replace(/’/g,"'"))?1:0;
function apparelArrange(list,byId){ const app=[],rest=[]; let at=-1;
  list.forEach(it=>{ if(appGroup(it.name,it.category)===null) rest.push(it); else { if(at<0) at=rest.length; app.push(it);} });
  if(!app.length) return list.slice();
  const fam=it=>{ const p=APP_PAIR[it.id]; const src=p&&byId?(byId(p)||it):it; return appFam(src); };
  const ff={}, cf={}; app.forEach((it,k)=>{ const f=fam(it), c=f+'|'+String(it.color||'').toLowerCase(); if(!(f in ff)) ff[f]=k; if(!(c in cf)) cf[c]=k; });
  const key=it=>{const f=fam(it); return [appGroup(it.name,it.category), ff[f], cf[f+'|'+String(it.color||'').toLowerCase()], appGender(it)];};
  const ks=new Map(app.map(it=>[it,key(it)]));
  const sorted=app.map((it,k)=>[it,k]).sort((a,b)=>{const x=ks.get(a[0]),y=ks.get(b[0]); for(let i=0;i<4;i++) if(x[i]!==y[i]) return x[i]-y[i]; return a[1]-b[1];}).map(p=>p[0]);
  return rest.slice(0,at).concat(sorted,rest.slice(at)); }
function featuredOrder(brandId,list){return apparelArrange(featuredOrder0(brandId,list));}
function featuredOrder0(brandId,list){const saved=(layouts[brandId]||{}).order; const base=list.slice().sort((a,b)=>typeRank(a.name,a.category)-typeRank(b.name,b.category)||ITEMS.indexOf(a)-ITEMS.indexOf(b)); if(!saved||!saved.length) return base; const pos=id=>{const i=saved.indexOf(id);return i<0?1e6+ITEMS.findIndex(x=>x.id===id):i}; return base.sort((a,b)=>pos(a.id)-pos(b.id));}
function sortItems(list,how){const l=list.slice();const p=i=>i.quote?i.quote.sell:1e9;const m=i=>i.quote?i.quote.min:1e9;if(how==='price_asc')l.sort((a,b)=>p(a)-p(b));else if(how==='price_desc')l.sort((a,b)=>p(b)-p(a));else if(how==='min_asc')l.sort((a,b)=>m(a)-m(b));else if(how==='name')l.sort((a,b)=>a.name.localeCompare(b.name));return l;}

const $ = s=>document.querySelector(s);
const esc = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* ---- decisions that can't reach the shared log are kept on this device and emailed to CIC ---- */
const LOCAL_KEY='fnd-local-decisions'; const CIC_EMAIL=(__D.CIC_EMAIL||'');
let localDec={}; try{ localDec=JSON.parse(localStorage.getItem(LOCAL_KEY)||'{}')||{}; }catch(e){ localDec={}; }
function saveLocalStore(){ try{ localStorage.setItem(LOCAL_KEY,JSON.stringify(localDec)); }catch(e){} }
function keepLocal(coll,id,doc){ const d=Object.assign({},doc,{local:true}); localDec[coll+'/'+id]=d; saveLocalStore(); return d; }
function dropLocal(coll,id){ if(localDec[coll+'/'+id]){ delete localDec[coll+'/'+id]; saveLocalStore(); } }
function overlayLocal(){ for(const [k,d] of Object.entries(localDec)){ const [coll,id]=k.split('/'); const map=coll==='decisions'?decisions:invDecisions; const cur=map[id]; if(!cur||!cur.updatedAt||(d.updatedAt&&d.updatedAt>cur.updatedAt)) map[id]=d; } }
async function writeShared(coll,id,doc){
  /* returns 'shared' when the shared log confirms the write, 'local' when it is kept on this device */
  if(db && canWrite!==false){
    try{ await db.doc(coll+'/'+id).set(doc);
      try{ const g=await db.doc(coll+'/'+id).get(); const gd=g&&g.exists?g.data():null; if(gd&&gd.updatedAt===doc.updatedAt){ dropLocal(coll,id); return 'shared'; } }catch(e){ if(!(e&&e.code==='invalid_argument')){ dropLocal(coll,id); return 'shared'; } }
      canWrite=false;
    }catch(e){ console.error(e); if(e&&(e.code==='invalid_argument'||e.code==='revoked'||e.code==='not_granted')) canWrite=false; else throw e; }
  }
  keepLocal(coll,id,doc); return 'local';
}
function localList(){ return Object.entries(localDec).map(([k,d])=>({coll:k.split('/')[0],id:k.split('/')[1],d})).sort((a,b)=>(a.d.updatedAt||'').localeCompare(b.d.updatedAt||'')); }
function localText(){
  const L=localList(); const who=(L.find(x=>x.d.reviewer)||{d:{}}).d.reviewer||myName||'';
  const lab=x=>x.coll==='decisions'?((STATUS[x.d.status]||{}).label||x.d.status||'Cleared'):((INVDEC[x.d.status]||{}).label||x.d.status||'Cleared');
  const sec=(t,arr)=>arr.length?t+'\n'+arr.map(x=>'- '+x.d.name+' ('+(x.d.sku||x.id)+(x.d.brand?', '+((BRANDS.find(b=>b.id===x.d.brand)||{}).name||x.d.brand):'')+'): '+lab(x).toUpperCase()+(x.d.notes?' | Notes: '+x.d.notes:'')+' | '+fmtDate(x.d.updatedAt)).join('\n')+'\n\n':'';
  return 'Floor & Decor Merch Review decisions'+(who?' from '+who:'')+'\n\n'+sec('NEW ITEM SUGGESTIONS (Approve / Approve with changes / Decline)',L.filter(x=>x.coll==='decisions'))+sec('CURRENT INVENTORY (Keep / Discontinue / Discuss)',L.filter(x=>x.coll==='invdecisions'))+'Item ids: '+L.map(x=>x.coll+'/'+x.id).join(', ');
}
async function emailLocal(){
  const t=localText(); let copied=false; try{ await navigator.clipboard.writeText(t); copied=true; }catch(e){}
  const who=(localList().find(x=>x.d.reviewer)||{d:{}}).d.reviewer||myName||'';
  const body=t.length>1800?(copied?'My decisions are pasted below.\n\n':'')+t.slice(0,1700)+(copied?'\n\n[List is long - paste the full copied list here]':'\n...'):t;
  const href='mailto:'+CIC_EMAIL+'?subject='+encodeURIComponent('Floor & Decor Merch Review decisions'+(who?' - '+who:''))+'&body='+encodeURIComponent(body);
  let w=null; try{ w=window.open(href,'_blank'); }catch(e){}
  if(!w){ try{ window.top.location.href=href; }catch(e){ try{ location.href=href; }catch(e2){} } }
  toast('If no email opened, use Download or Copy and email '+CIC_EMAIL);
}
async function copyLocal(){ try{ await navigator.clipboard.writeText(localText()); toast('Decisions copied. Paste them into an email to CIC.'); }catch(e){ const w=$('#localText'); if(w){ w.hidden=false; w.select(); } toast('Select the text and copy it'); } }
function localBox(){ const n=Object.keys(localDec).length; return `<div class="notice" style="background:#f3f3f3;color:#000;border-left:5px solid var(--fnd-red)"><b style="display:block;margin-bottom:4px">${n?`${n} decision${n>1?'s':''} saved on this device, not yet sent to CIC`:'Your decisions will be saved on this device'}</b>Your Claude account can view this page but can’t write to CIC’s shared decision log, so each decision you save is kept on this device (this computer and browser). When you finish, send them to CIC at <b>${CIC_EMAIL}</b>: click <b>Email my decisions</b> and press Send in the email that opens, or use <b>Download</b> or <b>Copy</b> and attach or paste the list into your own email.${n?`<div class="save" style="margin-top:10px"><button class="btn primary" type="button" id="emailLocal">Email my decisions (${n})</button>${downloadsApi?'<button class="btn ghost" type="button" id="dlLocal">Download</button>':''}<button class="btn ghost" type="button" id="copyLocal">Copy</button></div><label style="display:block;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-top:10px">Your decisions</label><textarea id="localText" readonly style="width:100%;min-height:140px;margin-top:4px;font:13px/1.4 var(--body);padding:8px;border:1px solid var(--line);background:#fff">${esc(localText())}</textarea>`:''}</div>`; }
async function dlLocal(){ const who=((localList().find(x=>x.d.reviewer)||{d:{}}).d.reviewer||myName||'reviewer').replace(/[^A-Za-z0-9]+/g,'-'); try{ await downloadsApi.save({filename:'FND-Merch-Review-decisions-'+who+'.txt', data:localText()}); toast('Saved. Attach the file to an email to CIC.'); }catch(e){ if(!(e&&e.code==='declined')) toast('Download unavailable here. Use Copy instead.'); } }
function bindLocalBox(){ const e=$('#emailLocal'); if(e) e.onclick=emailLocal; const c=$('#copyLocal'); if(c) c.onclick=copyLocal; const d=$('#dlLocal'); if(d) d.onclick=dlLocal; const t=$('#localText'); if(t) t.onfocus=()=>t.select(); }
async function syncLocal(){ const L=localList(); if(!L.length||!db||canWrite===false) return; let n=0; for(const x of L){ try{ const map=x.coll==='decisions'?decisions:invDecisions; const doc=Object.assign({},x.d); delete doc.local; const w=await writeShared(x.coll,x.id,doc); if(w==='shared'){ map[x.id]=doc; n++; } else break; }catch(e){ break; } } if(n){ toast(n+' saved decision'+(n>1?'s':'')+' sent to CIC'); renderProgress(); route(); } }
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),2200)}
function stars(n){let s='';for(let i=1;i<=5;i++)s+=`<span class="${i<=(n||0)?'':'off'}">★</span>`;return `<span class="stars" title="${PRIO[n]||'Not rated'}">${s}</span>`}
function chip(d){ if(!d||!d.status) return '<span class="chip pend">Awaiting review</span>'; const s=STATUS[d.status]; return `<span class="chip ${s.cls}">${s.icon} ${s.label}</span>`}
function fmtDate(iso){ if(!iso) return ''; try{return new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}catch(e){return iso} }

/* ---------- routing ---------- */
function route(){
  const h=(location.hash||'#').slice(1);
  if(h==='summary'){ current.brand=null; current.item=null; renderSummary(); }
  else if(h==='samples'){ current.brand=null; current.item=null; renderSamples(); }
  else if(h==='history'){ current.brand=null; current.item=null; renderHistory(); }
  else if(h.startsWith('inv-')){ const c=CURRENT.find(x=>x.id===h.slice(4)); if(c){ current.item=null; current.inv=c.id; current.brand=c.brand; current.invDraft=null; renderInvItem(c);} else { location.hash='#fnd-current'; return; } }
  else if(h.endsWith('-current')){ const b=BRANDS.find(x=>x.id===h.slice(0,-8))||BRANDS[0]; current.brand=b.id; current.item=null; current.inv=null; renderCurrent(b); }
  else if(h.startsWith('item-')){ const it=ITEMS.find(i=>i.id===h.slice(5)); if(it){ current.item=it.id; current.brand=it.brand; current.mediaIdx=0; current.draft=null; renderItem(it);} else { location.hash='#fnd'; return; } }
  else { const b=BRANDS.find(b=>b.id===h)||BRANDS[0]; if(current.brand!==b.id) current.cat='all'; current.brand=b.id; current.item=null; renderBrand(b); }
  renderTabs(); renderProgress(); window.scrollTo({top:0});
}
window.addEventListener('hashchange',route);

function renderTabs(){
  const el=$('#tabs'); el.innerHTML='';
  const h=location.hash.slice(1);
  for(const b of BRANDS){
    const n=ITEMS.filter(i=>i.brand===b.id).length, nc=CURRENT.filter(c=>c.brand===b.id).length;
    const onCur=h===b.id+'-current'||(h.startsWith('inv-')&&current.brand===b.id), onSug=!onCur&&current.brand===b.id&&!['summary','samples','history'].includes(h);
    const w=document.createElement('div'); w.className='tabdd';
    w.innerHTML=`<a class="tab" href="#${b.id}" aria-haspopup="true" aria-expanded="false">${esc(b.short)}<span class="car" aria-hidden="true">▾</span></a><div class="ddmenu" role="menu"><a role="menuitem" href="#${b.id}-current" ${onCur?'aria-current="page"':''}>Current Inventory Status</a><a role="menuitem" href="#${b.id}" ${onSug?'aria-current="page"':''}>Refresh Inventory Suggestions</a></div>`;
    const t=w.querySelector('.tab');
    if(current.brand===b.id && !['summary','samples','history'].includes(h)) t.setAttribute('aria-current','page');
    t.addEventListener('click',e=>{ e.preventDefault(); const o=!w.classList.contains('open'); el.querySelectorAll('.tabdd.open').forEach(x=>{x.classList.remove('open'); x.querySelector('.tab').setAttribute('aria-expanded','false');}); if(o){ w.classList.add('open'); t.setAttribute('aria-expanded','true'); } });
    w.querySelectorAll('.ddmenu a').forEach(a=>a.addEventListener('click',()=>{ w.classList.remove('open'); a.blur(); }));
    el.appendChild(w);
  }
}
document.addEventListener('click',e=>{ if(!e.target.closest('.tabdd')) document.querySelectorAll('.tabdd.open').forEach(x=>{x.classList.remove('open'); x.querySelector('.tab').setAttribute('aria-expanded','false');}); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') document.querySelectorAll('.tabdd.open').forEach(x=>x.classList.remove('open')); });
function renderProgress(){
  const total=ITEMS.length, done=ITEMS.filter(i=>decisions[i.id]&&decisions[i.id].status).length;
  $('#progressText').textContent=`${done} of ${total} reviewed`; const pill=$('#progressPill'); if(pill){ pill.textContent=done; pill.hidden=done<1; }
}

/* ---------- brand catalog ---------- */
const BRAND_LABEL=b=>b.id==='fnd'?'Standard Floor & Decor Logo':b.name;
const HERO_TITLE='Floor & Decor Merchandise Decision Site';
function viewSel(b,mode){ return `<div class="viewsel"><label for="viewSel">View</label><select id="viewSel" aria-label="Choose what to review"><option value="current" ${mode==='current'?'selected':''}>Current Inventory</option><option value="suggest" ${mode==='suggest'?'selected':''}>Refresh Inventory Suggestions</option></select></div>`; }
function bindViewSel(b){ const v=$('#viewSel'); if(v) v.onchange=()=>{ location.hash = v.value==='current' ? '#'+b.id+'-current' : '#'+b.id; }; }
const INVCATS=['Apparel','Headwear','Desk','Drinkware','Bags','Tech','Tools','Events','Fun & Giveaways'];
const INVSORT={type:'Item type',rec:'CIC recommendation',sold:'Most sold (12 mo)',stock:'Most stock',name:'Name A-Z'};
function renderCurrent(b){
  const all=CURRENT.filter(c=>c.brand===b.id);
  if(current.invBrand!==b.id){current.invBrand=b.id; current.invRec='all'; current.invCat='all';}
  const rf=current.invRec||'all', cf=current.invCat||'all', so=current.invSort||'type';
  let items=searchQ?all.filter(c=>(c.name+' '+c.id+' '+c.category).toLowerCase().includes(searchQ)):all;
  const k=all.filter(c=>c.rec==='keep').length, dsc=all.filter(c=>c.rec==='disc').length, rev=all.filter(c=>invDecisions[c.id]&&invDecisions[c.id].status).length;
  let html=`<section class="hero compact"><div class="brandhead"><div><h1>${esc(HERO_TITLE)}</h1><p class="brandline"><span>Brand</span><b>${esc(BRAND_LABEL(b))}</b> · Current Inventory Status</p></div>
  <div class="stats"><div class="stat"><b>${all.length}</b><span>In store</span></div><div class="stat"><b style="color:var(--ok)">${k}</b><span>Keep</span></div><div class="stat"><b style="color:var(--fnd-red)">${dsc}</b><span>Discontinue</span></div><div class="stat"><b>${rev}</b><span>Reviewed</span></div></div></div></section>`;
  html+=`<div class="sechead"><h2>${searchQ?'Search results':'Keep or discontinue'}</h2></div>`;
  if(all.length){
    const cats=INVCATS.filter(c=>all.some(i=>i.category===c));
    html+=`<div class="browse" role="group" aria-label="Filter current items">`+[['all','All',all.length],['keep','CIC: Keep',k],['disc','CIC: Discontinue',dsc],['already','Already Discontinued',all.filter(c=>c.skuStatus==='Discontinued').length]].map(([v,l,n])=>`<button class="pill" data-rec="${v}" aria-pressed="${rf===v}">${l}<span class="n">${n}</span></button>`).join('')+`<select id="invCat" aria-label="Category"><option value="all">All categories</option>${cats.map(c=>`<option ${cf===c?'selected':''}>${esc(c)}</option>`).join('')}</select><select id="invSort" aria-label="Sort by">${Object.entries(INVSORT).map(([kk,v])=>`<option value="${kk}" ${so===kk?'selected':''}>Sort: ${v}</option>`).join('')}</select></div>`;
  }
  items=items.filter(c=>(rf==='all'||(rf==='already'?c.skuStatus==='Discontinued':c.rec===rf))&&(cf==='all'||c.category===cf));
  const sorters={type:(x,y)=>typeRank(x.name,x.category)-typeRank(y.name,y.category)||x.name.localeCompare(y.name),rec:(x,y)=>(x.rec===y.rec?0:x.rec==='keep'?-1:1)||y.sold12-x.sold12, sold:(x,y)=>y.sold12-x.sold12, stock:(x,y)=>Math.max(y.avail,0)-Math.max(x.avail,0), name:(x,y)=>x.name.localeCompare(y.name)};
  items=items.slice().sort(sorters[so]||sorters.type); if(!sorters[so]||so==='type') items=apparelArrange(items,id=>CURRENT.find(x=>x.id===id)); items=items.filter(c=>!c.overseas).concat(items.filter(c=>c.overseas));
  const card=c=>{const d=invDecisions[c.id]; const ch=pct(c.sold12,c.soldPrior); return `<a class="card" href="#inv-${c.id}"><div class="ph"><img class="a" src="${c.img}" alt="${esc(c.name)}" loading="lazy"><span class="tag ${INVREC[c.rec].cls}">CIC: ${INVREC[c.rec].label}</span>${isIncStock(c)?'<span class="tag sku inc">Incomplete</span>':`<span class="tag sku ${c.skuStatus==='Active'?'':'off'}">SKU ${esc(c.skuStatus)}</span>`}<div class="bandstack">${coreBand(c)}${c.overseas?'<span class="ovsband"><i>Overseas</i> Reorder takes several months</span>':''}</div></div><div class="cb"><div class="nm">${esc(c.name)}</div><ul class="invlist"><li class="rec ${c.rec}"><b>CIC Recommendation:</b> <b class="rv">${INVREC[c.rec].label}</b></li><li>Current Available Inventory: <b>${fmtA(c)}</b></li>${c.onOrder?`<li>On order: <b>${fmtN(c.onOrder)}</b></li>`:''}<li>Sold over the last 12 months: <b>${fmtN(c.sold12)}</b>${ch!==null?` <span class="chg ${ch<0?'dn':'up'}">(${ch>0?'+':''}${ch}%)</span>`:''}</li>${c.storeStatus&&c.storeStatus!=='In Store'?`<li>Store listing: <b>${esc(c.storeStatus)}</b></li>`:''}</ul>${d&&d.status?`<div class="inc" style="margin-top:2px"><span class="chip ${INVDEC[d.status].cls}">${INVDEC[d.status].icon} ${INVDEC[d.status].label}</span></div>`:''}</div></a>`;};
  if(!all.length){ html+=`<div class="empty"><b>Current ${esc(b.name)} items are coming next</b>${b.id==='proaccess'?'CIC is loading the Pro Premier items that are in the store today, with a keep or discontinue recommendation for each.':'CIC is loading the items in the store today for this logo, with a keep or discontinue recommendation for each.'}</div>`; }
  else if(!items.length){ html+=`<div class="empty"><b>No current items match</b>Try another filter, category or search.</div>`; }
  else { html+='<div class="grid">'+items.map(card).join('')+'</div>'; }
  html+=`<div class="sechead" style="margin-top:48px"><h2>How to review</h2></div><div class="howto" style="margin-top:0"><div class="step"><span class="ic" style="background:var(--ok-bg);color:var(--ok)">✓</span><div><b>Keep</b><span>Keep the item in the store and reorder as needed.</span></div></div><div class="step"><span class="ic" style="background:var(--bad-bg);color:var(--bad)">✕</span><div><b>Discontinue</b><span>Sell through what is left, then retire the SKU.</span></div></div><div class="step"><span class="ic" style="background:var(--warn-bg);color:var(--warn)">?</span><div><b>Discuss</b><span>Not sure yet. Leave a note and CIC will follow up.</span></div></div></div>`;
  $('#view').innerHTML=html; bindViewSel(b);
  $('#view').querySelectorAll('.pill[data-rec]').forEach(x=>x.onclick=()=>{current.invRec=x.dataset.rec; renderCurrent(b);});
  const ic=$('#invCat'); if(ic) ic.onchange=()=>{current.invCat=ic.value; renderCurrent(b);};
  const is=$('#invSort'); if(is) is.onchange=()=>{current.invSort=is.value; renderCurrent(b);};
}
const STORELIST={'In Store':'In Store (shoppers can order it)','Inactive':'Inactive (hidden from shoppers)','Incomplete':'Incomplete (listing not finished, not live yet)'};
function renderInvItem(c){
  const b=BRANDS.find(x=>x.id===c.brand); const d=invDecisions[c.id]||{};
  const dr=current.invDraft||(current.invDraft={status:d.status||null, notes:d.notes||'', reviewer:d.reviewer||myName||''});
  const ch=pct(c.sold12,c.soldPrior); const ms=monthsSupply(c);
  $('#view').innerHTML=`
  <a class="back" href="#${c.brand}-current">← Back to current ${esc(b.name)} items</a>
  <div class="detail">
    <div class="gallery"><div class="main"><img src="${c.img}" alt="${esc(c.name)}"><span class="cap">Current store item, as sold today</span>${coreBand(c)}</div></div>
    <div class="info">
      <div class="row" style="margin-bottom:8px">${isIncStock(c)?'<span class="chip inc">Incomplete listing</span>':''}<span class="chip ${c.skuStatus==='Active'?'ok':'bad'}">SKU ${esc(c.skuStatus)}</span><span class="chip">${esc(b.name)}</span><span class="chip">${esc(c.category)}</span>${d.status?`<span class="chip ${INVDEC[d.status].cls}">${INVDEC[d.status].icon} ${INVDEC[d.status].label}</span>`:'<span class="chip pend">Awaiting review</span>'}</div>
      <h1>${esc(c.name)}</h1>
      <ul class="skulist"><li>Store SKU: <b>${esc(c.id)}</b></li><li>Per Piece Price: <b>${c.price?esc(c.price):(c.storePrice!=null?'$'+money(c.storePrice):'Not set in the store yet')}</b></li><li>Store listing: <b>${esc(STORELIST[c.storeStatus]||c.storeStatus||'In Store')}</b></li></ul>
      ${c.overseas?`<div class="ovsbox" role="note" aria-label="Overseas item"><div class="oh"><i>Overseas</i> Overseas production item</div><p style="margin:12px 14px"><b>Reorder production time is several months, depending on the time of year.</b> This item is made overseas and ships by ocean freight to the Floor &amp; Decor Merchandise Warehouse. Factory holidays (such as Lunar New Year) and peak shipping season can add weeks, so place reorders well before stock runs low.</p></div>`:''}<ul class="invlist recdetail"><li class="rec ${c.rec}"><b>CIC Recommendation:</b> <b class="rv">${INVREC[c.rec].label}</b><ul class="why2"><li><b>${esc(c.action)}</b></li>${c.why.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></li></ul>
      <ul class="skulist desclist">${c.desc.split(/(?<=\.)\s+/).filter(Boolean).map(x=>`<li>${esc(x)}</li>`).join('')}<li>Currently available: <b>${c.avail<0?'0 ('+fmtN(-c.avail)+' back-ordered)':fmtN(c.avail)}</b></li><li>Sold last month: <b>about ${fmtN(Math.round(c.sold90/3))}</b> <span class="avgnote">(average of the last 90 days)</span></li></ul>
      <div class="section"><h2>Inventory</h2>
        <ul class="skulist"><li>On hand: <b>${fmtN(c.onHand)}</b></li><li>Booked: <b>${fmtN(c.booked)}</b></li><li>On order: <b>${fmtN(c.onOrder)}</b></li><li>SKU status: <b>${esc(c.skuStatus)}</b>${c.skuStatus==='Discontinued'?' (no longer reordered)':' (sold and reordered)'}</li><li>Reorder point: <b>${fmtN(c.reorderPt)}</b></li>${c.own?`<li>Stock: <b>${c.own==='Consignment'?'Consignment':'CIC-stocked'}</b></li>`:''}<li>Months of stock: <b>${ms===null?'No recent sales':ms>24?(ms/12).toFixed(1)+' years':ms.toFixed(1)+' months'}</b>${ms===null?'':' at the current pace'}</li></ul>
        ${c.sizes&&c.sizes.length>1?`<h2 style="margin-top:14px">Available by size / option</h2><ul class="skulist">${c.sizes.map(([z,q])=>`<li>${esc(z)}: <b style="${q<=0?'color:var(--fnd-red)':''}">${q<0?'0 ('+fmtN(-q)+' back-ordered)':fmtN(q)}</b></li>`).join('')}</ul>`:''}
      </div>
      <div class="section"><h2>Sales</h2>
        <ul class="skulist"><li>Last 12 months: <b>${fmtN(c.sold12)}</b></li><li>Prior 12 months: <b>${fmtN(c.soldPrior)}</b></li><li>Change: <b style="color:${ch!==null&&ch<0?'var(--fnd-red)':'var(--ok)'}">${ch===null?'n/a':(ch>0?'+':'')+ch+'%'}</b></li><li>Last 90 days: <b>${fmtN(c.sold90)}</b></li></ul>
      </div>
      <div class="decide" id="decide">
        <h2>Your decision</h2>
        <div class="choices">
          <button class="choice ok" data-s="keep" aria-pressed="${dr.status==='keep'}">✓ Keep<small>Keep in the store and reorder as needed</small></button>
          <button class="choice bad" data-s="disc" aria-pressed="${dr.status==='disc'}">✕ Discontinue<small>Sell through, then retire the SKU</small></button>
          <button class="choice warn" data-s="discuss" aria-pressed="${dr.status==='discuss'}">? Discuss<small>Not sure yet: leave a note</small></button>
        </div>
        ${dr.status?'<p class="clrhint">Changed your mind? Click your selected choice again to clear it.</p>':''}
        <div class="field"><label for="notes">Notes</label><textarea id="notes" placeholder="Optional comments for CIC">${esc(dr.notes)}</textarea></div>
        <div class="field"><label for="reviewer">Reviewed by</label><input id="reviewer" placeholder="Your name" value="${esc(dr.reviewer)}"></div>
        <div class="save"><button class="btn primary" id="saveBtn">Save decision</button><span class="status" id="saveStatus">${d.status&&d.updatedAt?`${d.local?'Saved on this device':'Last saved'} ${fmtDate(d.updatedAt)}${d.reviewer?' by '+esc(d.reviewer):''}${d.local?' · not yet sent to CIC':''}`:'Not yet reviewed'}</span></div>
        <div id="writeNotice"></div>
      </div>
    </div>
  </div>`;
  const sync=()=>{current.invDraft.notes=$('#notes').value; current.invDraft.reviewer=$('#reviewer').value;};
  $('.choices').addEventListener('click',e=>{const t=e.target.closest('.choice'); if(!t) return; sync();
    if(current.invDraft.status===t.dataset.s){ const saved=invDecisions[c.id]&&invDecisions[c.id].status===t.dataset.s; confirmClear(INVDEC[t.dataset.s].label, !!saved, async()=>{ if(saved){ await clearSaved('invdecisions',invDecisions,c.id); toast('Decision cleared'); } current.invDraft={status:null,notes:saved?'':current.invDraft.notes,reviewer:current.invDraft.reviewer}; renderInvItem(c); }); return; }
    current.invDraft.status=t.dataset.s; renderInvItem(c);});
  $('#saveBtn').addEventListener('click',async()=>{ sync(); const x=current.invDraft; if(!x.status){toast('Pick Keep, Discontinue or Discuss first');return;}
    const btn=$('#saveBtn'); btn.disabled=true; btn.textContent='Saving…'; const prev=invDecisions[c.id]||{}; const hist=Array.isArray(prev.history)?prev.history.slice(-19):[]; if(prev.status) hist.push({status:prev.status,notes:prev.notes||'',reviewer:prev.reviewer||'',at:prev.updatedAt||''});
    const doc={sku:c.id,name:c.name,brand:c.brand,cicRec:c.rec,status:x.status,notes:x.notes.trim(),reviewer:x.reviewer.trim(),updatedAt:new Date().toISOString(),history:hist};
    try{ const where=await writeShared('invdecisions',c.id,doc); invDecisions[c.id]=where==='local'?localDec['invdecisions/'+c.id]:doc; current.invDraft=null; toast(where==='local'?'Saved on this device. Email your decisions to CIC when done.':'Decision saved'); myName=doc.reviewer||myName; renderInvItem(c);}catch(e){console.error(e); btn.disabled=false; btn.textContent='Save decision'; if(e&&e.code==='invalid_argument'){canWrite=false; updateWriteNotice(); toast('This link is view-only');} else toast('Could not save, try again');} });
  updateWriteNotice();
}
function renderBrand(b){
  const all=ITEMS.filter(i=>i.brand===b.id);
  const items=searchQ?all.filter(i=>(i.name+' '+i.sku+' '+i.color+' '+i.category).toLowerCase().includes(searchQ)):all;
  const c={approved:0,changes:0,declined:0,pending:0};
  for(const i of items){const d=decisions[i.id]; if(d&&d.status) c[d.status]++; else c.pending++;}
  let html=`<section class="hero compact"><div class="brandhead"><div><h1>${esc(HERO_TITLE)}</h1><p class="brandline"><span>Brand</span><b>${esc(BRAND_LABEL(b))}</b> · Refresh Inventory Suggestions</p></div>
  <div class="stats"><div class="stat"><b>${all.length}</b><span>Suggested</span></div><div class="stat"><b style="color:var(--ok)">${c.approved}</b><span>Approved</span></div><div class="stat"><b style="color:var(--warn)">${c.changes}</b><span>w/ changes</span></div><div class="stat"><b style="color:var(--bad)">${c.declined}</b><span>Declined</span></div></div></div></section>`;
  html+=`<div class="sechead"><h2>${searchQ?'Search results':'Refresh inventory suggestions'}</h2></div>`;
  // browse toolbar: categories present in this catalog + sort
  const cats=CAT_ORDER.filter(c=>all.some(i=>catOf(i)===c)).concat([...new Set(all.map(catOf))].filter(c=>!CAT_ORDER.includes(c)));
  if(all.length){
    html+=`<div class="browse" role="group" aria-label="Browse"><span class="lbl">Shop by</span><button class="pill" data-cat="all" aria-pressed="${current.cat==='all'}">All<span class="n">${all.length}</span></button>`+(all.some(i=>i.overseas)?`<button class="pill" data-cat="__ovs" aria-pressed="${current.cat==='__ovs'}" style="border-color:var(--fnd-red)">Overseas<span class="n">${all.filter(i=>i.overseas).length}</span></button>`:'')+cats.map(c=>`<button class="pill" data-cat="${esc(c)}" aria-pressed="${current.cat===c}">${esc(c)}<span class="n">${all.filter(i=>catOf(i)===c).length}</span></button>`).join('')+`<select id="sortSel" aria-label="Sort by">${Object.entries(SORTS).map(([k,v])=>`<option value="${k}" ${current.sort===k?'selected':''}>Sort: ${v}</option>`).join('')}</select>${canWrite!==false&&db?(arranging?`<span class="arr"><button class="btn primary" id="arrSave">Save layout</button><button class="btn ghost" id="arrCancel">Cancel</button><button class="btn ghost" id="arrReset" title="Go back to the default grouping">Reset</button></span>`:`<button class="btn ghost" id="arrStart" title="Drag products into the order you want shoppers to see">Arrange</button>`):''}</div>`;
    if(arranging) html+=`<div class="notice arrnote">Arrange mode: drag a product to a new spot (or use the ‹ › buttons on each card), then Save layout. This becomes the Featured order for everyone who opens this catalog.</div>`;
  }
  let shown; if(arranging){ shown=arrangeOrder.map(id=>all.find(i=>i.id===id)).filter(Boolean); } else { const f=items.filter(i=>current.cat==='all'||(current.cat==='__ovs'?!!i.overseas:catOf(i)===current.cat)); shown=current.sort==='featured'?featuredOrder(b.id,f):sortItems(f,current.sort); shown=shown.filter(i=>!i.overseas).concat(shown.filter(i=>i.overseas)); }
  const card=(i,idx)=>{const d=decisions[i.id]; return `<a class="card${arranging?' arr':''}" href="#item-${i.id}" data-id="${i.id}" ${arranging?'draggable="true"':''}>${arranging?`<div class="handle"><button class="mv" data-mv="-1" title="Move earlier">‹</button><span>${idx+1}</span><button class="mv" data-mv="1" title="Move later">›</button></div>`:''}<div class="ph${i.mto?' mto':''}">${i.mto?'<span class="mtoband">1 Piece Made To Order Option</span>':''}<img class="a" src="${i.media[0].src}" alt="${esc(i.name)} mockup" loading="lazy">${(i.media.find(x=>x.t==='web')||{}).src?`<img class="b" src="${i.media.find(x=>x.t==='web').src}" alt="" loading="lazy">`:''}${d&&d.status?`<span class="tag ${STATUS[d.status].cls}">${STATUS[d.status].icon} ${STATUS[d.status].label}</span>`:''}${i.alert?`<span class="tag alert" title="${esc(i.alert.title)}">⚠ ${esc(i.alert.short)}</span>`:''}${i.overseas?`<span class="ovsband"><i>Overseas</i> Custom order · ${esc(i.ovs.total)}</span>`:''}</div><div class="cb"><div class="nm">${esc(i.name)}</div>${WHY[i.id]?`<ul class="why">${WHY[i.id].slice(0,2).map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}${i.quote?`<div class="pr"><b>$${money(i.quote.sell)}</b> each${i.quote.ext?` <span style="font-size:13px;color:var(--muted)">(${i.quote.base})</span>`:''}</div>${i.quote.ext?`<div class="inc">${i.quote.ext.map(e=>e[0]+' $'+money(e[1])).join(' · ')}</div>`:''}${i.overseas?'<div class="inc">Custom made with Floor &amp; Decor branding</div>':'<div class="inc">Decorated as shown · 1 location</div>'}${i.overseas?'':`<div class="moq">Minimum order <b>${i.quote.min}</b> ${i.quote.min===1?'piece':'pieces'}</div>`}${i.mto?'<div class="mtonote">** 7-10 Day Production Time once order is placed on the FND Company Store</div>':''}`:(i.overseas?'<div class="pr"><b>Pricing pending</b></div>':'')}${i.overseas?`<div class="ovsmin">Minimum <b>${i.quote?i.quote.min.toLocaleString():'TBD'}</b> pcs · Sample ${esc(i.ovs.sample)} · Production + delivery ${esc(i.ovs.prod)}</div>`:''}</div></a>`};
  if(!items.length){ html+=`<div class="empty"><b>${searchQ?'No items match "'+esc(searchQ)+'"':'No suggestions yet for '+esc(b.name)}</b>${searchQ?'Try a different name, SKU or color.':'Items will appear here as CIC adds them. Check back soon or pick another catalog above.'}</div>`; }
  else{
    if(!shown.length){ html+=`<div class="empty"><b>Nothing in ${esc(current.cat==='__ovs'?'Overseas':current.cat)} matches</b>Pick another category above.</div>`; }
    else { html+='<div class="grid" id="grid">'+shown.map(card).join('')+'</div>'; }
    html+=`<div class="sechead" style="margin-top:48px"><h2>How to review</h2></div><div class="howto" style="margin-top:0"><div class="step"><span class="ic" style="background:var(--ok-bg);color:var(--ok)">✓</span><div><b>Approve</b><span>Add the item to the store as shown.</span></div></div><div class="step"><span class="ic" style="background:var(--warn-bg);color:var(--warn)">✎</span><div><b>Approve with changes</b><span>Tell CIC what to adjust: logo, placement, color or style.</span></div></div><div class="step"><span class="ic" style="background:var(--bad-bg);color:var(--bad)">✕</span><div><b>Decline</b><span>Not a fit for this program. A quick reason helps the next round.</span></div></div></div>`;
  }
  $('#view').innerHTML=html; bindViewSel(b);
  $('#view').querySelectorAll('.pill').forEach(p=>p.onclick=()=>{current.cat=p.dataset.cat; renderBrand(b);});
  const ss=$('#sortSel'); if(ss) ss.onchange=()=>{current.sort=ss.value; renderBrand(b);};
  const st=$('#arrStart'); if(st) st.onclick=()=>{arranging=true; current.cat='all'; current.sort='featured'; searchQ=''; const si=$('#q'); if(si) si.value=''; arrangeOrder=featuredOrder(b.id,all).map(i=>i.id); renderBrand(b);};
  const ca=$('#arrCancel'); if(ca) ca.onclick=()=>{arranging=false; arrangeOrder=null; renderBrand(b);};
  const rs=$('#arrReset'); if(rs) rs.onclick=()=>{arrangeOrder=featuredOrder(b.id,all.slice()).map(i=>i.id); delete layouts[b.id]; arrangeOrder=featuredOrder(b.id,all).map(i=>i.id); renderBrand(b);};
  const sv=$('#arrSave'); if(sv) sv.onclick=async()=>{ if(!db){toast('Not connected');return;} sv.disabled=true; sv.textContent='Saving…'; try{ await db.doc('layout/'+b.id).set({brand:b.id, order:arrangeOrder.slice(), updatedAt:new Date().toISOString(), by:myName||''}); layouts[b.id]={order:arrangeOrder.slice()}; arranging=false; arrangeOrder=null; toast('Layout saved'); renderBrand(b);}catch(e){ console.error(e); sv.disabled=false; sv.textContent='Save layout'; toast(e&&e.code==='invalid_argument'?'This link is view-only':'Could not save layout'); } };
  if(arranging){
    const g=$('#grid'); if(!g) return;
    const move=(id,delta)=>{const i=arrangeOrder.indexOf(id); const j=i+delta; if(i<0||j<0||j>=arrangeOrder.length) return; arrangeOrder.splice(i,1); arrangeOrder.splice(j,0,id); renderBrand(b);};
    g.addEventListener('click',e=>{ const mv=e.target.closest('.mv'); if(mv){ e.preventDefault(); move(mv.closest('.card').dataset.id,+mv.dataset.mv); return; } if(e.target.closest('.card')) e.preventDefault(); });
    g.querySelectorAll('.card').forEach(c=>{
      c.addEventListener('dragstart',e=>{ dragId=c.dataset.id; c.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; try{e.dataTransfer.setData('text/plain',dragId);}catch(x){} });
      c.addEventListener('dragend',()=>{ c.classList.remove('dragging'); g.querySelectorAll('.over').forEach(x=>x.classList.remove('over')); });
      c.addEventListener('dragover',e=>{ e.preventDefault(); e.dataTransfer.dropEffect='move'; c.classList.add('over'); });
      c.addEventListener('dragleave',()=>c.classList.remove('over'));
      c.addEventListener('drop',e=>{ e.preventDefault(); const to=c.dataset.id; if(!dragId||dragId===to) return; const from=arrangeOrder.indexOf(dragId), ti=arrangeOrder.indexOf(to); arrangeOrder.splice(from,1); arrangeOrder.splice(ti,0,dragId); dragId=null; renderBrand(b); });
    });
  }
}

/* ---------- item detail ---------- */
function renderItem(it){
  const d=decisions[it.id]||{};
  const draft=current.draft||(current.draft={status:d.status||null, priority:d.priority||0, notes:d.notes||'', reviewer:d.reviewer||myName||''});
  const m=it.media[current.mediaIdx]||it.media[0];
  const mainHtml = m.t==='video' ? `<video src="${m.src}" poster="${m.poster||''}" controls autoplay muted loop playsinline></video><span class="cap">Product video with ${esc(BRANDS.find(b=>b.id===it.brand).name)} branding</span>`
    : `<img src="${m.src}" alt="${esc(it.name)} ${esc(m.label)}"><span class="cap">${m.cap?esc(m.cap):m.t==='mockup'?'Virtual mockup':m.t==='proof'?'Virtual proof: logo inside the imprintable area':m.t==='alt'?'Alternate decoration method: heat transfer':m.t==='detail'?(m.cap||'Product detail'):'Website-ready image, 600 x 1000 px, transparent'}</span>`;
  const b=BRANDS.find(x=>x.id===it.brand);
  $('#view').innerHTML=`
  <a class="back" href="#${it.brand}">← Back to ${esc(b.name)} catalog</a>
  <div class="detail">
    <div class="gallery">
      <div class="main ${m.t==='web'?'checker':''}" id="mainMedia">${it.mto?'<span class="mtoband">1 Piece Made To Order Option</span>':''}${mainHtml}</div>
      <div class="thumbs">${it.media.map((x,i)=>`<button class="thumb" data-i="${i}" aria-current="${i===current.mediaIdx}" title="${esc(x.label)}"><img src="${x.poster||x.src}" alt=""><span class="tl">${esc(x.label)}</span></button>`).join('')}</div>
    </div>
    <div class="info">
      <div class="row" style="margin-bottom:8px">${chip(d)}<span class="chip">${esc(b.name)}</span><span class="chip">${esc(it.category)}</span>${it.alert?`<span class="chip alert">⚠ ${esc(it.alert.short)}</span>`:''}</div>
      <h1>${esc(it.name)}</h1>
      <div class="sub">Offered by CIC</div>
      ${it.alert?`<div class="alertbox" role="note"><span class="ic">⚠️</span><div><b>${esc(it.alert.title)}</b><p>${esc(it.alert.text)}</p></div></div>`:''}
      ${it.quote?`<div class="pricebox" aria-label="Price and minimum order"><div class="pline"><div class="big"><sup>$</sup>${money(it.quote.sell)}<small>EACH</small></div><div class="was">Per piece · includes ${it.quote.incl||'decoration as shown'}, 1 location (logo as shown)${it.quote.ext?` · sizes ${it.quote.base}`:''}</div>${it.quote.ext?`<div class="was" style="margin-top:8px;font-size:14px;color:#000"><b>Extended sizes:</b> ${it.quote.ext.map(e=>e[0]+' $'+money(e[1])).join(' &nbsp;·&nbsp; ')} each</div>`:''}</div><button class="stampbtn" id="stampBtn" aria-pressed="${inCart(it.id)}" title="${inCart(it.id)?'In your sample list. Click to remove':'Order a sample of this item'}"><img src="img/order_sample_stamp.png" alt="Order sample here">${inCart(it.id)?`<span class="cap">✓ Sample added</span>`:''}</button></div>`:''}
      ${it.overseas?`<div class="ovsbox" role="note" aria-label="Overseas order requirements"><div class="oh"><i>Overseas</i> Custom overseas production order</div><div class="og"><div><span>Minimum order</span><b>${it.quote?it.quote.min.toLocaleString()+' pcs':'TBD'}</b><small>${it.quote?'per item':'being confirmed'}</small></div><div><span>Sample</span><b>${esc(it.ovs.sample)}</b><small>pre-production sample</small></div><div><span>Production + delivery</span><b>${esc(it.ovs.prod)}</b><small>after sample approval · ${esc(it.ovs.ship)}</small></div><div><span>Plan for</span><b>${esc(it.ovs.total)}</b><small>from order to delivery</small></div></div>${it.quote&&it.quote.tiers?`<table><thead><tr><th>Quantity</th><th>Price each</th></tr></thead><tbody>${it.quote.tiers.map(t=>`<tr><td>${t[0].toLocaleString()}+</td><td><b>$${money(t[1])}</b></td></tr>`).join('')}</tbody></table>`:'<p><b>Pricing pending:</b> CIC is confirming price and minimum for this item.</p>'}<p>Made to order overseas and shipped by ocean freight to the Floor &amp; Decor Merchandise Warehouse. Order early: allow about 13 weeks from order to delivery. Minimums are firm.</p></div>`:''}
      <p style="margin:0">${esc(it.desc)} <b>Color shown: ${esc(it.color)}.</b></p>
      ${it.quote?`<div class="moqcallout"><div class="mrow"><span class="lbl">Minimum order</span><span><b>${it.quote.min}</b> ${it.quote.min===1?'piece':'pieces'} per item, decorated as shown</span></div>${it.overseas?'':it.mto?`<div class="eta"><b>** 7-10 Day Production Time once order is placed on the FND Company Store.</b></div>`:`<div class="eta"><b>From Approval to Order:</b> Est delivery to the Floor &amp; Decor Merchandise Warehouse - 3.5 weeks.</div>`}</div>`:''}
      ${WHY[it.id]?`<div class="section"><h2>Why this item</h2><ul class="feat whylist">${WHY[it.id].map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>`:''}
      <div class="section"><h2>Decoration</h2>
        <div class="fit">✓ Logo fits inside the ${esc(it.deco.area)} imprintable area</div>
        <dl class="kv" style="margin-top:10px"><dt>Method</dt><dd>${esc(it.deco.method)}</dd><dt>Location</dt><dd>${esc(it.deco.location)}</dd><dt>Imprint area</dt><dd>${esc(it.deco.area)}</dd><dt>Logo</dt><dd>${esc(it.deco.logo)}</dd><dt>Logo size</dt><dd>${esc(it.deco.logoSize)}</dd><dt>Colors</dt><dd>${esc(it.deco.colors)}</dd><dt>Art file</dt><dd>${esc(it.deco.file)}</dd></dl>
        ${it.deco.note?`<p style="font-size:13px;color:var(--muted);margin:10px 0 0">${esc(it.deco.note)}</p>`:''}
      </div>
      <div class="section"><h2>Product details</h2>
        <dl class="kv"><dt>Size</dt><dd>${esc(it.dims)}</dd><dt>Material</dt><dd>${esc(it.material)}</dd><dt>Packaging</dt><dd>${esc(it.packaging)}</dd></dl>
        <ul class="feat" style="margin-top:10px">${it.features.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>
      </div>
      <div class="decide" id="decide">
        <h2>Your decision</h2>
        <div class="choices">
          <button class="choice ok" data-s="approved" aria-pressed="${draft.status==='approved'}">✓ Approve<small>Add to the store as shown</small></button>
          <button class="choice warn" data-s="changes" aria-pressed="${draft.status==='changes'}">✎ Approve with changes<small>Tell us what to adjust</small></button>
          <button class="choice bad" data-s="declined" aria-pressed="${draft.status==='declined'}">✕ Decline<small>Not for this program</small></button>
        </div>
        ${draft.status?'<p class="clrhint">Changed your mind? Click your selected choice again to clear it.</p>':''}
        <div class="field"><label for="notes">Notes${draft.status==='changes'?' · what should change?':''}</label><textarea id="notes" placeholder="${draft.status==='changes'?'e.g. use the horizontal logo, move to right chest, show it in navy…':draft.status==='declined'?'Optional: why it does not fit':'Optional comments for CIC'}">${esc(draft.notes)}</textarea></div>
        <div class="field"><label for="reviewer">Reviewed by</label><input id="reviewer" placeholder="Your name" value="${esc(draft.reviewer)}"></div>
        <div class="save"><button class="btn primary" id="saveBtn">Save decision</button><span class="status" id="saveStatus">${d.status&&d.updatedAt?`${d.local?'Saved on this device':'Last saved'} ${fmtDate(d.updatedAt)}${d.reviewer?' by '+esc(d.reviewer):''}${d.local?' · not yet sent to CIC':''}`:'Not yet reviewed'}</span></div>
        <div id="writeNotice"></div>
        <div class="samplerow"><button class="btn sample" id="sampleBtn" aria-pressed="${inCart(it.id)}">${inCart(it.id)?'✓ Sample added'+(SIZES(it)&&cart[it.id].size?' · size '+esc(cart[it.id].size):''):'Request a sample'}</button><span class="hint">${inCart(it.id)?`In your sample list · <a href="#samples">review &amp; send (${Object.keys(cart).length})</a>`:'Adds this item to your sample list; enter one ship-to address when you send the list. Samples arrive blank or with a random stock decoration, not the Floor &amp; Decor logo.'}</span></div>
      </div>
    </div>
  </div>`;
  $('.thumbs').addEventListener('click',e=>{const t=e.target.closest('.thumb'); if(!t) return; current.mediaIdx=+t.dataset.i; syncDraft(); renderItem(it);});
  $('.choices').addEventListener('click',e=>{const t=e.target.closest('.choice'); if(!t) return; syncDraft();
    if(current.draft.status===t.dataset.s){ const saved=decisions[it.id]&&decisions[it.id].status===t.dataset.s; confirmClear(STATUS[t.dataset.s].label, !!saved, async()=>{ if(saved){ await clearSaved('decisions',decisions,it.id); renderProgress(); toast('Decision cleared'); } current.draft={status:null,priority:0,notes:saved?'':current.draft.notes,reviewer:current.draft.reviewer}; renderItem(it); }); return; }
    current.draft.status=t.dataset.s; renderItem(it); $('#notes').focus();});
  $('#saveBtn').addEventListener('click',()=>saveDecision(it));
  const onSample=()=>{ syncDraft(); if(!inCart(it.id)&&SIZES(it)){ openSizePicker(it); return; } toggleCart(it,''); toast(inCart(it.id)?'Added to your sample list':'Removed from your sample list'); renderItem(it); };
  $('#sampleBtn').addEventListener('click',onSample);
  const sb=$('#stampBtn'); if(sb) sb.addEventListener('click',onSample);
  updateWriteNotice();
}
function syncDraft(){ const n=$('#notes'), r=$('#reviewer'); if(current.draft&&n){current.draft.notes=n.value; current.draft.reviewer=r.value;} }
function updateWriteNotice(){
  const el=$('#writeNotice'); if(!el) return;
  if(!dbReady){ el.innerHTML='<div class="notice">Connecting to the decision log… you can fill this in now and save in a moment.</div>'; }
  else if(db===null||canWrite===false||Object.keys(localDec).length){ el.innerHTML=localBox(); bindLocalBox(); }
  else el.innerHTML='';
}
function confirmClear(label,hasSaved,onYes){
  const old=$('#clearModal'); if(old) old.remove();
  const m=document.createElement('div'); m.id='clearModal'; m.className='modal';
  m.innerHTML=`<div class="modalbox" role="dialog" aria-modal="true" aria-labelledby="clrTitle"><button class="close" aria-label="Close">×</button><h2 id="clrTitle">Clear your decision?</h2><p>${hasSaved?`This removes the saved <b>${esc(label)}</b> decision and puts the item back to Awaiting review. Your notes are kept in the decision history.`:`This unselects <b>${esc(label)}</b>.`}</p><div class="save" style="margin-top:18px"><button class="btn primary" id="clrYes">Yes, clear it</button><button class="btn ghost" id="clrNo">Keep my decision</button></div></div>`;
  document.body.appendChild(m);
  const close=()=>{m.remove(); document.removeEventListener('keydown',onKey);};
  const onKey=e=>{ if(e.key==='Escape') close(); };
  document.addEventListener('keydown',onKey);
  m.addEventListener('click',e=>{ if(e.target===m||e.target.closest('.close')||e.target.closest('#clrNo')) close(); });
  $('#clrYes').onclick=async()=>{ const b=$('#clrYes'); b.disabled=true; b.textContent='Clearing…'; try{ await onYes(); close(); }catch(err){ console.error(err); b.disabled=false; b.textContent='Yes, clear it'; toast(err&&err.code==='invalid_argument'?'This link is view-only':'Could not clear, try again'); } };
  $('#clrNo').focus();
}
async function clearSaved(coll,map,id){
  const prev=map[id]; if(!prev||!prev.status) return false;
  if(prev.local){ dropLocal(coll,id); delete map[id]; return true; }
  if(!db) throw Object.assign(new Error('offline'),{code:'offline'});
  const hist=Array.isArray(prev.history)?prev.history.slice(-19):[];
  hist.push({status:prev.status,priority:prev.priority||0,notes:prev.notes||'',reviewer:prev.reviewer||'',at:prev.updatedAt||''});
  const doc={...prev,status:null,notes:'',reviewer:'',updatedAt:null,clearedAt:new Date().toISOString(),clearedBy:myName||'',history:hist};
  await db.doc(coll+'/'+id).set(doc); map[id]=doc; return true;
}
async function saveDecision(it){
  syncDraft(); const dr=current.draft;
  if(!dr.status){ toast('Pick Approve, Approve with changes, or Decline first'); return; }
  if(dr.status==='changes' && !dr.notes.trim()){ toast('Tell us what should change in the notes'); $('#notes').focus(); return; }
  const btn=$('#saveBtn'); btn.disabled=true; btn.textContent='Saving…';
  const prev=decisions[it.id]||{}; const now=new Date().toISOString();
  const hist=Array.isArray(prev.history)?prev.history.slice(-19):[];
  if(prev.status) hist.push({status:prev.status,priority:prev.priority||0,notes:prev.notes||'',reviewer:prev.reviewer||'',at:prev.updatedAt||''});
  const doc={itemId:it.id, sku:it.sku, name:it.name, brand:it.brand, status:dr.status, priority:dr.priority||0, notes:dr.notes.trim(), reviewer:dr.reviewer.trim(), updatedAt:now, history:hist};
  try{ const where=await writeShared('decisions',it.id,doc); decisions[it.id]=where==='local'?localDec['decisions/'+it.id]:doc; toast(where==='local'?'Saved on this device. Email your decisions to CIC when done.':'Decision saved'); try{localStorage.setItem('fnd-reviewer',doc.reviewer)}catch(e){} myName=doc.reviewer||myName; renderProgress(); current.draft=null; renderItem(it); }
  catch(e){ console.error(e); btn.disabled=false; btn.textContent='Save decision'; if(e&&e.code==='invalid_argument'){canWrite=false; updateWriteNotice(); toast('This link is view-only');} else toast('Could not save, try again'); }
}


/* ---------- sample requests ---------- */
function openSizePicker(it){
  const old=$('#sizeModal'); if(old) old.remove();
  const sizes=SIZES(it)||[];
  const m=document.createElement('div'); m.id='sizeModal'; m.className='modal'; m.innerHTML=`<div class="modalbox" role="dialog" aria-modal="true" aria-labelledby="szTitle"><button class="close" aria-label="Close">×</button><h2 id="szTitle">What size should we send?</h2><p>${esc(it.name)} · ${esc(it.color)}</p><div class="sizes">${sizes.map(z=>`<button class="szbtn" data-z="${z}">${z}</button>`).join('')}</div><p class="fine">One sample in your size. Samples ship undecorated or with a random stock decoration, not the Floor &amp; Decor logo.</p></div>`;
  document.body.appendChild(m);
  const close=()=>m.remove();
  m.addEventListener('click',e=>{ if(e.target===m||e.target.closest('.close')) close(); const b=e.target.closest('.szbtn'); if(!b) return; toggleCart(it,b.dataset.z); close(); toast('Added to your sample list · size '+b.dataset.z); renderItem(it); });
  document.addEventListener('keydown',function esc_(e){ if(e.key==='Escape'){ close(); document.removeEventListener('keydown',esc_); } });
  const first=m.querySelector('.szbtn'); if(first) first.focus();
}

const SHIP_FIELDS=[['name','Your name',1],['company','Company / store',1],['email','Email',1],['phone','Phone',0],['street','Street address',1],['street2','Suite / floor',0],['city','City',1],['state','State',1],['zip','ZIP',1],['notes','Notes for CIC (sizes, colors, deadline…)',0]];
function renderSamples(){
  const ids=Object.keys(cart).filter(id=>ITEMS.some(i=>i.id===id));
  const items=ids.map(id=>ITEMS.find(i=>i.id===id));
  const sent=window._lastSampleRequest;
  if(sent){ window._lastSampleRequest=null; $('#view').innerHTML=confirmationHtml(sent); window.scrollTo({top:0}); return; }
  let html=`<section class="hero"><div class="brandhead"><div><span class="eyebrow">Samples</span><h1>Your sample cart</h1><p>Pick "Request a sample" on any product, then enter your ship-to address once and send the whole list to CIC. Samples ship undecorated or with a random stock decoration that shows imprint capability.</p></div></div></section>`;
  if(!items.length){ html+=`<div class="empty" style="margin-top:24px"><b>Your sample list is empty</b>Open any product and click "Request a sample". Items you pick collect here until you send them.</div>`; }
  else{
    html+=`<div class="cart"><div><div class="sechead" style="text-align:left;margin:0 0 14px"><h2 style="font-size:18px">Your list (${items.length})</h2></div><div class="cartlist">`+items.map(it=>{const sz=SIZES(it); return `<div class="cartitem" data-id="${it.id}"><img src="${it.media[0].src}" alt=""><div class="ci"><b>${esc(it.name)}</b><span>${esc(it.color)}${it.quote?` · $${money(it.quote.sell)} each at ${it.quote.min}`:''}</span></div>${sz?`<select class="sz" aria-label="Size"><option value="" ${!cart[it.id].size?'selected':''}>Size…</option>${sz.map(z=>`<option ${cart[it.id].size===z?'selected':''}>${z}</option>`).join('')}</select>`:''}<button class="rm" title="Remove">×</button></div>`}).join('')+`</div><p style="font-size:13px;color:var(--muted);margin-top:12px"><b>Please note:</b> samples ship either undecorated or as a stock sample with a random (non-Floor &amp; Decor) decoration to show imprint capability. They are not decorated with the Floor &amp; Decor logo. CIC confirms availability and ship dates by email.</p></div>
    <form class="shipform" id="shipForm" autocomplete="on"><h2>Ship samples to</h2><div class="grid2">`+SHIP_FIELDS.map(([k,l,req])=>`<div class="field${['street','notes','company','email'].includes(k)?' span2':''}" ${['street','notes'].includes(k)?'style="grid-column:1/-1"':''}><label for="s_${k}">${l}${req?' *':''}</label>${k==='notes'?`<textarea id="s_${k}">${esc(shipto[k]||'')}</textarea>`:`<input id="s_${k}" ${req?'required':''} value="${esc(shipto[k]||(k==='name'?myName:''))}" ${k==='email'?'type="email"':k==='phone'?'type="tel"':''}>`}</div>`).join('')+`</div>
    <label class="remember"><input type="checkbox" id="s_remember" ${shipto.name?'checked':''}> Remember this address on this device for next time</label>
    <div class="save"><button class="btn primary" type="submit" id="sendSamples">Send sample request</button><span class="status" id="sampleStatus">${dbReady?'':'Connecting…'}</span></div>
    <div id="sampleNotice"></div></form></div>`;
  }
  $('#view').innerHTML=html;
  $('#view').querySelectorAll('.cartitem').forEach(c=>{ const id=c.dataset.id; const sel=c.querySelector('.sz'); if(sel) sel.onchange=()=>{cart[id].size=sel.value; saveCart();}; c.querySelector('.rm').onclick=()=>{delete cart[id]; saveCart(); renderSamples();}; });
  const f=$('#shipForm'); if(f) f.addEventListener('submit',sendSampleRequest);
}
async function sendSampleRequest(e){
  e.preventDefault();
  const ship={}; for(const [k] of SHIP_FIELDS){ const el=$('#s_'+k); ship[k]=el?el.value.trim():''; }
  const miss=SHIP_FIELDS.filter(([k,l,req])=>req&&!ship[k]); if(miss.length){ toast('Please fill in '+miss[0][1].toLowerCase()); $('#s_'+miss[0][0]).focus(); return; }
  if($('#s_remember').checked){ shipto=ship; try{localStorage.setItem('fnd-shipto',JSON.stringify(ship))}catch(x){} } else { shipto={}; try{localStorage.removeItem('fnd-shipto')}catch(x){} }
  const items=Object.keys(cart).map(id=>ITEMS.find(i=>i.id===id)).filter(Boolean).map(it=>({itemId:it.id, sku:it.sku, name:it.name, color:it.color, size:cart[it.id].size||'', brand:BRANDS.find(b=>b.id===it.brand).name}));
  if(!items.length){ toast('Your sample list is empty'); return; }
  const nosize=items.filter(x=>{const it=ITEMS.find(i=>i.id===x.itemId); return SIZES(it)&&!x.size;}); if(nosize.length){ toast('Pick a size for '+nosize[0].name); return; }
  const btn=$('#sendSamples'); btn.disabled=true; btn.textContent='Sending…';
  const now=new Date(); const id='SR-'+now.toISOString().slice(0,10).replace(/-/g,'')+'-'+Math.random().toString(36).slice(2,6).toUpperCase();
  const doc={id, createdAt:now.toISOString(), status:'new', requester:ship.name, ship, items};
  try{
    if(!db) throw Object.assign(new Error('offline'),{code:'offline'});
    await db.doc('samplerequests/'+id).set(doc); sampleRequests[id]=doc;
    cart={}; saveCart(); myName=myName||ship.name;
    myOrders.unshift(id); try{localStorage.setItem('fnd-myorders',JSON.stringify(myOrders.slice(0,50)))}catch(x){}
    window._lastSampleRequest=doc; renderSamples();
  }catch(err){ console.error(err); btn.disabled=false; btn.textContent='Send sample request';
    const n=$('#sampleNotice'); n.innerHTML=`<div class="notice">${err&&err.code==='invalid_argument'?'This link is view-only, so the request can’t be saved here. Ask CIC for an invite with Contributor access, or email the list below to your CIC contact.':'Could not send right now. Copy the list below and email it to your CIC contact.'}<br><br><textarea style="width:100%;min-height:120px" readonly>${esc('Sample request\n'+items.map(x=>'- '+x.name+' ('+x.color+(x.size?', '+x.size:'')+')').join('\n')+'\n\nShip to:\n'+[ship.name,ship.company,ship.street,ship.street2,[ship.city,ship.state,ship.zip].join(' '),ship.phone,ship.email,ship.notes].filter(Boolean).join('\n'))}</textarea></div>`; }
}

/* ---------- order confirmation + history (retail style) ---------- */
function orderLines(r){ return (r.items||[]).map(x=>{const it=ITEMS.find(i=>i.id===x.itemId); return `<div class="oline"><img src="${it?it.media[0].src:''}" alt=""><div class="oi"><b>${esc(x.name)}</b><span>${esc(x.color)}${x.size?' · Size '+esc(x.size):''}</span></div><div class="oq">Qty 1</div></div>`}).join(''); }
function addrBlock(sh){ return esc([sh.name, sh.company, sh.street, sh.street2, [sh.city, sh.state, sh.zip].filter(Boolean).join(' ')].filter(Boolean).join('\n')); }
function confirmationHtml(r){
  const st=ostat(r.status);
  return `<div class="order"><div class="ohead"><span class="ok-ic">✓</span><h1>Thanks, ${esc((r.ship.name||'').split(' ')[0]||'there')} — your sample request is in</h1><p>We've received your request and CIC is lining up your samples. You'll get a confirmation email${r.ship.email?' at <b>'+esc(r.ship.email)+'</b>':''} with ship dates and tracking.</p></div>
  <div class="ogrid"><div class="ocard"><h2>Request details</h2><dl class="kv"><dt>Request #</dt><dd><b>${esc(r.id)}</b></dd><dt>Placed</dt><dd>${fmtDate(r.createdAt)}</dd><dt>Status</dt><dd><span class="chip ${st.cls}">${st.label}</span></dd><dt>Items</dt><dd>${(r.items||[]).length}</dd></dl></div>
  <div class="ocard"><h2>Shipping to</h2><div class="addr">${addrBlock(r.ship)}</div>${r.ship.phone?`<div class="addr" style="margin-top:6px">${esc(r.ship.phone)}</div>`:''}</div></div>
  <div class="ocard"><h2>Your samples</h2>${orderLines(r)}${r.ship.notes?`<p class="onote"><b>Notes:</b> ${esc(r.ship.notes)}</p>`:''}<p class="onote">Samples ship undecorated or with a random stock decoration to show imprint capability — not the Floor &amp; Decor logo.</p></div>
  <div class="steps"><div class="step on"><span>1</span><b>Received</b><small>Your request is logged</small></div><div class="step"><span>2</span><b>Processing</b><small>CIC places it with the supplier</small></div><div class="step"><span>3</span><b>Shipped</b><small>Tracking emailed to you</small></div></div>
  <div class="row" style="margin-top:22px;gap:12px"><a class="btn primary" href="#fnd" style="text-decoration:none">Continue browsing</a><a class="btn ghost" href="#history" style="text-decoration:none">View order history</a></div></div>`;
}
function renderHistory(){
  const mine=Object.values(sampleRequests).filter(r=>myOrders.includes(r.id)||(shipto.email&&r.ship&&r.ship.email&&r.ship.email.toLowerCase()===shipto.email.toLowerCase())).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  let html=`<section class="hero"><div class="brandhead"><div><span class="eyebrow">Samples</span><h1>Order history</h1><p>Sample requests placed from this device${shipto.email?' or under '+esc(shipto.email):''}. Status updates as CIC processes and ships them.</p></div></div></section>`;
  if(!dbReady) html+=`<div class="notice">Loading your requests…</div>`;
  else if(!mine.length) html+=`<div class="empty"><b>No sample requests yet</b>Add samples from any product page and send them from your <a href="#samples">sample cart</a>.</div>`;
  else html+=mine.map(r=>{const st=ostat(r.status); return `<div class="ocard ohist"><div class="ohrow"><div><b class="oid">Request ${esc(r.id)}</b><span class="meta">Placed ${fmtDate(r.createdAt)} · ${(r.items||[]).length} item${(r.items||[]).length===1?'':'s'}</span></div><span class="chip ${st.cls}">${st.label}</span></div><div class="steps mini"><div class="step ${st.step>=1?'on':''}"><span>1</span><b>Received</b></div><div class="step ${st.step>=2?'on':''}"><span>2</span><b>Processing</b></div><div class="step ${st.step>=3?'on':''}"><span>3</span><b>Shipped</b></div></div>${orderLines(r)}<div class="addr" style="margin-top:12px"><b>Ship to</b>\n${addrBlock(r.ship)}</div></div>`}).join('');
  $('#view').innerHTML=html;
}

/* ---------- summary ---------- */
function renderSummary(){
  const mode=window._sumMode||'refresh';
  const f=(window._sumFilters||{})[mode]||{brand:'all',status:'all'};
  const setF=x=>{window._sumFilters={...(window._sumFilters||{}),[mode]:{...f,...x}}; renderSummary();};
  const isCur=mode==='current';
  const src=isCur?CURRENT:ITEMS, dmap=isCur?invDecisions:decisions, SMAP=isCur?INVDEC:STATUS;
  const byRev=!!window._sumByRev;
  let rows=src.filter(i=>(f.brand==='all'||i.brand===f.brand)).map(i=>({i,d:dmap[i.id]||{}})).filter(r=>f.status==='all'||(f.status==='pending'?!r.d.status:r.d.status===f.status));
  if(byRev){ const rv=r=>r.d.status?(r.d.reviewer||'').trim().toLowerCase():''; rows=rows.slice().sort((a,b)=>{const x=rv(a),y=rv(b); if(!x&&y) return 1; if(x&&!y) return -1; return x.localeCompare(y)||String(b.d.updatedAt||'').localeCompare(String(a.d.updatedAt||''));}); }
  const dchip=d=>{ if(!d||!d.status) return '<span class="chip pend">Awaiting review</span>'; const s=SMAP[d.status]; return s?`<span class="chip ${s.cls}">${s.icon} ${s.label}</span>`:esc(d.status); };
  const reviewed=src.filter(i=>dmap[i.id]&&dmap[i.id].status).length;
  const statusOpts=isCur?[['keep','Keep'],['disc','Discontinue'],['discuss','Discuss']]:[['approved','Approved'],['changes','Approved w/ changes'],['declined','Declined']];
  const brandName=i=>(BRANDS.find(b=>b.id===i.brand)||{name:i.brand}).name;
  $('#view').innerHTML=`<section class="hero compact"><div class="brandhead"><div><h1>Decision summary</h1><p class="brandline">${isCur?'Keep / discontinue decisions on items in the store today':'Approve / decline decisions on new merchandise suggestions'} · ${reviewed} of ${src.length} reviewed</p></div></div></section>
  <div class="browse" role="group" aria-label="Choose summary"><span class="lbl">Summary</span><button class="pill" data-mode="current" aria-pressed="${isCur}">Current Inventory Decisions</button><button class="pill" data-mode="refresh" aria-pressed="${!isCur}">Refresh Merch Decisions</button><button class="pill redbtn" id="sortByRev" aria-pressed="${byRev}" title="Group the table by who made each decision">${byRev?'✓ ':''}Sort by decision maker</button></div>
  <div class="toolbar"><select id="fBrand"><option value="all">All brands</option>${BRANDS.map(b=>`<option value="${b.id}" ${f.brand===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select>
  <select id="fStatus"><option value="all">All statuses</option><option value="pending" ${f.status==='pending'?'selected':''}>Awaiting review</option>${statusOpts.map(([v,l])=>`<option value="${v}" ${f.status===v?'selected':''}>${l}</option>`).join('')}</select>
  <button class="btn ghost" id="copyCsv">Copy CSV</button><button class="btn ghost" id="dlCsv" hidden>Download CSV</button><span class="status">${rows.length} item${rows.length===1?'':'s'}</span></div>
  <div class="tablewrap"><table><thead><tr><th>Brand</th><th>Item</th>${isCur?'<th>Store SKU</th><th>CIC recommendation</th>':'<th>Color</th>'}<th>Decision</th><th>Notes</th><th>Reviewed by</th><th>Updated</th></tr></thead><tbody>
  ${rows.map(({i,d})=>`<tr><td>${esc(brandName(i))}</td><td><a href="#${isCur?'inv-':'item-'}${i.id}">${esc(i.name)}</a></td>${isCur?`<td>${esc(i.id)}</td><td><span class="chip ${i.rec==='keep'?'ok':'bad'}">${INVREC[i.rec]?INVREC[i.rec].label:esc(i.rec)}</span></td>`:`<td>${esc(i.color)}</td>`}<td>${dchip(d)}</td><td style="max-width:320px">${esc(d.notes||'')}</td><td>${d.status?esc(d.reviewer||''):''}</td><td class="num">${d.status?fmtDate(d.updatedAt):''}</td></tr>`).join('')||`<tr><td colspan="${isCur?8:7}" style="text-align:center;color:var(--muted)">No items match this filter.</td></tr>`}
  </tbody></table></div>
  ${Object.keys(sampleRequests).length?`<div class="sechead" style="margin-top:48px"><h2>Sample requests</h2></div><div class="tablewrap"><table><thead><tr><th>Request</th><th>Requested by</th><th>Items</th><th>Ship to</th><th>Status</th><th>Sent</th></tr></thead><tbody>${Object.values(sampleRequests).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).map(r=>`<tr><td>${esc(r.id)}</td><td>${esc(r.ship.name)}<br><span style="color:var(--muted);font-size:12px">${esc(r.ship.email||'')}</span></td><td>${(r.items||[]).map(x=>esc(x.name)+(x.size?' ('+esc(x.size)+')':'')).join('<br>')}</td><td style="font-size:13px">${esc([r.ship.company,r.ship.street,r.ship.street2,[r.ship.city,r.ship.state,r.ship.zip].filter(Boolean).join(' '),r.ship.phone].filter(Boolean).join(', '))}</td><td><span class="chip ${ostat(r.status).cls}">${ostat(r.status).label}</span></td><td class="num">${fmtDate(r.createdAt)}</td></tr>`).join('')}</tbody></table></div>`:''}`;
  $('#view').querySelectorAll('.pill[data-mode]').forEach(p=>p.onclick=()=>{window._sumMode=p.dataset.mode; renderSummary();});
  $('#sortByRev').onclick=()=>{window._sumByRev=!window._sumByRev; renderSummary();};
  $('#fBrand').onchange=e=>setF({brand:e.target.value});
  $('#fStatus').onchange=e=>setF({status:e.target.value});
  const csv=()=>{const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const lab=d=>d.status?(SMAP[d.status]?SMAP[d.status].label:d.status):'Awaiting review';
    if(isCur){const h=['Brand','Item','Store SKU','CIC recommendation','Decision','Notes','Reviewed by','Updated'];
      return [h.join(','),...rows.map(({i,d})=>[brandName(i),i.name,i.id,INVREC[i.rec]?INVREC[i.rec].label:i.rec,lab(d),d.status?(d.notes||''):'',d.status?(d.reviewer||''):'',d.status?(d.updatedAt||''):''].map(q).join(','))].join('\r\n');}
    const h=['Brand','Item','SKU','Color','Decision','Notes','Reviewed by','Updated'];
    return [h.join(','),...rows.map(({i,d})=>[brandName(i),i.name,i.sku,i.color,lab(d),d.status?(d.notes||''):'',d.status?(d.reviewer||''):'',d.status?(d.updatedAt||''):''].map(q).join(','))].join('\r\n')};
  $('#copyCsv').onclick=async()=>{const t=csv(); try{await navigator.clipboard.writeText(t); toast('CSV copied')}catch(e){const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();toast('Select and copy the text');setTimeout(()=>ta.remove(),8000)}};
  if(downloadsApi){const b=$('#dlCsv'); b.hidden=false; b.onclick=async()=>{try{await downloadsApi.save({filename:isCur?'FND_Current_Inventory_Decisions.csv':'FND_Merch_Decisions.csv',data:csv()}); toast('CSV ready')}catch(e){if(e&&e.code!=='cancelled')toast('Download not available')}}}
}

/* ---------- boot ---------- */
try{ myName=localStorage.getItem('fnd-reviewer')||''; }catch(e){}
let searchQ='';
$('#q').addEventListener('input',e=>{searchQ=e.target.value.trim().toLowerCase(); if(location.hash==='#summary'||location.hash.startsWith('#item-')||location.hash.startsWith('#inv-')) return; const b=BRANDS.find(x=>x.id===current.brand)||BRANDS[0]; if(location.hash.endsWith('-current')) renderCurrent(b); else renderBrand(b);});
overlayLocal(); route(); saveCart();
(async()=>{
  try{
    const [d,u,dl]=await Promise.all([claude.use('db'),claude.use('user'),claude.use('downloads')]);
    db=d; userApi=u; downloadsApi=dl; dbReady=true; overlayLocal();
    if(u){ try{ const w=await u.can('data.write'); canWrite=(w===null?null:!!w); if(!myName){const me=await u.me(); if(me&&me.name) myName=me.name;} }catch(e){} }
    if(db){
      unsub=db.collection('decisions').onSnapshot(snap=>{
        for(const ch of snap.docChanges()){ if(ch.type==='removed') delete decisions[ch.doc.id]; else decisions[ch.doc.id]=ch.doc.data(); } overlayLocal();
        renderProgress();
        if(current.item){ const it=ITEMS.find(i=>i.id===current.item); if(it && !current.draft) renderItem(it); else if(it){ /* keep draft; refresh status line only */ const d=decisions[it.id]; const s=$('#saveStatus'); if(s&&d&&d.status&&d.updatedAt) s.textContent=`Last saved ${fmtDate(d.updatedAt)}${d.reviewer?' by '+d.reviewer:''}`; } }
        else route();
      }, err=>{ console.error('decisions subscription', err); });
      db.collection('invdecisions').onSnapshot(snap=>{ for(const ch of snap.docChanges()){ if(ch.type==='removed') delete invDecisions[ch.doc.id]; else invDecisions[ch.doc.id]=ch.doc.data(); } overlayLocal(); const h=location.hash; if(h.endsWith('-current')) route(); else if(h.startsWith('#inv-')&&!current.invDraft) route(); else if(h==='#summary') renderSummary(); }, err=>console.error('invdecisions subscription',err));
      db.collection('samplerequests').onSnapshot(snap=>{ for(const ch of snap.docChanges()){ if(ch.type==='removed') delete sampleRequests[ch.doc.id]; else sampleRequests[ch.doc.id]=ch.doc.data(); } if(location.hash==='#samples') renderSamples(); else if(location.hash==='#history') renderHistory(); else if(location.hash==='#summary') renderSummary(); }, err=>console.error('samplerequests subscription',err));
      db.collection('layout').onSnapshot(snap=>{ for(const ch of snap.docChanges()){ if(ch.type==='removed') delete layouts[ch.doc.id]; else layouts[ch.doc.id]=ch.doc.data(); } if(current.brand&&!current.item&&!arranging) route(); }, err=>console.error('layout subscription',err));
    }
    if(current.item){ updateWriteNotice(); const r=$('#reviewer'); if(r&&!r.value&&myName) r.value=myName; }
    syncLocal();
    if(location.hash==='#summary') renderSummary();
    if(location.hash==='#samples') renderSamples();
    if(location.hash==='#history') renderHistory();
  }catch(e){ console.error(e); dbReady=true; updateWriteNotice(); }
})();
