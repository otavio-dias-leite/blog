(function () {
  "use strict";
  var script = document.currentScript;
  if (!script || !script.src) return;
  var base = new URL(".", script.src).pathname;
  var locales = {"pt-br":"pt-BR", "es":"es", "zh-cn":"zh-CN", "ja":"ja"};
  // Relative script URLs inside generated locale folders must resolve to the site root.
  var baseParts = base.split("/").filter(Boolean);
  if (baseParts.length && Object.prototype.hasOwnProperty.call(locales, baseParts[baseParts.length - 1])) {
    base = base.slice(0, base.lastIndexOf(baseParts[baseParts.length - 1] + "/"));
  }
  var current = location.pathname.slice(base.length).replace(/^\\/+/, "");
  var first = current.split("/")[0];
  if (Object.prototype.hasOwnProperty.call(locales, first)) {
    document.documentElement.lang = locales[first];
    document.documentElement.dataset.staticLocale = first;
    return;
  }
  var lang = (navigator.languages && navigator.languages[0] || navigator.language || "en").toLowerCase();
  var fallback = lang.startsWith("pt") ? "pt-br" : lang.startsWith("es") ? "es" : lang.startsWith("zh") ? "zh-cn" : lang.startsWith("ja") ? "ja" : "en";
  var key = "otavio-static-locale-v4";
  function save(value) { try { localStorage.setItem(key, JSON.stringify({locale:value, expires:Date.now()+86400000})); } catch (_) {} }
  function english() { document.documentElement.lang = "en-US"; save("en"); }
  function cached() { try { var v=JSON.parse(localStorage.getItem(key)||"null"); return v && v.expires>Date.now() ? v.locale : null; } catch (_) { return null; } }
  function route(locale) {
    if (!Object.prototype.hasOwnProperty.call(locales, locale)) { english(); return; }
    var destination = base + locale + "/" + current;
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = controller ? setTimeout(function(){controller.abort();},3000) : null;
    fetch(destination,{method:"HEAD",cache:"no-store",signal:controller ? controller.signal : undefined})
      .then(function(response){ if(timer)clearTimeout(timer); if(!response.ok)throw new Error("Missing localized page"); save(locale); location.replace(destination+location.search+location.hash); })
      .catch(function(){ if(timer)clearTimeout(timer); english(); });
  }
  var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  var timer = controller ? setTimeout(function(){controller.abort();},3000) : null;
  fetch("https://ipwho.is/",{headers:{Accept:"application/json"},cache:"no-store",signal:controller ? controller.signal : undefined})
    .then(function(response){if(timer)clearTimeout(timer);if(!response.ok)throw new Error("GeoIP unavailable");return response.json();})
    .then(function(data){
      var c=String(data.country_code||"").toUpperCase();
      var locale=["BR","PT","AO","MZ","CV","GW","ST","TL"].includes(c)?"pt-br":c==="JP"?"ja":["CN","TW","HK","MO"].includes(c)?"zh-cn":["ES","MX","AR","CO","CL","PE","VE","EC","UY","PY","BO","CR","PA","DO","GT","HN","SV","NI","CU"].includes(c)?"es":"en";
      // Successful country lookup is authoritative; VPN/location changes apply immediately.
      if(locale==="en")english();else route(locale);
    })
    .catch(function(){if(timer)clearTimeout(timer);var old=cached();var locale=old||fallback;if(locale==="en")english();else route(locale);});
})();