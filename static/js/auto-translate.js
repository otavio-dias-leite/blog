(() => {
  const countryLanguage = {
    BR:"pt", PT:"pt", AO:"pt", MZ:"pt",
    US:"en", GB:"en", IE:"en", AU:"en", NZ:"en", CA:"en", IN:"en", SG:"en", ZA:"en",
    ES:"es", MX:"es", AR:"es", CL:"es", CO:"es", PE:"es", VE:"es", UY:"es", PY:"es", BO:"es", EC:"es", CR:"es", PA:"es", DO:"es", GT:"es", HN:"es", SV:"es", NI:"es",
    FR:"fr", BE:"fr", CH:"fr", MC:"fr",
    DE:"de", AT:"de",
    IT:"it", SM:"it",
    NL:"nl", PL:"pl", RU:"ru", UA:"uk", TR:"tr", GR:"el",
    JP:"ja", KR:"ko", CN:"zh-CN", TW:"zh-TW", HK:"zh-TW",
    SA:"ar", AE:"ar", EG:"ar", IL:"iw", TH:"th", VN:"vi", ID:"id"
  };
  const supported = "en,es,fr,de,it,nl,pl,ru,uk,tr,el,ja,ko,zh-CN,zh-TW,ar,iw,th,vi,id";
  const browserLanguage = (navigator.language || "en").split("-")[0].toLowerCase();
  const fallback = browserLanguage === "pt" ? "pt" : (supported.split(",").includes(browserLanguage) ? browserLanguage : "en");
  const startTranslation = target => {
    if (!target || target === "pt") return;
    const language = supported.split(",").includes(target) ? target : "en";
    document.cookie = "googtrans=/pt/" + language + ";path=/;SameSite=Lax";
    const style = document.createElement("style");
    style.textContent = "iframe.goog-te-banner-frame,.goog-te-banner-frame,.goog-te-balloon-frame,#goog-gt-tt,.goog-te-menu-frame,body>.skiptranslate{display:none!important;visibility:hidden!important}html,body{top:0!important;position:static!important}#google_translate_element{position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none}.goog-logo-link,.goog-te-gadget{font-size:0!important}";
    document.head.appendChild(style);
    window.googleTranslateElementInit = () => {
      new google.translate.TranslateElement({
        pageLanguage: "pt",
        includedLanguages: supported,
        autoDisplay: false
      }, "google_translate_element");
      const apply = () => {
        const combo = document.querySelector(".goog-te-combo");
        if (!combo) return false;
        if (combo.value !== language) {
          combo.value = language;
          combo.dispatchEvent(new Event("change"));
        }
        return true;
      };
      if (!apply()) {
        const observer = new MutationObserver(() => {
          if (apply()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 12000);
      }
    };
    const script = document.createElement("script");
    script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    document.head.appendChild(script);
  };
  fetch("https://ipapi.co/json/", { cache: "no-store" })
    .then(response => response.ok ? response.json() : Promise.reject())
    .then(data => startTranslation(countryLanguage[data.country_code] || fallback))
    .catch(() => startTranslation(fallback));
})();