import {unzipSync,zipSync,strToU8,strFromU8} from 'fflate';
import {channels,calculate,DemoError,need} from './model';

const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const xml=(s:string)=>{need(!/<!DOCTYPE|<!ENTITY/i.test(s),'不接受 XML 宣告實體');const d=new DOMParser().parseFromString(s,'application/xml');need(!d.querySelector('parsererror'),'Excel XML 格式不合法');return d;};
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function template():Uint8Array {
  const rows=[['month','channel','room_nights','ahr'],...Array.from({length:12},(_,m)=>channels.map(c=>[String(m+1),c,'0','0'])).flat()];
  const sheet=`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><sheetData>${rows.map((row,r)=>`<row r="${r+1}">${row.map((v,c)=>`<c r="${'ABCD'[c]}${r+1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const files={
    '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="BudgetInputs" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':sheet,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([n,s])=>[n,strToU8(s)])));
}
export function preview(data:Uint8Array){
  need(data.length<=2_000_000,'檔案不得超過 2 MB');
  let files:Record<string,Uint8Array>;
  try{
    let count=0,size=0;const names=new Set<string>();
    files=unzipSync(data,{filter:file=>{
      const n=file.name.toLowerCase();size+=file.originalSize;count++;
      need(!names.has(file.name)&&count<=100&&size<=5_000_000&&file.originalSize<=2_000_000,'Excel 解壓縮內容過大或重複');names.add(file.name);
      need(!n.startsWith('/')&&!n.split('/').includes('..')&&!n.includes('\\'),'不合法壓縮路徑');
      need(!/\.(bin|vba|exe)$/.test(n)&&!/^xl\/(externallinks|embeddings|activex)\//.test(n)&&n!=='xl/connections.xml','不接受巨集或外部連結');
      return true;
    }});
  }catch(e){if(e instanceof DemoError)throw e;throw new DemoError('不是有效的系統 XLSX 範本');}
  need(Object.values(files).reduce((n,b)=>n+b.length,0)<=5_000_000,'Excel 解壓縮後過大');
  for(const [name,bytes] of Object.entries(files)){
    if(name.endsWith('.xml')||name.endsWith('.rels')){
      const d=xml(strFromU8(bytes));
      if(name.endsWith('.rels'))need(!Array.from(d.getElementsByTagNameNS('*','Relationship')).some(r=>r.getAttribute('TargetMode')?.toLowerCase()==='external'),'不接受外部連結');
    }
  }
  need(files['xl/worksheets/sheet1.xml'],'找不到範本工作表');
  const shared=files['xl/sharedStrings.xml']?Array.from(xml(strFromU8(files['xl/sharedStrings.xml'])).getElementsByTagNameNS(ns,'si')).map(si=>Array.from(si.getElementsByTagNameNS(ns,'t')).map(t=>t.textContent??'').join('')):[];
  const d=xml(strFromU8(files['xl/worksheets/sheet1.xml']));const cells:Record<string,string>={};
  for(const c of Array.from(d.getElementsByTagNameNS(ns,'c'))){
    need(!c.getElementsByTagNameNS(ns,'f').length,'不接受公式儲存格，請貼上純數值');
    const address=c.getAttribute('r')??'';
    const type=c.getAttribute('t'),v=c.getElementsByTagNameNS(ns,'v')[0]?.textContent??'';
    let value=type==='inlineStr'?Array.from(c.getElementsByTagNameNS(ns,'t')).map(t=>t.textContent??'').join(''):v;
    if(type==='s'){const index=Number(v);need(Number.isInteger(index)&&index>=0&&index<shared.length,'共享字串索引不合法');value=shared[index];}
    need(/^[A-D](?:[1-9]|[1-9]\d|10\d)$/.test(address)||value.trim()==='','範本應只有 4 欄、108 筆資料');
    need(!(address in cells),'重複儲存格');cells[address]=value.trim();
  }
  need(['A1','B1','C1'].map(a=>cells[a]).join(',')==='month,channel,room_nights'&&['ahr','average_room_rate'].includes(cells.D1),'範本標題不符，請下載展示版範本');
  const items:{month:number;channel:string;rn:number;ahr:string}[]=[],errors:string[]=[],keys=new Set<string>();
  for(let r=2;r<=109;r++){
    try{
      const m=cells[`A${r}`]??'',ch=cells[`B${r}`]??'',rn=cells[`C${r}`]||'0',ahr=cells[`D${r}`]||'0';
      need(/^\d+$/.test(m)&&/^\d+$/.test(rn),'月份與房晚須為整數');
      const line=calculate({month:Number(m),channel:ch,rn:Number(rn),ahr});const key=`${line.month}/${line.channel}`;
      need(!keys.has(key),'月份及通路重複');keys.add(key);
      items.push({month:line.month,channel:line.channel,rn:line.rn,ahr:line.ahr});
    }catch(e){errors.push(`第 ${r} 列：${e instanceof Error?e.message:'資料不合法'}`);}
  }
  return {items,errors,count:items.length};
}
