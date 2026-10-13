(() => {
  "use strict";
  const STORAGE_KEY = "otavio-blog-language-v5";
  const LANGUAGES = { "en-US":"en", "pt-BR":"pt", "zh-CN":"zh" };
  const API_URL = "https://translate.argosopentech.com";
  const originalNodes = new Map();
  const memoryCache = new Map();
  let persistentCache = {};
  let activeRun = 0;
  try { persistentCache = JSON.parse(localStorage.getItem("otavio-blog-translation-cache-v2") || "{}"); }
  catch { persistentCache = {}; }

  function readLanguage() {
    try { const saved=localStorage.getItem(STORAGE_KEY); return Object.hasOwn(LANGUAGES,saved)?saved:"en-US"; }
    catch { return "en-US"; }
  }
  function sourceCode(value) {
    if (!value || value === "auto") return "auto";
    const code=value.toLowerCase().split("-")[0];
    return code === "zh" ? "zh" : code;
  }
  function remember(node) {
    if (!originalNodes.has(node)) originalNodes.set(node,node.nodeValue);
    return originalNodes.get(node);
  }
  function cacheKey(text,source,target) { return source+"|"+target+"|"+text; }
  async function requestJson(path,payload) {
    let lastError;
    for (let attempt=0;attempt<3;attempt++) {
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),18000);
      try {
        const response=await fetch(API_URL+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:controller.signal});
        if (!response.ok) {
          if (response.status===429 || response.status>=500) throw new Error("Translation service returned "+response.status);
          throw new Error("Translation request rejected ("+response.status+")");
        }
        return await response.json();
      } catch(error) {
        lastError=error;
        if (attempt<2) await new Promise(resolve=>setTimeout(resolve,700*Math.pow(2,attempt)));
      } finally { clearTimeout(timer); }
    }
    throw lastError || new Error("Translation service unavailable");
  }
  async function detectLanguage(text) {
    const sample=text.replace(/\s+/g," ").trim().slice(0,4500);
    if (!sample) return "auto";
    try {
      const result=await requestJson("/detect",{q:sample});
      const detected=Array.isArray(result)?result.sort((a,b)=>(b.confidence||0)-(a.confidence||0))[0]:null;
      return detected?.language || "auto";
    } catch(error) {
      console.warn("Language detection failed; using translator auto-detection.",error);
      return "auto";
    }
  }
  async function translateText(text,source,target) {
    const key=cacheKey(text,source,target);
    if(memoryCache.has(key)) return memoryCache.get(key);
    if(persistentCache[key]) { memoryCache.set(key,persistentCache[key]); return persistentCache[key]; }
    const data=await requestJson("/translate",{q:text,source,target,format:"text"});
    if(!data.translatedText) throw new Error("Empty translation result");
    const translated=data.translatedText;
    memoryCache.set(key,translated); persistentCache[key]=translated;
    const keys=Object.keys(persistentCache);
    if(keys.length>300) for(const oldKey of keys.slice(0,keys.length-300)) delete persistentCache[oldKey];
    try { localStorage.setItem("otavio-blog-translation-cache-v2",JSON.stringify(persistentCache)); } catch {}
    return translated;
  }
  function collectTextNodes(root) {
    const nodes=[];
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{
      acceptNode(node) {
        if(!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent=node.parentElement;
        if(!parent || parent.closest("script,style,code,pre,textarea,button,svg,.comments,[aria-hidden='true'],.translation-status")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while(walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }
  async function translateNodes(nodes,source,target,run) {
    const queue=nodes.map(node=>({node,text:remember(node)}));
    let cursor=0,failed=false;
    const workers=Array.from({length:Math.min(2,queue.length)},async()=>{
      while(cursor<queue.length) {
        const item=queue[cursor++];
        if(run!==activeRun) return;
        try {
          const translated=await translateText(item.text,source,target);
          if(run===activeRun) item.node.nodeValue=translated;
        } catch(error) {
          failed=true; console.warn("Could not translate a blog text segment:",error);
          if(run===activeRun) item.node.nodeValue=item.text;
        }
      }
    });
    await Promise.all(workers);
    return failed;
  }
  function updateButtons(language) {
    document.querySelectorAll("[data-blog-language]").forEach(button=>{
      const active=button.dataset.blogLanguage===language;
      button.classList.toggle("active",active);
      button.setAttribute("aria-pressed",String(active));
    });
  }
  function showStatus(message) {
    let status=document.querySelector(".translation-status");
    if(!status) {
      status=document.createElement("p"); status.className="translation-status"; status.setAttribute("role","status");
      document.querySelector("header")?.insertAdjacentElement("afterend",status);
    }
    status.textContent=message||""; status.hidden=!message;
  }
  async function applyLanguage(language) {
    const selected=Object.hasOwn(LANGUAGES,language)?language:"en-US";
    const target=LANGUAGES[selected],run=++activeRun;
    document.documentElement.lang=selected; updateButtons(selected); showStatus("Translating…");
    const cards=[...document.querySelectorAll("[data-post-title]")];
    const article=document.querySelector("main.article");
    const cardJobs=[];
    for(const title of cards) {
      const container=title.closest("[data-post-slug]")||title;
      const node=title.firstChild;
      if(!node||node.nodeType!==Node.TEXT_NODE) continue;
      const original=remember(node),source=sourceCode(container.dataset.postLanguage||"auto");
      if(source===target) node.nodeValue=original;
      else cardJobs.push({nodes:[node],source});
    }
    let articleNodes=[];
    if(article) {
      articleNodes=collectTextNodes(article);
      articleNodes.forEach(node=>{node.nodeValue=remember(node);});
    }
    const allArticleText=articleNodes.map(remember).join(" ").slice(0,4500);
    let articleSource=sourceCode(article?.dataset.postLanguage||"auto");
    if(article && articleSource==="auto") articleSource=await detectLanguage(allArticleText);
    if(run!==activeRun) return;
    const jobs=cardJobs.map(job=>translateNodes(job.nodes,job.source==="auto"?(await detectLanguage(remember(job.nodes[0]))):job.source,target,run));
    if(article && articleSource!==target) jobs.push(translateNodes(articleNodes,articleSource,target,run));
    else if(article) articleNodes.forEach(node=>{node.nodeValue=remember(node);});
    const results=await Promise.all(jobs);
    if(run!==activeRun) return;
    const failed=results.some(Boolean);
    const heading=article?.querySelector("[data-post-title]");
    if(heading) document.title=heading.textContent.trim()+" — Otávio Leite";
    showStatus(failed?"Some sections could not be translated. The original text remains visible.":"");
    try { localStorage.setItem(STORAGE_KEY,selected); } catch {}
  }
  document.addEventListener("click",event=>{
    const button=event.target.closest("[data-blog-language]");
    if(!button)return; event.preventDefault(); applyLanguage(button.dataset.blogLanguage);
  });
  document.addEventListener("DOMContentLoaded",()=>applyLanguage(readLanguage()));
})();