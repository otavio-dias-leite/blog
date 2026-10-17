(function () {
  "use strict";
  var script = document.currentScript;
  var base = new URL(".", script.src).pathname;
  var lastBaseSegment = base.split("/").filter(Boolean).pop();
  if (["pt-br", "es", "zh-cn", "ja"].includes(lastBaseSegment)) base = base.slice(0, base.lastIndexOf(lastBaseSegment + "/"));
  var locales = { "pt-br": "pt-BR", "es": "es", "zh-cn": "zh-CN", "ja": "ja" };
  var current = location.pathname.slice(base.length).replace(/^\/+/, "");
  var first = current.split("/")[0];
  if (locales[first]) {
    document.documentElement.lang = locales[first];
    document.documentElement.dataset.staticLocale = first;
    return;
  }
  document.documentElement.lang = document.documentElement.lang || "en-US";
  var storageKey = "otavio-static-locale-v1";
  function route(locale) {
    if (!locales[locale] || location.pathname.indexOf(base + locale + "/") === 0) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ locale: locale, expires: Date.now() + 86400000 })); } catch (_) {}
    var suffix = current ? current.replace(/^\/+/, "") : "";
    location.replace(base + locale + "/" + suffix + location.search + location.hash);
  }
  try {
    var cached = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (cached && cached.expires > Date.now() && locales[cached.locale]) {
      route(cached.locale);
      return;
    }
  } catch (_) {}
  var browser = (navigator.languages && navigator.languages[0] || navigator.language || "en").toLowerCase();
  var fallback = browser.startsWith("pt") ? "pt-br" : browser.startsWith("es") ? "es" : browser.startsWith("zh") ? "zh-cn" : browser.startsWith("ja") ? "ja" : "en";
  fetch("https://ipwho.is/", { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(2500) })
    .then(function (response) { if (!response.ok) throw new Error("GeoIP unavailable"); return response.json(); })
    .then(function (data) {
      var country = String(data.country_code || "").toUpperCase();
      var locale = country === "BR" || country === "PT" || ["AO", "MZ", "CV", "GW", "ST", "TL"].includes(country) ? "pt-br"
        : ["ES", "MX", "AR", "CO", "CL", "PE", "VE", "EC", "UY", "PY", "BO", "CR", "PA", "DO", "GT", "HN", "SV", "NI", "CU"].includes(country) ? "es"
        : ["CN", "SG"].includes(country) ? "zh-cn"
        : country === "JP" ? "ja" : fallback;
      if (locale === "en") {
        try { localStorage.setItem(storageKey, JSON.stringify({ locale: "en", expires: Date.now() + 86400000 })); } catch (_) {}
      } else route(locale);
    })
    .catch(function () {
      if (fallback !== "en") route(fallback);
    });
})();