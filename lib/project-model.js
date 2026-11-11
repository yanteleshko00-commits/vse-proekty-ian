const SUBJECT_RULES = [
  ["history", /истори|древн|средневек|импери|войн|революц|цивилизац|археолог|историческ/iu],
  ["geography", /географ|материк|континент|океан|картограф|рельеф|населени.*земл/iu],
  ["literature", /литератур|писател|поэт|роман|повест|стихотвор|драматург|персонаж|произведени/iu],
  ["biology", /биолог|растен|животн|клетк|организм|экосистем|генетик|анатом/iu],
  ["physics", /физик|механик|энерги|электрич|магнит|гравитац|оптик|движени тел/iu],
  ["chemistry", /хими|реакци|веществ|атом|молекул|кислот|щелоч|раствор/iu],
  ["it", /\bit\b|айти|программ|нейросет|искусственн.*интеллект|робот|цифров|кибер|компьютер|интернет/iu],
  ["eco", /эколог|природ|климат|переработ|зелён|зелен|океан|лес|окружающ.*сред/iu],
  ["business", /бизнес|эконом|финанс|маркетинг|предприним|менеджмент|торговл|банк/iu],
  ["health", /медицин|здоров|питани|гигиен|болезн|иммунитет/iu],
  ["sport", /спорт|футбол|баскетбол|олимпи|трениров|физическ.*культур|атлет/iu],
  ["art", /искусств|живопис|архитектур|дизайн|музык|театр|кино|скульптур|худож/iu],
  ["education", /образован|школ|обучен|общество|право|государств|социолог/iu],
  ["science", /наук|технолог|математик|космос|астроном/iu]
];

const DESIGN_PROFILES = {
  history: { palette: "history", mood: "архивная редакционная подача, тёплая бумага, крупная типографика", headingFont: "Aptos Display", bodyFont: "Aptos", imageTone: "историческая фотография, музейный предмет или документ" },
  geography: { palette: "geography", mood: "атлас, природные оттенки, просторные композиции", headingFont: "Aptos Display", bodyFont: "Aptos", imageTone: "реальные ландшафты, спутниковые и полевые фотографии" },
  literature: { palette: "literature", mood: "книжная редакционная эстетика, выразительные цитатные блоки", headingFont: "Georgia", bodyFont: "Aptos", imageTone: "атмосферные фото книги, автора, эпохи или места действия" },
  biology: { palette: "eco", mood: "естественные оттенки, научная инфографика, чистые поля", headingFont: "Aptos Display", bodyFont: "Aptos", imageTone: "макро-фотографии организмов и наблюдений природы" },
  physics: { palette: "science", mood: "лабораторная точность, схемы и контрастные акценты", headingFont: "Aptos Display", bodyFont: "Aptos", imageTone: "экспериментальные установки и физические явления" },
  chemistry: { palette: "science", mood: "лабораторная эстетика, структурные блоки и ясные подписи", headingFont: "Aptos Display", bodyFont: "Aptos", imageTone: "лабораторное оборудование и безопасные демонстрации" },
  it: { palette: "it", mood: "технологичная тёмная подача, геометрия и яркие акценты", headingFont: "Aptos Display", bodyFont: "Aptos", imageTone: "реальные устройства, интерфейсы без читаемых личных данных" },
  eco: { palette: "eco", mood: "экологичный минимализм, природные фактуры и светлый фон", headingFont: "Aptos Display", bodyFont: "Aptos", imageTone: "реальные природные места и экологические практики" },
  business: { palette: "business", mood: "деловая редакционная сетка, спокойные цвета и диаграммы", headingFont: "Aptos Display", bodyFont: "Aptos", imageTone: "реальные рабочие процессы, рынки и предметные сцены" },
  health: { palette: "health", mood: "чистая медицинская инфографика без тревожных образов", headingFont: "Aptos Display", bodyFont: "Aptos", imageTone: "нейтральные образовательные фото здоровья и анатомии" },
  sport: { palette: "sport", mood: "динамичная композиция, крупные цифры и тёплые акценты", headingFont: "Aptos Display", bodyFont: "Aptos", imageTone: "спортивные действия и оборудование" },
  art: { palette: "art", mood: "галерейная подача, свободное пространство и выразительные акценты", headingFont: "Georgia", bodyFont: "Aptos", imageTone: "произведения искусства, мастерские и архитектура" },
  education: { palette: "education", mood: "дружелюбная академическая подача и понятная навигация", headingFont: "Aptos Display", bodyFont: "Aptos", imageTone: "реальные учебные ситуации и образовательные материалы" },
  science: { palette: "science", mood: "современная научная редакционная подача", headingFont: "Aptos Display", bodyFont: "Aptos", imageTone: "научные приборы и реальные наблюдения" },
  general: { palette: "blue", mood: "современный минимализм, чистая сетка и выразительные акценты", headingFont: "Aptos Display", bodyFont: "Aptos", imageTone: "конкретная фотографическая сцена по теме" }
};

const text = (value, max = 4000) => String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
const list = value => Array.isArray(value) ? value : [];

export function classifyTopic(topic, subject = "") {
  const source = `${text(subject, 120)} ${text(topic, 300)}`.toLocaleLowerCase("ru");
  for (const [category, pattern] of SUBJECT_RULES) if (pattern.test(source)) return category;
  return "general";
}

export function buildDesignProfile(topic, subject = "") {
  const category = classifyTopic(topic, subject);
  return { category, ...DESIGN_PROFILES[category] };
}

export function createProjectModel(input = {}) {
  const topic = text(input.topic || input.title, 180);
  const content = input.content && typeof input.content === "object" ? input.content : {};
  const slides = list(input.slides).map((slide, index) => ({
    ...slide,
    order: index + 1,
    title: text(slide?.title, 120),
    type: text(slide?.type || (index === 0 ? "cover" : "cards"), 30),
    notes: text(slide?.notes, 1200),
    bullets: list(slide?.bullets).map(item => text(item, 300)).filter(Boolean).slice(0, 6),
    imageQuery: text(slide?.imageQuery, 240)
  }));
  const student = input.student && typeof input.student === "object" ? {
    firstName: text(input.student.firstName, 60),
    lastName: text(input.student.lastName, 60),
    className: text(input.student.className, 30),
    school: text(input.student.school, 100)
  } : {};
  const design = buildDesignProfile(topic, input.subject || content.subject || "");
  return {
    schemaVersion: 1,
    kind: input.kind === "report" ? "report" : "school-project",
    topic,
    title: text(input.title || topic, 180),
    summary: text(input.summary, 1200),
    subject: text(input.subject || content.subject, 120),
    audience: text(input.audience, 100),
    student,
    content,
    product: input.product && typeof input.product === "object" ? input.product : null,
    defense: text(input.defense, 9000),
    practicalPart: text(input.practicalPart, 5000),
    slides,
    sources: list(input.sources || content.sources).map(source => {
      if (typeof source === "string") return { title: text(source, 240), url: "" };
      return { title: text(source?.title, 240), url: text(source?.url, 600) };
    }).filter(source => source.title),
    design,
    createdAt: input.createdAt || null
  };
}

export function validateProjectModel(model) {
  const issues = [];
  if (!model || typeof model !== "object" || Array.isArray(model)) return ["Модель проекта должна быть объектом."];
  if (!text(model.topic, 180)) issues.push("Не указана тема.");
  if (!Array.isArray(model.slides) || model.slides.length === 0) issues.push("Нет слайдов презентации.");
  if (Array.isArray(model.slides)) {
    model.slides.forEach((slide, index) => {
      if (!text(slide?.title, 120)) issues.push(`Слайд ${index + 1}: отсутствует заголовок.`);
      if (slide?.imageUrl) {
        try {
          const url = new URL(slide.imageUrl);
          if (url.protocol !== "https:" && url.protocol !== "http:") issues.push(`Слайд ${index + 1}: недопустимый протокол изображения.`);
        } catch { issues.push(`Слайд ${index + 1}: некорректная ссылка на изображение.`); }
      }
    });
  }
  for (const source of list(model.sources)) {
    if (!source.title) issues.push("Источник без названия.");
    if (source.url) {
      try {
        const url = new URL(source.url);
        if (url.protocol !== "https:" && url.protocol !== "http:") issues.push("Источник содержит недопустимую ссылку.");
      } catch { issues.push("Источник содержит некорректную ссылку."); }
    }
  }
  return issues;
}

export function applyProjectModel(plan) {
  const model = plan.contentModel || createProjectModel({
    topic: plan.title,
    title: plan.title,
    summary: plan.summary,
    student: plan.student,
    content: plan.projectContent,
    product: plan.product,
    defense: plan.defense,
    practicalPart: plan.practicalPart,
    slides: plan.slides,
    sources: plan.sources
  });
  return {
    ...plan,
    contentModel: model,
    title: model.title,
    summary: model.summary || plan.summary,
    student: model.student,
    projectContent: model.content,
    product: model.product,
    defense: model.defense || plan.defense,
    practicalPart: model.practicalPart || plan.practicalPart,
    slides: model.slides,
    sources: model.sources
  };
}
