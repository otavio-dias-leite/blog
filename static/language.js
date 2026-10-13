(() => {
  "use strict";

  const STORAGE_KEY = "blog-language";
  const COOKIE_NAME = "googtrans";
  const LANGUAGES = ["en", "pt-BR"];
  const COOKIE_PATHS = ["/", "/blog"];

  function getSavedLanguage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return LANGUAGES.includes(saved) ? saved : "en";
    } catch {
      return "en";
    }
  }

  let activeLanguage = getSavedLanguage();

  function setCookie(name, value, path, expires) {
    document.cookie =
      name + "=" + value +
      (expires ? "; expires=" + expires.toUTCString() : "") +
      "; path=" + path + "; SameSite=Lax";
  }

  function syncTranslationCookie(language) {
    if (language === "pt-BR") {
      // GTranslate's free widget stores the source and destination as /en/pt.
      const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      COOKIE_PATHS.forEach((path) => setCookie(COOKIE_NAME, "/en/pt", path, expires));
      return;
    }

    // English is the original language. Remove translations from earlier visits.
    const expired = new Date(0);
    COOKIE_PATHS.forEach((path) => setCookie(COOKIE_NAME, "", path, expired));
  }

  function renderButtons() {
    document.querySelectorAll("[data-blog-language]").forEach((button) => {
      const selected = button.dataset.blogLanguage === activeLanguage;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function selectLanguage(language) {
    if (!LANGUAGES.includes(language) || language === activeLanguage) return;

    activeLanguage = language;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Cookie-based selection still works when localStorage is unavailable.
    }

    syncTranslationCookie(language);
    renderButtons();
    window.location.reload();
  }

  // Configure the replacement widget before its deferred script executes.
  window.gtranslateSettings = {
    default_language: "en",
    languages: ["en", "pt"],
    wrapper_selector: "#gtranslate_engine"
  };

  // Restore the saved destination on every page, including article pages.
  syncTranslationCookie(activeLanguage);
  document.documentElement.lang = activeLanguage === "pt-BR" ? "pt-BR" : "en";

  document.addEventListener("DOMContentLoaded", () => {
    renderButtons();
    document.querySelectorAll("[data-blog-language]").forEach((button) => {
      button.addEventListener("click", () => selectLanguage(button.dataset.blogLanguage));
    });
  });
})();
