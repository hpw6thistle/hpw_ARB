import {amount,money,divide} from './money';
import {calculatePnl,PnlLedger,PnlResult} from './pnl';
export type ReportLine={month:number;channel:string;rn:number;ahr:string;rev:string};
export type Capacity={month:number;available:number};
export type ReportVersion={id:number;hotel_id:number;year:number;kind:string;status:string;revision:number;lines:ReportLine[];inventory_snapshot:Capacity[]|null};
export type SourceSnapshot={source_id:number;source_revision:number;lines:ReportLine[];inventory:Capacity[]};
export type Figures={rn:number;available:number;rev:string;net:string;adr:string|null;occ:string|null;revpar:string|null};
export type Detail={month:number;channel:string;rn:number;ahr:string|null;rev:string;rn_share:string|null;rev_share:string|null};
export type Change={month:number;channel:string;before:ReportLine;after:ReportLine;rn:number;rev:string};
export type Report={hotelName:string;version:ReportVersion;source:SourceSnapshot;generatedAt:string;monthly:Figures[];annual:Figures;beforeMonthly:Figures[];beforeAnnual:Figures;details:Detail[];annualChannels:Detail[];changes:Change[];ledger:PnlLedger;pnl:PnlResult[];beforePnl:PnlResult[];netDirect:string;netDifference:string};
export const reportChannels=['Retail:官網','Retail:國內網路','Retail:國外網路','Corporate:商務公司','Corporate:其他','Wholesale:國旅','Wholesale:日旅','Wholesale:其他','Other:Walk In'];
const demand=(ok:unknown,message:string)=>{if(!ok)throw new Error(message);};
const zero=(month:number,channel:string):ReportLine=>({month,channel,rn:0,ahr:'0.000',rev:'0.000'});
function normalize(lines:ReportLine[]):ReportLine[]{
  demand(Array.isArray(lines)&&lines.length<=108,'收入明細不完整');
  const map=new Map<string,ReportLine>();
  for(const line of lines){
    const k=line.month+'/'+line.channel;
    demand(Number.isInteger(line.month)&&line.month>=1&&line.month<=12&&reportChannels.includes(line.channel)&&!map.has(k),'收入月份或通路不合法／重複');
    demand(Number.isSafeInteger(line.rn)&&line.rn>=0,'房晚須為非負整數');
    const rate=amount(line.ahr),rev=amount(line.rev);
    demand(rate>=0n&&rev>=0n&&BigInt(line.rn)*rate===rev,'房晚、房價與收入無法對帳');
    map.set(k,{...line,ahr:money(rate),rev:money(rev)});
  }
  return Array.from({length:12},(_,i)=>reportChannels.map(c=>map.get((i+1)+'/'+c)??zero(i+1,c))).flat();
}
const ratio=(n:bigint,d:bigint)=>d===0n?null:money(divide(n,d));
function figures(lines:ReportLine[],available:number):Figures{
  const rn=lines.reduce((n,l)=>n+l.rn,0),rev=lines.reduce((n,l)=>n+amount(l.rev),0n);
  demand(Number.isSafeInteger(rn)&&rn<=available,'銷售房晚超過可售房晚');
  return {rn,available,rev:money(rev),net:money(divide(rev*100n,105n)),adr:ratio(rev,BigInt(rn)),occ:ratio(BigInt(rn)*100000n,BigInt(available)),revpar:ratio(rev,BigInt(available))};
}
function annual(months:Figures[]):Figures{
  const rn=months.reduce((n,m)=>n+m.rn,0),available=months.reduce((n,m)=>n+m.available,0),rev=months.reduce((n,m)=>n+amount(m.rev),0n);
  return {rn,available,rev:money(rev),net:money(months.reduce((n,m)=>n+amount(m.net),0n)),adr:ratio(rev,BigInt(rn)),occ:ratio(BigInt(rn)*100000n,BigInt(available)),revpar:ratio(rev,BigInt(available))};
}
export function buildReport(version:ReportVersion,source:SourceSnapshot,ledger:PnlLedger,hotelName:string,now=new Date().toISOString()):Report{
  demand(version.kind==='finance'&&source.source_id>0&&Number.isInteger(source.source_revision),'請選擇具來源快照的財務版本');
  demand(version.inventory_snapshot?.length===12&&source.inventory?.length===12,'缺少完整可售房晚快照');
  const inventory=new Map<number,number>();
  for(const item of source.inventory){demand(Number.isInteger(item.month)&&item.month>=1&&item.month<=12&&!inventory.has(item.month)&&Number.isSafeInteger(item.available)&&item.available>=0,'房晚快照不合法');inventory.set(item.month,item.available);}
  for(const item of version.inventory_snapshot!)demand(inventory.get(item.month)===item.available,'財務版與來源房晚快照不一致');
  demand(new Set(version.inventory_snapshot!.map(i=>i.month)).size===12,'財務版房晚快照重複');
  const lines=normalize(version.lines),before=normalize(source.lines);
  const monthly=Array.from({length:12},(_,i)=>figures(lines.filter(l=>l.month===i+1),inventory.get(i+1)!));
  const beforeMonthly=Array.from({length:12},(_,i)=>figures(before.filter(l=>l.month===i+1),inventory.get(i+1)!));
  const total=annual(monthly),beforeTotal=annual(beforeMonthly);
  const detail=(month:number,channel:string,rn:number,rev:bigint,total:Figures):Detail=>({month,channel,rn,rev:money(rev),ahr:ratio(rev,BigInt(rn)),rn_share:ratio(BigInt(rn)*100000n,BigInt(total.rn)),rev_share:ratio(rev*100000n,amount(total.rev))});
  const details=lines.map(l=>detail(l.month,l.channel,l.rn,amount(l.rev),monthly[l.month-1]));
  const annualChannels=reportChannels.map(c=>{const entries=lines.filter(l=>l.channel===c);return detail(0,c,entries.reduce((n,l)=>n+l.rn,0),entries.reduce((n,l)=>n+amount(l.rev),0n),total);});
  const changes=lines.map((l,i)=>({month:l.month,channel:l.channel,before:before[i],after:l,rn:l.rn-before[i].rn,rev:money(amount(l.rev)-amount(before[i].rev))}));
  const netDirect=money(divide(amount(total.rev)*100n,105n));
  return {hotelName,version:{...version,lines},source:{...source,lines:before},generatedAt:now,monthly,annual:total,beforeMonthly,beforeAnnual:beforeTotal,details,annualChannels,changes,ledger,pnl:calculatePnl(monthly.map(m=>m.net),ledger.values,ledger.tax_mode),beforePnl:calculatePnl(beforeMonthly.map(m=>m.net),ledger.baseline_values,ledger.baseline_tax_mode),netDirect,netDifference:money(amount(total.net)-amount(netDirect))};
}
export const change=(a:string|number|null,b:string|number|null)=>a===null||b===null?null:typeof a==='number'&&typeof b==='number'?a-b:money(amount(a)-amount(b));
export async function loadReport(request:<T>(path:string,method?:string,body?:unknown)=>Promise<T>,id:number,hotel:number,year:number,hotelName:string):Promise<Report>{
  for(let attempt=0;attempt<3;attempt++){
    const [version,source,pnl]=await Promise.all([request<ReportVersion>('/api/versions/'+id),request<SourceSnapshot>('/api/finance/'+id+'/snapshot'),request<{revision:number;ledger:PnlLedger}>('/api/finance/'+id+'/pnl')]);
    demand(version.hotel_id===hotel&&version.year===year,'版本不屬於目前館別與年度');
    const check=await request<ReportVersion>('/api/versions/'+id);
    if(version.revision===check.revision&&pnl.revision===check.revision)return buildReport(version,source,pnl.ledger,hotelName);
  }
  throw new Error('資料正在更新，請稍後重新取得報表');
}
