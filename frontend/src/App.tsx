import React, { useEffect, useRef, useState } from 'react';
import FinancialComparison from './FinancialComparison';
import FinanceReports from './FinanceReports';
import VerticalBudget from './VerticalBudget';
import WorkspacePanel from './WorkspacePanel';
import InfoTip from './InfoTip';
import YearComparison from './YearComparison';
import {hotelNames} from './demo/model';

type Hotel = {id:number; code:string; name:string; room_count:number; revision:number};
type Inventory = {month:number; days:number; room_count:number; unavailable:number; available:number; revision:number};
type BudgetLine = {month:number; channel:string; rn:number; ahr:string; rev:string};
type WorkingScope={hotel_id:number;year:number;kind:string;version_id:number|null};
type Version = {hotel_id?:number;year?:number;last_saved_at?:string|null;id:number; kind:string; status:string; revision:number; created_by?:string};
type Role = 'hotel_editor' | 'central_editor' | 'finance' | 'hotel_admin' | 'legacy';
type Identity = {username:string; role:Role; hotel_ids:number[]};
type Mode = 'loading' | 'development' | 'legacy' | 'required' | 'error';
const API = import.meta.env.MODE==='demo'?'':(import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000' : ''));
const years = Array.from({length:15}, (_,index)=>2025+index);
const kindName = (kind:string) => kind==='hotel'?'各館':kind==='central'?'聯訂':'財務調整';
const hotelName=(name?:string)=>name||'選擇館別';
const statusName = (status:string) => status==='draft'?'草稿':status==='submitted'?'已提交':status;

export default function App({demo=false, transport=fetch, onDemoReset}:{demo?:boolean; transport?:typeof fetch; onDemoReset?:()=>void}) {
  const [mode,setMode] = useState<Mode>('loading');
  const [emp,setEmp] = useState('');
  const [password,setPassword] = useState('');
  const [authToken,setAuthToken] = useState('');
  const [identity,setIdentity] = useState<Identity|null>(null);
  const [entered,setEntered] = useState(false);
  const [loggingIn,setLoggingIn] = useState(false);
  const [workspace,setWorkspace] = useState<'edit'|'compare'|'reports'|'yearly'>('edit');
  const [drawerOpen,setDrawerOpen] = useState(false);
  const [scopeOpen,setScopeOpen] = useState(false);
  const touchStart=useRef<{x:number;y:number}|null>(null);
  const [drawerBusy,setDrawerBusy] = useState(false);
  const [adminPassword,setAdminPassword] = useState('');
  const [adminToken,setAdminToken] = useState('');
  const [nameDraft,setNameDraft] = useState('');
  const [dragOver,setDragOver] = useState(false);
  const [compareReload,setCompareReload] = useState(0);
  const [editorPending,setEditorPending]=useState(false);
  const [reportId,setReportId]=useState<number|null>(null);
  const [hotels,setHotels] = useState<Hotel[]>([]);
  const [hotel,setHotel] = useState(1);
  const [year,setYear] = useState(2027);
  const [kind,setKind] = useState('hotel');
  const [entrySource,setEntrySource]=useState('hotel');
  const [entryHotel,setEntryHotel]=useState(1);
  const [versions,setVersions] = useState<Version[]>([]);
  const [chosen,setChosen] = useState<Version|null>(null);
  const [resumeNotice,setResumeNotice]=useState('');
  const [versionLoading,setVersionLoading]=useState(false);
  const restoring=useRef(false);
  const resumeVersion=useRef<number|null>(null);
  const selectionSeq=useRef(0);
  const sessionEpoch=useRef(0);
  const preferenceQueue=useRef<Promise<unknown>>(Promise.resolve());
  const resumeFallback=useRef(false);
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
  const canWriteChosen=!!chosen&&(role==='finance'?chosen.kind==='finance':role==='hotel_editor'?chosen.kind==='hotel':role==='central_editor'?chosen.kind==='central':role==='legacy');
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
    selectionSeq.current+=1;setVersionLoading(false);setChosen(null);setLines([]);setImportItems([]);setImportErrors([]);setReportId(null);
  },[hotel,year]);
  useEffect(()=>{setNameDraft(selectedHotel?.name||'');},[hotel,hotels]);
  useEffect(()=>{
    if(!editorPending)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return()=>window.removeEventListener('beforeunload',warn);
  },[editorPending]);
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
      if(a&&t&&t.clientX-a.x>70&&Math.abs(t.clientY-a.y)<55&&window.innerWidth<=720&&!drawerOpen&&!editorPending)setScopeOpen(true);
    };
    document.addEventListener('touchstart',start,{passive:true});document.addEventListener('touchend',end,{passive:true});
    return()=>{document.removeEventListener('touchstart',start);document.removeEventListener('touchend',end);};
  },[entered,drawerOpen,editorPending]);

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
      setIdentity({username:emp,role:entrySource==='finance'?'finance':entrySource==='central'?'central_editor':'hotel_editor',hotel_ids:Array.from({length:12},(_,i)=>i+1)});
      setKind(entrySource==='central'?'central':'hotel');setWorkspace(entrySource==='finance'?'compare':'edit');setEntered(true);return;
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
      setWorkspace(user.role==='finance'?'compare':'edit');setEntered(true);setMessage('登入成功');
    }catch(error){alertError(error);}finally{setLoggingIn(false);}
  }
  function logout(){
    sessionEpoch.current+=1;restoring.current=false;resumeVersion.current=null;selectionSeq.current+=1;setResumeNotice('');setVersionLoading(false);
    setEntered(false);setAuthToken('');setIdentity(null);setPassword('');setAdminToken('');setAdminPassword('');
    setDrawerOpen(false);setScopeOpen(false);setChosen(null);setLines([]);setHotels([]);setInv([]);setVersions([]);
    setWorkspace('edit');
  }
  async function refresh(){
    if(!entered)return;
    const epoch=sessionEpoch.current;
    try{
      const catalogue=await request<{hotels:Hotel[]}>('/api/catalog');
      if(epoch!==sessionEpoch.current)return;
      catalogue.hotels=catalogue.hotels.filter(h=>identity?.hotel_ids.includes(h.id));
      setHotels(catalogue.hotels);
      if(!catalogue.hotels.length){setVersions([]);setInv([]);return;}
      if(!catalogue.hotels.some(h=>h.id===hotel)){
        setHotel(catalogue.hotels[0].id);return;
      }
      const [invent,ver]=await Promise.all([
        request<Inventory[]>(`/api/hotels/${hotel}/inventory/${year}`),
        request<Version[]>(`/api/versions?hotel_id=${hotel}&year=${year}`),
      ]);
      if(epoch!==sessionEpoch.current)return;
      const allowed=ver.filter(v=>role==='hotel_editor'?v.kind==='hotel':role==='central_editor'?v.kind==='central':true);
      setInv(invent);setVersions(allowed);
      if(chosen&&!allowed.some(v=>v.id===chosen.id)){setChosen(null);setLines([]);}
      if(restoring.current){
        const target=allowed.find(v=>v.id===resumeVersion.current)??(resumeFallback.current?([...allowed].reverse().find(v=>v.status==='draft')??allowed[0]):undefined);
        resumeFallback.current=false;
        restoring.current=false;resumeVersion.current=null;
        if(target)await selectVersion(target);
      }
    }catch(error){alertError(error);}
  }
  useEffect(()=>{void refresh();},[entered,hotel,year]);
  function remember(scope:WorkingScope){
    const token=authToken;
    const operation=preferenceQueue.current.catch(()=>undefined).then(async()=>{
      const response=await transport('/api/me/workspace',{method:'PUT',headers:headers(true,token),body:JSON.stringify(scope)});
      if(!response.ok)throw new Error('無法記住工作範圍，請稍後再試');
    });
    preferenceQueue.current=operation;
    return operation;
  }
  useEffect(()=>{
    if(!entered||restoring.current)return;
    if(chosen?.hotel_id===hotel&&chosen.year===year&&chosen.kind===kind)return;
    void remember({hotel_id:hotel,year,kind,version_id:null}).catch(error=>setResumeNotice(error.message));
  },[entered,hotel,year,kind]);
  async function selectVersion(v:Version,closeMenu=true){
    const seq=++selectionSeq.current;setVersionLoading(true);
    try{
      const data=await request<{hotel_id:number;year:number;kind:string;last_saved_at:string|null;lines:BudgetLine[];revision:number;status:string;inventory_snapshot:Inventory[]|null}>(`/api/versions/${v.id}`);
      if(seq!==selectionSeq.current)return;
      setChosen({...v,hotel_id:data.hotel_id,year:data.year,kind:data.kind,last_saved_at:data.last_saved_at,revision:data.revision,status:data.status});setKind(data.kind);setLines(data.lines);setVersionInventory(data.inventory_snapshot);
      setLoadSeq(seq=>seq+1);setMessage('');setResumeNotice('');if(closeMenu)setScopeOpen(false);
      await remember({hotel_id:data.hotel_id,year:data.year,kind:data.kind,version_id:v.id});
    }catch(error){alertError(error);}finally{if(seq===selectionSeq.current)setVersionLoading(false);}
  }
  async function createVersion(){
    if(!canCreate)return;
    try{
      const v=await request<Version>('/api/versions','POST',{hotel_id:hotel,year,kind});
      await refresh();await selectVersion({...v,kind});setMessage('新草稿已建立');
    }catch(error){alertError(error);}
  }
  async function deleteDraft(){
    if(!chosen||chosen.status!=='draft'||!canWriteChosen)return;
    if(!window.confirm(`確定刪除草稿 #${chosen.id}？此操作無法復原。`))return;
    try{
      await request(`/api/versions/${chosen.id}?expected_revision=${chosen.revision}`,'DELETE');
      setChosen(null);setLines([]);setVersions(values=>values.filter(v=>v.id!==chosen.id));setMessage('草稿已刪除');
    }catch(error){alertError(error);}
  }
  async function submit(){
    if(!chosen||!canWriteChosen)return;
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
    if(!chosen||chosen.status!=='draft'||!canWriteChosen||importErrors.length||importItems.length!==108)return;
    try{
      await request(`/api/versions/${chosen.id}/lines/bulk`,'PUT',{expected_revision:chosen.revision,items:importItems});
      setImportItems([]);await selectVersion(chosen);setMessage('108 筆已匯入目前草稿，客房收入已重新計算');
    }catch(error){alertError(error);}
  }
  async function createFinance(sourceId:number){
    if(!canCompare)return;
    try{
      const v=await request<Version>('/api/finance/from-source','POST',{source_version_id:sourceId});
      setWorkspace('edit');await refresh();await selectVersion({...v,kind:'finance'});
      setMessage('財務調整預算已建立；可調整房晚與房價，再進入報表編列費用。');
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

  async function enterDemo(){
    const selectedRole:Role=entrySource==='finance'?'finance':entrySource==='central'?'central_editor':'hotel_editor';
    const name=`DEMO_${entrySource.toUpperCase()}_${entrySource==='hotel'?entryHotel:'ALL'}`;
    setLoggingIn(true);sessionEpoch.current+=1;setChosen(null);setLines([]);setVersionInventory(null);setResumeNotice('');restoring.current=true;
    try{
      const response=await transport('/api/me/workspace',{headers:{'X-Employee-ID':name}});const result=await response.json();
      const scope=result.workspace as WorkingScope|null;resumeVersion.current=scope?.version_id??null;resumeFallback.current=!scope&&!result.reason;
      if(result.reason)setResumeNotice('上次版本已無法使用，請重新選擇版本。');
      setEmp(name);setIdentity({username:name,role:selectedRole,hotel_ids:selectedRole==='hotel_editor'?[entryHotel]:Array.from({length:12},(_,i)=>i+1)});
      setKind(scope?.kind??(entrySource==='central'?'central':'hotel'));setHotel(scope?.hotel_id??(entrySource==='hotel'?entryHotel:1));setYear(scope?.year??2027);
      setWorkspace(entrySource==='finance'&&scope?.kind!=='finance'?'compare':'edit');setEntered(true);
    }catch(error){alertError(error);restoring.current=false;}finally{setLoggingIn(false);}
  }
  if(mode==='loading')return <main className="v13-login"><div className="v13-login-card"><p>正在連線至預算系統…</p></div></main>;
  if(mode==='error')return <main className="v13-login"><div className="v13-login-card"><h1>後端連線失敗</h1><p>無法取得登入設定，請檢查 API 網址及伺服器狀態。</p><button onClick={()=>window.location.reload()}>重新連線</button></div></main>;
  const sourcePicker=<label className="entry-source">編列來源<select aria-label="首頁編列來源" value={entrySource} onChange={e=>setEntrySource(e.target.value)}><option value="hotel">各館預算</option><option value="central">聯訂預算</option><option value="finance">財務調整與報表</option></select></label>;
  if(demo&&!entered)return <main className="v13-login demo-welcome"><div className="v13-login-card">
    <span className="eyebrow">ANNUAL ROOM BUDGET</span><div className="v13-login-mark">HB</div>
    <h1>年度客房預算</h1><p>管理各館年度預算，進行收入編列、Excel 匯入與財務比較。</p>
    {sourcePicker}
    {entrySource==='hotel'&&<label className="entry-source">館別<select aria-label="首頁館別" value={entryHotel} onChange={e=>setEntryHotel(Number(e.target.value))}>{Array.from({length:12},(_,i)=><option value={i+1} key={i}>{hotelNames[i]}</option>)}</select></label>}
    <p className="entry-description">{entrySource==='hotel'?'負責所屬館別的客房收入預算。':entrySource==='central'?'編列聯訂預算，與各館版本分開保存。':'比較已提交預算、調整收入與費用，並輸出損益報表。'}</p>
    <div className="demo-welcome-actions"><button disabled={loggingIn} onClick={enterDemo}>{entrySource==='finance'?'財務比較':'開始編列'}</button></div>

  </div></main>;
  if(!entered)return <main className="v13-login"><div className="v13-login-card"><span className="eyebrow">ROOM REVENUE PLANNING</span><div className="v13-login-mark">HB</div><h1>年度客房預算管理</h1><p>{mode==='required'?'選擇工作內容並登入；可操作的館別及預算，以帳號權限為準。':mode==='development'?'本機開發模式：不需要 signing key，只允許從本機連線；請輸入測試識別代號。':'相容測試模式：僅使用員工編號標記操作，不具身分認證效力。'}</p><form className="v13-login-form" onSubmit={signIn}>{sourcePicker}<label htmlFor="login-user">{mode==='required'?'登入帳號':'測試員工編號'}</label><input id="login-user" autoComplete="username" required maxLength={32} value={emp} onChange={e=>setEmp(e.target.value)} placeholder="請輸入帳號"/>{mode==='required'&&<><label htmlFor="login-password">密碼</label><input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="請輸入密碼"/></>}<button disabled={loggingIn} type="submit">{loggingIn?'正在驗證…':'進入工作台 →'}</button></form><small className="v13-login-hint">{mode==='required'?'本地帳密模式不等於企業單一登入；正式上線仍需組織 IT 驗收。':mode==='development'?'Development 模式只允許本機；正式環境會強制拒絕。':'Legacy 模式僅供自動化相容測試，正式環境不可啟用。'}</small>{message&&<p className="v13-login-error" role="alert">{message}</p>}</div></main>;

  return <main className="erp-app v11-app v13-app">
    <nav className="work-navbar" aria-label="主要導覽">
      <button className="work-brand" aria-label="年度客房預算，返回首頁" onClick={()=>{if(window.confirm('是否回到首頁？尚未儲存的內容將不會保留。'))logout();}}>年度客房預算</button>
      <div className="work-nav-tabs" role="tablist" aria-label="工作區切換"><button role="tab" aria-selected={workspace==='edit'} disabled={editorPending||versionLoading} onClick={()=>setWorkspace('edit')}>預算編列</button>{canCompare&&<button role="tab" aria-label="財務比較與帶入" aria-selected={workspace==='compare'||workspace==='reports'} disabled={!canCompare||editorPending} onClick={()=>{setWorkspace('compare');setCompareReload(n=>n+1);}}> <span className="nav-wide-label">財務比較與帶入</span><span className="nav-short-label">財務比較</span></button>}<button role="tab" aria-selected={workspace==='yearly'} disabled={editorPending||versionLoading} onClick={()=>setWorkspace('yearly')}>年度比較</button></div>
      <button className="work-menu-trigger secondary" disabled={editorPending||versionLoading} aria-label="開啟工作選單" title="工作範圍與編列版本" aria-haspopup="dialog" aria-expanded={scopeOpen} onClick={()=>setScopeOpen(true)}><span aria-hidden="true">⋯</span></button>
      <button ref={triggerRef} className="work-account secondary" onClick={()=>setDrawerOpen(true)} aria-label="開啟帳號與管理資訊" aria-haspopup="dialog" aria-expanded={drawerOpen}><span className="v13-avatar" aria-hidden="true">{emp.slice(0,1).toUpperCase()}</span><span className="work-account-label">{demo?'使用者':emp}</span></button>
    </nav>
    <div className="v152-main-content" id="budget-workspace" role="region" aria-label="Main Content Area">
    {workspace==='edit'&&<div className="v152-flow-row"><div className="v152-flow-label">編列流程 <InfoTip text="先選擇或建立預算版本，再完成收入與房間／房晚設定，最後檢查內容後提交。" label="編列流程"/></div><ol className="work-steps" aria-label="編列流程"><li className={!chosen?'current':'complete'} aria-current={!chosen?'step':undefined}><b>01</b> 選擇版本</li><li className={chosen?.status==='draft'?'current':''} aria-current={chosen?.status==='draft'?'step':undefined}><b>02</b> 編列收入與房晚</li><li className={chosen?.status==='submitted'?'current':''} aria-current={chosen?.status==='submitted'?'step':undefined}><b>03</b> 檢查後提交</li></ol></div>}
    {workspace==='yearly'?<YearComparison key={hotel+'-'+year} hotel={hotel} year={year} hotelName={hotelName(selectedHotel?.name)} initialId={chosen?.id??null} initialKind={chosen?.kind??kind} role={role} request={request}/>:workspace==='reports'?<FinanceReports key={hotel+'-'+year} hotel={hotel} year={year} hotelName={hotelName(selectedHotel?.name)} initialId={reportId} request={request} onBack={()=>setWorkspace('compare')} onSelected={v=>{void selectVersion(v);}} onPendingChange={setEditorPending}/>:workspace==='compare'?<FinancialComparison key={`${hotel}-${year}-${compareReload}`} hotel={hotel} year={year} request={request} onCreateFinance={createFinance} onOpenReports={()=>{setReportId(chosen?.kind==='finance'?chosen.id:null);setWorkspace('reports');}} showNotes={!demo}/>:<>
      <header className="work-heading work-hero" aria-label="編列版本操作">{canCreate&&<button disabled={editorPending||versionLoading} onClick={createVersion}>＋ 建立新草稿</button>}{workspace==='edit'&&<section className="resume-strip" aria-label="接續編列資訊">
      <div><strong>{chosen?'接續上次編列':'開始編列'}</strong><p>{hotelName(selectedHotel?.name)} · {year} 年 · {kindName(chosen?.kind??kind)}預算{chosen?` · ${statusName(chosen.status)} #${chosen.id}`:''}</p>
      <small>{chosen?`上次儲存：${chosen.last_saved_at?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(chosen.last_saved_at))+'（台北時間）':'尚無儲存紀錄'}`:'請選擇或建立草稿。'}{editorPending?' · 尚有內容未儲存':''}</small>{resumeNotice&&<p role="status">{resumeNotice}</p>}</div>
      <button className="secondary" disabled={editorPending||versionLoading} onClick={()=>setScopeOpen(true)}>{chosen?'切換版本':'選擇版本'}</button>
    </section>}</header>
      {chosen?.kind==='finance'&&<aside className="finance-next-steps" aria-label="財務調整操作流程"><strong>財務調整接下來怎麼做？</strong><p>① 調整房晚、房價　② 編列人事與費用　③ 檢查損益　④ 匯出報表或提交版本。</p><small>按「儲存並預覽報表」，即可繼續編列費用。</small></aside>}
      <section className="inventory-panel v13-inventory-panel"><details><summary className="setting-summary"><span><span className="v13-setting-icon" aria-hidden="true">▦</span> 房間數與可售房晚設定 <InfoTip text="可售房晚 = 房間數 × 當月天數 − 不可售房晚。不可售房晚包含維修、停用等房間；調整後仍須足夠容納已編列的銷售房晚。" label="房間數與可售房晚設定"/></span><span className="v13-setting-hint">{selectedHotel?.room_count??'—'} 間 · 展開調整 <span aria-hidden="true">⌄</span></span></summary><div className="room-setting"><label>房間數<input aria-label="房間數" inputMode="numeric" type="number" min="1" step="1" value={roomInput} disabled={!canEditRooms} onChange={e=>setRoomInput(e.target.value)}/></label>{canEditRooms&&<button disabled={busy||!selectedHotel||roomInput===String(selectedHotel.room_count)} onClick={saveRooms}>儲存房間數</button>}<small>{canEditRooms?'房間數需為正整數':'房間數需由財務或管理角色修改'}</small></div><details className="inventory-details"><summary>12 個月不可售房晚調整</summary><div className="inventory">{inv.map(x=><div className="monthbox" key={x.month}><strong>{String(x.month).padStart(2,'0')} 月</strong><small>總房晚 {(x.room_count*x.days).toLocaleString()}</small><label>不可售<input type="number" min="0" step="1" key={`${hotel}-${year}-${x.month}-${x.revision}`} defaultValue={x.unavailable} onBlur={e=>{if(Number(e.target.value)!==x.unavailable)void inventorySave(x.month,e.target.value);}}/></label><small>可售 {x.available.toLocaleString()}</small></div>)}</div></details></details></section>
      <section className="budget-section v13-budget-section"><div className="section-title v13-section-head"><div><span className="v13-kicker">ROOM REVENUE PLAN</span><h2>客房收入預算 <InfoTip text="共 12 個月份 × 9 個通路；收入與 KPI 依既定財務規則計算。" label="客房收入預算說明"/></h2></div>{chosen&&<div className="work-editor-tools"><details className="budget-file-menu" ref={fileMenuRef}><summary>Excel 匯入與下載 <span aria-hidden="true">⌄</span></summary><div className="v11-file-tools v13-file-tools"><div className="v11-file-title"><span className="v13-file-mark" aria-hidden="true">XLSX</span><div><strong>Excel 批次匯入</strong><span className="import-example" tabIndex={0} aria-label="批次匯入範例說明">ⓘ<span role="tooltip">舉例說明：12 個月 × 9 個通路，共 108 筆輸入資料；實際請依下載範本填寫。</span></span></div></div><button className="secondary" onClick={downloadTemplate}>↓ 下載範本</button><label className={`v11-dropzone ${dragOver?'is-dragging':''}`} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={e=>{e.preventDefault();setDragOver(false);}} onDrop={e=>{e.preventDefault();setDragOver(false);const file=e.dataTransfer.files?.[0];if(file)void importPreview(file);}}><span>↑ 拖放 .xlsx 或點擊選取</span><input aria-label="選擇匯入 Excel" type="file" accept=".xlsx" onChange={e=>{const file=e.target.files?.[0];if(file)void importPreview(file);e.currentTarget.value='';}}/></label></div></details><span className={`v13-status ${chosen.status==='draft'?'draft':'submitted'}`}>{statusName(chosen.status)} · #{chosen.id}</span></div>}</div>{!chosen?<div className="v13-empty-state"><strong>先選擇一份預算版本</strong><button className="secondary" onClick={()=>setScopeOpen(true)}>選擇或建立版本</button><p>從左上方工作選單建立草稿或選取版本，即可開始編列。</p></div>:<>{importItems.length>0&&<div className="import-review v13-import-review"><div><strong>匯入預覽：{importItems.length} 筆</strong><span>　異常 {importErrors.length} 筆；確認後才寫入草稿。</span></div><button disabled={chosen.status!=='draft'||!canWriteChosen||importErrors.length>0||importItems.length!==108} onClick={commitImport}>確認匯入</button><button className="secondary" onClick={()=>{setImportItems([]);setImportErrors([]);}}>取消</button></div>}<VerticalBudget key={`${chosen.id}-${loadSeq}`} allowOverride={chosen.kind==='finance'} versionId={chosen.id} revision={chosen.revision} status={canWriteChosen?chosen.status:'submitted'} lines={lines} readOnly={versionLoading} onPendingChange={setEditorPending} onOpenReport={chosen.kind==='finance'&&canCompare?()=>{setReportId(chosen.id);setWorkspace('reports');}:undefined} inventory={chosen.kind==='finance'&&versionInventory?versionInventory:inv} onSave={async items=>{const data=await request<{revision:number;last_saved_at:string|null;lines:BudgetLine[]}>(`/api/versions/${chosen.id}/lines/bulk`,'PUT',{expected_revision:chosen.revision,items});setLines(old=>[...old.filter(x=>!data.lines.some(y=>y.month===x.month&&y.channel===x.channel)),...data.lines]);setChosen(v=>v?{...v,last_saved_at:data.last_saved_at,revision:data.revision}:v);setMessage(`已儲存 ${items.length} 筆資料`);}}/><div className="v13-submit-bar"><div><strong>{chosen.status==='draft'?'完成編列後提交版本':'此版本已提交'}</strong><p>提交後將鎖定此版本的編列內容。</p></div><button disabled={chosen.status!=='draft'||!canWriteChosen||busy||editorPending} onClick={submit}>提交此版本 →</button></div></>}</section>
    </>}
    </div>
    <WorkspacePanel open={scopeOpen} onClose={()=>setScopeOpen(false)}>
    <nav className="context-bar v13-filters v15-scope" aria-label="目前工作範圍"><div className="v13-filter-title"><span className="v13-filter-dot"/>目前工作範圍 <InfoTip text="館別、年度與編列來源會決定目前顯示及可編輯的預算資料。" label="目前工作範圍"/></div><label>目前館別<select aria-label="目前館別" value={hotel} disabled={role==='hotel_editor'&&hotels.length===1} onChange={e=>setHotel(Number(e.target.value))}>{hotels.map(h=><option key={h.id} value={h.id}>{hotelName(h.name)}</option>)}</select></label><label>年度<select value={year} aria-label="預算年度" onChange={e=>setYear(Number(e.target.value))}>{years.map(y=><option value={y} key={y}>{y}</option>)}</select></label></nav>
    {workspace==='edit'&&<>
      <section className="version-panel v13-version-panel"><div className="section-title v13-section-head"><div><span className="v13-kicker">VERSION CONTROL</span><h2>選擇編列版本 <InfoTip text="各館、聯訂、財務調整各自保存；選定版本後才開始編列。" label="版本說明"/></h2></div></div><div className="versions v13-version-list">{versions.length?versions.map(v=><button className={`v13-version-card ${chosen?.id===v.id?'active':''}`} aria-pressed={chosen?.id===v.id} key={v.id} onClick={()=>selectVersion(v)}><span className="v13-version-id">版本 #{v.id}</span><strong>{kindName(v.kind)}預算</strong><span className={`v13-status ${v.status==='draft'?'draft':'submitted'}`}>{statusName(v.status)}</span></button>):<div className="v13-empty-inline">目前尚無可查看的版本。{canCreate?'請返回主畫面建立新草稿。':role==='finance'?'請等待各館或聯訂提交版本。':'此角色沒有預算編列權限。'}</div>}</div><div className="v11-version-tools v13-version-actions"><span className="v13-current-version">{chosen?`目前選取：#${chosen.id} · ${statusName(chosen.status)}`:'尚未選擇版本'}</span><button className="secondary" disabled={!chosen} title="放棄未儲存變更並重新讀取" onClick={async()=>{if(!chosen||!window.confirm('確定捨棄尚未儲存的編列內容並重新載入？'))return;await refresh();await selectVersion(chosen);}}>重新載入</button><button className="danger-btn" disabled={!chosen||chosen.status!=='draft'||!canWriteChosen} onClick={deleteDraft}>刪除草稿</button></div></section>
    </>}
    <button className="work-continue" onClick={()=>setScopeOpen(false)}>返回目前工作區 →</button>
    </WorkspacePanel>
    {drawerOpen&&<div className="v11-drawer-backdrop" onMouseDown={()=>setDrawerOpen(false)}><aside className="v11-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-label="帳號與管理資訊" onMouseDown={e=>e.stopPropagation()}><div className="v11-drawer-head"><h2>帳號與管理資訊</h2><button className="secondary" aria-label="關閉抽屜" onClick={()=>setDrawerOpen(false)}>✕</button></div><div className="v11-drawer-body"><label>目前帳號</label><strong>{demo?'使用者':emp}</strong><p>{demo?'目前資料保存在此瀏覽器分頁':<>角色：{role}　{mode==='required'?'已驗證登入':'測試識別（未驗證）'}</>}</p><small className="account-build">系統版本 2.1.0</small><button className="secondary" onClick={logout}>{demo?'返回首頁':'登出／切換帳號'}</button>{demo&&<button className="secondary" onClick={()=>{if(window.confirm('重設目前分頁的資料？所有修改將清除。'))onDemoReset?.();}}>重設資料</button>}{canAdmin&&<section className="v12-admin-section"><h3>飯店顯示名稱管理</h3><p>名稱更新需另行通過管理員密碼驗證，並會記錄異動。</p>{!adminToken?<><label htmlFor="admin-password">管理員密碼</label><input id="admin-password" type="password" autoComplete="off" value={adminPassword} onChange={e=>setAdminPassword(e.target.value)} placeholder="輸入獨立管理密碼"/><button disabled={drawerBusy||!adminPassword} onClick={enableAdmin}>驗證管理員權限</button></>:<><label htmlFor="admin-hotel">飯店</label><select id="admin-hotel" value={hotel} onChange={e=>setHotel(Number(e.target.value))}>{hotels.map(h=><option key={h.id} value={h.id}>{hotelName(h.name)}</option>)}</select><label htmlFor="admin-name">顯示名稱</label><input id="admin-name" maxLength={120} value={nameDraft} onChange={e=>setNameDraft(e.target.value)}/><button disabled={drawerBusy||nameDraft.trim()===selectedHotel?.name} onClick={saveHotelName}>儲存顯示名稱</button><button className="secondary" onClick={()=>setAdminToken('')}>離開管理模式</button><small>管理憑證 15 分鐘內有效；改名不會修改既有預算快照。</small></>}</section>}</div></aside></div>}
    {message&&<aside className="toast-notice" role="alert" aria-live="assertive">{message}</aside>}
  </main>;
}


