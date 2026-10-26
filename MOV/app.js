/* ---------- programs: mirror the Movement Gear Store menus ---------- */
const BRANDS=[
  {id:'mm', name:'Movement Mortgage', short:'Movement', blurb:'Core Movement Gear Store catalog: apparel, headwear and accessories for loan officers, branches and corporate teams.'},
  {id:'events', name:'Event Materials', short:'Event Materials', blurb:'Banners, table throws and giveaway items for open houses, realtor lunches and community events.'},
  {id:'school', name:'Movement School', short:'Movement School', blurb:'Affiliate catalog for Movement School teams and families.'},
  {id:'gifting', name:'Gifting', short:'Gifting', blurb:'Closing and partner gifts.'},
  {id:'builder', name:'Builder', short:'Builder', blurb:'Co-branded gifts for builder partners and new-construction closings.'},
  {id:'military', name:'Military', short:'Military', blurb:'Thank-you gifts for veteran and active-duty homebuyers.'},
  {id:'sale', name:'Last Chance', short:'Last Chance', blurb:'Every item CIC recommends putting on sale, across all programs, with a suggested discount.'}
];

/* ---------- current store items ----------
   Snapshot from Titan report 123 (Inventory with Booked Qtys) + report 109 (Catalog Sales Booked by Product), store MOV.
   The daily refresh writes fresh numbers to the db collection "inventory" (doc per root product); the page overlays them and re-scores. */
let INV_ASOF=__D.INV_ASOF||'Loading…';
const CURRENT=__D.CURRENT||[];  /* no inventory/pricing data in this repo — loaded from Supabase after sign-in */

/* ---------- refresh suggestions (approve / decline) ----------
   Shape: {id, brand, sku, name, color, category, quote:{min, sell, incl}, desc, features:[], deco:{method, location, logo},
           media:[{label, src} | {label, src, video:true, poster}]} */
const ITEMS=[];

/* ---------- store order rule (applies to every page, current and suggested):
   tees first (men's / unisex / ladies / youth of the same print side by side), polos, sweatshirts, outerwear, other apparel,
   then headwear, bags, drinkware, desk, event, gifting and giveaway hardgoods ---------- */
const MERCH_RULES=[
  [/sticker|decal/,92],[/sunglass/,121],[/pet bowl/,124],
  [/\btees?\b|t-shirt|tshirt/,10],[/polo/,20],
  [/hoodie|crewneck|crew neck|pullover|1\/4 zip|quarter zip|full zip|sweatshirt|mock neck|jogger|sweatpant/,30],
  [/jacket|windbreaker|\bvest\b/,40],[/jersey|bandana|\bsocks?\b|uniform/,50],
  [/\bhats?\b|\bcaps?\b|beanie|visor|snapback/,60],
  [/backpack|back pack|duffel|luggage|\btote|\bbags?\b/,70],
  [/\bmugs?\b/,80],[/tumbler|travel mug/,81],[/bottle(?! opener)/,82],[/\bcups?\b|glass/,83],[/can cooler|koozie|insulator/,84],[/opener|barware/,85],
  [/journal|notebook|notepad|note pad/,90],[/\bpens?\b/,91],[/button|lapel|\bpins?\b/,93],[/badge/,94],[/mouse ?pad/,95],
  [/banner|\bflags?\b|throw|blanket|table|sidewalk sign|a frame/,100],[/golf (balls?|towel|divot)/,115],[/keychain|key chain/,122],
  [/board game|cornhole|moveopoly/,110]
];
const MERCH_TYPE={'T-Shirts':10,'Golf/Casual':20,'Sweat Pant/Shirt':30,'Outerwear':40,'Youth':45,'Misc Apparel':50,'Caps/Visor':60};
const MERCH_CAT={Apparel:55,Headwear:65,Bags:75,Drinkware:86,Desk:96,Events:105,Gifting:112,'Fun & Giveaways':120};
function merchRank(x){ const n=(x.name||'').toLowerCase(), t=(x.type||'').toLowerCase();
  for(const [re,r] of MERCH_RULES){ if(re.test(n)) return r; }
  if(MERCH_TYPE[x.type]!=null) return MERCH_TYPE[x.type];
  for(const [re,r] of MERCH_RULES){ if(re.test(t)) return r; }
  return MERCH_CAT[x.category]??130; }
const KEY_DROP=/\b(men'?s|mens|men|ladies|lds|women'?s|womens|women|unisex|youth|toddler|kids?|tees?|t-shirt|tshirt|ls|long sleeve|short sleeve|v-neck|crew tee|pocket|performance|hooded|sleeveless|black|white|navy|red|royal|heather|gray|grey|charcoal|vintage|cream|espresso|blue|brown|green|ash|tan|teal|yellow|oatmeal|ivory|violet|graphite|periwinkle|mauve|maroon|cement|peach|indigo|purple|pink|orange|gold|silver|olive|sand|natural|stone|khaki)\b/g;
function printKey(x){ return (x.name||'').toLowerCase().replace(/\blds\b/g,'ladies').replace(/love and value/g,'love & value').replace(/travis mathew/g,'travismathew').replace(/crew tee/g,'tee').replace(/\*\*.*?\*\*/g,'').replace(KEY_DROP,' ').replace(/[^a-z0-9&*]+/g,' ').trim(); }
function genderRank(x){ const n=(x.name||'').toLowerCase(); return /\b(men'?s|mens)\b/.test(n)?0:/unisex/.test(n)?1:/\b(ladies|lds|women'?s|womens)\b/.test(n)?2:/youth|kids?/.test(n)?3:/toddler/.test(n)?4:1; }
const storeSort=(a,b)=>(merchRank(a)-merchRank(b))||printKey(a).localeCompare(printKey(b))||(genderRank(a)-genderRank(b))||(a.name||'').localeCompare(b.name||'');
const CATS=['Apparel','Headwear','Drinkware','Bags','Desk','Events','Gifting','Fun & Giveaways'];
const INVREC={keep:{label:'Keep',cls:'keep',chip:'ok'},sale:{label:'Put on Sale',cls:'sale',chip:'warn'},buyback:{label:'Buyback',cls:'buyback',chip:''},disc:{label:'Discontinue',cls:'disc',chip:'bad'}};
const discKeep=c=>c.rec==='keep'&&c.skuStatus==='Discontinued';
const recL=c=>(c.rec==='sale'&&c.skuStatus==='Active')?'Discontinue/Sale':discKeep(c)?'Sell Through':(INVREC[c.rec]||INVREC.keep).label;
const RECORDER={keep:0,sale:1,buyback:2,disc:3};
const INVDEC={keep:{label:'Keep',cls:'ok',icon:'✓'},sale:{label:'Put on Sale',cls:'warn',icon:'%'},buyback:{label:'Buyback',cls:'',icon:'↩'},disc:{label:'Discontinue',cls:'bad',icon:'✕'},discuss:{label:'Discuss',cls:'pend',icon:'?'}};
const SUGDEC={approved:{label:'Approved',cls:'ok',icon:'✓'},changes:{label:'Approved w/ changes',cls:'warn',icon:'✎'},declined:{label:'Declined',cls:'bad',icon:'✕'}};
const STORELIST={'In Store':'In Store (shoppers can order it)','Inactive':'Inactive (hidden from shoppers)','Incomplete':'Incomplete (listing not finished)'};

let db=null, userApi=null, downloadsApi=null, dbReady=false, canWrite=null, myName='';
const invDecisions={}, decisions={};
let current={brand:'mm', mode:'current', invRec:'all', cat:'all', sort:'store', draft:null, media:0};
let searchQ='';

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtN=n=>(n<0?'-':'')+Math.abs(n||0).toLocaleString('en-US');
const fmtA=c=>c.backord&&!c.availPos?`<span style="color:var(--red-text)">-${fmtN(c.backord)}</span>`:fmtN(c.availPos)+(c.backord?` · <span style="color:var(--red-text)">-${fmtN(c.backord)}</span>`:'');
const ONORD='<b style="color:var(--red-text)">On Order:</b>';
const pct=(a,b)=>b?Math.round((a-b)/b*100):null;
const money=v=>Number(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
const monthsSupply=c=>c.ms;
function fmtDate(iso){ if(!iso) return ''; try{return new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}catch(e){return iso} }
function toast(m){const t=$('#toast'); t.textContent=m; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),2200);}
const brandOf=id=>BRANDS.find(b=>b.id===id)||BRANDS[0];
const NOIMG='<span class="noimg"><svg viewBox="0 0 60 59" aria-hidden="true"><use href="#mmMark"/></svg></span>';
const img=(src,alt)=>src?`<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy">`:NOIMG;
const decChip=(d,map)=>d&&d.status&&map[d.status]?`<span class="chip ${map[d.status].cls}">${map[d.status].icon} ${map[d.status].label}${d.status==='sale'&&d.salePct?' '+d.salePct+'%':''}</span>`:'<span class="chip pend">Awaiting review</span>';

/* ---------- scoring: totals + CIC recommendation, recomputed whenever the daily refresh lands ---------- */
const CORE=/^(s|sm|small|m|md|medium|l|lg|large|xl|x-large|xlarge)$/i;
/* product setup dates from Titan Product Management (root product "created"), pulled 10/21/2026 */
const ADDED=__D.ADDED||{};
CURRENT.forEach(c=>{ if(ADDED[c.id]) c.added=ADDED[c.id]; });
/* items brought back after being discontinued: scored as relaunched, not on their old sales history */
const RELAUNCHED={MOV220004:{when:'October 2026',date:'2026-10-01',note:'Discontinued about a year ago and brought back: Movement just reordered it'}};
function score(c){
  const S=c.skus; let oh=0,bk=0,av=0,bo=0,oo=0,rp=0,s12=0,sp=0,s90=0,val=0,act=0;
  S.forEach(s=>{oh+=s[3];bk+=s[4];if(s[5]>0){av+=s[5];val+=s[5]*(s[8]||0);}else bo+=-s[5];oo+=s[6];rp+=s[7];s12+=s[9];sp+=s[10];s90+=s[11];act+=s[2];});
  Object.assign(c,{onHand:oh,booked:bk,avail:av-bo,availPos:av,backord:bo,onOrder:oo,reorderPt:rp,sold12:s12,soldPrior:sp,sold90:s90,stockValue:val,activeSkus:act});
  /* discontinued sizes with no stock, nothing booked and nothing on order are dropped when other sizes are still active */
  const dead=s=>!s[2]&&s[3]<=0&&s[4]<=0&&s[5]<=0&&s[6]<=0;
  const L=act>0?S.filter(s=>!dead(s)):S; c.liveSkus=L;
  c.sizes=L.length>1?L.map(s=>[s[1]||s[0],s[5],s[2]]):null;
  const actL=L.filter(s=>s[2]).length;
  c.skuStatus=actL===L.length?'Active':actL===0?'Discontinued':'Partly discontinued';
  const rate=s90>0?s90/3:s12/12; c.rate=rate;
  const ms=rate>0?(av+oo)/rate:null; c.ms=ms;
  const ch=sp?Math.round((s12-sp)/sp*100):null;
  const sized=S.length>2&&c.category==='Apparel';
  const coreS=sized?S.filter(s=>CORE.test((s[1]||'').trim())):[];
  const coreLeft=sized&&coreS.length&&coreS.every(s=>!s[2])?coreS.reduce((a,s)=>a+Math.max(s[5],0)+s[6],0):null;
  const fringeLeft=sized?S.filter(s=>!CORE.test((s[1]||'').trim())).reduce((a,s)=>a+Math.max(s[5],0),0):0;
  const cic=c.own!=='Consignment', listed=c.storeStatus==='In Store';
  const units=av, money$='$'+money(val);
  const W=[]; let rec='keep',act$='',pctSug=null;
  const pace=rate>0?`${fmtN(s12)} sold in the last 12 months${ch!==null?`, ${ch>0?'up ':'down '}${Math.abs(ch)}% on the year before`:''}`:`No sales in the last 12 months${sp?` (${fmtN(sp)} the year before)`:''}`;
  W.push(pace);
  if(s90) W.push(`${fmtN(s90)} sold in the last 90 days (about ${fmtN(Math.round(s90/3))} a month)`);
  const msTxt=ms===null?'':ms>24?`about ${(ms/12).toFixed(1)} years of stock at this pace`:`about ${ms.toFixed(1)} months of stock at this pace`;
  if(RELAUNCHED[c.id]){
    const R=RELAUNCHED[c.id]; c.relaunched=R.when; if(R.date){ c.firstAdded=c.firstAdded||c.added; c.added=R.date; } rec='keep'; act$='Keep: reordered and relaunched '+R.when; W.length=0;
    W.push(R.note); W.push(`${fmtN(av)} available${oo?`, ${fmtN(oo)} on order`:''}`);
    if(sp||s12) W.push(`Sales history is from before the relaunch (${fmtN(sp)} sold in the prior 12 months), so it is not used to judge this item yet`);
    if(!listed) W.push(`Store listing is still ${c.storeStatus}: turn it on so shoppers can order it`);
  } else if(/donation/i.test(c.name)){
    rec='keep'; act$='Keep: donation item, not physical merchandise'; W.push('Each purchase funds a Movement School uniform; the stock count is a placeholder, so no markdown or buyback applies');
  } else if(c.storeStatus==='Incomplete'&&s12===0&&sp===0){
    rec='keep'; act$='Keep: new listing still being set up'; W.push('No stock or sales yet; CIC is finishing the store listing');
  } else if(av+oo<=0){
    if(act===0||!listed||s12<12){ rec='disc'; act$='Discontinue: sold out, retire the listing'; W.push('Nothing left to sell and demand is too low to justify a reorder'); }
    else { rec='keep'; act$=`Keep: sold out, reorder${bo?` (${fmtN(bo)} back-ordered)`:''}`; W.push('Still selling: restock before shoppers see "out of stock"'); }
  } else if(s12===0&&s90===0&&c.isNew){
    rec='keep'; act$='Keep: new arrival, no sales history yet'; W.push(`${fmtN(av)} available`);
  } else if(s12===0&&s90===0){
    if(cic){ rec='buyback'; act$=`Buyback: ${fmtN(units)} units with no sales in 12 months`; W.push(`${fmtN(units)} units on the shelf, worth ${money$} at store price`); W.push('CIC-stocked inventory: Movement buys back the remaining units and the SKU is retired'); }
    else { rec='disc'; act$='Discontinue: no sales in 12 months'; W.push(`${fmtN(units)} units of Movement-owned (consignment) stock left`); W.push('Ship back to Movement, donate, or use at events, then retire the SKU'); }
  } else if(!listed&&units<=5){
    rec='disc'; act$=`Discontinue: hidden listing, only ${fmtN(units)} unit${units===1?'':'s'} left`; W.push(`Listing is ${c.storeStatus}; use or donate the last units and retire the SKU`);
  } else if(!listed){
    if(cic){ rec='buyback'; act$=`Buyback: hidden listing still holds ${fmtN(units)} units`; W.push(`Listing is ${c.storeStatus}, so shoppers cannot order the ${fmtN(units)} units left (${money$} at store price)`); }
    else { rec='disc'; act$=`Discontinue: hidden listing, ${fmtN(units)} consignment units left`; W.push(`Listing is ${c.storeStatus}; return or redeploy the Movement-owned stock`); }
  } else if(ms!==null&&ms>60&&cic&&val>=300){
    rec='buyback'; act$=`Buyback: over 5 years of stock (${fmtN(units)} units)`; W.push(msTxt); W.push(`${money$} at store price is tied up in CIC-stocked inventory`);
  } else if(ms!==null&&ms>36){
    rec='sale'; pctSug=ms>60?50:40; act$=`Put on Sale: ${pctSug}% off to sell through`; W.push(msTxt);
  } else if(sized&&coreLeft===0&&fringeLeft>0){
    rec='sale'; pctSug=30; act$='Put on Sale: 30% off, only extended sizes left'; W.push(`Small through XL are sold out and discontinued; ${fmtN(fringeLeft)} units left in other sizes`); W.push('Move it to Last Chance and retire the style when it sells out');
  } else if(ms!==null&&ms>18){
    rec='sale'; pctSug=25; act$='Put on Sale: 25% off to speed up sales'; W.push(msTxt);
  } else if(ms!==null&&ms>12&&ch!==null&&ch<=-50){
    rec='sale'; pctSug=20; act$='Put on Sale: 20% off, demand has halved'; W.push(msTxt);
  } else {
    rec='keep'; act$=ms!==null&&ms<2&&act>0?'Keep: selling well, reorder soon':'Keep: healthy sell-through';
    if(msTxt) W.push(`${fmtN(av)} available${oo?`, ${fmtN(oo)} on order`:''}: ${msTxt}`);
  }
  if(act===0&&av>0){ W.push('Every SKU is discontinued in SAP: CIC cannot reorder it without reactivating the SKUs'); if(rec==='keep') act$='Keep: selling well, but SKUs are discontinued in SAP (reactivate to reorder)'; }
  if(!cic&&(rec==='sale'||rec==='disc')) W.push('Consignment stock is owned by Movement: confirm before any markdown or return');
  if(c.flagDel) W.push(`Purchasing has flagged ${c.flagDel} zero-stock SKU${c.flagDel>1?'s':''} on this item for deletion`);
  c.rec=rec; c.action=act$; c.why=W; c.salePct=pctSug;
  return c;
}
CURRENT.forEach(score);


/* ---------- routing: #mm-current, #mm, #inv-SKU, #item-ID, #summary ---------- */
function route(keep){
  const h=location.hash.slice(1)||'mm-current';
  current.draft=null; current.media=0;
  if(h==='summary') renderSummary();
  else if(h==='stats') renderStats();
  else if(h.startsWith('inv-')){ const c=CURRENT.find(x=>x.id===h.slice(4)); if(!c){location.hash='#mm-current';return;} current.brand=c.brand; current.mode='current'; renderInvItem(c); }
  else if(h.startsWith('item-')){ const it=ITEMS.find(x=>x.id===h.slice(5)); if(!it){location.hash='#mm';return;} current.brand=it.brand; current.mode='suggest'; renderItem(it); }
  else if(h.endsWith('-current')){ const b=brandOf(h.slice(0,-8)); if(current.brand!==b.id||current.mode!=='current'){current.invRec='all';current.cat='all';} current.brand=b.id; current.mode='current'; renderCurrent(b); }
  else { const b=brandOf(h); if(current.brand!==b.id||current.mode!=='suggest'){current.cat='all';} current.brand=b.id; current.mode='suggest'; renderSuggest(b); }
  renderTabs(); renderProgress(); if(keep!==true) window.scrollTo({top:0});
}
window.addEventListener('hashchange',route);

const stack=t=>{const w=String(t).trim().split(/\s+/); return w.length===2?`<span class="stk">${esc(w[0])}<br>${esc(w[1])}</span>`:esc(t);};
function renderTabs(){
  const el=$('#tabs'); const h=location.hash.slice(1)||'mm-current'; const onSum=h==='summary'||h==='stats';
  el.innerHTML=BRANDS.map(b=>{
    const nc=progItems(b.id).length, ns=ITEMS.filter(i=>i.brand===b.id).length;
    const on=!onSum&&current.brand===b.id;
    return `<div class="ptab" data-b="${b.id}"><a href="#${b.id}-current" ${on?'aria-current="page"':''} aria-haspopup="true" aria-expanded="false">${stack(b.short)}${nc?`<span class="cnt">${nc}</span>`:''}<span class="car" aria-hidden="true"></span></a><div class="dd" role="menu"><a role="menuitem" href="#${b.id}-current" ${on&&current.mode==='current'?'aria-current="page"':''}>Current Inventory Status<small>${nc}</small></a><a role="menuitem" href="#${b.id}" ${on&&current.mode==='suggest'?'aria-current="page"':''}>Refresh Inventory Suggestions<small>${ns}</small></a></div></div>`;
  }).join('');
  const hs=$('#hlStats'),hm=$('#hlSum'); if(hs){ h==='stats'?hs.setAttribute('aria-current','page'):hs.removeAttribute('aria-current'); } if(hm){ h==='summary'?hm.setAttribute('aria-current','page'):hm.removeAttribute('aria-current'); }
  el.querySelectorAll('.ptab[data-b]>a').forEach(a=>a.addEventListener('click',e=>{
    if(!e.target.closest('.car')){ el.querySelectorAll('.ptab.open').forEach(x=>x.classList.remove('open')); return; }
    e.preventDefault(); const w=a.parentElement, o=!w.classList.contains('open');
    el.querySelectorAll('.ptab.open').forEach(x=>{x.classList.remove('open'); x.firstElementChild.setAttribute('aria-expanded','false');});
    if(o){w.classList.add('open'); a.setAttribute('aria-expanded','true');}
  }));
  el.querySelectorAll('.dd a').forEach(a=>a.addEventListener('click',()=>{ const w=a.closest('.ptab'); w.classList.remove('open'); a.blur(); }));
  const placeDD=w=>{ const d=w.querySelector('.dd'); if(!d) return; const r=w.getBoundingClientRect(); d.style.top=(r.bottom+6)+'px'; d.style.left=Math.max(8,Math.min(r.left,window.innerWidth-d.offsetWidth-8||r.left))+'px'; };
  el.querySelectorAll('.ptab[data-b]').forEach(w=>{ w.addEventListener('pointerenter',()=>placeDD(w)); w.firstElementChild.addEventListener('click',()=>requestAnimationFrame(()=>placeDD(w))); });
  el.addEventListener('scroll',()=>el.querySelectorAll('.ptab.open').forEach(x=>x.classList.remove('open')),{passive:true});
  const sn=$('#subnav');
  if(onSum){ sn.hidden=true; } else { const b=brandOf(current.brand); sn.hidden=false;
    $('#crumb').innerHTML=`Program <b>${esc(b.name)}</b>`;
    const c=$('#swCur'), s=$('#swSug'); c.href='#'+b.id+'-current'; s.href='#'+b.id;
    if(current.mode==='current'){c.setAttribute('aria-current','page'); s.removeAttribute('aria-current');} else {s.setAttribute('aria-current','page'); c.removeAttribute('aria-current');} }
}
document.addEventListener('click',e=>{ if(!e.target.closest('.ptab')) document.querySelectorAll('.ptab.open').forEach(x=>x.classList.remove('open')); });
document.addEventListener('pointerover',e=>{ if(e.pointerType!=='mouse') return; const p=e.target.closest('.ptab'); document.querySelectorAll('.ptab.open').forEach(x=>{ if(x!==p) x.classList.remove('open'); }); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') document.querySelectorAll('.ptab.open').forEach(x=>x.classList.remove('open')); });

function progItems(id){ return id==='sale'?CURRENT.filter(c=>c.rec==='sale'):CURRENT.filter(c=>c.brand===id); }
function renderProgress(){
  const total=CURRENT.length+ITEMS.length;
  const done=CURRENT.filter(c=>invDecisions[c.id]&&invDecisions[c.id].status).length+ITEMS.filter(i=>decisions[i.id]&&decisions[i.id].status).length;
  $('#progressText').textContent=`${done} of ${total} reviewed`; $('#progressPill').textContent=done;
}

function hero(b,mode,stats){
  return `<section class="hero"><div class="hmain"><svg class="wm" viewBox="0 0 60 59" aria-hidden="true"><use href="#mmMark"/></svg>
  <span class="kicker"><i></i>${esc(b.name)} · ${mode==='current'?'Current Inventory Status':'Refresh Inventory Suggestions'}</span>
  <h1>Merch that<span>means more.</span></h1>
  <p>${mode==='current'?`Review what is in the Movement Gear Store today. For each item CIC recommends <b>keep</b>, <b>put on sale</b>, <b>buyback</b> or <b>discontinue</b> from Titan stock and sales; your call is saved for the whole team.`:`New merchandise CIC suggests for the ${esc(b.name)} catalog. Approve, approve with changes, or decline each one.`}</p></div>
  <div class="stats">${stats.map(([n,l,cls,f])=>f?`<button type="button" class="stat statbtn ${cls||''}" data-statrec="${f}" aria-pressed="${current.invRec===f}" title="Show ${esc(l.replace('CIC: ',''))} items"><b>${n}</b><span>${l}</span></button>`:`<div class="stat ${cls||''}"><b>${n}</b><span>${l}</span></div>`).join('')}</div></section>`;
}
function viewSwitch(b,mode){ return `<div class="viewsw" role="group" aria-label="Choose view"><a href="#${b.id}-current" ${mode==='current'?'aria-current="page"':''}>Current Inventory</a><a href="#${b.id}" ${mode==='suggest'?'aria-current="page"':''}>Refresh Suggestions</a></div>`; }

function ghostCards(mode){
  const one=()=>`<div class="card ghost" aria-hidden="true"><div class="ph">Store photo</div><div class="cb"><div class="bar w80"></div><div class="bar w60"></div>${mode==='current'?`<ul class="inv"><li><b>CIC Recommendation:</b> Keep or Discontinue</li><li>Current Available Inventory</li><li>Sold over the last 12 months</li></ul>`:`<ul class="inv"><li>Why it fits Movement</li><li>Decoration and logo</li></ul><div class="bar w40"></div>`}</div></div>`;
  return '<div class="grid">'+one()+one()+one()+one()+'</div>';
}
function howTo(mode){
  const s=mode==='current'?[['✓','ok','Keep','Keep the item in the store and reorder as needed.'],['%','warn','Put on Sale','Mark it down. Enter the discount percentage before saving.'],['↩','muted','Buyback','Movement buys back the remaining CIC-stocked units.'],['✕','bad','Discontinue','Sell through or return what is left, then retire the SKU.']]
   :[['✓','ok','Approve','Add the item to the store as shown.'],['✎','warn','Approve with changes','Add it with the changes in your note (color, logo, size range).'],['✕','bad','Decline','Leave it out of the store.']];
  return `<div class="howto">${s.map(([i,c,b,t])=>`<div class="step"><span class="ic" style="background:var(--${c}-bg);color:var(--${c})">${i}</span><div><b>${b}</b><span>${t}</span></div></div>`).join('')}</div>`;
}

/* ---------- current inventory list ---------- */
function renderCurrent(b){
  const all=progItems(b.id);
  const cnt=r=>all.filter(c=>c.rec===r).length, k=cnt('keep'), sl=cnt('sale'), bb=cnt('buyback'), d=cnt('disc'), rev=all.filter(c=>invDecisions[c.id]&&invDecisions[c.id].status).length;
  let html=hero(b,'current',[[all.length,b.id==='sale'?'Sale picks':'Items','','all'],[k,'CIC: Keep','','keep'],[sl,'CIC: Discontinue/Sale','','sale'],[bb,'CIC: Buyback','red','buyback']]);
  html+=`<div class="shead"><div><h2>Keep, discount <em>or retire</em></h2><p>${esc(b.blurb)}</p></div></div>`;
  if(!all.length){
    html+=`<div class="emptyhead"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg></span><div><b>${esc(b.name)} items are loading next</b><span>CIC is pulling every ${esc(b.name)} SKU in the Movement Gear Store from Titan, with stock, 12-month sales and a keep or discontinue recommendation for each. Each item will appear as a card like the ones below.</span></div></div>`+ghostCards('current');
  } else {
    const rf=current.invRec, cf=current.cat, so=current.sort;
    const cats=CATS.filter(c=>all.some(i=>i.category===c));
    html+=`<div class="browse" role="group" aria-label="Filter current items"><span class="lbl">Show</span>${[['all','All',all.length],['keep','Keep',k],['sale','Discontinue/Sale',sl],['buyback','Buyback',bb],['disc','Discontinue',d]].filter(x=>x[0]==='all'||x[2]).map(([v,l,n])=>`<button class="pill" data-rec="${v}" aria-pressed="${rf===v}">${l}<span class="n">${n}</span></button>`).join('')}<span class="sp"></span><select id="invOwn" aria-label="Ownership">${[['all','All stock'],['CIC Owned','CIC Owned'],['Consignment','Consignment (MM Owned)']].map(([v,l])=>`<option value="${v}" ${(current.own||'all')===v?'selected':''}>${l} (${v==='all'?all.length:all.filter(i=>i.own===v).length})</option>`).join('')}</select><select id="invCat" aria-label="Category"><option value="all">All categories</option>${cats.map(c=>`<option ${cf===c?'selected':''}>${esc(c)}</option>`).join('')}</select><select id="invSort" aria-label="Sort by">${Object.entries({store:'Product Type',rec:'CIC recommendation',sold:'Most sold (12 mo)',stock:'Most stock',months:'Most months of stock',name:'Name A-Z'}).map(([v,l])=>`<option value="${v}" ${so===v?'selected':''}>${v==='store'?l:'Sort: '+l}</option>`).join('')}</select></div>`;
    const of=current.own||'all';
    let items=all.filter(c=>(of==='all'||c.own===of)&&(rf==='all'||c.rec===rf)&&(cf==='all'||c.category===cf)&&(!searchQ||(c.name+' '+c.id+' '+c.category).toLowerCase().includes(searchQ)));
    const sorters={store:storeSort, rec:(x,y)=>(RECORDER[x.rec]-RECORDER[y.rec])||y.sold12-x.sold12, sold:(x,y)=>y.sold12-x.sold12, stock:(x,y)=>y.availPos-x.availPos, months:(x,y)=>(y.ms??-1)-(x.ms??-1), name:(x,y)=>x.name.localeCompare(y.name)};
    const srt=sorters[so]||storeSort, dz=x=>x.skuStatus==='Discontinued'?1:0;
    items.sort((x,y)=>(dz(x)-dz(y))||srt(x,y));
    html+=items.length?'<div class="grid">'+items.map(invCard).join('')+'</div>':`<div class="emptyhead"><div><b>No items match</b><span>Try another filter, category or search.</span></div></div>`;
  }
  html+=howTo('current');
  $('#view').innerHTML=html;
  $('#view').querySelectorAll('.pill[data-rec]').forEach(x=>x.onclick=()=>{current.invRec=x.dataset.rec; renderCurrent(b);});
  $('#view').querySelectorAll('.statbtn[data-statrec]').forEach(x=>x.onclick=()=>{current.invRec=x.dataset.statrec; renderCurrent(b); const g=$('#view .browse'); if(g) g.scrollIntoView({behavior:'smooth',block:'start'});});
  const ic=$('#invCat'); if(ic) ic.onchange=()=>{current.cat=ic.value; renderCurrent(b);};
  const io=$('#invOwn'); if(io) io.onchange=()=>{current.own=io.value; renderCurrent(b);};
  const is=$('#invSort'); if(is) is.onchange=()=>{current.sort=is.value; renderCurrent(b);};
}
const b0=c=>current.brand==='sale'?' · '+esc(brandOf(c.brand).short):'';
function invCard(c){
  const d=invDecisions[c.id], ch=pct(c.sold12,c.soldPrior), r=INVREC[c.rec]||INVREC.keep;
  return `<a class="card" href="#inv-${esc(c.id)}"><div class="ph">${img(c.img,c.name)}${discKeep(c)?'':`<span class="flag ${r.cls}">CIC: ${recL(c)}</span>`}<span class="flag r ${c.skuStatus==='Active'?'':'off'}">SKU ${esc(c.skuStatus)}</span></div>
  <div class="cb"><span class="kind">${esc(c.category)} · ${esc(c.id)}${b0(c)}</span><div class="nm" title="${esc(c.name)}">${esc(c.name)}</div>
  <div class="crec ${r.cls}"><span class="l">CIC Recommendation</span><span class="v">${recL(c)}</span>${c.rec==='sale'&&c.salePct?`<span class="s">Sale: ${c.salePct}% off</span>`:''}</div>
  <dl class="cst"><dt>Available</dt><dd>${fmtA(c)}</dd>${c.onOrder?`<dt class="oo">On Order:</dt><dd class="oo">${fmtN(c.onOrder)}</dd>`:''}<dt>Sold, last 12 mo</dt><dd>${fmtN(c.sold12)}${ch!==null?` <small class="${ch>0?'up':ch<0?'dn':''}">${ch>0?'+':''}${ch}%</small>`:''}</dd></dl>
  ${(c.own==='Consignment'||(c.storeStatus&&c.storeStatus!=='In Store'))?`<div class="ctags">${c.own==='Consignment'?'<span class="ctag cons"><b><i>Consignment (Movement Owned)</i></b></span>':''}${c.storeStatus&&c.storeStatus!=='In Store'?`<span class="ctag">Store: ${esc(c.storeStatus)}</span>`:''}</div>`:''}
  ${d&&d.status?decChip(d,INVDEC):''}</div></a>`;
}

/* ---------- current item sheet ---------- */
function renderInvItem(c){
  const b=brandOf(c.brand), d=invDecisions[c.id]||{}, r=INVREC[c.rec]||INVREC.keep;
  const dr=current.draft||(current.draft={status:d.status||null,notes:d.notes||'',reviewer:d.reviewer||myName||'',salePct:d.salePct||null});
  const ch=pct(c.sold12,c.soldPrior), ms=monthsSupply(c);
  $('#view').innerHTML=`<a class="back" href="#${b.id}-current">← Back to ${esc(b.name)} current items</a>
  <div class="detail"><div class="gallery"><div class="main">${img(c.img,c.name)}<span class="cap">Current store item, as sold today</span></div></div>
  <div class="info"><div class="row"><span class="chip ${c.skuStatus==='Active'?'ok':'bad'}">SKU ${esc(c.skuStatus)}</span><span class="chip">${esc(b.name)}</span><span class="chip">${esc(c.category)}</span>${decChip(d,INVDEC)}</div>
  <h1>${esc(c.name)}</h1>
  <ul class="kv"><li>Store SKU: <b>${esc(c.id)}</b></li><li>Per piece price: <b>${c.price?esc(c.price):'Not set in the store yet'}</b></li><li>Store listing: <b>${esc(STORELIST[c.storeStatus]||c.storeStatus||'In Store')}</b></li></ul>
  <div class="rec ${r.cls}"><div class="rh">CIC Recommendation</div><div class="rv">${recL(c)}</div>${c.rec==='sale'&&c.salePct?`<div class="rsale">Sale: <b>${c.salePct}% off</b></div>`:''}<ul>${c.action?`<li><b>${esc(c.action)}</b></li>`:''}${(c.why||[]).map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>
  ${c.desc?`<ul class="kv">${c.desc.split(/(?<=\.)\s+/).filter(Boolean).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
  <div class="section"><h2>Inventory</h2><ul class="kv"><li>Available: <b>${fmtA(c)}</b></li><li>On hand: <b>${fmtN(c.onHand)}</b></li><li>Booked: <b>${fmtN(c.booked)}</b></li><li>${ONORD} <b>${fmtN(c.onOrder)}</b></li><li>Reorder point: <b>${fmtN(c.reorderPt)}</b></li>${c.own?`<li>Stock: <b>${c.own==='Consignment'?'<i>Consignment (Movement Owned)</i>':'CIC-stocked'}</b></li>`:''}<li>Value of available stock: <b>$${money(c.stockValue)}</b> at store price</li><li>Months of stock: <b>${ms===null?'No recent sales':ms>24?(ms/12).toFixed(1)+' years':ms.toFixed(1)+' months'}</b>${ms===null?'':' at the current pace'}</li></ul>
  ${c.skus.length>1?`<h2>By size</h2><div class="sizetable"><table class="sizes"><thead><tr><th>Size</th><th>SKU</th><th>Available</th><th style="color:var(--red-text)">On Order</th><th>Sold 12 mo</th><th>Last 90 days</th></tr></thead><tbody>${(c.liveSkus||c.skus).map(s=>`<tr><td${s[2]?'':' class="off"'}>${esc(s[1]||'-')}${s[2]?'':' (disc.)'}</td><td class="num">${esc(s[0])}</td><td class="num" style="${s[5]<=0?'color:var(--red-text)':''}">${s[5]<0?'-'+fmtN(-s[5]):fmtN(s[5])}</td><td class="num"${s[6]?' style="color:var(--red-text);font-weight:800"':''}>${fmtN(s[6])}</td><td class="num">${fmtN(s[9])}</td><td class="num">${fmtN(s[11])}</td></tr>`).join('')}</tbody></table></div>`:''}</div>
  <div class="section"><h2>Sales</h2><ul class="kv"><li>Last 12 months: <b>${fmtN(c.sold12)}</b></li><li>Prior 12 months: <b>${fmtN(c.soldPrior)}</b></li><li>Change: <b style="color:${ch!==null&&ch<0?'var(--red-text)':'var(--ok)'}">${ch===null?'n/a':(ch>0?'+':'')+ch+'%'}</b></li><li>Last 90 days: <b>${fmtN(c.sold90)}</b> (about ${fmtN(Math.round(c.sold90/3))} a month)</li></ul></div>
  ${decideBox(dr,d,[['keep','ok','✓ Keep','Keep in the store and reorder as needed'],['sale','warn','% Put on Sale','Mark it down by a set percentage'],['buyback','dark','↩ Buyback','Movement buys back the remaining units'],['disc','bad','✕ Discontinue','Sell through, then retire the SKU'],['discuss','pend','? Discuss','Not sure yet: leave a note']],invExtras(c,dr))}
  </div></div>`;
  bindDecide(c,'invdecisions',invDecisions,INVDEC,()=>renderInvItem(c),{sku:c.id,name:c.name,brand:c.brand,cicRec:c.rec,cicSalePct:c.salePct||null});
  bindInvExtras(c);
}

function invExtras(c,dr){
  if(dr.status==='sale'){ const p=dr.salePct, sug=c.salePct||25, lo=c.skus.map(s=>s[8]).filter(Boolean);
    const ex=lo.length&&p?`$${money(Math.min(...lo)*(1-p/100))}${Math.max(...lo)!==Math.min(...lo)?'–$'+money(Math.max(...lo)*(1-p/100)):''}`:'';
    return `<div class="salebox"><label for="salePct">Discount percentage (required)</label><div class="pctrow"><input id="salePct" type="number" inputmode="numeric" min="5" max="90" step="5" placeholder="${sug}" value="${p??''}" aria-describedby="saleCalc"><b>% off</b>${[15,25,40,50].map(v=>`<button type="button" class="quick" data-p="${v}" aria-pressed="${p===v}">${v}%</button>`).join('')}</div><span class="calc" id="saleCalc">${p?`Sale price ${ex} (now ${esc(c.price)}). `:''}CIC suggests <b>${sug}%</b>. Enter 5 to 90.</span></div>`; }
  if(dr.status==='buyback') return `<div class="bbbox"><b class="h">Buyback</b><span class="calc">Movement buys back <b>${fmtN(c.availPos)} units</b> (<b>$${money(c.stockValue)}</b> at store price; CIC confirms the final buyback amount). The SKU is retired once the stock ships to Movement.</span></div>`;
  return '';
}
function bindInvExtras(c){
  const inp=$('#salePct'); if(!inp) return;
  const set=v=>{ current.draft.salePct=v; };
  inp.addEventListener('input',()=>{ const v=Math.round(+inp.value); set(inp.value===''||isNaN(v)?null:v); });
  inp.addEventListener('change',()=>{ syncDraft(); renderInvItem(c); const n=$('#salePct'); if(n) n.focus(); });
  $('#view').querySelectorAll('.quick').forEach(q=>q.onclick=()=>{ syncDraft(); set(+q.dataset.p); renderInvItem(c); });
}

/* ---------- refresh suggestions ---------- */
function renderSuggest(b){
  const all=ITEMS.filter(i=>i.brand===b.id);
  const ap=all.filter(i=>decisions[i.id]&&['approved','changes'].includes(decisions[i.id].status)).length, de=all.filter(i=>decisions[i.id]&&decisions[i.id].status==='declined').length;
  let html=hero(b,'suggest',[[all.length,'Suggested'],[ap,'Approved'],[de,'Declined','red'],[all.length-ap-de,'Awaiting']]);
  html+=`<div class="shead"><div><h2>Refresh <em>suggestions</em></h2><p>${esc(b.blurb)}</p></div></div>`;
  if(!all.length){
    html+=`<div class="emptyhead"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M3 12h18"/></svg></span><div><b>New ${esc(b.name)} suggestions are coming</b><span>CIC will add new products here with a virtual mockup, the Movement logo placement, price and minimum for each.</span></div></div>`+ghostCards('suggest');
  } else {
    const cats=CATS.filter(c=>all.some(i=>i.category===c));
    html+=`<div class="browse" role="group" aria-label="Browse"><span class="lbl">Shop by</span>${[['all','All',all.length],...cats.map(c=>[c,c,all.filter(i=>i.category===c).length])].map(([v,l,n])=>`<button class="pill" data-cat="${esc(v)}" aria-pressed="${current.cat===v}">${esc(l)}<span class="n">${n}</span></button>`).join('')}</div>`;
    const items=all.filter(i=>(current.cat==='all'||i.category===current.cat)&&(!searchQ||(i.name+' '+i.sku+' '+(i.color||'')+' '+i.category).toLowerCase().includes(searchQ))).sort(storeSort);
    html+=items.length?'<div class="grid">'+items.map(sugCard).join('')+'</div>':`<div class="emptyhead"><div><b>No items match</b><span>Pick another category or clear the search.</span></div></div>`;
  }
  html+=howTo('suggest');
  $('#view').innerHTML=html;
  $('#view').querySelectorAll('.pill[data-cat]').forEach(x=>x.onclick=()=>{current.cat=x.dataset.cat; renderSuggest(b);});
}
function sugCard(i){
  const d=decisions[i.id], m=(i.media||[])[0];
  return `<a class="card" href="#item-${esc(i.id)}"><div class="ph">${img(m&&(m.poster||m.src),i.name)}${d&&d.status?`<span class="flag ${d.status==='declined'?'disc':'approved'}">${SUGDEC[d.status].label}</span>`:''}</div>
  <div class="cb"><span class="kind">${esc(i.category)} · ${esc(i.sku)}</span><div class="nm">${esc(i.name)}</div>${i.color?`<span class="chg">${esc(i.color)}</span>`:''}
  ${(i.features||[]).length?`<ul class="inv">${i.features.slice(0,3).map(f=>`<li>${esc(f)}</li>`).join('')}</ul>`:''}
  ${i.quote?`<div class="price">From <b>$${money(i.quote.sell)}</b> each · min ${fmtN(i.quote.min)}</div>`:''}</div></a>`;
}
function renderItem(it){
  const b=brandOf(it.brand), d=decisions[it.id]||{}, media=it.media||[], m=media[current.media]||media[0];
  const dr=current.draft||(current.draft={status:d.status||null,notes:d.notes||'',reviewer:d.reviewer||myName||''});
  $('#view').innerHTML=`<a class="back" href="#${b.id}">← Back to ${esc(b.name)} suggestions</a>
  <div class="detail"><div class="gallery"><div class="main">${m?(m.video?`<video src="${esc(m.src)}" poster="${esc(m.poster||'')}" controls playsinline></video>`:`<img src="${esc(m.src)}" alt="${esc(it.name)} ${esc(m.label||'')}">`):NOIMG}${m&&m.label?`<span class="cap">${esc(m.label)}</span>`:''}</div>
  ${media.length>1?`<div class="thumbs">${media.map((x,k)=>`<button class="thumb" data-k="${k}" aria-current="${k===current.media}" aria-label="${esc(x.label||'View '+(k+1))}"><img src="${esc(x.poster||x.src)}" alt=""></button>`).join('')}</div>`:''}</div>
  <div class="info"><div class="row"><span class="chip">${esc(b.name)}</span><span class="chip">${esc(it.category)}</span>${decChip(d,SUGDEC)}</div>
  <h1>${esc(it.name)}</h1>
  <ul class="kv"><li>Item: <b>${esc(it.sku)}</b>${it.color?` · ${esc(it.color)}`:''}</li>${it.quote?`<li>Per piece: <b>$${money(it.quote.sell)}</b>${it.quote.incl?` (includes ${esc(it.quote.incl)})`:''}</li><li>Minimum: <b>${fmtN(it.quote.min)} pieces</b></li>`:''}</ul>
  ${it.desc?`<p>${esc(it.desc)}</p>`:''}
  ${(it.features||[]).length?`<div class="section"><h2>Features</h2><ul class="kv">${it.features.map(f=>`<li>${esc(f)}</li>`).join('')}</ul></div>`:''}
  ${it.deco?`<div class="section"><h2>Decoration</h2><ul class="kv">${it.deco.method?`<li>Method: <b>${esc(it.deco.method)}</b></li>`:''}${it.deco.location?`<li>Location: <b>${esc(it.deco.location)}</b></li>`:''}${it.deco.logo?`<li>Logo: <b>${esc(it.deco.logo)}</b></li>`:''}</ul></div>`:''}
  ${decideBox(dr,d,[['approved','ok','✓ Approve','Add to the store as shown'],['changes','warn','✎ With changes','Add it with the changes in your note'],['declined','bad','✕ Decline','Leave it out of the store']])}
  </div></div>`;
  $('#view').querySelectorAll('.thumb').forEach(t=>t.onclick=()=>{ syncDraft(); current.media=+t.dataset.k; renderItem(it); });
  bindDecide(it,'decisions',decisions,SUGDEC,()=>renderItem(it),{sku:it.sku,name:it.name,brand:it.brand,color:it.color||''});
}

/* ---------- decision box (shared) ---------- */
function decideBox(dr,d,opts,extra){
  return `<div class="decide"><h2>Your decision</h2><div class="choices${opts.length>3?' five':''}">${opts.map(([s,c,l,t])=>`<button class="choice ${c}" data-s="${s}" aria-pressed="${dr.status===s}">${l}<small>${t}</small></button>`).join('')}</div>${extra||''}
  ${dr.status?'<p class="hint">Changed your mind? Click your selected choice again to clear it.</p>':''}
  <div class="field"><label for="notes">Notes</label><textarea id="notes" placeholder="Optional comments for CIC">${esc(dr.notes)}</textarea></div>
  <div class="field"><label for="reviewer">Reviewed by</label><input id="reviewer" placeholder="Your name" value="${esc(dr.reviewer)}"></div>
  <div class="save"><button class="btn" id="saveBtn">Save decision</button><span class="status">${d.updatedAt?`Last saved ${fmtDate(d.updatedAt)}${d.reviewer?' by '+esc(d.reviewer):''}`:'Not yet reviewed'}</span></div><div id="writeNotice"></div></div>`;
}
function syncDraft(){ if(!current.draft) return; const n=$('#notes'), r=$('#reviewer'); if(n) current.draft.notes=n.value; if(r) current.draft.reviewer=r.value; }
function bindDecide(obj,coll,map,SMAP,rerender,meta){
  $('.choices').addEventListener('click',e=>{ const t=e.target.closest('.choice'); if(!t) return; syncDraft();
    if(current.draft.status===t.dataset.s){ const saved=map[obj.id]&&map[obj.id].status===t.dataset.s;
      confirmClear(SMAP[t.dataset.s].label,saved,async()=>{ if(saved) await clearSaved(coll,map,obj.id); current.draft={status:null,notes:saved?'':current.draft.notes,reviewer:current.draft.reviewer,salePct:null}; if(saved) toast('Decision cleared'); rerender(); }); return; }
    current.draft.status=t.dataset.s; if(t.dataset.s==='sale'&&current.draft.salePct==null&&obj.salePct) current.draft.salePct=obj.salePct; rerender(); });
  $('#saveBtn').addEventListener('click',async()=>{ syncDraft(); const x=current.draft;
    if(!x.status){toast('Pick a decision first');return;}
    if(x.status==='sale'&&!(x.salePct>=5&&x.salePct<=90)){ toast('Enter a discount between 5% and 90%'); const p=$('#salePct'); if(p) p.focus(); return; }
    if(!db){toast('Not connected: decision not saved');return;}
    const btn=$('#saveBtn'); btn.disabled=true; btn.textContent='Saving…';
    const prev=map[obj.id]||{}; const hist=Array.isArray(prev.history)?prev.history.slice(-19):[]; if(prev.status) hist.push({status:prev.status,salePct:prev.salePct||null,notes:prev.notes||'',reviewer:prev.reviewer||'',at:prev.updatedAt||''});
    const doc={...meta,status:x.status,notes:x.notes.trim(),reviewer:x.reviewer.trim(),updatedAt:new Date().toISOString(),history:hist};
    if(coll==='invdecisions'){ doc.salePct=x.status==='sale'?x.salePct:null; doc.buybackUnits=x.status==='buyback'?obj.availPos:null; doc.buybackValue=x.status==='buyback'?Math.round(obj.stockValue*100)/100:null; }
    try{ await db.doc(coll+'/'+obj.id).set(doc); map[obj.id]=doc; myName=doc.reviewer||myName; try{localStorage.setItem('mov-reviewer',myName)}catch(e){} current.draft=null; toast('Decision saved'); rerender(); renderProgress(); }
    catch(e){ console.error(e); btn.disabled=false; btn.textContent='Save decision'; if(e&&e.code==='invalid_argument'){canWrite=false; updateWriteNotice(); toast('This link is view-only');} else toast('Could not save, try again'); } });
  updateWriteNotice();
}
function updateWriteNotice(){
  const el=$('#writeNotice'); if(!el) return; const sb=$('#saveBtn');
  if(!dbReady) el.innerHTML='<div class="notice">Connecting to the decision log. You can fill this in now and save in a moment.</div>';
  else if(db===null){ el.innerHTML='<div class="notice">Decisions can’t be saved from this view (not signed in or no access). Ask CIC for an invite link with edit access.</div>'; if(sb) sb.disabled=true; }
  else if(canWrite===false){ el.innerHTML='<div class="notice">This link is view-only, so decisions can’t be saved here. Ask CIC for an invite with Contributor access.</div>'; if(sb) sb.disabled=true; }
  else el.innerHTML='';
}
function confirmClear(label,hasSaved,onYes){
  const m=document.createElement('div'); m.className='modal';
  m.innerHTML=`<div class="modalbox" role="dialog" aria-modal="true" aria-labelledby="clrT"><button class="x" aria-label="Close">×</button><h2 id="clrT">Clear your decision?</h2><p>${hasSaved?`This removes the saved <b>${esc(label)}</b> decision and puts the item back to Awaiting review. Your notes stay in the decision history.`:`This unselects <b>${esc(label)}</b>.`}</p><div class="save"><button class="btn" id="clrYes">Yes, clear it</button><button class="btn ghostbtn" id="clrNo">Keep my decision</button></div></div>`;
  document.body.appendChild(m);
  const close=()=>{m.remove(); document.removeEventListener('keydown',k);}; const k=e=>{if(e.key==='Escape') close();};
  document.addEventListener('keydown',k);
  m.addEventListener('click',e=>{ if(e.target===m||e.target.closest('.x')||e.target.closest('#clrNo')) close(); });
  m.querySelector('#clrYes').onclick=async()=>{ try{ await onYes(); close(); }catch(err){ console.error(err); toast(err&&err.code==='invalid_argument'?'This link is view-only':'Could not clear, try again'); } };
  m.querySelector('#clrNo').focus();
}
async function clearSaved(coll,map,id){
  const prev=map[id]; if(!prev||!prev.status) return; if(!db) throw Object.assign(new Error('offline'),{code:'offline'});
  const hist=Array.isArray(prev.history)?prev.history.slice(-19):[]; hist.push({status:prev.status,notes:prev.notes||'',reviewer:prev.reviewer||'',at:prev.updatedAt||''});
  const doc={...prev,status:null,salePct:null,buybackUnits:null,buybackValue:null,notes:'',updatedAt:new Date().toISOString(),clearedBy:myName||'',history:hist};
  await db.doc(coll+'/'+id).set(doc); map[id]=doc;
}

/* ---------- stats: the whole store at a glance ----------
   Health rule (per SKU, from Titan numbers):
   Retiring = SKU discontinued (selling through) · Stalled = no sales in 90 days, or over 12 months of stock
   Slow = 6-12 months of stock, or 12-month sales down 30%+ on the prior year · Moving = everything else that sells.
   Uses optional fields on CURRENT rows: added ('YYYY-MM-DD', date the SKU was set up) and unit (per-piece store price, number). */
const HEALTH={
  moving:{label:'Moving',icon:'✓',c:'var(--h-good)',note:'Selling, under 6 months of stock'},
  slow:{label:'Slow',icon:'!',c:'var(--h-warn)',note:'6-12 months of stock, or sales down 30%+'},
  stalled:{label:'Stalled',icon:'✕',c:'var(--h-crit)',note:'No sales in 90 days, or 12+ months of stock'},
  retiring:{label:'Sold out',icon:'–',c:'var(--h-neutral)',note:'No stock left and nothing on order'},
  fresh:{label:'New / relaunched',icon:'★',c:'var(--h-new)',note:'Set up or relaunched in the last 90 days, no sales yet'}
};
const escT=s=>esc(esc(s));
const HORDER=['moving','slow','stalled','fresh','retiring'];
const availOf=c=>c.availPos!=null?c.availPos:Math.max(c.avail||0,0);
const rateOf=c=>c.rate!=null?c.rate:(c.sold90?c.sold90/3:(c.sold12||0)/12);
const msOf=c=>{ if(c.ms!==undefined) return c.ms; const r=rateOf(c); return r>0?(availOf(c)+(c.onOrder||0))/r:null; };
function health(c){
  if(c.relaunched||((c.isNew||(ageOf(c.added)??9)<0.25)&&!c.sold12)) return 'fresh';
  if(availOf(c)+(c.onOrder||0)<=0) return 'retiring';
  if(!rateOf(c)) return 'stalled';
  const ms=msOf(c), ch=pct(c.sold12,c.soldPrior);
  if(ms!==null&&ms>12) return 'stalled';
  if((ms!==null&&ms>6)||(ch!==null&&ch<=-30)) return 'slow';
  return 'moving';
}
const RECBAR={keep:'var(--h-good)',sale:'var(--h-warn)',buyback:'var(--fg)',disc:'var(--h-crit)'};
const hIco=k=>`<span class="hico" style="background:${HEALTH[k].c}" aria-hidden="true">${HEALTH[k].icon}</span>`;
const hChip=k=>`<span class="hchip">${hIco(k)}${HEALTH[k].label}</span>`;
const unitOf=c=>typeof c.unit==='number'?c.unit:(parseFloat(String(c.price||'').replace(/[^0-9.]/g,''))||0);
const fmtMoney=n=>n>=1e6?'$'+(n/1e6).toFixed(1)+'M':n>=1e4?'$'+Math.round(n/1e3)+'K':'$'+Math.round(n).toLocaleString('en-US');
const fmtDay=d=>{ if(!d) return '—'; const x=new Date(d+'T12:00:00'); return isNaN(x)?d:x.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); };
const ageOf=d=>{ if(!d) return null; const ms=Date.now()-new Date(d+'T12:00:00').getTime(); return ms/(365.25*864e5); };

/* sample set: only used while no real store data is loaded; every name says "Sample" */
let SAMPLE=null;
function sampleData(){
  if(SAMPLE) return SAMPLE;
  let s=20261021; const r=()=>(s=(s*48271)%2147483647)/2147483647;
  const T=[['Apparel','Performance Polo',28],['Apparel','Tri-Blend Tee',12],['Apparel','Quarter-Zip',42],['Apparel','Pullover Hoodie',38],['Headwear','Dad Cap',14],['Headwear','Knit Beanie',11],['Drinkware','40 oz Tumbler',32],['Drinkware','Ceramic Mug',9],['Bags','Laptop Backpack',55],['Bags','Canvas Tote',8],['Desk','Soft Journal',13],['Tech','Power Bank',24],['Events','Retractable Banner',189],['Events','Table Throw',165],['Gifting','Closing Gift Box',65],['Fun & Giveaways','Stress Ball',2],['Apparel','Fleece Vest',44],['Drinkware','Water Bottle',18]];
  const P=['mm','mm','mm','mm','mm','school','sale','military'];
  SAMPLE=Array.from({length:42},(_,i)=>{
    const [cat,nm,price]=T[i%T.length];
    const brand=cat==='Events'?'events':cat==='Gifting'?['gifting','builder','military'][i%3]:P[Math.floor(r()*P.length)];
    const sold12=Math.round(Math.pow(r(),2.2)*1400);
    const soldPrior=Math.round(sold12*(0.45+r()*1.1)+r()*40);
    const dead=r()<0.14;
    const sold90=dead?0:Math.round(sold12/4*(0.5+r()));
    const avail=Math.round(r()*r()*420)+(dead?40:0)-(r()<0.06?6:0);
    const disc=r()<0.1;
    const y=2019+Math.floor(r()*8), m=1+Math.floor(r()*12), d=1+Math.floor(r()*27);
    const added=`${Math.min(y,2026)}-${String(y>=2026?Math.min(m,10):m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return {id:'SAMPLE-'+String(i+1).padStart(2,'0'),brand,name:'Sample '+nm+' '+String.fromCharCode(65+Math.floor(i/T.length)),category:cat,skuStatus:disc?'Discontinued':'Active',storeStatus:'In Store',
      onHand:Math.max(avail,0)+3,booked:3,avail,onOrder:!disc&&r()<0.2?Math.round(r()*120):0,reorderPt:Math.round(sold12/12*1.5),sold12,soldPrior,sold90,unit:price,added,rec:'keep',sample:true};
  });
  return SAMPLE;
}

function renderStats(){
  const real=CURRENT.length>0, useSample=!real&&current.statSample!==false;
  const src=real?CURRENT:(useSample?sampleData():[]);
  const pf=current.statProg||'all';
  const rows=src.filter(c=>pf==='all'||c.brand===pf).map(c=>({...c,h:health(c),ms:msOf(c),rate:rateOf(c),A:availOf(c),val:c.stockValue!=null?c.stockValue:availOf(c)*unitOf(c)}));
  const link=c=>c.sample?`<span class="t" title="${esc(c.name)}">${esc(c.name)}</span>`:`<a href="#inv-${esc(c.id)}" title="${esc(c.name)}">${esc(c.name)}</a>`;
  const progs=BRANDS.filter(b=>b.id!=='sale'&&src.some(c=>c.brand===b.id));
  let html=`<div class="shead"><div><h2>Store <em>stats</em></h2><p>The whole Movement Gear Store at a glance: what is moving, what is sitting, and what needs a reorder.${real&&INV_ASOF?' '+esc(INV_ASOF):''}</p></div></div>`;
  if(!real) html+=`<div class="samplebar" role="note"><b>${useSample?'Sample data':'No data yet'}</b><span>${useSample?'Movement inventory is not loaded yet, so these charts show made-up sample items to preview the layout. Nothing here is Movement\'s real stock or sales.':'Charts fill in once CIC loads the Titan inventory and sales reports for the MOV store.'}</span><button class="btn ghostbtn" id="sampleTog">${useSample?'Hide sample':'Preview with sample data'}</button></div>`;
  html+=`<div class="browse statfilter" role="group" aria-label="Program"><span class="lbl">Program</span>${[['all','All programs',src.length],...progs.map(b=>[b.id,b.short,src.filter(c=>c.brand===b.id).length])].map(([v,l,n])=>`<button class="pill" data-prog="${v}" aria-pressed="${pf===v}">${esc(l)}<span class="n">${n}</span></button>`).join('')}</div>`;
  if(!rows.length){ $('#view').innerHTML=html+`<div class="emptyhead"><div><b>No items to chart</b><span>Pick another program, or load the store data.</span></div></div>`; bindStats(); return; }

  /* KPIs */
  const sum=(a,f)=>a.reduce((t,x)=>t+(f(x)||0),0);
  const avail=sum(rows,c=>c.A), sold12=sum(rows,c=>c.sold12), prior=sum(rows,c=>c.soldPrior), sold90=sum(rows,c=>c.sold90), val=sum(rows,c=>c.val), onOrd=sum(rows,c=>c.onOrder);
  const yoy=pct(sold12,prior), mos=sold90?avail/(sold90/3):null;
  const cnt=k=>rows.filter(c=>c.h===k).length, units=k=>sum(rows.filter(c=>c.h===k),c=>c.A);
  const healthyPct=Math.round(cnt('moving')/rows.length*100);
  const reorder=rows.filter(c=>c.rate>0&&c.activeSkus!==0&&c.A+c.onOrder<=Math.max(c.reorderPt||0,c.rate)).sort((a,b)=>(a.ms??0)-(b.ms??0));
  html+=`<div class="kpis">
   <div class="kpi lead"><span class="l">Healthy items</span><span class="v">${healthyPct}%</span><span class="s">${cnt('moving')} of ${rows.length} items moving</span></div>
   <div class="kpi"><span class="l">Store items</span><span class="v">${fmtN(rows.length)}</span><span class="s">${rows.filter(c=>c.skuStatus==='Discontinued').length} fully discontinued in SAP</span></div>
   <div class="kpi"><span class="l">Units available</span><span class="v">${fmtN(avail)}</span><span class="s">${fmtN(onOrd)} more on order</span></div>
   <div class="kpi"><span class="l">Stock value</span><span class="v">${fmtMoney(val)}</span><span class="s">Available units × store price</span></div>
   <div class="kpi"><span class="l">Sold, 12 months</span><span class="v">${fmtN(sold12)}</span><span class="s">${yoy===null?'No prior year':`<span class="delta ${yoy<0?'dn':'up'}">${yoy>0?'▲ +':yoy<0?'▼ ':''}${yoy}%</span> vs prior 12 months`}</span></div>
   <div class="kpi"><span class="l">Months of stock</span><span class="v">${mos===null?'—':mos.toFixed(1)}</span><span class="s">At the last-90-day pace</span></div></div>`;

  /* health overview + reorder */
  const hseg=(n,tot,k,what)=>n?`<i style="width:${n/tot*100}%;background:${HEALTH[k].c}" data-tip="<b>${HEALTH[k].label}</b>${fmtN(n)} ${what} (${Math.round(n/tot*100)}%)"></i>`:'';
  html+=`<div class="panels"><div class="panel"><h3>Inventory health</h3><p class="sub">Every item sorted by how fast it sells against the stock on hand.</p>
   <div class="hbar" role="img" aria-label="SKUs by health">${HORDER.map(k=>hseg(cnt(k),rows.length,k,'SKUs')).join('')}</div>
   <div class="hlegend">${HORDER.map(k=>`<div class="hl" style="border-color:${HEALTH[k].c}"><span>${hChip(k)}</span><b>${cnt(k)}</b><small>items · ${fmtN(units(k))} units</small><small>${HEALTH[k].note}</small></div>`).join('')}</div>
   ${rows.some(c=>RECBAR[c.rec])?`<p class="sub" style="margin:16px 0 6px">CIC recommendation</p><div class="hbar sm" role="img" aria-label="Items by CIC recommendation">${Object.keys(RECBAR).map(k=>{const n=rows.filter(c=>c.rec===k).length;return n?`<i style="width:${n/rows.length*100}%;background:${RECBAR[k]}" data-tip="<b>${INVREC[k].label}</b>${n} items (${Math.round(n/rows.length*100)}%)"></i>`:'';}).join('')}</div><div class="hlegend" style="margin-top:8px">${Object.keys(RECBAR).map(k=>`<span class="hchip"><span class="hico" style="background:${RECBAR[k]}"></span>${INVREC[k].label} · ${rows.filter(c=>c.rec===k).length}</span>`).join('')}</div>`:''}
   <p class="sub" style="margin:16px 0 6px">Where the units sit</p><div class="hbar sm" role="img" aria-label="Units available by health">${HORDER.map(k=>hseg(units(k),avail||1,k,'units available')).join('')}</div></div>
   <div class="panel"><h3>Reorder watch</h3><p class="sub">Selling items at or below their reorder point, counting what is already on order.</p>
   ${reorder.length?`<div class="wrapc"><table class="mini"><thead><tr><th>Item</th><th class="r">Avail</th><th class="r">On order</th><th class="r">Reorder pt</th><th class="r">Months left</th></tr></thead><tbody>${reorder.slice(0,8).map(c=>`<tr><td>${link(c)}</td><td class="r" style="${c.A<=0?'color:var(--red-text);font-weight:800':''}">${fmtA(c)}</td><td class="r">${fmtN(c.onOrder)}</td><td class="r">${fmtN(c.reorderPt)}</td><td class="r">${c.ms===null?'—':c.ms.toFixed(1)}</td></tr>`).join('')}</tbody></table></div>${reorder.length>8?`<p class="hint">${reorder.length-8} more below their reorder point.</p>`:''}`:'<p class="sub">Nothing is below its reorder point.</p>'}</div></div>`;

  /* best and worst sellers */
  const live=rows;
  const top=rows.slice().sort((a,b)=>b.sold12-a.sold12).slice(0,10);
  const bottom=live.filter(c=>c.A>0&&c.h!=='fresh').sort((a,b)=>a.sold12-b.sold12||b.A-a.A).slice(0,10);
  const maxT=Math.max(1,...top.map(c=>c.sold12)), maxB=Math.max(1,...bottom.map(c=>c.A));
  html+=`<div class="panels"><div class="panel"><h3>Top 10 best sellers</h3><p class="sub">Units sold in the last 12 months, with the change on the year before.</p><div class="rows">${top.map((c,i)=>{const ch=pct(c.sold12,c.soldPrior);return `<div class="brow"><span class="rk">${i+1}</span><span class="nm">${hIco(c.h)}${link(c)}</span><span class="track"><i style="width:${c.sold12/maxT*100}%" data-tip="<b>${escT(c.name)}</b>${fmtN(c.sold12)} sold in 12 months · ${esc(fmtA(c))} available"></i></span><span class="val">${fmtN(c.sold12)}<small>${ch===null?'new':`<span class="delta ${ch<0?'dn':'up'}">${ch>0?'+':''}${ch}%</span>`}</small></span></div>`}).join('')}</div></div>
   <div class="panel"><h3>Bottom 10 sellers</h3><p class="sub">Active items with stock that sold the least. The bar is the stock still sitting.</p><div class="rows">${bottom.length?bottom.map((c,i)=>`<div class="brow"><span class="rk">${i+1}</span><span class="nm">${hIco(c.h)}${link(c)}</span><span class="track"><i style="width:${c.A/maxB*100}%;background:${HEALTH[c.h].c}" data-tip="<b>${escT(c.name)}</b>${fmtN(c.A)} available · ${fmtN(c.sold12)} sold in 12 months${c.ms!==null?' · '+(c.ms>24?(c.ms/12).toFixed(1)+' years':c.ms.toFixed(1)+' months')+' of stock':''}"></i></span><span class="val">${fmtN(c.A)} left<small>${fmtN(c.sold12)} sold</small></span></div>`).join(''):'<p class="sub">No active items with stock.</p>'}</div></div></div>`;

  /* sales vs stock map */
  html+=`<div class="panels"><div class="panel wide scatter"><h3>Sales vs. stock</h3><p class="sub">Each dot is one item. Right = sells faster; up = more months of stock on the shelf. Top-left is cash sitting still.</p>${scatterSVG(rows)}
   <div class="hlegend" style="margin-top:8px">${HORDER.map(k=>`<span class="hchip">${hIco(k)}${HEALTH[k].label} · ${cnt(k)}</span>`).join('')}</div></div></div>`;

  /* programs + categories */
  const pr=BRANDS.map(b=>({b,r:rows.filter(c=>c.brand===b.id)})).filter(x=>x.r.length);
  const maxP=Math.max(...pr.map(x=>x.r.length));
  const cats=[...new Set(rows.map(c=>c.category))].map(k=>({k,r:rows.filter(c=>c.category===k)})).map(x=>({...x,s:sum(x.r,c=>c.sold12),a:sum(x.r,c=>c.A)})).sort((a,b)=>b.s-a.s);
  const maxS=Math.max(1,...cats.map(x=>x.s)), maxA=Math.max(1,...cats.map(x=>x.a));
  html+=`<div class="panels"><div class="panel"><h3>By program</h3><p class="sub">SKU count split by health.</p><div>
   <div class="prow h"><span>Program</span><span class="bw">SKUs by health</span><span class="n">SKUs</span><span class="n">Avail</span><span class="n">Sold 12 mo</span></div>
   ${pr.map(({b,r})=>`<div class="prow"><span class="nm">${esc(b.short)}</span><span class="bw"><span class="hbar sm" style="width:${r.length/maxP*100}%">${HORDER.map(k=>hseg(r.filter(c=>c.h===k).length,r.length,k,'SKUs in '+esc(b.short))).join('')}</span></span><span class="n">${r.length}</span><span class="n">${fmtN(sum(r,c=>c.A))}</span><span class="n">${fmtN(sum(r,c=>c.sold12))}</span></div>`).join('')}</div></div>
   <div class="panel"><h3>By category</h3><p class="sub">What sells next to what sits. Each column has its own scale.</p><div>
   <div class="ccol h"><span>Category</span><span>Sold, 12 months</span><span>Units available</span></div>
   ${cats.map(x=>`<div class="ccol"><span class="nm" style="font-weight:800">${esc(x.k)} <small style="color:var(--muted);font-weight:600">${x.r.length}</small></span><span class="cell"><span class="track"><i style="width:${x.s/maxS*100}%" data-tip="<b>${escT(x.k)}</b>${fmtN(x.s)} sold in 12 months"></i></span><b>${fmtN(x.s)}</b></span><span class="cell"><span class="track alt"><i style="width:${x.a/maxA*100}%" data-tip="<b>${escT(x.k)}</b>${fmtN(x.a)} units available"></i></span><b>${fmtN(x.a)}</b></span></div>`).join('')}</div></div></div>`;

  /* newest and oldest: setup date when loaded, otherwise the store item number (higher = set up more recently) */
  const hasDate=rows.some(c=>c.added);
  const idn=c=>parseInt(String(c.id).replace(/\D/g,''),10)||0;
  const newest=rows.slice().sort((a,b)=>hasDate?String(b.added||'').localeCompare(String(a.added||'')):idn(b)-idn(a)).slice(0,8);
  const oldest=rows.slice().sort((a,b)=>hasDate?String(a.added||'9').localeCompare(String(b.added||'9')):idn(a)-idn(b)).slice(0,8);
  const ageRow=c=>{const a=ageOf(c.added);return `<tr><td>${link(c)}${c.relaunched?' <span class="chip" style="padding:1px 7px;font-size:10px">Relaunched</span>':c.isNew?' <span class="chip ok" style="padding:1px 7px;font-size:10px">New</span>':''}</td><td>${esc(brandOf(c.brand).short)}</td>${hasDate?`<td class="r">${fmtDay(c.added)}</td><td class="r">${a===null?'—':a<1/12?Math.max(1,Math.round(a*365.25))+' days':a<1?Math.round(a*12)+' mo':a.toFixed(1)+' yr'}</td>`:`<td class="r">${esc(c.id)}</td>`}<td class="r">${fmtN(c.sold12)}</td><td>${hChip(c.h)}</td></tr>`;};
  const tbl=list=>`<div class="wrapc"><table class="mini"><thead><tr><th>Item</th><th>Program</th>${hasDate?'<th class="r">Added</th><th class="r">Age</th>':'<th class="r">Item #</th>'}<th class="r">Sold 12 mo</th><th>Health</th></tr></thead><tbody>${list.map(ageRow).join('')}</tbody></table></div>`;
  const basis=hasDate?'':' Ordered by store item number (higher numbers were set up more recently).';
  html+=`<div class="panels"><div class="panel"><h3>Latest additions</h3><p class="sub">The 8 newest items by Titan setup date and how they are starting out.${basis}</p>${tbl(newest)}</div>
   <div class="panel"><h3>Oldest items</h3><p class="sub">The 8 longest-running items by Titan setup date. Old and stalled is a refresh candidate.${basis}</p>${tbl(oldest)}</div></div>`;

  $('#view').innerHTML=html; bindStats();
}
function scatterSVG(rows){
  const W=900,H=380,L=56,R=20,T=16,B=46,cap=24;
  const maxR=Math.max(1,...rows.map(c=>c.rate));
  const sx=v=>L+Math.sqrt(v/maxR)*(W-L-R), sy=v=>T+(1-Math.min(v,cap)/cap)*(H-T-B);
  const xt=[0,maxR*0.04,maxR*0.25,maxR].map(v=>Math.round(v)).filter((v,i,a)=>a.indexOf(v)===i);
  let g=`<rect x="${L}" y="${sy(cap)}" width="${W-L-R}" height="${sy(12)-sy(cap)}" fill="var(--h-crit)" opacity=".07"/><rect x="${L}" y="${sy(12)}" width="${W-L-R}" height="${sy(6)-sy(12)}" fill="var(--h-warn)" opacity=".09"/>`;
  g+=`<text class="zl" x="${W-R-6}" y="${sy(cap)+14}" text-anchor="end">12+ months of stock</text><text class="zl" x="${W-R-6}" y="${sy(12)+14}" text-anchor="end">6-12 months</text>`;
  [0,6,12,18,24].forEach(v=>{g+=`<line class="ax" x1="${L}" x2="${W-R}" y1="${sy(v)}" y2="${sy(v)}" opacity="${v?'.6':'1'}"/><text class="tk" x="${L-8}" y="${sy(v)+4}" text-anchor="end">${v===24?'24+':v}</text>`;});
  xt.forEach(v=>{g+=`<text class="tk" x="${sx(v)}" y="${H-B+18}" text-anchor="middle">${fmtN(v)}</text>`;});
  g+=`<text class="tk" x="${(L+W-R)/2}" y="${H-6}" text-anchor="middle">Units sold per month (last 90 days)</text><text class="tk" transform="translate(14 ${(T+H-B)/2}) rotate(-90)" text-anchor="middle">Months of stock</text>`;
  const order=['retiring','moving','slow','stalled'];
  rows.slice().sort((a,b)=>order.indexOf(a.h)-order.indexOf(b.h)).forEach(c=>{
    const ms=c.ms===null?cap:c.ms;
    g+=`<circle class="dot" cx="${sx(c.rate).toFixed(1)}" cy="${sy(ms).toFixed(1)}" r="6" fill="${HEALTH[c.h].c}" data-id="${c.sample?'':esc(c.id)}" data-tip="<b>${escT(c.name)}</b>${HEALTH[c.h].label} · ${fmtN(Math.round(c.rate))}/mo · ${c.ms===null?'no recent sales':(c.ms>24?(c.ms/12).toFixed(1)+' years':c.ms.toFixed(1)+' months')+' of stock'} · ${esc(fmtA(c))} available"/>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scatter of SKUs by monthly sales and months of stock">${g}</svg>`;
}
function bindStats(){
  $('#view').querySelectorAll('.pill[data-prog]').forEach(p=>p.onclick=()=>{current.statProg=p.dataset.prog; renderStats();});
  const t=$('#sampleTog'); if(t) t.onclick=()=>{current.statSample=current.statSample===false; renderStats();};
  $('#view').querySelectorAll('.dot[data-id]').forEach(d=>{ if(d.dataset.id) d.addEventListener('click',()=>{location.hash='#inv-'+d.dataset.id;}); });
}
/* one shared tooltip for every chart mark */
(()=>{ const tip=document.createElement('div'); tip.id='tip'; tip.setAttribute('role','tooltip'); document.body.appendChild(tip);
  const show=(e,el)=>{ tip.innerHTML=el.getAttribute('data-tip'); tip.classList.add('on'); const w=tip.offsetWidth,h=tip.offsetHeight; let x=e.clientX+14,y=e.clientY+14; if(x+w>innerWidth-8) x=e.clientX-w-14; if(y+h>innerHeight-8) y=e.clientY-h-14; tip.style.left=Math.max(8,x)+'px'; tip.style.top=Math.max(8,y)+'px'; };
  document.addEventListener('pointermove',e=>{ const el=e.target.closest&&e.target.closest('[data-tip]'); if(el) show(e,el); else tip.classList.remove('on'); });
  document.addEventListener('scroll',()=>tip.classList.remove('on'),{passive:true});
})();

/* ---------- decision summary ---------- */
function renderSummary(){
  const mode=current.sumMode||'current', isCur=mode==='current';
  const f=current.sumF||(current.sumF={brand:'all',status:'all'});
  const src=isCur?CURRENT:ITEMS, dmap=isCur?invDecisions:decisions, SMAP=isCur?INVDEC:SUGDEC;
  const rows=src.filter(i=>f.brand==='all'||(isCur&&f.brand==='sale'?i.rec==='sale':i.brand===f.brand)).map(i=>({i,d:dmap[i.id]||{}})).filter(r=>f.status==='all'||(f.status==='pending'?!r.d.status:r.d.status===f.status)).sort((a,b)=>(BRANDS.findIndex(x=>x.id===a.i.brand)-BRANDS.findIndex(x=>x.id===b.i.brand))||storeSort(a.i,b.i));
  const reviewed=src.filter(i=>dmap[i.id]&&dmap[i.id].status).length;
  const bn=i=>brandOf(i.brand).name;
  $('#view').innerHTML=`<div class="shead"><div><h2>Decision <em>summary</em></h2><p>${isCur?'Keep, sale, buyback and discontinue decisions on items in the store today':'Approve / decline decisions on new merchandise suggestions'} · ${reviewed} of ${src.length} reviewed</p></div>
  <div class="viewsw" role="group" aria-label="Choose summary"><a href="#summary" data-mode="current" ${isCur?'aria-current="page"':''}>Current Inventory</a><a href="#summary" data-mode="suggest" ${!isCur?'aria-current="page"':''}>Refresh Suggestions</a></div></div>
  <div class="toolbar"><select id="fBrand" aria-label="Program"><option value="all">All programs</option>${BRANDS.map(b=>`<option value="${b.id}" ${f.brand===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select>
  <select id="fStatus" aria-label="Decision"><option value="all">All decisions</option><option value="pending" ${f.status==='pending'?'selected':''}>Awaiting review</option>${Object.entries(SMAP).map(([v,s])=>`<option value="${v}" ${f.status===v?'selected':''}>${s.label}</option>`).join('')}</select>
  <button class="btn ghostbtn" id="copyCsv">Copy CSV</button><button class="btn ghostbtn" id="dlCsv" hidden>Download CSV</button><span class="status">${rows.length} item${rows.length===1?'':'s'}</span></div>
  <div class="tablewrap"><table><thead><tr><th>Program</th><th>Item</th><th>${isCur?'Store SKU':'Item #'}</th>${isCur?'<th>CIC recommendation</th>':''}<th>Decision</th>${isCur?'<th>Sale % / buyback</th>':''}<th>Notes</th><th>Reviewed by</th><th>Updated</th></tr></thead><tbody>
  ${rows.map(({i,d})=>`<tr><td>${esc(bn(i))}</td><td><a href="#${isCur?'inv-':'item-'}${esc(i.id)}">${esc(i.name)}</a></td><td>${esc(isCur?i.id:i.sku)}</td>${isCur?`<td><span class="chip ${INVREC[i.rec]?INVREC[i.rec].chip:''}">${INVREC[i.rec]?recL(i):esc(i.rec)}${i.rec==='sale'&&i.salePct?' · '+i.salePct+'% off':''}</span></td>`:''}<td>${decChip(d,SMAP)}</td>${isCur?`<td class="num">${d.status==='sale'&&d.salePct?d.salePct+'% off':d.status==='buyback'?fmtN(d.buybackUnits)+' units · $'+money(d.buybackValue||0):''}</td>`:''}<td style="max-width:320px">${esc(d.notes||'')}</td><td>${esc(d.reviewer||'')}</td><td class="num">${fmtDate(d.updatedAt)}</td></tr>`).join('')||`<tr><td colspan="${isCur?9:7}" style="text-align:center;color:var(--muted);padding:28px">No items yet. Decisions show here as soon as CIC loads products and the team starts reviewing.</td></tr>`}
  </tbody></table></div>`;
  $('#view').querySelectorAll('.viewsw a[data-mode]').forEach(a=>a.onclick=e=>{e.preventDefault(); current.sumMode=a.dataset.mode; current.sumF={brand:'all',status:'all'}; renderSummary();});
  $('#fBrand').onchange=e=>{f.brand=e.target.value; renderSummary();};
  $('#fStatus').onchange=e=>{f.status=e.target.value; renderSummary();};
  const csv=()=>{ const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"', lab=d=>d.status&&SMAP[d.status]?SMAP[d.status].label:'Awaiting review';
    const h=isCur?['Program','Item','Store SKU','CIC recommendation','CIC sale %','Decision','Sale %','Buyback units','Buyback value (store price)','Notes','Reviewed by','Updated']:['Program','Item','Item #','Color','Decision','Notes','Reviewed by','Updated'];
    return [h.join(','),...rows.map(({i,d})=>(isCur?[bn(i),i.name,i.id,INVREC[i.rec]?recL(i):i.rec,i.salePct||'',lab(d),d.status==='sale'?d.salePct:'',d.status==='buyback'?d.buybackUnits:'',d.status==='buyback'?d.buybackValue:'']:[bn(i),i.name,i.sku,i.color||'',lab(d)]).concat([d.notes||'',d.reviewer||'',d.updatedAt||'']).map(q).join(','))].join('\r\n'); };
  $('#copyCsv').onclick=async()=>{ const t=csv(); try{ await navigator.clipboard.writeText(t); toast('CSV copied'); }catch(e){ const ta=document.createElement('textarea'); ta.value=t; ta.style.cssText='position:fixed;inset:20% 10%;z-index:99'; document.body.appendChild(ta); ta.select(); toast('Select and copy the text'); setTimeout(()=>ta.remove(),8000); } };
  if(downloadsApi){ const bt=$('#dlCsv'); bt.hidden=false; bt.onclick=async()=>{ try{ await downloadsApi.save({filename:isCur?'MOV_Current_Inventory_Decisions.csv':'MOV_Merch_Decisions.csv',data:csv()}); toast('CSV ready'); }catch(e){ if(e&&e.code!=='cancelled') toast('Download not available'); } }; }
}

/* ---------- boot ---------- */
try{ myName=localStorage.getItem('mov-reviewer')||''; }catch(e){}
$('#q').addEventListener('input',e=>{ searchQ=e.target.value.trim().toLowerCase(); const h=location.hash.slice(1)||'mm-current'; if(h==='summary'||h==='stats'||h.startsWith('inv-')||h.startsWith('item-')) return; const b=brandOf(current.brand); if(current.mode==='current') renderCurrent(b); else renderSuggest(b); });
route();
(async()=>{
  try{
    const [d,u,dl]=await Promise.all([claude.use('db'),claude.use('user'),claude.use('downloads')]);
    db=d; userApi=u; downloadsApi=dl; dbReady=true;
    if(u){ try{ const w=await u.can('data.write'); canWrite=(w===null?null:!!w); if(!myName){ const me=await u.me(); if(me&&me.name) myName=me.name; } }catch(e){} }
    const refresh=()=>{ renderProgress(); const h=location.hash.slice(1)||'mm-current'; if(h==='summary') renderSummary(); else if(h==='stats') renderStats(); else if((h.startsWith('inv-')||h.startsWith('item-'))&&current.draft&&(current.draft.notes||current.draft.status)) return; else route(true); };
    if(db){
      db.collection('invdecisions').onSnapshot(s=>{ for(const ch of s.docChanges()){ if(ch.type==='removed') delete invDecisions[ch.doc.id]; else invDecisions[ch.doc.id]=ch.doc.data(); } refresh(); }, err=>console.error('invdecisions',err));
      db.collection('inventory').onSnapshot(s=>{ let n=0; for(const ch of s.docChanges()){ if(ch.type==='removed') continue; const c=CURRENT.find(x=>x.id===ch.doc.id), v=ch.doc.data(); if(!c||!Array.isArray(v.skus)) continue;
          v.skus.forEach(u=>{ const k=c.skus.find(s=>s[0]===u[0]); if(k){ k[2]=u[1];k[3]=u[2];k[4]=u[3];k[5]=u[4];k[6]=u[5];k[7]=u[6];k[9]=u[7];k[10]=u[8];k[11]=u[9]; } }); score(c); n++; }
        if(n) refresh(); }, err=>console.error('inventory',err));
      db.doc('meta/inventory').onSnapshot(s=>{ const v=s.exists?s.data():null; if(v&&v.asof){ INV_ASOF='Titan data as of '+v.asof+', refreshed daily. Sales = booked units for the last 12 months, prior 12 months and last 90 days.'; refresh(); } }, err=>console.error('meta',err));
      db.collection('decisions').onSnapshot(s=>{ for(const ch of s.docChanges()){ if(ch.type==='removed') delete decisions[ch.doc.id]; else decisions[ch.doc.id]=ch.doc.data(); } refresh(); }, err=>console.error('decisions',err));
    }
    updateWriteNotice(); const r=$('#reviewer'); if(r&&!r.value&&myName) r.value=myName;
    if(location.hash==='#summary') renderSummary();
  }catch(e){ console.error(e); dbReady=true; updateWriteNotice(); }
})();
