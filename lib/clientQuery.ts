"use client";
import {QueryClient} from "@tanstack/react-query";
export const dataQueryClient=new QueryClient({defaultOptions:{queries:{staleTime:5*60_000,gcTime:typeof window==="undefined"?Infinity:30*60_000,retry:1,refetchOnWindowFocus:false,refetchOnReconnect:false}}});
/** Cache successful GETs only. Per-consumer aborts never cancel another component's shared request. */
export async function cachedClientFetch(url:string,init?:RequestInit){
 if(typeof window==="undefined"||init?.method&&init.method!=="GET")return fetch(url,init);
 const {signal,...options}=init??{};
 if(signal?.aborted)throw new DOMException("Aborted","AbortError");
 const cached=await dataQueryClient.fetchQuery({queryKey:["http",url],queryFn:async()=>{const response=await fetch(url,options);if(!response.ok)throw new Error(`Data request failed (${response.status})`);return {body:await response.text(),status:response.status,headers:[...response.headers.entries()]};}});
 if(signal?.aborted)throw new DOMException("Aborted","AbortError");
 return new Response(cached.body,{status:cached.status,headers:cached.headers});
}
