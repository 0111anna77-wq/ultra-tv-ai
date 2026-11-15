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
 }catch(e){console.log('FAIL',e.stack);process.exitCode=1}
 finally{try{ws?.close()}catch{}child.kill();await pause(500);try{fs.rmSync(profile,{recursive:true,force:true})}catch{}}
})();