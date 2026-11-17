'use strict';
// Initem event diagnostics: trusted origin is required; a wrong iframe source
// is COUNTED for diagnosis but must never be allowed to modify watch progress.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/tv.js'),'utf8');
const start=src.indexOf('function handleInitemMessage(event){');
const end=src.indexOf("window.addEventListener('message',handleInitemMessage,false);",start);
assert(start>0&&end>start);
const frameWindow={};
const frame={contentWindow:frameWindow,getAttribute:()=> 'https://api.initem.ws/embed/imdb/tt1234567'};
const S={page:'player',show:'test',source:0,season:1,episode:1,
 initemAdPlaying:false,initemLastWrite:0,progress:{},progressDraft:{}};
const $=()=>frame,item=()=>({key:'test'}),availableSources=()=>[{platform:'initem'}];
const getProgress=k=>S.progress[k]||null;
const setProgress=(k,v)=>S.progress[k]={...S.progress[k],...v};
const handle=new Function('$','S','item','availableSources','getProgress','setProgress',
 src.slice(start,end)+';return handleInitemMessage;')($,S,item,availableSources,getProgress,setProgress);
const event=(type,payload={},source=frameWindow,origin='https://api.initem.ws')=>({
 data:{event:type,...payload},source,origin
});
assert.equal(handle(event('changeEpisode',{season:1,episode:4})),true);
assert.equal(handle(event('viewProgress',{time:600,duration:2400},{})),false);
assert.equal(getProgress('test').seconds,0,'Wrong iframe must not update playback time');
assert.equal(handle(event('viewProgress',{time:601,duration:2400})),true);
assert.equal(handle(event('viewProgress',{time:2,duration:0})),false);
const d=S.initemDiag;
assert.equal(d.received,4);
assert.equal(d.episode,1);
assert.equal(d.progress,1);
assert.equal(d.wrongFrame,1);
assert.equal(d.invalidTime,1);
const before={...d};
assert.equal(handle(event('viewProgress',{time:170,duration:4000},frameWindow,'https://evil.example')),false);
assert.deepEqual(S.initemDiag,before,'Untrusted origin should not affect diagnostics');
assert.equal(getProgress('test').seconds,601,'Last valid trusted time is retained');
console.log('PASS Initem diagnostics: accepted/rejected time, wrong frame, invalid time, untrusted origin');
