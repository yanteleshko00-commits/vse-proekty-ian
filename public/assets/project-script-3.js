(() => {
  const requirements = document.querySelector(".checks");
  if (!requirements || requirements.dataset.plusOnlyReady === "true") return;
  requirements.dataset.plusOnlyReady = "true";
  requirements.addEventListener("click", event => {
    const button = event.target.closest("button.check-toggle");
    if (!button || !requirements.contains(button)) return;
    const item = button.closest(".check");
    const panelId = button.getAttribute("aria-controls");
    const panel = panelId ? document.getElementById(panelId) : null;
    if (!item || !panel) return;
    const opening = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(opening));
    button.setAttribute("aria-label", (opening ? "Свернуть: " : "Раскрыть: ") +
      (item.querySelector(".check-title")?.textContent?.trim() || "требование"));
    item.classList.toggle("is-open", opening);
    panel.inert = !opening;
    panel.setAttribute("aria-hidden", String(!opening));
  });
})();
