import {buildRoundRobinStandingsAsync,type RoundRobinProfile,type RoundRobinStanding} from "./roundRobin";
/** Interactive cross-era calculations run outside the browser's UI thread. */
export function buildRoundRobinOffThread(profiles:readonly RoundRobinProfile[],signal?:AbortSignal,onProgress?:(count:number)=>void):Promise<RoundRobinStanding[]>{
 if(typeof Worker==="undefined")return buildRoundRobinStandingsAsync(profiles,signal,onProgress);
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new DOMException("Aborted","AbortError"));return;}
  const worker=new Worker(new URL("./roundRobin.worker.ts",import.meta.url),{type:"module"});
  const stop=()=>{worker.terminate();signal?.removeEventListener("abort",abort);};
  const abort=()=>{stop();reject(new DOMException("Aborted","AbortError"));};signal?.addEventListener("abort",abort,{once:true});
  worker.onmessage=({data})=>{if(data.type==="progress")onProgress?.(data.count);if(data.type==="complete"){stop();resolve(data.rows);}if(data.type==="error"){stop();reject(new Error(data.message));}};
  worker.onerror=()=>{stop();reject(new Error("Background comparison could not finish"));};
  worker.postMessage(profiles);
 });
}
