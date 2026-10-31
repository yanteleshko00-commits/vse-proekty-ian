(() => {
  if (document.getElementById("ian-mascot")) return;

  const mascot = document.createElement("div");
  mascot.id = "ian-mascot";
  mascot.tabIndex = 0;
  mascot.setAttribute("role", "button");
  mascot.setAttribute("aria-label", "Живая лампочка с руками, ногами и эмоциями. Нажми или перетащи");
  mascot.innerHTML = `
    <div class="speech" id="ian-mascot-speech">Привет! Я твоя живая лампочка! 💡</div>
    <svg class="dog bulb-character" viewBox="0 0 120 154" role="img" aria-label="Живая лампочка с глазами, улыбкой, руками и ногами" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ianBulbGlass" x1="12%" y1="0%" x2="88%" y2="100%">
          <stop offset="0" stop-color="#fffde8"/><stop offset=".48" stop-color="#ffe98b"/><stop offset="1" stop-color="#ffbd42"/>
        </linearGradient>
        <linearGradient id="ianBulbBase" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#dce5ee"/><stop offset="1" stop-color="#8999aa"/>
        </linearGradient>
      </defs>
      <g class="dog-body">
        <g class="stick-legs" fill="none" stroke="#f4c45d" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
          <path class="leg leg-back-a" d="M49 123 Q46 134 40 141"/><path class="leg leg-back-b" d="M71 123 Q75 134 82 141"/>
          <path d="M40 141l-8 1M82 141l8 1" stroke="#273548" stroke-width="5"/>
        </g>
        <g class="stick-arms" fill="none" stroke="#f4c45d" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
          <path class="arm arm-left" d="M25 67 Q12 72 8 87"/><path class="arm arm-right" d="M95 67 Q108 72 112 87"/>
          <circle cx="8" cy="88" r="3.5" fill="#f4c45d" stroke="none"/><circle cx="112" cy="88" r="3.5" fill="#f4c45d" stroke="none"/>
        </g>
        <g class="bear-head">
          <path class="bulb-glass" d="M60 8C34 8 17 26 17 50c0 17 8 27 18 38 6 6 9 12 10 20h30c1-8 4-14 10-20 10-11 18-21 18-38C103 26 86 8 60 8Z" fill="url(#ianBulbGlass)" stroke="#d69a32" stroke-width="2.5"/>
          <path d="M31 37Q35 22 49 18" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/>
          <g class="bear-eyes" fill="#26364a">
            <ellipse class="eye" cx="47" cy="55" rx="4.3" ry="6.3"/><ellipse class="eye" cx="73" cy="55" rx="4.3" ry="6.3"/>
            <circle cx="45.5" cy="52.5" r="1.6" fill="#fff"/><circle cx="71.5" cy="52.5" r="1.6" fill="#fff"/>
          </g>
          <g class="bear-brows" fill="none" stroke="#9b6825" stroke-width="2.4" stroke-linecap="round"><path class="brow brow-left" d="M40 44q7-5 13 0"/><path class="brow brow-right" d="M67 44q7-5 13 0"/></g>
          <g class="face-mouth" fill="none" stroke="#8d4d28" stroke-width="2.8" stroke-linecap="round">
            <path class="mouth mouth-neutral" d="M53 70q7 4 14 0"/>
            <path class="mouth mouth-happy" d="M50 68q10 15 20 0" />
            <path class="mouth mouth-sad" d="M52 75q8-9 16 0"/>
            <ellipse class="mouth mouth-surprised" cx="60" cy="71" rx="4" ry="6"/>
            <path class="mouth mouth-confused" d="M54 71q6-5 12 0"/>
            <path class="mouth mouth-worried" d="M52 74q8-6 16 0"/>
            <path class="mouth mouth-proud" d="M52 68q8 8 16 0"/>
            <path class="mouth mouth-laugh" d="M50 67q10 17 20 0"/>
            <path class="mouth mouth-smirk" d="M54 70q9 4 15-2"/>
            <path class="mouth mouth-sleepy" d="M54 72h12"/>
          </g>
          <g class="cheeks" fill="#f18b75"><circle cx="34" cy="67" r="5"/><circle cx="86" cy="67" r="5"/></g>
          <g class="heart-sparkles" fill="#ff7894"><path d="M28 30c-6-7-16 2 0 13 16-11 6-20 0-13Z"/><path d="M94 26c-4-5-11 1 0 9 11-8 4-14 0-9Z"/></g>
        </g>
        <g class="bulb-neck">
          <path d="M46 105h28v7H46z" fill="#e4ad49" stroke="#b77b2d" stroke-width="1.5"/>
          <path d="M47 112h26v5H47zM49 118h22v5H49z" fill="url(#ianBulbBase)" stroke="#7d8b9b" stroke-width="1.2"/>
          <path d="M54 124h12" stroke="#6d7d8d" stroke-width="2.5" stroke-linecap="round"/>
        </g>
        <g class="sparkle" fill="#fff2a6"><path d="M8 28l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/><path d="M108 14l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></g>
      </g>
    </svg>`;
  document.body.appendChild(mascot);

  // Маскот автоматически скрывается, если перекрывает поле, кнопку или другой
  // элемент формы. Это особенно важно на узких экранах iPhone.
  let overlapFrame = 0;
  function checkMascotOverlap() {
    // Keep the floating mascot visible while scrolling and above form controls.
    mascot.classList.remove("near-controls");
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
  chat.setAttribute("aria-label", "Чат с Винни");
  chat.innerHTML = `
    <div class="head"><span>🍯</span><span>Винни<br><small style="font-weight:400;color:#718078">Помощник сайта</small></span><button type="button" aria-label="Закрыть">×</button></div>
    <div class="messages" id="ian-messages" role="log" aria-live="polite" aria-relevant="additions text"><div class="msg">Привет! Я Винни. Спрашивай о сайте, проектах и презентациях. Меня можно перетаскивать по экрану! 🍯</div></div>
    <form id="ian-chat-form"><input id="ian-chat-input" maxlength="1000" placeholder="Напиши Винни..." autocomplete="off"><button type="submit" aria-label="Отправить">↑</button></form>`;
  document.body.appendChild(chat);

  // Accessible motion controls; preference is stored locally on this device.
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let motionEnabled = !motionQuery.matches;
  let userMotionChoice = false;
  try {
    const savedMotion = localStorage.getItem("ianMascotMotion");
    if (savedMotion === "off") { motionEnabled = false; userMotionChoice = true; }
    if (savedMotion === "on") { motionEnabled = true; userMotionChoice = true; }
  } catch (_) {}
  const motionControl = document.createElement("button");
  motionControl.type = "button";
  motionControl.dataset.motionToggle = "true";
  motionControl.className = "motion-toggle";
  chat.querySelector(".head").insertBefore(motionControl, chat.querySelector(".head button"));
  function applyMotionSetting() {
    mascot.classList.toggle("motion-enabled", motionEnabled);
    mascot.classList.toggle("motion-off", !motionEnabled);
    motionControl.setAttribute("aria-pressed", String(!motionEnabled));
    motionControl.setAttribute("aria-label", motionEnabled ? "Выключить анимации" : "Включить анимации");
    motionControl.textContent = motionEnabled ? "Ⅱ" : "▶";
    motionControl.title = motionEnabled ? "Выключить анимации" : "Включить анимации";
  }
  motionControl.addEventListener("click", () => {
    motionEnabled = !motionEnabled;
    userMotionChoice = true;
    try { localStorage.setItem("ianMascotMotion", motionEnabled ? "on" : "off"); } catch (_) {}
    if (!motionEnabled) mascot.classList.remove("walk", "run", "happy", "think", "look", "blink", "bird-hop", "bird-flap", "bird-cheer", "bird-fly", "snooze", "dance");
    applyMotionSetting();
    say(motionEnabled ? "Анимации снова включены!" : "Хорошо, буду неподвижным.");
  });
  motionQuery.addEventListener?.("change", event => {
    if (!userMotionChoice) motionEnabled = !event.matches;
    applyMotionSetting();
  });
  applyMotionSetting();

  const speech = mascot.querySelector(".speech");
  const messages = chat.querySelector(".messages");
  const input = chat.querySelector("input");
  const form = chat.querySelector("form");
  let lit = false, taps = 0, tapTimer, drag = null, vx = 0, vy = 0, frame = 0;

  // Дополнительный характер, настройки, контекстные подсказки и мини-игра.
  let doNotDisturb = false, soundEnabled = false, roamSpeed = 1.2;
  let gameActive = false, gameCatchCount = 0, gameMoveTimer = 0, gameClockTimer = 0, gameSecondsLeft = 18;
  let petTimer = 0, petPerformed = false, petStartPoint = null;
  let lastHumanAction = Date.now(), lastPersonalityLine = 0, hintTimer = 0, lastFieldInputAt = 0;
  const hintedFields = new WeakSet();

  const settingsControl = document.createElement("button");
  settingsControl.type = "button";
  settingsControl.className = "mascot-settings-toggle";
  settingsControl.textContent = "⚙";
  settingsControl.title = "Настройки маскота";
  settingsControl.setAttribute("aria-label", "Настройки маскота");
  settingsControl.setAttribute("aria-expanded", "false");
  chat.querySelector(".head").insertBefore(settingsControl, chat.querySelector(".head button[aria-label='Закрыть']"));

  const settingsPanel = document.createElement("div");
  settingsPanel.id = "ian-mascot-settings";
  settingsPanel.className = "mascot-settings-panel";
  settingsPanel.hidden = true;
  settingsPanel.innerHTML =
    '<label class="mascot-setting-check"><input id="mascot-dnd" type="checkbox"> Не беспокоить</label>' +
    '<label class="mascot-setting-check"><input id="mascot-sound" type="checkbox"> Звуки реакций</label>' +
    '<label class="mascot-setting-range">Скорость прогулки <strong id="mascot-speed-value">1,2×</strong><input id="mascot-speed" type="range" min="0.6" max="2.4" step="0.2" value="1.2"></label>' +
    '<label class="mascot-setting-range">Размер маскота <strong id="mascot-size-value">90 px</strong><input id="mascot-size" type="range" min="64" max="144" step="4" value="90"></label>' +
    '<div class="mascot-setting-actions"><button type="button" data-mascot-action="game">🎮 Поймай меня</button><button type="button" data-mascot-action="stop-game">Остановить игру</button><button type="button" data-mascot-action="home">⌂ Вернуть домой</button></div>' +
    '<div class="mascot-settings-note">Настройки сохраняются на этом устройстве.</div>';
  chat.insertBefore(settingsPanel, messages);

  const dndControl = settingsPanel.querySelector("#mascot-dnd");
  const soundControl = settingsPanel.querySelector("#mascot-sound");
  const speedControl = settingsPanel.querySelector("#mascot-speed");
  const sizeControl = settingsPanel.querySelector("#mascot-size");
  const speedValue = settingsPanel.querySelector("#mascot-speed-value");
  const sizeValue = settingsPanel.querySelector("#mascot-size-value");

  function readMascotPreference(key, fallback) {
    try { const value = localStorage.getItem("ianMascot:" + key); return value === null ? fallback : value; }
    catch (_) { return fallback; }
  }
  function saveMascotPreference(key, value) {
    try { localStorage.setItem("ianMascot:" + key, String(value)); } catch (_) {}
  }
  doNotDisturb = readMascotPreference("dnd", "off") === "on";
  soundEnabled = readMascotPreference("sound", "off") === "on";
  roamSpeed = Math.max(.6, Math.min(2.4, Number(readMascotPreference("speed", "1.2")) || 1.2));
  dndControl.checked = doNotDisturb;
  soundControl.checked = soundEnabled;
  speedControl.value = String(roamSpeed);
  speedValue.textContent = roamSpeed.toFixed(1).replace(".", ",") + "×";

  function setSettingsOpen(open) {
    settingsPanel.hidden = !open;
    settingsControl.setAttribute("aria-expanded", String(open));
    settingsControl.classList.toggle("active", open);
  }
  settingsControl.addEventListener("click", () => setSettingsOpen(settingsPanel.hidden));
  dndControl.addEventListener("change", () => {
    doNotDisturb = dndControl.checked;
    saveMascotPreference("dnd", doNotDisturb ? "on" : "off");
    say(doNotDisturb ? "Режим «Не беспокоить» включён." : "Снова могу подсказывать и гулять!");
    if (doNotDisturb) stopCatchGame(false, true);
  });
  soundControl.addEventListener("change", () => {
    soundEnabled = soundControl.checked;
    saveMascotPreference("sound", soundEnabled ? "on" : "off");
    if (soundEnabled) playMascotSound(660);
  });
  speedControl.addEventListener("input", () => {
    roamSpeed = Number(speedControl.value);
    speedValue.textContent = roamSpeed.toFixed(1).replace(".", ",") + "×";
    saveMascotPreference("speed", roamSpeed);
    restartRoamTimer();
  });

  function applyMascotSize(size) {
    const safeSize = Math.max(64, Math.min(144, Number(size) || 90));
    mascot.style.setProperty("width", safeSize + "px", "important");
    mascot.style.setProperty("height", Math.round(safeSize * .88) + "px", "important");
    const r = mascot.getBoundingClientRect();
    mascot.style.setProperty("left", Math.max(4, Math.min(innerWidth - r.width - 4, r.left)) + "px", "important");
    mascot.style.setProperty("top", Math.max(4, Math.min(innerHeight - r.height - 4, r.top)) + "px", "important");
  }
  const savedSize = Number(readMascotPreference("size", "0"));
  if (savedSize >= 64 && savedSize <= 144) {
    sizeControl.value = String(savedSize);
    applyMascotSize(savedSize);
  } else {
    sizeControl.value = String(Math.max(64, Math.min(144, Math.round(mascot.getBoundingClientRect().width))));
  }
  sizeValue.textContent = sizeControl.value + " px";
  sizeControl.addEventListener("input", () => {
    const size = Number(sizeControl.value);
    sizeValue.textContent = size + " px";
    applyMascotSize(size);
    saveMascotPreference("size", size);
  });

  function playMascotSound(frequency = 560) {
    if (!soundEnabled || document.hidden) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      const context = new AudioCtx(), oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.045, context.currentTime + .025);
      gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .16);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(); oscillator.stop(context.currentTime + .17);
      oscillator.onended = () => context.close().catch(() => {});
    } catch (_) {}
  }
  function restartRoamTimer() {
    if (roamTimer) clearInterval(roamTimer);
    roamTimer = window.setInterval(takeTinyWalk, Math.round(18000 / Math.max(.6, roamSpeed)));
  }

  function returnMascotHome() {
    stopCatchGame(false, true);
    mascot.style.removeProperty("left"); mascot.style.removeProperty("top");
    mascot.style.removeProperty("right"); mascot.style.removeProperty("bottom");
    mascot.style.removeProperty("transition");
    mascot.classList.remove("gliding", "dragging", "game-mode");
    setEmotion("happy", 1400);
    if (motionEnabled) animate("happy", 900);
    say("Я вернулся на своё место! 💡");
  }
  function moveMascotForGame() {
    const r = mascot.getBoundingClientRect();
    const maxX = Math.max(8, innerWidth - r.width - 8);
    const maxY = Math.max(70, innerHeight - r.height - 72);
    const minY = Math.min(95, maxY);
    const x = 8 + Math.random() * Math.max(0, maxX - 8);
    const y = minY + Math.random() * Math.max(0, maxY - minY);
    mascot.style.transition = "left .42s cubic-bezier(.2,.8,.2,1), top .42s cubic-bezier(.2,.8,.2,1)";
    mascot.style.setProperty("left", x + "px", "important");
    mascot.style.setProperty("top", y + "px", "important");
    mascot.style.setProperty("right", "auto", "important");
    mascot.style.setProperty("bottom", "auto", "important");
  }
  function stopCatchGame(won = false, quiet = false) {
    if (!gameActive) return;
    gameActive = false;
    clearInterval(gameMoveTimer); clearInterval(gameClockTimer);
    gameMoveTimer = 0; gameClockTimer = 0;
    mascot.classList.remove("game-mode", "run", "dance");
    mascot.style.removeProperty("transition");
    if (won) {
      let best = 0;
      try { best = Number(localStorage.getItem("ianMascotCatchBest") || 0); } catch (_) {}
      if (gameCatchCount > best) {
        best = gameCatchCount;
        try { localStorage.setItem("ianMascotCatchBest", String(best)); } catch (_) {}
      }
      setEmotion("delighted", 2400);
      if (motionEnabled) animate("dance", 1500);
      playMascotSound(880);
      if (!quiet) say("Поймал! 🎉 " + gameCatchCount + " из 5. Рекорд: " + best + ".");
    } else if (!quiet) {
      setEmotion("playful", 1800);
      say("Время вышло! Ты поймал меня " + gameCatchCount + " из 5. Попробуем ещё раз?");
    }
  }
  function catchMascot() {
    if (!gameActive) return;
    gameCatchCount++;
    setEmotion("excited", 650);
    playMascotSound(620 + gameCatchCount * 55);
    if (gameCatchCount >= 5) { stopCatchGame(true); return; }
    say("Есть! " + gameCatchCount + "/5. Ещё немного!");
    setTimeout(() => { if (gameActive) moveMascotForGame(); }, 260);
  }
  function beginCatchGame() {
    if (gameActive || doNotDisturb) return;
    chat.classList.remove("open"); setSettingsOpen(false);
    gameCatchCount = 0; gameSecondsLeft = 18; gameActive = true;
    mascot.classList.add("game-mode", "run");
    setEmotion("playful", 19000);
    say("Поймай меня 5 раз за 18 секунд! 🎮");
    playMascotSound(740); moveMascotForGame();
    gameMoveTimer = window.setInterval(moveMascotForGame, Math.max(580, 1100 / roamSpeed));
    gameClockTimer = window.setInterval(() => {
      if (document.hidden) { stopCatchGame(false, true); return; }
      gameSecondsLeft--;
      if (gameSecondsLeft <= 0) stopCatchGame(false);
      else if (gameSecondsLeft === 10 || gameSecondsLeft === 5) say("Осталось " + gameSecondsLeft + " секунд!");
    }, 1000);
  }
  settingsPanel.querySelectorAll("[data-mascot-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.mascotAction;
      if (action === "game") beginCatchGame();
      else if (action === "stop-game") { stopCatchGame(false); setSettingsOpen(false); }
      else if (action === "home") { setSettingsOpen(false); returnMascotHome(); }
    });
  });

  function petMascot() {
    petPerformed = true;
    setEmotion("love", 1500);
    if (motionEnabled) animate("happy", 1100);
    playMascotSound(700);
    say(["Ой, как приятно! 💛", "Спасибо за поглаживание!", "Вот это забота! Я доволен."][Math.floor(Math.random() * 3)]);
  }
  mascot.addEventListener("pointerdown", event => {
    if (event.button !== undefined && event.button !== 0) return;
    petStartPoint = { x: event.clientX, y: event.clientY };
    clearTimeout(petTimer);
    petTimer = window.setTimeout(() => {
      if (petStartPoint && drag && !drag.moved) petMascot();
    }, 680);
  });
  mascot.addEventListener("pointermove", event => {
    if (!petStartPoint) return;
    if (Math.abs(event.clientX - petStartPoint.x) + Math.abs(event.clientY - petStartPoint.y) > 10) {
      clearTimeout(petTimer); petTimer = 0;
    }
  });
  mascot.addEventListener("pointerup", () => {
    clearTimeout(petTimer); petTimer = 0; petStartPoint = null;
  });
  mascot.addEventListener("pointercancel", () => {
    clearTimeout(petTimer); petTimer = 0; petStartPoint = null; petPerformed = false;
  });

  function getPageStage() {
    const statusText = document.getElementById("status")?.textContent || "";
    const result = document.getElementById("projectResult");
    if (/создаём|создаем|генерац|анализируем/i.test(statusText) && document.getElementById("progressBox")?.style.display !== "none")
      return "Сейчас идёт создание проекта. Лучше не обновлять страницу и дождаться готовности.";
    if (result && getComputedStyle(result).display !== "none")
      return "Проект уже готов. Можно скачать файлы или попросить меня подсказать, что улучшить.";
    if (document.activeElement?.id === "editInstruction")
      return "Ты редактируешь проект. Напиши конкретно, что нужно исправить или добавить.";
    if (document.activeElement?.id === "topic" || document.activeElement?.name === "topic")
      return "Ты выбираешь тему. Хорошая тема конкретная, понятная и такую работу реально выполнить.";
    if (/презентац/i.test(location.hash) || document.activeElement?.id?.toLowerCase().includes("presentation"))
      return "Ты работаешь с презентацией. Сначала укажи тему, затем проверь структуру и число слайдов.";
    return "Я могу подсказать по созданию проекта, презентации и работе с сайтом.";
  }
  function getFieldHint(field) {
    const key = ((field.id || "") + " " + (field.name || "") + " " + (field.placeholder || "")).toLowerCase();
    if (/topic|тема/.test(key)) return "Подсказка: сузь тему до одного понятного вопроса — так проект получится точнее.";
    if (/slide|слайд/.test(key)) return "Подсказка: ориентируйся на требования учителя. Если их нет, обычно удобно начать с 8–12 слайдов.";
    if (/school|школ/.test(key)) return "Это поле можно заполнить названием школы; не добавляй сюда личные данные, которые не требуются.";
    if (/class|класс/.test(key)) return "Укажи класс в том формате, который просит форма.";
    if (/require|дополн|пожелан/.test(key)) return "В пожеланиях можно указать требования учителя, стиль оформления и нужные практические материалы.";
    if (/edit|измен|instruction/.test(key)) return "Лучше перечислить изменения конкретно: что убрать, что добавить и что переписать.";
    const label = field.labels?.[0]?.textContent?.trim();
    return label ? "Подсказка по полю «" + label + "»: заполняй его по требованиям задания." : "Нужна подсказка? Спроси меня — помогу разобраться.";
  }
  document.addEventListener("focusin", event => {
    const field = event.target;
    if (!field.matches?.("input,textarea,select,[contenteditable='true']") || field.closest("#ian-mascot-chat") || doNotDisturb || hintedFields.has(field)) return;
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => {
      if (document.activeElement !== field || doNotDisturb || chat.classList.contains("open") || Date.now() - lastFieldInputAt < 9000) return;
      hintedFields.add(field); say(getFieldHint(field)); setEmotion("thinking", 2200);
    }, 22000);
  });
  document.addEventListener("focusout", event => {
    if (event.target.matches?.("input,textarea,select,[contenteditable='true']")) clearTimeout(hintTimer);
  });
  document.addEventListener("input", event => {
    if (!event.target.closest("#ian-mascot-chat")) lastFieldInputAt = Date.now();
  });

  const personalityLines = [
    ["Люблю, когда на сайте появляются новые идеи! 💡", "delighted"],
    ["Пока осмотрю страницу. Вдруг найду что-нибудь интересное.", "curious"],
    ["Хм-м, кажется, здесь может родиться отличный проект.", "thinking"],
    ["Секундочку… проверяю, всё ли вокруг в порядке.", "look"],
    ["Я немного подремлю, пока ты занят. 😴", "sleepy"],
    ["Мой внутренний моторчик сегодня работает отлично!", "excited"]
  ];
  window.setInterval(() => {
    if (doNotDisturb || !motionEnabled || document.hidden || gameActive || chat.classList.contains("open") ||
        mascot.classList.contains("dragging") || Date.now() - lastHumanAction < 65000 ||
        Date.now() - lastPersonalityLine < 115000) return;
    const line = personalityLines[Math.floor(Math.random() * personalityLines.length)];
    lastPersonalityLine = Date.now();
    setEmotion(line[1], 2400);
    if (line[1] === "sleepy") mascot.classList.add("snooze");
    else if (line[1] === "delighted" || line[1] === "excited") animate("happy", 1200);
    else if (line[1] === "thinking") animate("think", 1600);
    say(line[0]);
  }, 26000);
  document.addEventListener("pointerdown", event => {
    if (!event.target.closest("#ian-mascot-chat")) lastHumanAction = Date.now();
  }, { passive: true });
  document.addEventListener("keydown", () => { lastHumanAction = Date.now(); }, { passive: true });

  function handleMascotSpecialCommand(question) {
    const q = normalizeMascotText(question);
    if (/поймай меня|давай играть|сыграем|мини игра|миниигра/.test(q)) {
      addMessage(question, "user"); addMessage("Попробуй поймать меня пять раз за 18 секунд!", "bot");
      beginCatchGame(); return true;
    }
    if (/настройк/.test(q)) {
      addMessage(question, "user");
      addMessage("Открыл мои настройки. Здесь можно настроить размер, скорость и режим тишины.", "bot");
      chat.classList.add("open"); setSettingsOpen(true); return true;
    }
    if (/поглад|дай пять|пять мне/.test(q)) {
      addMessage(question, "user"); addMessage("Хи-хи! Спасибо! 💛", "bot"); petMascot(); return true;
    }
    if (/секрет|магия|золотой мёд|золотый мед/.test(q)) {
      addMessage(question, "user"); addMessage("Ты нашёл секретную реакцию! Включаю золотой танец! ✨", "bot");
      setEmotion("delighted", 2600);
      if (motionEnabled) animate("dance", 1800);
      mascot.classList.add("lit"); lit = true; playMascotSound(940);
      say("Секрет найден! Ты настоящий исследователь! 🌟"); return true;
    }
    if (/что происходит|где я|на каком этапе|что делать сейчас/.test(q)) {
      addMessage(question, "user"); addMessage(getPageStage(), "bot"); return true;
    }
    return false;
  }
  document.addEventListener("keydown", event => { if (event.key === "Escape") setSettingsOpen(false); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && gameActive) stopCatchGame(false, true); });

  function positionSpeech() {
    const bounds = mascot.getBoundingClientRect();
    const gap = 25, margin = 12;
    speech.style.position = "fixed";
    speech.style.left = "0px";
    speech.style.top = "0px";

    const rightSpace = window.innerWidth - bounds.right - gap - margin;
    const leftSpace = bounds.left - gap - margin;
    const useRight = rightSpace >= leftSpace;
    const sideSpace = Math.max(rightSpace, leftSpace);
    let left, top, bubble;

    if (sideSpace >= 145) {
      speech.style.setProperty("max-width", Math.min(260, sideSpace) + "px", "important");
      bubble = speech.getBoundingClientRect();
      left = useRight ? bounds.right + gap : bounds.left - bubble.width - gap;
      top = bounds.top + bounds.height / 2 - bubble.height / 2;
    } else {
      // When the mascot is near the middle, place the bubble above or below it.
      speech.style.setProperty("max-width", Math.max(120, Math.min(260, window.innerWidth - margin * 2)) + "px", "important");
      bubble = speech.getBoundingClientRect();
      left = bounds.left + bounds.width / 2 - bubble.width / 2;
      const belowSpace = window.innerHeight - bounds.bottom - gap - margin;
      const aboveSpace = bounds.top - gap - margin;
      top = belowSpace >= bubble.height || belowSpace >= aboveSpace
        ? bounds.bottom + gap
        : bounds.top - bubble.height - gap;
    }

    left = Math.max(margin, Math.min(left, window.innerWidth - bubble.width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - bubble.height - margin));
    speech.style.left = left + "px";
    speech.style.top = top + "px";
  }

  function say(text) {
    speech.textContent = text;
    mascot.classList.add("speak");
    positionSpeech();
    clearTimeout(mascot._speechTimer);
    mascot._speechTimer = setTimeout(() => mascot.classList.remove("speak"), 3200);
  }

  window.addEventListener("resize", () => {
    if (mascot.classList.contains("speak")) positionSpeech();
  }, { passive: true });
  window.addEventListener("scroll", () => {
    if (mascot.classList.contains("speak")) positionSpeech();
  }, { passive: true });

  function trackLogoEyes(event) {
    const bounds = mascot.getBoundingClientRect();
    const dx = (event.clientX - (bounds.left + bounds.width / 2)) / Math.max(1, bounds.width / 2);
    const dy = (event.clientY - (bounds.top + bounds.height / 2)) / Math.max(1, bounds.height / 2);
    const gazeX = Math.max(-2.2, Math.min(2.2, dx * 2.2));
    const gazeY = Math.max(-2.2, Math.min(2.2, dy * 2.2));
    mascot.style.setProperty("--gaze-x", gazeX.toFixed(1) + "px");
    mascot.style.setProperty("--gaze-y", gazeY.toFixed(1) + "px");
  }
  document.addEventListener("pointermove", trackLogoEyes, { passive: true });
  mascot.addEventListener("pointerleave", () => {
    mascot.style.setProperty("--gaze-x", "0px");
    mascot.style.setProperty("--gaze-y", "0px");
  });

  const emotionNames = ["neutral", "happy", "sad", "surprised", "curious", "angry", "sleepy", "thinking", "love", "excited", "confused", "worried", "proud", "shy", "laugh", "playful", "determined", "relieved", "mischievous", "grateful", "bored", "delighted", "concerned", "amazed"];
  function setEmotion(name, duration = 2300) {
    const emotion = emotionNames.includes(name) ? name : "neutral";
    mascot.classList.remove(...emotionNames.map(item => "emotion-" + item));
    mascot.classList.add("emotion-" + emotion);
    clearTimeout(mascot._emotionTimer);
    if (duration > 0 && emotion !== "neutral") {
      mascot._emotionTimer = setTimeout(() => {
        mascot.classList.remove("emotion-" + emotion);
        mascot.classList.add("emotion-neutral");
      }, duration);
    }
  }
  function inferEmotion(value) {
    const q = String(value || "").toLocaleLowerCase("ru").replace(/ё/g, "е");
    if (/(груст|печал|обидно|тоск|расстро|плохо на душе)/i.test(q)) return "sad";
    if (/(злюсь|злой|раздраж|бесит|сердит)/i.test(q)) return "angry";
    if (/(ого|вау|не ожидал|неожидан|серьезно|серьёзно|правда?!)/i.test(q)) return "surprised";
    if (/(люблю|обожаю|мед|мёд|сердеч|милый|дорогой)/i.test(q)) return "love";
    if (/(спать|сонный|устал|пора спать|спокойной ночи)/i.test(q)) return "sleepy";
    if (/(не понял|не понимаю|запутал|странно)/i.test(q)) return "confused";
    if (/(боюсь|страшно|пережива|волнуюсь|тревожно)/i.test(q)) return "worried";
    if (/(горжусь|получилось|сдал|победил|готово)/i.test(q)) return "proud";
    if (/(стесняюсь|неловко|смущен|смущён)/i.test(q)) return "shy";
    if (/(ха-ха|ахаха|смешно|шутка|рассмеш)/i.test(q)) return "laugh";
    if (/(играть|игра|прикол|шалость)/i.test(q)) return "playful";
    if (/(ура|супер|круто|восторг|невероятно)/i.test(q)) return "excited";
    if (/(думаю|подумай|почему|как именно|что значит|объясни)/i.test(q) || /\?\s*$/.test(q)) return "thinking";
    if (/(привет|здравствуй|рад|счастлив|спасибо|молодец|класс|отлично)/i.test(q)) return "happy";
    if (/(справлюсь|не сдамся|решительно|добьюсь|цель)/i.test(q)) return "determined";
    if (/(фух|наконец|полегчало|успокоился)/i.test(q)) return "relieved";
    if (/(хитр|шалю|подмиг|секрет)/i.test(q)) return "mischievous";
    if (/(благодарен|признателен|ценю)/i.test(q)) return "grateful";
    if (/(надоело|неинтересно|однообразно)/i.test(q)) return "bored";
    if (/(восхитительно|потрясающе|обалденно)/i.test(q)) return "delighted";
    if (/(переживаю за|опасаюсь|не уверен)/i.test(q)) return "concerned";
    if (/(невероятно|поразительно|изумительно)/i.test(q)) return "amazed";
    return "curious";
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
    if (!motionEnabled || doNotDisturb || gameActive || document.hidden || mascot.classList.contains("dragging") || chat.classList.contains("open")) return;
    // Idle motion stays in place; the mascot never wanders over page content.
    const moves = ["look", "blink", "snooze", "happy", "think"];
    const move = moves[Math.floor(Math.random() * moves.length)];
    mascot.classList.remove("look", "blink", "happy", "think");
    void mascot.offsetWidth;
    mascot.classList.add(move);
    const idleEmotion = ({ look: "curious", think: "thinking", snooze: "sleepy", happy: "happy" })[move] || "neutral";
    setEmotion(idleEmotion, move === "snooze" ? 2600 : 1450);
    setTimeout(() => mascot.classList.remove(move), move === "snooze" ? 2600 : 1450);
  }
  idleTimer = setInterval(randomIdle, 4600);

  // Небольшие самостоятельные прогулки по свободному нижнему краю экрана.
  // Не двигаемся, пока человек печатает, перетаскивает персонажа или открыт чат.
  let roamTimer = 0;
  function takeTinyWalk() {
    if (!motionEnabled || doNotDisturb || gameActive || document.hidden || drag || chat.classList.contains("open") ||
        document.querySelector("input:focus,textarea:focus,select:focus,[contenteditable='true']:focus")) return;
    const rect = mascot.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const current = Math.max(8, Math.min(maxLeft, rect.left));
    const direction = current > maxLeft - 55 ? -1 : current < 55 ? 1 : (Math.random() > .5 ? 1 : -1);
    const next = Math.max(8, Math.min(maxLeft, current + direction * (34 + Math.random() * 42)));
    mascot.style.transition = "left 1.15s cubic-bezier(.2,.8,.2,1)";
    mascot.style.setProperty("left", next + "px", "important");
    mascot.style.setProperty("right", "auto", "important");
    mascot.classList.add("walk");
    setEmotion("curious", 1300);
    setTimeout(() => mascot.classList.remove("walk"), 1250);
    setTimeout(() => { mascot.style.transition = ""; }, 1400);
  }
  roamTimer = window.setInterval(takeTinyWalk, 14500);
  restartRoamTimer();
  window.addEventListener("resize", () => {
    if (drag) return;
    const r = mascot.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - r.width - 8);
    if (r.left > maxLeft) mascot.style.setProperty("left", maxLeft + "px", "important");
  }, {passive:true});
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) mascot.classList.remove("walk", "run", "happy", "think", "look", "blink", "bird-hop", "bird-flap", "bird-cheer", "bird-fly", "snooze", "dance");
    else checkMascotOverlap();
  });
  mascot.addEventListener("pointerenter", () => {
    if (motionEnabled && !matchMedia("(prefers-reduced-motion: reduce)").matches) mascot.classList.add("curious");
  });
  mascot.addEventListener("pointerleave", () => mascot.classList.remove("curious"));
  function lampToggle() {
    lit = !lit;
    mascot.classList.toggle("lit", lit);
    say(lit ? "Лампочка включена! 💡" : "Лампочка выключена.");
    if (motionEnabled) animate("happy");
    if (motionEnabled) mascot.classList.add("happy");
    setTimeout(() => mascot.classList.remove("happy"), 1200);
  }
  function openChat() {
    chat.classList.add("open");
    setSettingsOpen(false);
    say(["О, привет! Ты ко мне? 🍯", "Ну наконец-то! Я уже заскучал.", "Привет-привет! Что нового?", "Я тут! Рассказывай, что случилось."][Math.floor(Math.random()*4)]);
    setEmotion("happy", 1300);
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


  // 100 built-in scenarios. Common commands are answered locally, without waiting for AI.
  const winnieScenarios = [[["кто ты","ты кто","представься"],"Я Винни — виртуальный помощник сайта «Все проекты #Ian». Помогаю с проектами и хорошим настроением!","happy"],[["как тебя зовут","твое имя","твоё имя"],"Меня зовут Винни. А мой жёлтый друг — друг!","happy"],[["кто такой вудсток","кто это рядом"],"Это друг — мой маленький пернатый напарник.","bird-cheer"],[["сколько тебе лет","твой возраст"],"Я не считаю годы — я считаю хорошие приключения!","dance"],[["ты настоящий","ты реальный"],"Я виртуальный персонаж на сайте, но всегда готов помочь.","blink"],[["ты собака","какая ты порода"],"Я медвежонок Винни и талисман сайта!","happy"],[["ты робот","ты искусственный интеллект"],"Я цифровой помощник. Могу отвечать на вопросы и помогать с сайтом.","think"],[["ты умеешь говорить","ты разговариваешь"],"Да! Напиши сообщение в чате, и я отвечу.","happy"],[["ты мой друг","мы друзья"],"Конечно, мы отличная команда!","happy"],[["ты здесь","ты на месте"],"Я здесь! друг тоже на месте.","wave"],[["привет","здравствуй","приветик"],"Привет! Рад тебя видеть. Как настроение?","happy"],[["доброе утро","с добрым утром"],"Доброе утро! Пусть день начнётся отлично!","jump"],[["добрый день"],"Добрый день! Чем займёмся сегодня?","happy"],[["добрый вечер"],"Добрый вечер! Хорошо, что заглянул.","happy"],[["спокойной ночи","пора спать"],"Спокойной ночи! Хорошо отдохни.","snooze"],[["пока","до свидания","увидимся"],"До встречи! Я буду здесь, когда понадоблюсь.","wave"],[["как дела","как поживаешь"],"Отлично! Сегодня у меня много энергии.","happy"],[["как настроение","какое настроение"],"Бодрое! Даже хочется немного потанцевать.","dance"],[["что делаешь","чем занимаешься"],"Слежу за порядком на сайте и жду интересных вопросов.","look"],[["ты скучал","скучал"],"Я всегда рад продолжить наш разговор!","happy"],[["расскажи шутку","пошути"],"Почему медвежонок не пользуется компьютером? Боится, что мышка утащит мёд!","dance"],[["еще шутку","ещё шутку","другая шутка"],"Что сказал ноль восьмёрке? Классный ремень!","happy"],[["ты смешной","смешно"],"Стараюсь! Хорошее настроение тоже важно.","dance"],[["спой песню","пой"],"Ла-ла-ла! Это мой короткий медовый хит.","dance"],[["станцуй","потанцуй","танец"],"Включаю фирменный танец!","dance"],[["прыгай","прыгни","прыжок"],"Прыжок выполнен! друг чуть не взлетел!","happy"],[["беги","побежали","бег"],"Вперёд, к новым приключениям!","run"],[["иди","пройдись","прогуляйся"],"Отправляюсь на маленькую прогулку по экрану.","walk"],[["спи","поспи","засыпай"],"Пора немного отдохнуть… Z-z-z.","snooze"],[["проснись","вставай","подъем","подъём"],"Я уже проснулся! Готов к приключениям!","happy"],[["моргни","подмигни"],"Вот так!","blink"],[["помаши","помаши лапой"],"Привет-привет!","happy"],[["покажи радость","радуйся","ты рад"],"Ура! Как здорово!","happy"],[["подумай","подумай хорошенько"],"Хм-м… Собираю мысли в кучку.","think"],[["посмотри","осмотрись"],"Осматриваюсь! Всё в порядке.","look"],[["где вудсток","где твой друг"],"друг рядом со мной. Он никогда не пропускает приключения!","bird-cheer"],[["позови вудстока","позови друга"],"друг! Нас зовут!","bird-cheer"],[["что ты любишь","твои любимые вещи"],"Прогулки, печенье, друзей и интересные задачи.","happy"],[["любишь печенье","хочешь печенье"],"Конечно! Печенье — отличный повод для перерыва.","happy"],[["любишь приключения","хочешь приключений"],"Очень! Главное — чтобы они были безопасными.","run"],[["любишь учиться","нравится учиться"],"Да! Знания помогают создавать удивительные вещи.","think"],[["помоги","мне нужна помощь"],"Конечно. Напиши, что не получается, и разберёмся вместе.","think"],[["помоги с сайтом","сайт не работает"],"Расскажи, что именно не работает, или пришли скриншот.","think"],[["как создать проект","создать проект"],"Нажми «Создать проект», заполни тему и данные, затем запусти генерацию.","look"],[["как сделать презентацию","создать презентацию"],"Открой раздел презентаций, укажи тему и нужные параметры.","look"],[["где тарифы","покажи тарифы"],"Открой меню сайта и выбери раздел «Тарифы».","look"],[["почему ошибка","у меня ошибка"],"Пришли текст ошибки или скриншот — помогу разобраться.","think"],[["не работает кнопка","кнопка не нажимается"],"Проверь обязательные поля. Если кнопка всё равно не работает, пришли скриншот.","think"],[["не скачивается файл","файл не скачивается"],"Попробуй открыть результат ещё раз. Если ошибка повторится, пришли её текст.","think"],[["как скачать проект","скачать проект"],"После генерации открой карточку нужного файла и нажми «Скачать».","look"],[["как связаться с поддержкой","поддержка"],"Ссылка поддержки Telegram находится внизу сайта.","look"],[["что такое проект","объясни проект"],"Проект — это работа с целью, задачами, исследованием или практикой и выводами.","think"],[["что такое цель","цель проекта"],"Цель — это результат, которого ты хочешь достичь в проекте.","think"],[["что такое задачи","задачи проекта"],"Задачи — конкретные шаги, которые помогают достичь цели.","think"],[["что такое гипотеза","гипотеза"],"Гипотеза — предположение, которое можно проверить.","think"],[["как выбрать тему","выбрать тему"],"Выбери то, что тебе интересно и что реально исследовать.","think"],[["как оформить проект","оформление проекта"],"Обычно нужны титульный лист, введение, основная часть, заключение и источники.","think"],[["как подготовиться к защите","защита проекта"],"Потренируй короткий рассказ: цель, задачи, результаты и выводы.","think"],[["сколько слайдов","число слайдов"],"Следуй требованиям учителя. Часто достаточно 8–12 содержательных слайдов.","think"],[["как не волноваться","я волнуюсь"],"Это нормально. Подготовь план и потренируйся заранее — шаг за шагом.","happy"],[["молодец","я молодец"],"Спасибо! Ты тоже отлично справляешься!","happy"],[["спасибо","благодарю"],"Всегда пожалуйста! Обращайся.","happy"],[["извини","прости"],"Ничего страшного, всё хорошо.","happy"],[["ты лучший","ты классный"],"Спасибо! Работаем командой!","dance"],[["я устал","устал"],"Сделай небольшой перерыв, попей воды и отдохни.","snooze"],[["мне скучно","скучно"],"Можем придумать идею для проекта или сыграть в словесную игру.","dance"],[["мне грустно","грустно"],"Жаль, что день не задался. Можешь рассказать, что случилось, или поговорить с близким человеком.","sad"],[["я рад","я счастлив"],"Здорово! Разделяю твою радость!","happy"],[["пожелай удачи","удачи мне"],"Удачи! Пусть всё получится!","happy"],[["скажи комплимент","похвали меня"],"У тебя есть идея и желание её воплотить — это уже сильное начало!","happy"],[["расскажи историю","история"],"Однажды мы с другом искали самую интересную идею и нашли целую мастерскую проектов!","think"],[["придумай идею","идея для проекта"],"Идея: исследуй, как одна полезная привычка помогает учиться и отдыхать.","think"],[["загадай загадку","загадка"],"Без рук, без ног, а рисовать умеет. Что это? Мороз!","think"],[["ответ загадки","отгадка"],"Ответ: мороз. Он рисует узоры на окнах.","happy"],[["давай играть","поиграем"],"Давай! Назови любое слово, а я отвечу ассоциацией.","happy"],[["камень ножницы бумага","сыграем в камень"],"Раз, два, три! Я выбираю бумагу!","happy"],[["выбери число","назови число"],"Пусть сегодня будет число 7 — счастливое и бодрое!","happy"],[["скажи факт","интересный факт"],"У медведей отличное обоняние: запахи помогают им находить пищу.","think"],[["какая погода","погода"],"Я не получаю данные о погоде, но могу помочь собрать вещи для прогулки.","think"],[["который час","сколько времени"],"Точное время смотри в строке состояния телефона.","look"],[["ты умеешь считать","посчитай"],"Да! Напиши пример, и я попробую помочь.","think"],[["помоги с математикой","математика"],"Пришли пример или фото задания — разберём по шагам.","think"],[["помоги с английским","английский"],"Напиши слово или предложение — помогу перевести и объяснить.","think"],[["помоги с русским","русский язык"],"Пришли упражнение — разберём правило и пример.","think"],[["помоги с физикой","физика"],"Напиши условие задачи. Помогу выделить дано и подобрать формулу.","think"],[["помоги с химией","химия"],"Пришли реакцию или задание — разберём её аккуратно.","think"],[["напомни про перерыв","перерыв"],"Небольшой перерыв помогает восстановить внимание. Потянись и отдохни.","snooze"],[["что нового","новости"],"Я готов помочь придумать что-нибудь новое для проекта!","happy"],[["не уходи","останься"],"Я остаюсь на экране, пока ты пользуешься сайтом.","happy"],[["включи лампочку","лампочка"],"Трижды нажми на маскота — включится лампочка!","happy"],[["как тебя включить","открыть тебя"],"Нажми на меня один раз, чтобы открыть чат.","look"],[["как открыть чат","открыть чат"],"Нажми на маскота один раз — появится окно чата.","look"],[["как тебя передвинуть","переместить маскота"],"Зажми меня пальцем и перетащи в удобное место.","walk"],[["ты двигаешься","почему ты двигаешься"],"Да! У меня есть несколько движений и реакций.","dance"],[["почему ты исчезаешь","ты исчез"],"Теперь маскот закреплён поверх страницы и не должен скрываться при прокрутке.","happy"],[["расскажи о вудстоке","что любит вудсток"],"друг — мой маленький жёлтый друг. Он любит летать рядом и поддерживать меня.","bird-cheer"],[["что ты умеешь","твои возможности"],"Я отвечаю на частые вопросы, реагирую на команды и помогаю разобраться с сайтом.","think"],[["как изменить размер","сделать тебя больше"],"Размер маскота можно настроить в стилях сайта.","look"],[["как включить анимацию","анимации не работают"],"Открой настройки движения в чате и проверь, что анимации включены.","happy"],[["почему ты маленький","увеличься"],"На телефоне я компактный, чтобы не закрывать содержимое. Можно увеличить меня в стилях.","happy"]];
  function normalizeMascotText(value) {
    return String(value || "").toLocaleLowerCase("ru").replace(/ё/g,"е")
      .replace(/[^а-яa-z0-9 ]/gi," ").replace(/\s+/g," ").trim();
  }
  function findMascotScenario(value) {
    const q=normalizeMascotText(value);
    if(!q) return null;
    const matches=[];
    for(const item of winnieScenarios) for(const phrase of item[0]) {
      const p=normalizeMascotText(phrase);
      if(q===p || q.includes(" "+p+" ") || q.startsWith(p+" ") ||
         q.endsWith(" "+p) || (q.length>8 && p.startsWith(q))) matches.push({item,score:p.length});
    }
    matches.sort((x,y)=>y.score-x.score);
    return matches[0]?.item || null;
  }
  function playMascotScenario(action) {
    const emotionByAction = {
      happy: "happy", dance: "playful", jump: "excited", wave: "happy",
      walk: "curious", run: "excited", look: "curious", blink: "shy",
      think: "thinking", snooze: "sleepy", sleep: "sleepy",
      sad: "sad", surprise: "surprised", angry: "angry", love: "love",
      confused: "confused", worried: "worried", proud: "proud", laugh: "laugh"
    };
    setEmotion(emotionByAction[action] || "curious", 2200);
    if(!motionEnabled) return;
    const classes=["walk","run","happy","think","look","blink","bird-hop","bird-flap","bird-cheer","bird-fly","snooze","dance"];
    mascot.classList.remove(...classes);
    void mascot.offsetWidth;
    const cls=action==="wave"||action==="jump"?"happy":action==="sleep"?"snooze":action;
    if(classes.includes(cls)) {
      mascot.classList.add(cls);
      setTimeout(()=>mascot.classList.remove(cls),cls==="snooze"?2600:1600);
    }
  }
  mascot.addEventListener("click", () => {
    if (mascot.dataset.dragged === "yes") {
      mascot.dataset.dragged = "";
      return;
    }
    if (petPerformed) { petPerformed = false; return; }
    if (gameActive) { catchMascot(); return; }
    taps++;
    clearTimeout(tapTimer);
    if (taps === 3) {
      taps = 0;
      lampToggle();
      setEmotion(lit ? "delighted" : "curious", 1800);
    } else {
      setEmotion(taps === 1 ? "curious" : "excited", 650);
      tapTimer = setTimeout(() => {
        if (taps === 1) openChat();
        taps = 0;
      }, 430);
    }
  });
  chat.querySelector(".head button[aria-label=\"Закрыть\"]").addEventListener("click", () => {
    chat.classList.remove("open");
    setSettingsOpen(false);
  });
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
    mascot.style.setProperty("left", r.left + "px", "important");
    mascot.style.setProperty("top", r.top + "px", "important");
    mascot.style.setProperty("right", "auto", "important");
    mascot.style.setProperty("bottom", "auto", "important");
    mascot.classList.add("dragging");
    mascot.setPointerCapture(e.pointerId);
  });
  let shakeSamples = [], shakeCooldown = 0;
  mascot.addEventListener("pointermove", e => {
    if (!drag || drag.id !== e.pointerId) return;
    const now = performance.now(), dt = Math.max(8, now - drag.time);
    const dx = e.clientX - drag.px, dy = e.clientY - drag.py;
    if (!drag.moved && Math.abs(e.clientX - drag.px) + Math.abs(e.clientY - drag.py) > 8) {
      drag.moved = true;
      clearTimeout(tapTimer);
      taps = 0;
      setEmotion("surprised", 900);
      say(["Ой! Меня несут! 😮", "Эй, куда мы отправляемся?", "Ха! Поехали кататься!"][Math.floor(Math.random()*3)]);
    }
    if (drag.moved) {
      const direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "r" : "l") : (dy > 0 ? "d" : "u");
      shakeSamples.push({direction,time:now});
      shakeSamples = shakeSamples.filter(sample => now-sample.time < 850);
      let changes = 0;
      for(let i=1;i<shakeSamples.length;i++) if(shakeSamples[i].direction!==shakeSamples[i-1].direction) changes++;
      if(changes >= 3 && now-shakeCooldown > 1800) {
        shakeCooldown = now;
        shakeSamples = [];
        setEmotion("confused", 1800);
        say(["Ой-ой! Голова кругом! 😵", "Аккуратнее, я же не юла!", "Ха-ха! Щекотно, остановись!"][Math.floor(Math.random()*3)]);
        mascot.classList.remove("collision");
        void mascot.offsetWidth;
        mascot.classList.add("collision");
        setTimeout(()=>mascot.classList.remove("collision"),850);
      }
    }
    vx = Math.max(-22, Math.min(22, dx / dt * 16));
    vy = Math.max(-22, Math.min(22, dy / dt * 16));
    drag.x = Math.max(0, Math.min(innerWidth - mascot.offsetWidth, drag.x + dx));
    drag.y = Math.max(0, Math.min(innerHeight - mascot.offsetHeight, drag.y + dy));
    mascot.style.setProperty("left", drag.x + "px", "important");
    mascot.style.setProperty("top", drag.y + "px", "important");
    mascot.classList.toggle("speech-left", drag.x < innerWidth * 0.48);
    drag.px = e.clientX; drag.py = e.clientY; drag.time = now;
  });
  let wallBounceCooldown = 0;
  function showWallImpact(axis) {
    const now = performance.now();
    if (now - wallBounceCooldown < 420) return;
    wallBounceCooldown = now;
    setEmotion("angry", 1500);
    mascot.classList.remove("collision");
    void mascot.offsetWidth;
    mascot.classList.add("collision", "wall-hit");
    mascot.style.setProperty("--wall-hit-angle", axis === "x" ? "9deg" : "-7deg");
    say(["Ай! Стенка! 😠", "Ой, куда это я?! 😤", "Эй, осторожнее с моим носом! 😠"][Math.floor(Math.random()*3)]);
    setTimeout(() => mascot.classList.remove("collision", "wall-hit"), 620);
  }
  function glideAndBounce() {
    if (drag || !mascot.isConnected) return;
    const maxX = Math.max(0, innerWidth - mascot.offsetWidth);
    const maxY = Math.max(0, innerHeight - mascot.offsetHeight);
    let x = parseFloat(mascot.style.left) || mascot.getBoundingClientRect().left;
    let y = parseFloat(mascot.style.top) || mascot.getBoundingClientRect().top;
    let hit = "";
    x += vx;
    y += vy;
    if (x < 0) { x = 0; vx = Math.abs(vx) * 0.72; hit = "x"; }
    else if (x > maxX) { x = maxX; vx = -Math.abs(vx) * 0.72; hit = "x"; }
    if (y < 0) { y = 0; vy = Math.abs(vy) * 0.68; hit = hit || "y"; }
    else if (y > maxY) { y = maxY; vy = -Math.abs(vy) * 0.68; hit = hit || "y"; }
    if (hit) {
      showWallImpact(hit);
      mascot.style.setProperty("--bounce-direction", hit === "x" ? "1" : "-1");
    }
    vx *= 0.94;
    vy *= 0.94;
    mascot.style.setProperty("left", x + "px", "important");
    mascot.style.setProperty("top", y + "px", "important");
    mascot.classList.toggle("speech-left", x < innerWidth * 0.48);
    if (Math.abs(vx) < 0.18 && Math.abs(vy) < 0.18) {
      vx = 0; vy = 0; frame = 0;
      mascot.classList.remove("gliding");
      return;
    }
    frame = requestAnimationFrame(glideAndBounce);
  }
  function release(e) {
    if (!drag || drag.id !== e.pointerId) return;
    const moved = drag.moved;
    const x = drag.x, y = drag.y;
    drag = null;
    mascot.classList.remove("dragging");
    if (!moved) return;
    mascot.dataset.dragged = "yes";
    cancelAnimationFrame(frame);
    mascot.classList.add("gliding");
    mascot.classList.remove("collision", "wall-hit");
    mascot.style.setProperty("left", Math.max(0, Math.min(innerWidth - mascot.offsetWidth, x)) + "px", "important");
    mascot.style.setProperty("top", Math.max(0, Math.min(innerHeight - mascot.offsetHeight, y)) + "px", "important");
    if (Math.abs(vx) + Math.abs(vy) < 1.1) {
      vx *= 1.8; vy *= 1.8;
    }
    const throwSpeed = Math.abs(vx) + Math.abs(vy);
    if (throwSpeed > 10) {
      setEmotion("excited", 1500);
      say(["А-а-а! Полетели-и-и! 🎈", "Уиии! Как быстро!", "Ловите меня! Я в полёте!"][Math.floor(Math.random()*3)]);
      mascot.classList.add("gliding");
    } else {
      setEmotion("playful", 1200);
      say(["Хи-хи! Прогулка окончена?", "Спасибо за путешествие!", "Поставь меня поудобнее, пожалуйста! 🍯"][Math.floor(Math.random()*3)]);
    }
    if (motionEnabled) animate("happy", 700);
    frame = requestAnimationFrame(glideAndBounce);
  }
  mascot.addEventListener("pointerup", release);
  mascot.addEventListener("pointercancel", release);
  mascot.addEventListener("dragstart", e => e.preventDefault());

  // Если маскот задал вопрос, следующий ответ пользователя продолжает
  // именно этот разговор через ИИ, а не запускает новый заготовленный сценарий.
  let awaitingDialogueReply = false;
  function responseInvitesReply(value) {
    const text = String(value || "").trim();
    return /\?\s*$/.test(text) ||
      /(?:расскажи|напиши|уточни|скажи|какой|какая|какое|какие|что именно|чем могу помочь)[^.!?]*[.!?]?\s*$/i.test(text);
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question || form.dataset.sending === "yes") return;
    if (handleMascotSpecialCommand(question)) {
      input.value = "";
      messages.scrollTop = messages.scrollHeight;
      return;
    }

    setEmotion(inferEmotion(question), 30000);
    const localScenario = awaitingDialogueReply ? null : findMascotScenario(question);
    if(localScenario) {
      addMessage(question,"user");
      input.value="";
      addMessage(localScenario[1],"bot");
      awaitingDialogueReply = responseInvitesReply(localScenario[1]);
      playMascotScenario(localScenario[2]);
      say(localScenario[1]);
      return;
    }
    // Любой ответ на вопрос маскота отправляем в ИИ вместе с историей диалога.
    const wasContinuingDialogue = awaitingDialogueReply;
    awaitingDialogueReply = false;
    form.dataset.sending = "yes";
    const sendButton = form.querySelector("button[type='submit']");
    sendButton.disabled = true;
    input.disabled = true;
    addMessage(question, "user");
    input.value = "";
    if (motionEnabled) animate("think", 30000);
    const pending = addMessage("Винни думает…", "bot");
    const history = Array.from(messages.querySelectorAll(".msg")).slice(-14)
      .map(n => (n.classList.contains("user") ? "Пользователь: " : "Винни: ") + n.textContent).join("\n");
    const prompt = "Ты — Винни, дружелюбный русскоязычный помощник сайта «Все проекты #Ian». Отвечай коротко и естественно, помогай с сайтом, школьными проектами и презентациями. Веди настоящий последовательный диалог: учитывай предыдущие реплики, отвечай на смысл последнего сообщения, не начинай разговор заново и не повторяй уже заданный вопрос. Если пользователь отвечает на твой предыдущий вопрос, продолжи эту тему и задай следующий уместный вопрос только если он нужен. Не говори, что можешь сам нажимать кнопки или видеть личные данные. Последние сообщения:\n" + history + "\n" + (wasContinuingDialogue ? "Это продолжение начатого тобой диалога. Ответь с учётом предыдущего вопроса и ответа пользователя. " : "") + "Ответь на последнее сообщение.";
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Сервер не смог ответить. Попробуй ещё раз.");
      if (typeof data.answer !== "string" || !data.answer.trim()) throw new Error("Сервер вернул пустой ответ.");
      pending.textContent = data.answer || "Попробуй спросить иначе.";
      awaitingDialogueReply = responseInvitesReply(pending.textContent);
      setEmotion(inferEmotion(pending.textContent) || "happy", 2600);
      if (motionEnabled) animate("happy");
      if (motionEnabled) mascot.classList.add("bird-cheer");
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

  let lastGeneralReaction = 0;
  function reactToAction(emotion = "curious", animation = "look", bubble = "") {
    if (!motionEnabled || doNotDisturb || document.hidden || mascot.classList.contains("dragging")) return;
    const now = Date.now();
    if (now - lastGeneralReaction < 650) return;
    lastGeneralReaction = now;
    setEmotion(emotion, 1700);
    if (animation) animate(animation, 850);
    if (bubble) say(bubble);
  }

  // React to meaningful actions throughout the site without interrupting the user.
  document.addEventListener("click", e => {
    if (e.target.closest("#ian-mascot,#ian-mascot-chat")) return;
    if (e.target.closest("#createButton,.create-btn")) {
      reactToAction("thinking", "think", "Начинаем новый проект! ✨");
    } else if (e.target.closest(".download,[onclick*='downloadFile'],[onclick*='downloadAll']")) {
      reactToAction("proud", "happy", "Файл готов! 🍯");
    } else if (e.target.closest(".nav button,.mobile-menu,a[href^='#']")) {
      reactToAction("excited", "happy", "Пойдём посмотрим!");
    } else if (e.target.closest("button,[role='button']")) {
      reactToAction("curious", "look");
    } else {
      reactToAction("happy", "look");
    }
  }, true);

  document.addEventListener("focusin", e => {
    if (e.target.closest("#ian-mascot-chat")) return;
    if (e.target.matches("input,textarea,select,[contenteditable='true']")) reactToAction("thinking", "think");
  });
  document.addEventListener("input", e => {
    if (e.target.closest("#ian-mascot-chat")) return;
    if (e.target.matches("input,textarea,[contenteditable='true']")) reactToAction("thinking", "think");
  });
  document.addEventListener("change", e => {
    if (e.target.closest("#ian-mascot-chat")) return;
    if (e.target.matches("input,select,textarea")) reactToAction("happy", "happy");
  });
  document.addEventListener("submit", e => {
    if (e.target === form) return;
    if (e.target.matches("form")) reactToAction("thinking", "think", "Проверим, всё ли заполнено!");
  }, true);
  let scrollReactionTimer = 0;
  window.addEventListener("scroll", () => {
    if (scrollReactionTimer) return;
    scrollReactionTimer = window.setTimeout(() => {
      scrollReactionTimer = 0;
      reactToAction("curious", "look");
    }, 900);
  }, {passive:true});
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") reactToAction("surprised", "look");
    else if (e.key === "Enter" && !e.target.closest("#ian-mascot-chat")) reactToAction("excited", "happy");
  });
  document.addEventListener("pointerover", e => {
    const target = e.target.closest("button,a,[role='button'],.tile,.card,.result-card");
    if (!target || target.closest("#ian-mascot,#ian-mascot-chat")) return;
    reactToAction("curious", "look");
  }, {passive:true});
  document.addEventListener("dblclick", e => {
    if (e.target.closest("#ian-mascot,#ian-mascot-chat")) return;
    reactToAction("delighted", "happy", "О, двойное нажатие! ✨");
  });
  document.addEventListener("copy", () => reactToAction("proud", "happy", "Забирай полезное с собой!"));
  document.addEventListener("paste", () => reactToAction("thinking", "think", "Сейчас посмотрим, что ты вставил."));
  document.addEventListener("cut", () => reactToAction("surprised", "look"));
  document.addEventListener("dragstart", e => {
    if (e.target.closest && e.target.closest("#ian-mascot")) return;
    reactToAction("excited", "happy", "Что-то отправляется в путь!");
  }, true);
  document.addEventListener("drop", e => {
    if (e.target.closest && e.target.closest("#ian-mascot-chat")) return;
    reactToAction("surprised", "look", "О, что-то прилетело!");
  }, true);
  window.addEventListener("online", () => reactToAction("delighted", "happy", "Интернет снова с нами!"));
  window.addEventListener("offline", () => reactToAction("concerned", "think", "Похоже, интернет пропал. Я подожду."));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) reactToAction("happy", "wave", "С возвращением! 🍯");
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