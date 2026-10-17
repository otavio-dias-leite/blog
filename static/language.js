(() => {
  "use strict";

  const STORAGE_KEY = "otavio-blog-language-v7";
  const CACHE_KEY = "otavio-blog-translation-cache-v8";
  const GEO_KEY = "otavio-blog-geo-language-v1";
  const LANGUAGES = { "en-US": "en", "pt-BR": "pt", "zh-CN": "zh" };
  const TRANSLATORS = [
    async (text, source, target) => {
      const url = new URL("https://translate.googleapis.com/translate_a/single");
      url.search = new URLSearchParams({client:"gtx",sl:source==="auto"?"auto":source,tl:target,dt:"t",q:text}).toString();
      const response = await fetch(url,{headers:{Accept:"application/json"}});
      if(!response.ok) throw new Error("Google Translate HTTP "+response.status);
      const data = await response.json();
      const translated = Array.isArray(data?.[0]) ? data[0].map(part=>part?.[0]||"").join("") : "";
      if(!translated.trim()) throw new Error("Empty translation");
      return translated;
    },
    async (text, source, target) => {
      const url = new URL("https://api.mymemory.translated.net/get");
      url.search = new URLSearchParams({q:text,langpair:(source==="auto"?"pt":source)+"|"+target}).toString();
      const response = await fetch(url,{headers:{Accept:"application/json"}});
      if(!response.ok) throw new Error("MyMemory HTTP "+response.status);
      const data = await response.json();
      if(Number(data?.responseStatus)!==200 || !data?.responseData?.translatedText) throw new Error("MyMemory translation failed");
      return data.responseData.translatedText;
    }
  ];

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
    for (const translate of TRANSLATORS) {
      try {
        if(path==="/detect") {
          const sample=String(payload.q||"").slice(0,1200);
          const probe=await translate(sample,"auto","en");
          return [{language:/[\u4e00-\u9fff]/.test(sample)?"zh":/[\u3040-\u30ff]/.test(sample)?"ja":/[áàâãéêíóôõúç]/i.test(sample)?"pt":"en",confidence:0.7,probe}];
        }
        const translatedText=await translate(String(payload.q||""),payload.source,payload.target);
        return {translatedText};
      } catch(error) { lastError=error; }
    }
    throw lastError || new Error("Translation services unavailable");
  }

  async function detectLanguage(text) {
    const sample=String(text||"").replace(/\s+/g," ").trim().slice(0,1200);
    if(!sample)return "pt";
    try {
      const url=new URL("https://translate.googleapis.com/translate_a/single");
      url.search=new URLSearchParams({client:"gtx",sl:"auto",tl:"en",dt:"t",q:sample}).toString();
      const response=await fetch(url);
      if(!response.ok)throw new Error("Detection failed");
      const data=await response.json();
      const detected=sourceCode(data?.[2]||"auto");
      if(detected!=="auto")return detected;
    } catch {}
    if(/[\u4e00-\u9fff]/.test(sample))return "zh";
    if(/[\u3040-\u30ff]/.test(sample))return "ja";
    return "pt";
  }

  async function translateHTML(html, source, target) {
    const key=cacheKey(html,source,target);
    if(cache.has(key)) return cache.get(key);
    if(savedCache[key]) { cache.set(key,savedCache[key]); return savedCache[key]; }
    const template=document.createElement("template");
    template.innerHTML=html;
    const walker=document.createTreeWalker(template.content,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode()) {
      const node=walker.currentNode, parent=node.parentElement;
      if(node.nodeValue.trim() && !(parent && parent.closest("script,style,code,pre,svg,math"))) nodes.push(node);
    }
    const jobs=nodes.map(async node=>{
      const raw=node.nodeValue, leading=raw.match(/^\\s*/)?.[0]||"", trailing=raw.match(/\\s*$/)?.[0]||"", value=raw.trim();
      if(!value) return;
      try {
        const result=await api("/translate",{q:value,source:source==="auto"?"auto":source,target});
        if(result.translatedText) node.nodeValue=leading+result.translatedText+trailing;
      } catch {}
    });
    for(let i=0;i<jobs.length;i+=12) await Promise.all(jobs.slice(i,i+12));
    const translated=template.innerHTML;
    cache.set(key,translated); savedCache[key]=translated;
    const keys=Object.keys(savedCache);
    if(keys.length>500) for(const oldKey of keys.slice(0,keys.length-500)) delete savedCache[oldKey];
    try { localStorage.setItem(CACHE_KEY,JSON.stringify(savedCache)); } catch {}
    return translated;
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
    const concurrency = 8;
    for (let i = 0; i < elements.length; i += concurrency) {
      if (currentRun !== runId) return;
      await Promise.all(elements.slice(i, i + concurrency).map(async element => {
        const original = getOriginal(element);
        try {
          const translated = await translateHTML(original, source, target);
          if (currentRun === runId && translated) element.innerHTML = translated;
        } catch {
          if (currentRun === runId) element.innerHTML = original;
        }
      }));
    }
  }

  async function applyLanguage(requestedLanguage) {
    const language = requestedLanguage || "en-US";
    const target = sourceCode(language);
    const currentRun = ++runId;
    document.documentElement.lang = language;

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
          if (source !== target) await translateElements(group, source, target, currentRun);
        } catch (error) {
        }
      }
    }

    if (currentRun !== runId) return;
    try { localStorage.setItem(STORAGE_KEY, language); } catch {}
  }

  async function detectVisitorLanguage() {
    try { const cached = JSON.parse(localStorage.getItem(GEO_KEY) || "null"); if (cached && cached.expires > Date.now() && cached.language) return cached.language; } catch {}
    const map = {"BR":"pt-BR","PT":"pt-PT","AO":"pt","MZ":"pt","CV":"pt","GW":"pt","ST":"pt","TL":"pt","US":"en-US","GB":"en-GB","IE":"en-IE","AU":"en-AU","NZ":"en-NZ","CA":"en-CA","IN":"en-IN","ZA":"en-ZA","NG":"en","ES":"es","MX":"es","AR":"es","CO":"es","CL":"es","PE":"es","VE":"es","EC":"es","UY":"es","PY":"es","BO":"es","CR":"es","PA":"es","DO":"es","GT":"es","HN":"es","SV":"es","NI":"es","CU":"es","FR":"fr","BE":"fr","SN":"fr","CI":"fr","CD":"fr","CH":"fr","LU":"fr","DE":"de","AT":"de","LI":"de","NL":"nl","BE_NL":"nl","IT":"it","SM":"it","VA":"it","JP":"ja","CN":"zh-CN","TW":"zh-TW","HK":"zh-TW","MO":"zh-TW","KR":"ko","KP":"ko","RU":"ru","BY":"ru","KZ":"ru","UA":"uk","PL":"pl","CZ":"cs","SK":"sk","HU":"hu","RO":"ro","MD":"ro","BG":"bg","GR":"el","TR":"tr","SA":"ar","AE":"ar","EG":"ar","MA":"ar","DZ":"ar","TN":"ar","QA":"ar","KW":"ar","BH":"ar","OM":"ar","JO":"ar","LB":"ar","IQ":"ar","IL":"he","IR":"fa","AF":"fa","PK":"ur","BD":"bn","TH":"th","VN":"vi","ID":"id","MY":"ms","SG":"en","PH":"fil","SE":"sv","NO":"no","DK":"da","FI":"fi","IS":"is","EE":"et","LV":"lv","LT":"lt","HR":"hr","RS":"sr","BA":"bs","SI":"sl","MK":"mk","AL":"sq","GE":"ka","AM":"hy","AZ":"az","KE":"sw","TZ":"sw","UG":"en","ET":"am","RW":"rw"};
    const fallback = (() => {
      const locales = [...(navigator.languages || []), navigator.language || ""].map(x => String(x).toLowerCase());
      const preferred = locales.find(Boolean) || "en";
      return preferred.startsWith("pt") ? "pt-BR" : preferred.startsWith("zh") ? (preferred.includes("tw") || preferred.includes("hk") ? "zh-TW" : "zh-CN") : preferred.split("-")[0];
    })();
    try {
      const response = await fetch("https://ipwho.is/", {headers:{Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(4500)});
      if (!response.ok) throw new Error("GeoIP unavailable");
      const data = await response.json();
      if (data.success && data.country_code) { const language = map[data.country_code.toUpperCase()] || fallback; try { localStorage.setItem(GEO_KEY, JSON.stringify({language, expires:Date.now()+86400000})); } catch {} return language; }
    } catch {}
    return fallback;
  }
  document.addEventListener("DOMContentLoaded", () => {
    detectVisitorLanguage().then(applyLanguage);
  });
})();