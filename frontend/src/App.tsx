import React, { useEffect, useRef, useState } from 'react';
import FinancialComparison from './FinancialComparison';
import VerticalBudget from './VerticalBudget';
import WorkspacePanel from './WorkspacePanel';

type Hotel = {id:number; code:string; name:string; room_count:number; revision:number};
type Inventory = {month:number; days:number; room_count:number; unavailable:number; available:number; revision:number};
type BudgetLine = {month:number; channel:string; rn:number; ahr:string; rev:string};
type Version = {id:number; kind:string; status:string; revision:number; created_by?:string};
type Role = 'hotel_editor' | 'central_editor' | 'finance' | 'hotel_admin' | 'legacy';
type Identity = {username:string; role:Role; hotel_ids:number[]};
type Mode = 'loading' | 'development' | 'legacy' | 'required' | 'error';
const API = import.meta.env.MODE==='demo'?'':(import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000' : ''));
const years = Array.from({length:15}, (_,index)=>2025+index);
const kindName = (kind:string) => kind==='hotel'?'各館':kind==='central'?'聯訂':'財務調整';
const statusName = (status:string) => status==='draft'?'草稿':status==='submitted'?'已提交':status;
const InfoTip = ({text,label='說明'}:{text:string;label?:string}) => <span className="ui-help" tabIndex={0} aria-label={`${label}：${text}`}><span aria-hidden="true">?</span><span className="ui-help-bubble" role="tooltip">{text}</span></span>;

export default function App({demo=false, transport=fetch, onDemoReset}:{demo?:boolean; transport?:typeof fetch; onDemoReset?:()=>void}) {
  const [mode,setMode] = useState<Mode>('loading');
  const [emp,setEmp] = useState('');
  const [password,setPassword] = useState('');
  const [authToken,setAuthToken] = useState('');
  const [identity,setIdentity] = useState<Identity|null>(null);
  const [entered,setEntered] = useState(false);
  const [loggingIn,setLoggingIn] = useState(false);
  const [workspace,setWorkspace] = useState<'edit'|'compare'>('edit');
  const [drawerOpen,setDrawerOpen] = useState(false);
  const [scopeOpen,setScopeOpen] = useState(false);
  const touchStart=useRef<{x:number;y:number}|null>(null);
  const [drawerBusy,setDrawerBusy] = useState(false);
  const [adminPassword,setAdminPassword] = useState('');
  const [adminToken,setAdminToken] = useState('');
  const [nameDraft,setNameDraft] = useState('');
  const [dragOver,setDragOver] = useState(false);
  const [compareReload,setCompareReload] = useState(0);
  const [hotels,setHotels] = useState<Hotel[]>([]);
  const [hotel,setHotel] = useState(1);
  const [year,setYear] = useState(2027);
  const [kind,setKind] = useState('hotel');
  const [versions,setVersions] = useState<Version[]>([]);
  const [chosen,setChosen] = useState<Version|null>(null);
  const [inv,setInv] = useState<Inventory[]>([]);
  const [versionInventory,setVersionInventory] = useState<Inventory[]|null>(null);
  const [lines,setLines] = useState<BudgetLine[]>([]);
  const [roomInput,setRoomInput] = useState('');
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const [importItems,setImportItems] = useState<{month:number;channel:string;rn:number;ahr:string}[]>([]);
  const [importErrors,setImportErrors] = useState<string[]>([]);
  const [loadSeq,setLoadSeq] = useState(0);
  const triggerRef = useRef<HTMLButtonElement|null>(null);
  const drawerRef = useRef<HTMLElement|null>(null);
  const fileMenuRef=useRef<HTMLDetailsElement|null>(null);
  const selectedHotel = hotels.find(h=>h.id===hotel);
  const role = identity?.role || 'legacy';
  const canCompare = role==='finance'||role==='legacy';
  const canCreate = role==='hotel_editor'||role==='central_editor'||role==='legacy';
  const canEditRooms = role==='finance'||role==='hotel_admin'||role==='legacy';
  const canAdmin = !demo&&(role==='hotel_admin'||role==='legacy');

  useEffect(()=>{
    transport(`${API}/api/auth/config`).then(async response=>{
      if(!response.ok) throw new Error('後端登入模式無法讀取');
      const result = await response.json() as {mode:'required'|'development'|'legacy'};
      setMode(result.mode);
    }).catch(()=>setMode('error'));
  },[]);
  useEffect(()=>{
    if(!message) return;
    const timeout = window.setTimeout(()=>setMessage(''),3000);
    return ()=>window.clearTimeout(timeout);
  },[message]);
  useEffect(()=>{
    setChosen(null);setLines([]);setImportItems([]);setImportErrors([]);
  },[hotel,year]);
  useEffect(()=>{setNameDraft(selectedHotel?.name||'');},[hotel,hotels]);
  useEffect(()=>{setRoomInput(selectedHotel?String(selectedHotel.room_count):'');},[selectedHotel?.id,selectedHotel?.room_count]);
  useEffect(()=>{
    if(!drawerOpen) return;
    const dialog = drawerRef.current;
    if(!dialog) return;
    const focusable = ()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')).filter(el=>el.getClientRects().length>0);
    focusable()[0]?.focus();
    const handler=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setDrawerOpen(false);return;}
      if(event.key!=='Tab') return;
      const items=focusable();
      if(!items.length){event.preventDefault();return;}
      const first=items[0],last=items[items.length-1];
      if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',handler);
    return ()=>{document.removeEventListener('keydown',handler);triggerRef.current?.focus();};
  },[drawerOpen]);

  useEffect(()=>{
    if(!entered)return;
    const start=(e:TouchEvent)=>{
      const t=e.touches[0];
      const target=e.target as HTMLElement;
      touchStart.current=t&&t.clientX<=28&&!target.closest('input,select,button,.vertical-scroll,dialog')?{x:t.clientX,y:t.clientY}:null;
    };
    const end=(e:TouchEvent)=>{
      const a=touchStart.current,t=e.changedTouches[0];touchStart.current=null;
      if(a&&t&&t.clientX-a.x>70&&Math.abs(t.clientY-a.y)<55&&window.innerWidth<=720&&!drawerOpen)setScopeOpen(true);
    };
    document.addEventListener('touchstart',start,{passive:true});document.addEventListener('touchend',end,{passive:true});
    return()=>{document.removeEventListener('touchstart',start);document.removeEventListener('touchend',end);};
  },[entered,drawerOpen]);

  function headers(json=true,token=authToken):Record<string,string> {
    return {...(json?{'Content-Type':'application/json'}:{}),
      ...(mode==='required'?{'Authorization':`Bearer ${token}`}:{'X-Employee-ID':emp})};
  }
  async function request<T>(path:string,method='GET',body?:unknown):Promise<T> {
    const response=await transport(`${API}${path}`,{method,headers:headers(),body:body===undefined?undefined:JSON.stringify(body)});
    let data:any;
    try{data=await response.json();}catch{throw new Error('伺服器回應格式不正確');}
    if(!response.ok){
      if(response.status===401&&mode==='required'){
        setAuthToken('');setEntered(false);setIdentity(null);
      }
      throw new Error(typeof data.detail==='string'?data.detail:`請求失敗（${response.status}）`);
    }
    return data as T;
  }
  const alertError = (error:unknown)=>setMessage(error instanceof Error?error.message:String(error));

  async function signIn(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!/^[A-Za-z0-9_-]{2,32}$/.test(emp)){setMessage('帳號需為 2–32 碼英數字、- 或 _');return;}
    if(mode==='development'||mode==='legacy'){
      setIdentity({username:emp,role:'legacy',hotel_ids:Array.from({length:12},(_,i)=>i+1)});
      setKind('hotel');setEntered(true);return;
    }
    setLoggingIn(true);
    try{
      const response=await transport(`${API}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:emp,password})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.detail||'登入失敗');
      const user=data.user as Identity;
      setAuthToken(data.access_token);setIdentity(user);setPassword('');
      setHotel(user.hotel_ids[0]);
      setKind(user.role==='central_editor'?'central':'hotel');
      setWorkspace('edit');setEntered(true);setMessage('登入成功');
    }catch(error){alertError(error);}finally{setLoggingIn(false);}
  }
  function logout(){
    setEntered(false);setAuthToken('');setIdentity(null);setPassword('');setAdminToken('');setAdminPassword('');
    setDrawerOpen(false);setScopeOpen(false);setChosen(null);setLines([]);setHotels([]);setInv([]);setVersions([]);
    setWorkspace('edit');
  }
  async function refresh(){
    if(!entered)return;
    try{
      const catalogue=await request<{hotels:Hotel[]}>('/api/catalog');
      setHotels(catalogue.hotels);
      if(!catalogue.hotels.length){setVersions([]);setInv([]);return;}
      if(!catalogue.hotels.some(h=>h.id===hotel)){
        setHotel(catalogue.hotels[0].id);return;
      }
      const [invent,ver]=await Promise.all([
        request<Inventory[]>(`/api/hotels/${hotel}/inventory/${year}`),
        request<Version[]>(`/api/versions?hotel_id=${hotel}&year=${year}`),
      ]);
      setInv(invent);setVersions(ver);
      if(chosen&&!ver.some(v=>v.id===chosen.id)){setChosen(null);setLines([]);}
      if(demo&&(!chosen||!ver.some(v=>v.id===chosen.id))&&ver.length){
        const recent=[...ver].sort((a,b)=>b.id-a.id);
        await selectVersion(recent.find(v=>v.status==='draft')||recent[0],false);
      }
    }catch(error){alertError(error);}
  }
  useEffect(()=>{void refresh();},[entered,hotel,year]);
  async function selectVersion(v:Version,closeMenu=true){
    try{
      const data=await request<{lines:BudgetLine[];revision:number;status:string;inventory_snapshot:Inventory[]|null}>(`/api/versions/${v.id}`);
      setChosen({...v,revision:data.revision,status:data.status});setLines(data.lines);setVersionInventory(data.inventory_snapshot);
      setLoadSeq(seq=>seq+1);setMessage('');if(closeMenu)setScopeOpen(false);
    }catch(error){alertError(error);}
  }
  async function createVersion(){
    if(!canCreate)return;
    try{
      const v=await request<Version>('/api/versions','POST',{hotel_id:hotel,year,kind});
      await refresh();await selectVersion({...v,kind});setMessage('新草稿已建立');
    }catch(error){alertError(error);}
  }
  async function deleteDraft(){
    if(!chosen||chosen.status!=='draft')return;
    if(!window.confirm(`確定刪除草稿 #${chosen.id}？此操作無法復原。`))return;
    try{
      await request(`/api/versions/${chosen.id}?expected_revision=${chosen.revision}`,'DELETE');
      setChosen(null);setLines([]);setVersions(values=>values.filter(v=>v.id!==chosen.id));setMessage('草稿已刪除');
    }catch(error){alertError(error);}
  }
  async function submit(){
    if(!chosen)return;
    try{
      const result=await request<{status:string;revision:number}>(`/api/versions/${chosen.id}/submit?expected_revision=${chosen.revision}`,'POST');
      setChosen({...chosen,...result});setVersions(list=>list.map(v=>v.id===chosen.id?{...v,...result}:v));setMessage('此版本已提交並鎖定編列');
    }catch(error){alertError(error);}
  }
  async function saveRooms(){
    if(!selectedHotel||busy||!canEditRooms)return;
    if(!/^[1-9]\d*$/.test(roomInput)||!Number.isSafeInteger(Number(roomInput))){setMessage('房間數必須是正整數');return;}
    setBusy(true);
    try{
      const data=await request<{room_count:number;revision:number}>(`/api/hotels/${hotel}/room-count`,'PUT',{room_count:Number(roomInput),expected_revision:selectedHotel.revision});
      setHotels(list=>list.map(h=>h.id===hotel?{...h,...data}:h));
      setInv(await request<Inventory[]>(`/api/hotels/${hotel}/inventory/${year}`));setMessage('房間數已儲存並重新計算可售房晚');
    }catch(error){alertError(error);await refresh();}finally{setBusy(false);}
  }
  async function inventorySave(month:number,value:string){
    if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))){setMessage('不可售房晚須為非負整數');return;}
    const old=inv.find(x=>x.month===month);
    if(!old)return;
    try{
      const data=await request<{unavailable:number;available:number;revision:number}>(`/api/hotels/${hotel}/inventory/${year}/${month}`,'PUT',{unavailable:Number(value),expected_revision:old.revision});
      setInv(list=>list.map(x=>x.month===month?{...x,...data}:x));setMessage(`${month} 月不可售房晚已儲存`);
    }catch(error){alertError(error);await refresh();}
  }
  async function importPreview(file:File){
    fileMenuRef.current?.removeAttribute('open');
    setImportItems([]);setImportErrors([]);
    if(!file.name.toLowerCase().endsWith('.xlsx')){setMessage('請選擇 .xlsx 檔案');return;}
    if(file.size>2_000_000){setMessage('檔案不得超過 2MB');return;}
    try{
      const bytes=new Uint8Array(await file.arrayBuffer());let raw='';
      for(const b of bytes)raw+=String.fromCharCode(b);
      const data=await request<{items:typeof importItems;errors:string[];count:number}>('/api/templates/budget-input/preview','POST',{base64_data:btoa(raw)});
      setImportItems(data.items);setImportErrors(data.errors);
      setMessage(data.errors.length?`Excel 檢查發現 ${data.errors.length} 項錯誤：${data.errors[0]}`:`匯入預覽完成，共 ${data.count} 筆，尚未寫入`);
    }catch(error){alertError(error);}
  }
  async function downloadTemplate(){
    try{
      const response=await transport(`${API}/api/templates/budget-input.xlsx`,{headers:headers(false)});
      if(!response.ok)throw new Error('範本下載失敗');
      const url=URL.createObjectURL(await response.blob());
      const a=document.createElement('a');a.href=url;a.download='budget_input_blank.xlsx';a.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(error){alertError(error);}
  }
  async function commitImport(){
    if(!chosen||chosen.status!=='draft'||importErrors.length||importItems.length!==108)return;
    try{
      await request(`/api/versions/${chosen.id}/lines/bulk`,'PUT',{expected_revision:chosen.revision,items:importItems});
      setImportItems([]);await selectVersion(chosen);setMessage(demo?'108 筆已匯入此分頁的展示草稿':'108 筆已匯入；正式金額由後端重新計算');
    }catch(error){alertError(error);}
  }
  async function createFinance(sourceId:number){
    try{
      const v=await request<Version>('/api/finance/from-source','POST',{source_version_id:sourceId});
      setWorkspace('edit');await refresh();await selectVersion({...v,kind:'finance'});
      setMessage('獨立財務調整草稿已建立，原來源及快照保持不變');
    }catch(error){alertError(error);}
  }
  async function enableAdmin(){
    if(!adminPassword)return;
    setDrawerBusy(true);
    try{
      const result=await request<{token:string}>('/api/admin/login','POST',{employee_id:emp,password:adminPassword});
      setAdminToken(result.token);setAdminPassword('');setMessage('管理員權限已啟用');
    }catch(error){alertError(error);}finally{setDrawerBusy(false);}
  }
  async function saveHotelName(){
    if(!selectedHotel||!adminToken)return;
    const name=nameDraft.trim();
    if(name.length<2||name.length>120){setMessage('飯店名稱需為 2–120 個字元');return;}
    setDrawerBusy(true);
    try{
      const response=await transport(`${API}/api/hotels/${hotel}/name`,{
        method:'PUT',headers:{...headers(),'X-Admin-Token':adminToken},
        body:JSON.stringify({name,expected_revision:selectedHotel.revision})
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.detail||'修改失敗');
      setHotels(list=>list.map(h=>h.id===hotel?{...h,name:data.name,revision:data.revision}:h));
      setMessage('飯店顯示名稱已更新');
    }catch(error){alertError(error);}finally{setDrawerBusy(false);}
  }

  if(mode==='loading')return <main className="v13-login"><div className="v13-login-card"><p>正在連線至預算系統…</p></div></main>;
  if(mode==='error')return <main className="v13-login"><div className="v13-login-card"><h1>後端連線失敗</h1><p>無法取得登入設定，請檢查 API 網址及伺服器狀態。</p><button onClick={()=>window.location.reload()}>重新連線</button></div></main>;
  if(demo&&!entered)return <main className="v13-login demo-welcome"><div className="v13-login-card">
    <span className="eyebrow">ANONYMOUS INTERACTIVE DEMO</span><div className="v13-login-mark">HB</div>
    <h1>年度客房預算展示版</h1><p>以 12 個匿名館別與自動產生的假數據，體驗預算編列、Excel 匯入及財務比較。</p>
    <div className="demo-welcome-actions">{(['edit','compare'] as const).map(w=><button key={w} onClick={()=>{
      setEmp('DEMO_VISITOR');setIdentity({username:'DEMO_VISITOR',role:'legacy',hotel_ids:Array.from({length:12},(_,i)=>i+1)});
      setWorkspace(w);setEntered(true);
    }}>{w==='edit'?'體驗預算編列':'體驗財務比較'}</button>)}</div>
    <small>免帳號、免密碼。修改只保存在目前瀏覽器分頁，不會同步到其他人或裝置；請勿輸入真實財務或個人資訊。</small>
  </div></main>;
  if(!entered)return <main className="v13-login"><div className="v13-login-card"><span className="eyebrow">ROOM REVENUE PLANNING</span><div className="v13-login-mark">HB</div><h1>年度客房預算管理</h1><p>{mode==='required'?'請以獲授權的帳號登入。版本與飯店資料將依角色範圍提供。':mode==='development'?'本機開發模式：不需要 signing key，只允許從本機連線；請輸入測試識別代號。':'相容測試模式：僅使用員工編號標記操作，不具身分認證效力。'}</p><form className="v13-login-form" onSubmit={signIn}><label htmlFor="login-user">{mode==='required'?'登入帳號':'測試員工編號'}</label><input id="login-user" autoComplete="username" required maxLength={32} value={emp} onChange={e=>setEmp(e.target.value)} placeholder="請輸入帳號"/>{mode==='required'&&<><label htmlFor="login-password">密碼</label><input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="請輸入密碼"/></>}<button disabled={loggingIn} type="submit">{loggingIn?'正在驗證…':'進入工作台 →'}</button></form><small className="v13-login-hint">{mode==='required'?'本地帳密模式不等於企業單一登入；正式上線仍需組織 IT 驗收。':mode==='development'?'Development 模式只允許本機；正式環境會強制拒絕。':'Legacy 模式僅供自動化相容測試，正式環境不可啟用。'}</small>{message&&<p className="v13-login-error" role="alert">{message}</p>}</div></main>;

  return <main className="erp-app v11-app v13-app">
    <nav className="work-navbar" aria-label="主要導覽">
      <button className="work-menu-trigger secondary" aria-label="開啟工作選單" aria-haspopup="dialog" aria-expanded={scopeOpen} onClick={()=>setScopeOpen(true)}><span aria-hidden="true">☰</span><span>工作選單</span></button>
      <a className="work-brand" href="#budget-workspace">客房預算<span>ROOM PLANNING</span></a>
      <div className="work-nav-tabs" role="tablist" aria-label="工作區切換"><button role="tab" aria-selected={workspace==='edit'} onClick={()=>setWorkspace('edit')}>預算編列</button><button role="tab" aria-selected={workspace==='compare'} disabled={!canCompare} onClick={()=>{setWorkspace('compare');setCompareReload(n=>n+1);}}>財務比較與帶入</button></div>
      <button className="work-context secondary" onClick={()=>setScopeOpen(true)} aria-label="變更目前工作範圍"><span>{selectedHotel?.name||'選擇館別'} · {year}</span><small>{chosen?'版本 #'+chosen.id+' · '+statusName(chosen.status):'選擇編列版本'} <span aria-hidden="true">⌄</span></small></button>
      <button ref={triggerRef} className="work-account secondary" onClick={()=>setDrawerOpen(true)} aria-label="開啟帳號與管理資訊" aria-haspopup="dialog" aria-expanded={drawerOpen}><span className="v13-avatar" aria-hidden="true">{emp.slice(0,1).toUpperCase()}</span><span className="work-account-label">{demo?'展示訪客':emp}</span></button>
    </nav>
    {demo&&<aside className="demo-banner" aria-label="匿名展示版說明"><div><strong>匿名展示</strong><span>假數據 · 僅存此分頁 · 請勿輸入真實資料</span></div><button className="secondary" onClick={()=>{if(window.confirm('重設此分頁的示範資料？所有展示修改將清除。'))onDemoReset?.();}}>重設示範資料</button></aside>}
    <div className="v152-main-content" id="budget-workspace" role="region" aria-label="Main Content Area">
    <header className="work-heading"><div><span className="eyebrow">ANNUAL ROOM BUDGET / {year}</span><h1>{workspace==='edit'?'年度客房預算':'財務比較與帶入'}</h1></div><span className="work-heading-note">{selectedHotel?.name} <span aria-hidden="true">/</span> {chosen?kindName(chosen.kind)+'預算 · #'+chosen.id:'尚未選擇版本'}</span></header>
    {workspace==='edit'&&<div className="v152-flow-row"><div className="v152-flow-label">編列流程 <InfoTip text="先選擇或建立預算版本，再完成收入與房間／房晚設定，最後檢查內容後提交。" label="編列流程"/></div><ol className="work-steps" aria-label="編列流程"><li className={!chosen?'current':'complete'} aria-current={!chosen?'step':undefined}><b>01</b> 選擇版本</li><li className={chosen?.status==='draft'?'current':''} aria-current={chosen?.status==='draft'?'step':undefined}><b>02</b> 編列收入與房晚</li><li className={chosen?.status==='submitted'?'current':''} aria-current={chosen?.status==='submitted'?'step':undefined}><b>03</b> 檢查後提交</li></ol></div>}
    {workspace==='compare'?<FinancialComparison key={`${hotel}-${year}-${compareReload}`} hotel={hotel} year={year} request={request} onCreateFinance={createFinance}/>:<>
      <section className="inventory-panel v13-inventory-panel"><details><summary className="setting-summary"><span><span className="v13-setting-icon" aria-hidden="true">▦</span> 房間數與可售房晚設定 <InfoTip text="可售房晚 = 房間數 × 當月天數 − 不可售房晚。調整不得使既有預算銷售房晚超過可售房晚；所有修改均有後端紀錄。" label="房間數與可售房晚設定"/></span><span className="v13-setting-hint">{selectedHotel?.room_count??'—'} 間 · 展開調整 <span aria-hidden="true">⌄</span></span></summary><div className="room-setting"><label>房間數<input aria-label="房間數" inputMode="numeric" type="number" min="1" step="1" value={roomInput} disabled={!canEditRooms} onChange={e=>setRoomInput(e.target.value)}/></label>{canEditRooms&&<button disabled={busy||!selectedHotel||roomInput===String(selectedHotel.room_count)} onClick={saveRooms}>儲存房間數</button>}<small>{canEditRooms?'房間數需為正整數':'房間數需由財務或管理角色修改'}</small></div><details className="inventory-details"><summary>12 個月不可售房晚調整</summary><div className="inventory">{inv.map(x=><div className="monthbox" key={x.month}><strong>{String(x.month).padStart(2,'0')} 月</strong><small>總房晚 {(x.room_count*x.days).toLocaleString()}</small><label>不可售<input type="number" min="0" step="1" key={`${hotel}-${year}-${x.month}-${x.revision}`} defaultValue={x.unavailable} onBlur={e=>{if(Number(e.target.value)!==x.unavailable)void inventorySave(x.month,e.target.value);}}/></label><small>可售 {x.available.toLocaleString()}</small></div>)}</div></details></details></section>
      <section className="budget-section v13-budget-section"><div className="section-title v13-section-head"><div><span className="v13-kicker">ROOM REVENUE PLAN</span><h2>客房收入預算 <InfoTip text="共 12 個月份 × 9 個通路；收入與 KPI 依既定財務規則計算。" label="客房收入預算說明"/></h2></div>{chosen&&<div className="work-editor-tools"><details className="budget-file-menu" ref={fileMenuRef}><summary>Excel 匯入與下載 <span aria-hidden="true">⌄</span></summary><div className="v11-file-tools v13-file-tools"><div className="v11-file-title"><span className="v13-file-mark" aria-hidden="true">XLSX</span><div><strong>Excel 批次匯入</strong><small>12 月 × 9 通路，108 筆輸入資料</small></div></div><button className="secondary" onClick={downloadTemplate}>↓ 下載範本</button><label className={`v11-dropzone ${dragOver?'is-dragging':''}`} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={e=>{e.preventDefault();setDragOver(false);}} onDrop={e=>{e.preventDefault();setDragOver(false);const file=e.dataTransfer.files?.[0];if(file)void importPreview(file);}}><span>↑ 拖放 .xlsx 或點擊選取</span><input aria-label="選擇匯入 Excel" type="file" accept=".xlsx" onChange={e=>{const file=e.target.files?.[0];if(file)void importPreview(file);e.currentTarget.value='';}}/></label></div></details><span className={`v13-status ${chosen.status==='draft'?'draft':'submitted'}`}>{statusName(chosen.status)} · #{chosen.id}</span></div>}</div>{!chosen?<div className="v13-empty-state"><strong>先選擇一份預算版本</strong><button className="secondary" onClick={()=>setScopeOpen(true)}>選擇或建立版本</button><p>從左上方工作選單建立草稿或選取版本，即可開始編列。</p></div>:<>{importItems.length>0&&<div className="import-review v13-import-review"><div><strong>匯入預覽：{importItems.length} 筆</strong><span>　異常 {importErrors.length} 筆；確認後才寫入草稿。</span></div><button disabled={chosen.status!=='draft'||importErrors.length>0||importItems.length!==108} onClick={commitImport}>確認匯入</button><button className="secondary" onClick={()=>{setImportItems([]);setImportErrors([]);}}>取消</button></div>}<VerticalBudget key={`${chosen.id}-${loadSeq}`} versionId={chosen.id} revision={chosen.revision} status={chosen.status} lines={lines} demo={demo} inventory={chosen.kind==='finance'&&versionInventory?versionInventory:inv} onSave={async items=>{const data=await request<{revision:number;lines:BudgetLine[]}>(`/api/versions/${chosen.id}/lines/bulk`,'PUT',{expected_revision:chosen.revision,items});setLines(old=>[...old.filter(x=>!data.lines.some(y=>y.month===x.month&&y.channel===x.channel)),...data.lines]);setChosen(v=>v?{...v,revision:data.revision}:v);setMessage(`已儲存 ${items.length} 筆資料`);}}/><div className="v13-submit-bar"><div><strong>{chosen.status==='draft'?'完成編列後提交版本':'此版本已提交'}</strong><p>提交後將鎖定編列；正式財務核定仍未開放。</p></div><button disabled={chosen.status!=='draft'||busy} onClick={submit}>提交此版本 →</button></div></>}</section>
    </>}
    </div>
    <WorkspacePanel open={scopeOpen} onClose={()=>setScopeOpen(false)}>
    <nav className="context-bar v13-filters v15-scope" aria-label="目前工作範圍"><div className="v13-filter-title"><span className="v13-filter-dot"/>目前工作範圍 <InfoTip text="館別、年度與編列來源會決定目前顯示及可編輯的預算資料。" label="目前工作範圍"/></div><label>目前館別<select aria-label="目前館別" value={hotel} onChange={e=>setHotel(Number(e.target.value))}>{hotels.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label><label>年度<select value={year} aria-label="預算年度" onChange={e=>setYear(Number(e.target.value))}>{years.map(y=><option value={y} key={y}>{y}</option>)}</select></label>{workspace==='edit'&&<label>編列來源<select value={kind} onChange={e=>setKind(e.target.value)} disabled={!canCreate}>{role==='hotel_editor'?<option value="hotel">各館預算</option>:role==='central_editor'?<option value="central">聯訂中心</option>:role==='finance'?<option value="hotel">由比較頁帶入</option>:role==='hotel_admin'?<option value="hotel">管理設定</option>:<><option value="hotel">各館預算</option><option value="central">聯訂中心</option></>}</select></label>}</nav>
    {workspace==='edit'&&<>
      <section className="version-panel v13-version-panel"><div className="section-title v13-section-head"><div><span className="v13-kicker">VERSION CONTROL</span><h2>選擇編列版本 <InfoTip text="各館、聯訂、財務調整各自保存；選定版本後才開始編列。" label="版本說明"/></h2></div>{canCreate&&<button onClick={createVersion} title="建立目前館別與年度的新草稿">＋ 建立新草稿</button>}</div><div className="versions v13-version-list">{versions.length?versions.map(v=><button className={`v13-version-card ${chosen?.id===v.id?'active':''}`} aria-pressed={chosen?.id===v.id} key={v.id} onClick={()=>selectVersion(v)}><span className="v13-version-id">版本 #{v.id}</span><strong>{kindName(v.kind)}預算</strong><span className={`v13-status ${v.status==='draft'?'draft':'submitted'}`}>{statusName(v.status)}</span></button>):<div className="v13-empty-inline">目前尚無可查看的版本。{canCreate?'請點選「建立新草稿」。':role==='finance'?'請等待各館或聯訂提交版本。':'此角色沒有預算編列權限。'}</div>}</div><div className="v11-version-tools v13-version-actions"><span className="v13-current-version">{chosen?`目前選取：#${chosen.id} · ${statusName(chosen.status)}`:'尚未選擇版本'}</span><button className="secondary" disabled={!chosen} title="放棄未儲存變更並重新讀取" onClick={async()=>{if(!chosen||!window.confirm('確定捨棄尚未儲存的編列內容並重新載入？'))return;await refresh();await selectVersion(chosen);}}>重新載入</button><button className="danger-btn" disabled={!chosen||chosen.status!=='draft'} onClick={deleteDraft}>刪除草稿</button></div></section>
    </>}
    <button className="work-continue" onClick={()=>setScopeOpen(false)}>返回目前工作區 →</button>
    </WorkspacePanel>
    {drawerOpen&&<div className="v11-drawer-backdrop" onMouseDown={()=>setDrawerOpen(false)}><aside className="v11-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-label="帳號與管理資訊" onMouseDown={e=>e.stopPropagation()}><div className="v11-drawer-head"><h2>帳號與管理資訊</h2><button className="secondary" aria-label="關閉抽屜" onClick={()=>setDrawerOpen(false)}>✕</button></div><div className="v11-drawer-body"><label>目前帳號</label><strong>{emp}</strong><p>{demo?'匿名展示訪客；不具正式權限或核定效力':<>角色：{role}　{mode==='required'?'已驗證登入':'測試識別（未驗證）'}</>}</p><button className="secondary" onClick={logout}>{demo?'返回展示首頁':'登出／切換帳號'}</button>{canAdmin&&<section className="v12-admin-section"><h3>飯店顯示名稱管理</h3><p>名稱更新需另行通過管理員密碼驗證，並會記錄異動。</p>{!adminToken?<><label htmlFor="admin-password">管理員密碼</label><input id="admin-password" type="password" autoComplete="off" value={adminPassword} onChange={e=>setAdminPassword(e.target.value)} placeholder="輸入獨立管理密碼"/><button disabled={drawerBusy||!adminPassword} onClick={enableAdmin}>驗證管理員權限</button></>:<><label htmlFor="admin-hotel">飯店</label><select id="admin-hotel" value={hotel} onChange={e=>setHotel(Number(e.target.value))}>{hotels.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select><label htmlFor="admin-name">顯示名稱</label><input id="admin-name" maxLength={120} value={nameDraft} onChange={e=>setNameDraft(e.target.value)}/><button disabled={drawerBusy||nameDraft.trim()===selectedHotel?.name} onClick={saveHotelName}>儲存顯示名稱</button><button className="secondary" onClick={()=>setAdminToken('')}>離開管理模式</button><small>管理憑證 15 分鐘內有效；改名不會修改既有預算快照。</small></>}</section>}</div></aside></div>}
    {message&&<aside className="toast-notice" role="alert" aria-live="assertive">{message}</aside>}
    <div className="app-status-bar v13-status-bar"><span className="status-dot" aria-hidden="true"/><span>{demo?'v1.7.0 匿名展示版':'v1.6.0 介面微調版'}</span><span className="status-separator">│</span><span>{year} 年</span><span className="status-separator">│</span><span>{chosen?`版本 #${chosen.id} · ${statusName(chosen.status)}`:'尚未選取版本'}</span><span className="status-spacer"/><span>{demo?'僅此分頁保存・可重設':mode==='required'?'角色與飯店授權已啟用':mode==='development'?'127.0.0.1 本機開發模式':'Legacy 相容測試識別'}</span></div>
  </main>;
}


