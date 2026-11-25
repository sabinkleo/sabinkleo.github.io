(() => {
  "use strict";

  const storageKey = "vertice.observatorio.favoritos.v1";
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  function restore() {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return new Set(Array.isArray(data) ? data.filter(value => typeof value === "string" && slugPattern.test(value)) : []);
    } catch {
      return new Set();
    }
  }
  // Forward only tags generated for this edition and an exact known channel pair.
  const tool = document.querySelector("a[data-campaign]");
  if (tool) {
    const tags = new URLSearchParams(window.location.search);
    const source = tags.get("utm_source");
    const medium = tags.get("utm_medium");
    const channels = JSON.parse(tool.dataset.channels);
    if (tags.get("utm_campaign") === tool.dataset.campaign && Object.hasOwn(channels, source) && channels[source] === medium) {
      const destination = new URL(tool.href);
      destination.searchParams.set("utm_source", source);
      destination.searchParams.set("utm_medium", medium);
      tool.href = destination.href;
    }
  }
  // Build contextual article navigation from the published sections, without
  // sending article contents or visitor input to a remote service.
  const article = document.querySelector("main article");
  const sidebar = article?.querySelector(".file");
  const sections = [...(article?.querySelectorAll(".prose > section") || [])];
  if (sidebar && sections.length) {
    const nav = document.createElement("nav");
    nav.className = "article-navigation";
    nav.setAttribute("aria-label", document.documentElement.lang === "en" ? "In this article" : "Nesta matéria");
    const title = document.createElement("h2");
    title.textContent = document.documentElement.lang === "en" ? "In this article" : "Nesta matéria";
    const list = document.createElement("ol");
    for (const [index, section] of sections.entries()) {
      const heading = section.querySelector("h2");
      if (!heading) continue;
      if (!section.id) {
        let id = "materia-secao-" + (index + 1);
        while (document.getElementById(id)) id += "-x";
        section.id = id;
      }
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = "#" + section.id;
      link.textContent = heading.textContent;
      item.append(link);
      list.append(item);
    }
    nav.append(title, list);
    sidebar.append(nav);
  }

  // Contextual AI sends only the article identifier and a fixed question.
  const slug = location.pathname.match(/^\/(?:observatorio|en\/observatory)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/)?.[1];
  const en = document.documentElement.lang === 'en';
  const tr = (english, portuguese) => en ? english : portuguese;
  if (article && slug && article.querySelector(".storyhead") && article.querySelector(".prose")) {
    const panel = document.createElement("section");
    panel.className = "article-assistant";
    panel.setAttribute("aria-labelledby", "article-assistant-title");
    const title = document.createElement("h2");
    title.id = "article-assistant-title";
    title.textContent = tr("Ask Vértice","Pergunte à Vértice");
    const note = document.createElement("p");
    note.textContent = tr("Explore this article with AI. Answers use its published evidence, not live web research.","Explore esta matéria com IA. As respostas usam as evidências publicadas, sem pesquisa em tempo real.");
    const actions = document.createElement("div");
    actions.className = "article-questions";
    const output = document.createElement("div");
    output.className = "article-answer";
    output.setAttribute("role","status");
    output.setAttribute("aria-live","polite");
    output.hidden = true;
    const modes = [
      ["summary",tr("Summarize in 30 seconds","Resuma em 30 segundos")],
      ["explain",tr("Explain simply","Explique de forma simples")],
      ["risks",tr("What are the limitations?","Quais são as limitações?")],
      ["actions",tr("What should I do next?","O que fazer agora?")]
    ];
    let controller, sequence = 0;
    const endpoint = ["verticelabs.me","www.verticelabs.me"].includes(location.hostname)
      ? "https://vertice-technical-triage-pages.sabino-fabio.workers.dev/api/ai" : "/api/ai";
    async function ask(mode, button) {
      controller?.abort();
      controller = new AbortController();
      const current = ++sequence;
      const requestController = controller;
      const timeout = setTimeout(() => requestController.abort(), 14000);
      for (const b of actions.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === button));
      output.hidden = false;
      output.dataset.source = "loading";
      output.textContent = tr("Reading the published article…","Consultando a matéria publicada…");
      try {
        const response = await fetch(endpoint,{method:"POST",credentials:"omit",redirect:"error",referrerPolicy:"no-referrer",
          headers:{"Content-Type":"application/json"},signal:requestController.signal,
          body:JSON.stringify({action:"article",slug,mode,lang:en?"en":"pt"})});
        if (!response.ok) throw Error("Unavailable");
        const data = await response.json();
        if (data.source !== "gateway" || typeof data.answer !== "string" || !data.answer.trim() || data.answer.length > 2400) throw Error("Invalid answer");
        if (current !== sequence) return;
        output.dataset.source = "gateway";
        output.textContent = data.answer;
      } catch {
        if (current !== sequence) return;
        output.dataset.source = "editorial";
        const prose = article.querySelector(".prose");
        const headings = {summary:0,explain:0,risks:3,actions:2};
        const selected = [...prose.querySelectorAll(":scope > section")][headings[mode]];
        const excerpt = mode === "summary" ? article.querySelector(".storyhead .intro")?.textContent : selected?.innerText;
        output.textContent = tr("AI unavailable. Editorial excerpt:","IA indisponível. Trecho editorial:") + "\n\n" + (excerpt?.trim() || tr("Read the published article below.","Leia a matéria publicada abaixo."));
      } finally { clearTimeout(timeout); }
    }
    for (const [mode,label] of modes) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.setAttribute("aria-pressed","false");
      button.dataset.articleMode = mode;
      button.addEventListener("click",()=>ask(mode,button));
      actions.append(button);
    }
    panel.append(title,note,actions,output);
    article.querySelector(".storyhead").after(panel);
  }

  let favorites = restore();
  const buttons = [...document.querySelectorAll("[data-save]")];
  const form = document.querySelector("#filtros");
  const cards = [...document.querySelectorAll("[data-card]")];
  const normalize = text => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

  function updateFilter() {
    if (!form) return;
    const filters = form.elements;
    const terms = normalize(filters.busca.value).trim().split(/\s+/);
    let count = 0;
    for (const card of cards) {
      const text = normalize(card.dataset.search);
      const matches = terms.every(term => text.includes(term)) &&
        (!filters.categoria.value || filters.categoria.value === card.dataset.category) &&
        (!filters.setor.value || filters.setor.value === card.dataset.sector) &&
        (!filters.salvas.checked || favorites.has(card.dataset.card));
      card.hidden = !matches;
      if (matches) count++;
    }
    document.querySelector("#contagem").textContent = count === 1 ? "1 matéria" : count + " matérias";
    document.querySelector("#sem-resultados").hidden = count > 0 || cards.length === 0;
  }

  function refresh() {
    for (const button of buttons) {
      const saved = favorites.has(button.dataset.save);
      button.setAttribute("aria-pressed", String(saved));
      button.querySelector("[aria-hidden]").textContent = saved ? "★" : "☆";
      button.querySelector("[data-label]").textContent = saved ? "Salvo" : "Salvar";
      button.hidden = false;
    }
    updateFilter();
  }

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const slug = button.dataset.save;
      if (favorites.has(slug)) favorites.delete(slug);
      else favorites.add(slug);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...favorites]));
      } catch {
        // Storage can be unavailable in private or restricted sessions.
      }
      refresh();
    });
  }
  window.addEventListener("storage", event => {
    if (event.key === storageKey || event.key === null) {
      favorites = restore();
      refresh();
    }
  });
  if (form && cards.length) {
    form.hidden = false;
    form.addEventListener("input", updateFilter);
    form.addEventListener("change", updateFilter);
    form.addEventListener("submit", event => event.preventDefault());
    document.querySelector("#limpar").addEventListener("click", () => {
      form.reset();
      updateFilter();
      form.elements.busca.focus();
    });
  }
  refresh();
})();
