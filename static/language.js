(() => {
  "use strict";

  const STORAGE_KEY = "blog-language";
  const COOKIE_NAME = "googtrans";
  const LANGUAGES = ["en", "pt-BR"];
  let activeLanguage = "en";

  function readCookie(name) {
    const prefix = name + "=";
    const item = document.cookie.split(";").map(value => value.trim()).find(value => value.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : "";
  }

  function writeCookie(value, expires) {
    ["/", "/blog"].forEach(path => {
      document.cookie = COOKIE_NAME + "=" + value +
        (expires ? "; expires=" + expires.toUTCString() : "") +
        "; path=" + path + "; SameSite=Lax";
    });
  }

  function detectActiveLanguage() {
    const cookie = readCookie(COOKIE_NAME);
    if (cookie.split("/").pop() === "pt") return "pt-BR";

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "pt-BR" && !cookie) {
        const expires = new Date(Date.now() + 365 * 864e5);
        writeCookie("/en/pt", expires);
        return "pt-BR";
      }
    } catch {
      // English remains the default if browser storage is unavailable.
    }
    return "en";
  }

  function renderButtons() {
    document.querySelectorAll("[data-blog-language]").forEach(link => {
      const selected = link.dataset.blogLanguage === activeLanguage;
      link.classList.toggle("active", selected);
      link.setAttribute("aria-pressed", String(selected));
    });
  }

  function rememberLanguage(language) {
    if (!LANGUAGES.includes(language)) return;
    activeLanguage = language;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // GTranslate's own cookie continues to preserve the selected language.
    }

    if (language === "pt-BR") {
      writeCookie("/en/pt", new Date(Date.now() + 365 * 864e5));
    } else {
      writeCookie("", new Date(0));
    }
    renderButtons();
  }

  // GTranslate reads this configuration and attaches behavior to data-gt-lang links.
  window.gtranslateSettings = window.gtranslateSettings || {};
  window.gtranslateSettings["otavio-blog"] = {
    default_language: "en",
    languages: ["en", "pt"],
    detect_browser_language: false
  };

  activeLanguage = detectActiveLanguage();
  document.documentElement.lang = activeLanguage === "pt-BR" ? "pt-BR" : "en-US";

  document.addEventListener("click", event => {
    const link = event.target.closest("a[data-blog-language][data-gt-lang]");
    if (!link) return;
    rememberLanguage(link.dataset.blogLanguage);

    // The same anchor carries data-gt-lang, so the GTranslate widget handles
    // the actual translation; this listener only keeps the site's own UI in sync.
  });

  document.addEventListener("DOMContentLoaded", renderButtons);
})();
