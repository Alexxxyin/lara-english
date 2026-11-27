// 會動的三花貓：每個動作是一張 3x3 的連續畫格（ChatGPT 畫），依序播放。
// 每個動作停留 3～4 秒後自動換下一個；點一下貓咪會馬上換另一個動作。
(function () {
  const ACTIONS = [
    { id: 'roll', name: '趴著翻滾' },
    { id: 'yawn', name: '打哈欠' },
    { id: 'tail', name: '玩自己的尾巴' },
    { id: 'butterfly', name: '撲蝴蝶', keepY: true },
    { id: 'belly', name: '翻肚' },
    { id: 'pawsup', name: '四腳朝天' },
    { id: 'stretch', name: '伸懶腰' },
    { id: 'groom', name: '洗臉' },
    { id: 'wave', name: '揮手打招呼' },
    { id: 'knead', name: '踩奶' },
    { id: 'sleep', name: '縮成一團睡覺' },
    { id: 'scratch', name: '抓抓耳朵' },
    { id: 'yarn', name: '玩毛線球' },
    { id: 'fish', name: '吃小魚乾' },
    { id: 'tilt', name: '歪頭' }
  ];
  const FPS = 6;
  const sheets = {};

  // 讀取畫格，找出每格裡貓咪的範圍，之後把每格對齊（底部、左右置中），播放時才不會跳動
  function loadSheet(id) {
    if (sheets[id]) return sheets[id];
    sheets[id] = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const W = img.naturalWidth, cell = Math.floor(W / 3);
        const c = document.createElement('canvas'); c.width = W; c.height = W;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
        const frames = [];
        for (let k = 0; k < 9; k++) {
          const x0 = (k % 3) * cell, y0 = Math.floor(k / 3) * cell;
          const d = g.getImageData(x0, y0, cell, cell).data;
          let minX = cell, minY = cell, maxX = -1, maxY = -1;
          const m = Math.floor(cell * 0.02); // 忽略格子最外圈，避免鄰格的殘線
          for (let y = m; y < cell - m; y += 2) for (let x = m; x < cell - m; x += 2) {
            const i = (y * cell + x) * 4;
            if (d[i + 3] > 40 && (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235 || d[i + 3] < 250)) {
              if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
          if (maxX < 0) { minX = 0; minY = 0; maxX = cell - 1; maxY = cell - 1; }
          frames.push({ x: x0 + minX, y: y0 + minY, w: maxX - minX + 1, h: maxY - minY + 1 });
        }
        resolve({ img, cell, frames });
      };
      img.onerror = reject;
      img.src = `img/cat/anim/${id}.webp`;
    });
    return sheets[id];
  }

  function CatPlayer(box, opts) {
    opts = opts || {};
    let list = opts.actions ? ACTIONS.filter(a => opts.actions.includes(a.id)) : ACTIONS;
    if (window.CAT_READY) {
      const f = list.filter(a => window.CAT_READY.includes(a.id));
      list = f.length ? f : ACTIONS.filter(a => window.CAT_READY.includes(a.id));
    }
    if (opts.only) list = ACTIONS.filter(a => a.id === opts.only); // 收藏頁指定看某個動作
    const canvas = document.createElement('canvas');
    canvas.className = 'cat-canvas';
    box.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let cur = null, sheet = null, frame = 0, timer = null, switchAt = 0, idx = Math.floor(Math.random() * list.length);

    function size() {
      const dpr = window.devicePixelRatio || 1; // 用 clientWidth，不受彈出動畫的縮放影響
      canvas.width = Math.round((box.clientWidth || 120) * dpr); canvas.height = Math.round((box.clientHeight || 120) * dpr);
    }
    // 對齊方式：左右維持畫格裡原本的位置（貓本來就會移動）；
    // 上下預設以腳底對齊（ChatGPT 每排的地面高度常不一樣），會跳的動作（keepY）保留原本高度。
    function draw() {
      if (!sheet) return;
      const fr = sheet.frames, cell = sheet.cell, f = fr[frame], W = canvas.width, H = canvas.height;
      const rel = fr.map((q, k) => ({ x: q.x - (k % 3) * cell, y: q.y - Math.floor(k / 3) * cell, w: q.w, h: q.h }));
      const L = Math.min(...rel.map(q => q.x)), R = Math.max(...rel.map(q => q.x + q.w));
      let T, B;
      if (cur.keepY) { T = Math.min(...rel.map(q => q.y)); B = Math.max(...rel.map(q => q.y + q.h)); }
      else { T = 0; B = Math.max(...rel.map(q => q.h)); }
      const s = Math.min(W * 0.94 / (R - L), H * 0.94 / (B - T));
      const ox = (W - (R - L) * s) / 2, oy = H * 0.97 - (B - T) * s;
      const r = rel[frame];
      const dx = ox + (r.x - L) * s;
      const dy = cur.keepY ? oy + (r.y - T) * s : oy + (B - r.h) * s;
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(sheet.img, f.x, f.y, f.w, f.h, dx, dy, f.w * s, f.h * s);
    }
    async function play(i) {
      idx = (i + list.length) % list.length; cur = list[idx];
      sheet = await loadSheet(cur.id); frame = 0;
      switchAt = performance.now() + 3000 + Math.random() * 1000;
      draw();
    }
    function tick() {
      if (!sheet) return;
      frame = (frame + 1) % 9; draw();
      if (performance.now() > switchAt && frame === 0) next();
    }
    function next() {
      if (list.length < 2) { switchAt = performance.now() + 3500; return; }
      let j; do { j = Math.floor(Math.random() * list.length); } while (j === idx);
      play(j);
    }
    canvas.addEventListener('click', () => { // 搭配 CSS touch-action: manipulation，連點每一下都會收到
      if (window.FX && window.FX_SOUND_ON !== false) FX.sound('meow');
      canvas.classList.remove('cat-boop'); void canvas.offsetWidth; canvas.classList.add('cat-boop');
      next();
      if (opts.onTap) opts.onTap(cur);
    });
    const onResize = () => { size(); draw(); };
    size(); window.addEventListener('resize', onResize);
    play(idx);
    timer = setInterval(tick, 1000 / FPS);
    return { stop() { clearInterval(timer); window.removeEventListener('resize', onResize); }, next, play(id) { const i = list.findIndex(a => a.id === id); if (i >= 0) play(i); }, list, get action() { return cur; } };
  }

  window.CatPlayer = CatPlayer;
  window.CAT_ACTIONS = ACTIONS;
})();
