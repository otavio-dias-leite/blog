import {gh,send,slugify,config} from "./_lib.js";

function yaml(value){return JSON.stringify(String(value??""));}
function markdown(input){
  const title=String(input.title||"").trim();
  const body=String(input.body||"").trim();
  if(!title||!body) throw Object.assign(new Error("Título e conteúdo são obrigatórios."),{status:400});
  const tags=Array.isArray(input.tags)?input.tags.map(x=>String(x).trim()).filter(Boolean):String(input.tags||"").split(",").map(x=>x.trim()).filter(Boolean);
  const categories=Array.isArray(input.categories)?input.categories.map(x=>String(x).trim()).filter(Boolean):String(input.categories||"").split(",").map(x=>x.trim()).filter(Boolean);
  const date=input.date?new Date(input.date):new Date();
  if(Number.isNaN(date.getTime())) throw Object.assign(new Error("Data inválida."),{status:400});
  const front=[
    "---",
    "title: "+yaml(title),
    "date: "+date.toISOString(),
    "draft: "+(input.draft===true?"true":"false"),
    "lang: "+yaml(input.lang||"auto"),
    "description: "+yaml(input.description||""),
    "tags: ["+tags.map(yaml).join(", ")+"]",
    "categories: ["+categories.map(yaml).join(", ")+"]",
    "---","",body,""
  ];
  return front.join("\n");
}
function decode(content){return Buffer.from(content||"","base64").toString("utf8");}
export default async function handler(req,res){
  try{
    if(req.method==="GET"){
      const files=await gh(req,"content/posts?ref="+encodeURIComponent(config.branch));
      const posts=(Array.isArray(files)?files:[]).filter(f=>f.type==="file"&&f.name.endsWith(".md")).map(f=>({name:f.name,slug:f.name.replace(/\.md$/,""),sha:f.sha,url:f.html_url}));
      const details=await Promise.all(posts.map(async p=>{
        try{const file=await gh(req,"content/posts/"+encodeURIComponent(p.name)+"?ref="+encodeURIComponent(config.branch));const text=decode(file.content);const title=text.match(/^title:\s*(?:"([^"]*)"|'([^']*)'|(.+))$/m);const draft=/^draft:\s*true\s*$/m.test(text);return {...p,title:(title?.[1]||title?.[2]||title?.[3]||p.slug).trim(),draft};}catch{return p;}
      }));
      return send(res,200,{posts:details.sort((a,b)=>a.name.localeCompare(b.name))});
    }
    if(!["POST","PUT","DELETE"].includes(req.method)) return send(res,405,{error:"Método não permitido."});
    const input=req.body&&typeof req.body==="object"?req.body:{};
    if(req.method==="DELETE"||input.action==="delete"){
      const name=String(input.name||"");
      if(!/^[a-z0-9][a-z0-9-]{0,79}\.md$/.test(name)) return send(res,400,{error:"Nome de arquivo inválido."});
      if(!input.sha) return send(res,400,{error:"SHA ausente; atualize a lista e tente novamente."});
      await gh(req,"content/posts/"+name,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:"Delete post: "+name,sha:input.sha,branch:config.branch})});
      return send(res,200,{ok:true});
    }
    const name=slugify(input.slug||input.title)+".md";
    const content=markdown(input);
    let sha=input.sha;
    if(req.method==="PUT"&&!sha){
      const current=await gh(req,"content/posts/"+name+"?ref="+encodeURIComponent(config.branch));
      sha=current.sha;
    }
    const payload={message:(req.method==="PUT"?"Update":"Create")+" blog post: "+name,content:Buffer.from(content,"utf8").toString("base64"),branch:config.branch};
    if(sha)payload.sha=sha;
    const result=await gh(req,"content/posts/"+name,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    return send(res,200,{ok:true,name,sha:result.content?.sha,url:result.content?.html_url});
  }catch(error){return send(res,error.status||500,{error:error.message||"Erro interno."});}
}
