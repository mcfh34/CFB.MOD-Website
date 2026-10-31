"use client";
/* eslint-disable @next/next/no-img-element -- the brand mark is a local static asset */

import { useEffect, useState, type ReactNode } from "react";
import { weekLabel } from "../../lib/weekLabels";
import { useCurrentWeek } from "./CurrentWeekContext";

import {Dialog} from "radix-ui";
import {Button} from "./ui/button";
import {destinations,primaryNavigation,subNavigation,primaryFor,type Section} from "../../lib/siteNavigation";
export type {Section} from "../../lib/siteNavigation";
type RefreshState = "idle" | "running" | "done" | "error";
type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "harper-plus-theme";
const THEME_COLORS: Record<ThemeMode, string> = {
  light: "#eeeae0",
  dark: "#0b0c0a",
};

export const navigation=destinations.map(([id,label])=>({id,label}));
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`app-brand ${compact ? "compact" : ""}`}>
      <span className="app-brand-mark" aria-hidden="true"><img src="/harper-football.svg" alt="" /></span>
      <span className="app-brand-copy"><strong>HARPER+</strong><small>COLLEGE FOOTBALL MODEL</small></span>
    </span>
  );
}

function ThemeToggle({ theme, onToggle }: { theme: ThemeMode; onToggle: () => void }) {
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className="app-theme-toggle"
      data-theme-mode={theme}
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      onClick={onToggle}
    >
      <span className="app-theme-toggle-track" aria-hidden="true">
        <span className="app-theme-toggle-thumb" />
        <svg className="app-theme-icon app-theme-icon-light" viewBox="0 0 24 24" focusable="false">
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
        </svg>
        <svg className="app-theme-icon app-theme-icon-dark" viewBox="0 0 24 24" focusable="false">
          <path d="M20 15.1A8.2 8.2 0 0 1 8.9 4a8.3 8.3 0 1 0 11.1 11.1Z" />
        </svg>
      </span>
      <span className="app-theme-toggle-label">{nextTheme}</span>
    </button>
  );
}

function SearchDialog({open,onOpenChange,onNavigate}:{open:boolean;onOpenChange:(value:boolean)=>void;onNavigate:(section:Section)=>void}){
 const [query,setQuery]=useState("");
 const entries=destinations.filter(([,label])=>label.toLowerCase().includes(query.toLowerCase()));
 return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="ui-dialog-overlay"/><Dialog.Content className="ui-dialog-content search-dialog"><Dialog.Title>Find a tool</Dialog.Title><Dialog.Description>Search pages, rankings, statistics and games.</Dialog.Description><input type="search" autoFocus aria-label="Search website tools" placeholder="Search tools…" value={query} onChange={e=>setQuery(e.target.value)}/><nav aria-label="Search results">{entries.map(([id,label])=><button key={id} type="button" onClick={()=>{onNavigate(id);onOpenChange(false);setQuery("");}}>{label}<span aria-hidden="true">→</span></button>)}</nav><Dialog.Close className="ui-dialog-close" aria-label="Close search">×</Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function AppShell({section,season,week,gamesTracked,refreshState,refreshMessage,onNavigate,onRefresh,archiveStatus,children,vintage,status}:{section:Section;season:number;week:number;gamesTracked:number|null;refreshState:RefreshState;refreshMessage:string;onNavigate:(section:Section)=>void;onRefresh:()=>void;archiveStatus:ReactNode;children:ReactNode;vintage?:ReactNode;status?:string}){
 const current=useCurrentWeek();const [theme,setTheme]=useState<ThemeMode>("dark"),[search,setSearch]=useState(false);
 const primary=primaryFor(section),sub=subNavigation[primary]??[];
 useEffect(()=>{setTheme(document.documentElement.dataset.theme==="light"?"light":"dark");const keyboard=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key==="k"){event.preventDefault();setSearch(open=>!open);}};window.addEventListener("keydown",keyboard);return()=>window.removeEventListener("keydown",keyboard);},[]);
 const toggleTheme=()=>{const next=theme==="dark"?"light":"dark";setTheme(next);document.documentElement.dataset.theme=next;document.documentElement.style.colorScheme=next;document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content",THEME_COLORS[next]);try{localStorage.setItem(THEME_STORAGE_KEY,next);}catch{}};
 return <div className="app-frame streamlined-frame"><aside className="app-sidebar"><button className="app-sidebar-brand" type="button" onClick={()=>onNavigate("overview")} aria-label="Harper Plus home"><Brand/></button><nav id="primary-navigation" className="five-primary-nav" aria-label="Main navigation">{primaryNavigation.map(([id,label])=><button key={id} type="button" className={primary===id?"active":""} aria-current={primary===id?"page":undefined} onClick={()=>onNavigate(id)}><strong>{label}</strong></button>)}</nav><Button variant="outline" onClick={()=>setSearch(true)} className="find-tool">Find a tool <kbd>⌘ K</kbd></Button><section className="app-sidebar-status"><small>WEEKLY DATA</small><strong>Sunday · 12:00 PM Central</strong><span>{status||refreshMessage}</span><div className="app-sidebar-status-actions"><ThemeToggle theme={theme} onToggle={toggleTheme}/><Button variant="ghost" size="sm" onClick={onRefresh}>Reload</Button></div></section></aside><header className="app-mobile-header"><button type="button" onClick={()=>onNavigate("overview")} aria-label="Harper Plus home"><Brand compact/></button><Button variant="outline" size="sm" onClick={()=>setSearch(true)}>Search</Button><ThemeToggle theme={theme} onToggle={toggleTheme}/></header><div className="app-workspace"><header className="global-context"><div className="global-vintage">{vintage}</div><span className="global-status" title={status||refreshMessage}>{status||"Updates Sundays at noon CT"}</span></header>{sub.length>0?<nav className="context-tabs" aria-label={`${primaryNavigation.find(([id])=>id===primary)?.[1]} pages`}>{sub.map(([id,label])=><button key={id} type="button" className={section===id||id==="directory"&&section==="teams"?"active":""} aria-current={section===id?"page":undefined} onClick={()=>onNavigate(id)}>{label}</button>)}</nav>:null}<div className="app-page-slot">{children}</div></div><nav className="mobile-five-nav" aria-label="Main mobile navigation">{primaryNavigation.map(([id,label])=><button type="button" key={id} className={primary===id?"active":""} aria-current={primary===id?"page":undefined} onClick={()=>onNavigate(id)}>{label}</button>)}</nav><SearchDialog open={search} onOpenChange={setSearch} onNavigate={onNavigate}/></div>;
}
