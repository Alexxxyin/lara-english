// 雲端（Firebase）：許願池審核、自動備份進度。
// - 網頁開好之後才在背景載入，載入失敗或沒網路時，網站照常用，只是先不同步。
// - Lara 的手機用「匿名登入」，第一次連上會送出「連線要求」，Alex 在審核頁按允許後才能寫資料。
// - 權限由 Firestore 規則把關（見 工具/firestore.rules），不是靠網頁。
(function () {
  'use strict';
  const BASE = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const FAM = 'family/lara';
  let H = null, db = null, auth = null, uid = '', state = 'off', started = false;
  let backupT = null, cloudMeta = null, busy = false;
  const listeners = [];
  // state：off 沒開／loading 連線中／waiting 等 Alex 允許／ok 已連上／error 連不上／admin 這是 Alex 的登入
  const C = window.LaraCloud = {
    get state() { return state; },
    get meta() { return cloudMeta; },
    onChange(f) { listeners.push(f); },
    init, dirty, flush, refresh, syncWishes, deleteWish, markRedeemed, fetchBackup
  };
  function set(s) { state = s; listeners.forEach(f => { try { f(s); } catch (e) {} }); }
  const ts = () => firebase.firestore.FieldValue.serverTimestamp();
  function loadJs(src) {
    return new Promise((ok, no) => { const s = document.createElement('script'); s.src = BASE + src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  }
  function device() {
    const u = navigator.userAgent;
    return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android 手機' : /Mac/.test(u) ? 'Mac 電腦' : '其他裝置';
  }

  async function init(hooks) {
    H = hooks;
    if (started || !window.FIREBASE_CONFIG || /selftest/.test(location.search)) return;
    // Alex 電腦上的本機測試版不連雲端（免得一直出現「Mac 電腦想連線」）；要測雲端時在網址加 ?cloud
    if (/^(localhost|127\.0\.0\.1|192\.168\.)/.test(location.hostname) && !/[?&]cloud/.test(location.search)) return;
    started = true; set('loading');
    try {
      await loadJs('firebase-app-compat.js');
      await Promise.all([loadJs('firebase-auth-compat.js'), loadJs('firebase-firestore-compat.js')]);
      if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
      auth = firebase.auth(); db = firebase.firestore();
      let user = await new Promise(r => { const off = auth.onAuthStateChanged(u => { off(); r(u); }); });
      if (user && !user.isAnonymous) { set('admin'); return; } // 這支是 Alex 登入過審核頁的手機，不當成 Lara
      if (!user) user = (await auth.signInAnonymously()).user;
      uid = user.uid;
      await check();
    } catch (e) { console.warn('[cloud]', e); set('error'); }
  }

  // 看這支手機是不是 Alex 允許過的；不是的話送出連線要求
  async function check() {
    let member = false;
    try {
      const d = await db.doc(FAM).get();
      member = d.exists && (d.data().members || []).includes(uid);
    } catch (e) {
      if (e && e.code === 'unavailable') { set('error'); return; }
    }
    if (!member) {
      try { await db.doc(FAM + '/requests/' + uid).set({ at: ts(), device: device() }); set('waiting'); }
      catch (e) { set('error'); }
      return;
    }
    set('ok');
    await syncWishes();
    await fetchMeta();
    dirty(3000);
  }
  // 切回 App 時：還在等允許就再看一次；已連上就同步願望
  async function refresh() {
    if (busy || !db || !uid) return;
    busy = true;
    try { if (state === 'waiting' || state === 'error') await check(); else if (state === 'ok') await syncWishes(); }
    finally { busy = false; }
  }

  // ---- 許願池 ----
  async function syncWishes() {
    if (state !== 'ok') return;
    const S = H.get(); const list = S.wishes || []; let changed = false;
    for (const w of list) {
      if (w.up || w.status !== 'pending') continue;
      try { await db.doc(FAM + '/wishes/' + w.id).set({ name: w.name, cost: w.cost, status: 'pending', at: ts(), by: uid }); w.up = 1; changed = true; } catch (e) {}
    }
    const news = [];
    try {
      const snap = await db.collection(FAM + '/wishes').get();
      snap.forEach(d => {
        const w = list.find(x => x.id === d.id); if (!w) return;
        const c = d.data(), note = c.note || '';
        if (c.status === w.status && c.cost === w.cost && note === (w.note || '')) return;
        if (w.status === 'pending' && c.status !== 'pending') news.push(w);
        w.status = c.status; w.cost = c.cost; w.note = note; changed = true;
      });
    } catch (e) {}
    if (changed) H.save();
    if (changed) H.changed(news);
  }
  function deleteWish(id) { if (state === 'ok') db.doc(FAM + '/wishes/' + id).delete().catch(() => {}); }
  function markRedeemed(id) { if (state === 'ok') db.doc(FAM + '/wishes/' + id).update({ redeemedAt: ts() }).catch(() => {}); }

  // ---- 自動備份 ----
  const knownOf = S => Object.values(S.words || {}).filter(w => w && w.known).length;
  async function fetchMeta() {
    try {
      const d = await db.doc(FAM + '/backup/latest').get();
      if (d.exists) { const x = d.data(); cloudMeta = { fish: x.fish || 0, known: x.known || 0, at: x.at ? x.at.toMillis() : 0 }; }
    } catch (e) {}
  }
  function dirty(ms) { if (state !== 'ok') return; clearTimeout(backupT); backupT = setTimeout(backup, ms == null ? 15000 : ms); }
  function flush() { if (state === 'ok' && backupT) { clearTimeout(backupT); backupT = null; backup(); } }
  async function backup() {
    backupT = null;
    const S = H.get(), known = knownOf(S);
    // 保護：雲端的進度明顯比較多、手機這邊幾乎是空的（資料被清掉）→ 不要蓋掉雲端，讓 Lara 去設定拿回來
    if (cloudMeta && cloudMeta.known >= 10 && known < cloudMeta.known / 2) { H.cloudNewer(cloudMeta); return; }
    try {
      await db.doc(FAM + '/backup/latest').set({ data: JSON.stringify(S), at: ts(), fish: S.fish || 0, known, by: uid, ver: H.version });
      cloudMeta = { fish: S.fish || 0, known, at: Date.now() };
      H.backedUp(Date.now());
    } catch (e) {}
  }
  async function fetchBackup() {
    const d = await db.doc(FAM + '/backup/latest').get();
    if (!d.exists) return null;
    return JSON.parse(d.data().data);
  }
})();
