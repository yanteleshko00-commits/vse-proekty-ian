(() => {
  const currentTool = document.body.dataset.tool || "text";
  const tools = {
    text: { title:"Создать текст", description:"Подготовь статью, письмо, описание, план или другой текст с помощью ИИ.", label:"Что нужно написать?", placeholder:"Например: напиши короткую статью о пользе чтения для школьной газеты. Тон дружелюбный, 4 абзаца.", button:"Создать текст", status:"ИИ готовит текст…", endpoint:"/api/generate-text" },
    image: { title:"Сделать картинку", description:"Опиши изображение, которое хочешь получить. Чем понятнее описание, тем точнее результат.", label:"Опиши изображение", placeholder:"Например: реалистичный горный пейзаж на рассвете, мягкий свет, без текста и логотипов.", button:"Создать изображение", status:"Создаю изображение…", endpoint:"/api/generate-image" },
    ask: { title:"Спросить ИИ", description:"Задай вопрос, попроси объяснить тему или помочь разобраться в сложной задаче.", label:"Твой вопрос", placeholder:"Например: объясни закон Ома простыми словами и приведи пример.", button:"Отправить вопрос", status:"Готовлю ответ…", endpoint:"/api/chat" },
    topic: { title:"Придумать тему", description:"Получи идею школьного проекта, которую можно исследовать и раскрыть на практике.", label:"Интересы или предмет (необязательно)", placeholder:"Например: биология, технологии, экология, история или мои увлечения.", button:"Подобрать тему", status:"Подбираю тему…", endpoint:"/api/suggest-topics" },
    defense: { title:"Подготовиться к защите", description:"Составь план выступления и потренируйся отвечать на вопросы комиссии.", label:"Тема проекта и что уже известно", placeholder:"Например: Влияние сна на память. В проекте я изучил режим сна и способы улучшить подготовку ко сну.", button:"Подготовить защиту", status:"Готовлю речь и вопросы…", endpoint:"/api/chat" },
    project: { title:"Создать проект", description:"Подготовь текст проекта, презентацию и материалы для защиты.", endpoint:"/#generator" }
  };

  try {
    const saved = localStorage.getItem("vseProektyTheme");
    if (saved === "dark") document.documentElement.dataset.theme = "dark";
  } catch {}

  const config = tools[currentTool];
  if (!config) return;
  document.title = config.title + " | Все проекты #Ian";
  document.getElementById("toolTitle").textContent = config.title;
  document.getElementById("toolDescription").textContent = config.description;

  const mount = document.getElementById("toolMount");
  if (currentTool === "project") {
    mount.innerHTML = `
      <div class="tool-panel">
        <p>Собери всё в одном месте: текстовую часть, проектный продукт, презентацию и материалы для защиты.</p>
        <div class="project-steps">
          <div class="project-step"><b>📝 Текст</b><span>Проблема, цель, задачи и содержание</span></div>
          <div class="project-step"><b>📊 Презентация</b><span>Слайды с оформлением и иллюстрациями</span></div>
          <div class="project-step"><b>🎙️ Защита</b><span>Речь и возможные вопросы комиссии</span></div>
        </div>
        <a class="tool-primary" href="/#generator">Перейти к созданию проекта ↗</a>
      </div>`;
    return;
  }

  mount.innerHTML = `
    <form class="tool-panel" id="toolForm">
      <label class="tool-label" for="toolPrompt">${config.label}</label>
      <textarea class="tool-input" id="toolPrompt" maxlength="5000" placeholder="${config.placeholder}"></textarea>
      <p class="tool-hint">${currentTool === "topic" ? "Можно оставить поле пустым, чтобы получить случайную идею." : "Не добавляй пароли, личные данные или другую конфиденциальную информацию."}</p>
      <button class="tool-primary" id="toolRun" type="submit">${config.button} <span aria-hidden="true">→</span></button>
      <div class="tool-status" id="toolStatus" role="status" aria-live="polite"></div>
      <section class="tool-output" id="toolOutput" hidden>
        <h2>Готово</h2>
        <pre class="tool-result-text" id="toolResultText"></pre>
        <img class="tool-result-image" id="toolResultImage" alt="Созданное изображение" hidden>
        <div class="tool-output-actions">
          <button class="tool-secondary" id="toolCopy" type="button">Копировать</button>
          <button class="tool-secondary" id="toolDownload" type="button">Скачать TXT</button>
        </div>
      </section>
    </form>`;

  const form = document.getElementById("toolForm");
  const input = document.getElementById("toolPrompt");
  const button = document.getElementById("toolRun");
  const status = document.getElementById("toolStatus");
  const output = document.getElementById("toolOutput");
  const resultText = document.getElementById("toolResultText");
  const resultImage = document.getElementById("toolResultImage");
  const copyButton = document.getElementById("toolCopy");
  const downloadButton = document.getElementById("toolDownload");
  let lastText = "";
  let lastImageUrl = "";

  function showText(value) {
    lastText = String(value || "");
    resultText.textContent = lastText;
    resultText.hidden = false;
    resultImage.hidden = true;
    output.hidden = false;
    copyButton.hidden = false;
    downloadButton.hidden = false;
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const prompt = input.value.trim();
    if (currentTool !== "topic" && !prompt) {
      status.textContent = "Сначала заполни поле.";
      return;
    }
    button.disabled = true;
    status.textContent = config.status;
    output.hidden = true;
    resultImage.hidden = true;
    try {
      let payload = {};
      if (currentTool === "text") payload = { prompt };
      if (currentTool === "image") payload = { prompt };
      if (currentTool === "ask") payload = { question: prompt };
      if (currentTool === "topic") payload = { interests: prompt };
      if (currentTool === "defense") {
        payload = { question:
          "Помоги подготовиться к защите школьного проекта. Тема: " + prompt +
          "\n\nСоставь: 1) связную речь на 3–4 минуты; 2) краткий план выступления; 3) не менее 7 вероятных вопросов комиссии и понятные ответы. Не утверждай, что эксперимент, опрос или исследование уже проведены, если пользователь этого не сообщил. Не выдумывай факты и результаты. Если информации не хватает, обозначь места, которые нужно дополнить."
        };
      }

      const response = await fetch(config.endpoint, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Не удалось выполнить запрос.");

      if (currentTool === "image") {
        if (!data.image) throw new Error("Сервис не вернул изображение.");
        lastImageUrl = "data:" + (data.mime || "image/png") + ";base64," + data.image;
        resultText.hidden = true;
        resultImage.src = lastImageUrl;
        resultImage.hidden = false;
        output.hidden = false;
        copyButton.hidden = true;
        downloadButton.textContent = "Скачать изображение";
        downloadButton.hidden = false;
      } else {
        const value = currentTool === "topic" ? data.topic : (currentTool === "text" ? data.text : data.answer);
        if (!value) throw new Error("ИИ не вернул результат. Попробуй ещё раз.");
        showText(value);
        downloadButton.textContent = "Скачать TXT";
      }
      status.textContent = "Готово.";
    } catch (error) {
      status.textContent = "Ошибка: " + (error?.message || "не удалось выполнить запрос.");
    } finally {
      button.disabled = false;
    }
  });

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(lastText);
      status.textContent = "Текст скопирован.";
    } catch {
      status.textContent = "Не удалось скопировать. Выдели текст и скопируй вручную.";
    }
  });

  downloadButton.addEventListener("click", () => {
    const isImage = currentTool === "image" && lastImageUrl;
    const blob = isImage
      ? null
      : new Blob([lastText], {type:"text/plain;charset=utf-8"});
    const url = isImage ? lastImageUrl : URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = isImage ? "Изображение.png" : "Созданный_текст.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    if (!isImage) URL.revokeObjectURL(url);
  });
})();