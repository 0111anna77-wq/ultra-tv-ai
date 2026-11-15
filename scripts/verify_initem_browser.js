const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ultratv-cloud-browser-'));
const chrome=process.env.CHROME_BIN||'/usr/bin/google-chrome';
const child=cp.spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-notifications','--disable-popup-blocking','--no-first-run','--remote-debugging-port=0','--window-size=1280,800','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let ws,seq=0,pending=new Map(),network=[],errors=[];
function send(method,params={}){return new Promise((resolve,reject)=>{let id=++seq;let timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},20000);pending.set(id,msg=>{clearTimeout(timer);resolve(msg.result)});ws.send(JSON.stringify({id,method,params}))});}
async function ev(expression){const x=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});return x?.result?.value??x?.result?.description??null;}
async function audit(url,name){
 network=[];errors=[];
 console.log('TEST',name,url);
 await send('Page.navigate',{url});
 await pause(6500);
 const snapshot='(()=>({url:location.href,title:document.title,body:document.body?.innerText.slice(0,1600),buttons:[...document.querySelectorAll("button")].slice(0,35).map(x=>({text:x.innerText?.slice(0,65),title:x.title,aria:x.getAttribute("aria-label")})),selects:[...document.querySelectorAll("select")].slice(0,20).map(x=>({id:x.id,options:[...x.options].slice(0,20).map(o=>o.textContent)})),videos:[...document.querySelectorAll("video")].map(v=>({ready:v.readyState,paused:v.paused,currentTime:v.currentTime,duration:v.duration,err:v.error?.code??null})),iframes:[...document.querySelectorAll("iframe")].map(x=>({srcHost:(()=>{try{return new URL(x.src).hostname}catch{return ""}})()}))}))()';
 console.log('BEFORE',JSON.stringify(await ev(snapshot)).slice(0,3300));
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:625,y:368,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:625,y:368,button:'left',clickCount:1});
 await pause(8000);
 console.log('AFTER',JSON.stringify(await ev(snapshot)).slice(0,3300));
 console.log('NETWORK',JSON.stringify(network.slice(-28)));
 console.log('ERRORS',JSON.stringify(errors.slice(-10)));
 const screen=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 fs.writeFileSync(path.join(process.cwd(),name+'.png'),Buffer.from(screen.data,'base64'));
}
async function siteAudit(){
  const url='https://ultra-tv-ai.pages.dev/';
  await send('Page.navigate',{url});
  await pause(4500);
  const basic=await ev('(()=>({url:location.href,title:document.title,releaseCount:window.UltraTV?.releases?.entries?.length||0,containsLostfilm:document.body.innerText.includes("Новые озвучки LostFilm"),moblandRelease:document.body.innerText.includes("Нервный срыв"),playerBridge:!!window.UltraTVPlayer}))()');
  console.log('ULTRA_SITE',JSON.stringify(basic));
  if(!basic.playerBridge)throw Error('Ultra TV Player did not initialize');
  await ev('window.UltraTVPlayer.open("mobland");"opened"');
  await pause(2000);
  const player=await ev('(()=>({title:document.querySelector("#player-root h2")?.textContent,sourceNames:[...document.querySelectorAll("#ut-select-source option")].map(x=>x.textContent),iframe:document.querySelector("#ut-media iframe")?.src||null,episodeButtons:document.querySelectorAll("[data-ut-episode]").length}))()');
  console.log('ULTRA_PLAYER',JSON.stringify(player));
  // The user's browser can play Initem. In US cloud Chrome we only assert
  // correct default selection; upstream video remains geo-blocked here.
  if(!player.sourceNames.some(x=>x.includes('RUTUBE')))throw Error('RUTUBE fallback missing');
  if(!player.sourceNames.some(x=>x.includes('Initem')))throw Error('Initem multi-voice option missing');
  if(!player.iframe?.startsWith('https://api.initem.ws/embed/'))throw Error('Initem not selected by default');
  if(!basic.releaseCount)throw Error('No LostFilm metadata loaded');
  const rssLink=await ev('(()=>[...document.querySelectorAll(".lf-actions button")].some(x=>x.textContent.includes("Initem")))()');
  console.log('RSS_INITEM_BUTTON',rssLink);
  if(!rssLink)throw Error('LostFilm RSS entry cannot open series browser');
  // Simulate a TVmaze result for another tracked show. This validates generic
  // source wiring without pretending that its third-party video actually plays.
  const auto=await ev('(()=>{const show=window.UltraTV.state.data.boys||{};show.imdb="tt1190634";window.UltraTV.state.data.boys=show;window.UltraTVPlayer.close();window.UltraTVPlayer.open("boys");return {iframe:document.querySelector("#ut-media iframe")?.src,source:document.querySelector(".ut-source-name")?.textContent||document.querySelector("#ut-select-source")?.textContent}})()');
  console.log('AUTO_DISCOVERY',JSON.stringify(auto));
  if(!auto.iframe?.includes('/embed/imdb/tt1190634'))throw Error('Automatic IMDb lookup not wired to Initem');

  // Confirm the personal features with a real DOM, not only source-code syntax.
  const recent=await ev('(()=>{window.UltraTVPlayer.close();return {history:window.UltraTV.state.recent?.mobland,rail:!!document.querySelector(".recent-section"),button:document.querySelector(".recent-item")?.textContent?.trim().slice(0,100)}})()');
  console.log('RESUME_RAIL',JSON.stringify(recent));
  if(!recent.history||!recent.rail||!recent.button)throw Error('Last selected episode was not saved into the resume rail');
  const follow=await ev('(()=>{document.querySelector("[data-view=discover]").click();const key="spider-noir";const before=window.UltraTV.state.tracked[key];document.querySelector("[data-toggle-follow="+key+"]").click();const after=window.UltraTV.state.tracked[key];document.querySelector("[data-toggle-follow="+key+"]").click();return {before,after,restored:window.UltraTV.state.tracked[key]}})()');
  console.log('FOLLOW_TOGGLE',JSON.stringify(follow));
  if(follow.before!==true||follow.after!==false||follow.restored!==true)throw Error('Favorite switch is not reversible');
  const manual=await ev('(()=>{const s=window.UltraTV.state;s.data.mobland={id:999,name:"MobLand",image:"",episodes:[{id:20508,season:2,number:8,name:"Test",airdate:"2026-11-01"}],fetchedAt:Date.now()};document.querySelector("[data-view=feed]").click();const btn=document.querySelector(".episode-row .episode-mark");if(!btn)return {found:false};const key=btn.dataset.watch;const before=!!s.watched[key];btn.click();const after=!!s.watched[key];document.querySelector("[data-watch]").click();return {found:true,before,after,restored:!!s.watched[key]}})()');
  console.log('WATCH_TOGGLE',JSON.stringify(manual));
  if(!manual.found||manual.before===manual.after||manual.restored!==manual.before)throw Error('Watch mark action did not toggle and persist');

  const subscription=await ev('(()=>{const app=window.UltraTV,s=app.state;document.querySelector("[data-view=catalog]").click();const before=!!document.querySelector("[data-toggle-follow=mobland]");const was=s.tracked.mobland!==false;document.querySelector("[data-toggle-follow=mobland]").click();const off=s.tracked.mobland===false;const stillVisible=!!document.querySelector("[data-toggle-follow=mobland]");const notice=!!document.querySelector("[data-action=tracking-undo]");document.querySelector("[data-action=tracking-undo]")?.click();const restored=s.tracked.mobland===true;const visibleRestored=!!document.querySelector("[data-toggle-follow=mobland]");return {before,was,off,stillVisible,notice,restored,visibleRestored}})()');
  console.log('FOLLOW_CATALOG_UNDO',JSON.stringify(subscription));
  if(!subscription.before||!subscription.was||!subscription.off||!subscription.stillVisible||!subscription.notice||!subscription.restored||!subscription.visibleRestored)throw Error('Catalog subscription disappeared without undo');


  const bookmark=await ev('(()=>{window.UltraTVPlayer.open("mobland");const f=document.querySelector("#ut-media iframe");const input=document.querySelector("#ut-bookmark-time");if(!f||!input)return {ready:false};input.value="24:35";document.querySelector("[data-ut-save-bookmark]").click();const saved=window.UltraTV.state.bookmarks["mobland:S02E08"]?.seconds;const sameFrame=f===document.querySelector("#ut-media iframe");const status=document.querySelector("#ut-bookmark-status")?.textContent;window.UltraTVPlayer.close();const rail=[...document.querySelectorAll(".recent-item")].find(x=>x.dataset.open==="mobland")?.textContent;return {ready:true,saved,sameFrame,status,rail}})()');
  console.log('MINUTE_BOOKMARK',JSON.stringify(bookmark));
  if(!bookmark.ready||bookmark.saved!==1475||!bookmark.sameFrame||!bookmark.rail?.includes('24:35'))throw Error('Manual minute saving or resume rail regression');




  const ss=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(process.cwd(),'ultratv-initem-source-test.png'),Buffer.from(ss.data,'base64'));
  // Run a separate narrow viewport smoke test for the user's Xiaomi browser.
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:'https://ultra-tv-ai.pages.dev/'});
  await pause(3200);
  const mobile=await ev('(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,hasNav:!!document.querySelector(".nav"),hasFeed:!!document.querySelector("#main-content"),hasSubscribeButtons:!!document.querySelector(".follow-tag")}))()');
  console.log('MOBILE_LAYOUT',JSON.stringify(mobile));
  if(mobile.documentWidth>mobile.width+4||!mobile.hasNav||!mobile.hasFeed)throw Error('Horizontal overflow or missing main layout on mobile');
  const mobileScreen=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(process.cwd(),'ultratv-mobile-v10.png'),Buffer.from(mobileScreen.data,'base64'));
}
(async()=>{
 try{
  const active=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<80&&!fs.existsSync(active);i++)await pause(250);
  if(!fs.existsSync(active))throw Error('No Chrome debugging port');
  const port=fs.readFileSync(active,'utf8').split('\n')[0];
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}
    if(m.method==='Network.responseReceived'){let u=m.params.response.url;try{let host=new URL(u).hostname;if(/\\.(?:m3u8|mp4)(?:$|\\?)/i.test(u)||m.params.type==='Media')network.push({host,status:m.params.response.status,type:m.params.type})}catch{}}
    if(m.method==='Network.loadingFailed')errors.push(m.params.errorText);
  };
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await audit('https://api.initem.ws/embed/imdb/tt31510819','initem-mobland');
  await audit('https://api.initem.ws/embed/imdb/tt14688458','initem-silo');
  await siteAudit();
 }catch(e){console.log('FAIL',e.stack);process.exitCode=1}
 finally{try{ws?.close()}catch{}child.kill();await pause(500);try{fs.rmSync(profile,{recursive:true,force:true})}catch{}}
})();