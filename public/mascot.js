(() => {
  if (document.getElementById("ian-mascot")) return;

  const mascot = document.createElement("div");
  mascot.id = "ian-mascot";
  mascot.tabIndex = 0;
  mascot.setAttribute("role", "button");
  mascot.setAttribute("aria-label", "Снупи. Перетащи меня или нажми три раза для лампочки");
  mascot.innerHTML = `
    <div class="speech" id="ian-mascot-speech">Привет! Потяни меня за лапку 🐾</div>
    <svg class="dog" viewBox="0 0 150 132" aria-hidden="true">
      <defs>
        <radialGradient id="snoopy-coat" cx="35%" cy="25%" r="80%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#e8eee9"/></radialGradient>
        <linearGradient id="bird-yellow" x2="0" y2="1"><stop stop-color="#fff27c"/><stop offset="1" stop-color="#f4bd31"/></linearGradient>
      </defs>
      <ellipse cx="70" cy="122" rx="43" ry="6" fill="#24392c" opacity=".13"/>
      <g class="lamp"><circle cx="67" cy="57" r="52" fill="#ffe36a" opacity=".28"/><path d="M60 5h15l-2 8H62z" fill="#e4b92e"/><path d="M63 0h9v7h-9z" fill="#e4b92e"/></g>
      <g class="dog-body">
        <ellipse cx="66" cy="94" rx="38" ry="27" fill="url(#snoopy-coat)" stroke="#dce5df" stroke-width="1.5"/>
        <path d="M42 91q-13 8-10 22 7 7 16-4M82 94q15 4 12 18-7 7-16-3" fill="#fff" stroke="#dce5df" stroke-width="1.5"/>
        <path d="M48 111q-2 8 6 9 7 0 7-8M76 111q-1 8 7 9 7 0 7-8" fill="#fff" stroke="#dce5df" stroke-width="1.5"/>
        <path class="ear ear-left" d="M54 28C30 6 14 23 19 55c3 18 15 27 29 18z" fill="#252b28"/>
        <ellipse cx="72" cy="47" rx="35" ry="30" fill="url(#snoopy-coat)" stroke="#dce5df" stroke-width="1.5"/>
        <path d="M82 49q25-2 34 10-7 17-31 17-13 0-20-9 7-12 17-18z" fill="#fff" stroke="#dce5df" stroke-width="1.2"/>
        <ellipse class="eye eye-left" cx="75" cy="38" rx="3" ry="4.2" fill="#202722"/>
        <ellipse cx="112" cy="57" rx="7" ry="5.5" fill="#202722"/>
        <path d="M90 69q8 5 15 0" fill="none" stroke="#59665e" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M44 83q22 10 43 4" fill="none" stroke="#168653" stroke-width="4.5" stroke-linecap="round"/>
        <circle cx="69" cy="89" r="3.5" fill="#168653"/>
        <path class="tail" d="M101 94q17-1 17-14" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
      </g>
      <g class="bird" transform="translate(111 68)">
        <ellipse cx="0" cy="0" rx="15" ry="17" fill="url(#bird-yellow)" stroke="#e5b43a" stroke-width="1"/>
        <path class="bird-wing" d="M-4 -2q-17-13-13 5 6 10 14 3" fill="#f6c83e" stroke="#e5b43a" stroke-width="1"/>
        <circle cx="5" cy="-5" r="2" fill="#333b32"/>
        <path d="M13 0l9 4-9 4z" fill="#ef9131"/>
        <path d="M-4 16l-3 7m10-7 2 7" stroke="#bd8730" stroke-width="2" stroke-linecap="round"/>
      </g>
    </svg>`;
  document.body.appendChild(mascot);

  // Маскот автоматически скрывается, если перекрывает поле, кнопку или другой
  // элемент формы. Это особенно важно на узких экранах iPhone.
  let overlapFrame = 0;
  function checkMascotOverlap() {
    cancelAnimationFrame(overlapFrame);
    overlapFrame = requestAnimationFrame(() => {
      const mr = mascot.getBoundingClientRect();
      const controls = document.querySelectorAll("input, textarea, select, button, [contenteditable='true'], label");
      let overlaps = false;
      for (const el of controls) {
        if (!el.isConnected || el.disabled || el.getAttribute("aria-hidden") === "true") continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
        if (mr.left < r.right && mr.right > r.left && mr.top < r.bottom && mr.bottom > r.top) {
          overlaps = true;
          break;
        }
      }
      mascot.classList.toggle("near-controls", overlaps && !mascot.classList.contains("dragging"));
    });
  }
  window.addEventListener("scroll", checkMascotOverlap, { passive: true });
  window.addEventListener("resize", checkMascotOverlap, { passive: true });
  document.addEventListener("focusin", checkMascotOverlap);
  document.addEventListener("focusout", () => requestAnimationFrame(checkMascotOverlap));
  if (window.ResizeObserver) {
    const pageObserver = new ResizeObserver(checkMascotOverlap);
    pageObserver.observe(document.body);
  }
  checkMascotOverlap();

  const chat = document.createElement("section");
  chat.id = "ian-mascot-chat";
  chat.setAttribute("aria-label", "Чат со Снупи");
  chat.innerHTML = `
    <div class="head"><span>🐶</span><span>Снупи<br><small style="font-weight:400;color:#718078">Помощник сайта</small></span><button type="button" aria-label="Закрыть">×</button></div>
    <div class="messages" id="ian-messages" role="log" aria-live="polite" aria-relevant="additions text"><div class="msg">Привет! Я Снупи. Спрашивай о сайте, проектах и презентациях. Меня ещё можно бросать по экрану! 🐾</div></div>
    <form id="ian-chat-form"><input id="ian-chat-input" maxlength="1000" placeholder="Напиши Снупи..." autocomplete="off"><button type="submit" aria-label="Отправить">↑</button></form>`;
  document.body.appendChild(chat);

  const speech = mascot.querySelector(".speech");
  const messages = chat.querySelector(".messages");
  const input = chat.querySelector("input");
  const form = chat.querySelector("form");
  let lit = false, taps = 0, tapTimer, drag = null, vx = 0, vy = 0, frame = 0;

  function say(text) {
    speech.textContent = text;
    const bounds = mascot.getBoundingClientRect();
    mascot.classList.toggle("speech-left", bounds.left < innerWidth * 0.48);
    mascot.classList.add("speak");
    clearTimeout(mascot._speechTimer);
    mascot._speechTimer = setTimeout(() => mascot.classList.remove("speak"), 2500);
  }
  const animationTimers = new Map();
  function animate(name, ms = 850) {
    ["walk", "happy", "think"].forEach(key => {
      mascot.classList.remove(key);
      if (animationTimers.has(key)) {
        clearTimeout(animationTimers.get(key));
        animationTimers.delete(key);
      }
    });
    mascot.classList.add(name);
    if (ms > 0) {
      animationTimers.set(name, setTimeout(() => {
        mascot.classList.remove(name);
        animationTimers.delete(name);
      }, ms));
    }
  }
  const bird = mascot.querySelector(".bird");
  let idleTimer;
  function randomIdle() {
    if (mascot.classList.contains("dragging") || chat.classList.contains("open")) return;
    const moves = ["look", "blink", "bird-hop"];
    const move = moves[Math.floor(Math.random() * moves.length)];
    mascot.classList.remove("look", "blink", "bird-hop");
    void mascot.offsetWidth;
    mascot.classList.add(move);
    setTimeout(() => mascot.classList.remove(move), 1100);
  }
  idleTimer = setInterval(randomIdle, 5200);
  mascot.addEventListener("pointerenter", () => {
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) mascot.classList.add("curious");
  });
  mascot.addEventListener("pointerleave", () => mascot.classList.remove("curious"));
  function lampToggle() {
    lit = !lit;
    mascot.classList.toggle("lit", lit);
    say(lit ? "Лампочка включена! 💡" : "Лампочка выключена.");
    animate("happy");
    mascot.classList.add("bird-cheer");
    setTimeout(() => mascot.classList.remove("bird-cheer"), 1200);
  }
  function openChat() {
    chat.classList.add("open");
    say("Слушаю тебя!");
    setTimeout(() => input.focus({ preventScroll: true }), 180);
  }
  function addMessage(text, who) {
    const node = document.createElement("div");
    node.className = "msg " + who;
    node.textContent = text;
    messages.appendChild(node);
    messages.scrollTop = messages.scrollHeight;
    return node;
  }

  mascot.addEventListener("click", () => {
    if (mascot.dataset.dragged === "yes") {
      mascot.dataset.dragged = "";
      return;
    }
    taps++;
    clearTimeout(tapTimer);
    if (taps === 3) {
      taps = 0;
      lampToggle();
    } else {
      tapTimer = setTimeout(() => {
        if (taps === 1) openChat();
        taps = 0;
      }, 430);
    }
  });
  chat.querySelector(".head button").addEventListener("click", () => chat.classList.remove("open"));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && chat.classList.contains("open")) chat.classList.remove("open");
  });
  window.addEventListener("resize", () => {
    checkMascotOverlap();
    const r = mascot.getBoundingClientRect();
    const x = Math.max(0, Math.min(innerWidth - mascot.offsetWidth, r.left));
    const y = Math.max(0, Math.min(innerHeight - mascot.offsetHeight, r.top));
    if (mascot.style.left) mascot.style.left = x + "px";
    if (mascot.style.top) mascot.style.top = y + "px";
    mascot.classList.toggle("speech-left", x < innerWidth * 0.48);
  });
  mascot.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openChat();
    }
  });

  mascot.addEventListener("pointerdown", e => {
    if (e.button !== undefined && e.button !== 0) return;
    const r = mascot.getBoundingClientRect();
    drag = { id: e.pointerId, x: r.left, y: r.top, px: e.clientX, py: e.clientY, time: performance.now(), moved: false };
    vx = 0; vy = 0;
    mascot.style.left = r.left + "px";
    mascot.style.top = r.top + "px";
    mascot.style.right = "auto";
    mascot.classList.add("dragging");
    mascot.setPointerCapture(e.pointerId);
  });
  mascot.addEventListener("pointermove", e => {
    if (!drag || drag.id !== e.pointerId) return;
    const now = performance.now(), dt = Math.max(8, now - drag.time);
    const dx = e.clientX - drag.px, dy = e.clientY - drag.py;
    if (!drag.moved && Math.abs(e.clientX - drag.px) + Math.abs(e.clientY - drag.py) > 8) {
      drag.moved = true;
      clearTimeout(tapTimer);
      taps = 0;
    }
    vx = Math.max(-22, Math.min(22, dx / dt * 16));
    vy = Math.max(-22, Math.min(22, dy / dt * 16));
    drag.x = Math.max(0, Math.min(innerWidth - mascot.offsetWidth, drag.x + dx));
    drag.y = Math.max(0, Math.min(innerHeight - mascot.offsetHeight, drag.y + dy));
    mascot.style.left = drag.x + "px";
    mascot.style.top = drag.y + "px";
    mascot.classList.toggle("speech-left", drag.x < innerWidth * 0.48);
    drag.px = e.clientX; drag.py = e.clientY; drag.time = now;
  });
  function release(e) {
    if (!drag || drag.id !== e.pointerId) return;
    const moved = drag.moved;
    let x = drag.x, y = drag.y;
    drag = null;
    mascot.classList.remove("dragging");
    if (!moved) return;
    mascot.dataset.dragged = "yes";
    say("Ух ты! Вот это бросок! 😄");
    animate("happy");
    mascot.classList.add("bird-flap");
    setTimeout(() => mascot.classList.remove("bird-flap"), 1000);
    cancelAnimationFrame(frame);
    let sx = Math.max(-26, Math.min(26, vx * 1.5));
    let sy = Math.max(-26, Math.min(26, vy * 1.5));
    if (Math.abs(sx) + Math.abs(sy) < 5) sx = x < innerWidth / 2 ? 9 : -9;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      mascot.style.left = Math.max(0, Math.min(innerWidth - mascot.offsetWidth, x)) + "px";
      mascot.style.top = Math.max(0, Math.min(innerHeight - mascot.offsetHeight, y)) + "px";
      return;
    }
    function fly() {
      x += sx; y += sy; sx *= .965; sy = sy * .965 + .2;
      const maxX = innerWidth - mascot.offsetWidth, maxY = innerHeight - mascot.offsetHeight;
      if (x < 0 || x > maxX) { x = Math.max(0, Math.min(maxX, x)); sx *= -.7; }
      if (y < 0 || y > maxY) { y = Math.max(0, Math.min(maxY, y)); sy *= -.7; }
      mascot.style.left = x + "px"; mascot.style.top = y + "px";
      if (Math.abs(sx) + Math.abs(sy) > .7) frame = requestAnimationFrame(fly);
      else {
        mascot.style.left = "auto";
        mascot.style.right = "";
        mascot.classList.remove("speech-left");
      }
    }
    frame = requestAnimationFrame(fly);
  }
  mascot.addEventListener("pointerup", release);
  mascot.addEventListener("pointercancel", release);
  mascot.addEventListener("dragstart", e => e.preventDefault());

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question || form.dataset.sending === "yes") return;
    form.dataset.sending = "yes";
    const sendButton = form.querySelector("button[type='submit']");
    sendButton.disabled = true;
    input.disabled = true;
    addMessage(question, "user");
    input.value = "";
    animate("think", 30000);
    const pending = addMessage("Снупи думает…", "bot");
    const history = Array.from(messages.querySelectorAll(".msg")).slice(-7)
      .map(n => (n.classList.contains("user") ? "Пользователь: " : "Снупи: ") + n.textContent).join("\n");
    const prompt = "Ты — Снупи, дружелюбный русскоязычный помощник сайта «Все проекты #Ian». Отвечай коротко и понятно, помогай с сайтом, школьными проектами и презентациями. Не говори, что можешь сам нажимать кнопки или видеть личные данные. Последние сообщения:\n" + history + "\nОтветь на последнее сообщение.";
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Сервер не смог ответить. Попробуй ещё раз.");
      if (typeof data.answer !== "string" || !data.answer.trim()) throw new Error("Сервер вернул пустой ответ.");
      pending.textContent = data.answer || "Попробуй спросить иначе.";
      animate("happy");
      mascot.classList.add("bird-cheer");
      setTimeout(() => mascot.classList.remove("bird-cheer"), 1200);
    } catch (err) {
      pending.textContent = err.message || "Не удалось подключиться. Попробуй позже.";
    }
    messages.scrollTop = messages.scrollHeight;
    form.dataset.sending = "no";
    sendButton.disabled = false;
    input.disabled = false;
    input.focus({ preventScroll: true });
  });

  document.addEventListener("click", e => {
    if (e.target.closest("#createButton,.create-btn")) {
      animate("think", 1500); say("Создаём проект! ✨");
    } else if (e.target.closest(".download,[onclick*='downloadFile'],[onclick*='downloadAll']")) {
      animate("happy"); say("Файл готов к скачиванию! 📦");
    } else if (e.target.closest(".nav button,.mobile-menu")) {
      say("Пойдём посмотрим!"); animate("happy");
    }
  });
  const status = document.getElementById("status");
  if (status && window.MutationObserver) {
    new MutationObserver(() => {
      const t = status.textContent.toLowerCase();
      if (t.includes("ошиб") || t.includes("не удалось")) say("Кажется, нужна помощь. Спроси меня!");
    }).observe(status, { childList: true, subtree: true, characterData: true });
  }
  setTimeout(() => say("Тяни меня пальцем, чтобы бросить. Три нажатия — лампочка! 💡"), 1800);
})();