(function () {
  "use strict";
  var script = document.currentScript;
  if (!script || !script.src) return;
  var base = new URL(".", script.src).pathname;
  var folders = ["pt-br", "es", "zh-cn", "ja"];
  var locales = {"pt-br":"pt-BR","es":"es","zh-cn":"zh-CN","ja":"ja"};
  var last = base.split("/").filter(Boolean).pop();
  if (folders.includes(last)) base = base.slice(0, base.lastIndexOf(last + "/"));
  var current = location.pathname.slice(base.length).replace(/^\/+/, "");
  var first = current.split("/")[0];
  if (locales[first]) {
    document.documentElement.lang = locales[first];
    document.documentElement.dataset.staticLocale = first;
    return;
  }
  var browser = (navigator.languages && navigator.languages[0] || navigator.language || "en").toLowerCase();
  var fallback = browser.startsWith("pt") ? "pt-br" : browser.startsWith("es") ? "es" : browser.startsWith("zh") ? "zh-cn" : browser.startsWith("ja") ? "ja" : "en";
  var key = "otavio-static-locale-v3";
  function save(locale) {
    try { localStorage.setItem(key, JSON.stringify({locale:locale, expires:Date.now()+86400000})); } catch (_) {}
  }
  function route(locale) {
    if (!locales[locale]) { document.documentElement.lang = "en-US"; save("en"); return; }
    save(locale);
    var suffix = current ? current.replace(/^\/+/, "") : "";
    location.replace(base + locale + "/" + suffix + location.search + location.hash);
  }
  function cachedLocale() {
    try {
      var value = JSON.parse(localStorage.getItem(key) || "null");
      if (value && value.expires > Date.now()) return value.locale;
    } catch (_) {}
    return null;
  }
  fetch("https://ipwho.is/", {headers:{Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(3500)})
    .then(function (response) { if (!response.ok) throw new Error("GeoIP unavailable"); return response.json(); })
    .then(function (data) {
      var country = String(data.country_code || "").toUpperCase();
      if (country === "BR" || ["PT","AO","MZ","CV","GW","ST","TL"].includes(country)) { route("pt-br"); return; }
      if (country === "JP") { route("ja"); return; }
      if (["CN","TW","HK","MO"].includes(country)) { route("zh-cn"); return; }
      if (["ES","MX","AR","CO","CL","PE","VE","EC","UY","PY","BO","CR","PA","DO","GT","HN","SV","NI","CU"].includes(country)) { route("es"); return; }
      var saved = cachedLocale();
      if (saved === "en") { document.documentElement.lang = "en-US"; return; }
      if (saved && locales[saved]) { route(saved); return; }
      if (fallback !== "en") route(fallback);
      else { document.documentElement.lang = "en-US"; save("en"); }
    })
    .catch(function () {
      var saved = cachedLocale();
      var locale = saved && (saved === "en" || locales[saved]) ? saved : fallback;
      if (locale === "en") { document.documentElement.lang = "en-US"; save("en"); }
      else route(locale);
    });
})();