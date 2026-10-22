import type {PnlLedger} from '../reports/pnl';
// All data in this module is synthetic, independent of uploaded workbooks/seeds.
export const segments = {Retail:['官網','國內網路','國外網路'],Corporate:['商務公司','其他'],Wholesale:['國旅','日旅','其他'],Other:['Walk In']};
export const channels = Object.entries(segments).flatMap(([group,names])=>names.map(name=>`${group}:${name}`));
export type Hotel = {id:number;code:string;name:string;room_count:number;revision:number};
export type Inventory = {month:number;room_count:number;days:number;unavailable:number;available:number;revision:number};
export type Line = {month:number;channel:string;rn:number;ahr:string;rev:string};
export type Kind = 'hotel'|'central'|'finance';
export type Version = {id:number;hotel_id:number;year:number;kind:Kind;status:'draft'|'submitted';revision:number;created_by:string;source_id:number|null;lines:Line[];snapshot?:{source_id:number;source_revision:number;inventory:Inventory[];lines:Line[]}};
export type State = {priorBudgetsSeeded?:boolean;pnl?:Record<number,PnlLedger>;schema:1;hotels:Hotel[];inventory:Record<string,Inventory[]>;versions:Version[];nextId:number};
export class DemoError extends Error {constructor(message:string, public status=422){super(message);}}
export function need(condition:unknown,message:string,status=422):asserts condition {if(!condition)throw new DemoError(message,status);}
export function integer(value:unknown, min=0, max=10_000_000):number {
  need(typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max,'房晚／數量必須是允許範圍的整數');
  return value as number;
}
const maxMoney=999999999999999999n;
export function amount(value:unknown):bigint {
  const text=String(value);
  need(/^\d+(?:\.\d{1,3})?$/.test(text)&&text.length<24,'金額須為非負數、最多三位小數');
  const [whole,fraction='']=text.split('.');
  const result=BigInt(whole)*1000n+BigInt(fraction.padEnd(3,'0'));
  need(result<=maxMoney,'金額超過可計算範圍');return result;
}
export const money=(value:bigint)=>`${value/1000n}.${(value%1000n).toString().padStart(3,'0')}`;
export const roundedDivide=(n:bigint,d:bigint)=>{need(d>0n,'分母必須大於零');return (n*2n+d)/(d*2n);};
export function calculate(input:{month:unknown;channel:unknown;rn:unknown;ahr?:unknown;target_rev?:unknown}):Line {
  const month=integer(input.month,1,12),rn=integer(input.rn);
  need(typeof input.channel==='string'&&channels.includes(input.channel),'月份或通路不合法');
  need((input.ahr===undefined)!==(input.target_rev===undefined),'AHR 與 REV 必須擇一輸入');
  let ahr:bigint,rev:bigint;
  if(input.target_rev!==undefined){
    rev=amount(input.target_rev);need(rn>0||rev===0n,'房晚為零時不可覆寫非零 REV');
    ahr=rn?roundedDivide(rev,BigInt(rn)):0n;
    need(BigInt(rn)*ahr===rev,'此 REV 無法由三位小數 AHR 精確回算，請調整金額');
  }else{
    ahr=amount(input.ahr);need(rn>0||ahr===0n,'房晚為零時 AHR 必須為零');rev=BigInt(rn)*ahr;
  }
  need(rev<=maxMoney,'收入超過可計算範圍');
  return {month,channel:input.channel as string,rn,ahr:money(ahr),rev:money(rev)};
}
export function inventory(state:State,hotel:Hotel,year:number):Inventory[]{
  return Array.from({length:12},(_,i)=>{
    const month=i+1,days=new Date(Date.UTC(year,month,0)).getUTCDate();
    const saved=state.inventory[`${hotel.id}/${year}`]?.[i];const unavailable=saved?.unavailable??0;
    return {month,days,room_count:hotel.room_count,unavailable,available:hotel.room_count*days-unavailable,revision:saved?.revision??0};
  });
}
export const versionInventory=(state:State,v:Version)=>v.snapshot?.inventory??inventory(state,state.hotels.find(h=>h.id===v.hotel_id)!,v.year);
export function summary(state:State,v:Version){
  const inv=versionInventory(state,v);
  const monthly=inv.map(i=>{
    const lines=v.lines.filter(l=>l.month===i.month),rn=lines.reduce((n,l)=>n+l.rn,0),rev=lines.reduce((n,l)=>n+amount(l.rev),0n);
    return {month:i.month,rn,rev:money(rev),revenue:money(rev),available:i.available,
      adr:rn?money(roundedDivide(rev,BigInt(rn))):'0.000',
      occ_pct:i.available?money(roundedDivide(BigInt(rn)*100000n,BigInt(i.available))):null,
      revpar:i.available?money(roundedDivide(rev,BigInt(i.available))):null};
  });
  const rn=monthly.reduce((n,m)=>n+m.rn,0),rev=monthly.reduce((n,m)=>n+amount(m.rev),0n),available=inv.reduce((n,i)=>n+i.available,0);
  return {monthly,annual:{rn,rev:money(rev),available,adr:rn?money(roundedDivide(rev,BigInt(rn))):'0.000',
    occ_pct:available?money(roundedDivide(BigInt(rn)*100000n,BigInt(available))):null,
    revpar:available?money(roundedDivide(rev,BigInt(available))):null},net_revenue:money(roundedDivide(rev*100n,105n))};
}
export function checkCapacity(state:State,v:Version,lines=v.lines){
  for(const inv of versionInventory(state,v)){
    need(inv.available>=0,'不可售房晚超過總房晚');
    need(lines.filter(l=>l.month===inv.month).reduce((n,l)=>n+l.rn,0)<=inv.available,`${inv.month} 月房晚超過可售房晚`);
  }
}
export function seed():State {
  const state:State={schema:1,hotels:Array.from({length:12},(_,i)=>({id:i+1,code:`D${String(i+1).padStart(2,'0')}`,
    name:`第 ${String(i+1).padStart(2,'0')} 示範館`,room_count:80+i*7,revision:0})),inventory:{},versions:[],nextId:1};
  const weights=[18,22,12,15,8,12,6,4,3];
  for(const hotel of state.hotels){
    for(const kind of ['hotel','central','hotel'] as const){
      const isDraft=state.versions.some(v=>v.hotel_id===hotel.id&&v.kind===kind);
      const lines=inventory(state,hotel,2027).flatMap(inv=>channels.map((channel,c)=>{
        const sold=Math.floor(inv.available*(56+(hotel.id+inv.month*3)%18+(kind==='central'?3:0))/100);
        const rn=Math.floor(sold*weights[c]/100),ahr=2100+hotel.id*31+inv.month*47+c*83+(kind==='central'?120:0);
        return calculate({month:inv.month,channel,rn,ahr:rn?String(ahr):'0'});
      }));
      state.versions.push({id:state.nextId++,hotel_id:hotel.id,year:2027,kind,status:isDraft?'draft':'submitted',revision:0,
        created_by:'DEMO_VISITOR',source_id:null,lines});
    }
  }return addPriorBudgets(state);
}

/** Anonymous prior-year budgets only; never import or infer actual hotel results. */
export function addPriorBudgets(state:State):State {
  if(state.priorBudgetsSeeded)return state;
  state.nextId=Math.max(state.nextId,...state.versions.map(v=>v.id+1));
  const weights=[18,22,12,15,8,12,6,4,3];
  for(const hotel of state.hotels)for(const kind of ['hotel','central'] as const){
    if(state.versions.some(v=>v.hotel_id===hotel.id&&v.year===2026&&v.kind===kind))continue;
    const lines=inventory(state,hotel,2026).flatMap(inv=>channels.map((channel,c)=>{
      const sold=Math.floor(inv.available*(49+(hotel.id+inv.month*2)%17+(kind==='central'?2:0))/100);
      const rn=Math.floor(sold*weights[c]/100),ahr=1950+hotel.id*27+inv.month*41+c*79+(kind==='central'?110:0);
      return calculate({month:inv.month,channel,rn,ahr:rn?String(ahr):'0'});
    }));
    state.versions.push({id:state.nextId++,hotel_id:hotel.id,year:2026,kind,status:'submitted',revision:0,created_by:'DEMO_VISITOR',source_id:null,lines});
  }
  state.priorBudgetsSeeded=true;return state;
}
