import {amount,money,divide} from './reports/money';
export type YearVersion={id:number;hotel_id?:number;year?:number;kind:string;status:string;revision:number};
export type YearMonth={month:number;available:number;rn:number;rev:string;occ:string|null};
export type YearFigures={monthly:YearMonth[];annual:YearMonth};
export type YearRequest=<T>(path:string,method?:string,body?:unknown)=>Promise<T>;
export function yearFigures(rows:{month:number;available:number;rn:number;revenue?:string;rev?:string}[]):YearFigures{
  if(!Array.isArray(rows)||rows.length!==12)throw new Error('缺少完整的 12 個月資料');
  const seen=new Set<number>();
  const monthly=rows.map(r=>{
    if(!Number.isInteger(r.month)||r.month<1||r.month>12||seen.has(r.month)||!Number.isSafeInteger(r.available)||r.available<0||!Number.isSafeInteger(r.rn)||r.rn<0||r.rn>r.available)throw new Error('月份或房晚資料不完整，請重新檢查預算');
    seen.add(r.month);const rev=amount(r.revenue??r.rev);if(rev<0n)throw new Error('客房收入不可小於零');
    return {month:r.month,available:r.available,rn:r.rn,rev:money(rev),occ:r.available?money(divide(BigInt(r.rn)*100000n,BigInt(r.available))):null};
  }).sort((a,b)=>a.month-b.month);
  const available=monthly.reduce((n,r)=>n+r.available,0),rn=monthly.reduce((n,r)=>n+r.rn,0);
  if(!Number.isSafeInteger(available)||!Number.isSafeInteger(rn))throw new Error('房晚總數超過可計算範圍');
  return {monthly,annual:{month:0,available,rn,rev:money(monthly.reduce((n,r)=>n+amount(r.rev),0n)),occ:available?money(divide(BigInt(rn)*100000n,BigInt(available))):null}};
}
export async function loadYearFigures(request:YearRequest,id:number,hotel:number,year:number):Promise<YearFigures>{
  for(let i=0;i<3;i++){
    const before=await request<YearVersion>('/api/versions/'+id);
    if(before.hotel_id!==hotel||before.year!==year)throw new Error('版本不屬於目前館別與年度');
    const summary=await request<{monthly:Parameters<typeof yearFigures>[0]}>('/api/versions/'+id+'/summary');
    const after=await request<YearVersion>('/api/versions/'+id);
    if(before.revision===after.revision)return yearFigures(summary.monthly);
  }
  throw new Error('預算正在更新，請稍後重新整理比較');
}
export function yearDelta(current:string|number|null,previous:string|number|null):string|number|null{
  if(current===null||previous===null)return null;
  return typeof current==='number'&&typeof previous==='number'?current-previous:money(amount(current)-amount(previous));
}
