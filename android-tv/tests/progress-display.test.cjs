'use strict';
// Offline regression checks for default S01E01 resume badge and live time label.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/tv.js'),'utf8');
const start=src.indexOf('const episodeCode=');
const end=src.indexOf('function progressDraft(key){',start);
assert(start>0&&end>start,'Progress functions must exist');
const S={page:'player',show:'test',progress:{}};
const label={textContent:''};
const $=selector=>selector==='#player-progress'?label:null;
const save=()=>{};
const getProgress=key=>S.progress[key]||null;
const {setProgress,progressLabel,playerProgressLabel}=new Function('S','$','save','getProgress',
 src.slice(start,end)+';return {setProgress,progressLabel,playerProgressLabel}')
 (S,$,save,getProgress);
setProgress('test',{season:1,episode:1,openedAt:100,kind:'initem',confirmed:false});
assert.equal(progressLabel('test'),'S01E01','Default first episode must be visible on resume badge');
assert.match(label.textContent,/S01E01.*пока не получено/);
setProgress('test',{seconds:125,duration:2600});
assert.match(label.textContent,/S01E01.*2:05 \/ 43:20/);
assert.match(label.textContent,/не подтверждён/);
assert.equal(progressLabel('test'),'S01E01','Do not mislabel unconfirmed episode time on home');
setProgress('test',{confirmed:true});
assert.equal(progressLabel('test'),'S01E01 · 2:05');
assert.match(playerProgressLabel('test'),/2:05 \/ 43:20/);
const oldText=label.textContent;
setProgress('other',{season:2,episode:1,openedAt:200});
assert.equal(label.textContent,oldText,'Other shows must not change active player label');
S.page='detail';
setProgress('test',{seconds:135});
assert.equal(label.textContent,oldText,'Only the active player screen updates live');
console.log('PASS progress display: default S01E01, live seconds, confirmation, isolation');
