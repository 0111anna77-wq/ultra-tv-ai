/* Ultra TV shared PERSONAL library client. Stage 1: user-added series only.
 * Existing site and TV localStorage remain the offline source of truth.
 * Server tokens are never logged or embedded in distributed code.
 */
(function(){
"use strict";
const siteMode=!/(?:^|\/)tv(?:\.html)?$/i.test(location.pathname);
const PREFIX=siteMode?"ultra-cloud-web-v1":"ultra-cloud-tv-v1";
const json=(k,defaultValue)=>{try{return JSON.parse(localStorage.getItem(PREFIX+k))??defaultValue}catch{return defaultValue}};
const put=(k,value)=>{try{localStorage.setItem(PREFIX+k,JSON.stringify(value))}catch{}};
const txt=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeName=s=>typeof s==="string"?s.slice(0,160):"";
let token=json("-token",""),versions=json("-versions",{}),pending=json("-queue",[]),
    imported=json("-imported",false),connectedAt=json("-connected-at",0);
let adapter=null,busy=false,needsRun=false,notice="",lastCode="",codeExpires=0;
function save(){
 put("-token",token);put("-versions",versions);put("-queue",pending);
 put("-imported",imported);put("-connected-at",connectedAt);
}
function canonical(show){
 if(!show||typeof show!=="object")return null;
 const k=String(show.key||"");
 const tvmaze=Number(show.tvmazeId||(/^user-(\d+)$/.exec(k)||[])[1]);
 if(Number.isSafeInteger(tvmaze)&&tvmaze>0)return "tvmaze:"+tvmaze;
 if(/^tt\d{5,12}$/.test(show.imdbId||""))return "imdb:"+show.imdbId;
 if(/^[a-zA-Z0-9_-]{1,70}$/.test(k))return "key:"+k;
 return null;
}
function normalize(show){
 const id=canonical(show);if(!id)return null;
 const obj={
  key:String(show.key),ru:safeName(show.ru),en:safeName(show.en||show.ru),
  genres:Array.isArray(show.genres)?show.genres.filter(x=>/^[a-z]{2,20}$/.test(x)).slice(0,6):[],
  year:Number(show.year)||2026,tvmazeId:null,imdbId:null
 };
 const tvmaze=Number(show.tvmazeId||(/^user-(\d+)$/.exec(obj.key)||[])[1]);
 if(Number.isSafeInteger(tvmaze)&&tvmaze>0){obj.tvmazeId=tvmaze;obj.key="user-"+tvmaze;}
 if(/^tt\d{5,12}$/.test(show.imdbId||""))obj.imdbId=show.imdbId;
 return {id,show:obj,tracked:show.tracked!==false};
}
async function call(path,data,requireToken=true){
 const headers={};
 if(data!==undefined)headers["content-type"]="application/json";
 if(requireToken&&token)headers.authorization="Bearer "+token;
 const response=await fetch("/api/sync/"+path,{
  method:data===undefined?"GET":"POST",headers,
  body:data===undefined?undefined:JSON.stringify(data),cache:"no-store",
  credentials:"same-origin"
 });
 let value={};
 try{value=await response.json()}catch{}
 if(!response.ok){
  const error=new Error(value.error||("Сервер ответил "+response.status));
  error.status=response.status;error.payload=value;
  throw error;
 }
 return value;
}
async function status(){
 try{return await call("status",undefined,false)}
 catch(err){return {ready:false,reason:err.message}}
}
function info(value){notice=value;render();}
const cloud={
 get connected(){return !!token},
 get pendingCount(){return pending.length},
 get status(){return notice},
 get code(){return lastCode},
 get lastConnectedAt(){return connectedAt},
 register(bridge){
  if(!bridge||typeof bridge.list!=="function"||typeof bridge.merge!=="function")throw Error("Cloud adapter required");
  adapter=bridge;
  if(token)cloud.sync().catch(()=>{});
 },
 async bootstrap(setupKey){
  if(!siteMode)throw Error("Настройка владельца доступна только с сайта.");
  const result=await call("bootstrap",{setupKey},false);
  token=result.token;
  versions={};pending=[];imported=false;
  connectedAt=Date.now();save();
  info("Сайт подключён. Объединяем коллекцию…");
  await cloud.sync();
  return true;
 },
 async join(code){
  if(siteMode)throw Error("Введите код на приставке.");
  const result=await call("pair/redeem",{code},false);
  token=result.token;
  versions={};pending=[];imported=false;
  connectedAt=Date.now();save();
  info("Приставка подключена. Объединяем коллекцию…");
  await cloud.sync();
  return true;
 },
 async createCode(){
  if(!token||!siteMode)throw Error("Сначала подключите сайт к синхронизации.");
  const data=await call("pair/start",{});
  lastCode=data.code;codeExpires=Date.now()+data.expiresInSeconds*1000;
  render();return data.code;
 },
 enqueue(series,tracked=true){
  const item=normalize({...series,tracked});if(!item)return false;
  // Preserve a local edit even if internet / VPN is unavailable.
  const base=Number.isInteger(versions[item.id])?versions[item.id]:0;
  const op={...item,baseRevision:base};
  pending=pending.filter(x=>x.id!==item.id);
  pending.push(op);
  save();
  info("Изменения сохранены локально. Синхронизация ожидает сеть.");
  if(token)cloud.sync().catch(()=>{});
  return true;
 },
 async sync(){
  if(!token||!adapter){render();return false}
  if(busy){needsRun=true;return false}
  busy=true;
  try{
   const {shows=[]}=await call("library");
   const remote=new Map(shows.map(x=>[x.id,x]));
   if(!imported){
    // First pairing is always additive: never delete local files/history.
    for(const entry of adapter.list()){
     const item=normalize(entry);if(!item)continue;
     if(!remote.has(item.id)&&!pending.some(x=>x.id===item.id))
       pending.push({...item,baseRevision:0});
    }
    // After collecting initial items, rely on server revisions for all
    // future changes. Until queue is flushed, offline edits stay pending.
    imported=true;
    save();
   }
   let unresolved=[];
   if(pending.length){
    const next=[];
    for(let start=0;start<pending.length;start+=30){
     const batch=pending.slice(start,start+30);
     try{
      const response=await call("library",{operations:batch});
      for(const result of response.results||[]){
       if(result.current?.revision)versions[result.id]=result.current.revision;
       if(result.current)remote.set(result.id,result.current);
      }
     }catch(err){
      if(err.status===409&&Array.isArray(err.payload?.results)){
       for(const result of err.payload.results){
        if(result.current?.revision)versions[result.id]=result.current.revision;
        if(result.current)remote.set(result.id,result.current);
        if(!result.ok){
         // Keep the local conflicting update in the queue. Owner can inspect
         // it later. Do not silently overwrite remote data from another device.
         const op=batch.find(x=>x.id===result.id);
         if(op)unresolved.push(op);
        }
       }
      }else{
       next.push(...batch);
      }
     }
    }
    pending=[...unresolved,...next];
    save();
   }
   // Fresh pull also includes other-device edits. Exclude pending local
   // changes, so the UI never discards an unsynced local addition.
   const response=await call("library");
   const blocked=new Set(pending.map(x=>x.id));
   const safe=response.shows.filter(x=>!blocked.has(x.id));
   for(const x of response.shows)if(!blocked.has(x.id))versions[x.id]=Number(x.revision)||0;
   adapter.merge(safe);
   connectedAt=Date.now();save();
   notice=pending.length?
    "Сохранено локально: "+pending.length+" изменений ожидают отправки или решения конфликта.":
    "Синхронизировано · "+response.shows.length+" сериалов в личной коллекции";
   render();return pending.length===0;
  }catch(err){
   notice="Нет связи с облаком: "+String(err.message||"ошибка")+". Локальная коллекция сохранена.";
   render();return false;
  }finally{
   busy=false;
   if(needsRun){needsRun=false;setTimeout(()=>cloud.sync(),1500);}
  }
 },
 render:()=>render()
};
function panelMarkup(){
 const connected=Boolean(token);
 const buttonClass=siteMode?' class="btn ghost"':' class="action"';
 const body=connected?
  '<p class="cloud-status">'+txt(notice||"Подключено. Изменения будут сохраняться в общей коллекции.")+'</p>'+
  '<button type="button"'+buttonClass+' data-cloud="sync">↻ Синхронизировать коллекцию</button>'+
  (siteMode?'<button type="button"'+buttonClass+' data-cloud="code">Подключить приставку</button>':'')+
  (lastCode&&Date.now()<codeExpires?'<p class="cloud-pair-code">Код для приставки: <strong>'+txt(lastCode.slice(0,4)+" "+lastCode.slice(4))+'</strong><small>Действует 5 минут. На приставке: Настройки → Синхронизация.</small></p>':''):
  siteMode?
   '<p>Один раз введите секрет владельца из настроек Cloudflare. Он не сохраняется в браузере.</p>'+
   '<input type="password" data-cloud-input="secret" autocomplete="off" placeholder="Секрет владельца" aria-label="Секрет владельца">'+
   '<button type="button"'+buttonClass+' data-cloud="owner">Подключить сайт</button>':
   '<p>Получите 8-значный код в настройках сайта и введите его здесь.</p>'+
   '<input type="text" data-cloud-input="code" inputmode="numeric" maxlength="9" readonly placeholder="8 цифр" aria-label="Код подключения">'+
   '<button type="button"'+buttonClass+' data-cloud="input">Ввести код</button>'+ 
   '<button type="button"'+buttonClass+' data-cloud="join">Подключить приставку</button>';
 return '<h3>Синхронизация личной коллекции</h3><p>Сериалы, добавленные вручную, будут общими для сайта и телевизора. Прогресс просмотра — следующий этап.</p>'+
 body+(!connected&&notice?'<p class="cloud-status">'+txt(notice)+'</p>':'')+
 '<small class="cloud-tip">Без интернета твоя коллекция продолжит работать локально. Ничего не удаляем.</small>';
}
function render(){
 const node=document.getElementById(siteMode?"cloud-sync-web":"cloud-sync-tv");
 if(!node)return;
 node.innerHTML=panelMarkup();
 node.onclick=onClick;
}
async function onClick(event){
 const action=event.target.closest("[data-cloud]")?.getAttribute("data-cloud");
 if(!action)return;
 const root=event.currentTarget;
 const secret=root.querySelector('[data-cloud-input="secret"]')?.value||"";
 const code=root.querySelector('[data-cloud-input="code"]')?.value||"";
 try{
  if(action==="input"){
   const input=root.querySelector('[data-cloud-input="code"]');
   if(input){input.readOnly=false;input.focus({preventScroll:true});window.location.href="ultratv://keyboard";}
   return;
  }
  if(action==="owner")await cloud.bootstrap(secret);
  else if(action==="join")await cloud.join(code);
  else if(action==="sync")await cloud.sync();
  else if(action==="code")await cloud.createCode();
 }catch(err){
  info("Ошибка: "+String(err.message||"нет связи"));
 }
 render();
}
window.UltraTVCloud=cloud;
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&token)cloud.sync().catch(()=>{})});
setInterval(()=>{if(token&&!document.hidden)cloud.sync().catch(()=>{})},120000);
})();
