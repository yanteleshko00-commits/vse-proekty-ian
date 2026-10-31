(() => {
  if (document.getElementById("ian-mascot")) return;

  const mascot = document.createElement("div");
  mascot.id = "ian-mascot";
  mascot.tabIndex = 0;
  mascot.setAttribute("role", "button");
  mascot.setAttribute("aria-label", "Снупи и Вудсток — фан-арт. Перетащи меня или нажми три раза для лампочки");
  mascot.innerHTML = `
    <div class="speech" id="ian-mascot-speech">Привет! Потяни меня за лапку 🐾</div>
    <img class="dog" src="/snoopy-woodstock.png?v=20261031-fanart1" alt="" draggable="false">`;
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
  chat.setAttribute("aria-label", "Чат со Снупи");
  chat.innerHTML = `
    <div class="head"><span>🐶</span><span>Снупи<br><small style="font-weight:400;color:#718078">Помощник сайта</small></span><button type="button" aria-label="Закрыть">×</button></div>
    <div class="messages" id="ian-messages" role="log" aria-live="polite" aria-relevant="additions text"><div class="msg">Привет! Я Снупи. Спрашивай о сайте, проектах и презентациях. Меня ещё можно бросать по экрану! 🐾</div></div>
    <form id="ian-chat-form"><input id="ian-chat-input" maxlength="1000" placeholder="Напиши Снупи..." autocomplete="off"><button type="submit" aria-label="Отправить">↑</button></form>`;
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
    if (!motionEnabled || document.hidden || mascot.classList.contains("dragging") || chat.classList.contains("open")) return;
    const moves = ["look", "blink", "bird-hop", "walk", "run", "snooze", "dance", "bird-fly"];
    const move = moves[Math.floor(Math.random() * moves.length)];
    mascot.classList.remove("look", "blink", "bird-hop");
    void mascot.offsetWidth;
    mascot.classList.add(move);
    setTimeout(() => mascot.classList.remove(move), move === "snooze" ? 2600 : 1450);
  }
  idleTimer = setInterval(randomIdle, 4600);
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
    if (motionEnabled) mascot.classList.add("bird-cheer");
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


  // 100 built-in scenarios. Common commands are answered locally, without waiting for AI.
  const snoopyScenarios = [[["кто ты","ты кто","представься"],"Я Снупи — виртуальный помощник сайта «Все проекты #Ian». Помогаю с проектами и хорошим настроением!","happy"],[["как тебя зовут","твое имя","твоё имя"],"Меня зовут Снупи. А мой жёлтый друг — Вудсток!","happy"],[["кто такой вудсток","кто это рядом"],"Это Вудсток — мой маленький пернатый напарник.","bird-cheer"],[["сколько тебе лет","твой возраст"],"Я не считаю годы — я считаю хорошие приключения!","dance"],[["ты настоящий","ты реальный"],"Я виртуальный персонаж на сайте, но всегда готов помочь.","blink"],[["ты собака","какая ты порода"],"Я дружелюбный пёс и талисман сайта!","happy"],[["ты робот","ты искусственный интеллект"],"Я цифровой помощник. Могу отвечать на вопросы и помогать с сайтом.","think"],[["ты умеешь говорить","ты разговариваешь"],"Да! Напиши сообщение в чате, и я отвечу.","happy"],[["ты мой друг","мы друзья"],"Конечно, мы отличная команда!","happy"],[["ты здесь","ты на месте"],"Я здесь! Вудсток тоже на месте.","wave"],[["привет","здравствуй","приветик"],"Привет! Рад тебя видеть. Как настроение?","happy"],[["доброе утро","с добрым утром"],"Доброе утро! Пусть день начнётся отлично!","jump"],[["добрый день"],"Добрый день! Чем займёмся сегодня?","happy"],[["добрый вечер"],"Добрый вечер! Хорошо, что заглянул.","happy"],[["спокойной ночи","пора спать"],"Спокойной ночи! Хорошо отдохни.","snooze"],[["пока","до свидания","увидимся"],"До встречи! Я буду здесь, когда понадоблюсь.","wave"],[["как дела","как поживаешь"],"Отлично! Сегодня у меня много энергии.","happy"],[["как настроение","какое настроение"],"Бодрое! Даже хочется немного потанцевать.","dance"],[["что делаешь","чем занимаешься"],"Слежу за порядком на сайте и жду интересных вопросов.","look"],[["ты скучал","скучал"],"Я всегда рад продолжить наш разговор!","happy"],[["расскажи шутку","пошути"],"Почему собака не пользуется компьютером? Боится мышки!","dance"],[["еще шутку","ещё шутку","другая шутка"],"Что сказал ноль восьмёрке? Классный ремень!","happy"],[["ты смешной","смешно"],"Стараюсь! Хорошее настроение тоже важно.","dance"],[["спой песню","пой"],"Гав-гав, ла-ла-ла! Это мой короткий хит.","dance"],[["станцуй","потанцуй","танец"],"Включаю фирменный танец!","dance"],[["прыгай","прыгни","прыжок"],"Прыжок выполнен! Вудсток чуть не взлетел!","happy"],[["беги","побежали","бег"],"Вперёд, к новым приключениям!","run"],[["иди","пройдись","прогуляйся"],"Отправляюсь на маленькую прогулку по экрану.","walk"],[["спи","поспи","засыпай"],"Пора немного отдохнуть… Z-z-z.","snooze"],[["проснись","вставай","подъем","подъём"],"Я уже проснулся! Готов к приключениям!","happy"],[["моргни","подмигни"],"Вот так!","blink"],[["помаши","помаши лапой"],"Привет-привет!","happy"],[["покажи радость","радуйся","ты рад"],"Ура! Как здорово!","happy"],[["подумай","подумай хорошенько"],"Хм-м… Собираю мысли в кучку.","think"],[["посмотри","осмотрись"],"Осматриваюсь! Всё в порядке.","look"],[["где вудсток","где твой друг"],"Вудсток рядом со мной. Он никогда не пропускает приключения!","bird-cheer"],[["позови вудстока","позови друга"],"Вудсток! Нас зовут!","bird-cheer"],[["что ты любишь","твои любимые вещи"],"Прогулки, печенье, друзей и интересные задачи.","happy"],[["любишь печенье","хочешь печенье"],"Конечно! Печенье — отличный повод для перерыва.","happy"],[["любишь приключения","хочешь приключений"],"Очень! Главное — чтобы они были безопасными.","run"],[["любишь учиться","нравится учиться"],"Да! Знания помогают создавать удивительные вещи.","think"],[["помоги","мне нужна помощь"],"Конечно. Напиши, что не получается, и разберёмся вместе.","think"],[["помоги с сайтом","сайт не работает"],"Расскажи, что именно не работает, или пришли скриншот.","think"],[["как создать проект","создать проект"],"Нажми «Создать проект», заполни тему и данные, затем запусти генерацию.","look"],[["как сделать презентацию","создать презентацию"],"Открой раздел презентаций, укажи тему и нужные параметры.","look"],[["где тарифы","покажи тарифы"],"Открой меню сайта и выбери раздел «Тарифы».","look"],[["почему ошибка","у меня ошибка"],"Пришли текст ошибки или скриншот — помогу разобраться.","think"],[["не работает кнопка","кнопка не нажимается"],"Проверь обязательные поля. Если кнопка всё равно не работает, пришли скриншот.","think"],[["не скачивается файл","файл не скачивается"],"Попробуй открыть результат ещё раз. Если ошибка повторится, пришли её текст.","think"],[["как скачать проект","скачать проект"],"После генерации открой карточку нужного файла и нажми «Скачать».","look"],[["как связаться с поддержкой","поддержка"],"Ссылка поддержки Telegram находится внизу сайта.","look"],[["что такое проект","объясни проект"],"Проект — это работа с целью, задачами, исследованием или практикой и выводами.","think"],[["что такое цель","цель проекта"],"Цель — это результат, которого ты хочешь достичь в проекте.","think"],[["что такое задачи","задачи проекта"],"Задачи — конкретные шаги, которые помогают достичь цели.","think"],[["что такое гипотеза","гипотеза"],"Гипотеза — предположение, которое можно проверить.","think"],[["как выбрать тему","выбрать тему"],"Выбери то, что тебе интересно и что реально исследовать.","think"],[["как оформить проект","оформление проекта"],"Обычно нужны титульный лист, введение, основная часть, заключение и источники.","think"],[["как подготовиться к защите","защита проекта"],"Потренируй короткий рассказ: цель, задачи, результаты и выводы.","think"],[["сколько слайдов","число слайдов"],"Следуй требованиям учителя. Часто достаточно 8–12 содержательных слайдов.","think"],[["как не волноваться","я волнуюсь"],"Это нормально. Подготовь план и потренируйся заранее — шаг за шагом.","happy"],[["молодец","я молодец"],"Спасибо! Ты тоже отлично справляешься!","happy"],[["спасибо","благодарю"],"Всегда пожалуйста! Обращайся.","happy"],[["извини","прости"],"Ничего страшного, всё хорошо.","happy"],[["ты лучший","ты классный"],"Спасибо! Работаем командой!","dance"],[["я устал","устал"],"Сделай небольшой перерыв, попей воды и отдохни.","snooze"],[["мне скучно","скучно"],"Можем придумать идею для проекта или сыграть в словесную игру.","dance"],[["мне грустно","грустно"],"Жаль, что день не задался. Можешь рассказать, что случилось, или поговорить с близким человеком.","look"],[["я рад","я счастлив"],"Здорово! Разделяю твою радость!","happy"],[["пожелай удачи","удачи мне"],"Удачи! Пусть всё получится!","happy"],[["скажи комплимент","похвали меня"],"У тебя есть идея и желание её воплотить — это уже сильное начало!","happy"],[["расскажи историю","история"],"Однажды мы с Вудстоком искали самую интересную идею и нашли целую мастерскую проектов!","think"],[["придумай идею","идея для проекта"],"Идея: исследуй, как одна полезная привычка помогает учиться и отдыхать.","think"],[["загадай загадку","загадка"],"Без рук, без ног, а рисовать умеет. Что это? Мороз!","think"],[["ответ загадки","отгадка"],"Ответ: мороз. Он рисует узоры на окнах.","happy"],[["давай играть","поиграем"],"Давай! Назови любое слово, а я отвечу ассоциацией.","happy"],[["камень ножницы бумага","сыграем в камень"],"Раз, два, три! Я выбираю бумагу!","happy"],[["выбери число","назови число"],"Пусть сегодня будет число 7 — счастливое и бодрое!","happy"],[["скажи факт","интересный факт"],"У собак очень развито обоняние: запахи помогают им узнавать мир.","think"],[["какая погода","погода"],"Я не получаю данные о погоде, но могу помочь собрать вещи для прогулки.","think"],[["который час","сколько времени"],"Точное время смотри в строке состояния телефона.","look"],[["ты умеешь считать","посчитай"],"Да! Напиши пример, и я попробую помочь.","think"],[["помоги с математикой","математика"],"Пришли пример или фото задания — разберём по шагам.","think"],[["помоги с английским","английский"],"Напиши слово или предложение — помогу перевести и объяснить.","think"],[["помоги с русским","русский язык"],"Пришли упражнение — разберём правило и пример.","think"],[["помоги с физикой","физика"],"Напиши условие задачи. Помогу выделить дано и подобрать формулу.","think"],[["помоги с химией","химия"],"Пришли реакцию или задание — разберём её аккуратно.","think"],[["напомни про перерыв","перерыв"],"Небольшой перерыв помогает восстановить внимание. Потянись и отдохни.","snooze"],[["что нового","новости"],"Я готов помочь придумать что-нибудь новое для проекта!","happy"],[["не уходи","останься"],"Я остаюсь на экране, пока ты пользуешься сайтом.","happy"],[["включи лампочку","лампочка"],"Трижды нажми на маскота — включится лампочка!","happy"],[["как тебя включить","открыть тебя"],"Нажми на меня один раз, чтобы открыть чат.","look"],[["как открыть чат","открыть чат"],"Нажми на маскота один раз — появится окно чата.","look"],[["как тебя передвинуть","переместить маскота"],"Зажми меня пальцем и перетащи в удобное место.","walk"],[["ты двигаешься","почему ты двигаешься"],"Да! У меня есть несколько движений и реакций.","dance"],[["почему ты исчезаешь","ты исчез"],"Теперь маскот закреплён поверх страницы и не должен скрываться при прокрутке.","happy"],[["расскажи о вудстоке","что любит вудсток"],"Вудсток — мой маленький жёлтый друг. Он любит летать рядом и поддерживать меня.","bird-cheer"],[["что ты умеешь","твои возможности"],"Я отвечаю на частые вопросы, реагирую на команды и помогаю разобраться с сайтом.","think"],[["как изменить размер","сделать тебя больше"],"Размер маскота можно настроить в стилях сайта.","look"],[["как включить анимацию","анимации не работают"],"Открой настройки движения в чате и проверь, что анимации включены.","happy"],[["почему ты маленький","увеличься"],"На телефоне я компактный, чтобы не закрывать содержимое. Можно увеличить меня в стилях.","happy"]];
  function normalizeMascotText(value) {
    return String(value || "").toLocaleLowerCase("ru").replace(/ё/g,"е")
      .replace(/[^а-яa-z0-9 ]/gi," ").replace(/\s+/g," ").trim();
  }
  function findMascotScenario(value) {
    const q=normalizeMascotText(value);
    if(!q) return null;
    const matches=[];
    for(const item of snoopyScenarios) for(const phrase of item[0]) {
      const p=normalizeMascotText(phrase);
      if(q===p || q.includes(" "+p+" ") || q.startsWith(p+" ") ||
         q.endsWith(" "+p) || (q.length>8 && p.startsWith(q))) matches.push({item,score:p.length});
    }
    matches.sort((x,y)=>y.score-x.score);
    return matches[0]?.item || null;
  }
  function playMascotScenario(action) {
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
  chat.querySelector(".head button[aria-label=\"Закрыть\"]").addEventListener("click", () => chat.classList.remove("open"));
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
    if (motionEnabled) animate("happy");
    if (motionEnabled) mascot.classList.add("bird-flap");
    setTimeout(() => mascot.classList.remove("bird-flap"), 1000);
    cancelAnimationFrame(frame);
    let sx = Math.max(-26, Math.min(26, vx * 1.5));
    let sy = Math.max(-26, Math.min(26, vy * 1.5));
    if (Math.abs(sx) + Math.abs(sy) < 5) sx = x < innerWidth / 2 ? 9 : -9;
    const reduced = !motionEnabled || matchMedia("(prefers-reduced-motion: reduce)").matches;
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

    const localScenario=findMascotScenario(question);
    if(localScenario) {
      addMessage(question,"user");
      input.value="";
      addMessage(localScenario[1],"bot");
      playMascotScenario(localScenario[2]);
      say(localScenario[1]);
      return;
    }
    form.dataset.sending = "yes";
    const sendButton = form.querySelector("button[type='submit']");
    sendButton.disabled = true;
    input.disabled = true;
    addMessage(question, "user");
    input.value = "";
    if (motionEnabled) animate("think", 30000);
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

  document.addEventListener("click", e => {
    if (e.target.closest("#createButton,.create-btn")) {
      if (motionEnabled) animate("think", 1500); say("Создаём проект! ✨");
    } else if (e.target.closest(".download,[onclick*='downloadFile'],[onclick*='downloadAll']")) {
      if (motionEnabled) animate("happy"); say("Файл готов к скачиванию! 📦");
    } else if (e.target.closest(".nav button,.mobile-menu")) {
      say("Пойдём посмотрим!"); if (motionEnabled) animate("happy");
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