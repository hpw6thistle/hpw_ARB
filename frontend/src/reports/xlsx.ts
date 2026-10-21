import {zipSync,strToU8} from 'fflate';
import {Report} from './model';
import {ReportTable,cellType,reportTables,stamp} from './tables';
import {amount} from './money';
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const escape=(s:unknown)=>String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const col=(n:number):string=>n<26?String.fromCharCode(65+n):col(Math.floor(n/26)-1)+col(n%26);
const text=(ref:string,value:unknown,style=0)=>`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;
function fraction(s:string){const n=amount(s),v=n<0n?-n:n;return (n<0n?'-':'')+v/100000n+'.'+(v%100000n).toString().padStart(5,'0');}
function sheet(table:ReportTable,r:Report):string {
  const last=col(table.columns.length-1);
  const meta=[table.title,r.hotelName+' · '+r.version.year+' 年',`財務版本 #${r.version.id}／修訂 ${r.version.revision}／${r.version.status==='draft'?'草稿':'已提交'} · 來源 #${r.source.source_id}／修訂 ${r.source.source_revision}`,stamp(r)+'（台北）'];
  const rows=meta.map((v,i)=>`<row r="${i+1}" ht="${i===0?28:21}" customHeight="1">${text('A'+(i+1),v,i===0?1:2)}</row>`);
  rows.push(`<row r="6" ht="32" customHeight="1">${table.columns.map((c,i)=>text(col(i)+'6',c.label,3)).join('')}</row>`);
  table.rows.forEach((row,ri)=>{
    const n=ri+7;
    rows.push(`<row r="${n}">${row.cells.map((value,c)=>{
      const ref=col(c)+n,type=cellType(table,row,c);
      if(value===null)return text(ref,'—',row.total?11:0);
      if(type==='text')return text(ref,value,row.total?11:0);
      const v=type==='percent'?fraction(String(value)):String(value);
      // Excel stores only 15 significant digits. Literal text preserves larger totals.
      if(!/^-?\d+(?:\.\d+)?$/.test(v)||v.replace(/[-.]/g,'').replace(/^0+/,'').replace(/0+$/,'').length>15)return text(ref,value,row.total?11:0);
      const style=type==='integer'?(row.total?9:5):type==='percent'?(row.total?10:6):type==='points'?7:row.total?8:4;
      return `<c r="${ref}" s="${style}" t="n"><v>${v}</v></c>`;
    }).join('')}</row>`);
  });
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${last}${table.rows.length+6}"/><sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="6" topLeftCell="B7" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${table.columns.map((c,i)=>`<col min="${i+1}" max="${i+1}" width="${i===0?table.name==='報表資訊'?30:33:table.name==='報表資訊'?110:18}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.join('')}</sheetData><mergeCells count="4">${meta.map((_,i)=>`<mergeCell ref="A${i+1}:${last}${i+1}"/>`).join('')}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.15" footer="0.15"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;C&amp;P / &amp;N</oddFooter></headerFooter></worksheet>`;
}
const styles=`<styleSheet xmlns="${ns}"><numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.000;[Red]-#,##0.000"/><numFmt numFmtId="165" formatCode="0.000%;[Red]-0.000%"/><numFmt numFmtId="166" formatCode="0.000&amp;quot; pp&amp;quot;"/></numFmts><fonts count="3"><font><sz val="10"/><name val="Microsoft JhengHei"/><color rgb="FF344B3D"/></font><font><b/><sz val="15"/><color rgb="FFFFFFFF"/><name val="Microsoft JhengHei"/></font><font><b/><sz val="10"/><color rgb="FF344B3D"/><name val="Microsoft JhengHei"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF3D5E4B"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDF2E8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDCE2D6"/></left><right style="thin"><color rgb="FFDCE2D6"/></right><top style="thin"><color rgb="FFDCE2D6"/></top><bottom style="thin"><color rgb="FFDCE2D6"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="12">${[
  [0,0,0],[0,1,2],[0,0,0],[0,2,3],[164,0,0],[3,0,0],[165,0,0],[166,0,0],[164,2,3],[3,2,3],[165,2,3],[0,2,3],
].map(([num,font,fill],i)=>`<xf numFmtId="${num}" fontId="${font}" fillId="${fill}" borderId="${i===1||i===2?0:1}" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" horizontal="${i===1||i===2||i===0||i===11?'left':'right'}" wrapText="1"/></xf>`).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
export function reportWorkbook(r:Report):Uint8Array {
  const tables=reportTables(r),files:Record<string,string>={
    '[Content_Types].xml':`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${tables.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${tables.map((t,i)=>`<sheet name="${escape(t.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets><definedNames>${tables.map((t,i)=>`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${escape(t.name)}'!$1:$6</definedName>`).join('')}</definedNames></workbook>`,
    'xl/_rels/workbook.xml.rels':`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tables.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml':styles.replace(/&amp;quot;/g,'&quot;'),
  };
  tables.forEach((table,i)=>files['xl/worksheets/sheet'+(i+1)+'.xml']=sheet(table,r));
  return zipSync(Object.fromEntries(Object.entries(files).map(([name,text])=>[name,strToU8(text)])));
}
export function downloadReport(r:Report){
  const blob=new Blob([reportWorkbook(r) as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`${r.hotelName.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,60)}_${r.version.year}_財務報表_v${r.version.id}_r${r.version.revision}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
