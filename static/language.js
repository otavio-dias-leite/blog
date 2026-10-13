(() => {
  "use strict";

  const STORAGE_KEY = "blog-language";
  const COOKIE_NAME = "googtrans";
  const LANGUAGES = ["en", "pt-BR"];

  function getSavedLanguage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return LANGUAGES.includes(saved) ? saved : "en";
    } catch {
      return "en";
    }
  }

  let activeLanguage = getSavedLanguage();

  function writeCookie(name, value, path, days) {
    const expires = days
      ? "; expires=" + new Date(Date.now() + days * 864e5).toUTCString()
      : "";
    document.cookie =
      name + "=" + value + expires +
      "; path=" + path + "; SameSite=Lax";
  }

  function syncTranslationCookie(language) {
    // Let the translation engine detect each page's source language automatically.
    // Google uses "pt" as the language code for Brazilian Portuguese.
    const target = language === "pt-BR" ? "pt" : "en";
    const value = "/auto/" + target;
    writeCookie(COOKIE_NAME, value, "/", 365);
    writeCookie(COOKIE_NAME, value, "/blog", 365);
  }

  function renderLanguageButtons() {
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
      // The cookie still preserves the language for Google Translate.
    }

    syncTranslationCookie(language);
    renderLanguageButtons();
    window.location.reload();
  }

  window.googleTranslateElementInit = function googleTranslateElementInit() {
    if (!window.google || !google.translate || !google.translate.TranslateElement) return;

    new google.translate.TranslateElement(
      {
        includedLanguages: "en,pt",
        autoDisplay: false,
        multilanguagePage: false
      },
      "google_translate_element"
    );
  };

  // Set the default before loading Google's translation engine.
  syncTranslationCookie(activeLanguage);

  document.addEventListener("DOMContentLoaded", () => {
    renderLanguageButtons();

    document.querySelectorAll("[data-blog-language]").forEach((button) => {
      button.addEventListener("click", () => {
        selectLanguage(button.dataset.blogLanguage);
      });
    });
  });
})();
