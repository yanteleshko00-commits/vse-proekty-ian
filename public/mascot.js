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
        <path class="ear ear-left" d="M44 42C23 18 8 35 14 65c3 16 16 25 29 15z" fill="#343b37"/>
        <path class="ear ear-right" d="M91 40c17-25 35-12 32 17-2 19-13 29-27 23z" fill="#343b37"/>
        <ellipse cx="68" cy="88" rx="39" ry="34" fill="url(#snoopy-coat)" stroke="#dce5df" stroke-width="1.5"/>
        <path d="M45 92q-17 6-12 21 8 7 17-5M91 92q17 6 12 21-8 7-17-5" fill="#fff" stroke="#dce5df" stroke-width="1.5"/>
        <path d="M48 111q-2 9 7 9 7 0 7-9M76 111q-1 9 8 9 7 0 7-9" fill="#fff" stroke="#dce5df" stroke-width="1.5"/>
        <ellipse cx="68" cy="52" rx="34" ry="31" fill="url(#snoopy-coat)" stroke="#dce5df" stroke-width="1.5"/>
        <ellipse cx="68" cy="66" rx="26" ry="18" fill="#fff"/>
        <ellipse class="eye eye-left" cx="56" cy="49" rx="3.2" ry="4.4" fill="#202722"/>
        <ellipse class="eye eye-right" cx="79" cy="49" rx="3.2" ry="4.4" fill="#202722"/>
        <ellipse cx="68" cy="63" rx="7" ry="5.2" fill="#202722"/>
        <path d="M62 72q6 6 12 0" fill="none" stroke="#59665e" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M37 87q31 12 62 0" fill="none" stroke="#168653" stroke-width="5" stroke-linecap="round"/>
        <circle cx="68" cy="91" r="4" fill="#168653"/>
        <path class="tail" d="M105 94q17-1 17-14" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
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

  const chat = document.createElement("section");
  chat.id = "ian-mascot-chat";
  chat.setAttribute("aria-label", "Чат со Снупи");
  chat.innerHTML = `
    <div class="head"><span>🐶</span><span>Снупи<br><small style="font-weight:400;color:#718078">Помощник сайта</small></span><button type="button" aria-label="Закрыть">×</button></div>
    <div class="messages" id="ian-messages"><div class="msg">Привет! Я Снупи. Спрашивай о сайте, проектах и презентациях. Меня ещё можно бросать по экрану! 🐾</div></div>
    <form id="ian-chat-form"><input id="ian-chat-input" maxlength="1000" placeholder="Напиши Снупи..." autocomplete="off"><button type="submit" aria-label="Отправить">↑</button></form>`;
  document.body.appendChild(chat);

  const speech = mascot.querySelector(".speech");
  const messages = chat.querySelector(".messages");
  const input = chat.querySelector("input");
  const form = chat.querySelector("form");
  let lit = false, taps = 0, tapTimer, drag = null, vx = 0, vy = 0, frame = 0;

  function say(text) {
    speech.textContent = text;
    mascot.classList.add("speak");
    clearTimeout(mascot._speechTimer);
    mascot._speechTimer = setTimeout(() => mascot.classList.remove("speak"), 2500);
  }
  function animate(name, ms = 800) {
    mascot.classList.remove("walk", "happy", "think");
    mascot.classList.add(name);
    setTimeout(() => mascot.classList.remove(name), ms);
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
  mascot.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openChat();
    }
  });

  mascot.addEventListener("pointerdown", e => {
    if (e.button !== undefined && e.button !== 0) return;
    clearTimeout(tapTimer);
    taps = 0;
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
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 7) drag.moved = true;
    vx = dx / dt * 16; vy = dy / dt * 16;
    drag.x = Math.max(0, Math.min(innerWidth - mascot.offsetWidth, drag.x + dx));
    drag.y = Math.max(0, Math.min(innerHeight - mascot.offsetHeight, drag.y + dy));
    mascot.style.left = drag.x + "px";
    mascot.style.top = drag.y + "px";
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
    if (reduced) return;
    function fly() {
      x += sx; y += sy; sx *= .965; sy = sy * .965 + .2;
      const maxX = innerWidth - mascot.offsetWidth, maxY = innerHeight - mascot.offsetHeight;
      if (x < 0 || x > maxX) { x = Math.max(0, Math.min(maxX, x)); sx *= -.7; }
      if (y < 0 || y > maxY) { y = Math.max(0, Math.min(maxY, y)); sy *= -.7; }
      mascot.style.left = x + "px"; mascot.style.top = y + "px";
      if (Math.abs(sx) + Math.abs(sy) > .7) frame = requestAnimationFrame(fly);
      else { mascot.style.left = "auto"; mascot.style.right = "10px"; }
    }
    frame = requestAnimationFrame(fly);
  }
  mascot.addEventListener("pointerup", release);
  mascot.addEventListener("pointercancel", release);
  mascot.addEventListener("dragstart", e => e.preventDefault());

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    addMessage(question, "user");
    input.value = "";
    animate("think", 0);
    const pending = addMessage("Снупи думает…", "bot");
    const history = Array.from(messages.querySelectorAll(".msg")).slice(-7)
      .map(n => (n.classList.contains("user") ? "Пользователь: " : "Снупи: ") + n.textContent).join("\n");
    const prompt = "Ты — Снупи, дружелюбный русскоязычный помощник сайта «Все проекты #Ian». Отвечай коротко и понятно, помогай с сайтом, школьными проектами и презентациями. Не говори, что можешь сам нажимать кнопки или видеть личные данные. Последние сообщения:\n" + history + "\nОтветь на последнее сообщение.";
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не получилось получить ответ.");
      pending.textContent = data.answer || "Попробуй спросить иначе.";
      animate("happy");
      mascot.classList.add("bird-cheer");
      setTimeout(() => mascot.classList.remove("bird-cheer"), 1200);
    } catch (err) {
      pending.textContent = err.message || "Не удалось подключиться. Попробуй позже.";
    }
    messages.scrollTop = messages.scrollHeight;
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