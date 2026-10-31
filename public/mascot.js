(() => {
  if (document.getElementById("ian-mascot")) return;

  const mascot = document.createElement("div");
  mascot.id = "ian-mascot";
  mascot.tabIndex = 0;
  mascot.setAttribute("role", "button");
  mascot.setAttribute("aria-label", "Медвежонок Винни. Перетащи меня или нажми три раза для лампочки");
  mascot.innerHTML = `
    <div class="speech" id="ian-mascot-speech">Привет! Потяни меня за лапку 🐾</div>
    <svg class="dog bear-svg" viewBox="0 0 180 190" role="img" aria-label="Медвежонок с горшочком мёда">
      <defs>
        <linearGradient id="bearFur" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6d58a"/><stop offset="1" stop-color="#c98a3e"/></linearGradient>
        <linearGradient id="bearShirt" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#4b9b75"/><stop offset="1" stop-color="#25664c"/></linearGradient>
      </defs>
      <g class="bear-shadow"><ellipse cx="91" cy="176" rx="54" ry="8" fill="#253b2d" opacity=".13"/></g>
      <g class="dog-body">
        <g class="bear-legs"><path class="leg leg-back-a" d="M55 137 Q42 154 49 166 Q57 174 77 168 L81 151Z" fill="#c98a3e"/><path class="leg leg-back-b" d="M102 145 Q105 164 119 169 Q139 175 145 163 Q147 155 126 143Z" fill="#dba653"/></g>
        <path class="bear-torso" d="M49 83 Q35 107 46 143 Q70 160 119 146 Q137 116 119 83Z" fill="url(#bearFur)" stroke="#a96e32" stroke-width="2"/>
        <path class="shirt" d="M47 101 Q82 85 124 102 L126 143 Q91 160 49 143Z" fill="url(#bearShirt)" stroke="#8e302b" stroke-width="2"/>
        <path d="M68 98 Q88 108 107 98" fill="none" stroke="#8bc9a4" stroke-width="3" stroke-linecap="round"/>
        <path class="shirt-badge" d="M88 119 q-9 -9 -13 -1 q-3 8 13 17 q16 -9 13 -17 q-4 -8 -13 1Z" fill="#e8c46a" stroke="#f9e6a8" stroke-width="1.2"/>
        <g class="bear-arms"><path class="arm arm-left" d="M51 105 Q28 111 29 133 Q30 145 42 143 Q50 140 53 125Z" fill="#e3b66b" stroke="#a96e32" stroke-width="2"/><path class="arm arm-right" d="M119 105 Q140 108 145 127 Q148 141 135 145 Q124 144 119 128Z" fill="#e3b66b" stroke="#a96e32" stroke-width="2"/></g>
        <g class="bear-head">
          <circle cx="49" cy="39" r="17" fill="#d9a052" stroke="#a96e32" stroke-width="2"/><circle cx="127" cy="39" r="17" fill="#d9a052" stroke="#a96e32" stroke-width="2"/>
          <circle cx="49" cy="39" r="8" fill="#f3d39a"/><circle cx="127" cy="39" r="8" fill="#f3d39a"/>
          <path d="M48 58 Q48 16 88 15 Q130 15 132 60 Q132 91 91 99 Q49 92 48 58Z" fill="url(#bearFur)" stroke="#a96e32" stroke-width="2"/>
          <ellipse cx="90" cy="70" rx="25" ry="19" fill="#f7e5c5"/>
          <ellipse cx="90" cy="63" rx="8" ry="6" fill="#493023"/>
          <g class="bear-eyes">
            <g class="eye-wrap"><ellipse class="eye" cx="73" cy="51" rx="4" ry="5.2" fill="#30241d"/><circle class="eye-shine" cx="74.2" cy="49.5" r="1.15" fill="#fff8e9"/></g>
            <g class="eye-wrap"><ellipse class="eye" cx="107" cy="51" rx="4" ry="5.2" fill="#30241d"/><circle class="eye-shine" cx="108.2" cy="49.5" r="1.15" fill="#fff8e9"/></g>
          </g>
          <g class="bear-brows" fill="none" stroke="#8e5a32" stroke-width="2.5" stroke-linecap="round">
            <path class="brow brow-left" d="M65 40 Q73 35 81 39"/>
            <path class="brow brow-right" d="M99 39 Q107 35 115 40"/>
          </g>
          <g class="face-mouth" fill="none" stroke="#70452d" stroke-width="2.5" stroke-linecap="round">
            <path class="mouth mouth-neutral" d="M80 80 Q90 86 100 80"/>
            <path class="mouth mouth-happy" d="M77 77 Q90 96 103 77"/>
            <path class="mouth mouth-sad" d="M79 86 Q90 75 101 86"/>
            <ellipse class="mouth mouth-surprised" cx="90" cy="82" rx="5.5" ry="8"/>
            <path class="mouth mouth-angry" d="M80 84 Q90 78 100 84"/>
            <path class="mouth mouth-sleepy" d="M82 82 Q90 84 98 82"/>
            <path class="mouth mouth-confused" d="M83 82 Q91 77 99 84"/>
            <path class="mouth mouth-worried" d="M80 86 Q90 79 100 86"/>
            <path class="mouth mouth-proud" d="M80 79 Q91 88 101 78"/>
            <path class="mouth mouth-shy" d="M84 83 Q90 86 96 83"/>
            <ellipse class="mouth mouth-laugh" cx="90" cy="83" rx="9" ry="10"/>
            <path class="mouth mouth-smirk" d="M84 82 Q94 87 101 78"/>
          </g>
          <g class="cheeks" fill="#e98f75"><ellipse cx="60" cy="72" rx="7" ry="4"/><ellipse cx="120" cy="72" rx="7" ry="4"/></g>
          <g class="emotion-tears" aria-hidden="true"><path d="M67 59 Q61 68 67 71 Q73 68 67 59 M113 59 Q107 68 113 71 Q119 68 113 59" fill="#72b9df"/></g>
          <g class="emotion-stars" aria-hidden="true"><text x="133" y="35" font-size="17" fill="#e7b94f">✦</text><text x="30" y="54" font-size="13" fill="#e7b94f">✦</text></g>
          <g class="heart-sparkles" aria-hidden="true"><text x="137" y="35" font-size="17" fill="#e65b68">♥</text><text x="31" y="57" font-size="11" fill="#e65b68">♥</text></g>
        </g>
        <g class="honey-pot" transform="translate(124 121) rotate(-8)"><path d="M-13 -8 Q-16 1 -12 18 Q0 25 14 17 L12 -8Z" fill="#d99b28" stroke="#9b641b" stroke-width="2"/><rect x="-15" y="-13" width="30" height="7" rx="3" fill="#f1c75b" stroke="#9b641b" stroke-width="1.5"/><path d="M-7 1 Q0 -4 8 1" fill="none" stroke="#fff0ad" stroke-width="2"/><text x="0" y="12" text-anchor="middle" font-size="8" font-weight="800" fill="#70451d">МЁД</text></g>
        <g class="sparkle"><path d="M24 58v12 M18 64h12 M151 72v10 M146 77h10" stroke="#f5c94b" stroke-width="2.5" stroke-linecap="round"/></g>
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

  function say(text) {
    speech.textContent = text;
    const bounds = mascot.getBoundingClientRect();
    mascot.classList.toggle("speech-left", bounds.left < innerWidth * 0.48);
    mascot.classList.add("speak");
    clearTimeout(mascot._speechTimer);
    mascot._speechTimer = setTimeout(() => mascot.classList.remove("speak"), 2500);
  }

  const emotionNames = ["neutral", "happy", "sad", "surprised", "curious", "angry", "sleepy", "thinking", "love", "excited", "confused", "worried", "proud", "shy", "laugh", "playful"];
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
    if (!motionEnabled || document.hidden || mascot.classList.contains("dragging") || chat.classList.contains("open")) return;
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
    mascot.style.setProperty("left", r.left + "px", "important");
    mascot.style.setProperty("top", r.top + "px", "important");
    mascot.style.setProperty("right", "auto", "important");
    mascot.style.setProperty("bottom", "auto", "important");
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
    mascot.style.setProperty("left", drag.x + "px", "important");
    mascot.style.setProperty("top", drag.y + "px", "important");
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
    // Keep the mascot exactly where it was released. No inertia or screen-wide flight.
    cancelAnimationFrame(frame);
    vx = 0; vy = 0;
    mascot.style.setProperty("left", Math.max(0, Math.min(innerWidth - mascot.offsetWidth, x)) + "px", "important");
    mascot.style.setProperty("top", Math.max(0, Math.min(innerHeight - mascot.offsetHeight, y)) + "px", "important");
    if (motionEnabled) {
      animate("happy", 900);
      mascot.classList.add("collision");
      setTimeout(() => mascot.classList.remove("collision"), 700);
    }
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
    if (!motionEnabled || document.hidden || mascot.classList.contains("dragging")) return;
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
  const status = document.getElementById("status");
  if (status && window.MutationObserver) {
    new MutationObserver(() => {
      const t = status.textContent.toLowerCase();
      if (t.includes("ошиб") || t.includes("не удалось")) say("Кажется, нужна помощь. Спроси меня!");
    }).observe(status, { childList: true, subtree: true, characterData: true });
  }
  setTimeout(() => say("Тяни меня пальцем, чтобы бросить. Три нажатия — лампочка! 💡"), 1800);
})();