import React,{useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

export default function InfoTip({text,label='說明',triggerText}:{text:string;label?:string;triggerText?:string}){
  const [open,setOpen]=useState(false),ref=useRef<HTMLDialogElement>(null),id=useId();
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement|null,dialog=ref.current;
    dialog?.showModal();
    return()=>{dialog?.close();previous?.focus();};
  },[open]);
  function show(e:React.SyntheticEvent){e.preventDefault();e.stopPropagation();setOpen(true);}
  return <><span className={triggerText?'ui-help help-text-trigger':'ui-help'} role="button" tabIndex={0} aria-label={label} aria-haspopup="dialog" onClick={show} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')show(e);}}>{triggerText??'?'}</span>{open&&createPortal(<dialog ref={ref} className="help-dialog" aria-labelledby={id} onCancel={e=>{e.preventDefault();e.stopPropagation();setOpen(false);}} onClick={e=>{e.stopPropagation();if(e.target===e.currentTarget)setOpen(false);}}><header><h2 id={id}>{label}</h2><button aria-label="關閉說明" onClick={()=>setOpen(false)}>✕</button></header><div className="help-dialog-copy">{text.split('\n').map((line,i)=><p key={i}>{line}</p>)}</div></dialog>,document.body)}</>;
}
