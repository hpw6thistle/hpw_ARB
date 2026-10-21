import React, {useEffect, useRef} from 'react';

/** Native modal makes the background inert; Tab also wraps within our controls. */
export default function WorkspacePanel({open,onClose,children}:{open:boolean;onClose:()=>void;children:React.ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const dialog=ref.current;
    if(!dialog||!open)return;
    const previous=document.activeElement as HTMLElement|null;
    dialog.showModal();
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    return ()=>{dialog.close();document.body.style.overflow=overflow;previous?.focus();};
  },[open]);
  return <dialog ref={ref} className="workspace-panel" aria-label="工作範圍與編列版本" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}} onKeyDown={e=>{
    if(e.key!=='Tab')return;
    const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]')).filter(el=>el.getClientRects().length>0);
    const first=items[0],last=items[items.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  }}>
    <div className="workspace-panel-inner">
      <div className="workspace-panel-heading"><div><small>WORKSPACE</small><h2>工作範圍與編列版本</h2></div><button className="secondary" aria-label="關閉工作選單" onClick={onClose}>✕</button></div>
      {children}
    </div>
  </dialog>;
}
