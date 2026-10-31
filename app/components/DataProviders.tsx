"use client";
import {useEffect,type ReactNode} from "react";
import {QueryClientProvider} from "@tanstack/react-query";
import {dataQueryClient} from "../../lib/clientQuery";
export function DataProviders({children}:{children:ReactNode}){
 useEffect(()=>{const invalidate=()=>{dataQueryClient.clear();};window.addEventListener("harper:data-refreshed",invalidate);return()=>window.removeEventListener("harper:data-refreshed",invalidate);},[]);
 return <QueryClientProvider client={dataQueryClient}>{children}</QueryClientProvider>;
}
