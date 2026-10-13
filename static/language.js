(() => {
  "use strict";

  const STORAGE_KEY = "otavio-blog-language-v7";
  const CACHE_KEY = "otavio-blog-translation-cache-v4";
  const LANGUAGES = { "en-US": "en", "pt-BR": "pt", "zh-CN": "zh" };
  const API_URL = "https://translate.argosopentech.com";
  const originalHTML = new WeakMap();
  const cache = new Map();
  let savedCache = {};
  let runId = 0;

  try { savedCache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); }
  catch { savedCache = {}; }

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  function sourceCode(value) {
    if (!value || value === "auto") return "auto";
    const code = String(value).toLowerCase().split("-")[0];
    return code === "zh" ? "zh" : code;
  }

  function getOriginal(element) {
    if (!originalHTML.has(element)) originalHTML.set(element, element.innerHTML);
    return originalHTML.get(element);
  }

  function cacheKey(html, source, target) {
    return source + "|" + target + "|" + html;
  }

  async function api(path, payload) {
    let lastError;
    for (let attempt = 0; attempt < 4; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      try {
        const response = await fetch(API_URL + path, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
          mode: "cors"
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw new Error("Translation API " + response.status + (detail ? ": " + detail.slice(0, 180) : ""));
        }
        return await response.json();
      } catch (error) {
        lastError = error;
        if (attempt < 3) await wait(700 * (attempt + 1));
      } finally { clearTimeout(timeout); }
    }
    throw lastError || new Error("Translation service unavailable");
  }

  async function detectLanguage(text) {
    const sample = String(text || "").replace(/\s+/g, " ").trim().slice(0, 4500);
    if (!sample) return "auto";
    const result = await api("/detect", { q: sample });
    if (!Array.isArray(result) || !result.length) throw new Error("Could not detect source language");
    const detected = [...result].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
    return sourceCode(detected.language || "auto");
  }

  async function translateHTML(html, source, target) {
    const key = cacheKey(html, source, target);
    if (cache.has(key)) return cache.get(key);
    if (savedCache[key]) {
      cache.set(key, savedCache[key]);
      return savedCache[key];
    }
    const result = await api("/translate", { q: html, source, target, format: "html" });
    if (!result || typeof result.translatedText !== "string" || !result.translatedText.trim()) {
      throw new Error("The translation service returned an empty result");
    }
    const translated = result.translatedText;
    cache.set(key, translated);
    savedCache[key] = translated;
    const keys = Object.keys(savedCache);
    if (keys.length > 250) {
      for (const oldKey of keys.slice(0, keys.length - 250)) delete savedCache[oldKey];
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(savedCache)); } catch {}
    return translated;
  }

  function setButtons(language) {
    document.querySelectorAll("[data-blog-language]").forEach(button => {
      const active = button.dataset.blogLanguage === language;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function getArticleBlocks(article) {
    const content = article.querySelector("[data-post-content]") || article.querySelector(".content");
    const title = article.querySelector("[data-post-title]");
    const blocks = [];
    if (title) blocks.push(title);
    if (content) {
      const selectors = "p,h2,h3,h4,h5,h6,li,th,td,figcaption,dt,dd";
      content.querySelectorAll(selectors).forEach(element => {
        if (!element.querySelector(selectors)) blocks.push(element);
      });
      if (!blocks.length && content.textContent.trim()) blocks.push(content);
    }
    return blocks;
  }

  async function translateElements(elements, source, target, currentRun) {
    const originals = elements.map(element => ({ element, html: getOriginal(element) }));
    let cursor = 0;
    const workers = Array.from({ length: Math.min(3, originals.length) }, async () => {
      while (cursor < originals.length && currentRun === runId) {
        const item = originals[cursor++];
        try {
          const translated = await translateHTML(item.html, source, target);
          if (currentRun === runId) item.element.innerHTML = translated;
        } catch (error) {
          if (currentRun === runId) item.element.innerHTML = item.html;
        }
      }
    });
    await Promise.all(workers);
    return failed;
  }

  async function applyLanguage(requestedLanguage) {
    const language = Object.hasOwn(LANGUAGES, requestedLanguage) ? requestedLanguage : "en-US";
    const target = LANGUAGES[language];
    const currentRun = ++runId;
    document.documentElement.lang = language;
    setButtons(language);

    let failed = false;
    const article = document.querySelector("main.article");
    if (article) {
      const blocks = getArticleBlocks(article);
      blocks.forEach(element => { element.innerHTML = getOriginal(element); });
      const declared = sourceCode(article.dataset.postLanguage || "auto");
      try {
        const sample = blocks.map(element => element.textContent).join(" ").slice(0, 4500);
        const source = declared === "auto" ? await detectLanguage(sample) : declared;
        if (currentRun !== runId) return;
        if (source !== target) await translateElements(blocks, source, target, currentRun);
      } catch (error) {
        failed = true;
      }
      if (currentRun !== runId) return;
      const heading = article.querySelector("[data-post-title]");
      if (heading) document.title = heading.textContent.trim() + " — Otávio Leite";
    } else {
      const titles = [...document.querySelectorAll("[data-post-title]")];
      titles.forEach(element => { element.innerHTML = getOriginal(element); });
      const declaredLanguages = [...new Set(titles.map(element => sourceCode(
        element.closest("[data-post-slug]")?.dataset.postLanguage || "auto"
      )))];
      for (const sourceDeclared of declaredLanguages) {
        const group = titles.filter(element => sourceCode(
          element.closest("[data-post-slug]")?.dataset.postLanguage || "auto"
        ) === sourceDeclared);
        if (!group.length || currentRun !== runId) continue;
        try {
          const sample = group.map(element => element.textContent).join(" ").slice(0, 4500);
          const source = sourceDeclared === "auto" ? await detectLanguage(sample) : sourceDeclared;
          if (currentRun !== runId) return;
          if (source !== target) failed = (await translateElements(group, source, target, currentRun)) || failed;
        } catch (error) {
          failed = true;
        }
      }
    }

    if (currentRun !== runId) return;
    try { localStorage.setItem(STORAGE_KEY, language); } catch {}
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-blog-language]");
    if (!button) return;
    event.preventDefault();
    applyLanguage(button.dataset.blogLanguage);
  });

  document.addEventListener("DOMContentLoaded", () => {
    let language = "en-US";
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (Object.hasOwn(LANGUAGES, saved)) language = saved;
    } catch {}
    applyLanguage(language);
  });
})();