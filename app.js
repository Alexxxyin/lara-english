// Lara 的英文學習網站：單頁程式，進度存在手機本機（localStorage）。
(function () {
  'use strict';
  const KEY = 'lara-english-v1';
  // 網站版本：每次更新要同時改這裡和 version.json（數字一樣），手機才會自動換新版
  const APP_VERSION = 39;
  const DAY = 86400000;
  const INTERVAL = [0, 1, 2, 4, 7, 15]; // 答對後隔幾天再出現（依熟練程度）
  const ROUND = 10;

  let UNITS = [], WORDS = {}, SENT = {}, DIALOGUES = [], KK = {}, DICT = {};
  let S; // 存檔
  const view = document.getElementById('view');
  const nav = document.getElementById('nav');

  // ---------- 存檔 ----------
  function blank() {
    return { v: 1, words: {}, fish: 0, streak: { last: '', count: 0 }, doneUnits: [], rewards: [], redeemed: [], settings: { rate: 0.9, voice: '', sound: true, music: true } };
  }
  function load() {
    try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = blank(); }
    S.settings = Object.assign(blank().settings, S.settings || {});
    if (!S.firstUse) { S.firstUse = Date.now(); save(); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function W(f) { return S.words[f] || (S.words[f] = { box: 0, due: 0, miss: 0, right: 0, known: false }); }

  function today(d) { const x = d ? new Date(d) : new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
  function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }

  // 每天第一次練習時更新連續天數，回傳是否該放特效
  function touchDay() {
    const t = today();
    if (S.streak.last === t) return false;
    const y = today(Date.now() - DAY);
    S.streak.count = S.streak.last === y ? S.streak.count + 1 : 1;
    S.streak.last = t;
    save();
    return S.streak.count >= 2;
  }
  function streakNow() {
    const t = today(), y = today(Date.now() - DAY);
    return (S.streak.last === t || S.streak.last === y) ? S.streak.count : 0;
  }

  function record(f, ok) {
    const w = W(f);
    if (ok) {
      w.right++; w.known = true;
      w.box = Math.min(w.box + 1, 5);
      w.due = startOfToday() + INTERVAL[w.box] * DAY;
    } else {
      w.miss++; w.box = 0; w.due = Date.now();
    }
    w.last = Date.now();
    save();
    dayFx();
  }
  // 今天第一次練習：更新連續天數，連續 2 天以上就放特效
  function dayFx() {
    if (touchDay()) setTimeout(() => { FX.visual('streak', null, document.querySelector('[data-streak]') || document.body, S.streak.count); if (S.settings.sound) FX.sound('complete'); }, 600);
  }
  // 練習中答對的小魚乾先記著，結算畫面再一次放進碗裡
  // ---------- 收藏與解鎖 ----------
  // 用「學會幾個字、學完幾個單元」解鎖，不花小魚乾（小魚乾留給 Lara 換真實獎勵）
  const ROOMS = [
    { id: 'a', name: '粉紅客廳', need: 0 },
    { id: 'b', name: '淡紫臥室', need: 30 },
    { id: 'c', name: '小咖啡廳', need: 80 },
    { id: 'd', name: '薄荷廚房', need: 150 },
    { id: 'e', name: '陽台花園', need: 220 }
  ];
  const CAT_BASE = ['wave', 'yawn', 'tilt', 'groom', 'sleep']; // 一開始就有
  const CAT_UNLOCK = ['roll', 'butterfly', 'belly', 'pawsup', 'stretch', 'tail', 'knead', 'yarn', 'fish', 'scratch']; // 每學完一個單元解鎖一個
  function knownTotal() { return Object.keys(WORDS).filter(f => S.words[f] && S.words[f].known).length; }
  function unitsDone() { return UNITS.filter(unitDone).length; }
  function catsUnlocked() { return CAT_BASE.concat(CAT_UNLOCK.slice(0, unitsDone())); }
  function roomsUnlocked() { const k = knownTotal(); return ROOMS.filter(r => k >= r.need).map(r => r.id); }
  function syncCats() { window.CAT_READY = catsUnlocked(); }
  function roomNow() {
    const q = (location.search.match(/room=([a-e])/) || [])[1];
    if (q) return q;
    return roomsUnlocked().includes(S.room) ? S.room : 'a';
  }
  // 找出剛解鎖、還沒告訴 Lara 的東西
  function newUnlocks() {
    S.seen = S.seen || { cats: CAT_BASE.slice(), rooms: ['a'] };
    const c = catsUnlocked().filter(x => !S.seen.cats.includes(x));
    const r = roomsUnlocked().filter(x => !S.seen.rooms.includes(x));
    S.seen.cats.push(...c); S.seen.rooms.push(...r);
    return { cats: c, rooms: r };
  }
  let earned = 0;
  function earn(n) { earned += n; }
  function addFish(n, fromEl) {
    S.fish += n; save();
    const badge = document.querySelector('[data-fish]');
    if (badge) { const c = badge.querySelector('[data-count]'); if (c) { c.dataset.count = S.fish; c.textContent = S.fish; } }
    if (fromEl) FX.visual('fish', null, fromEl, badge, n);
  }

  // 錯題本：答錯過、還沒練熟的字
  function weakList() { return Object.keys(S.words).filter(f => WORDS[f] && (S.words[f].miss > 0 || S.words[f].unsure > 0) && S.words[f].box < 4); }
  function dueList() { const now = Date.now(); return weakList().filter(f => S.words[f].due <= now); }

  function unitOf(id) { return UNITS.find(u => u.id === id); }
  function knownCount(u) { return u.words.filter(w => S.words[w.f] && S.words[w.f].known).length; }
  function unitDone(u) { return knownCount(u) === u.words.length; }
  function currentUnit() { return UNITS.find(u => !unitDone(u)) || UNITS[UNITS.length - 1]; }
  function unitLabel(u) { return u.id[0] === 'd' ? '情境對話' + (u.id === 'd1' ? '①' : '②') : u.id; }
  function isDlg(u) { return u.id[0] === 'd'; }

  // 檢查單元是否剛完成，完成就發獎勵
  function checkUnitDone(u, el) {
    if (unitDone(u) && !S.doneUnits.includes(u.id)) {
      S.doneUnits.push(u.id); save();
      return true;
    }
    return false;
  }

  // ---------- 小工具 ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const img = f => `img/words/${f}.webp`;
  const kk = f => (KK[f] && KK[f].kk) || '';
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function pickOthers(f, pool, n) {
    const others = pool.filter(x => x !== f && WORDS[x].en.toLowerCase() !== WORDS[f].en.toLowerCase());
    const all = others.length >= n ? others : others.concat(Object.keys(WORDS).filter(x => x !== f && !others.includes(x)));
    return shuffle(all).slice(0, n);
  }
  function answers(f) { return WORDS[f].en.split('/').map(s => s.trim()); }
  function norm(s) { return String(s).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function sentenceFor(f) { return SENT[f] || null; }
  function keyOf(f) { const s = SENT[f]; return (s && s.key) || answers(f)[0]; }
  // 在句子裡找到這個字，回傳 [開始, 結束]；結束會延伸到整個單字（例如複數 s）
  function findKey(text, key) {
    const i = text.toLowerCase().indexOf(key.toLowerCase());
    if (i < 0) return null;
    let j = i + key.length;
    while (j < text.length && /[a-zA-Z]/.test(text[j])) j++;
    return [i, j];
  }
  function markIn(text, key) {
    const r = findKey(text, key);
    if (!r) return esc(text);
    return esc(text.slice(0, r[0])) + '<mark>' + esc(text.slice(r[0], r[1])) + '</mark>' + esc(text.slice(r[1]));
  }
  // 例句 → 每個單字都可以點（target 是這張卡的單字範圍，點了顯示單字卡本身的資料）
  const TOKEN = /[A-Za-zÀ-ÿ]+(?:['’][A-Za-z]+)?(?:-[A-Za-z]+)*/g;
  function tapWords(text, f) {
    const r = f ? findKey(text, keyOf(f)) : null;
    let out = '', last = 0, m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(text))) {
      out += esc(text.slice(last, m.index));
      const inTarget = r && m.index >= r[0] && m.index < r[1];
      out += `<span class="tw${inTarget ? ' target' : ''}" data-w="${esc(m[0].toLowerCase().replace('’', "'"))}"${inTarget ? ` data-f="${esc(f)}"` : ''}>${esc(m[0])}</span>`;
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }
  // 點單字跳出小卡：中文、英文、音標、發音、詞性
  function wordSheet(key, f, el) {
    const d = DICT[key] || {};
    let head, kkTxt, pos, zh, note = d.note || '', speak, pic = '';
    if (f && WORDS[f]) {
      const w = WORDS[f];
      head = w.en; kkTxt = kk(f) || d.kk || ''; zh = w.zh; speak = answers(f)[0];
      pos = w.en.trim().includes(' ') ? '片語' : (d.pos || ''); note = '這張卡的單字'; pic = img(f);
    } else {
      // 標題顯示點到的那個字本身（點 best 就顯示 best），原形寫在說明裡
      head = (d.w && d.w.toLowerCase() === key) ? d.w : (el ? el.textContent : key); kkTxt = d.kk || ''; pos = d.pos || ''; zh = d.zh || '（字典裡還沒有這個字）'; speak = key;
    }
    document.querySelectorAll('.tw.on').forEach(x => x.classList.remove('on'));
    if (el) el.classList.add('on');
    const m = document.createElement('div'); m.className = 'word-sheet';
    m.innerHTML = `<div class="ws">
      <div class="ws-head">${pic ? `<img src="${pic}" alt="">` : ''}<span class="t"><b>${esc(head)}</b>${kkTxt ? `<span class="kk">${esc(kkTxt)}</span>` : ''}</span></div>
      <div class="ws-row">${pos ? `<span class="ws-pos">${esc(pos)}</span>` : ''}<span class="ws-zh">${esc(zh)}</span></div>
      ${note ? `<span class="ws-note">${esc(note)}</span>` : ''}
      <div class="ws-btns"><button class="btn" data-ws="play" data-own-sound>播放</button><button class="btn ghost" data-ws="slow" data-own-sound>慢速</button><button class="btn soft" data-ws="close">關閉</button></div>
    </div>`;
    const close = () => { m.remove(); if (el) el.classList.remove('on'); };
    m.onclick = e => { if (e.target === m) close(); };
    m.querySelector('[data-ws="play"]').onclick = () => say(speak, false, true);
    m.querySelector('[data-ws="slow"]').onclick = () => say(speak, true, true);
    m.querySelector('[data-ws="close"]').onclick = close;
    document.body.appendChild(m);
    say(speak, false, true);
  }
  function bindTapWords(root) {
    (root || view).querySelectorAll('.tw').forEach(t => t.onclick = e => { e.stopPropagation(); wordSheet(t.dataset.w, t.dataset.f, t); });
  }
  // ---------- 備份 ----------
  const BACKUP_DAYS = 3; // Alex 2026-11-27：每 3 天提醒一次
  async function backupNow() {
    const name = 'lara-english-backup-' + today() + '.json';
    const text = JSON.stringify(S, null, 1);
    let ok = false;
    try {
      const file = new File([text], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Lara 英文備份' });
        ok = true;
      }
    } catch (e) { if (e && e.name === 'AbortError') return false; }
    if (!ok) {
      const blob = new Blob([text], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
    }
    S.lastBackup = Date.now(); S.backupSnooze = 0; save();
    toast('備份好了');
    return true;
  }
  // 要不要在首頁提醒：有在學、而且離上次備份（或開始用）超過 3 天、也沒有按「之後再說」
  function needBackup() {
    const learned = Object.keys(S.words).length > 0;
    const since = S.lastBackup || S.firstUse || Date.now();
    return learned && Date.now() - since > BACKUP_DAYS * DAY && Date.now() > (S.backupSnooze || 0);
  }
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
  }
  function snd(kind) { if (S.settings.sound) FX.sound(kind); }
  function syncSound() { window.FX_SOUND_ON = !!S.settings.sound; }

  // ---------- 發音 ----------
  let voices = [];
  // Mac／iPhone 內建的搞怪語音（機器人、唱歌、耳語⋯），不能拿來教發音
  const ODD_VOICES = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Eddy|Flo|Fred|Good News|Grandma|Grandpa|Jester|Junior|Kathy|Organ|Ralph|Reed|Rocko|Sandy|Shelley|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/i;
  function loadVoices() { voices = (window.speechSynthesis ? speechSynthesis.getVoices() : []).filter(v => /^en(-|_)/i.test(v.lang) && !ODD_VOICES.test(v.name)); }
  const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // iPhone 上「列出來但沒下載」的語音會沒聲音，所以只有 Lara 在設定裡自己選過才指定語音，
  // 否則交給手機用預設的英文語音。
  function pickVoice() {
    loadVoices(); // 每次都重新拿語音清單：iPhone 有時會換掉，用舊的語音物件可能沒聲音
    if (S.settings.voice) { const v = voices.find(v => v.name === S.settings.voice); if (v) return v; }
    const us = voices.filter(v => /en(-|_)US/i.test(v.lang));
    const by = re => us.find(v => re.test(v.name) && v.localService !== false);
    // iPhone 只用一定有裝的 Samantha（選到沒下載的語音會沒聲音）；電腦優先用高音質的自然女聲
    if (IS_IOS) return by(/^Samantha/) || null;
    return by(/^Ava/) || by(/^Zoe/) || by(/^Samantha/) || us.find(v => /Google US English/.test(v.name)) || us.find(v => v.localService) || null;
  }
  function defaultVoiceName() {
    const us = voices.filter(v => /en(-|_)US/i.test(v.lang));
    const d = us.find(v => v.default) || us[0] || voices[0];
    return d ? d.name : '';
  }

  // 發音紀錄：最近 15 筆，設定頁「聲音測試」看得到，用來找 iPhone 偶爾沒聲音的原因
  const sayLog = [];
  function slog(m) { const t = new Date(); sayLog.push(`${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}.${String(t.getMilliseconds()).padStart(3, '0').slice(0, 1)} ${m}`); if (sayLog.length > 15) sayLog.shift(); }

  let sayTimer = null, autoT = null, current = null;
  // 自動唸（換卡、出題時），排在計時器裡；Lara 自己按發音時會被取消，不會蓋掉她要聽的
  function autoSay(text, ms) { clearTimeout(autoT); autoT = setTimeout(() => say(text), ms); }

  // 真正叫手機唸。retry：第一次完全沒反應時，不指定語音再試一次（只試一次）
  function speakNow(text, slow, retry) {
    const s = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(slow ? String(text).split(/\s+/).join(', ') : text);
    u.lang = 'en-US';
    const v = retry ? null : pickVoice(); if (v) u.voice = v;
    u.rate = slow ? 0.4 : S.settings.rate;
    u.volume = 1;
    // 一定要留住這個物件：iPhone 會把沒人參照的句子回收掉，唸到一半就斷或根本不唸
    const job = { u, text, slow, started: false, ended: false };
    current = job;
    u.onstart = () => { job.started = true; slog('開始 ' + text); };
    u.onend = () => { job.ended = true; if (current === job) current = null; };
    u.onerror = e => { job.ended = true; slog('錯誤 ' + (e.error || '') + ' ' + text); if (current === job) current = null; };
    if (s.paused) s.resume();
    s.speak(u);
    slog((retry ? '重試 ' : '唸 ') + text + (v ? ' / ' + v.name : ' / 預設語音'));
    // 1.5 秒內完全沒開始也沒結束、手機也沒在唸 → 卡住了，清掉重唸一次
    if (!retry) setTimeout(() => {
      if (current === job && !job.started && !job.ended && !s.speaking) { slog('沒反應，清掉重唸'); s.cancel(); setTimeout(() => speakNow(text, slow, true), 80); }
    }, 1500);
  }

  // now：Lara 自己按播放／慢速／點圖時傳 true
  function say(text, slow, now) {
    try {
      const s = window.speechSynthesis; if (!s) return;
      clearTimeout(sayTimer);
      if (now) clearTimeout(autoT);
      // 正在唸同一個字、同樣速度 → 讓它唸完就好，不要停掉重來（停掉馬上重唸，iPhone 常常會吃掉）
      if (current && current.text === text && !!current.slow === !!slow && s.speaking && !current.ended) { slog('同一句正在唸，不重來 ' + text); return; }
      const busy = s.speaking || s.pending;
      // 佇列卡住（有排隊、卻沒在唸）也先清掉
      if (busy) s.cancel();
      // 自己按的：沒東西在唸就當下立刻唸；有東西在唸就先停，隔 60 毫秒再唸（同一瞬間停又唸會被吃掉）
      // 自動唸的：等音效過去再唸
      const wait = now ? (busy ? 60 : 0) : Math.max(busy ? 120 : 0, (FX.busyUntil || 0) - Date.now());
      if (wait) sayTimer = setTimeout(() => speakNow(text, slow), wait); else speakNow(text, slow);
    } catch (e) { slog('例外 ' + e.message); }
  }
  // 第一次碰螢幕時，在使用者手勢裡先唸一個聽不到的短字，iPhone 之後才會讓程式自動出聲
  let speechUnlocked = false;
  // 第一下就點了會唸東西的按鈕（單字圖、播放、慢速、例句單字⋯）：那個發音本身就能解鎖，不另外插一個字
  const SPEAKS = '[data-say], #p1, #p2, #ps, #lp, #ls, [data-line], .tw, [data-ws], #sndtest button, #tv';
  function unlockSpeech(e) {
    try {
      const s = window.speechSynthesis; if (!s || speechUnlocked) return;
      if (e && e.target && e.target.closest && e.target.closest(SPEAKS)) { speechUnlocked = true; return; }
      if (s.speaking || s.pending) return;
      speechUnlocked = true;
      const u = new SpeechSynthesisUtterance('a'); u.volume = 0; u.rate = 2; u.lang = 'en-US';
      window.__unlockUtt = u; // 留住物件，避免被回收後卡住佇列
      s.speak(u);
    } catch (e) {}
  }
  if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; setTimeout(loadVoices, 500); setTimeout(loadVoices, 1500); }

  // ---------- 畫面框架 ----------
  function setNav(on) {
    if (!on) { nav.hidden = true; return; }
    nav.hidden = false;
    nav.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.tab === on));
  }
  let cats = [];
  function addCat(el, opts) { if (el && window.CatPlayer) cats.push(CatPlayer(el, opts)); }
  function render(html, tab, full) {
    cats.forEach(c => c.stop()); cats = [];
    syncCats();
    view.innerHTML = `<div class="page${full ? ' full' : ''}">${html}</div>`;
    setNav(tab);
    window.scrollTo(0, 0);
  }
  function go(hash) { location.hash = hash; }
  function topBar(title, count, backTo) {
    return `<div class="top"><button class="back" data-back="${esc(backTo || '')}">返回</button><span class="title">${esc(title)}</span><span class="count">${count || ''}</span></div>`;
  }
  function bindBack(backTo) {
    const b = view.querySelector('[data-back]');
    if (b) b.onclick = () => { if (window.speechSynthesis) speechSynthesis.cancel(); stopMic(); go(b.dataset.back || backTo || '#home'); };
  }
  function ringSvg(done, total) {
    const C = 2 * Math.PI * 42, k = total ? done / total : 0;
    return `<svg viewBox="0 0 100 100" width="92" height="92" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="none" stroke="#FFE4EE" stroke-width="10"/>${k > 0 ? `<circle cx="50" cy="50" r="42" fill="none" stroke="#EC6A98" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(C * k).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/>` : ''}</svg>`;
  }
  function greet() { const h = new Date().getHours(); return h < 11 ? '早安' : h < 18 ? '午安' : '晚安'; }

  // ---------- 首頁 ----------
  function pageHome() {
    const u = currentUnit(), k = knownCount(u), n = u.words.length;
    const doneN = UNITS.filter(unitDone).length;
    const due = dueList().length, st = streakNow();
    const fillName = isDlg(u) ? '情境對話' : '例句填空';
    render(`
      <div class="hello2">
        <h1>${greet()}，Lara</h1><p class="muted" style="font-size:14px">今天也來學一點英文</p>
      </div>
      <div class="home-chips">
        <button class="chip-btn streak" data-streak id="streakBtn"><b>${st}</b><span>連續天數</span></button>
        <button class="chip-btn fish" data-fish data-go="#collect/bowl"><span class="chip-top"><img src="img/fish/fish.webp" alt=""><b data-count="${S.fish}">${S.fish}</b></span><span>小魚乾</span></button>
        <button class="chip-btn set" data-go="#settings">${hasNewLog() ? '<span class="bang">!</span>' : ''}<b>設定</b><span>${hasNewLog() ? '有新的更新' : '聲音、備份'}</span></button>
      </div>
      <div class="hero">
        <div class="txt">
          <span class="k">繼續學習・單元 ${esc(unitLabel(u))}</span>
          <h2>${esc(u.zh)}</h2>
          <span class="s">${esc(u.en)}・${n} 個單字</span>
          <button class="go" data-go="#flash/${u.id}">繼續學習</button>
        </div>
        <div class="cat" id="heroCat"><div class="cat-say" id="catSay"></div></div>
      </div>
      <div class="card prog">
        <div class="ring">${ringSvg(k, n)}<div class="c"><b>${k}<small>/${n}</small></b><span>這個單元</span></div></div>
        <div style="flex-grow:1;display:flex;flex-direction:column;gap:8px">
          <b style="font-size:15px;font-weight:900">第 1 章進度</b>
          <div class="bar" style="height:10px"><div style="width:${doneN * 10}%"></div></div>
          <span style="font-size:12px;font-weight:800;color:var(--primary-ink)">學完 ${doneN} / 10 個單元${doneN < 10 ? '，慢慢來就好' : '，太厲害了'}</span>
        </div>
      </div>
      <h3 style="font-size:17px;font-weight:900">練習方式</h3>
      <div class="grid3">
        <button class="tile" style="background:#FFE4EE" data-go="#flash/${u.id}"><b>單字卡</b><span>聽發音、翻面</span></button>
        <button class="tile" style="background:#E2EEFF" data-go="#quiz/${u.id}"><b>翻字測驗</b><span>看中文選英文</span></button>
        <button class="tile" style="background:#FFEEDD" data-go="#listen/${u.id}"><b>聽音測驗</b><span>聽聲音選圖</span></button>
        <button class="tile" style="background:#E2F5EC" data-go="#spell/${u.id}"><b>拼字測驗</b><span>自己打出來</span></button>
        <button class="tile" style="background:#FCE6EE" data-go="#speak/${u.id}"><b>口說跟讀</b><span>唸給手機聽</span></button>
        <button class="tile" style="background:#FFF4CC" data-go="#fill/${u.id}"><b>${fillName}</b><span>${isDlg(u) ? '在餐廳說說看' : '把字放進句子'}</span></button>
      </div>
      ${needBackup() ? `<div class="card backup-card">
        <div><b>該備份囉</b><p>${S.lastBackup ? `上次備份是 ${Math.floor((Date.now() - S.lastBackup) / DAY)} 天前` : '還沒備份過'}。按「現在備份」，選 <b class="hl">LINE</b>，傳給自己就好。換手機或進度不見時，在 LINE 點開那個檔案，再到「設定 → 匯入備份」就能找回來。</p></div>
        <div class="backup-btns"><button class="btn soft small" id="bkLater">之後再說</button><button class="btn small" id="bkNow">現在備份</button></div>
      </div>` : ''}
      <div class="card row-card">
        <div><b style="font-size:15px;font-weight:900">錯題本</b><p class="muted" style="font-size:12px;margin-top:2px">${due ? `有 ${due} 個字該複習了` : weakList().length ? '今天沒有要複習的字' : '還沒有答錯的字'}</p></div>
        <button class="btn small" style="background:var(--warm-bg);color:var(--warm)" data-go="#review">去看看</button>
      </div>
    `, 'home');
    bindGo();
    addCat(view.querySelector('#heroCat'));
    const sb = view.querySelector('#streakBtn'); if (sb) sb.onclick = () => toast(st ? `已經連續學習 ${st} 天了，好棒！` : '今天學一點，就會開始累積天數喔');
    // 點貓咪：頭上出現手寫小字（iPhone 剛打開時要點幾下才會喵，先告訴 Lara）
    const catCv = view.querySelector('#heroCat canvas'), bubble = view.querySelector('#catSay');
    if (catCv && bubble) catCv.addEventListener('click', () => {
      catTaps++;
      if (catTaps <= CAT_HINTS.length) bubble.textContent = CAT_HINTS[catTaps - 1];
      else { let j; do { j = Math.floor(Math.random() * CAT_LINES.length); } while (j === lastLine && CAT_LINES.length > 1); lastLine = j; bubble.textContent = CAT_LINES[j]; }
      bubble.classList.remove('show'); void bubble.offsetWidth; bubble.classList.add('show');
      clearTimeout(bubble.__t); bubble.__t = setTimeout(() => bubble.classList.remove('show'), 2400);
    });
    const bn = view.querySelector('#bkNow'); if (bn) bn.onclick = async () => { if (await backupNow()) pageHome(); };
    const bl = view.querySelector('#bkLater'); if (bl) bl.onclick = () => { S.backupSnooze = Date.now() + 1 * DAY; save(); pageHome(); };
  }
  // 首頁貓咪頭上的話（前 5 下是提示，之後隨機）；index.html 的手寫字型只下載這些字，改了文字要一起更新
  // 字體（昭源甜圓體 700）、顏色在 app.css 的 .cat-say；index.html 的字型網址只下載這些字，改了文字要一起更新
  // Alex 2026-11-27 打的句子：前 3 句是提示句（依序出現），之後隨機（不連續重複同一句）
  const CAT_HINTS = ["多點我幾下才會有聲音喔～", "多點我幾下才會有聲音喔～", "再點一下下就會喵喵叫囉～"];
  const CAT_LINES = ["喵～今天也要加油喔！", "摸摸頭好舒服～", "學完一輪，給我小魚乾好嗎？", "我在這裡陪妳背單字喔～", "妳今天好認真！", "要適當休息ㄛ～", "今天喝水了咪？", "有摸摸雪寶咪？", "想尿尿就去尿哦！", "今天也棒棒der ^ ^", "累了就睡一下ㄅ", "偶爾也要走出房間看看Alex喔"];
  let lastLine = -1;
  let catTaps = 0;
  function bindGo() { view.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go)); }

  // ---------- 單元清單 ----------
  function pageUnits() {
    const cur = currentUnit();
    render(`
      <div><h1 style="font-size:24px;font-weight:900">第 1 章 餐廳美食</h1><p class="muted" style="font-size:13px;margin-top:2px">照書本順序・10 個單元・261 個字・照自己的步調學</p></div>
      <div class="list">
        ${UNITS.map(u => {
          const k = knownCount(u), n = u.words.length, done = k === n, now = u === cur;
          const cls = done ? 'done' : now ? 'now' : '';
          const st = done ? '學完了' : k ? `${k} / ${n}` : '還沒開始';
          return `<button class="unit ${cls}" data-go="#unit/${u.id}"><span class="no">${u.id[0] === 'd' ? '對話' : u.id}</span><span class="t"><b>${esc(u.zh)}</b><span>${esc(u.en)}・${n} 字</span></span><span class="status ${cls}">${st}</span></button>`;
        }).join('')}
      </div>
    `, 'units');
    bindGo();
  }

  // ---------- 單元內頁 ----------
  function pageUnit(id) {
    const u = unitOf(id); if (!u) return go('#units');
    const k = knownCount(u);
    render(`
      ${topBar(unitLabel(u), `${k}/${u.words.length}`, '#units')}
      <div><h1 style="font-size:24px;font-weight:900">${esc(u.zh)}</h1><p class="muted" style="font-size:13px">${esc(u.en)}・點圖片可以聽發音</p></div>
      <div class="grid3">
        <button class="tile" style="background:#FFE4EE" data-go="#flash/${u.id}"><b>單字卡</b><span>聽發音、翻面</span></button>
        <button class="tile" style="background:#E2EEFF" data-go="#quiz/${u.id}"><b>翻字測驗</b><span>看中文選英文</span></button>
        <button class="tile" style="background:#FFEEDD" data-go="#listen/${u.id}"><b>聽音測驗</b><span>聽聲音選圖</span></button>
        <button class="tile" style="background:#E2F5EC" data-go="#spell/${u.id}"><b>拼字測驗</b><span>自己打出來</span></button>
        <button class="tile" style="background:#FCE6EE" data-go="#speak/${u.id}"><b>口說跟讀</b><span>唸給手機聽</span></button>
        <button class="tile" style="background:#FFF4CC" data-go="#fill/${u.id}"><b>${isDlg(u) ? '情境對話' : '例句填空'}</b><span>${isDlg(u) ? '在餐廳說說看' : '把字放進句子'}</span></button>
      </div>
      <div class="words">
        ${u.words.map(w => `<button class="word ${S.words[w.f] && S.words[w.f].known ? 'known' : ''}" data-say="${esc(w.f)}"><img class="wimg" src="${img(w.f)}" alt="" loading="lazy"><b>${esc(w.en)}</b>${kk(w.f) ? `<i class="kk-s">${esc(kk(w.f))}</i>` : ''}<span>${esc(w.zh)}</span></button>`).join('')}
      </div>
    `, 'units');
    bindBack('#units'); bindGo();
    view.querySelectorAll('[data-say]').forEach(b => b.onclick = () => say(WORDS[b.dataset.say].en, false, true));
  }

  // ---------- 單字卡 ----------
  // 單字卡一輪 10 個；同一次打開網站裡看過的字先不重複，全部看過才重來
  const flashSeen = {};
  function pageFlash(id) {
    const u = unitOf(id); if (!u) return go('#home');
    const seen = flashSeen[u.id] || (flashSeen[u.id] = new Set());
    const isKnown = f => S.words[f] && S.words[f].known;
    let pool = u.words.map(w => w.f).filter(f => !seen.has(f));
    if (!pool.length) { seen.clear(); pool = u.words.map(w => w.f); }
    const order = pool.filter(f => !isKnown(f)).concat(pool.filter(isKnown)).slice(0, ROUND);
    let i = 0, flipped = false, remembered = 0;
    function show(rerender) {
      if (i >= order.length) return finish(u, { learned: remembered, total: order.length, back: '#unit/' + u.id, again: '再來 10 個', seenN: seen.size, unitN: u.words.length });
      const f = order[i], w = WORDS[f], s = sentenceFor(f);
      render(`
        ${topBar('單字卡・' + unitLabel(u), `${i + 1} / ${order.length}`, '#unit/' + u.id)}
        <div class="bar"><div style="width:${((i + 1) / order.length) * 100}%"></div></div>
        <div class="card fc" id="fc">
          <img class="wimg" src="${img(f)}" alt="">
          <div class="word-big">${esc(w.en)}</div>
          ${kk(f) ? `<div class="kk">${esc(kk(f))}</div>` : ''}
          <div class="play-row"><button class="btn" id="p1" data-own-sound>播放</button><button class="btn ghost" id="p2" data-own-sound>慢速</button></div>
          <div style="border-top:1px dashed #F6DDE7;padding-top:12px;display:flex;flex-direction:column;gap:10px;align-items:center">
            ${flipped ? `<div class="zh-big">${esc(w.zh)}</div>${s ? `<div class="sent-box"><span class="e">${tapWords(s.en, f)}</span><span class="z">${esc(s.zh)}</span><div class="sent-tools"><span>點單字看意思</span><button class="play-pill" id="ps" data-own-sound>播放例句</button></div></div>` : ''}<button class="btn soft small" id="unflip">翻回正面</button>`
              : `<button class="btn soft" id="flip">翻面看中文</button>`}
          </div>
        </div>
        <div class="pair"><button class="b-bad" id="no" data-own-sound>還不熟</button><button class="b-good" id="yes" data-own-sound>記住了</button></div>
      `, null, true);
      bindBack();
      view.querySelector('#p1').onclick = () => say(w.en, false, true);
      view.querySelector('#p2').onclick = () => say(w.en, true, true);
      const fl = view.querySelector('#flip'); if (fl) fl.onclick = () => { flipped = true; show(true); };
      const uf = view.querySelector('#unflip'); if (uf) uf.onclick = () => { flipped = false; show(true); };
      const ps = view.querySelector('#ps'); if (ps) ps.onclick = () => say(s.en, false, true);
      bindTapWords();
      view.querySelector('#no').onclick = () => { snd('wrong'); const x = W(f); x.unsure = (x.unsure || 0) + 1; x.box = 0; x.due = Date.now(); seen.add(f); save(); dayFx(); i++; flipped = false; show(); };
      view.querySelector('#yes').onclick = e => {
        const x = W(f); const first = !x.known; x.known = true; if (!x.due) { x.box = Math.max(x.box, 1); x.due = startOfToday() + DAY; }
        remembered++; seen.add(f); save(); dayFx();
        if (first) earn(1);
        snd('correct'); FX.visual('correct', null, e.currentTarget);
        i++; flipped = false; setTimeout(show, 220);
      };
      if (!rerender) autoSay(w.en, 200);
    }
    show();
  }

  // ---------- 選擇題（翻字／聽音／例句填空）----------
  function roundWords(u) {
    const list = u.words.map(w => w.f);
    const now = Date.now();
    const score = f => { const x = S.words[f]; if (!x) return 0; return (x.known ? 2 : 0) + (x.due <= now ? 0 : 1) - Math.min(x.miss, 3) * 0.5 + Math.random() * 0.8; };
    return list.slice().sort((a, b) => score(a) - score(b)).slice(0, Math.min(ROUND, list.length));
  }

  function choiceRound(opts) {
    // opts: { title, back, items:[f], pool:[f], build(f) -> {html, choices:[{f,label}], kind:'text'|'img', onShow} }
    let i = 0, right = 0;
    const wrongs = [];
    function show() {
      if (i >= opts.items.length) return finish(opts.unit, { right, total: opts.items.length, back: opts.back, wrongs, again: opts.again, left: opts.left });
      const f = opts.items[i];
      const q = opts.build(f);
      render(`
        ${topBar(opts.title, `${i + 1} / ${opts.items.length}`, opts.back)}
        <div class="bar"><div style="width:${((i + 1) / opts.items.length) * 100}%"></div></div>
        <div class="card q-card ${q.kind === 'img' ? 'q-listen' : ''}" id="qc">${q.html}</div>
        <div class="${q.kind === 'img' ? 'img-opts' : 'opts'}" id="opts">
          ${q.choices.map((c, k) => q.kind === 'img'
            ? `<button class="img-opt" data-k="${k}"><img class="wimg" src="${img(c.f)}" alt=""><div class="cap"></div></button>`
            : `<button class="opt" data-k="${k}">${esc(c.label)}</button>`).join('')}
        </div>
        <div id="fb"></div>
      `, null, true);
      bindBack(opts.back);
      if (q.onShow) q.onShow();
      bindTapWords(view.querySelector('#qc'));
      const btns = view.querySelectorAll('#opts button');
      btns.forEach(b => b.onclick = () => {
        const c = q.choices[+b.dataset.k], ok = c.f === f;
        btns.forEach(x => { x.disabled = true; const cc = q.choices[+x.dataset.k]; if (cc.f === f) x.classList.add('right'); if (q.kind === 'img') x.querySelector('.cap').textContent = WORDS[cc.f].en; });
        if (ok) { right++; b.classList.add('right'); snd('correct'); FX.visual('correct', null, b, view.querySelector('#qc')); }
        else { b.classList.add('wrong'); wrongs.push(f); snd('wrong'); FX.visual('wrong', null, b); }
        record(f, ok);
        if (ok) earn(1);
        const w = WORDS[f];
        // 答對／答錯和「下一題」合成一顆按鈕，整題放得進一個畫面
        view.querySelector('#fb').innerHTML = `<button class="next-btn ${ok ? 'ok' : 'no'}" id="next"><span class="nb-t"><b>${ok ? '答對了' : '答案是'}：${esc(w.en)}</b><small>${esc(w.zh)}</small></span><span class="nb-go">下一題 ›</span></button>`;
        const nb = view.querySelector('#next'); const r = nb.getBoundingClientRect();
        if (r.bottom > window.innerHeight) nb.scrollIntoView({ block: 'end', behavior: 'smooth' });
        say(w.en);
        view.querySelector('#next').onclick = () => { i++; show(); };
      });
    }
    show();
  }

  function pageQuiz(id) {
    const u = unitOf(id); if (!u) return go('#home');
    const pool = u.words.map(w => w.f);
    choiceRound({
      unit: u, title: '翻字測驗・' + unitLabel(u), back: '#unit/' + u.id, items: roundWords(u),
      build: f => ({
        kind: 'text',
        html: `<img class="wimg" src="${img(f)}" alt=""><div class="q-prompt">${esc(WORDS[f].zh)}</div><span class="muted" style="font-size:13px">選出正確的英文</span>`,
        choices: shuffle([f, ...pickOthers(f, pool, 3)]).map(x => ({ f: x, label: WORDS[x].en }))
      })
    });
  }

  function pageListen(id) {
    const u = unitOf(id); if (!u) return go('#home');
    const pool = u.words.map(w => w.f);
    choiceRound({
      unit: u, title: '聽音測驗・' + unitLabel(u), back: '#unit/' + u.id, items: roundWords(u),
      build: f => ({
        kind: 'img',
        html: `<div class="listen-row"><button class="big-play" id="lp">播放</button><button class="btn ghost small" id="ls">慢速</button></div><span class="muted" style="font-size:13px">聽聲音，選出對的圖</span>`,
        choices: shuffle([f, ...pickOthers(f, pool, 3)]).map(x => ({ f: x })),
        onShow() {
          view.querySelector('#lp').onclick = () => say(WORDS[f].en, false, true);
          view.querySelector('#ls').onclick = () => say(WORDS[f].en, true, true);
          autoSay(WORDS[f].en, 300);
        }
      })
    });
  }

  function pageFill(id) {
    const u = unitOf(id); if (!u) return go('#home');
    if (isDlg(u)) return pageDialogue(u);
    const pool = u.words.map(w => w.f).filter(f => SENT[f]);
    if (!pool.length) { render(`${topBar('例句填空', '', '#unit/' + u.id)}<div class="card">例句還在準備中。</div>`, null, true); return bindBack(); }
    const items = roundWords(u).filter(f => SENT[f]);
    choiceRound({
      unit: u, title: '例句填空・' + unitLabel(u), back: '#unit/' + u.id, items,
      build: f => {
        const s = SENT[f], r = findKey(s.en, keyOf(f));
        const gap = !r ? tapWords(s.en) : tapWords(s.en.slice(0, r[0])) + '<span class="blank">&nbsp;?&nbsp;</span>' + tapWords(s.en.slice(r[1]));
        return {
          kind: 'text',
          html: `<div class="sent" style="background:none;padding:0"><span class="e" style="font-size:19px">${gap}</span><span class="z" style="font-size:14px">${esc(s.zh)}</span></div>`,
          choices: shuffle([f, ...pickOthers(f, pool.length >= 4 ? pool : u.words.map(w => w.f), 3)]).map(x => { const r = SENT[x] && findKey(SENT[x].en, keyOf(x)); return { f: x, label: r ? SENT[x].en.slice(r[0], r[1]).replace(/^[A-Z]/, c => /^[a-z]/.test(WORDS[x].en) ? c.toLowerCase() : c) : keyOf(x) }; })
        };
      }
    });
  }

  // ---------- 拼字 ----------
  function pageSpell(id) {
    const u = unitOf(id); if (!u) return go('#home');
    const items = roundWords(u);
    let i = 0, right = 0, tries = 0, hintN = 1;
    const wrongs = [];
    function show() {
      if (i >= items.length) return finish(u, { right, total: items.length, back: '#unit/' + u.id, wrongs });
      const f = items[i], w = WORDS[f], ans = answers(f)[0];
      const hint = ans.split('').map((c, k) => c === ' ' ? '&nbsp;&nbsp;' : k < hintN ? esc(c) : '_').join(' ');
      render(`
        ${topBar('拼字測驗・' + unitLabel(u), `${i + 1} / ${items.length}`, '#unit/' + u.id)}
        <div class="bar"><div style="width:${((i + 1) / items.length) * 100}%"></div></div>
        <div class="card q-card" id="qc">
          <img class="wimg" src="${img(f)}" alt="" style="width:52%">
          <div class="q-prompt">${esc(w.zh)}</div>
          <div class="hint">${hint}</div>
          <div class="play-row"><button class="btn small" id="p1">聽發音</button><button class="btn soft small" id="more">多給一個字母</button></div>
        </div>
        <input class="spell-in" id="in" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="在這裡打英文">
        <div id="fb"></div>
        <button class="btn" id="chk" style="width:100%">檢查</button>
      `, null, true);
      bindBack();
      const inp = view.querySelector('#in');
      view.querySelector('#p1').onclick = () => say(w.en, false, true);
      view.querySelector('#more').onclick = () => { hintN = Math.min(hintN + 1, ans.length); const v = inp.value; show(); view.querySelector('#in').value = v; };
      const chk = view.querySelector('#chk');
      const check = () => {
        if (chk.dataset.next) { i++; tries = 0; hintN = 1; return show(); }
        const v = norm(inp.value); if (!v) return;
        const ok = answers(f).some(a => norm(a) === v);
        const fb = view.querySelector('#fb');
        if (ok) {
          if (tries === 0) right++;
          snd('correct'); FX.visual('correct', null, inp, view.querySelector('#qc'));
          record(f, tries === 0); if (tries === 0) earn(1);
          fb.innerHTML = `<div class="feedback ok">拼對了：${esc(w.en)}</div>`;
          say(w.en); chk.textContent = '下一題'; chk.dataset.next = '1'; inp.disabled = true;
        } else {
          tries++;
          snd('wrong'); FX.visual('wrong', null, inp);
          if (tries === 1) { wrongs.push(f); record(f, false); fb.innerHTML = `<div class="feedback no">差一點，再試一次</div>`; }
          else { fb.innerHTML = `<div class="feedback no">答案是：${esc(w.en)}</div>`; say(w.en); chk.textContent = '下一題'; chk.dataset.next = '1'; inp.disabled = true; }
        }
      };
      chk.onclick = check;
      inp.onkeydown = e => { if (e.key === 'Enter') check(); };
      autoSay(w.en, 250);
    }
    show();
  }

  // ---------- 口說跟讀 ----------
  let rec = null;
  function stopMic() { try { if (rec) rec.abort(); } catch (e) {} rec = null; }
  function pageSpeak(id) {
    const u = unitOf(id); if (!u) return go('#home');
    const items = roundWords(u);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let i = 0, right = 0;
    function show(result) {
      if (i >= items.length) return finish(u, { right, total: items.length, back: '#unit/' + u.id });
      const f = items[i], w = WORDS[f];
      render(`
        ${topBar('口說跟讀・' + unitLabel(u), `${i + 1} / ${items.length}`, '#unit/' + u.id)}
        <div class="bar"><div style="width:${((i + 1) / items.length) * 100}%"></div></div>
        <div class="card q-card" id="qc">
          <img class="wimg" src="${img(f)}" alt="" style="width:50%">
          <div class="word-big">${esc(w.en)}</div>
          ${kk(f) ? `<div class="kk">${esc(kk(f))}</div>` : ''}
          <span class="muted">${esc(w.zh)}</span>
          <div class="play-row"><button class="btn small" id="p1">先聽一次</button><button class="btn ghost small" id="p2">慢速</button></div>
        </div>
        ${SR ? `<button class="mic" id="mic">按我<br>開始唸</button>` : `<div class="card muted" style="font-size:14px">這個瀏覽器不能聽你唸。可以先聽一次，自己跟著唸，再按下面的按鈕。</div>`}
        <div id="fb">${result || ''}</div>
        ${SR ? `<div class="pair"><button class="b-bad" id="skip">跳過</button><button class="b-good" id="next">下一個</button></div>`
             : `<div class="pair"><button class="b-bad" id="selfno">還唸不好</button><button class="b-good" id="selfok">唸好了</button></div>`}
      `, null, true);
      bindBack();
      view.querySelector('#p1').onclick = () => say(w.en, false, true);
      view.querySelector('#p2').onclick = () => say(w.en, true, true);
      const nx = () => { stopMic(); i++; show(); };
      if (SR) {
        view.querySelector('#skip').onclick = nx;
        view.querySelector('#next').onclick = nx;
        const mic = view.querySelector('#mic');
        mic.onclick = () => {
          if (rec) { stopMic(); mic.classList.remove('on'); mic.innerHTML = '按我<br>開始唸'; return; }
          if (window.speechSynthesis) speechSynthesis.cancel();
          rec = new SR(); rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 5;
          mic.classList.add('on'); mic.innerHTML = '在聽了<br>請唸';
          let got = false;
          rec.onresult = e => {
            got = true;
            const alts = Array.from(e.results[0]).map(a => a.transcript);
            const target = answers(f).map(norm);
            const ok = alts.some(a => target.some(t => norm(a) === t || (' ' + norm(a) + ' ').includes(' ' + t + ' ')));
            const heard = alts[0] || '';
            if (ok) { right++; snd('correct'); record(f, true); earn(1); }
            else { snd('wrong'); }
            show(`<div class="feedback ${ok ? 'ok' : 'no'}"><span>${ok ? '唸得很好' : '再試一次看看'}</span><span style="font-weight:600">手機聽到：${esc(heard) || '（沒聽清楚）'}</span></div>`);
          };
          rec.onerror = () => { if (!got) show(`<div class="feedback no">沒有聽到聲音，請再按一次。如果跳出麥克風權限，請按「允許」。</div>`); };
          rec.onend = () => { rec = null; };
          try { rec.start(); } catch (e) { rec = null; }
        };
      } else {
        view.querySelector('#selfno').onclick = nx;
        view.querySelector('#selfok').onclick = e => { right++; earn(1); snd('correct'); nx(); };
      }
      if (!result) autoSay(w.en, 250);
    }
    show();
  }

  // ---------- 情境對話 ----------
  function pageDialogue(u) {
    const d = DIALOGUES.find(x => x.unit === u.id);
    if (!d) { render(`${topBar('情境對話', '', '#unit/' + u.id)}<div class="card">對話還在準備中。</div>`, null, true); return bindBack(); }
    const blanks = d.lines.map((l, k) => l.blank ? k : -1).filter(k => k >= 0);
    const filled = {};
    let cur = 0, right = 0, missed = new Set();
    const me = who => /lara/i.test(who);
    function lineHtml(l, k) {
      let e = tapWords(l.en);
      if (l.blank) {
        const i = l.en.toLowerCase().indexOf(l.blank.toLowerCase());
        if (i >= 0) e = tapWords(l.en.slice(0, i)) + `<span class="blank">${filled[k] ? tapWords(l.en.slice(i, i + l.blank.length)) : '&nbsp;'}</span>` + tapWords(l.en.slice(i + l.blank.length));
      }
      return `<div class="line ${me(l.who) ? 'me' : ''}"><span class="line-top"><span class="who">${esc(l.who)}</span><button class="play-pill" data-line="${k}" data-own-sound>播放</button></span><span class="e">${e}</span><span class="z">${esc(l.zh)}</span></div>`;
    }
    function show() {
      const done = cur >= blanks.length;
      const chips = shuffle(blanks.map(k => d.lines[k].blank));
      render(`
        ${topBar('情境對話', `${Math.min(cur, blanks.length)} / ${blanks.length}`, '#unit/' + u.id)}
        <div><h2 style="font-size:20px;font-weight:900">${esc(d.title)}</h2><p class="muted" style="font-size:13px">${esc(d.titleZh || '')}・點「播放」聽整句，點單字看意思</p></div>
        <div class="dlg">${d.lines.map(lineHtml).join('')}</div>
        <div style="position:sticky;bottom:calc(12px + env(safe-area-inset-bottom));background:var(--bg);padding-top:8px">
        ${done ? `<button class="btn" id="fin" style="width:100%">完成</button>` : `<p style="font-size:13px;font-weight:800;margin-bottom:8px">第 ${cur + 1} 個空格要填哪個字？</p><div class="chips">${chips.map(c => `<button class="chip ${Object.values(filled).includes(c) ? 'used' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>`}
        </div>
      `, null, true);
      bindBack();
      view.querySelectorAll('[data-line]').forEach(b => b.onclick = () => say(d.lines[+b.dataset.line].en, false, true));
      bindTapWords();
      const fin = view.querySelector('#fin');
      if (fin) fin.onclick = () => finish(u, { right, total: blanks.length, back: '#unit/' + u.id });
      view.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
        if (b.classList.contains('used')) return;
        const k = blanks[cur], want = d.lines[k].blank;
        const f = u.words.find(w => w.en.toLowerCase() === want.toLowerCase()) || u.words.find(w => want.toLowerCase().includes(w.en.toLowerCase()));
        if (b.dataset.c === want) {
          if (!missed.has(k)) { right++; if (f) record(f.f, true); earn(1); }
          snd('correct'); filled[k] = want; cur++; say(d.lines[k].en);
          setTimeout(show, 450);
        } else {
          snd('wrong'); FX.visual('wrong', null, b);
          if (!missed.has(k)) { missed.add(k); if (f) record(f.f, false); }
        }
      });
    }
    show();
  }

  // ---------- 完成畫面 ----------
  // 下一個獎勵目標：還買不起、最便宜的那個
  // 兌換券（Alex 設定好的，不能自己新增或刪除）
  const REWARDS = [
    { id: 'ice', name: '古早味冰冰兌換券', cost: 500 },
    { id: 'waffle', name: '小木屋鬆餅兌換券', cost: 600 },
    { id: 'sushi', name: '壽司郎兌換券', cost: 800 },
    { id: 'wish', name: '萬用許願兌換券', cost: 5000 }
  ];
  // 碗裡的份量（0 空碗～5 滿出來），看「離我的目標」的比例；夠換目標那張就是滿出來
  function bowlLevel(fish) {
    if (fish <= 0) return 0;
    const g = myGoal(fish), k = g ? fish / g.cost : 1;
    if (k >= 1) return 5;
    return k < 0.2 ? 1 : k < 0.5 ? 2 : k < 0.8 ? 3 : 4;
  }
  const bowlImg = fish => `img/bowl/lv${bowlLevel(fish)}.webp`;
  // Lara 選的目標（還沒選就用最接近、還換不起的那張）
  function myGoal(fish) {
    const g = REWARDS.find(x => x.id === S.goal);
    return g || nextGoal(fish);
  }
  function redeemCount(r) { return S.redeemed.filter(x => x.name === r.name).length; }
  // 兌換券清單（獎勵頁和收藏頁共用）：每張都有進度條、還差幾隻、設為目標、兌換
  function rewardListHtml() {
    const goal = myGoal(S.fish);
    return `<div class="list">${REWARDS.map((it, k) => {
      const p = Math.round(Math.min(S.fish, it.cost) / it.cost * 100), left = Math.max(0, it.cost - S.fish), n = redeemCount(it), isGoal = goal && goal.id === it.id;
      return `
      <div class="card reward ${isGoal ? 'is-goal' : ''}">
        <img class="reward-ico" src="img/reward/${it.id}.webp" alt="">
        <div class="t">
          <div><b>${esc(it.name)}</b><span class="muted" style="font-size:12px;font-weight:800;white-space:nowrap">${it.cost} 隻</span></div>
          <div class="bar" style="height:10px"><div style="width:${p}%"></div></div>
          <span class="reward-foot">${left ? `${S.fish} / ${it.cost}・還差 <b>${left}</b> 隻` : '<b>可以兌換了！</b>'}${n ? `・已兌換 ${n} 次` : ''}</span>
          <div class="reward-btns">
            ${isGoal ? '<span class="goal-tag">我的目標</span>' : `<button class="btn soft small" data-goal="${it.id}">設為目標</button>`}
            <button class="btn small" data-redeem="${k}" ${left ? 'disabled' : ''}>兌換</button>
          </div>
        </div>
      </div>`; }).join('')}</div>`;
  }
  function redeemedHtml() {
    return `<div class="card" id="redeemedList"><b style="font-weight:900">我兌換過的</b><p class="muted" style="font-size:12px;margin-top:2px">點一張可以再打開兌換券</p>
      ${S.redeemed.length ? `<div class="list" style="margin-top:10px">${S.redeemed.map((r, k) => ({ r, k })).reverse().map(({ r, k }) => { const it = REWARDS.find(x => x.name === r.name); return `
        <button class="redeemed" data-ticket="${k}">${it ? `<img src="img/reward/${it.id}.webp" alt="">` : ''}<span><b>${esc(r.name)}</b><small>${esc(r.date)}・用了 ${r.cost} 隻</small></span></button>`; }).join('')}</div>`
      : '<p class="muted" style="font-size:13px;margin-top:6px">還沒有兌換過，存夠小魚乾就可以換囉。</p>'}</div>`;
  }
  // 兌換券卡片：剛兌換時（fresh）有慶祝並提醒截圖給 Alex；之後在「我兌換過的」點開可以再看
  function ticketCard(k, fresh, done) {
    const r = S.redeemed[k]; if (!r) return;
    const it = REWARDS.find(x => x.name === r.name) || {};
    const m = document.createElement('div'); m.className = 'fx-modal ticket-modal';
    m.innerHTML = `<div class="ticket ${r.used ? 'is-used' : ''}">
      ${fresh ? '<div class="ticket-title">兌換成功！</div>' : ''}
      <div class="ticket-body">
        <div class="ticket-cat"></div>
        <img class="ticket-ico" src="img/reward/${it.id || 'wish'}.webp" alt="">
        <b class="ticket-name">${esc(r.name)}</b>
        <span class="ticket-meta">No. ${String(k + 1).padStart(3, '0')}・${esc(r.date)} 兌換・用了 ${r.cost} 隻小魚乾</span>
        <p class="ticket-tip">請截圖這個畫面，然後跟 Alex 兌換喔！</p>
      </div>
      <div class="ticket-btns">
        <button class="btn" data-t="ok" style="min-width:140px">好</button>
      </div>
    </div>`;
    let cat = null;
    const close = () => { if (cat) cat.stop(); m.remove(); if (done) done(); if (fresh) setTimeout(() => { const el = document.getElementById('redeemedList'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80); };
    m.onclick = e => { if (e.target === m) close(); };
    m.querySelector('[data-t="ok"]').onclick = close;
    document.body.appendChild(m);
    if (window.CatPlayer) cat = CatPlayer(m.querySelector('.ticket-cat'), { actions: fresh ? ['pawsup', 'roll', 'belly', 'wave'] : ['wave', 'tilt'] });
    if (fresh) { snd('complete'); setTimeout(() => snd('fish'), 800); setTimeout(() => hearts(m.querySelector('.ticket-ico')), 200); }
  }
  // 綁定兌換券按鈕；done 是兌換或換目標後要重畫的頁面
  function bindRewards(done) {
    view.querySelectorAll('[data-goal]').forEach(b => b.onclick = () => { S.goal = b.dataset.goal; save(); toast('目標換好了'); done(); });
    view.querySelectorAll('[data-redeem]').forEach(b => b.onclick = () => {
      const it = REWARDS[+b.dataset.redeem];
      if (S.fish < it.cost) return;
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = '確定兌換？'; return; }
      S.fish -= it.cost; S.redeemed.push({ name: it.name, cost: it.cost, date: today() }); save();
      done();
      ticketCard(S.redeemed.length - 1, true, done);
    });
    view.querySelectorAll('[data-ticket]').forEach(b => b.onclick = () => ticketCard(+b.dataset.ticket, false, done));
  }
  function nextGoal(fish) {
    const list = REWARDS.filter(x => x.cost > fish).sort((a, b) => a.cost - b.cost);
    return list[0] || null;
  }
  function goalHtml(u, after) {
    const g = myGoal(after);
    const ready = REWARDS.filter(x => x.cost <= after);
    let h = '';
    if (g) {
      h += `<div class="goal"><div class="goal-top"><img class="goal-ico" src="img/reward/${g.id}.webp" alt=""><span>我的目標</span><b>${esc(g.name)}</b></div>
        <div class="goal-bar"><div id="goalFill" style="width:${Math.max(0, Math.min(100, (after - (window.__goalGain || 0)) / g.cost * 100))}%"></div></div>
        <div class="goal-foot"><span id="goalNow">${after - (window.__goalGain || 0)}</span> / ${g.cost} 隻・<b id="goalLeft">${after - (window.__goalGain || 0) >= g.cost ? '可以兌換了！' : '還差 ' + (g.cost - after + (window.__goalGain || 0)) + ' 隻'}</b></div></div>`;
    }
    if (ready.length) h += `<div class="goal ready"><div class="goal-top"><span>可以兌換了</span><b>${ready.map(x => esc(x.name)).join('、')}</b></div></div>`;
    if (u) {
      const k = knownCount(u), n = u.words.length;
      h += `<div class="goal"><div class="goal-top"><span>單元目標</span><b>學完「${esc(u.zh)}」</b></div>
        <div class="goal-bar unit"><div style="width:${k / n * 100}%"></div></div>
        <div class="goal-foot">${k} / ${n} 個字・<b>${k >= n ? '已經學完了！' : '還差 ' + (n - k) + ' 個字'}</b></div></div>`;
    }
    return h;
  }

  function finish(u, r) {
    const bonus = 5;
    const unitNew = !r.demo && u && checkUnitDone(u);
    const total = earned + bonus + (unitNew ? 30 : 0);
    earned = 0;
    const pct = r.total && r.right != null ? Math.round(r.right / r.total * 100) : null;
    const before = S.fish, after = before + total;
    window.__goalGain = total;
    render(`
      <div class="card done-card">
        <div class="ribbon"><span>${unitNew ? esc(unitLabel(u)) + ' 學完了！' : '這一輪完成了！'}</span></div>
        <div class="stats">
          <div><b>${r.learned != null ? r.learned : r.right}</b><span>${r.learned != null ? '記住了' : '答對'}</span></div>
          <div><b>${r.learned != null ? r.total - r.learned : (pct != null ? pct + '%' : '—')}</b><span>${r.learned != null ? '還不熟' : '答對率'}</span></div>
          <div class="fishy"><b>+${total}</b><span>小魚乾</span></div>
        </div>
        <div class="room" id="stage" style="background-image:url(img/room/room-${roomNow()}.webp)">
          <div class="room-cat" id="doneCat"></div>
          <div class="bowl" id="bowl"><img id="bowlImg" src="${bowlImg(before)}" alt="碗"><span class="bowl-count" id="bowlCount">+0</span></div>
        </div>
        <p class="bowl-msg" id="bowlMsg">小魚乾正在放進碗裡⋯</p>
        ${(() => { if (r.demo) return ''; const nu = newUnlocks(); save(); if (!nu.cats.length && !nu.rooms.length) return '';
          return `<div class="unlock"><b>新解鎖！</b>${nu.cats.map(c => `<span>貓咪動作「${esc((window.CAT_ACTIONS.find(a => a.id === c) || {}).name || c)}」</span>`).join('')}${nu.rooms.map(x => `<span>房間「${esc(ROOMS.find(q => q.id === x).name)}」</span>`).join('')}<a href="#collect">去收藏看看</a></div>`; })()}
        <div class="goals">${goalHtml(u, after)}</div>
        ${r.seenN != null ? `<p class="muted" style="font-size:12px">這個單元已經看過 ${r.seenN} / ${r.unitN} 個字</p>` : ''}
        ${r.left ? `<p class="muted" style="font-size:12px">這一類還有 ${r.left} 個字沒練到</p>` : ''}
      </div>
      ${r.wrongs && r.wrongs.length ? `<div class="card"><b style="font-weight:900">這輪答錯的字</b><p class="muted" style="font-size:12px;margin:2px 0 8px">已經放進錯題本，之後會再出現</p><div class="list">${[...new Set(r.wrongs)].map(f => `<div class="review-row" style="box-shadow:none;background:var(--bg)"><img src="${img(f)}" alt=""><div class="t"><b>${esc(WORDS[f].en)}</b><span>${esc(WORDS[f].zh)}</span></div></div>`).join('')}</div></div>` : ''}
      <div class="card" style="text-align:center;display:flex;flex-direction:column;gap:12px">
        <b style="font-size:17px;font-weight:900">要不要${r.again ? r.again.replace('再來', '再') : '再來一輪'}？</b>
        <div class="pair"><button class="btn ghost" id="home">休息一下</button><button class="btn" id="again">${r.again || '再來 10 題'}</button></div>
      </div>
    `, null, true);
    const cat = window.CatPlayer ? CatPlayer(view.querySelector('#doneCat'), { actions: ['wave', 'tilt', 'tail', 'groom'] }) : null;
    if (cat) cats.push(cat);
    view.querySelector('#again').onclick = () => { const h = r.demo ? '#flash/1-1' : location.hash; location.hash = '#_'; setTimeout(() => location.hash = h, 0); };
    view.querySelector('#home').onclick = () => go(r.back || '#home');
    if (!r.demo) { S.fish += total; save(); }
    fishIntoBowl(total, before, () => {
      // 全部放完：鈴聲、貓咪開心打滾、愛心飄起來、目標條往前長
      snd('complete');
      setTimeout(() => snd('fish'), 700);
      if (cat) { const happy = ['pawsup', 'roll', 'belly', 'wave'].filter(x => catsUnlocked().includes(x)); cat.play(happy[Math.floor(Math.random() * happy.length)] || 'wave'); }
      hearts(view.querySelector('#bowl'));
      const fill = view.querySelector('#goalFill');
      if (fill) {
        const g = myGoal(after);
        if (g) {
          fill.style.width = Math.min(100, after / g.cost * 100) + '%';
          view.querySelector('#goalNow').textContent = after;
          view.querySelector('#goalLeft').textContent = after >= g.cost ? '可以兌換了！' : '還差 ' + (g.cost - after) + ' 隻';
        }
      }
    });
  }
  // 小魚乾從上面一隻隻掉進碗裡，每隻「啵」一聲（越來越高），碗慢慢裝滿
  function fishIntoBowl(total, before, done) {
    const bowl = view.querySelector('#bowl'), stage = view.querySelector('#stage');
    const cnt = view.querySelector('#bowlCount'), bimg = view.querySelector('#bowlImg'), msg = view.querySelector('#bowlMsg');
    const shown = Math.min(total, 12); // 最多飛 12 隻，數字照實際加
    let layer = document.getElementById('fx-layer');
    if (!layer) { layer = document.createElement('div'); layer.id = 'fx-layer'; document.body.appendChild(layer); }
    for (let k = 0; k < shown; k++) {
      setTimeout(() => {
        if (!document.body.contains(bowl)) return;
        const b = bowl.getBoundingClientRect(), st = stage.getBoundingClientRect();
        const fish = document.createElement('img');
        fish.src = 'img/fish/fish.webp'; fish.className = 'fx-fish';
        const sx = st.left + 30 + Math.random() * (st.width - 60), sy = st.top + 10;
        fish.style.left = sx + 'px'; fish.style.top = sy + 'px';
        layer.appendChild(fish);
        const ex = b.left + b.width / 2 - sx, ey = b.top + b.height * 0.45 - sy;
        fish.animate([
          { transform: 'translate(-50%,-50%) rotate(-30deg) scale(0.7)', opacity: 0 },
          { transform: `translate(calc(-50% + ${ex * 0.5}px), calc(-50% + ${ey * 0.2}px)) rotate(10deg) scale(1)`, opacity: 1, offset: 0.4 },
          { transform: `translate(calc(-50% + ${ex}px), calc(-50% + ${ey}px)) rotate(40deg) scale(0.6)`, opacity: 1 }
        ], { duration: 650, easing: 'ease-in', fill: 'forwards' });
        setTimeout(() => {
          fish.remove();
          const got = k === shown - 1 ? total : Math.round(total * (k + 1) / shown);
          cnt.textContent = '+' + got;
          bowl.classList.remove('fx-pop'); void bowl.offsetWidth; bowl.classList.add('fx-pop');
          const src = bowlImg(before + got);
          if (!bimg.src.endsWith(src)) { bimg.src = src; bowl.classList.remove('fx-level'); void bowl.offsetWidth; bowl.classList.add('fx-level'); }
          if (S.settings.sound) FX.pop(k);
          if (k === shown - 1) {
            msg.innerHTML = `碗裡多了 <b>${total}</b> 隻小魚乾，現在一共 <b>${before + total}</b> 隻`;
            const badge = document.querySelector('[data-fish] [data-count]'); if (badge) badge.textContent = S.fish;
            if (done) setTimeout(done, 250);
          }
        }, 640);
      }, 400 + k * 170);
    }
  }
  // 從碗冒出幾顆粉紅愛心（簡單圖形）
  function hearts(from) {
    if (!from) return;
    const b = from.getBoundingClientRect();
    for (let k = 0; k < 7; k++) {
      const h = document.createElement('div'); h.className = 'fx-heart';
      h.style.left = (b.left + b.width * (0.2 + Math.random() * 0.6)) + 'px';
      h.style.top = (b.top + b.height * 0.2) + 'px';
      h.style.setProperty('--dx', (Math.random() * 60 - 30).toFixed(0) + 'px');
      h.style.animationDelay = (k * 0.12) + 's';
      (document.getElementById('fx-layer') || document.body).appendChild(h);
      setTimeout(() => h.remove(), 2200);
    }
  }
  // ---------- 錯題本 ----------
  let reviewTab = 'weak';
  function pageReview(tab) {
    if (tab) reviewTab = tab;
    const score = f => (S.words[f].miss || 0) + (S.words[f].unsure || 0);
    const weak = weakList().sort((a, b) => score(b) - score(a));
    const due = dueList();
    const good = Object.keys(S.words).filter(f => WORDS[f] && S.words[f].box >= 4);
    const lists = { due, weak, good };
    const list = lists[reviewTab] || weak;
    const label = x => [x.miss ? `錯 ${x.miss} 次` : '', x.unsure ? `還不熟 ${x.unsure} 次` : ''].filter(Boolean).join('・');
    const empty = { due: '現在沒有要複習的字', weak: '還沒有答錯或還不熟的字', good: '還沒有很熟的字，多練幾次就會出現在這裡' }[reviewTab];
    render(`
      <div><h1 style="font-size:24px;font-weight:900">錯題本</h1><p class="muted" style="font-size:13px">答錯或按「還不熟」的字會自動排進來，越常出現的越常複習；連續答對就會畢業</p></div>
      <div class="stats review-tabs">
        <button data-tab="due" class="${reviewTab === 'due' ? 'on' : ''}"><b>${due.length}</b><span>現在該複習</span></button>
        <button data-tab="weak" class="${reviewTab === 'weak' ? 'on' : ''}"><b>${weak.length}</b><span>還在練習</span></button>
        <button data-tab="good" class="${reviewTab === 'good' ? 'on' : ''}"><b style="color:var(--good)">${good.length}</b><span>已經很熟</span></button>
      </div>
      <button class="btn" id="go" ${list.length ? '' : 'disabled'} style="width:100%">${list.length ? { due: '開始複習', weak: '練習還在練習的', good: '再複習很熟的' }[reviewTab] + ` ${list.length} 個字` + (list.length > ROUND ? `（一輪 ${ROUND} 個）` : '') : empty}</button>
      <div class="list">
        ${list.map(f => { const x = S.words[f]; const d = Math.ceil((x.due - Date.now()) / DAY); const tag = reviewTab === 'good' ? '<span class="pill" style="background:var(--good-bg);color:var(--good)">很熟了</span>' : (label(x) ? `<span class="miss">${label(x)}</span>` : '');
          return `<button class="review-row" data-say="${f}" style="text-align:left"><img src="${img(f)}" alt="" loading="lazy"><div class="t"><b>${esc(WORDS[f].en)}</b><span>${esc(WORDS[f].zh)}${reviewTab === 'good' ? '' : '・' + (x.due <= Date.now() ? '現在複習' : d + ' 天後複習')}</span></div>${tag}</button>`; }).join('') || `<p class="muted" style="text-align:center;padding:20px">${empty}</p>`}
      </div>
    `, 'review');
    view.querySelectorAll('.review-tabs button').forEach(b => b.onclick = () => pageReview(b.dataset.tab));
    view.querySelectorAll('[data-say]').forEach(b => b.onclick = () => say(WORDS[b.dataset.say].en, false, true));
    const g = view.querySelector('#go'); if (g) g.onclick = () => go('#review-go/' + reviewTab);
  }
  // 錯題本一輪 10 個；同一次打開網站裡練過的先不重複，全部練過才重來
  const reviewSeen = {};
  function reviewSource(tab) { return tab === 'weak' ? weakList() : tab === 'good' ? Object.keys(S.words).filter(f => WORDS[f] && S.words[f].box >= 4) : dueList(); }
  function pageReviewGo(tab) {
    tab = tab || 'due';
    const seen = reviewSeen[tab] || (reviewSeen[tab] = new Set());
    const src = reviewSource(tab);
    let rest = src.filter(f => !seen.has(f));
    if (!rest.length) { seen.clear(); rest = src; }
    const items = shuffle(rest).slice(0, ROUND);
    items.forEach(f => seen.add(f));
    const left = src.filter(f => !seen.has(f)).length;
    if (!items.length) return go('#review');
    const pool = Object.keys(WORDS);
    // 複習用：翻字和聽音輪流
    choiceRound({
      unit: null, title: { weak: '練習還在練習的字', good: '複習很熟的字' }[tab] || '複習', back: '#review', items, again: left ? '再來 ' + Math.min(left, ROUND) + ' 個' : '再練一輪', left,
      build: (f) => {
        const sameUnit = UNITS.find(u => u.words.some(w => w.f === f)).words.map(w => w.f);
        if (Math.random() < 0.5) return {
          kind: 'text',
          html: `<img class="wimg" src="${img(f)}" alt=""><div class="q-prompt">${esc(WORDS[f].zh)}</div>`,
          choices: shuffle([f, ...pickOthers(f, sameUnit, 3)]).map(x => ({ f: x, label: WORDS[x].en }))
        };
        return {
          kind: 'img',
          html: `<button class="big-play" id="lp">播放</button><span class="muted" style="font-size:13px">聽聲音，選出對的圖</span>`,
          choices: shuffle([f, ...pickOthers(f, sameUnit, 3)]).map(x => ({ f: x })),
          onShow() { view.querySelector('#lp').onclick = () => say(WORDS[f].en, false, true); autoSay(WORDS[f].en, 300); }
        };
      }
    });
  }

  // ---------- 我的收藏 ----------
  let collectTab = 'bowl';
  function pageCollect(tab) {
    if (tab) collectTab = tab;
    const k = knownTotal(), ud = unitsDone();
    const catsOn = catsUnlocked(), roomsOn = roomsUnlocked();
    const tabs = [['bowl', '我的碗'], ['words', '單字圖鑑'], ['cats', '貓咪動作'], ['rooms', '房間']];
    let body = '';
    if (collectTab === 'bowl') {
      const g = nextGoal(S.fish);
      body = `
        <div class="card my-bowl">
          <div class="room small" style="background-image:url(img/room/room-${roomNow()}.webp)">
            <div class="room-cat" id="bowlCat"></div>
            <div class="bowl"><img src="${bowlImg(S.fish)}" alt="碗"></div>
          </div>
          <div class="big-num"><b>${S.fish}</b><span>隻小魚乾</span></div>
        </div>
        <div class="collect-head"><b>兌換券</b><span>選一張「設為目標」，碗裡的份量會跟著這張變化；存夠了就可以按「兌換」</span></div>
        ${rewardListHtml()}
        ${redeemedHtml()}`;
    } else if (collectTab === 'words') {
      body = `<div class="collect-head"><b>已收集 ${k} / ${Object.keys(WORDS).length}</b><span>學會的字會亮起來，點一下可以聽發音</span></div>
        ${UNITS.map(u => { const n = knownCount(u); return `
          <div class="card"><div class="collect-unit"><b>${esc(unitLabel(u))} ${esc(u.zh)}</b><span>${n} / ${u.words.length}</span></div>
          <div class="dex">${u.words.map(w => { const on = S.words[w.f] && S.words[w.f].known; return on
            ? `<button class="dex-card on" data-say="${esc(w.f)}"><img src="${img(w.f)}" alt="" loading="lazy"><span>${esc(w.en)}</span><small>${esc(w.zh)}</small></button>`
            : `<button class="dex-card" data-locked><img src="${img(w.f)}" alt="" loading="lazy"><span>？</span></button>`; }).join('')}</div></div>`; }).join('')}`;
    } else if (collectTab === 'cats') {
      const all = CAT_BASE.concat(CAT_UNLOCK).map(id => (window.CAT_ACTIONS || []).find(a => a.id === id)).filter(Boolean);
      body = `<div class="collect-head"><b>已解鎖 ${catsOn.length} / ${all.length} 個動作</b><span>每學完一個單元，就會解鎖一個新動作</span></div>
        <div class="card"><div class="cat-grid">${all.map(a => { const on = catsOn.includes(a.id); const i = CAT_UNLOCK.indexOf(a.id); return `
          <button class="cat-cell ${on ? 'on' : ''}" data-cat="${a.id}" ${on ? '' : 'data-locked'}>
            <span class="cat-thumb" style="background-image:url(img/cat/anim/${a.id}.webp)"></span>
            <b>${on ? esc(a.name) : '？？？'}</b>${on ? '' : `<span>學完 ${i + 1} 個單元</span>`}
          </button>`; }).join('')}</div></div>`;
    } else {
      body = `<div class="collect-head"><b>已解鎖 ${roomsOn.length} / ${ROOMS.length} 個房間</b><span>學會越多字，就會解鎖越多房間。選好的房間會出現在結算畫面。</span></div>
        <div class="list">${ROOMS.map(r => { const on = roomsOn.includes(r.id), cur = roomNow() === r.id; return `
          <div class="card room-card ${on ? '' : 'locked'}">
            <div class="room-thumb"><i style="background-image:url(img/room/room-${r.id}.webp)"></i>${on ? '' : `<span>學會 ${r.need} 個字解鎖<br>（還差 ${r.need - k} 個）</span>`}</div>
            <div class="room-row"><b>${on ? esc(r.name) : '？？？'}</b>${on ? (cur ? '<span class="pill purple">使用中</span>' : `<button class="btn small" data-room="${r.id}">使用這間</button>`) : '<span class="pill">還沒解鎖</span>'}</div>
          </div>`; }).join('')}</div>`;
    }
    render(`
      <div class="hello"><h1 style="font-size:24px;font-weight:900">我的收藏</h1><span class="pill purple fish-pill" data-fish><img src="img/fish/fish.webp" alt="">小魚乾 <span data-count="${S.fish}">${S.fish}</span></span></div>
      <div class="seg collect-tabs">${tabs.map(([id, n]) => `<button data-tab="${id}" class="${collectTab === id ? 'on' : ''}">${n}</button>`).join('')}</div>
      ${body}
    `, 'collect');
    view.querySelectorAll('.collect-tabs button').forEach(b => b.onclick = () => pageCollect(b.dataset.tab));
    view.querySelectorAll('[data-say]').forEach(b => b.onclick = () => say(WORDS[b.dataset.say].en, false, true));
    view.querySelectorAll('.dex-card[data-locked]').forEach(b => b.onclick = () => toast('這個字還沒學會喔'));
    view.querySelectorAll('.cat-cell').forEach(b => b.onclick = () => {
      if (b.hasAttribute('data-locked')) return toast('學完更多單元就會解鎖');
      const a = (window.CAT_ACTIONS || []).find(x => x.id === b.dataset.cat);
      const m = document.createElement('div'); m.className = 'fx-modal';
      m.innerHTML = `<div class="fx-modal-card"><div class="fx-cat" style="width:220px;height:220px"></div><b>${esc(a.name)}</b><button type="button">好</button></div>`;
      document.body.appendChild(m);
      const p = CatPlayer(m.querySelector('.fx-cat'), { only: a.id });
      const close = () => { p.stop(); m.remove(); };
      m.querySelector('button').onclick = close; m.onclick = e => { if (e.target === m) close(); };
    });
    view.querySelectorAll('[data-room]').forEach(b => b.onclick = () => { S.room = b.dataset.room; save(); toast('換好了'); pageCollect(); });
    if (collectTab === 'bowl') { addCat(view.querySelector('#bowlCat')); bindRewards(() => pageCollect()); }
  }

  // ---------- 獎勵 ----------
  function pageReward() {
    render(`
      <div class="hello"><h1 style="font-size:24px;font-weight:900">獎勵</h1><span class="pill purple fish-pill" data-fish style="font-size:14px;padding:6px 12px"><img src="img/fish/fish.webp" alt="">小魚乾 <span data-count="${S.fish}">${S.fish}</span></span></div>
      <p class="muted" style="font-size:13px">答對一題 +1，練完一輪 +5，學完一個單元 +30。選一張當目標慢慢存，存夠了就按「兌換」。</p>
      ${rewardListHtml()}
      ${redeemedHtml()}
    `, 'reward');
    bindRewards(pageReward);
  }

  // ---------- 更新日誌 ----------
  // 每次更新網站，在最上面加一筆（id 要比上一筆大），用白話寫給 Lara 看
  const CHANGELOG = [
    { id: 13, date: '11/27', items: [
      '首頁「今天也來學一點英文」下面多了三顆按鈕：連續天數、小魚乾、設定，比較好按。',
      '最下面的「首頁、單元、錯題本、收藏、獎勵」換成可愛的小圖。',
      '點首頁的三花貓，牠頭上會跟妳說話喔，多點幾下看看～',
      '兌換獎勵時會跳出一張可愛的兌換券，請截圖給 Alex 就可以兌換囉！'
    ] },
    { id: 12, date: '11/27', items: [
      '主畫面的圖示換成「三花貓從書本後面探頭」，名字改成「Lara努力學習」。桌面上的舊圖示不會自己換，想換新圖示的話，請照 Alex 給妳的步驟做（要先備份，不然進度會不見）。'
    ] },
    { id: 11, date: '11/27', items: [
      '網站有新版本時，打開 App 會自動換成最新版，不用再自己關掉重開。'
    ] },
    { id: 10, date: '11/27', items: [
      '剛打開網站時，第一次點貓咪或單字圖比較不會卡、不會沒聲音了。'
    ] },
    { id: 9, date: '11/27', items: [
      '設定裡多了「更新日誌」，網站有新東西時，首頁右上角的「設定」旁邊會出現「!」提醒妳。',
      '每隔 3 天，首頁會提醒妳備份一次學習進度。按「現在備份」，選 LINE 傳給自己就好；進度不見時，在 LINE 點開那個檔案，到「設定 → 匯入備份」就能找回來。'
    ] },
    { id: 8, date: '11/27', items: [
      '例句和對話裡的每個英文字都可以點，會跳出小卡，告訴妳這個字的中文、音標、詞性，還可以聽發音。',
      '首頁的三花貓可以連續點，點幾下就喵幾下。',
      '發音更穩定，比較不會按了沒聲音。如果還是沒聲音，可以到「設定 → 聲音測試」看看。',
      '練習時上面的進度條跟題號對齊了，最後一題剛好滿格。'
    ] },
    { id: 7, date: '11/27', items: [
      '錯題本上面的三格（現在該複習、還在練習、已經很熟）都可以點，下面的按鈕會跟著換。',
      '錯題本也是一輪 10 個字，練完可以選「再來 10 個」。',
      '按「還不熟」的字會另外記成「還不熟幾次」，不會算成答錯。',
      '單字卡翻到背面後，可以按「翻回正面」。'
    ] },
    { id: 6, date: '11/27', items: [
      '單字下面加上了 KK 音標，是照課本抄的。',
      '「慢速」唸得更慢了，片語的字和字之間會停一下。',
      '發音換成比較自然的女生聲音。',
      '拿掉了背景音樂。'
    ] },
    { id: 5, date: '11/27', items: [
      '獎勵改成四張兌換券：古早味冰冰、小木屋鬆餅、壽司郎、萬用許願兌換券。可以選一張「設為目標」，存夠了就按「兌換」，換過的會留在「我兌換過的」。',
      '碗裡的小魚乾會跟著妳存的數量變多，存夠目標時會滿出來。'
    ] },
    { id: 4, date: '11/27', items: [
      '新增「收藏」：可以看到我的碗、單字圖鑑（學會的字會亮起來）、三花貓的動作、房間。',
      '學會越多字、學完越多單元，就會解鎖新的貓咪動作和房間。'
    ] },
    { id: 3, date: '11/27', items: [
      '單字卡一輪 10 個字，學完會到結算畫面，小魚乾會一隻隻掉進碗裡，再問妳要不要再 10 個。',
      '測驗的題目和選項縮小了，整題放得進一個畫面，不用往下滑。'
    ] }
  ];
  const LATEST_LOG = CHANGELOG[0].id;
  function hasNewLog() { return (S.seenLog || 0) < LATEST_LOG; }
  function pageLog() {
    const seen = S.seenLog || 0;
    render(`
      ${topBar('更新日誌', '', '#settings')}
      <div class="card log-tip"><b>看到新東西了嗎？</b><p>網站現在會自動換成最新版。如果覺得畫面怪怪的、新功能沒出現，請把舊的分頁關掉再重新打開；從主畫面三花貓圖示打開的，就從下往上滑把它完全關掉，再重新點開。</p></div>
      <div class="list">
        ${CHANGELOG.map(c => `<div class="card log-item">
          <div class="log-head"><b>${esc(c.date)} 更新</b>${c.id > seen ? '<span class="log-new">新</span>' : ''}</div>
          <ul>${c.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
        </div>`).join('')}
      </div>
    `, null, true);
    bindBack('#settings');
    if (seen < LATEST_LOG) { S.seenLog = LATEST_LOG; save(); }
  }

  // ---------- 設定 ----------
  function pageSettings() {
    loadVoices();
    const cur = pickVoice() || voices.find(v => v.name === defaultVoiceName());
    render(`
      ${topBar('設定', '', '#home')}
      <button class="card log-entry" data-go="#log"><span><b>更新日誌</b><small>網站改了什麼，用白話告訴妳</small></span>${hasNewLog() ? '<span class="bang big">!</span>' : '<span class="muted" style="font-size:13px">看看</span>'}</button>
      <div class="card" style="display:flex;flex-direction:column;gap:10px">
        <b style="font-weight:900">發音速度</b>
        <div class="seg" id="rate">${[[0.75, '慢一點'], [0.9, '正常'], [1, '快一點']].map(([v, n]) => `<button data-v="${v}" class="${S.settings.rate === v ? 'on' : ''}">${n}</button>`).join('')}</div>
        <b style="font-weight:900;margin-top:6px">發音的聲音</b>
        ${voices.length ? `<select class="field" id="voice">${voices.map(v => `<option value="${esc(v.name)}" ${cur && cur.name === v.name ? 'selected' : ''}>${esc(v.name)}（${esc(v.lang)}）</option>`).join('')}</select><button class="btn soft small" id="tv">試聽</button>` : '<span class="muted" style="font-size:13px">找不到英文語音</span>'}
        <b style="font-weight:900;margin-top:6px">聲音測試</b>
        <p class="muted" style="font-size:12px">沒聽到聲音時，按下面三個試試看，再把結果告訴 Alex。</p>
        <div class="seg" id="sndtest"><button data-t="say">發音</button><button data-t="slow">慢速發音</button><button data-t="correct">答對（木琴）</button><button data-t="wrong">答錯（噔）</button></div>
        <span class="muted" style="font-size:12px" id="sndstate"></span>
        <details><summary class="muted" style="font-size:12px">最近的發音紀錄（沒聲音時截圖給 Alex）</summary><pre id="saylog" style="font-size:11px;white-space:pre-wrap;margin:6px 0 0">${esc(sayLog.join('\n') || '還沒有紀錄')}</pre></details>
        <b style="font-weight:900;margin-top:6px">音效</b>
        <div class="seg" id="snd"><button data-v="1" class="${S.settings.sound ? 'on' : ''}">開</button><button data-v="0" class="${S.settings.sound ? '' : 'on'}">關</button></div>
      </div>
      <div class="card" style="display:flex;flex-direction:column;gap:10px">
        <b style="font-weight:900">備份進度</b>
        <p class="muted" style="font-size:13px">進度只存在這支手機裡。按「匯出備份」，選 LINE 傳給自己；換手機或進度不見時，在 LINE 點開那個檔案存到手機，再按「匯入備份」選它就能找回來。${S.lastBackup ? `上次備份：${Math.floor((Date.now() - S.lastBackup) / DAY)} 天前` : '還沒備份過'}</p>
        <div class="pair"><button class="btn ghost small" id="exp">匯出備份</button><button class="btn ghost small" id="imp">匯入備份</button></div>
        <input type="file" id="file" accept="application/json,.json" hidden>
      </div>
      <p class="muted" style="font-size:12px;text-align:center">建議用 Safari 的「分享 → 加入主畫面」，從主畫面打開，進度比較不會被清掉。</p>
    `, null, true);
    bindBack('#home');
    bindGo();
    view.querySelectorAll('#rate button').forEach(b => b.onclick = () => { S.settings.rate = +b.dataset.v; save(); pageSettings(); say('lasagna'); });
    view.querySelectorAll('#sndtest button').forEach(b => b.onclick = () => {
      FX.unlock();
      if (b.dataset.t === 'say') say('lasagna', false, true); else if (b.dataset.t === 'slow') say('lasagna', true, true); else FX.sound(b.dataset.t);
      setTimeout(() => { const el = view.querySelector('#sndstate'); if (el) el.textContent = '音效狀態：' + FX.state() + (navigator.audioSession ? '・' + navigator.audioSession.type : ''); }, 300);
    });
    view.querySelectorAll('#snd button').forEach(b => b.onclick = () => { S.settings.sound = b.dataset.v === '1'; save(); syncSound(); pageSettings(); snd('correct'); });
    const v = view.querySelector('#voice'); if (v) v.onchange = () => { S.settings.voice = v.value; save(); say('I would like the lasagna, please.'); };
    const tv = view.querySelector('#tv'); if (tv) tv.onclick = () => say('I would like the lasagna, please.', false, true);
    view.querySelector('#exp').onclick = async () => { if (await backupNow()) pageSettings(); };
    const file = view.querySelector('#file');
    view.querySelector('#imp').onclick = () => file.click();
    file.onchange = () => {
      const f = file.files[0]; if (!f) return;
      f.text().then(t => {
        const d = JSON.parse(t);
        if (!d || typeof d.words !== 'object') throw new Error();
        S = Object.assign(blank(), d); save(); toast('匯入好了'); go('#home');
      }).catch(() => toast('這個檔案不是備份檔'));
    };
  }

  // ---------- 路由 ----------
  function route() {
    stopMic();
    clearTimeout(autoT);
    earned = 0;
    const [p, a] = location.hash.replace(/^#/, '').split('/');
    switch (p) {
      case 'units': return pageUnits();
      case 'unit': return pageUnit(a);
      case 'flash': return pageFlash(a);
      case 'quiz': return pageQuiz(a);
      case 'listen': return pageListen(a);
      case 'spell': return pageSpell(a);
      case 'speak': return pageSpeak(a);
      case 'fill': return pageFill(a);
      case 'review': return pageReview();
      case 'review-go': return pageReviewGo(a);
      case 'reward': return pageReward();
      case 'collect': return pageCollect(a);
      case 'settings': return pageSettings();
      case 'log': return pageLog();
      case '_': return;
      case 'demo-finish': { // 結算畫面示範（不會真的加小魚乾）
        earned = 8;
        return finish(unitOf('1-1'), { learned: 8, total: 10, back: '#home', again: '再來 10 個', seenN: 10, unitN: 37, demo: true });
      }
      default: return pageHome();
    }
  }

  // iOS 需要使用者先點一下才能出聲
  // 一般按鈕的點擊音效；本身有聲音的按鈕（答題、發音、記住了、兌換⋯）不另外出聲
  const OWN_SOUND = '[data-own-sound], #opts button, .chip, [data-say], #lp, #ls, #p1, #p2, #ps, #mic, #chk, [data-redeem], .line, #yes';
  // 手指一碰到就出聲（不等放開）
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('button, a');
    if (!b || b.disabled || b.closest(OWN_SOUND) || b.matches(OWN_SOUND)) return;
    snd('tap');
  }, true);
  // 背景音樂：Alex 2026-11-27 決定拿掉（iPhone 上一直不穩）。音檔 sounds/bgm.mp3 已移除。

  // iPhone：靜音開關打開時也要出聲（Safari 17 以上支援）
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  document.addEventListener('pointerdown', () => FX.unlock(), { capture: true, passive: true });
  ['touchend', 'click'].forEach(t => document.addEventListener(t, () => FX.unlock(), { capture: true, passive: true }));
  document.addEventListener('touchstart', e => { FX.unlock(); unlockSpeech(e); }, { once: true, passive: true });
  document.addEventListener('click', e => { FX.unlock(); unlockSpeech(e); }, { once: true });

  // ---------- 自動換新版 ----------
  // GitHub Pages 會讓手機暫存網頁 10 分鐘。這裡每次打開或切回 App 都去看 version.json（不走暫存），
  // 有新版就換一個網址重新載入，避開暫存。sessionStorage 記住試過的版本，不會一直重載。
  async function checkUpdate() {
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const v = (await r.json()).v;
      if (!(v > APP_VERSION)) return;
      let tried = ''; try { tried = sessionStorage.getItem('lara-reload'); } catch (e) {}
      if (tried === String(v)) return;
      try { sessionStorage.setItem('lara-reload', String(v)); } catch (e) {}
      location.replace(location.pathname + '?u=' + v + location.hash);
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });

  async function start() {
    checkUpdate();
    load(); syncSound();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    UNITS = await fetch('data/units.json').then(r => r.json());
    UNITS.forEach(u => u.words.forEach(w => { WORDS[w.f] = w; }));
    try { const k = await fetch('data/kk.json?v=1').then(r => r.ok ? r.json() : null); if (k) KK = k; } catch (e) {}
    try { const d = await fetch('data/dict.json?v=1').then(r => r.ok ? r.json() : null); if (d) DICT = d; } catch (e) {}
    try {
      const s = await fetch('data/sentences.json').then(r => r.ok ? r.json() : null);
      if (s) { SENT = s.sentences || {}; DIALOGUES = s.dialogues || []; }
    } catch (e) {}
    window.addEventListener('hashchange', route);
    route();
  }
  start();
})();
