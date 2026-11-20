// Ultra TV personal library synchronization, Cloudflare Pages Functions + D1.
// One private library, separate owner/browser and paired-TV tokens.
// Never put ULTRA_SYNC_SETUP_SECRET in the repository or in a public asset.
const headers={"content-type":"application/json; charset=utf-8","cache-control":"private, no-store","x-content-type-options":"nosniff"};
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
const now=()=>Date.now();
const bytes=length=>{const a=new Uint8Array(length);crypto.getRandomValues(a);return a};
const hex=arr=>[...arr].map(x=>x.toString(16).padStart(2,"0")).join("");
const sha256=async value=>hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))));
async function sameSecret(a,b){
  if(typeof a!=="string"||typeof b!=="string"||a.length<24||b.length<24)return false;
  const x=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(a)));
  const y=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(b)));
  let n=0;for(let i=0;i<x.length;i++)n|=x[i]^y[i];return n===0;
}
async function body(request){
  if((request.headers.get("content-type")||"").split(";")[0].trim()!=="application/json")throw Error("Ожидается JSON.");
  if(Number(request.headers.get("content-length"))>25000)throw Error("Слишком большой запрос.");
  const raw=await request.text();if(raw.length>25000)throw Error("Слишком большой запрос.");
  const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error("Некорректные данные.");
  return parsed;
}
async function createDevice(db,role){
  const token=hex(bytes(32));
  const hash=await sha256(token);
  const id=crypto.randomUUID();
  await db.prepare("INSERT INTO sync_devices(id,token_hash,role,created_at,last_seen,revoked) VALUES(?,?,?,?,?,0)")
    .bind(id,hash,role,now(),now()).run();
  return {token,deviceId:id,role};
}
async function authorized(db,request){
  const value=request.headers.get("authorization")||"";
  if(!/^Bearer [0-9a-f]{64}$/i.test(value))return null;
  const hash=await sha256(value.slice(7));
  const row=await db.prepare("SELECT id,role FROM sync_devices WHERE token_hash=? AND revoked=0").bind(hash).first();
  if(!row)return null;
  return row;
}
function cleanShow(id,raw){
  if(typeof id!=="string"||id.length>85||!/^(?:tvmaze:[1-9]\d{0,10}|imdb:tt\d{5,12}|key:[a-zA-Z0-9_-]{1,70})$/.test(id))throw Error("Недопустимый идентификатор.");
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Нет карточки сериала.");
  const t=(x,max=140)=>typeof x==="string"?x.trim().slice(0,max):"";
  const key=t(raw.key,80),ru=t(raw.ru,160),en=t(raw.en,160);
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(key)||!ru||!en)throw Error("Некорректное название или ключ.");
  const genres=Array.isArray(raw.genres)?raw.genres.filter(x=>typeof x==="string"&&/^[a-z]{2,20}$/.test(x)).slice(0,6):[];
  const year=Number.isInteger(Number(raw.year))&&Number(raw.year)>=1900&&Number(raw.year)<=2100?Number(raw.year):null;
  const tvmazeId=Number.isSafeInteger(Number(raw.tvmazeId))&&Number(raw.tvmazeId)>0?Number(raw.tvmazeId):null;
  const imdbId=/^tt\d{5,12}$/.test(raw.imdbId||"")?raw.imdbId:null;
  // We only share metadata, never stream credentials, player links, or localStorage.
  return {key,ru,en,genres,year,tvmazeId,imdbId};
}
async function throttlePair(db,request,secret){
  const rawIp=request.headers.get("CF-Connecting-IP")||"unknown";
  const epoch=Math.floor(now()/300000);
  const hash=await sha256(rawIp+"|"+epoch+"|"+secret);
  const result=await db.prepare("INSERT INTO sync_pair_attempts(bucket,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1")
    .bind(hash,now()+360000).run();
  if(!result.success)throw Error("Недоступна защита кода.");
  const row=await db.prepare("SELECT attempts FROM sync_pair_attempts WHERE bucket=?").bind(hash).first();
  return Number(row?.attempts)<=10;
}
export async function onRequest({request,env}){
  const path=new URL(request.url).pathname.replace(/\/+$/,"");
  const method=request.method.toUpperCase();
  if(method==="OPTIONS")return reply({error:"Не допускаются сторонние запросы."},405);
  // Requests are same-origin only; TV WebView loads the same Pages hostname.
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin)return reply({error:"Недопустимый источник."},403);
  if(!path.startsWith("/api/sync/"))return reply({error:"Не найдено."},404);
  const action=path.slice("/api/sync/".length);
  const db=env.ULTRA_SYNC_DB;
  if(!db){
    if(action==="status")return reply({ready:false,reason:"missing-d1-binding"});
    return reply({error:"Облачная база ещё не подключена."},503);
  }
  try {
    if(action==="status"&&method==="GET"){
      try {await db.prepare("SELECT id FROM sync_devices LIMIT 1").first();}
      catch{return reply({ready:false,reason:"schema-not-migrated"});}
      return reply({ready:true,setupRequired:!env.ULTRA_SYNC_SETUP_SECRET});
    }
    if(action==="bootstrap"&&method==="POST"){
      if(!env.ULTRA_SYNC_SETUP_SECRET)return reply({error:"Сначала задайте секретный ключ в Cloudflare."},503);
      const input=await body(request);
      if(!(await sameSecret(input.setupKey,env.ULTRA_SYNC_SETUP_SECRET)))return reply({error:"Неверный ключ владельца."},403);
      return reply(await createDevice(db,"owner"),201);
    }
    if(action==="pair/redeem"&&method==="POST"){
      if(!env.ULTRA_SYNC_SETUP_SECRET)return reply({error:"Синхронизация не настроена."},503);
      if(!(await throttlePair(db,request,env.ULTRA_SYNC_SETUP_SECRET)))return reply({error:"Слишком много попыток. Повторите через 5 минут."},429);
      const input=await body(request);
      const code=String(input.code||"").replace(/[^0-9]/g,"");
      if(!/^\d{8}$/.test(code))return reply({error:"Введите 8 цифр кода."},400);
      const hash=await sha256(code);
      const updated=await db.prepare("UPDATE sync_pair_codes SET used_at=? WHERE code_hash=? AND used_at=0 AND expires_at>?")
        .bind(now(),hash,now()).run();
      if(Number(updated.meta?.changes||0)!==1)return reply({error:"Код неверен или истёк."},403);
      return reply(await createDevice(db,"tv"),201);
    }
    const device=await authorized(db,request);
    if(!device)return reply({error:"Для синхронизации нужно подключить устройство."},401);
    if(action==="pair/start"&&method==="POST"){
      if(device.role!=="owner")return reply({error:"Коды создаёт только владелец на сайте."},403);
      const code=String(10000000+(new DataView(bytes(4).buffer).getUint32(0)%90000000));
      const hash=await sha256(code);
      await db.prepare("INSERT INTO sync_pair_codes(code_hash,issued_by,expires_at,used_at) VALUES(?,?,?,0)")
        .bind(hash,device.id,now()+300000).run();
      return reply({code,expiresInSeconds:300});
    }
    if(action==="library"&&method==="GET"){
      const q=await db.prepare("SELECT show_id,payload,tracked,revision,updated_at FROM sync_library ORDER BY updated_at DESC LIMIT 500").all();
      const shows=(q.results||[]).map(x=>({id:x.show_id,show:JSON.parse(x.payload),tracked:x.tracked===1,revision:x.revision,updatedAt:x.updated_at}));
      return reply({shows,at:now()});
    }
    if(action==="library"&&method==="POST"){
      const input=await body(request);
      if(!Array.isArray(input.operations)||input.operations.length<1||input.operations.length>50)return reply({error:"Допустимо от 1 до 50 изменений."},400);
      // Conflict checking is row-specific to avoid a stale TV overwriting a
      // newer web change. A 409 carries current server data, never loses it.
      const outcomes=[];
      for(const op of input.operations){
        const show=cleanShow(op?.id,op?.show);
        const base=Number(op?.baseRevision);
        if(!Number.isSafeInteger(base)||base<0)throw Error("Нужна версия синхронизации записи.");
        const tracked=op?.tracked===false?0:1;
        let changed=0;
        if(base===0){
          const r=await db.prepare("INSERT OR IGNORE INTO sync_library(show_id,payload,tracked,revision,updated_at) VALUES(?,?,?,1,?)")
            .bind(op.id,JSON.stringify(show),tracked,now()).run();
          changed=Number(r.meta?.changes||0);
        }else{
          const r=await db.prepare("UPDATE sync_library SET payload=?,tracked=?,revision=revision+1,updated_at=? WHERE show_id=? AND revision=?")
            .bind(JSON.stringify(show),tracked,now(),op.id,base).run();
          changed=Number(r.meta?.changes||0);
        }
        const row=await db.prepare("SELECT show_id,payload,tracked,revision,updated_at FROM sync_library WHERE show_id=?").bind(op.id).first();
        outcomes.push({id:op.id,ok:changed===1,current:row?{id:row.show_id,show:JSON.parse(row.payload),tracked:row.tracked===1,revision:row.revision,updatedAt:row.updated_at}:null});
      }
      return reply({results:outcomes},outcomes.some(x=>!x.ok)?409:200);
    }
    return reply({error:"Неизвестная операция."},404);
  } catch (err) {
    // Deliberately do not send database errors, secrets or stack traces to clients.
    if(err instanceof SyntaxError)return reply({error:"Неверный формат JSON."},400);
    if(/^(Недопустимый|Некорректн|Нет карточки|Слишком большой|Ожидается|Нужна версия)/.test(String(err.message||"")))return reply({error:err.message},400);
    return reply({error:"Ошибка сервиса синхронизации. Проверьте подключение базы."},503);
  }
}
