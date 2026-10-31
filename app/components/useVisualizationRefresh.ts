'use client';
import {useEffect,useState} from 'react';
/** Re-read changing result data on return and every five visible minutes. */
export function useVisualizationRefresh(enabled:boolean){
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  if(!enabled)return;
  const refresh=()=>{if(document.visibilityState==='visible')setRevision(value=>value+1);};
  const timer=window.setInterval(refresh,300_000);
  document.addEventListener('visibilitychange',refresh);
  window.addEventListener('harper:data-refreshed',refresh);
  return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('harper:data-refreshed',refresh);};
 },[enabled]);
 return revision;
}
