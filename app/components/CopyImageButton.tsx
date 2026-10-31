'use client';
import {useRef,useState} from 'react';
import {copyGraphImage} from '../../lib/copyGraphImage';
import './copy-image.css';
export function CopyImageButton({getSvg,scope,selector='svg[role="img"]',disabled=false,title}:{getSvg?:()=>SVGSVGElement|null;scope?:string;selector?:string;disabled?:boolean;title?:string}){
 const ref=useRef<HTMLButtonElement>(null),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false),[error,setError]=useState('');
 const copy=async()=>{
  const svg=getSvg?getSvg():ref.current?.closest(scope||'section')?.querySelector<SVGSVGElement>(selector);
  if(!svg){setError('Graph is unavailable.');return;}
  setBusy(true);setCopied(false);setError('');
  try{await copyGraphImage(svg,title);setCopied(true);window.setTimeout(()=>setCopied(false),3000);}catch(e){setError(e instanceof Error?e.message:'Image could not be copied. Try again.');}finally{setBusy(false);}
 };
 return <span className="copy-image-control"><button ref={ref} type="button" onClick={copy} disabled={disabled||busy} aria-label={title?`Copy image: ${title}`:'Copy graph image'}>{busy?'COPYING IMAGE…':copied?'COPIED':'COPY IMAGE'}</button><span className="copy-image-status" role={error?'alert':'status'} aria-live="polite">{error|| (copied?'Image copied to clipboard.':'')}</span></span>;
}
