import React,{useEffect,useRef,useState} from 'react';
import {YearVersion,YearFigures,YearMonth,YearRequest,loadYearFigures,yearDelta} from './yearComparison';
import {fmt} from './reports/money';
const kindName=(kind:string)=>kind==='hotel'?'各館預算':kind==='central'?'聯訂預算':'財務調整';
const description=(v:YearVersion)=>kindName(v.kind)+' #'+v.id+' · '+(v.status==='submitted'?'已提交':'草稿');
const preferred=(vs:YearVersion[],kind?:string)=>{const eligible=kind?vs.filter(v=>v.kind===kind):vs;return [...eligible].reverse().find(v=>v.status==='submitted')??eligible[eligible.length-1];};
const metrics:[keyof Pick<YearMonth,'available'|'rn'|'rev'|'occ'>,string,string][]=[['available','可售房晚','房晚'],['rn','銷售房晚','R/N'],['rev','客房收入','REV · 含稅'],['occ','住房率','OCC %']];
export default function YearComparison({hotel,year,hotelName,initialId,initialKind,role,request}:{hotel:number;year:number;hotelName:string;initialId:number|null;initialKind:string;role:string;request:YearRequest}){
  const latest=useRef(request);latest.current=request;
  const [currentOptions,setCurrentOptions]=useState<YearVersion[]>([]),[previousOptions,setPreviousOptions]=useState<YearVersion[]>([]);
  const [currentId,setCurrentId]=useState(''),[previousId,setPreviousId]=useState(''),[current,setCurrent]=useState<YearFigures|null>(null),[previous,setPrevious]=useState<YearFigures|null>(null);
  const [period,setPeriod]=useState(-1),[error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0),[listsReady,setListsReady]=useState(false);
  useEffect(()=>{
    let active=true;setLoading(true);setListsReady(false);setError('');setCurrent(null);setPrevious(null);
    Promise.all([year,year-1].map(y=>latest.current<YearVersion[]>('/api/versions?hotel_id='+hotel+'&year='+y))).then(([now,before])=>{
      if(!active)return;const allowed=(v:YearVersion)=>role==='hotel_editor'?v.kind==='hotel':role==='central_editor'?v.kind==='central':true;
      now=now.filter(allowed);before=before.filter(allowed);setCurrentOptions(now);setPreviousOptions(before);
      const selected=now.find(v=>String(v.id)===currentId)??now.find(v=>v.id===initialId)??preferred(now,initialKind)??preferred(now);
      setCurrentId(selected?String(selected.id):'');const prior=before.find(v=>String(v.id)===previousId&&v.kind===(selected?.kind??initialKind))??preferred(before,selected?.kind??initialKind);setPreviousId(prior?String(prior.id):'');setListsReady(true);
    }).catch(e=>{if(active){setError(e.message);setLoading(false);}});
    return()=>{active=false;};
  },[hotel,year,retry]);
  useEffect(()=>{
    if(!listsReady)return;let active=true;setLoading(true);setError('');setCurrent(null);setPrevious(null);
    Promise.all([currentId?loadYearFigures(latest.current,Number(currentId),hotel,year):null,previousId?loadYearFigures(latest.current,Number(previousId),hotel,year-1):null]).then(([now,before])=>{if(active){setCurrent(now);setPrevious(before);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[listsReady,currentId,previousId,hotel,year]);
  const selected=currentOptions.find(v=>String(v.id)===currentId),priorOptions=previousOptions.filter(v=>v.kind===(selected?.kind??initialKind));
  const periods=period===-1?Array.from({length:13},(_,i)=>i):[period];
  return <section className="year-comparison v13-comparison" aria-label="年度預算比較">
    <div className="v13-compare-heading"><div><h2>年度預算比較</h2><p>{hotelName} · {year-1} 年與 {year} 年，同一月份並排檢視。</p></div><button className="secondary" disabled={loading} onClick={()=>setRetry(n=>n+1)}>更新比較資料</button></div>
    <p className="year-basis">比較兩年度預算，尚未包含實際營收。請選擇同一編列來源的版本；草稿與已提交版本會分別標示。</p>
    <div className="year-selectors"><label>{year} 年版本<select aria-label="本年度比較版本" disabled={loading||!currentOptions.length} value={currentId} onChange={e=>{const v=currentOptions.find(v=>String(v.id)===e.target.value)!;setCurrentId(e.target.value);const prior=preferred(previousOptions,v.kind);setPreviousId(prior?String(prior.id):'');}}>{!currentOptions.length&&<option value="">尚無預算版本</option>}{currentOptions.map(v=><option key={v.id} value={v.id}>{description(v)}</option>)}</select></label><label>{year-1} 年版本<select aria-label="去年度比較版本" disabled={loading||!priorOptions.length} value={previousId} onChange={e=>setPreviousId(e.target.value)}>{!priorOptions.length&&<option value="">尚無同來源版本</option>}{priorOptions.map(v=><option key={v.id} value={v.id}>{description(v)}</option>)}</select></label><label>比較期間<select aria-label="年度比較期間" value={period} onChange={e=>setPeriod(Number(e.target.value))}><option value={-1}>全年與 12 個月</option><option value={0}>全年度</option>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>{String(i+1).padStart(2,'0')} 月</option>)}</select></label></div>
    {error&&<p role="alert" className="report-error">{error}</p>}
    {loading?<p role="status">正在整理年度預算…</p>:error?null:!current?<p className="year-empty">{year} 年尚無可查看的預算，請先建立或選擇其他年度。</p>:<>
      {!previous&&<p className="year-empty" role="status">{year-1} 年尚無同來源的預算版本，去年數字與增減以「—」表示。</p>}
      <div className="comparison-scroll year-comparison-scroll" role="region" aria-label="去年與今年預算對照" tabIndex={0}><table className="comparison-table year-comparison-table"><thead><tr><th scope="col">期間／指標</th><th scope="col">{year-1} 年<small>{previousId?description(previousOptions.find(v=>String(v.id)===previousId)!):'尚無資料'}</small></th><th scope="col">{year} 年<small>{selected?description(selected):''}</small></th><th scope="col">增減<small>今年 − 去年</small></th></tr></thead><tbody>{periods.flatMap(month=>{
        const now=month?current.monthly[month-1]:current.annual,before=previous?(month?previous.monthly[month-1]:previous.annual):null;
        return metrics.map(([key,name,unit],i)=>{const delta=yearDelta(now[key],before?.[key]??null);return <tr key={month+'/'+key} className={(month===0?'year-annual ':'')+(i===0?'year-period-start':'')}><th scope="row"><span className="year-period">{month?String(month).padStart(2,'0')+' 月':'全年'}</span><strong>{name}</strong><small>{unit}</small></th><td>{fmt(before?.[key],key==='occ')}</td><td>{fmt(now[key],key==='occ')}</td><td className={String(delta).startsWith('-')?'report-negative':''}>{fmt(delta)}{delta!==null&&key==='occ'?' 百分點':''}</td></tr>;});
      })}</tbody></table></div>
      <p className="v13-metric-footnote">全年可售、房晚與收入採 12 個月合計；全年住房率＝全年銷售房晚 ÷ 全年可售房晚，不平均各月住房率。住房率增減以「百分點」表示。</p><p className="v13-metric-footnote">各館與聯訂依各年度目前的房晚設定；財務調整版沿用帶入時的房晚設定。沒有資料時顯示「—」，已編列為 0 則顯示 0。</p>
    </>}
  </section>;
}
