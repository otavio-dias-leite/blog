(() => {
  "use strict";

  // Posts may declare a source language in front matter (lang: "pt-BR").
  // If omitted, LibreTranslate detects it automatically.
  const STORAGE_KEY = "otavio-blog-language-v4";
  const LANGUAGES = {
    "en-US": "en",
    "pt-BR": "pt"
  };
  const API_URL = "https://translate.argosopentech.com/translate";
  const originalNodes = new Map();
  const memoryCache = new Map();
  let persistentCache = {};

  try {
    persistentCache = JSON.parse(localStorage.getItem("otavio-blog-translation-cache-v1") || "{}");
  } catch {
    persistentCache = {};
  }

  function readLanguage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return Object.hasOwn(LANGUAGES, saved) ? saved : "en-US";
    } catch {
      return "en-US";
    }
  }

  function sourceCode(value) {
    if (!value || value === "auto") return "auto";
    return value.toLowerCase().split("-")[0];
  }

  function remember(node) {
    if (!originalNodes.has(node)) originalNodes.set(node, node.nodeValue);
    return originalNodes.get(node);
  }

  function cacheKey(text, source, target) {
    return source + "|" + target + "|" + text;
  }

  async function translateText(text, source, target) {
    const key = cacheKey(text, source, target);
    if (memoryCache.has(key)) return memoryCache.get(key);
    if (persistentCache[key]) {
      memoryCache.set(key, persistentCache[key]);
      return persistentCache[key];
    }

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        source,
        target,
        format: "text"
      })
    });

    if (!response.ok) throw new Error("Translation service returned " + response.status);
    const data = await response.json();
    if (!data.translatedText) throw new Error("Translation service returned an empty result");

    const translated = data.translatedText;
    memoryCache.set(key, translated);
    persistentCache[key] = translated;

    // Keep the browser cache bounded.
    const keys = Object.keys(persistentCache);
    if (keys.length > 180) {
      for (const oldKey of keys.slice(0, keys.length - 180)) delete persistentCache[oldKey];
    }
    try {
      localStorage.setItem("otavio-blog-translation-cache-v1", JSON.stringify(persistentCache));
    } catch {
      // Translation still works for the current page if storage is unavailable.
    }
    return translated;
  }

  function collectTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest("script,style,code,pre,textarea,button,svg,.comments,[aria-hidden='true']")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  async function translateNodes(nodes, source, target) {
    const queue = nodes.map(node => ({ node, text: remember(node) }));
    let cursor = 0;
    const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        if (!item.text.trim()) continue;
        try {
          item.node.nodeValue = await translateText(item.text, source, target);
        } catch (error) {
          console.warn("Could not translate a blog text segment:", error);
          item.node.nodeValue = item.text;
        }
      }
    });
    await Promise.all(workers);
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
      const header = document.querySelector("header");
      header?.insertAdjacentElement("afterend", status);
    }
    status.textContent = message || "";
    status.hidden = !message;
  }

  async function applyLanguage(language) {
    const selected = Object.hasOwn(LANGUAGES, language) ? language : "en-US";
    const target = LANGUAGES[selected];
    document.documentElement.lang = selected;
    updateButtons(selected);
    showStatus("");

    const cards = [...document.querySelectorAll("[data-post-title]")];
    const article = document.querySelector("main.article");
    const tasks = [];

    for (const title of cards) {
      const container = title.closest("[data-post-slug]") || title;
      const source = sourceCode(container.dataset.postLanguage || "auto");
      const node = title.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) continue;
      const original = remember(node);
      if (source === target) {
        node.nodeValue = original;
      } else {
        tasks.push(translateNodes([node], source, target));
      }
    }

    if (article) {
      const source = sourceCode(article.dataset.postLanguage || "auto");
      const nodes = collectTextNodes(article);
      if (source === target) {
        nodes.forEach(node => { node.nodeValue = remember(node); });
      } else {
        tasks.push(translateNodes(nodes, source, target));
      }
    }

    try {
      await Promise.all(tasks);
      const heading = article?.querySelector("[data-post-title]");
      if (heading) document.title = heading.textContent.trim() + " — Otávio Leite";
    } catch (error) {
      console.error("Blog translation failed:", error);
      showStatus("Automatic translation is temporarily unavailable. Showing the original post.");
    }

    try {
      localStorage.setItem(STORAGE_KEY, selected);
    } catch {
      // The selected language remains active for this visit.
    }
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-blog-language]");
    if (!button) return;
    event.preventDefault();
    applyLanguage(button.dataset.blogLanguage);
  });

  document.addEventListener("DOMContentLoaded", () => {
    applyLanguage(readLanguage());
  });
})();