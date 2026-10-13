(() => {
  "use strict";
  const STORAGE_KEY = "otavio-blog-language-v6";
  const CACHE_KEY = "otavio-blog-translation-cache-v3";
  const LANGUAGES = { "en-US": "en", "pt-BR": "pt", "zh-CN": "zh" };
  const API_URL = "https://translate.argosopentech.com";
  const originals = new WeakMap();
  const memoryCache = new Map();
  let persistentCache = {};
  let activeRun = 0;

  try { persistentCache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); }
  catch { persistentCache = {}; }

  function readLanguage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return Object.hasOwn(LANGUAGES, saved) ? saved : "en-US";
    } catch { return "en-US"; }
  }

  function sourceCode(value) {
    if (!value || value === "auto") return "auto";
    const code = String(value).toLowerCase().split("-")[0];
    return code === "zh" ? "zh" : code;
  }

  function original(node) {
    if (!originals.has(node)) originals.set(node, node.nodeValue);
    return originals.get(node);
  }

  function cacheKey(text, source, target) {
    return source + "|" + target + "|" + text;
  }

  async function request(path, payload) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 18000);
      try {
        const response = await fetch(API_URL + path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Translation service returned " + response.status);
        return await response.json();
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 600 * (attempt + 1)));
      } finally { clearTimeout(timeout); }
    }
    throw lastError || new Error("Translation service unavailable");
  }

  async function detectLanguage(text) {
    const sample = String(text || "").replace(/\s+/g, " ").trim().slice(0, 4500);
    if (!sample) return "auto";
    try {
      const result = await request("/detect", { q: sample });
      if (!Array.isArray(result) || !result.length) return "auto";
      const detected = [...result].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
      return sourceCode(detected.language || "auto");
    } catch (error) {
      console.warn("Language detection unavailable; using translator auto-detection.", error);
      return "auto";
    }
  }

  async function translateText(text, source, target) {
    const key = cacheKey(text, source, target);
    if (memoryCache.has(key)) return memoryCache.get(key);
    if (persistentCache[key]) {
      memoryCache.set(key, persistentCache[key]);
      return persistentCache[key];
    }
    const result = await request("/translate", { q: text, source, target, format: "text" });
    if (!result.translatedText) throw new Error("Empty translation result");
    const translated = result.translatedText;
    memoryCache.set(key, translated);
    persistentCache[key] = translated;
    const keys = Object.keys(persistentCache);
    if (keys.length > 400) {
      for (const oldKey of keys.slice(0, keys.length - 400)) delete persistentCache[oldKey];
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(persistentCache)); } catch {}
    return translated;
  }

  function textNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest("script,style,code,pre,textarea,button,svg,.comments,[aria-hidden='true'],.translation-status")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function updateButtons(language) {
    document.querySelectorAll("[data-blog-language]").forEach(button => {
      const active = button.dataset.blogLanguage === language;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function showStatus(message) {
    let status = document.querySelector(".translation-status");
    if (!status) {
      status = document.createElement("p");
      status.className = "translation-status";
      status.setAttribute("role", "status");
      document.querySelector("header")?.insertAdjacentElement("afterend", status);
    }
    status.textContent = message || "";
    status.hidden = !message;
  }

  async function translateGroup(nodes, source, target, run) {
    const queue = nodes.map(node => ({ node, text: original(node) }));
    let cursor = 0;
    let failed = false;
    const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (cursor < queue.length && run === activeRun) {
        const item = queue[cursor++];
        try {
          const translated = await translateText(item.text, source, target);
          if (run === activeRun) item.node.nodeValue = translated;
        } catch (error) {
          failed = true;
          console.warn("Could not translate a blog text segment:", error);
          if (run === activeRun) item.node.nodeValue = item.text;
        }
      }
    });
    await Promise.all(workers);
    return failed;
  }

  async function applyLanguage(language) {
    const selected = Object.hasOwn(LANGUAGES, language) ? language : "en-US";
    const target = LANGUAGES[selected];
    const run = ++activeRun;
    document.documentElement.lang = selected;
    updateButtons(selected);
    showStatus("Translating…");

    const jobs = [];
    document.querySelectorAll("[data-post-title]").forEach(title => {
      const container = title.closest("[data-post-slug]") || title;
      const node = title.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) return;
      const source = sourceCode(container.dataset.postLanguage || "auto");
      const text = original(node);
      if (source === target) node.nodeValue = text;
      else jobs.push((async () => {
        const detected = source === "auto" ? await detectLanguage(text) : source;
        if (run !== activeRun) return false;
        if (detected === target) { node.nodeValue = text; return false; }
        return translateGroup([node], detected, target, run);
      })());
    });

    const article = document.querySelector("main.article");
    if (article) {
      const nodes = textNodes(article);
      nodes.forEach(node => { node.nodeValue = original(node); });
      const declared = sourceCode(article.dataset.postLanguage || "auto");
      const sample = nodes.map(original).join(" ").slice(0, 4500);
      jobs.push((async () => {
        const source = declared === "auto" ? await detectLanguage(sample) : declared;
        if (run !== activeRun) return false;
        if (source === target) return false;
        return translateGroup(nodes, source, target, run);
      })());
    }

    const failures = await Promise.all(jobs);
    if (run !== activeRun) return;
    const heading = article?.querySelector("[data-post-title]");
    if (heading) document.title = heading.textContent.trim() + " — Otávio Leite";
    showStatus(failures.some(Boolean)
      ? "Some text could not be translated. The original wording remains visible."
      : "");
    try { localStorage.setItem(STORAGE_KEY, selected); } catch {}
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-blog-language]");
    if (!button) return;
    event.preventDefault();
    applyLanguage(button.dataset.blogLanguage);
  });

  document.addEventListener("DOMContentLoaded", () => applyLanguage(readLanguage()));
})();