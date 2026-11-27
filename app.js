// Lara 的英文學習網站：單頁程式，進度存在手機本機（localStorage）。
(function () {
  'use strict';
  const KEY = 'lara-english-v1';
  const DAY = 86400000;
  const INTERVAL = [0, 1, 2, 4, 7, 15]; // 答對後隔幾天再出現（依熟練程度）
  const ROUND = 10;

  let UNITS = [], WORDS = {}, SENT = {}, DIALOGUES = [];
  let S; // 存檔
  const view = document.getElementById('view');
  const nav = document.getElementById('nav');

  // ---------- 存檔 ----------
  function blank() {
    return { v: 1, words: {}, fish: 0, streak: { last: '', count: 0 }, doneUnits: [], rewards: [], redeemed: [], settings: { rate: 0.9, voice: '', sound: true } };
  }
  function load() {
    try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = blank(); }
    S.settings = Object.assign(blank().settings, S.settings || {});
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
  const BOWL = (location.search.match(/bowl=(pink|paw|wood)/) || [])[1] || 'pink'; // 碗的樣式：pink（貓耳粉紅碗）、paw（掌印白碗）、wood（木碗）
  let earned = 0;
  function earn(n) { earned += n; }
  function addFish(n, fromEl) {
    S.fish += n; save();
    const badge = document.querySelector('[data-fish]');
    if (badge) { const c = badge.querySelector('[data-count]'); if (c) { c.dataset.count = S.fish; c.textContent = S.fish; } }
    if (fromEl) FX.visual('fish', null, fromEl, badge, n);
  }

  // 錯題本：答錯過、還沒練熟的字
  function weakList() { return Object.keys(S.words).filter(f => WORDS[f] && S.words[f].miss > 0 && S.words[f].box < 4); }
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
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
  }
  function snd(kind) { if (S.settings.sound) FX.sound(kind); }
  function syncSound() { window.FX_SOUND_ON = !!S.settings.sound; }

  // ---------- 發音 ----------
  let voices = [];
  function loadVoices() { voices = (window.speechSynthesis ? speechSynthesis.getVoices() : []).filter(v => /^en(-|_)/i.test(v.lang)); }
  // iPhone 上「列出來但沒下載」的語音會沒聲音，所以只有 Lara 在設定裡自己選過才指定語音，
  // 否則交給手機用預設的英文語音。
  function pickVoice() {
    if (S.settings.voice) { const v = voices.find(v => v.name === S.settings.voice); if (v) return v; }
    return null;
  }
  function defaultVoiceName() {
    const us = voices.filter(v => /en(-|_)US/i.test(v.lang));
    const d = us.find(v => v.default) || us[0] || voices[0];
    return d ? d.name : '';
  }
  let sayTimer = null;
  function say(text, slow, retry) {
    try {
      const s = window.speechSynthesis; if (!s) return;
      clearTimeout(sayTimer);
      const go = () => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        const v = retry ? null : pickVoice(); if (v) u.voice = v;
        u.rate = slow ? 0.55 : S.settings.rate;
        let started = false;
        u.onstart = () => { started = true; };
        s.resume(); // iPhone 有時會卡在暫停狀態
        s.speak(u);
        // 1.5 秒內沒開始講，就不指定語音再試一次
        if (!retry) sayTimer = setTimeout(() => { if (!started && !s.speaking) { s.cancel(); say(text, slow, true); } }, 1500);
      };
      // 先取消再馬上講，Safari 常會吃掉；有東西在講才取消，並稍等一下
      if (s.speaking || s.pending) { s.cancel(); sayTimer = setTimeout(go, 80); } else go();
    } catch (e) {}
  }
  // 第一次碰螢幕時，在使用者手勢裡先講一個無聲的字，iPhone 之後才會讓程式出聲
  function unlockSpeech() {
    try {
      const s = window.speechSynthesis; if (!s) return;
      const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'en-US'; s.speak(u);
    } catch (e) {}
  }
  if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

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
      <div class="hello">
        <div><h1>${greet()}，Lara</h1><p class="muted" style="font-size:14px">今天也來學一點英文</p></div>
        <div class="badges">
          ${st >= 1 ? `<span class="pill warm" data-streak>連續 ${st} 天</span>` : ''}
          <span class="pill purple fish-pill" data-fish><img src="img/fish/fish.webp" alt="">小魚乾 <span data-count="${S.fish}">${S.fish}</span></span>
          <a href="#settings" class="muted" style="font-size:12px;font-weight:800;text-decoration:none;padding:2px 4px">設定</a>
        </div>
      </div>
      <div class="hero">
        <div class="txt">
          <span class="k">繼續學習・單元 ${esc(unitLabel(u))}</span>
          <h2>${esc(u.zh)}</h2>
          <span class="s">${esc(u.en)}・${n} 個單字</span>
          <button class="go" data-go="#flash/${u.id}">繼續學習</button>
        </div>
        <div class="cat" id="heroCat"></div>
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
      <div class="card row-card">
        <div><b style="font-size:15px;font-weight:900">錯題本</b><p class="muted" style="font-size:12px;margin-top:2px">${due ? `有 ${due} 個字該複習了` : weakList().length ? '今天沒有要複習的字' : '還沒有答錯的字'}</p></div>
        <button class="btn small" style="background:var(--warm-bg);color:var(--warm)" data-go="#review">去看看</button>
      </div>
    `, 'home');
    bindGo();
    addCat(view.querySelector('#heroCat'));
  }
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
        ${u.words.map(w => `<button class="word ${S.words[w.f] && S.words[w.f].known ? 'known' : ''}" data-say="${esc(w.f)}"><img class="wimg" src="${img(w.f)}" alt="" loading="lazy"><b>${esc(w.en)}</b><span>${esc(w.zh)}</span></button>`).join('')}
      </div>
    `, 'units');
    bindBack('#units'); bindGo();
    view.querySelectorAll('[data-say]').forEach(b => b.onclick = () => say(WORDS[b.dataset.say].en));
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
    function show() {
      if (i >= order.length) return finish(u, { learned: remembered, total: order.length, back: '#unit/' + u.id, again: '再來 10 個', seenN: seen.size, unitN: u.words.length });
      const f = order[i], w = WORDS[f], s = sentenceFor(f);
      render(`
        ${topBar('單字卡・' + unitLabel(u), `${i + 1} / ${order.length}`, '#unit/' + u.id)}
        <div class="bar"><div style="width:${(i / order.length) * 100}%"></div></div>
        <div class="card fc" id="fc">
          <img class="wimg" src="${img(f)}" alt="">
          <div class="word-big">${esc(w.en)}</div>
          <div class="play-row"><button class="btn" id="p1" data-own-sound>播放</button><button class="btn ghost" id="p2" data-own-sound>慢速</button></div>
          <div style="border-top:1px dashed #F6DDE7;padding-top:12px;display:flex;flex-direction:column;gap:10px;align-items:center">
            ${flipped ? `<div class="zh-big">${esc(w.zh)}</div>${s ? `<button class="sent" id="ps" data-own-sound><span class="e">${markIn(s.en, keyOf(f))}</span><span class="z">${esc(s.zh)}</span></button>` : ''}`
              : `<button class="btn soft" id="flip">翻面看中文</button>`}
          </div>
        </div>
        <div class="pair"><button class="b-bad" id="no">還不熟</button><button class="b-good" id="yes" data-own-sound>記住了</button></div>
      `, null, true);
      bindBack();
      view.querySelector('#p1').onclick = () => say(w.en);
      view.querySelector('#p2').onclick = () => say(w.en, true);
      const fl = view.querySelector('#flip'); if (fl) fl.onclick = () => { flipped = true; show(); };
      const ps = view.querySelector('#ps'); if (ps) ps.onclick = () => say(s.en);
      view.querySelector('#no').onclick = () => { const x = W(f); x.miss++; x.box = 0; x.due = Date.now(); seen.add(f); save(); dayFx(); i++; flipped = false; show(); };
      view.querySelector('#yes').onclick = e => {
        const x = W(f); const first = !x.known; x.known = true; if (!x.due) { x.box = Math.max(x.box, 1); x.due = startOfToday() + DAY; }
        remembered++; seen.add(f); save(); dayFx();
        if (first) earn(1);
        snd('correct'); FX.visual('correct', null, e.currentTarget);
        i++; flipped = false; setTimeout(show, 220);
      };
      setTimeout(() => say(w.en), 200);
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
      if (i >= opts.items.length) return finish(opts.unit, { right, total: opts.items.length, back: opts.back, wrongs });
      const f = opts.items[i];
      const q = opts.build(f);
      render(`
        ${topBar(opts.title, `${i + 1} / ${opts.items.length}`, opts.back)}
        <div class="bar"><div style="width:${(i / opts.items.length) * 100}%"></div></div>
        <div class="card q-card" id="qc">${q.html}</div>
        <div class="${q.kind === 'img' ? 'img-opts' : 'opts'}" id="opts">
          ${q.choices.map((c, k) => q.kind === 'img'
            ? `<button class="img-opt" data-k="${k}"><img class="wimg" src="${img(c.f)}" alt=""><div class="cap"></div></button>`
            : `<button class="opt" data-k="${k}">${esc(c.label)}</button>`).join('')}
        </div>
        <div id="fb"></div>
      `, null, true);
      bindBack(opts.back);
      if (q.onShow) q.onShow();
      const btns = view.querySelectorAll('#opts button');
      btns.forEach(b => b.onclick = () => {
        const c = q.choices[+b.dataset.k], ok = c.f === f;
        btns.forEach(x => { x.disabled = true; const cc = q.choices[+x.dataset.k]; if (cc.f === f) x.classList.add('right'); if (q.kind === 'img') x.querySelector('.cap').textContent = WORDS[cc.f].en; });
        if (ok) { right++; b.classList.add('right'); snd('correct'); FX.visual('correct', null, b, view.querySelector('#qc')); }
        else { b.classList.add('wrong'); wrongs.push(f); snd('wrong'); FX.visual('wrong', null, b); }
        record(f, ok);
        if (ok) earn(1);
        const w = WORDS[f];
        view.querySelector('#fb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'no'}"><span>${ok ? '答對了' : '正確答案是'}：${esc(w.en)}・${esc(w.zh)}</span></div><button class="btn" id="next" style="width:100%;margin-top:12px">下一題</button>`;
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
        html: `<button class="big-play" id="lp">播放</button><button class="btn ghost small" id="ls">慢速再聽一次</button><span class="muted" style="font-size:13px">聽聲音，選出對的圖</span>`,
        choices: shuffle([f, ...pickOthers(f, pool, 3)]).map(x => ({ f: x })),
        onShow() {
          view.querySelector('#lp').onclick = () => say(WORDS[f].en);
          view.querySelector('#ls').onclick = () => say(WORDS[f].en, true);
          setTimeout(() => say(WORDS[f].en), 300);
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
        const gap = !r ? esc(s.en) : esc(s.en.slice(0, r[0])) + '<span class="blank">&nbsp;?&nbsp;</span>' + esc(s.en.slice(r[1]));
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
        <div class="bar"><div style="width:${(i / items.length) * 100}%"></div></div>
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
      view.querySelector('#p1').onclick = () => say(w.en);
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
      setTimeout(() => say(w.en), 250);
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
        <div class="bar"><div style="width:${(i / items.length) * 100}%"></div></div>
        <div class="card q-card" id="qc">
          <img class="wimg" src="${img(f)}" alt="" style="width:50%">
          <div class="word-big">${esc(w.en)}</div>
          <span class="muted">${esc(w.zh)}</span>
          <div class="play-row"><button class="btn small" id="p1">先聽一次</button><button class="btn ghost small" id="p2">慢速</button></div>
        </div>
        ${SR ? `<button class="mic" id="mic">按我<br>開始唸</button>` : `<div class="card muted" style="font-size:14px">這個瀏覽器不能聽你唸。可以先聽一次，自己跟著唸，再按下面的按鈕。</div>`}
        <div id="fb">${result || ''}</div>
        ${SR ? `<div class="pair"><button class="b-bad" id="skip">跳過</button><button class="b-good" id="next">下一個</button></div>`
             : `<div class="pair"><button class="b-bad" id="selfno">還唸不好</button><button class="b-good" id="selfok">唸好了</button></div>`}
      `, null, true);
      bindBack();
      view.querySelector('#p1').onclick = () => say(w.en);
      view.querySelector('#p2').onclick = () => say(w.en, true);
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
      if (!result) setTimeout(() => say(w.en), 250);
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
      let e = esc(l.en);
      if (l.blank) {
        const i = l.en.toLowerCase().indexOf(l.blank.toLowerCase());
        if (i >= 0) e = esc(l.en.slice(0, i)) + `<span class="blank">${filled[k] ? esc(l.en.slice(i, i + l.blank.length)) : '&nbsp;'}</span>` + esc(l.en.slice(i + l.blank.length));
      }
      return `<button class="line ${me(l.who) ? 'me' : ''}" data-line="${k}" style="text-align:left"><span class="who">${esc(l.who)}</span><span class="e">${e}</span><span class="z">${esc(l.zh)}</span></button>`;
    }
    function show() {
      const done = cur >= blanks.length;
      const chips = shuffle(blanks.map(k => d.lines[k].blank));
      render(`
        ${topBar('情境對話', `${Math.min(cur, blanks.length)} / ${blanks.length}`, '#unit/' + u.id)}
        <div><h2 style="font-size:20px;font-weight:900">${esc(d.title)}</h2><p class="muted" style="font-size:13px">${esc(d.titleZh || '')}・點句子可以聽</p></div>
        <div class="dlg">${d.lines.map(lineHtml).join('')}</div>
        <div style="position:sticky;bottom:calc(12px + env(safe-area-inset-bottom));background:var(--bg);padding-top:8px">
        ${done ? `<button class="btn" id="fin" style="width:100%">完成</button>` : `<p style="font-size:13px;font-weight:800;margin-bottom:8px">第 ${cur + 1} 個空格要填哪個字？</p><div class="chips">${chips.map(c => `<button class="chip ${Object.values(filled).includes(c) ? 'used' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>`}
        </div>
      `, null, true);
      bindBack();
      view.querySelectorAll('[data-line]').forEach(b => b.onclick = () => say(d.lines[+b.dataset.line].en));
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
  function finish(u, r) {
    const bonus = 5;
    const unitNew = !r.demo && u && checkUnitDone(u);
    const total = earned + bonus + (unitNew ? 30 : 0);
    earned = 0;
    const pct = r.total && r.right != null ? Math.round(r.right / r.total * 100) : null;
    const before = S.fish;
    render(`
      <div class="card done-card">
        <h1 style="font-size:24px;font-weight:900">${unitNew ? esc(unitLabel(u)) + ' 學完了！' : '這一輪完成了！'}</h1>
        <div class="stats">
          <div><b>${r.learned != null ? r.learned : r.right}</b><span>${r.learned != null ? '記住了' : '答對'}</span></div>
          <div><b>${r.learned != null ? r.total - r.learned : (pct != null ? pct + '%' : '—')}</b><span>${r.learned != null ? '還不熟' : '答對率'}</span></div>
          <div class="fishy"><b>+${total}</b><span>小魚乾</span></div>
        </div>
        <div class="bowl-stage" id="stage">
          <div class="bowl-cat" id="doneCat"></div>
          <div class="bowl" id="bowl"><img id="bowlImg" src="img/bowl/${BOWL}-empty.webp" alt="碗"><span class="bowl-count" id="bowlCount">+0</span></div>
        </div>
        <p class="muted" style="font-size:13px" id="bowlMsg">小魚乾正在放進碗裡⋯</p>
        ${r.seenN != null ? `<p class="muted" style="font-size:12px">這個單元已經看過 ${r.seenN} / ${r.unitN} 個字</p>` : ''}
      </div>
      ${r.wrongs && r.wrongs.length ? `<div class="card"><b style="font-weight:900">這輪答錯的字</b><p class="muted" style="font-size:12px;margin:2px 0 8px">已經放進錯題本，之後會再出現</p><div class="list">${[...new Set(r.wrongs)].map(f => `<div class="review-row" style="box-shadow:none;background:var(--bg)"><img src="${img(f)}" alt=""><div class="t"><b>${esc(WORDS[f].en)}</b><span>${esc(WORDS[f].zh)}</span></div></div>`).join('')}</div></div>` : ''}
      <div class="card" style="text-align:center;display:flex;flex-direction:column;gap:12px">
        <b style="font-size:17px;font-weight:900">要不要${r.again ? r.again.replace('再來', '再') : '再來一輪'}？</b>
        <div class="pair"><button class="btn ghost" id="home">休息一下</button><button class="btn" id="again">${r.again || '再來 10 題'}</button></div>
      </div>
    `, null, true);
    addCat(view.querySelector('#doneCat'), { actions: unitNew ? ['pawsup', 'roll', 'belly'] : ['fish', 'wave', 'tail', 'yarn'] });
    view.querySelector('#again').onclick = () => { const h = r.demo ? '#flash/1-1' : location.hash; location.hash = '#_'; setTimeout(() => location.hash = h, 0); };
    view.querySelector('#home').onclick = () => go(r.back || '#home');
    if (!r.demo) { S.fish += total; save(); }
    fishIntoBowl(total, before);
  }
  // 小魚乾從上面一隻隻掉進碗裡，碗慢慢裝滿，最後貓咪叫一聲
  function fishIntoBowl(total, before) {
    const bowl = view.querySelector('#bowl'), stage = view.querySelector('#stage');
    const cnt = view.querySelector('#bowlCount'), bimg = view.querySelector('#bowlImg'), msg = view.querySelector('#bowlMsg');
    const shown = Math.min(total, 12); // 最多飛 12 隻，數字照實際加
    let got = 0;
    for (let k = 0; k < shown; k++) {
      setTimeout(() => {
        if (!document.body.contains(bowl)) return;
        const b = bowl.getBoundingClientRect(), st = stage.getBoundingClientRect();
        const fish = document.createElement('img');
        fish.src = 'img/fish/fish.webp'; fish.className = 'fx-fish';
        const sx = st.left + 20 + Math.random() * (st.width - 40), sy = st.top - 10;
        fish.style.left = sx + 'px'; fish.style.top = sy + 'px';
        document.getElementById('fx-layer') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'fx-layer' }));
        document.getElementById('fx-layer').appendChild(fish);
        const ex = b.left + b.width / 2 - sx, ey = b.top + b.height * 0.35 - sy;
        fish.animate([
          { transform: 'translate(-50%,-50%) rotate(-30deg) scale(0.7)', opacity: 0 },
          { transform: `translate(calc(-50% + ${ex * 0.5}px), calc(-50% + ${ey * 0.2}px)) rotate(10deg) scale(1)`, opacity: 1, offset: 0.4 },
          { transform: `translate(calc(-50% + ${ex}px), calc(-50% + ${ey}px)) rotate(40deg) scale(0.6)`, opacity: 1 }
        ], { duration: 650, easing: 'ease-in', fill: 'forwards' });
        setTimeout(() => {
          fish.remove();
          got = k === shown - 1 ? total : Math.round(total * (k + 1) / shown);
          cnt.textContent = '+' + got;
          bowl.classList.remove('fx-pop'); void bowl.offsetWidth; bowl.classList.add('fx-pop');
          bimg.src = `img/bowl/${BOWL}-${got >= total * 0.7 ? 'full' : 'few'}.webp`;
          if (k === shown - 1) {
            snd('fish');
            msg.textContent = `碗裡多了 ${total} 隻小魚乾，現在一共 ${before + total} 隻`;
            const badge = document.querySelector('[data-fish] [data-count]'); if (badge) badge.textContent = S.fish;
          }
        }, 640);
      }, 300 + k * 170);
    }
  }

  // ---------- 錯題本 ----------
  function pageReview() {
    const weak = weakList().sort((a, b) => S.words[b].miss - S.words[a].miss);
    const due = dueList();
    const goodN = Object.keys(S.words).filter(f => S.words[f].box >= 4).length;
    render(`
      <div><h1 style="font-size:24px;font-weight:900">錯題本</h1><p class="muted" style="font-size:13px">答錯的字會自動排進來，越常錯越常出現；連續答對就會畢業</p></div>
      <div class="stats">
        <div style="background:var(--warm-bg)"><b>${due.length}</b><span style="color:#6B3A08">現在該複習</span></div>
        <div style="background:#FFFFFF"><b>${weak.length}</b><span>還在練習</span></div>
        <div style="background:#FFFFFF"><b style="color:var(--good)">${goodN}</b><span>已經很熟</span></div>
      </div>
      <button class="btn" id="go" ${due.length ? '' : 'disabled'} style="width:100%">${due.length ? `開始複習 ${Math.min(due.length, 15)} 個字` : '現在沒有要複習的字'}</button>
      <div class="list">
        ${weak.map(f => { const x = S.words[f]; const d = Math.ceil((x.due - Date.now()) / DAY); return `<button class="review-row" data-say="${f}" style="text-align:left"><img src="${img(f)}" alt="" loading="lazy"><div class="t"><b>${esc(WORDS[f].en)}</b><span>${esc(WORDS[f].zh)}・${x.due <= Date.now() ? '現在複習' : d + ' 天後複習'}</span></div><span class="miss">錯 ${x.miss} 次</span></button>`; }).join('') || '<p class="muted" style="text-align:center;padding:20px">還沒有答錯的字</p>'}
      </div>
    `, 'review');
    view.querySelectorAll('[data-say]').forEach(b => b.onclick = () => say(WORDS[b.dataset.say].en));
    const g = view.querySelector('#go'); if (g) g.onclick = () => go('#review-go');
  }
  function pageReviewGo() {
    const items = shuffle(dueList()).slice(0, 15);
    if (!items.length) return go('#review');
    const pool = Object.keys(WORDS);
    // 複習用：翻字和聽音輪流
    choiceRound({
      unit: null, title: '複習', back: '#review', items,
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
          onShow() { view.querySelector('#lp').onclick = () => say(WORDS[f].en); setTimeout(() => say(WORDS[f].en), 300); }
        };
      }
    });
  }

  // ---------- 獎勵 ----------
  function pageReward() {
    const items = S.rewards;
    render(`
      <div class="hello"><h1 style="font-size:24px;font-weight:900">獎勵</h1><span class="pill purple fish-pill" data-fish style="font-size:14px;padding:6px 12px"><img src="img/fish/fish.webp" alt="">小魚乾 <span data-count="${S.fish}">${S.fish}</span></span></div>
      <p class="muted" style="font-size:13px">答對一題 +1，練完一輪 +5，學完一個單元 +30。存到了就可以換自己決定的獎勵。</p>
      <div class="list">
        ${items.map((it, k) => { const p = Math.min(100, Math.round(S.fish / it.cost * 100)); return `
          <div class="card reward"><div class="t"><div><b>${esc(it.name)}</b><span class="muted" style="font-size:12px;font-weight:800;white-space:nowrap">${it.cost} 小魚乾</span></div><div class="bar"><div style="width:${p}%"></div></div></div>
          ${S.fish >= it.cost ? `<button class="btn small" data-redeem="${k}">兌換</button>` : `<button class="btn soft small" data-del="${k}" style="padding:0 12px">刪除</button>`}</div>`; }).join('') || '<div class="card muted" style="font-size:14px">還沒有獎勵。在下面加一個自己想要的吧，例如：一杯喜歡的飲料、一本書。</div>'}
      </div>
      <div class="card" style="display:flex;flex-direction:column;gap:8px">
        <b style="font-weight:900">新增獎勵</b>
        <input class="field" id="rn" placeholder="獎勵名稱">
        <div style="display:flex;gap:8px"><input class="field" id="rc" type="number" inputmode="numeric" placeholder="要幾個小魚乾" style="flex-grow:1"><button class="btn small" id="add" style="height:46px">加入</button></div>
      </div>
      ${S.redeemed.length ? `<div class="card"><b style="font-weight:900">兌換紀錄</b><div class="list" style="margin-top:8px">${S.redeemed.slice().reverse().map(r => `<div style="display:flex;justify-content:space-between;font-size:14px"><span>${esc(r.name)}</span><span class="muted">${esc(r.date)}</span></div>`).join('')}</div></div>` : ''}
    `, 'reward');
    view.querySelector('#add').onclick = () => {
      const n = view.querySelector('#rn').value.trim(), c = parseInt(view.querySelector('#rc').value, 10);
      if (!n || !(c > 0)) return toast('請填名稱和數量');
      S.rewards.push({ name: n, cost: c }); save(); pageReward();
    };
    view.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      if (b.dataset.sure) { S.rewards.splice(+b.dataset.del, 1); save(); pageReward(); }
      else { b.dataset.sure = '1'; b.textContent = '確定？'; }
    });
    view.querySelectorAll('[data-redeem]').forEach(b => b.onclick = () => {
      const it = S.rewards[+b.dataset.redeem];
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = '確定兌換'; return; }
      S.fish -= it.cost; S.redeemed.push({ name: it.name, cost: it.cost, date: today() }); save();
      snd('complete'); toast('兌換好了：' + it.name); pageReward();
    });
  }

  // ---------- 設定 ----------
  function pageSettings() {
    loadVoices();
    const cur = pickVoice() || voices.find(v => v.name === defaultVoiceName());
    render(`
      ${topBar('設定', '', '#home')}
      <div class="card" style="display:flex;flex-direction:column;gap:10px">
        <b style="font-weight:900">發音速度</b>
        <div class="seg" id="rate">${[[0.75, '慢一點'], [0.9, '正常'], [1, '快一點']].map(([v, n]) => `<button data-v="${v}" class="${S.settings.rate === v ? 'on' : ''}">${n}</button>`).join('')}</div>
        <b style="font-weight:900;margin-top:6px">發音的聲音</b>
        ${voices.length ? `<select class="field" id="voice">${voices.map(v => `<option value="${esc(v.name)}" ${cur && cur.name === v.name ? 'selected' : ''}>${esc(v.name)}（${esc(v.lang)}）</option>`).join('')}</select><button class="btn soft small" id="tv">試聽</button>` : '<span class="muted" style="font-size:13px">找不到英文語音</span>'}
        <b style="font-weight:900;margin-top:6px">音效</b>
        <div class="seg" id="snd"><button data-v="1" class="${S.settings.sound ? 'on' : ''}">開</button><button data-v="0" class="${S.settings.sound ? '' : 'on'}">關</button></div>
      </div>
      <div class="card" style="display:flex;flex-direction:column;gap:10px">
        <b style="font-weight:900">備份進度</b>
        <p class="muted" style="font-size:13px">進度只存在這支手機裡。偶爾按一下「匯出備份」，換手機或清掉瀏覽器資料時，可以用「匯入備份」找回來。</p>
        <div class="pair"><button class="btn ghost small" id="exp">匯出備份</button><button class="btn ghost small" id="imp">匯入備份</button></div>
        <input type="file" id="file" accept="application/json,.json" hidden>
      </div>
      <p class="muted" style="font-size:12px;text-align:center">建議用 Safari 的「分享 → 加入主畫面」，從主畫面打開，進度比較不會被清掉。</p>
    `, null, true);
    bindBack('#home');
    view.querySelectorAll('#rate button').forEach(b => b.onclick = () => { S.settings.rate = +b.dataset.v; save(); pageSettings(); say('lasagna'); });
    view.querySelectorAll('#snd button').forEach(b => b.onclick = () => { S.settings.sound = b.dataset.v === '1'; save(); syncSound(); pageSettings(); snd('correct'); });
    const v = view.querySelector('#voice'); if (v) v.onchange = () => { S.settings.voice = v.value; save(); say('I would like the lasagna, please.'); };
    const tv = view.querySelector('#tv'); if (tv) tv.onclick = () => say('I would like the lasagna, please.');
    view.querySelector('#exp').onclick = () => {
      const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'lara-english-backup-' + today() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
    };
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
      case 'review-go': return pageReviewGo();
      case 'reward': return pageReward();
      case 'settings': return pageSettings();
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
  document.addEventListener('click', e => {
    const b = e.target.closest('button, a');
    if (!b || b.disabled || b.closest(OWN_SOUND) || b.matches(OWN_SOUND)) return;
    snd('tap');
  }, true);
  // iPhone：靜音開關打開時也要出聲（Safari 17 以上支援）
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  document.addEventListener('touchstart', () => { FX.unlock(); unlockSpeech(); }, { once: true, passive: true });
  document.addEventListener('click', () => { FX.unlock(); unlockSpeech(); }, { once: true });

  async function start() {
    load(); syncSound();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    UNITS = await fetch('data/units.json').then(r => r.json());
    UNITS.forEach(u => u.words.forEach(w => { WORDS[w.f] = w; }));
    try {
      const s = await fetch('data/sentences.json').then(r => r.ok ? r.json() : null);
      if (s) { SENT = s.sentences || {}; DIALOGUES = s.dialogues || []; }
    } catch (e) {}
    window.addEventListener('hashchange', route);
    route();
  }
  start();
})();
