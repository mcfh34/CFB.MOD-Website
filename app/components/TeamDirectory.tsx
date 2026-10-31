"use client";
import {useMemo,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import type {ColumnDef} from "@tanstack/react-table";
import {EfficientTable} from "./EfficientTable";
import {modelDataFetch} from "../../lib/formulaRevision";
type Row={team:string;conference:string;record:string;resultsRank:number|null;offYpp:number;defYpp:number};
export default function TeamDirectory({season,week,onTeam}:{season:number;week:number;onTeam:(team:string)=>void}){
 const [search,setSearch]=useState("");const {data,isPending,error}=useQuery({queryKey:["team-directory",season,week],queryFn:async()=>{const r=await modelDataFetch(`/api/data?view=profiles&season=${season}&week=${week}&compactProfiles=1`);if(!r.ok)throw Error("Team directory is unavailable");return r.json() as Promise<{rows:Row[];effectiveWeek:number}>;}});
 const rows=useMemo(()=>(data?.rows??[]).filter(r=>`${r.team} ${r.conference}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>a.team.localeCompare(b.team)),[data,search]);
 const columns=useMemo<ColumnDef<Row,unknown>[]>(()=>[{accessorKey:"team",header:"Team",cell:c=><button type="button" className="directory-team" onClick={()=>onTeam(c.row.original.team)}>{c.row.original.team}</button>},{accessorKey:"conference",header:"Conference"},{accessorKey:"record",header:"Record"},{accessorKey:"resultsRank",header:"H+ rank",cell:c=>c.getValue()??"—"},{accessorKey:"offYpp",header:"Off. YPP",cell:c=>Number(c.getValue()??0).toFixed(2)},{accessorKey:"defYpp",header:"Def. YPP",cell:c=>Number(c.getValue()??0).toFixed(2)}],[onTeam]);
 return <section className="page-section directory-page"><div className="section-title-row"><h1>Teams</h1><input className="directory-search" type="search" aria-label="Search team directory" placeholder="Search teams or conferences" value={search} onChange={e=>setSearch(e.target.value)}/></div><p className="directory-count">{isPending?"Loading teams…":`${rows.length} teams · Stats through Week ${data?.effectiveWeek??week}`}</p>{error?<p role="alert">Team data is temporarily unavailable.</p>:<EfficientTable data={rows} columns={columns} rowKey={r=>r.team} label="Team directory"/>}</section>;
}
