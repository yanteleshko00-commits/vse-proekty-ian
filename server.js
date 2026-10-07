import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import archiver from "archiver";
import PDFDocument from "pdfkit";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType
} from "docx";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  : null;

app.use(express.json({ limit: "10mb" }));

const publicDir = path.join(__dirname, "public");
const assetsDir = path.join(__dirname, "assets");

app.use(express.static(publicDir));

/* -------------------------------------------------------
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
------------------------------------------------------- */

function cleanText(value) {
  if (!value) return "";
  return String(value).replace(/\r/g, "").trim();
}

function safeFileName(name) {
  return String(name || "project")
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 100);
}

function normalizeSlides(slides, requestedCount) {
  const count = Math.max(5, Math.min(30, Number(requestedCount) || 12));

  const result = Array.isArray(slides) ? slides : [];

  while (result.length < count) {
    result.push({
      title: `Слайд ${result.length + 1}`,
      text: ""
    });
  }

  return result.slice(0, count).map((slide, index) => ({
    title: cleanText(slide?.title) || `Слайд ${index + 1}`,
    text: cleanText(slide?.text),
    bullets: Array.isArray(slide?.bullets)
      ? slide.bullets.map(cleanText).filter(Boolean)
      : [],
    table: Array.isArray(slide?.table) ? slide.table : [],
    formula: cleanText(slide?.formula),
    quote: cleanText(slide?.quote)
  }));
}

function textToParagraphs(text) {
  const lines = cleanText(text)
    .split("\n")
    .map(x => x.trim())
    .filter(Boolean);

  return lines.length ? lines : ["Материал не указан."];
}

/* -------------------------------------------------------
   DOCX
------------------------------------------------------- */

async function createDocx(project) {
  const children = [];

  children.push(
    new Paragraph({
      text: project.writtenProject?.title || "Индивидуальный проект",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Автор: ${project.meta?.firstName || ""} ${project.meta?.lastName || ""}`,
          bold: true
        })
      ],
      alignment: AlignmentType.CENTER
    })
  );

  if (project.meta?.className) {
    children.push(
      new Paragraph({
        text: `Класс: ${project.meta.className}`,
        alignment: AlignmentType.CENTER
      })
    );
  }

  if (project.meta?.school) {
    children.push(
      new Paragraph({
        text: `Школа: ${project.meta.school}`,
        alignment: AlignmentType.CENTER
      })
    );
  }

  children.push(new Paragraph(""));

  const sections = [
    ["Введение", project.writtenProject?.introduction],
    ["Актуальность", project.writtenProject?.relevance],
    ["Цель проекта", project.writtenProject?.goal],
    ["Задачи проекта", project.writtenProject?.tasks],
    ["Теоретическая часть", project.writtenProject?.theory],
    ["Практическая часть", project.writtenProject?.practice],
    ["Результаты", project.writtenProject?.results],
    ["Заключение", project.writtenProject?.conclusion],
    ["Продукт проекта", project.product?.description]
  ];

  for (const [title, text] of sections) {
    children.push(
      new Paragraph({
        text: title,
        heading: HeadingLevel.HEADING_1
      })
    );

    for (const paragraph of textToParagraphs(text)) {
      children.push(
        new Paragraph({
          text: paragraph
        })
      );
    }
  }

  children.push(
    new Paragraph({
      text: "Источники",
      heading: HeadingLevel.HEADING_1
    })
  );

  const sources = Array.isArray(project.sources)
    ? project.sources
    : [];

  if (sources.length) {
    sources.forEach((source, index) => {
      children.push(
        new Paragraph({
          text: `${index + 1}. ${cleanText(source)}`
        })
      );
    });
  } else {
    children.push(
      new Paragraph({
        text: "Источники необходимо проверить перед сдачей проекта."
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children
      }
    ]
  });

  return Packer.toBuffer(doc);
}

/* -------------------------------------------------------
   PDF
------------------------------------------------------- */

function getFontPath() {
  const candidates = [
    path.join(assetsDir, "DejaVuSans.ttf"),
    path.join(__dirname, "DejaVuSans.ttf")
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return file;
    }
  }

  return null;
}

function createPdfBuffer(draw) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      autoFirstPage: true
    });

    const font = getFontPath();

    if (font) {
      doc.registerFont("MainFont", font);
      doc.font("MainFont");
    }

    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      draw(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/* -------------------------------------------------------
   ПРЕЗЕНТАЦИЯ
------------------------------------------------------- */

async function createPresentationPdf(project) {
  const slides = normalizeSlides(
    project.presentation?.slides,
    project.meta?.slides
  );

  return createPdfBuffer(doc => {
    slides.forEach((slide, index) => {
      if (index > 0) {
        doc.addPage({
          size: [960, 540],
          margin: 50
        });
      } else {
        doc.addPage({
          size: [960, 540],
          margin: 50
        });
      }

      doc
        .fontSize(28)
        .fillColor("#1b7f52")
        .text(slide.title, 55, 45, {
          width: 850
        });

      doc
        .moveTo(55, 95)
        .lineTo(905, 95)
        .strokeColor("#1b7f52")
        .stroke();

      let y = 125;

      if (slide.text) {
        doc
          .fontSize(17)
          .fillColor("#222")
          .text(slide.text, 65, y, {
            width: 820,
            lineGap: 7
          });

        y += 100;
      }

      if (slide.bullets.length) {
        slide.bullets.forEach(item => {
          doc
            .fontSize(17)
            .fillColor("#222")
            .text(`• ${item}`, 75, y, {
              width: 800,
              lineGap: 5
            });

          y += 35;
        });
      }

      if (slide.formula) {
        doc
          .fontSize(22)
          .fillColor("#1b7f52")
          .text(slide.formula, 70, Math.min(y + 15, 390), {
            width: 800,
            align: "center"
          });
      }

      if (slide.quote) {
        doc
          .fontSize(15)
          .fillColor("#555")
          .text(`«${slide.quote}»`, 80, Math.min(y + 20, 410), {
            width: 780,
            align: "center"
          });
      }

      doc
        .fontSize(10)
        .fillColor("#777")
        .text(`${index + 1} / ${slides.length}`, 850, 505);
    });
  });
}

/* -------------------------------------------------------
   ТЕКСТ ЗАЩИТЫ
------------------------------------------------------- */

async function createDefensePdf(project) {
  return createPdfBuffer(doc => {
    doc
      .fontSize(26)
      .fillColor("#1b7f52")
      .text("Текст защиты проекта", {
        align: "center"
      });

    doc.moveDown();

    doc
      .fontSize(15)
      .fillColor("#222")
      .text(
        `${project.meta?.firstName || ""} ${project.meta?.lastName || ""}`,
        {
          align: "center"
        }
      );

    doc.moveDown(2);

    const defense = cleanText(project.defense?.text);

    if (defense) {
      defense.split("\n").forEach(line => {
        if (line.trim()) {
          doc
            .fontSize(13)
            .fillColor("#222")
            .text(line.trim(), {
              lineGap: 6
            });

          doc.moveDown(0.4);
        }
      });
    } else {
      const fallback = [
        project.writtenProject?.introduction,
        project.writtenProject?.goal,
        project.writtenProject?.tasks,
        project.writtenProject?.practice,
        project.writtenProject?.results,
        project.writtenProject?.conclusion
      ]
        .filter(Boolean)
        .join("\n\n");

      doc
        .fontSize(13)
        .fillColor("#222")
        .text(fallback || "Текст защиты будет подготовлен отдельно.", {
          lineGap: 6
        });
    }
  });
}

/* -------------------------------------------------------
   БУКЛЕТ
------------------------------------------------------- */

async function createBookletPdf(project) {
  return createPdfBuffer(doc => {
    doc
      .fontSize(28)
      .fillColor("#1b7f52")
      .text(
        project.product?.title ||
          project.writtenProject?.title ||
          "Буклет проекта",
        {
          align: "center"
        }
      );

    doc.moveDown();

    doc
      .fontSize(15)
      .fillColor("#222")
      .text(
        project.product?.description ||
          "Информационный материал по теме проекта.",
        {
          align: "center",
          lineGap: 6
        }
      );

    doc.moveDown(2);

    const blocks = [
      ["Цель", project.writtenProject?.goal],
      ["Основная информация", project.writtenProject?.theory],
      ["Практическая часть", project.writtenProject?.practice],
      ["Результат", project.writtenProject?.results],
      ["Вывод", project.writtenProject?.conclusion]
    ];

    for (const [title, text] of blocks) {
      if (!text) continue;

      doc
        .fontSize(17)
        .fillColor("#1b7f52")
        .text(title);

      doc.moveDown(0.3);

      doc
        .fontSize(11)
        .fillColor("#222")
        .text(cleanText(text), {
          lineGap: 4
        });

      doc.moveDown();
    }
  });
}

/* -------------------------------------------------------
   ZIP
------------------------------------------------------- */

async function createZip(files) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    const archive = archiver("zip", {
      zlib: {
        level: 9
      }
    });

    archive.on("data", chunk => chunks.push(chunk));

    archive.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    archive.on("error", reject);

    for (const file of files) {
      archive.append(file.buffer, {
        name: file.name
      });
    }

    archive.finalize();
  });
}

/* -------------------------------------------------------
   ПРОМПТ ИИ
------------------------------------------------------- */

function buildPrompt(data) {
  return `
Ты — ИИ-помощник для создания школьных индивидуальных проектов.

Создай полноценный проект на русском языке.

Данные ученика:
Имя: ${data.firstName || "Не указано"}
Фамилия: ${data.lastName || "Не указана"}
Класс: ${data.className || "Не указан"}
Школа: ${data.school || "Не указана"}

Тема проекта:
${data.topic}

Количество слайдов:
${data.slides}

Дополнительные требования:
${data.extraRequirements || "Нет"}

ВАЖНЫЕ ПРАВИЛА:

1. Уровень текста — понятный школьнику 9 класса.
2. Не выдумывай реальные измерения, исследования, опросы или результаты.
3. Если для практической части нужны данные, используй только явно обозначенные примеры или предложи место для собственных данных.
4. Не утверждай, что проект на 100% соответствует ФГОС.
5. Учитывай, что требования конкретной школы могут отличаться.
6. Сделай логичную структуру проекта.
7. Презентация должна соответствовать письменной работе.
8. Текст защиты должен соответствовать презентации.
9. Продукт проекта должен быть конкретным и пригодным для использования.
10. Источники не должны содержать придуманные URL.
11. Не используй слишком сложный научный язык.
12. Не пиши пояснения вне требуемого JSON.

Верни ТОЛЬКО JSON следующего вида:

{
  "writtenProject": {
    "title": "",
    "introduction": "",
    "relevance": "",
    "goal": "",
    "tasks": "",
    "theory": "",
    "practice": "",
    "results": "",
    "conclusion": ""
  },
  "product": {
    "title": "",
    "description": ""
  },
  "presentation": {
    "slides": [
      {
        "title": "",
        "text": "",
        "bullets": [],
        "formula": "",
        "quote": ""
      }
    ]
  },
  "defense": {
    "text": ""
  },
  "sources": []
}
`;
}

/* -------------------------------------------------------
   API: СОЗДАНИЕ ПРОЕКТА
------------------------------------------------------- */

app.post("/api/generate-project", async (req, res) => {
  try {
    const data = {
      firstName: cleanText(req.body.firstName),
      lastName: cleanText(req.body.lastName),
      className: cleanText(req.body.className),
      school: cleanText(req.body.school),
      topic: cleanText(req.body.topic),
      slides: Number(req.body.slides) || 12,
      extraRequirements: cleanText(req.body.extraRequirements)
    };

    if (!data.topic) {
      return res.status(400).json({
        error: "Укажи тему проекта."
      });
    }

    if (!openai) {
      return res.status(500).json({
        error:
          "OpenAI API не подключён. Добавь OPENAI_API_KEY в переменные окружения сервера."
      });
    }

    const response = await openai.responses.create({
      model: MODEL,
      input: buildPrompt(data)
    });

    let raw = response.output_text || "";

    raw = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let project;

    try {
      project = JSON.parse(raw);
    } catch {
      return res.status(500).json({
        error: "ИИ вернул некорректный JSON.",
        details: raw.slice(0, 1000)
      });
    }

    project.meta = data;

    project.presentation = project.presentation || {};
    project.presentation.slides = normalizeSlides(
      project.presentation.slides,
      data.slides
    );

    /* Создание настоящих файлов */

    const docxBuffer = await createDocx(project);
    const presentationBuffer =
      await createPresentationPdf(project);
    const defenseBuffer =
      await createDefensePdf(project);
    const bookletBuffer =
      await createBookletPdf(project);

    const baseName = safeFileName(
      data.topic || "Индивидуальный проект"
    );

    const files = [
      {
        name: "Индивидуальный_проект.docx",
        buffer: docxBuffer,
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      },
      {
        name: "Презентация_проекта.pdf",
        buffer: presentationBuffer,
        mime: "application/pdf"
      },
      {
        name: "Текст_защиты.pdf",
        buffer: defenseBuffer,
        mime: "application/pdf"
      },
      {
        name: "Буклет.pdf",
        buffer: bookletBuffer,
        mime: "application/pdf"
      }
    ];

    const zipBuffer = await createZip(files);

    files.push({
      name: `${baseName}_Весь_проект.zip`,
      buffer: zipBuffer,
      mime: "application/zip"
    });

    const filesForBrowser = files.map(file => ({
      name: file.name,
      mime: file.mime,
      data: file.buffer.toString("base64")
    }));

    res.json({
      ok: true,
      model: MODEL,

      project,

      files: filesForBrowser
    });
  } catch (error) {
    console.error("GENERATION ERROR:", error);

    res.status(500).json({
      error:
        error?.message ||
        "Не удалось создать проект. Попробуй ещё раз."
    });
  }
});

/* -------------------------------------------------------
   HEALTH CHECK
------------------------------------------------------- */

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    model: MODEL
  });
});

/* -------------------------------------------------------
   FALLBACK ДЛЯ САЙТА
------------------------------------------------------- */

app.use((_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

/* -------------------------------------------------------
   ЗАПУСК
------------------------------------------------------- */

app.listen(PORT, () => {
  console.log("");
  console.log("======================================");
  console.log("  Все проекты #Ian");
  console.log("======================================");
  console.log(`  Server: http://localhost:${PORT}`);
  console.log(`  Model:  ${MODEL}`);
  console.log(
    `  OpenAI: ${
      process.env.OPENAI_API_KEY
        ? "подключён"
        : "НЕ подключён"
    }`
  );
  console.log("======================================");
  console.log("");
});
