'use strict';
// Offline tests for the site's Initem postMessage capture. No video downloads.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../player.js'),'utf8');
const start=src.indexOf('function activeInitemFrame(){');
const end=src.indexOf("window.addEventListener('message',handleInitemMessage,false);",start);
assert(start>0&&end>start,'The site must have an Initem message handler');
new Function(src); // Parse whole website player before testing the handler.
const sent=[];
const frameWindow={postMessage:(data,origin)=>sent.push({data,origin})};
const frame={contentWindow:frameWindow,getAttribute:()=> 'https://api.initem.ws/embed/imdb/tt1234567?season=1&episode=4'};
const dom={};
for(const id of ['#ut-initem-live','#ut-initem-diagnostics','#ut-initem-counters','#ut-initem-probe-status',
 '.ut-heading h2','.ut-heading p','#ut-bookmark-time','#ut-bookmark-status'])
 dom[id]={textContent:'',value:'',hidden:false};
const $=selector=>selector==='#ut-media iframe'?frame:dom[selector]||null;
const qsa=()=>[];
const data={initemProgress:{},bookmarks:{},initemDiag:{}};
const state=()=>data;
let persistCount=0;
const opened=[];
const app={
 persist:()=>{persistCount++},
 recordOpen:(key,ep)=>opened.push(key+':'+ep.id),
 getEntry:()=>({ru:'Тестовый сериал'}),
 epCode:ep=>'S'+String(ep.season).padStart(2,'0')+'E'+String(ep.number).padStart(2,'0')
};
const episodesFor=()=>[1,4,5].map(number=>({id:'e'+number,season:1,number,name:'Серия '+number}));
const current={key:'test',activeSource:{platform:'initem'},episodeId:'e4'};
const bookmarkKey=()=>{
 const ep=episodesFor().find(ep=>ep.id===current.episodeId);
 return ep?'test:'+app.epCode(ep):null;
};
const prettyTime=seconds=>Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');
const factory=new Function('$','qsa','app','state','episodesFor','bookmarkKey','prettyTime','current','INITEM_ORIGIN','initemEvents','URL','setTimeout',
 'let initemSession=null;'+src.slice(start,end)+
 ';return {handleInitemMessage,initemSessionStart,flushInitemTime,probeInitemTime,peek:()=>initemSession};');
const t=factory($,qsa,app,state,episodesFor,bookmarkKey,prettyTime,current,
 'https://api.initem.ws',new Set(['changeEpisode','viewProgress','startWatching','ended','playerReady','adStart','adStop']),URL,()=>{});
const ev=(data,source=frameWindow,origin='https://api.initem.ws')=>({data,source,origin});
t.initemSessionStart();
assert.equal(t.handleInitemMessage(ev({event:'viewProgress',time:125,duration:2400})),true);
assert.deepEqual(data.initemProgress,{},'Unconfirmed episode must not be guessed from player clock');
assert.equal(t.handleInitemMessage(ev({event:'changeEpisode',season:1,episode:4})),true);
assert.equal(t.handleInitemMessage(ev({event:'viewProgress',time:601,duration:2400})),true);
assert.equal(data.initemProgress['test:S01E04'].seconds,601);
assert.match(dom['#ut-initem-live'].textContent,/S01E04.*10:01/);
assert.equal(t.handleInitemMessage(ev({event:'viewProgress',time:1800,duration:2400},{})),false);
assert.equal(data.initemProgress['test:S01E04'].seconds,601,'Wrong iframe may not overwrite progress');
assert.equal(t.handleInitemMessage(ev({event:'changeEpisode',season:1,episode:5},frameWindow,'https://evil.example')),false);
assert.equal(current.episodeId,'e4','Untrusted origin may not change episode');
assert.equal(t.handleInitemMessage(ev({event:'viewProgress',time:Infinity,duration:2400})),false);
assert.equal(t.peek().invalid,1);
assert.equal(t.handleInitemMessage(ev({event:'adStart'})),true);
assert.equal(t.handleInitemMessage(ev({event:'viewProgress',time:10,duration:30})),true);
assert.equal(data.initemProgress['test:S01E04'].seconds,601,'Ad time must not overwrite episode time');
assert.equal(t.handleInitemMessage(ev({event:'adStop'})),true);
assert.equal(t.handleInitemMessage(ev({event:'changeEpisode',season:1,episode:5})),true);
assert.equal(t.handleInitemMessage(ev({event:'viewProgress',time:75,duration:2100})),true);
assert.equal(data.initemProgress['test:S01E04'].seconds,601);
assert.equal(data.initemProgress['test:S01E05'].seconds,75);
assert.equal(data.initemProgress['test:S01E05'].at,t.peek().sampledAt,
 'Timestamp must correspond to the last player signal');
const lastSampleTime=data.initemProgress['test:S01E05'].at;
t.flushInitemTime(true);
assert.equal(data.initemProgress['test:S01E05'].at,lastSampleTime,
 'Leaving player cannot make an old sample appear fresh');

assert.equal(persistCount,2);
assert.equal(t.peek().wrongFrame,1);
assert.ok(opened.includes('test:e5'));
assert.equal(t.handleInitemMessage(ev({event:'viewProgress',time:180,duration:2200},frameWindow,'https://wrong-provider.example')),false);
assert.equal(t.peek().otherOrigin,2,'Count wrong-origin messages without accepting time');
assert.equal(data.initemProgress['test:S01E05'].seconds,75,'Untrusted origin must not overwrite history');
const persistStart=src.indexOf('function persistInitemDiag(){');
const persistEnd=src.indexOf('function initemSessionStart(){',persistStart);
assert.ok(persistStart>0&&persistEnd>persistStart);
const diagStore=new Function('current','app','state','initemSession',
 src.slice(persistStart,persistEnd)+';return persistInitemDiag;')
 (current,app,state,t.peek());
diagStore();
assert.equal(data.initemDiag.test.otherOrigin,2);
assert.equal(data.initemDiag.test.times,3);
assert.equal(data.initemDiag.test.confirmed,true);
assert.equal(t.handleInitemMessage(ev({event:'time',answer:150})),false,'Do not accept unsolicited time reply');
assert.equal(t.probeInitemTime(),true);
assert.deepEqual(sent,[
 {data:{api:'time'},origin:'https://api.initem.ws'},
 {data:{api:'duration'},origin:'https://api.initem.ws'}],
 'Only two read-only queries to exact trusted origin');
assert.equal(t.handleInitemMessage(ev({event:'time',answer:500},frameWindow,'https://evil.example')),false);
assert.equal(t.handleInitemMessage(ev({event:'time',answer:500},{})),false);
assert.equal(t.handleInitemMessage(ev({event:'time',answer:110})),true);
assert.equal(t.handleInitemMessage(ev({event:'duration',answer:2100})),true);
assert.equal(data.initemProgress['test:S01E05'].seconds,110,'Confirmed series + both answers can save progress');
assert.equal(t.peek().probeReplies,2);
assert.match(dom['#ut-initem-probe-status'].textContent,/1:50.*35:00/);
assert.equal(t.handleInitemMessage(ev({event:'time',answer:1200})),false,
 'Unsolicited replies after probe completion are ignored');
diagStore();
assert.equal(data.initemDiag.test.probeSent,1);
assert.equal(data.initemDiag.test.probeReplies,2);
t.initemSessionStart();
assert.equal(t.probeInitemTime(),true);
assert.equal(t.handleInitemMessage(ev({event:'time',answer:240})),true);
assert.equal(t.handleInitemMessage(ev({event:'duration',answer:2200})),true);
assert.equal(data.initemProgress['test:S01E05'].seconds,110,
 'No guessed episode: query replies alone must not overwrite progress');

const bookmarkStart=src.indexOf('function bookmarkBlock(){');
const bookmarkEnd=src.indexOf('function message(msg)',bookmarkStart);
assert.ok(bookmarkStart>0&&bookmarkEnd>bookmarkStart);
const esc=v=>String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
const bookmarkBlock=new Function('state','bookmarkKey','prettyTime','esc',
  src.slice(bookmarkStart,bookmarkEnd)+';return bookmarkBlock;')
  (state,bookmarkKey,prettyTime,esc);
const preview=bookmarkBlock();
assert.match(preview,/Последний сигнал Initem: ≈1:50/);
assert.match(preview,/value=""/,'Approximate times must not auto-fill the precise manual input');
data.bookmarks['test:S01E05']={seconds:143,manual:true};
const manualPreview=bookmarkBlock();
assert.match(manualPreview,/value="2:23"/);
assert.match(manualPreview,/Точная отметка вручную: 2:23/);
console.log('PASS website Initem: trusted events, approximate sample labels, manual precision, no fake fresh time');

