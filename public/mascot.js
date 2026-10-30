(() => {
  if (document.getElementById("ian-mascot")) return;

  const mascot = document.createElement("div");
  mascot.id = "ian-mascot";
  mascot.tabIndex = 0;
  mascot.setAttribute("role", "button");
  mascot.setAttribute("aria-label", "Снупи. Перетащи меня или нажми три раза для лампочки");
  mascot.innerHTML = `
    <div class="speech" id="ian-mascot-speech">Привет! Потяни меня за лапку 🐾</div>
    <svg class="dog" viewBox="0 0 100 116" aria-hidden="true">
      <ellipse cx="51" cy="108" rx="25" ry="5" fill="#25372b" opacity=".14"/>
      <g class="lamp"><circle cx="51" cy="48" r="38" fill="#ffe36a" opacity=".35"/><path d="M43 9h16l-2 7H45z" fill="#e4b92e"/><path d="M46 3h10v7H46z" fill="#e4b92e"/></g>
      <path d="M25 66C11 61 9 42 16 27c5-11 14-10 18-1 4 10 0 20-2 28" fill="#292d2b"/>
      <path d="M72 66c16-9 18-26 10-39-5-8-12-5-13 5-1 10 2 21 3 34" fill="#292d2b"/>
      <ellipse cx="50" cy="68" rx="29" ry="34" fill="#fff" stroke="#dce5df" stroke-width="1.5"/>
      <ellipse cx="49" cy="40" rx="29" ry="26" fill="#fff" stroke="#dce5df" stroke-width="1.5"/>
      <ellipse cx="50" cy="47" rx="21" ry="17" fill="#fff"/>
      <ellipse cx="39" cy="38" rx="3.3" ry="4.2" fill="#202722"/><ellipse cx="59" cy="38" rx="3.3" ry="4.2" fill="#202722"/>
      <ellipse cx="50" cy="48" rx="5.8" ry="4.3" fill="#202722"/>
      <path d="M45 54q5 5 10 0" fill="none" stroke="#202722" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M28 67q-15 8-9 22 7 8 16-2M71 67q14 8 8 22-7 8-16-2" fill="#fff" stroke="#dce5df" stroke-width="1.5"/>
      <path d="M35 94q-2 10 7 10 7 0 6-10M56 94q-1 10 7 10 7 0 6-10" fill="#fff" stroke="#dce5df" stroke-width="1.5"/>
      <path d="M28 58q22 11 45 0" fill="none" stroke="#168653" stroke-width="4" stroke-linecap="round"/>
      <circle cx="50" cy="61" r="3.5" fill="#168653"/>
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
  function lampToggle() {
    lit = !lit;
    mascot.classList.toggle("lit", lit);
    say(lit ? "Лампочка включена! 💡" : "Лампочка выключена.");
    animate("happy");
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