import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Report,loadReport} from './reports/model';
import {inputRows,patchLedger,taxAutomatic,taxNames,TaxMode} from './reports/pnl';
import {fmt} from './reports/money';
import {cellType,reportTables,ReportTable,stamp} from './reports/tables';
import {downloadReport} from './reports/xlsx';
import './reports/style.css';

type Version={id:number;kind:string;status:string;revision:number};
type Request=<T>(path:string,method?:string,body?:unknown)=>Promise<T>;
type Props={hotel:number;year:number;hotelName:string;initialId:number|null;request:Request;onBack:()=>void;onSelected:(version:Version)=>void;onPendingChange:(pending:boolean)=>void};
const tabs=[['客房部','客房部損益'],['年度客房收入預算','客房收入'],['收入調整差異','收入調整差異'],['損益調整差異','損益調整差異'],['通路收入明細','通路明細'],['edit','損益科目編列']];
function Table({table,compact=false}:{table:ReportTable;compact?:boolean}){
  const rows=compact?table.rows.filter(r=>r.total):table.rows;
  return <div className="report-table-wrap" role="region" aria-label={table.title} tabIndex={0}><table className="report-table"><thead><tr>{table.columns.map((c,i)=><th key={i} scope="col">{c.label}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i} className={row.total?'report-total':''}>{row.cells.map((value,c)=>{const type=cellType(table,row,c);const text=type==='text'?value:fmt(value,type==='percent');return c===0?<th key={c} scope="row">{text}</th>:<td key={c} className={String(value).startsWith('-')?'report-negative':''}>{text}{type==='points'&&value!==null?' pp':''}</td>;})}</tr>)}</tbody></table></div>;
}
export default function FinanceReports(props:Props){
  const {hotel,year,hotelName,initialId,onBack}=props;
  const latest=useRef(props);latest.current=props;
  const [options,setOptions]=useState<Version[]>([]),[selected,setSelected]=useState(''),[report,setReport]=useState<Report|null>(null);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[seq,setSeq]=useState(0);
  const [tab,setTab]=useState('客房部'),[allAccounts,setAllAccounts]=useState(false);
  const [month,setMonth]=useState(1),[group,setGroup]=useState('人事費用'),[search,setSearch]=useState('');
  const [drafts,setDrafts]=useState<Record<string,string>>({}),[taxDraft,setTaxDraft]=useState<TaxMode|null>(null);
  const savingLock=useRef(false),dirty=Object.keys(drafts).length>0||taxDraft!==null;
  useEffect(()=>{latest.current.onPendingChange(dirty||saving);},[dirty,saving]);
  useEffect(()=>()=>latest.current.onPendingChange(false),[]);
  useEffect(()=>{
    let active=true;setLoading(true);setReport(null);setError('');
    latest.current.request<Version[]>('/api/versions?hotel_id='+hotel+'&year='+year).then(versions=>{
      if(!active)return;const finance=versions.filter(v=>v.kind==='finance');setOptions(finance);
      setSelected(String(finance.find(v=>v.id===initialId)?.id??finance[finance.length-1]?.id??''));
      if(!finance.length)setLoading(false);
    }).catch(e=>{if(active){setError(e.message);setLoading(false);}});
    return()=>{active=false;};
  },[hotel,year]);
  useEffect(()=>{
    if(!selected)return;
    let active=true;setLoading(true);setReport(null);setError('');setDrafts({});setTaxDraft(null);
    loadReport(latest.current.request,Number(selected),hotel,year,hotelName).then(data=>{
      if(active){setReport(data);latest.current.onSelected(data.version);}
    }).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[selected,seq]);
  async function ensureSaved():Promise<Report|null>{
    if(!report||savingLock.current)return null;
    if(!dirty)return report;
    const mode=taxDraft??report.ledger.tax_mode;
    const items=Object.entries(drafts).map(([key,value])=>{const [month,code]=key.split('/');return {month:Number(month),code,amount:value};}).filter(i=>!(i.code==='8000101'&&taxAutomatic(mode,i.month)));
    try{patchLedger(report.ledger,mode,items);}catch(e){setError(e instanceof Error?e.message:String(e));return null;}
    savingLock.current=true;setSaving(true);setError('');
    try{
      await latest.current.request('/api/finance/'+report.version.id+'/pnl','PUT',{expected_revision:report.version.revision,tax_mode:mode,items});
      setDrafts({});setTaxDraft(null);setReport(null);
      const data=await loadReport(latest.current.request,report.version.id,hotel,year,hotelName);
      setReport(data);latest.current.onSelected(data.version);return data;
    }catch(e){setError(e instanceof Error?e.message:String(e));return null;}
    finally{savingLock.current=false;setSaving(false);}
  }
  async function changeTab(name:string){if(await ensureSaved())setTab(name);}
  const tables=useMemo(()=>report?reportTables(report):[],[report]);
  const table=tables.find(t=>t.name===tab),readOnly=report?.version.status!=='draft';
  const mode=taxDraft??report?.ledger.tax_mode??'source_excel';
  const visibleInputs=inputRows.filter(r=>(group==='全部'||r.group===group)&&(!search||(r.code+' '+r.name).includes(search)));
  const groups=[...new Set(inputRows.map(r=>r.group))];
  return <section className="finance-reports" aria-label="財務報表工作區">
    <div className="report-heading report-controls"><div><span className="eyebrow">FINANCIAL REPORTS</span><h2>財務報表</h2></div><button className="secondary" disabled={saving} onClick={async()=>{if(!report||await ensureSaved())onBack();}}>← 返回財務比較</button></div>
    <div className="report-controls report-selector"><label>報表版本<select aria-label="報表版本" value={selected} disabled={loading||saving||dirty||!options.length} onChange={e=>setSelected(e.target.value)}>{!options.length&&<option value="">尚無財務調整版本</option>}{options.map(v=><option value={v.id} key={v.id}>財務調整 #{v.id} · {v.status==='draft'?'草稿':'已提交'}</option>)}</select></label><div className="report-actions"><button className="secondary" disabled={!selected||loading||saving||dirty} onClick={()=>setSeq(n=>n+1)}>更新報表內容</button><button disabled={!report||loading||saving} onClick={async()=>{const data=await ensureSaved();if(data)try{downloadReport(data);}catch(e){setError(e instanceof Error?e.message:String(e));}}}>{saving?'儲存中…':dirty?'儲存並匯出 Excel':'下載 Excel（7 表）'}</button><button className="secondary" disabled={!report||loading||saving} onClick={async()=>{if(await ensureSaved()){if(tab==='edit')setTab('客房部');requestAnimationFrame(()=>window.print());}}}>列印／另存 PDF</button></div></div>
    {error&&<p role="alert" className="report-error">{error}</p>}
    {loading?<p className="report-empty" role="status">正在整理所選預算與報表…</p>:!report?<div className="report-empty"><strong>{options.length?'報表尚未就緒':'請先建立財務調整版本'}</strong><p>{options.length?'請更新報表內容後再匯出。':'從財務比較選定一份已提交來源，建立調整版後即可編列損益及輸出報表。'}</p></div>:<>
      <div className="report-print-heading"><h2>{table?.title??'客房部損益表'}{tab==='客房部'&&!allAccounts?'（摘要）':''}</h2><p>{report.hotelName} · {year} 年 · 財務 #{report.version.id}／修訂 {report.version.revision} · {report.version.status==='draft'?'草稿':'已提交'}</p><p>來源 #{report.source.source_id}／修訂 {report.source.source_revision} · {stamp(report)}（台北）</p></div>
      <div className="report-kpis report-controls">{[[43,'營業收入'],[220,'稅前損益'],[221,'所得稅費用'],[222,'稅後損益']].map(([id,title])=><div key={id}><span>{title}</span><strong className={report.pnl.find(p=>p.row.row===id)?.annual?.startsWith('-')?'report-negative':''}>{fmt(report.pnl.find(p=>p.row.row===id)?.annual)}</strong></div>)}</div>
      <div className="report-tabs report-controls" role="tablist" aria-label="報表種類">{tabs.map(([name,label])=><button role="tab" key={name} aria-selected={tab===name} disabled={saving} onClick={()=>void changeTab(name)}>{label}</button>)}</div>
      {tab==='edit'?<div className="pnl-editor" aria-label="損益科目編列">
        <div className="pnl-edit-controls"><label>月份<select aria-label="損益編列月份" value={month} disabled={saving} onChange={e=>setMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>{String(i+1).padStart(2,'0')} 月</option>)}</select></label><label>科目分類<select aria-label="損益科目分類" value={group} onChange={e=>setGroup(e.target.value)}><option>全部</option>{groups.map(g=><option key={g}>{g}</option>)}</select></label><label>搜尋<input aria-label="搜尋損益科目" value={search} onChange={e=>setSearch(e.target.value)} placeholder="科目代碼或名稱"/></label></div>
        <label className="pnl-tax-mode">所得稅方式<select aria-label="所得稅計算方式" value={mode} disabled={readOnly||saving} onChange={e=>setTaxDraft(e.target.value===report.ledger.tax_mode?null:e.target.value as TaxMode)}>{Object.entries(taxNames).map(([key,text])=><option key={key} value={key}>{text}</option>)}</select></label>
        <p className="report-footnote">金額以未稅編列；未填科目以 0 列報。房租收入依客房收入連動；退回／折讓若需抵減收入，請填負數。</p>
        {readOnly&&<p className="report-readonly">此版本已提交，科目僅供檢視。</p>}
        <div className="report-table-wrap"><table className="report-table pnl-input-table"><thead><tr><th>科目</th><th>{String(month).padStart(2,'0')} 月金額</th><th>全年合計（已儲存）</th></tr></thead><tbody>{visibleInputs.map(row=>{
          const automatic=row.calc==='tax'&&taxAutomatic(mode,month),key=month+'/'+row.code,pnl=report.pnl.find(p=>p.row.row===row.row)!;
          const value=automatic?pnl.months[month-1]??'0.000':drafts[key]??report.ledger.values[key]??'0.000';
          return <tr key={row.code}><th scope="row"><small>{row.code}</small>{row.name}</th><td className={automatic?'pnl-derived':''}><input aria-label={month+'月 '+row.code+' 金額'} inputMode="decimal" maxLength={20} disabled={readOnly||saving||automatic} value={value} onChange={e=>{const value=e.target.value;setDrafts(prev=>{const next={...prev};if(value===(report.ledger.values[key]??'0.000'))delete next[key];else next[key]=value;return next;});}}/></td><td>{fmt(pnl.annual)}</td></tr>;
        })}</tbody></table></div>
        <div className="pnl-save-bar"><span role="status">{saving?'儲存中…':dirty?'尚未儲存，報表將於儲存後更新':'已與版本同步'}</span><button className="secondary" disabled={!dirty||saving} onClick={()=>{if(window.confirm('捨棄尚未儲存的損益變更？')){setDrafts({});setTaxDraft(null);setError('');}}}>還原變更</button><button disabled={!dirty||saving||readOnly} onClick={()=>void ensureSaved()}>儲存損益編列</button></div>
      </div>:table&&<>
        {tab==='客房部'&&<label className="report-controls report-account-toggle"><input type="checkbox" checked={allAccounts} onChange={e=>setAllAccounts(e.target.checked)}/>顯示全部 206 科目</label>}
        <Table table={table} compact={tab==='客房部'&&!allAccounts}/>
      </>}
      <div className="report-footnote"><p>所得稅：{taxNames[report.ledger.tax_mode]}。年度比率依全年合計重算。</p><p>客房未稅收入採各月 REV ÷ 1.05 後加總；與全年一次除稅差額 {fmt(report.netDifference)}。Excel 包含完整科目及計算口徑。</p></div>
    </>}
  </section>;
}
