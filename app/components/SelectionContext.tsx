"use client";
import {createContext,useContext,useState} from "react";
export const SelectionContext=createContext<{season:number;week:number;setSeason:(value:number)=>void;setWeek:(value:number)=>void}|null>(null);
export function useSharedSeason(initial:number){const shared=useContext(SelectionContext);const local=useState(initial);return shared?[shared.season,shared.setSeason] as const:local;}
