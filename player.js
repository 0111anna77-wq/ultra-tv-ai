(()=>{
function playerModule(){
  'use strict';
  const app = window.UltraTV;
  if (!app) return;
  const $ = (s, root=document) => root.querySelector(s);
  const qsa = (selector, root=document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {LostFilm:'LostFilm',Dub:'Полноценный дубляж',Other:'Другая озвучка',Unknown:'Не указана'};
  let current = null, hls = null, lastProgress = 0, hlsPromise = null;
  function state(){ const s=app.state; if(!s.sources || typeof s.sources!=='object')s.sources={};if(!s.progress || typeof s.progress!=='object')s.progress={};return s;}
  function validUrl(raw){try{const u=new URL(String(raw).trim());if(u.protocol!=='https:'||u.username||u.password)throw Error();return u.href;}catch{throw Error('Нужна прямая HTTPS-ссылка на видео или страницу.');}}
  function kindOf(src){
    if(src.kind && src.kind!=='auto')return src.kind;
    const path=new URL(src.url).pathname.toLowerCase();
    if(path.endsWith('.m3u8'))return 'hls';
    if(/\.(mp4|webm|ogv|ogg|m4v)$/.test(path))return 'video';
    return 'page';
  }
  const preference = src => src.dub==='LostFilm'?0:src.dub==='Dub'?1:src.dub==='Other'?2:3;
  const episode = (key,id) => app.showInfo(key)?.episodes?.find(e=>String(e.id)===String(id));
  const keyOf = () => current && (current.key+':'+current.episodeId);
  function message(msg){const el=$('#ut-player-message');if(el)el.textContent=msg;}
  function stopMedia(){
    const v=$('#ut-video');
    if(v){try{v.pause();v.removeAttribute('src');v.load();}catch{}}
    if(hls){try{hls.destroy();}catch{}hls=null;}
  }
  function close(){
    if(!current)return;
    stopMedia();current=null;
    const root=$('#player-root');if(root)root.innerHTML='';
  }
  function list(){
    const s=state();const key=keyOf();
    return Array.isArray(s.sources[key])?s.sources[key]:[];
  }
  function render(autoPick){
    if(!current)return;
    stopMedia();
    const x=app.getEntry(current.key),ep=episode(current.key,current.episodeId);
    if(!x||!ep){close();return;}
    const rows=list().map((src,i)=>({...src,index:i})).sort((a,b)=>preference(a)-preference(b));
    const progress=state().progress[keyOf()]||0;
    const root=$('#player-root');
    root.innerHTML=`<div class="ut-overlay"><section class="ut-dialog" role="dialog" aria-modal="true" aria-label="Плеер серии">
      <div class="ut-heading"><div><div class="ut-kicker">ULTRA TV · ПРОСМОТР</div><h2>${esc(x.ru)} · ${esc(app.epCode(ep))}</h2><p>${esc(ep.name||'Эпизод')} · ${esc(ep.airdate||'')}</p></div>
        <button type="button" class="ut-close" data-ut-close aria-label="Закрыть плеер">✕</button></div>
      <div class="ut-layout">
        <div class="ut-view"><div id="ut-media" class="ut-media"><div class="ut-placeholder">▶<small>Выбери источник или добавь свою ссылку</small></div></div>
          <div id="ut-player-message" class="ut-message" aria-live="polite">${progress>=5?'Сохранённая позиция: '+Math.floor(progress/60)+' мин '+Math.floor(progress%60)+' сек.':'Поддерживаются MP4, WebM и HLS; внешние сайты открываются отдельно.'}</div>
          <p class="ut-footnote">Для воспроизведения нужен доступный источник с правом просмотра. Защищённые DRM-видео и сайты с запретом встраивания здесь не обходятся.</p></div>
        <div class="ut-controls"><h3>Источники этой серии</h3><div class="ut-sources">${rows.length?rows.map(src=>`<div class="ut-source"><button type="button" data-ut-source="${src.index}"><b>▶ ${esc(src.name||'Источник')}</b><small>${esc(labels[src.dub]||labels.Unknown)} · ${kindOf(src)==='page'?'Сайт':kindOf(src)==='hls'?'HLS':'Видео'}</small></button><button type="button" data-ut-delete="${src.index}" class="ut-delete" title="Удалить источник" aria-label="Удалить источник">✕</button></div>`).join(''):'<p class="ut-muted">Пока нет ссылок на просмотр этого эпизода.</p>'}</div>
          <details class="ut-add" ${rows.length?'':'open'}><summary>＋ Добавить источник</summary>
            <form id="ut-form"><label>Ссылка (HTTPS)<input id="ut-url" type="url" placeholder="https://.../video.mp4 или страница" required autocomplete="url"></label>
              <label>Название<input id="ut-name" maxlength="60" placeholder="Основной плеер"></label>
              <div class="ut-fields"><label>Озвучка<select id="ut-dub"><option value="LostFilm">LostFilm</option><option value="Dub">Полноценный дубляж</option><option value="Other">Другая</option><option value="Unknown">Не указана</option></select></label>
              <label>Тип ссылки<select id="ut-kind"><option value="auto">Определить автоматически</option><option value="video">MP4 / WebM</option><option value="hls">HLS (.m3u8)</option><option value="page">Веб-страница</option></select></label></div>
              <button type="submit" class="ut-save">Сохранить источник</button><div class="ut-muted">Ссылки сохраняются только в этом браузере и входят в резервную копию каталога.</div></form></details>
        </div>
      </div></section></div>`;
    root.querySelector('.ut-overlay').addEventListener('click',e=>{if(e.target.classList.contains('ut-overlay'))close();});
    root.querySelector('.ut-close')?.focus({preventScroll:true});
    if(autoPick && rows.length)selectSource(rows[0].index);
  }
  function open(key,epId){
    const ep=episode(key,epId);
    if(!ep){window.alert('Сначала дождись загрузки данных о серии.');return;}
    if(ep.airdate && ep.airdate>new Date().toISOString().slice(0,10)){window.alert('Серия ещё не вышла.');return;}
    close();
    current={key,episodeId:String(epId)};
    render(true);
  }
  async function getHls(){
    if(window.Hls)return window.Hls;
    if(hlsPromise)return hlsPromise;
    hlsPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
      script.async=true;
      script.onload=()=>window.Hls?resolve(window.Hls):reject(Error('Не удалось загрузить HLS'));
      script.onerror=()=>reject(Error('Скрипт HLS недоступен'));
      document.head.appendChild(script);
    }).catch(err=>{hlsPromise=null;throw err;});
    return hlsPromise;
  }
  async function selectSource(index){
    if(!current)return;
    const src=list()[index];if(!src)return;
    stopMedia();
    current.selected=index;
    const token=current, type=kindOf(src), media=$('#ut-media');
    qsa('.ut-source button[data-ut-source]').forEach(el=>el.classList.toggle('ut-active',Number(el.dataset.utSource)===index));
    if(type==='page'){
      media.innerHTML=`<div class="ut-placeholder">↗<small>Это веб-страница. Она откроется в отдельной вкладке, поскольку сторонние плееры не всегда разрешают встраивание.</small><a class="ut-link" target="_blank" rel="noopener noreferrer" href="${esc(src.url)}">Открыть сайт с видео ↗</a></div>`;
      message('Выбран источник: '+src.name+'. Озвучка: '+(labels[src.dub]||labels.Unknown));
      return;
    }
    media.innerHTML='<video id="ut-video" controls playsinline preload="metadata" aria-label="Видеоплеер Ultra TV"></video>';
    const video=$('#ut-video');
    video.addEventListener('loadedmetadata',()=>{
      const p=Number(state().progress[keyOf()]||0);
      if(Number.isFinite(video.duration)&&p>5&&p<video.duration-8){try{video.currentTime=p;}catch{}}
    });
    video.addEventListener('timeupdate',()=>{
      if(!current||!Number.isFinite(video.currentTime)||video.currentTime<0||Date.now()-lastProgress<3000)return;
      lastProgress=Date.now();state().progress[keyOf()]=Math.round(video.currentTime);app.persist();
    });
    video.addEventListener('pause',()=>{
      if(!current||!Number.isFinite(video.currentTime))return;
      state().progress[keyOf()]=Math.round(video.currentTime);app.persist();
    });
    video.addEventListener('ended',()=>{
      if(!current)return;
      state().watched[keyOf()]=true;state().progress[keyOf()]=0;app.persist();app.draw();
      message('Серия отмечена как просмотренная.');
    });
    video.addEventListener('error',()=>{
      message('Не удалось воспроизвести поток. Проверь ссылку, формат и разрешения сервера (CORS), либо открой его во внешнем приложении.');
    });
    try{
      if(type==='hls'){
        const Hls=await getHls();
        if(!current||current!==token||current.selected!==index||!$('#ut-video'))return;
        if(Hls.isSupported()){
          hls=new Hls({enableWorker:true});
          hls.on(Hls.Events.ERROR,(_evt,data)=>{if(data.fatal)message('Ошибка HLS-потока: '+(data.details||'источник недоступен'));});
          hls.loadSource(src.url);hls.attachMedia(video);
        }else if(video.canPlayType('application/vnd.apple.mpegurl'))video.src=src.url;
        else message('Этот браузер не поддерживает HLS. Открой поток во внешнем плеере.');
      }else video.src=src.url;
      if(!current||current!==token)return;
      message('Источник: '+(src.name||'Основной')+' · '+(labels[src.dub]||labels.Unknown));
      const status=$('#ut-player-message');
      const a=document.createElement('a');a.href=src.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Открыть поток ↗';a.style.marginLeft='12px';status?.appendChild(a);
    }catch(err){if(!current||current!==token)return;message(err.message+'. Можно попробовать другой источник или открыть видео напрямую.');}
  }
  function add(){
    if(!current)return;
    let url;
    try{url=validUrl($('#ut-url').value);}catch(err){window.alert(err.message);return;}
    const s=state(),key=keyOf(),sources=list();
    if(sources.length>=15){window.alert('Для одной серии можно сохранить до 15 источников.');return;}
    const dub=$('#ut-dub').value,kind=$('#ut-kind').value;
    const name=$('#ut-name').value.trim().slice(0,60)||'Источник '+(sources.length+1);
    s.sources[key]=[...sources,{url,name,dub,kind}];
    if(dub==='LostFilm')s.dubs[key]='LostFilm';
    if(dub==='Dub')s.dubs[key]='Дубляж';
    app.persist();render(true);
  }
  document.addEventListener('click',e=>{
    const play=e.target.closest('[data-player-key]');
    if(play){e.preventDefault();open(play.dataset.playerKey,play.dataset.playerEpisode);return;}
    if(!current)return;
    const closer=e.target.closest('[data-ut-close]');if(closer){close();return;}
    const source=e.target.closest('[data-ut-source]');if(source){selectSource(Number(source.dataset.utSource));return;}
    const del=e.target.closest('[data-ut-delete]');
    if(del && window.confirm('Удалить сохранённую ссылку на эту серию?')){
      const s=state(),key=keyOf(),i=Number(del.dataset.utDelete);
      s.sources[key]=list().filter((_,j)=>j!==i);
      app.persist();render(false);
    }
  });
  document.addEventListener('submit',e=>{if(e.target?.id==='ut-form'){e.preventDefault();add();}});
  document.addEventListener('keydown',e=>{
    if(!current)return;
    if(e.key==='Escape'){e.preventDefault();close();return;}
    const target=document.activeElement;
    if(['INPUT','SELECT','TEXTAREA'].includes(target?.tagName))return;
    const video=$('#ut-video');
    if(target===video){
      if(e.key==='ArrowRight' || e.key==='ArrowLeft'){e.preventDefault();video.currentTime=Math.max(0,video.currentTime+(e.key==='ArrowRight'?10:-10));return;}
      if(e.key===' '){e.preventDefault();video.paused?video.play().catch(()=>{}):video.pause();return;}
      if(e.key.toLowerCase()==='f'){e.preventDefault();video.requestFullscreen?.().catch(()=>{});return;}
    }
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key) || !target)return;
    const focusable=[...$('#player-root').querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),summary,video')].filter(el=>el.getClientRects().length);
    const from=target.getBoundingClientRect();let best=null,score=Infinity;
    for(const el of focusable){
      if(el===target)continue;
      const r=el.getBoundingClientRect(),dx=(r.left+r.width/2)-(from.left+from.width/2),dy=(r.top+r.height/2)-(from.top+from.height/2);
      if(e.key==='ArrowRight'&&dx<=6 || e.key==='ArrowLeft'&&dx>=-6 || e.key==='ArrowDown'&&dy<=6 || e.key==='ArrowUp'&&dy>=-6)continue;
      const horiz=e.key==='ArrowLeft'||e.key==='ArrowRight',val=(horiz?Math.abs(dx):Math.abs(dy))+(horiz?Math.abs(dy):Math.abs(dx))*2;
      if(val<score){score=val;best=el;}
    }
    if(best){e.preventDefault();best.focus({preventScroll:true});best.scrollIntoView({block:'nearest'});}
  });
  window.UltraTVPlayer={open,close};
}
playerModule();
})();
