// 音效與特效：全部用 Web Audio 現場合成，不用外部音檔。
// 每一類有幾個選項（A、B、C…），由 FX.choice 決定網站實際用哪一個。
(function () {
  let ctx = null;
  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // 一個音：type 波形、f 頻率、t 開始秒、d 長度、v 音量、f2 結束頻率（滑音）
  function tone(o) {
    const a = ac(); if (!a) return;
    const t0 = a.currentTime + (o.t || 0);
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + (o.glide || o.d));
    const v = (o.v || 0.25) * FX.volume;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + (o.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.d);
    osc.connect(g).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + o.d + 0.05);
  }
  // 鐘聲：基音加泛音
  function bell(f, t, d, v) {
    tone({ f, t, d, v, type: 'sine' });
    tone({ f: f * 2.01, t, d: d * 0.6, v: v * 0.35, type: 'sine' });
    tone({ f: f * 3.02, t, d: d * 0.35, v: v * 0.15, type: 'sine' });
  }
  // 雜訊敲擊（木頭聲）
  function knock(t, freq, v) {
    const a = ac(); if (!a) return;
    const t0 = a.currentTime + t;
    const len = Math.floor(a.sampleRate * 0.08);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    const src = a.createBufferSource(); src.buffer = buf;
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 6;
    const g = a.createGain(); g.gain.value = v * FX.volume;
    src.connect(bp).connect(g).connect(a.destination);
    src.start(t0);
  }

  // Mixkit 免費音效（Mixkit Sound Effects Free License，可商用、免標註）。
  // 挑選時直接播放 Mixkit 網址；選定後下載到 sounds/，LOCAL 記錄已下載的。
  const LOCAL = { 2569: 'sounds/2569.mp3', 86: 'sounds/86.mp3', 600: 'sounds/600.mp3' }; // 已下載（Alex 2026-11-27 同意）
  const cache = {};
  // opts: max 最多播幾秒（之後淡出）、rate 播放速度（<1 會變慢變低）、times 連續播幾次、gap 每次間隔秒數、rates 每次的速度
  function file(name, id, opts) {
    opts = opts || {};
    return { name, id, opts, play() {
      const src = LOCAL[id] || `https://assets.mixkit.co/active_storage/sfx/${id}/${id}-preview.mp3`;
      const times = opts.times || 1;
      for (let k = 0; k < times; k++) {
        setTimeout(() => {
          const a = new Audio(src);
          const r = (opts.rates && opts.rates[k]) || opts.rate || 1;
          a.preservesPitch = false; a.mozPreservesPitch = false; a.webkitPreservesPitch = false;
          a.playbackRate = r;
          const vol = Math.min(1, 0.8 * FX.volume); a.volume = vol;
          const p = a.play(); if (p && p.catch) p.catch(() => {});
          if (opts.max) {
            setTimeout(() => {
              let v = vol; const t = setInterval(() => { v -= vol / 5; if (v <= 0) { a.pause(); clearInterval(t); } else a.volume = v; }, 20);
            }, opts.max * 1000);
          }
        }, k * (opts.gap || 0) * 1000);
      }
    } };
  }

  const SOUNDS = {
    correct: {
      A: { name: '叮咚（兩聲往上）', play() { bell(659, 0, 0.35, 0.22); bell(880, 0.11, 0.5, 0.22); } },
      B: { name: '清脆三連音', play() { [1047, 1319, 1568].forEach((f, i) => tone({ f, t: i * 0.06, d: 0.22, v: 0.16, type: 'triangle' })); } },
      C: { name: '木琴', play() { tone({ f: 784, d: 0.18, v: 0.3 }); tone({ f: 1047, t: 0.09, d: 0.3, v: 0.3 }); } },
      D: { name: '柔和一聲', play() { tone({ f: 740, f2: 990, glide: 0.08, d: 0.3, v: 0.25 }); } }
    },
    wrong: {
      A: file('益智節目「嗶」', 950, { max: 0.5 }),
      B: file('益智節目搶答「嗶」', 3090, { max: 0.5 }),
      C: file('短短的蜂鳴', 2964, { max: 0.5 }),
      D: file('輕輕的「噔」', 2569, { max: 0.5 }),
      E: file('按錯的「咔」', 1110, { max: 0.5 }),
      F: file('遊戲答錯提示', 249, { max: 0.5 }),
      G: file('「啵嗯」彈一下', 2894, { max: 0.5 }),
      H: file('短短的電子音', 2947, { max: 0.5 })
    },
    fish: {
      A: file('小貓喵（原本 C）', 86),
      B: file('同一隻貓，喵得慢一點、長一點', 86, { rate: 0.8 }),
      C: file('同一隻貓，喵得更慢更長', 86, { rate: 0.65 }),
      D: file('同一隻貓，喵喵兩聲', 86, { times: 2, gap: 0.42, rates: [1, 0.9] }),
      E: file('同一隻貓，喵喵喵三聲', 86, { times: 3, gap: 0.38, rates: [1.05, 0.95, 0.85] })
    },
    complete: {
      A: file('過關音效', 2059),
      B: file('完成成就', 2068),
      C: file('成就鈴聲', 600),
      D: file('勝利風鈴', 2015),
      E: file('奇幻遊戲成功', 270),
      F: file('仙子勝利音', 2019),
      G: file('泡泡成就音', 3193),
      H: file('一小群人鼓掌', 523)
    },
    // 點貓咪時的叫聲：Alex 選的「同一隻貓，喵得慢一點、長一點」
    meow: {
      A: file('點貓咪的喵', 86, { rate: 0.8 })
    },
    tap: {
      A: { name: '輕點一下', play() { tone({ f: 1200, d: 0.04, v: 0.08 }); } },
      B: { name: '不要聲音', play() {} }
    }
  };

  // ---------- 畫面特效 ----------
  function once(el, cls, ms) {
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms || 700);
  }
  function rectOf(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function layer() {
    let l = document.getElementById('fx-layer');
    if (!l) { l = document.createElement('div'); l.id = 'fx-layer'; document.body.appendChild(l); }
    return l;
  }

  const VISUALS = {
    correct: {
      A: { name: '變綠並輕輕彈一下', run(el) { once(el, 'fx-pop'); } },
      B: { name: '綠色圓圈往外擴散', run(el) {
        const p = rectOf(el), r = document.createElement('div');
        r.className = 'fx-ring'; r.style.left = p.x + 'px'; r.style.top = p.y + 'px';
        layer().appendChild(r); setTimeout(() => r.remove(), 700);
      } },
      C: { name: '整張卡片往上跳', run(el, card) { once(card || el, 'fx-hop'); } }
    },
    wrong: {
      A: { name: '左右搖一搖', run(el) { once(el, 'fx-shake', 500); } },
      B: { name: '變淡縮一下', run(el) { once(el, 'fx-dim', 500); } }
    },
    fish: {
      A: { name: '「+10」往上飄', run(from, to, n) {
        const p = rectOf(from), t = document.createElement('div');
        t.className = 'fx-float'; t.textContent = '+' + n + ' 小魚乾';
        t.style.left = p.x + 'px'; t.style.top = p.y + 'px';
        layer().appendChild(t); setTimeout(() => t.remove(), 1100);
      } },
      B: { name: '小圓點飛進小魚乾計數', run(from, to, n) {
        const a = rectOf(from), b = rectOf(to || from);
        const k = Math.min(8, Math.max(3, Math.round(n / 3)));
        for (let i = 0; i < k; i++) {
          const d = document.createElement(FX.fishImg ? 'img' : 'div'); d.className = FX.fishImg ? 'fx-fish' : 'fx-dot';
          if (FX.fishImg) d.src = FX.fishImg;
          d.style.left = a.x + 'px'; d.style.top = a.y + 'px';
          layer().appendChild(d);
          const dx = (Math.random() - 0.5) * 80, dy = -30 - Math.random() * 40;
          d.animate([
            { transform: 'translate(-50%,-50%) scale(0.6)' },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`, offset: 0.35 },
            { transform: `translate(calc(-50% + ${b.x - a.x}px), calc(-50% + ${b.y - a.y}px)) scale(0.5)` }
          ], { duration: 750, delay: i * 50, easing: 'ease-in-out', fill: 'forwards' });
          setTimeout(() => d.remove(), 850 + i * 50);
        }
        if (to) setTimeout(() => once(to, 'fx-pop'), 700);
      } },
      C: { name: '計數器彈跳、數字往上滾', run(from, to, n) {
        if (!to) return;
        once(to, 'fx-pop');
        const span = to.querySelector('[data-count]');
        if (!span) return;
        const end = +span.dataset.count, start = end - n, t0 = performance.now();
        (function step(now) {
          const k = Math.min(1, (now - t0) / 600);
          span.textContent = Math.round(start + (end - start) * k);
          if (k < 1) requestAnimationFrame(step);
        })(t0);
      } }
    },
    streak: {
      A: { name: '徽章放大彈跳', run(badge) { once(badge, 'fx-big', 900); } },
      B: { name: '跳出三花貓小卡', run(badge, days) {
        const m = document.createElement('div'); m.className = 'fx-modal';
        m.innerHTML = `<div class="fx-modal-card"><div class="fx-cat"></div><b>連續 ${days} 天</b><span>有空就來，一點點也很好</span><button type="button">好</button></div>`;
        let cat = null;
        const close = () => { if (cat) cat.stop(); m.remove(); };
        m.querySelector('button').onclick = close;
        m.onclick = e => { if (e.target === m) close(); };
        document.body.appendChild(m);
        if (window.CatPlayer) cat = CatPlayer(m.querySelector('.fx-cat'), { actions: ['wave', 'roll', 'belly', 'pawsup', 'tail', 'butterfly'] });
      } },
      C: { name: '一排圓點逐一填滿', run(badge, days) {
        const m = document.createElement('div'); m.className = 'fx-dots-toast';
        const n = Math.min(7, days);
        m.innerHTML = `<span>連續 ${days} 天</span><div>${Array.from({ length: 7 }, (_, i) => `<i style="animation-delay:${i * 0.12}s" class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`;
        document.body.appendChild(m); setTimeout(() => m.remove(), 2400);
      } }
    }
  };

  const FX = {
    volume: 1,
    fishImg: 'img/fish/fish-1.webp', // Alex 選第 1 種
    SOUNDS, VISUALS,
    // 網站目前使用的選項（Alex 挑完後改這裡）
    choice: { correct: 'C', wrong: 'D', fish: 'A', complete: 'C', meow: 'A', tap: 'B', vCorrect: 'A', vWrong: 'A', vFish: 'B', vStreak: 'B' },
    sound(kind, opt) {
      try { const s = SOUNDS[kind][opt || this.choice[kind]]; if (s) s.play(); } catch (e) {}
    },
    visual(kind, opt, ...args) {
      try { const v = VISUALS[kind][opt || this.choice['v' + kind[0].toUpperCase() + kind.slice(1)]]; if (v) v.run(...args); } catch (e) {}
    },
    unlock() { ac(); }
  };
  // 點螢幕時出現貓咪掌印
  FX.pawImg = 'img/paw/paw-2.webp'; // Alex 選第 2 種（三花配色）
  function paw(e) {
    if (!FX.pawImg) return;
    const p = e.touches ? e.touches[0] : e;
    const el = document.createElement('img');
    el.src = FX.pawImg; el.className = 'fx-paw'; el.alt = '';
    el.style.left = p.clientX + 'px'; el.style.top = p.clientY + 'px';
    el.style.setProperty('--rot', (Math.random() * 40 - 20).toFixed(0) + 'deg');
    layer().appendChild(el);
    setTimeout(() => el.remove(), 650);
  }
  document.addEventListener('pointerdown', paw, { passive: true });
  window.FX = FX;
})();
