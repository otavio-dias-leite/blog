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
      name + "=" + encodeURIComponent(value) + expires +
      "; path=" + path + "; SameSite=Lax";
  }

  function syncTranslationCookie(language) {
    if (language === "en") {
      // "auto" lets Google detect the source language and translate it to English.
      writeCookie(COOKIE_NAME, "/auto/en", "/", 365);
      writeCookie(COOKIE_NAME, "/auto/en", "/blog", 365);
      return;
    }

    // Portuguese is the source language of the blog, so remove the translation.
    writeCookie(COOKIE_NAME, "", "/", -1);
    writeCookie(COOKIE_NAME, "", "/blog", -1);
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
