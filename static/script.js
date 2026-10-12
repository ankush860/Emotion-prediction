(() => {
  const EMOJI = { sadness: "😢", joy: "😄", love: "❤️", anger: "😠", fear: "😨", surprise: "😲" };
  const EXAMPLES = [
    "I feel so happy and excited today",
    "I can't stop crying, everything hurts",
    "I am absolutely furious with him",
    "I'm terrified of what comes next",
    "I adore you more than words can say",
    "I never expected this to happen!",
  ];
  const $ = (id) => document.getElementById(id);
  const textEl = $("text"), goBtn = $("go"), errEl = $("error"), resultEl = $("result");
  const RING_LEN = 326.7;
  let history = [];
  try { history = JSON.parse(localStorage.getItem("moodlens_history") || "[]"); } catch (_) {}

  /* ---------- Particle background ---------- */
  const canvas = $("bg"), ctx = canvas.getContext("2d");
  let W, H, pts = [], mouse = { x: -999, y: -999 };
  function resize() {
    W = canvas.width = innerWidth; H = canvas.height = innerHeight;
    const n = Math.min(90, Math.floor((W * H) / 20000));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, r: Math.random() * 1.6 + 0.4,
    }));
  }
  function accent() { return getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#8b7bff"; }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const c = accent();
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy);
      if (d < 140) { p.x += (dx / d) * 1.2; p.y += (dy / d) * 1.2; }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283);
      ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fill();
    }
    ctx.strokeStyle = c;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d < 110) {
        ctx.globalAlpha = (1 - d / 110) * 0.22;
        ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  addEventListener("resize", resize); resize(); draw();

  /* ---------- Cursor glow + card tilt ---------- */
  const glow = $("cursorGlow");
  addEventListener("pointermove", (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    glow.style.opacity = 1; glow.style.left = e.clientX + "px"; glow.style.top = e.clientY + "px";
  });
  document.addEventListener("pointerleave", () => { glow.style.opacity = 0; mouse.x = mouse.y = -999; });
  document.querySelectorAll(".tilt").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(1000px) rotateX(${-y * 3}deg) rotateY(${x * 3}deg)`;
    });
    el.addEventListener("pointerleave", () => (el.style.transform = ""));
  });

  /* ---------- Chips ---------- */
  const chips = $("chips");
  EXAMPLES.slice(0, 3).forEach((t) => {
    const b = document.createElement("button");
    b.className = "chip"; b.type = "button"; b.textContent = t.length > 26 ? t.slice(0, 24) + "…" : t;
    b.onclick = () => { setText(t); analyze(); };
    chips.appendChild(b);
  });
  function setText(t) { textEl.value = t; sync(); textEl.focus(); }

  /* ---------- Input state ---------- */
  function sync() {
    $("count").textContent = textEl.value.length;
    goBtn.disabled = !textEl.value.trim();
    textEl.style.height = "auto";
    textEl.style.height = Math.min(textEl.scrollHeight, 260) + "px";
  }
  textEl.addEventListener("input", sync);
  textEl.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") analyze(); });
  goBtn.addEventListener("click", analyze);
  sync();

  /* ---------- Health ---------- */
  async function health() {
    const s = $("status"), t = $("statusText");
    try {
      const r = await fetch("/health"); const d = await r.json();
      s.className = "status " + (d.is_loaded ? "ok" : "bad");
      t.textContent = d.is_loaded ? "Model online" : "Model loading…";
    } catch { s.className = "status bad"; t.textContent = "Server offline"; }
  }
  health(); setInterval(health, 30000);

  /* ---------- Analyze ---------- */
  async function analyze() {
    const text = textEl.value.trim();
    if (!text || goBtn.classList.contains("loading")) return;
    errEl.textContent = "";
    goBtn.classList.add("loading"); goBtn.disabled = true;
    $("go").querySelector(".btn-label").textContent = "Analyzing…";
    try {
      const r = await fetch("/predict", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(typeof e.detail === "string" ? e.detail : "Something went wrong. Try again.");
      }
      render(await r.json());
    } catch (e) {
      errEl.textContent = e.message || "Could not reach the server.";
      $("inputCard").classList.remove("shake"); void $("inputCard").offsetWidth; $("inputCard").classList.add("shake");
    } finally {
      goBtn.classList.remove("loading");
      $("go").querySelector(".btn-label").textContent = "Analyze emotion";
      sync();
    }
  }

  function countUp(el, to, ms = 1100) {
    const t0 = performance.now();
    (function f(t) {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 4);
      el.textContent = (to * e).toFixed(1);
      if (k < 1) requestAnimationFrame(f);
    })(t0);
  }

  function render(d) {
    const emo = d.predicted_emotion, conf = d.confidence * 100;
    document.body.dataset.emotion = emo;
    resultEl.hidden = false;
    resultEl.classList.remove("show"); void resultEl.offsetWidth; resultEl.classList.add("show");

    const em = $("emoji"); em.textContent = EMOJI[emo] || "🤔";
    em.classList.remove("bounce"); void em.offsetWidth; em.classList.add("bounce");
    $("emotion").textContent = emo;
    $("quote").textContent = "“" + d.text + "”";
    countUp($("confNum"), conf);

    const ring = $("ringFg");
    ring.style.transition = "none"; ring.style.strokeDashoffset = RING_LEN; void ring.getBoundingClientRect();
    ring.style.transition = ""; ring.style.strokeDashoffset = RING_LEN * (1 - d.confidence);

    const probs = d.all_probabilites || {};
    const sorted = Object.entries(probs).sort((a, b) => b[1] - a[1]);
    const bars = $("bars"); bars.innerHTML = "";
    sorted.forEach(([name, p], i) => {
      const row = document.createElement("div");
      row.className = "bar" + (i === 0 ? " top" : ""); row.style.animationDelay = i * 80 + "ms";
      row.innerHTML = `<span class="bar-name"><span>${EMOJI[name] || ""}</span>${name}</span>
        <div class="track"><div class="fill"></div></div><span class="pct">${(p * 100).toFixed(1)}%</span>`;
      bars.appendChild(row);
      setTimeout(() => (row.querySelector(".fill").style.width = Math.max(p * 100, 0.8) + "%"), 150 + i * 80);
    });

    if (matchMedia("(min-width: 0px)").matches) resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (emo === "joy" || emo === "love" || emo === "surprise") burst(emo);
    pushHistory(d.text, emo);
  }

  /* ---------- Emoji burst ---------- */
  function burst(emo) {
    const origin = $("emoji").getBoundingClientRect();
    const cx = origin.left + origin.width / 2, cy = origin.top + origin.height / 2;
    for (let i = 0; i < 14; i++) {
      const s = document.createElement("span");
      s.textContent = EMOJI[emo];
      Object.assign(s.style, { position: "fixed", left: cx + "px", top: cy + "px", fontSize: 14 + Math.random() * 14 + "px", pointerEvents: "none", zIndex: 9 });
      document.body.appendChild(s);
      const a = Math.random() * 6.283, dist = 90 + Math.random() * 130;
      s.animate(
        [{ transform: "translate(-50%,-50%) scale(.3)", opacity: 1 },
         { transform: `translate(${Math.cos(a) * dist}px, ${Math.sin(a) * dist - 40}px) scale(1) rotate(${Math.random() * 90}deg)`, opacity: 0 }],
        { duration: 1100 + Math.random() * 500, easing: "cubic-bezier(.2,.8,.3,1)" }
      ).onfinish = () => s.remove();
    }
  }

  /* ---------- History ---------- */
  function pushHistory(text, emo) {
    history = [{ text, emo }, ...history.filter((h) => h.text !== text)].slice(0, 6);
    try { localStorage.setItem("moodlens_history", JSON.stringify(history)); } catch (_) {}
    drawHistory();
  }
  function drawHistory() {
    const ul = $("history"); ul.innerHTML = "";
    $("historyWrap").hidden = !history.length;
    history.forEach((h) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${EMOJI[h.emo] || ""}</span><span class="h-text"></span><span class="h-tag">${h.emo}</span>`;
      li.querySelector(".h-text").textContent = h.text;
      li.onclick = () => { setText(h.text); analyze(); };
      ul.appendChild(li);
    });
  }
  $("clearHistory").onclick = () => { history = []; try { localStorage.removeItem("moodlens_history"); } catch (_) {} drawHistory(); };
  drawHistory();
})();
