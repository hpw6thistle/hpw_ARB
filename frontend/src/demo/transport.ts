import {syntheticLedger} from './pnl';
import {patchLedger,TaxMode} from '../reports/pnl';
import {State,Version,Kind,DemoError,need,seed,integer,inventory,versionInventory,calculate,checkCapacity,summary,segments} from './model';
import {preview,template} from './excel';

const storageKey='hotel-budget-anonymous-demo-v1';
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
function restore():State {
  try{
    const raw=sessionStorage.getItem(storageKey);
    if(raw){const saved=JSON.parse(raw);if(saved.schema===1&&saved.hotels?.length===12&&Array.isArray(saved.versions)&&saved.inventory&&Number.isSafeInteger(saved.nextId))return saved;}
  }catch{/* Storage can be unavailable in private/embedded browser contexts. */}
  return seed();
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const metadata=(v:Version)=>({id:v.id,kind:v.kind,status:v.status,revision:v.revision,created_by:v.created_by,source_id:v.source_id});
const year=(v:unknown)=>integer(Number(v),2020,2100);

export function createDemoTransport(){
  let state=restore();
  const reset=()=>{try{sessionStorage.removeItem(storageKey);}catch{/* reset also works without storage */}state=seed();window.location.reload();};
  const transport:typeof fetch=async(input,options)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,window.location.href);
    const path=url.pathname,method=options?.method?.toUpperCase()??'GET';
    // A private transaction copy ensures rejected bulk/inventory writes are atomic.
    const current=method==='GET'?state:clone(state);
    const hotel=(id:number)=>{const h=current.hotels.find(h=>h.id===id);need(h,'館別不存在',404);return h;};
    const version=(id:number)=>{const v=current.versions.find(v=>v.id===id);need(v,'版本不存在',404);return v;};
    const revision=(v:{revision:number},expected:unknown)=>need(v.revision===expected,'資料已更新，請重新載入',409);
    const writable=(v:Version,p:{expected_revision?:number})=>{need(v.status==='draft','已提交版本不可修改',409);revision(v,p.expected_revision);};
    try{
      const body=typeof options?.body==='string'?JSON.parse(options.body):{};
      let result:unknown,status=200,match:RegExpMatchArray|null;
      if(method==='GET'&&path==='/api/auth/config')result={mode:'legacy',provider:'anonymous-demo'};
      else if(method==='GET'&&path==='/api/catalog')result={hotels:current.hotels,segments};
      else if(method==='GET'&&path==='/api/templates/budget-input.xlsx'){
        return new Response(template() as BodyInit,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
      }else if(method==='POST'&&path==='/api/templates/budget-input/preview'){
        need(typeof body.base64_data==='string'&&body.base64_data.length<=3_000_000,'Excel 檔案過大');
        const raw=atob(body.base64_data);result=preview(Uint8Array.from(raw,c=>c.charCodeAt(0)));
      }else if(method==='GET'&&path==='/api/versions'){
        const h=hotel(Number(url.searchParams.get('hotel_id'))),y=year(url.searchParams.get('year'));
        result=current.versions.filter(v=>v.hotel_id===h.id&&v.year===y).map(metadata);
      }else if(method==='POST'&&path==='/api/versions'){
        hotel(integer(body.hotel_id,1,12));need(['hotel','central'].includes(body.kind),'編列來源不正確');
        const v:Version={id:current.nextId++,hotel_id:body.hotel_id,year:year(body.year),kind:body.kind as Kind,status:'draft',revision:0,created_by:'DEMO_VISITOR',source_id:null,lines:[]};
        current.versions.push(v);result=metadata(v);
      }else if((match=path.match(/^\/api\/hotels\/(\d+)\/inventory\/(\d+)(?:\/(\d+))?$/))){
        const h=hotel(+match[1]),y=year(match[2]),inv=inventory(current,h,y);
        if(method==='GET'&&!match[3])result=inv;
        else if(method==='PUT'&&match[3]){
          const month=integer(+match[3],1,12),item=inv[month-1];revision(item,body.expected_revision);
          item.unavailable=integer(body.unavailable);need(item.unavailable<=h.room_count*item.days,'不可售房晚超過總房晚');
          item.available=h.room_count*item.days-item.unavailable;item.revision++;
          current.inventory[`${h.id}/${y}`]=inv;
          current.versions.filter(v=>v.hotel_id===h.id&&v.year===y&&v.kind!=='finance').forEach(v=>checkCapacity(current,v));result=item;
        }else throw new DemoError('此操作不存在',404);
      }else if(method==='PUT'&&(match=path.match(/^\/api\/hotels\/(\d+)\/room-count$/))){
        const h=hotel(+match[1]);revision(h,body.expected_revision);h.room_count=integer(body.room_count,1,100000);h.revision++;
        const years=new Set([...current.versions.filter(v=>v.hotel_id===h.id).map(v=>v.year),...Object.keys(current.inventory).filter(k=>k.startsWith(`${h.id}/`)).map(k=>+k.split('/')[1])]);
        for(const y of years)need(inventory(current,h,y).every(i=>i.available>=0),'已有不可售房晚超過新總房晚');
        current.versions.filter(v=>v.hotel_id===h.id&&v.kind!=='finance').forEach(v=>checkCapacity(current,v));result={room_count:h.room_count,revision:h.revision};
      }else if(method==='POST'&&path==='/api/finance/from-source'){
        const source=version(integer(body.source_version_id,1));
        need(source.status==='submitted'&&source.kind!=='finance','僅能從已提交的各館／聯訂來源帶入',409);
        const v:Version={...clone(source),id:current.nextId++,kind:'finance',status:'draft',revision:0,created_by:'DEMO_VISITOR',source_id:source.id,
          snapshot:{source_id:source.id,source_revision:source.revision,inventory:clone(versionInventory(current,source)),lines:clone(source.lines)}};
        current.versions.push(v);current.pnl??={};current.pnl[v.id]=syntheticLedger(v.snapshot!.lines);result=metadata(v);status=201;
      }else if((match=path.match(/^\/api\/finance\/(\d+)\/pnl$/))){
        const v=version(+match[1]);need(v.kind==='finance'&&v.snapshot,'非財務版本');
        const ledger=current.pnl?.[v.id]??syntheticLedger(v.snapshot.lines);
        if(method==='GET')result={revision:v.revision,ledger};
        else if(method==='PUT'){
          writable(v,body);need(Array.isArray(body.items)&&body.items.length<=2460,'損益項目過多');
          let updated;try{updated=patchLedger(ledger,body.tax_mode as TaxMode,body.items);}catch(e){throw new DemoError(e instanceof Error?e.message:'損益輸入不合法');}
          current.pnl??={};current.pnl[v.id]=updated;v.revision++;result={revision:v.revision,ledger:updated};
        }else throw new DemoError('此操作不存在',404);
      }else if(method==='GET'&&path==='/api/finance/compare'){
        const h=hotel(Number(url.searchParams.get('hotel_id'))),y=year(url.searchParams.get('year'));
        result={hotel_id:h.id,year:y,versions:current.versions.filter(v=>v.hotel_id===h.id&&v.year===y).map(v=>({...metadata(v),...summary(current,v),source_revision:v.snapshot?.source_revision??null}))};
      }else if((match=path.match(/^\/api\/versions\/(\d+)(?:\/(lines\/bulk|line|submit|summary))?$/))){
        const v=version(+match[1]),action=match[2];
        if(method==='GET'&&!action)result={...metadata(v),hotel_id:v.hotel_id,year:v.year,lines:v.lines,inventory_snapshot:v.snapshot?.inventory??null};
        else if(method==='GET'&&action==='summary')result=summary(current,v);
        else if(method==='PUT'&&['line','lines/bulk'].includes(action)){
          writable(v,body);const items=action==='line'?[body]:body.items;
          need(Array.isArray(items)&&items.length>=1&&items.length<=108,'一次須有 1–108 筆資料');
          const calculated=items.map(calculate);const keys=calculated.map(l=>`${l.month}/${l.channel}`);
          need(new Set(keys).size===keys.length,'同月份與通路不可重複');
          const projected=[...v.lines.filter(l=>!keys.includes(`${l.month}/${l.channel}`)),...calculated];
          checkCapacity(current,v,projected);v.lines=projected;v.revision++;result={revision:v.revision,lines:calculated};
        }else if(method==='POST'&&action==='submit'){
          writable(v,{expected_revision:Number(url.searchParams.get('expected_revision'))});checkCapacity(current,v);v.status='submitted';v.revision++;result=metadata(v);
        }else if(method==='DELETE'&&!action){
          writable(v,{expected_revision:Number(url.searchParams.get('expected_revision'))});current.versions=current.versions.filter(x=>x.id!==v.id);if(current.pnl)delete current.pnl[v.id];result={deleted:true,id:v.id};
        }else throw new DemoError('此操作不存在',404);
      }else if(method==='GET'&&(match=path.match(/^\/api\/finance\/(\d+)\/snapshot$/))){
        const v=version(+match[1]);need(v.snapshot,'此版本沒有財務快照',404);result=v.snapshot;
      }else throw new DemoError('此操作未提供',404);
      if(method!=='GET'){
        try{sessionStorage.setItem(storageKey,JSON.stringify(current));}
        catch{throw new DemoError('瀏覽器無法保存資料，請開啟分頁儲存權限或重設資料',507);}
        state=current;
      }
      return json(clone(result),status);
    }catch(e){
      return json({detail:e instanceof DemoError?e.message:'資料格式不正確，請重新選擇或重設資料'},e instanceof DemoError?e.status:422);
    }
  };
  return {transport,reset};
}
