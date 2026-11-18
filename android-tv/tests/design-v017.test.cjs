'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/tv.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/tv.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/tv.css'),'utf8');
const start=source.indexOf('function newEpisode(x){');
const end=source.indexOf('function dateRu(value){',start);
assert(start>0&&end>start,'New badges/rail functions exist');
const progress={example:{season:1,episode:2,seconds:240,duration:960,openedAt:1000}};
const S={releases:[],tracked:{},progress};
const esc=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const norm=v=>String(v||'').toLowerCase().replace(/[^a-zа-яё0-9]/g,'');
const getProgress=key=>S.progress[key]||null;
const poster=x=>'https://example.test/'+x.key+'.jpg';
const meta=()=>({});
const category=()=>'Драма';
const episodeCode=(s,e)=>'S'+String(s||1).padStart(2,'0')+'E'+String(e||1).padStart(2,'0');
const {newEpisode,progressPercent,resumeCard,thumb,home}=
 new Function('S','norm','getProgress','poster','resumeImage','validLandscape','meta','category','episodeCode','esc',
 source.slice(start,end)+';return {newEpisode,progressPercent,resumeCard,thumb,home}')(
 S,norm,getProgress,poster,poster,()=>false,meta,category,episodeCode,esc);
const show={key:'example',ru:'Сериал',en:'Example',genres:['drama'],year:2026};
assert.equal(progressPercent('example'),25);
const markup=resumeCard(show);
assert.match(markup,/S01E02/);
assert.match(markup,/width:25\.0%/);
assert.doesNotMatch(markup,/0:04|4:00|\b240\b|\b960\b|≈/,'No inaccurate clock on home');
assert.match(markup,/data-act="continue"/,'Resume action preserved');
S.progress.example.duration=0;
assert.equal(progressPercent('example'),0,'Unknown duration never invents percent');
S.progress.example.duration=960;
S.releases=[{seriesEn:'Example',season:1,episode:3,published:new Date().toISOString()}];
assert.equal(newEpisode(show).episode,3);
assert.match(thumb(show),/Новая серия/);
S.progress.example.episode=3;
assert.equal(newEpisode(show),null,'No new badge for current episode');
S.progress.example.episode=2;
S.releases[0].published=new Date(Date.now()-20*86400000).toISOString();
assert.equal(newEpisode(show),null,'Old announcements not presented as new');
S.releases[0].published=new Date().toISOString();
S.releases[0].seriesEn='Wrong show';
assert.equal(newEpisode(show),null,'Different series never triggers badge');
S.releases[0].seriesEn='Example';
S.tracked.example=false;
assert.equal(newEpisode(show),null,'Untracked series never gets badge');
assert.match(html,/\/uvideo-tv-logo\.png/);
assert.match(html,/Главная.*Сериалы.*Новинки.*Поиск.*Настройки/s);
assert.match(css,/\.resume-track/);
assert.match(css,/\.new-episode-badge/);
assert.doesNotMatch(source.slice(start,end),/fetch\(/,'No new network calls in UI');
assert.doesNotMatch(source.slice(start,end),/\bfilter:\s*blur/,'No blur GPU cost');
assert.doesNotMatch(source.slice(source.indexOf('function home(){'),end),/Новые серии(?!.*?Новая серия)/,'No separate new-episodes rail');

// My Series must wrap into actual vertical rows while Continue stays a carousel.
assert.match(source, /strip poster-strip poster-grid/);
assert.match(css, /\.rail-my-series \.poster-grid\s*\{[\s\S]*?display:grid/);
assert.match(css, /grid-template-columns:repeat\(auto-fill/);
assert.match(css, /\.rail-my-series \.poster-grid\s*\{[\s\S]*?overflow:visible/);
assert.match(source, /Continue Watching deliberately retains horizontal scrolling/);
assert.match(source, /strip&&!strip\.classList\.contains\('poster-grid'\)/);
// Fake DOM rails demonstrate focus rows are registered separately for the grid.
const focusStart=source.indexOf('function buildFocusRows(){');
const focusEnd=source.indexOf('function moveFocus(from,key){',focusStart);
assert(focusStart>=0&&focusEnd>focusStart);
const mk=(top)=>({offsetWidth:200,offsetHeight:300,disabled:false,
  getBoundingClientRect:()=>({top})});
const nav=mk(0), resumeCards=[mk(100),mk(100)], sort=mk(450);
const gridCards=[mk(520),mk(520),mk(830),mk(830),mk(1140)];
const resumeRail={
  classList:{contains:()=>false},
  querySelectorAll:s=>s==='.strip .card'?resumeCards:[]
};
const myRail={
  classList:{contains:s=>s==='rail-my-series'},
  querySelectorAll:s=>s==='.sort-cycle'?[sort]:s==='.poster-grid .card'?gridCards:[]
};
const fakeRoot={querySelectorAll:s=>s==='.rail'?[resumeRail,myRail]:[]};
const fakeDocument={querySelectorAll:s=>s==='#nav button'?[nav]:[]};
const navTest=new Function('root','document',
 'const S={page:"home"}; let focusRows=[],focusSlots=new WeakMap();'+
 source.slice(focusStart,focusEnd)+
 ';buildFocusRows();return focusRows.map(x=>[x.id,x.items.length]);')(fakeRoot,fakeDocument);
assert.deepEqual(navTest,[['nav',1],['home:rail:0',2],['home:sort',1],
 ['home:grid:0',2],['home:grid:1',2],['home:grid:2',1]]);
console.log('PASS v0.17 wrapped My Series layout and D-pad row navigation');


// CSS-only browsing lift: hover for mouse, focus for TV remote, no new listeners.
assert.match(css,/v0\.17: restrained hover\/focus lift/);
assert.match(css,/@media \(hover:hover\) and \(pointer:fine\)/);
assert.match(css,/\.tv-home \.poster-card:hover/);
assert.match(css,/\.tv-home \.resume-card:hover/);
assert.match(css,/#content \.cards-grid \.card:hover/);
assert.match(css,/#nav button:hover/);
assert.match(css,/#nav button:focus/);
assert.match(css,/#content \.cards-grid \.card:focus/);
assert.match(css,/prefers-reduced-motion:reduce/);
const liftStart=css.indexOf('/* v0.17: restrained hover/focus lift');
assert(liftStart>0);
const lift=css.slice(liftStart);
assert.doesNotMatch(lift,/\.detail(?:[ .:#>]|$)|\.player-screen(?:[ .:#>]|$)/,
  'Hover lift must never affect open series detail or player controls');
assert.doesNotMatch(lift,/filter:blur\(|backdrop-filter:/,
  'TV focus should not add GPU-heavy blur');
console.log('PASS TV v0.17 mouse hover and D-pad focus lift, without touching details/player');


// TVmaze offers genuine widescreen "background" assets, not upscaled posters.
const landscapeStart=source.indexOf('function validLandscape(url){');
const landscapeEnd=source.indexOf('const imdb=',landscapeStart);
assert(landscapeStart>0&&landscapeEnd>landscapeStart);
const {validLandscape,pickLandscape,resumeImage}=new Function('meta','poster',
  source.slice(landscapeStart,landscapeEnd)+
  ';return {validLandscape,pickLandscape,resumeImage};')(
  key=>S.meta?.[key]||{},poster);
const good='https://static.tvmaze.com/uploads/images/original_untouched/459/1149869.jpg';
const better='https://static.tvmaze.com/uploads/images/original_untouched/461/1156125.jpg';
assert.equal(validLandscape(good),true);
assert.equal(validLandscape('javascript:alert(1)'),false);
assert.equal(validLandscape('https://not-tvmaze.example/covers/a.jpg'),false);
assert.equal(pickLandscape([{type:'poster',resolutions:{original:{url:good}}}]),'');
assert.equal(pickLandscape([{type:'background',resolutions:{original:{url:good}}}]),good);
assert.equal(pickLandscape([{type:'background',main:false,resolutions:{original:{url:good}}},
  {type:'background',main:true,resolutions:{original:{url:better}}}]),better);
assert.equal(pickLandscape(null),'');
S.meta={};
assert.equal(resumeImage({key:'example'}),poster({key:'example'}));
S.meta.example={backdrop:good};
assert.equal(resumeImage({key:'example'}),good);
assert.match(css,/v0\.17 ambient screen/);
assert.match(css,/background-image:[\s\S]*repeating-linear-gradient/);
assert.match(css,/\.resume-art img\[data-landscape-key\]/);
const ambient=css.slice(css.indexOf('v0.17 ambient screen'));
assert.doesNotMatch(ambient,/filter:blur\(|backdrop-filter:|animation:/);
const loaderStart=source.indexOf('const landscapeRequests=new Set();');
const loaderEnd=source.indexOf('async function loadEpisodes(key){',loaderStart);
assert(loaderStart>0&&loaderEnd>loaderStart);
const loader=source.slice(loaderStart,loaderEnd);
assert.match(loader,/sort\(\(a,b\)=>Number\(b\[1\]\.openedAt\)/);
assert.match(loader,/\.slice\(0,12\)/);
assert.match(loader,/backdropCheckedAt/);
assert.match(loader,/https:\/\/api\.tvmaze\.com\/shows\//);
assert.match(loader,/new Promise\(resolve=>setTimeout\(resolve,850\)\)/);
assert.match(source,/loadPosters\(manual\)\.then\(loadResumeBackdrops\)/);
assert.match(source,/root\.addEventListener\('error'/);
assert.match(source,/if\(page==='home'\)loadResumeBackdrops\(\)/);
console.log('PASS TV v0.17 landscape selection, cache wiring and static ambient background');


// v0.17 approved show-view player layout: fullscreen remains above the video,
// aligned opposite the heading; source/season/episode selectors remain functional.
const playerStart=source.indexOf('function player(){');
const playerEnd=source.indexOf('function render(){',playerStart);
assert(playerStart>0&&playerEnd>playerStart);
const showForPlayer={key:'example',ru:'Пример сериала',en:'Example',genres:[],year:2026};
const playerMeta={episodes:[
 {season:1,number:1},{season:1,number:2},{season:1,number:3},
 {season:1,number:4},{season:1,number:5},{season:2,number:1}
]};
const playerState={
 show:'example',season:1,episode:2,source:0,
 opts:{episodes:{}}
};
const playerScreen=new Function('S','item','meta','availableSources',
 'sourceMedia','esc','playerProgressLabel','catalog',
 source.slice(playerStart,playerEnd)+';return player();')(
 playerState,()=>showForPlayer,()=>playerMeta,
 ()=>[{name:'Initem · сезоны и озвучки',url:'https://api.initem.ws/embed/imdb/tt123456'}],
 ()=>'<iframe id="test-video"></iframe>',esc,()=>'',()=>'<div>catalog</div>');
assert.match(playerScreen,/<div class="player-heading"><h1>Пример сериала · просмотр<\/h1>/);
assert.match(playerScreen,/<button class="player-fullscreen" data-act="cursor"/);
assert.doesNotMatch(playerScreen,/data-act="back"/);
assert.match(playerScreen,/class="player-source-list"/);
assert.match(playerScreen,/class="player-season-list"/);
assert.match(playerScreen,/class="player-episode-grid"/);
assert.match(playerScreen,/data-act="episode" data-episode="5"/);
assert.match(playerScreen,/data-act="season" data-season="2"/);
assert.match(playerScreen,/data-act="frame"/);
assert.match(css,/\.player-side \.player-episode-grid button\s*\{[^}]*aspect-ratio:1\/1/s);
assert.match(css,/\.player-main \.player-heading h1/);
assert.match(css,/\.player-main \.player-fullscreen/);
assert.match(html,/<span class="brand-wordmark">Видео <b>TV<\/b><\/span>/);
assert.doesNotMatch(html,/<span class="brand-wordmark">UВидео/);
assert.match(source,/add\('player:toolbar',root.querySelectorAll\('\.player-main \.player-heading/);
assert.match(source,/add\('player:seasons',root.querySelectorAll\('\.player-season-list button'/);
assert.match(source,/episodeRows\.forEach\(\(row,i\)=>add\('player:episode:'/);
console.log('PASS TV v0.17 compact player, fullscreen header, episodes and logo');

console.log('PASS TV v0.17 UI: badge provenance, progress bars, no homepage clock, unchanged sections, low-cost render');