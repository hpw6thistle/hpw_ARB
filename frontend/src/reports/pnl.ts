import {pnlCatalog,PnlRow} from './catalog';
import {amount,money,divide} from './money';
export type TaxMode='source_excel'|'monthly_20'|'manual';
export type PnlLedger={values:Record<string,string>;tax_mode:TaxMode;baseline_values:Record<string,string>;baseline_tax_mode:TaxMode};
export const taxNames:Record<TaxMode,string>={source_excel:'沿用原檔：1 月自動 20%，其餘月份輸入',monthly_20:'每月正數稅前損益 × 20%',manual:'各月份自行輸入'};
export const emptyLedger=():PnlLedger=>({values:{},tax_mode:'source_excel',baseline_values:{},baseline_tax_mode:'source_excel'});
export const inputRows=pnlCatalog.filter(r=>r.code&&r.calc!=='room_net');
export const taxAutomatic=(mode:TaxMode,month:number)=>mode==='monthly_20'||mode==='source_excel'&&month===1;
export function patchLedger(ledger:PnlLedger,mode:TaxMode,items:{month:number;code:string;amount:string}[]):PnlLedger {
  if(!(Object.prototype.hasOwnProperty.call(taxNames,mode)))throw new Error('所得稅方式不正確');
  const next={...ledger,values:{...ledger.values},tax_mode:mode},seen=new Set<string>();
  for(const item of items){
    const row=inputRows.find(r=>r.code===item.code),key=item.month+'/'+item.code;
    if(!row||!Number.isInteger(item.month)||item.month<1||item.month>12||seen.has(key))throw new Error('科目或月份不合法／重複');
    if(row.calc==='tax'&&taxAutomatic(mode,item.month))throw new Error('此月份所得稅由系統計算');
    if(!/^-?\d{1,15}(?:\.\d{1,3})?$/.test(item.amount))throw new Error('金額須為數字、最多三位小數');
    seen.add(key);next.values[key]=money(amount(item.amount));
  }
  return next;
}
export type PnlResult={row:PnlRow;months:(string|null)[];annual:string|null};
export function calculatePnl(net:string[],values:Record<string,string>,taxMode:TaxMode):PnlResult[] {
  if(net.length!==12||!(Object.prototype.hasOwnProperty.call(taxNames,taxMode)))throw new Error('損益資料不完整');
  const cells:Record<number,(bigint|null)[]>={};
  for(const row of pnlCatalog){
    cells[row.row]=Array.from({length:12},(_,i)=>{
      if(row.calc==='room_net')return amount(net[i]);
      if(row.calc==='ratio'){const denominator=cells[43][i]!;return denominator===0n?null:divide(cells[68][i]!*100000n,denominator<0n?-denominator:denominator)*(denominator<0n?-1n:1n);}
      if(row.calc==='tax'&&taxAutomatic(taxMode,i+1))return cells[220][i]!>0n?divide(cells[220][i]!,5n):0n;
      if(row.calc==='sum')return row.terms!.reduce((n,r)=>n+(r<0?-1n:1n)*cells[Math.abs(r)][i]!,0n);
      return amount(values[(i+1)+'/'+row.code]??'0');
    });
  }
  const sum=(row:number)=>cells[row].reduce<bigint>((n,x)=>n+(x??0n),0n);
  return pnlCatalog.map(row=>({row,months:cells[row.row].map(x=>x===null?null:money(x)),annual:row.calc==='ratio'?(sum(43)===0n?null:money(divide(sum(68)*100000n,sum(43)<0n?-sum(43):sum(43))*(sum(43)<0n?-1n:1n))):money(sum(row.row))}));
}
