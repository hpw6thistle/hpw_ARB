import React, {useEffect,useMemo,useState} from 'react';

type Month = {month:number;rn:number;rev:string;adr:string;occ_pct:string|null;revpar:string|null;available:number};
type FinanceVersion = {id:number;kind:string;status:string;source_id:number|null;source_revision:number|null;monthly:Month[];annual:{rn:number;rev:string;adr:string;occ_pct:string|null;revpar:string|null}};
type Metric = 'rev'|'rn'|'adr'|'occ_pct'|'revpar';
const metrics:{key:Metric;name:string;detail:string;unit:string}[] = [
  {key:'rev',name:'客房收入',detail:'Revenue',unit:'元'},
  {key:'rn',name:'銷售房晚',detail:'Room Nights',unit:'房晚'},
  {key:'adr',name:'平均房價',detail:'ADR / AHR',unit:'元'},
  {key:'occ_pct',name:'住房率',detail:'Occupancy',unit:'%'},
  {key:'revpar',name:'每可售房收入',detail:'RevPAR',unit:'元'},
];
const name=(kind:string)=>kind==='hotel'?'各館預算':kind==='central'?'聯訂預算':'財務調整';
const status=(value:string)=>value==='draft'?'草稿':value==='submitted'?'已提交':value;
const format=(n:string|number|null|undefined,isPercent=false)=>n==null?'—':Number(n).toLocaleString('zh-TW',{maximumFractionDigits:3,minimumFractionDigits:0})+(isPercent?'%':'');

export default function FinancialComparison({hotel,year,request,onCreateFinance}:{hotel:number;year:number;request:<T>(path:string,method?:string,body?:unknown)=>Promise<T>;onCreateFinance:(id:number)=>Promise<void>}){
  const [versions,setVersions]=useState<FinanceVersion[]>([]);
  const [chosen,setChosen]=useState<number[]>([]);
  const [sourceId,setSourceId]=useState('');
  const [error,setError]=useState('');
  const [month,setMonth]=useState(0);
  const [loading,setLoading]=useState(true);
  const [copying,setCopying]=useState(false);
  async function reload(resetSelection=false){
    setLoading(true);
    try{
      const data=await request<{versions:FinanceVersion[]}>(`/api/finance/compare?hotel_id=${hotel}&year=${year}`);
      setVersions(data.versions);
      setChosen(previous=>{
        const retained=previous.filter(id=>data.versions.some(v=>v.id===id));
        return resetSelection||retained.length===0?data.versions.slice(-3).map(v=>v.id):retained;
      });
      setError('');
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  }
  useEffect(()=>{void reload(true);},[hotel,year]);
  const selected=useMemo(()=>versions.filter(v=>chosen.includes(v.id)),[versions,chosen]);
  const submitted=versions.filter(v=>v.status==='submitted'&&(v.kind==='hotel'||v.kind==='central'));
  useEffect(()=>{if(!submitted.some(v=>String(v.id)===sourceId))setSourceId(submitted.length?String(submitted[submitted.length-1].id):'');},[versions]);
  function choose(id:number,enabled:boolean){
    setChosen(current=>{
      if(!enabled)return current.filter(x=>x!==id);
      if(current.includes(id))return current;
      if(current.length>=4){setError('最多並排比較 4 個版本。請取消勾選一個版本後再新增。');return current;}
      setError('');return [...current,id];
    });
  }
  const metricValue=(v:FinanceVersion,key:Metric)=>month===0?v.annual[key]:v.monthly[month-1]?.[key];
  async function copySource(){
    if(!sourceId||copying)return;
    setCopying(true);setError('');
    try{await onCreateFinance(Number(sourceId));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setCopying(false);}
  }

  return <section className="comparison-workspace v13-comparison">
    <div className="v13-compare-heading"><div><span className="v13-kicker">FINANCE WORKSPACE</span><h2>財務版本比較與帶入</h2><p>將已提交的各館、聯訂預算與獨立財務調整版並排檢視。</p></div><button className="secondary" onClick={()=>void reload()} disabled={loading}>↻ 重新載入</button></div>
    <div className="v13-compare-principle"><span className="v13-principle-icon" aria-hidden="true">i</span><div><strong>財務口徑提醒</strong><p>各館與聯訂是同一飯店的兩套獨立預測，不能直接相加。財務版保留建立當時的來源及房間數／可售房晚快照，原版不受調整影響。</p></div></div>
    <div className="v13-compare-body">
      <div className="v13-selector-pane"><div className="v13-pane-heading"><div><span className="v13-kicker">STEP 01</span><h3>比較版本</h3></div><small>{chosen.length} / 4 已選取</small></div><p className="muted">勾選最多 4 份版本，右側即時顯示 KPI 對照。</p>
        {loading?<p className="v13-compare-placeholder">正在載入版本…</p>:versions.length===0?<div className="v13-compare-placeholder">尚無可供比較的版本。請先由各館或聯訂提交預算。</div>:<div className="v13-version-choices">{versions.map(v=><label key={v.id} className={`v13-compare-choice ${chosen.includes(v.id)?'selected':''}`}><input type="checkbox" checked={chosen.includes(v.id)} onChange={e=>choose(v.id,e.target.checked)} disabled={!chosen.includes(v.id)&&chosen.length===4}/><span className="v13-choice-body"><strong>{name(v.kind)} <span>#{v.id}</span></strong><small>{status(v.status)}{v.source_id?` · 來源 #${v.source_id}`:''}</small></span><span aria-hidden="true" className="v13-choice-check">✓</span></label>)}</div>}
      </div>
      <div className="v13-metrics-pane"><div className="v13-pane-heading"><div><span className="v13-kicker">STEP 02</span><h3>指標對照</h3></div><label className="v13-period-select">比較期間<select aria-label="比較期間" value={month} onChange={e=>setMonth(Number(e.target.value))}><option value={0}>全年度</option>{Array.from({length:12},(_,i)=><option value={i+1} key={i}>{String(i+1).padStart(2,'0')} 月</option>)}</select></label></div>
        {error&&<p role="alert" className="comparison-error v13-comparison-error">{error}</p>}
        {selected.length===0?<div className="v13-compare-placeholder v13-table-placeholder"><strong>尚未選取版本</strong><p>請在左側勾選版本，以檢視各項財務指標。</p></div>:<div className="comparison-scroll v13-comparison-scroll" role="region" aria-label="版本財務指標對照" tabIndex={0}><table className="comparison-table v13-comparison-table"><thead><tr><th scope="col"><span>FINANCIAL METRICS</span><strong>財務指標</strong></th>{selected.map(v=><th key={v.id} scope="col"><strong>{name(v.kind)}</strong><small>版本 #{v.id} · {status(v.status)}</small>{v.source_id&&<small>來源 #{v.source_id}（修訂 {v.source_revision}）</small>}</th>)}</tr></thead><tbody>{metrics.map(m=><tr key={m.key}><th scope="row"><strong>{m.name}</strong><small>{m.detail} · {m.unit}</small></th>{selected.map(v=><td key={v.id}>{format(metricValue(v,m.key),m.key==='occ_pct')}</td>)}</tr>)}</tbody></table></div>}
        <p className="v13-metric-footnote">年度 ADR、OCC%、RevPAR 依全年合計重新計算，不採月平均；金額至多顯示三位小數。</p>
      </div>
    </div>
    <div className="v13-finance-transfer"><div className="v13-transfer-caption"><span className="v13-kicker">STEP 03 / SOURCE SNAPSHOT</span><h3>帶入財務調整版</h3><p>選定一份已提交的來源預算，建立<strong>獨立</strong>的財務草稿與當下房間數／可售房晚快照。來源版本維持唯讀，不會被覆蓋。</p></div><div className="v13-transfer-controls"><label htmlFor="finance-source-select">來源版本<select id="finance-source-select" aria-label="來源版本" value={sourceId} onChange={e=>setSourceId(e.target.value)} disabled={!submitted.length||copying}><option value="">{submitted.length?'請選擇來源':'尚無已提交的來源'}</option>{submitted.map(v=><option value={v.id} key={v.id}>#{v.id} {name(v.kind)} · 已提交</option>)}</select></label><button disabled={!sourceId||copying} onClick={()=>void copySource()}>{copying?'正在建立…':'建立財務調整草稿 →'}</button></div></div>
    <p className="muted v13-compare-disclaimer">正式財務核定、前年度資料與每月實績匯入尚未開放，需完成主管授權規則確認。</p>
  </section>;
}
