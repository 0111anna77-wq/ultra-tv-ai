'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'../player.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
new Function(js);
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Function(match[1]);
const start=js.indexOf('function open(key,epId,probe=false){');
const end=js.indexOf('async function getHls(){',start);
assert(start>0&&end>start);
let opened=0, rendered=0,alerted=[];
const episode={id:'e4',season:1,number:4};
const db={initemProgress:{'show:S01E04':{
 seconds:840,duration:2600,confirmed:false,selection:'site',provider:'initem'
}}};
const fakeApp={getEntry:()=>({key:'show'}),epCode:e=>'S'+String(e.season).padStart(2,'0')+'E'+String(e.number).padStart(2,'0')};
const fn=new Function('app','episodesFor','newest','playableFor','close','render','state','window','URL',
 'let current=null;'+js.slice(start,end)+';return {open,initemEmbedUrl,get:()=>current};');
const api=fn(fakeApp,()=>[episode,{id:'e5',season:1,number:5}],eps=>eps[0],
 ()=>true,()=>{opened++},()=>{rendered++},()=>db,{alert:m=>alerted.push(m)},URL);
api.open('show','e4');
assert.equal(api.get().resumeProbe,null,'Ordinary opening must never apply a timestamp');
api.open('show','e4',true);
assert.equal(api.get().resumeProbe.seconds,840);
assert.equal(opened,2);
const normal=api.initemEmbedUrl('https://api.initem.ws/embed/imdb/tt1234567',episode,null);
assert.equal(new URL(normal).searchParams.get('t'),null,'Normal opening never sets t');
assert.equal(new URL(normal).searchParams.get('season'),'1');
assert.equal(new URL(normal).searchParams.get('episode'),'4');
const attempt=api.initemEmbedUrl('https://api.initem.ws/embed/imdb/tt1234567',episode,api.get().resumeProbe);
assert.equal(new URL(attempt).searchParams.get('t'),'840','One-click experiment may add t');
assert.equal(new URL(attempt).searchParams.get('translation'),null,'Never invent an unverified voice selector');
assert.equal(new URL(attempt).searchParams.get('voice'),null,'Never invent an unverified voice selector');
const wrongEpisode=api.initemEmbedUrl('https://api.initem.ws/embed/imdb/tt1234567',
 {id:'e5',season:1,number:5},api.get().resumeProbe);
assert.equal(new URL(wrongEpisode).searchParams.has('t'),false);
const wrongOrigin=api.initemEmbedUrl('https://example.invalid/embed',episode,api.get().resumeProbe);
assert.equal(new URL(wrongOrigin).searchParams.has('t'),false,'No time sent outside Initem');
api.open('show','e5',true);
assert.equal(alerted.length,1,'Missing saved episode gives a warning rather than a fake resume');
assert.equal(opened,2);
assert.equal(api.get().episodeId,'e4','Missing saved episode must not change playback');
assert(html.includes('class="recent-resume-probe"'),'Small icon exists next to the recent card');
assert(html.includes('data-resume-probe'),'Dedicated opt-in event exists');
console.log('PASS: ordinary open unchanged, explicit t probe, episode/origin safety and no voice guessing');
