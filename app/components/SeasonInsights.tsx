"use client";
import {useEffect,useRef,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {SearchSelect} from "./ui/SearchSelect";
import type {ModelOutput} from "../../lib/backgroundModel";
export default function SeasonInsights({season}:{season:number}){
 const [team,setTeam]=useState("Alabama");const ref=useRef<HTMLDivElement>(null);
 const {data}=useQuery({queryKey:["background-output",season],queryFn:async()=>{const response=await fetch(`/api/background/result?season=${season}`);return response.status===200?await response.json() as ModelOutput:null;}});
 const selected=data?.winDistributions.find(row=>row.team===team)??data?.winDistributions[0];
 useEffect(()=>{let disposed=false;let chart:{dispose:()=>void;resize:()=>void}|undefined;let observer:ResizeObserver|undefined;if(!selected||!ref.current)return;
 Promise.all([import("echarts/core"),import("echarts/charts"),import("echarts/components"),import("echarts/renderers")]).then(([core,charts,components,renderers])=>{if(disposed||!ref.current)return;core.use([charts.BarChart,components.GridComponent,components.TooltipComponent,components.AriaComponent,renderers.CanvasRenderer]);const instance=core.init(ref.current);chart=instance;instance.setOption({aria:{enabled:true},grid:{left:45,right:15,top:20,bottom:35},tooltip:{trigger:"axis",valueFormatter:(value:number)=>`${(value*100).toFixed(1)}%`},xAxis:{type:"category",name:"Wins",data:selected.distribution.map(d=>d.wins),axisLabel:{color:"#888"}},yAxis:{type:"value",axisLabel:{color:"#888",formatter:(value:number)=>`${Math.round(value*100)}%`},splitLine:{lineStyle:{color:"#8883"}}},series:[{type:"bar",data:selected.distribution.map(d=>d.probability),itemStyle:{color:"#8a9f46",borderRadius:[4,4,0,0]}}]});observer=new ResizeObserver(()=>instance.resize());observer.observe(ref.current);});
 return()=>{disposed=true;observer?.disconnect();chart?.dispose();};},[selected]);
 if(!data||!selected)return null;
 return <section className="season-insights"><div className="section-title-row"><div><h2>Season win probabilities</h2><p>{data.iterations.toLocaleString()} simulations · Regular season only · Stats through Week {data.week}</p></div><SearchSelect label="Simulation team" value={selected.team} onChange={setTeam} options={data.winDistributions.map(r=>({value:r.team,label:r.team})).sort((a,b)=>a.label.localeCompare(b.label))}/></div><strong>{selected.expectedWins.toFixed(1)} expected wins</strong><div ref={ref} className="efficient-chart" role="img" aria-label={`${selected.team} probability by regular-season win total`}/><p>Calculated {new Date(data.generatedAt).toLocaleDateString()}. Completed results stay fixed; remaining games are sampled independently. These are not playoff qualification probabilities.</p></section>;
}
