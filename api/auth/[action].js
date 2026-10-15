import crypto from "node:crypto";
import {config,send,cookie,setCookie,clearCookie,encrypt,getSession} from "../_lib.js";

const callbackUrl=req=>process.env.GITHUB_CALLBACK_URL||((req.headers["x-forwarded-proto"]||"https")+"://"+req.headers.host+"/api/auth/callback");
const b64=b=>b.toString("base64url");
function cookieLine(name,value,maxAge){let s=name+"="+encodeURIComponent(value)+"; Path=/; SameSite=Lax; Max-Age="+maxAge+"; HttpOnly";if(process.env.NODE_ENV==="production")s+="; Secure";return s;}
export default async function handler(req,res){
  const action=String(req.query.action||"").toLowerCase();
  try{
    if(action==="login"&&req.method==="GET"){
      if(!process.env.GITHUB_CLIENT_ID||!process.env.GITHUB_CLIENT_SECRET||!process.env.SESSION_SECRET) return send(res,503,{error:"Configure GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET e SESSION_SECRET no ambiente da hospedagem."});
      const state=b64(crypto.randomBytes(24)),verifier=b64(crypto.randomBytes(48));
      const challenge=b64(crypto.createHash("sha256").update(verifier).digest());
      res.setHeader("Set-Cookie",[cookieLine("otavio_oauth_state",state,600),cookieLine("otavio_oauth_verifier",verifier,600)]);
      const url=new URL("https://github.com/login/oauth/authorize");
      url.search=new URLSearchParams({client_id:process.env.GITHUB_CLIENT_ID,redirect_uri:callbackUrl(req),scope:"public_repo",state,code_challenge:challenge,code_challenge_method:"S256"}).toString();
      return res.redirect(302,url.toString());
    }
    if(action==="callback"&&req.method==="GET"){
      const state=String(req.query.state||""),code=String(req.query.code||"");
      const expected=cookie(req,"otavio_oauth_state"),verifier=cookie(req,"otavio_oauth_verifier");
      res.setHeader("Set-Cookie",["otavio_oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax","otavio_oauth_verifier=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"]);
      if(!code||!state||!expected||state!==expected||!verifier) return send(res,400,{error:"Validação OAuth inválida. Tente entrar novamente."});
      const tokenResponse=await fetch("https://github.com/login/oauth/access_token",{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify({client_id:process.env.GITHUB_CLIENT_ID,client_secret:process.env.GITHUB_CLIENT_SECRET,code,redirect_uri:callbackUrl(req),code_verifier:verifier})});
      const tokenData=await tokenResponse.json();
      if(!tokenResponse.ok||!tokenData.access_token) return send(res,401,{error:"O GitHub não autorizou a sessão."});
      const userResponse=await fetch("https://api.github.com/user",{headers:{Authorization:"Bearer "+tokenData.access_token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}});
      const user=await userResponse.json();
      if(!userResponse.ok||String(user.login||"").toLowerCase()!==config.allowed) return send(res,403,{error:"Esta conta GitHub não tem permissão para administrar o blog."});
      setCookie(res,config.cookie,encrypt({token:tokenData.access_token,login:user.login,exp:Date.now()+7*24*60*60*1000}),7*24*60*60);
      return res.redirect(302,"/blog/admin/");
    }
    if(action==="session"&&req.method==="GET"){
      const s=await getSession(req);
      return send(res,200,{authenticated:!!s,user:s?.user||null,allowed:config.allowed});
    }
    if(action==="logout"&&req.method==="POST"){
      clearCookie(res,config.cookie);
      return send(res,200,{ok:true});
    }
    return send(res,404,{error:"Rota não encontrada."});
  }catch(error){return send(res,error.status||500,{error:error.message||"Erro interno."});}
}
