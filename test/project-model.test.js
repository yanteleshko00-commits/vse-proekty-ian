import test from "node:test";
import assert from "node:assert/strict";
import { applyProjectModel, buildDesignProfile, classifyTopic, createProjectModel, validateProjectModel } from "../lib/project-model.js";

test("classifies school subjects before broad science categories", () => {
  assert.equal(classifyTopic("Физика: закон всемирного тяготения"), "physics");
  assert.equal(classifyTopic("Химические реакции ионного обмена"), "chemistry");
  assert.equal(classifyTopic("Биология: строение клетки"), "biology");
  assert.equal(classifyTopic("История России в 1812 году"), "history");
});

test("creates a stable model shared by report and slide exporters", () => {
  const model = createProjectModel({
    topic: "История освоения космоса",
    student: { firstName: "Иван", className: "9" },
    content: { goal: "Изучить этапы", sources: [{ title: "NASA", url: "https://www.nasa.gov/" }] },
    slides: [{ title: "Начало", type: "cover" }, { title: "Первый спутник", bullets: ["Запуск в 1957 году"] }]
  });
  assert.equal(model.schemaVersion, 1);
  assert.equal(model.design.category, "history");
  assert.equal(model.slides[1].order, 2);
  assert.equal(model.content.goal, "Изучить этапы");
  assert.equal(model.student.firstName, "Иван");
  assert.deepEqual(validateProjectModel(model), []);
});

test("rejects malformed and unsafe external links", () => {
  const model = createProjectModel({
    topic: "Проверка",
    slides: [{ title: "Обложка", imageUrl: "javascript:alert(1)" }],
    sources: [{ title: "Источник", url: "file:///etc/passwd" }]
  });
  const issues = validateProjectModel(model);
  assert.ok(issues.some(issue => issue.includes("протокол")));
});

test("uses safe general design for unknown topics", () => {
  const profile = buildDesignProfile("Неизвестная уникальная тема");
  assert.equal(profile.category, "general");
  assert.equal(profile.palette, "blue");
});

test("applies the same model fields to existing renderer input", () => {
  const plan = applyProjectModel({
    title: "Тестовая тема",
    summary: "Краткое описание",
    student: { firstName: "Анна" },
    projectContent: { conclusion: "Вывод" },
    slides: [{ title: "Обложка", type: "cover" }],
    sources: []
  });
  assert.equal(plan.contentModel.schemaVersion, 1);
  assert.equal(plan.projectContent.conclusion, "Вывод");
  assert.equal(plan.slides[0].order, 1);
});
