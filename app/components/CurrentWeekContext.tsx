"use client";
import { createContext, useContext } from "react";

export type CurrentWeek={season:number;week:number}|null;
export const CurrentWeekContext=createContext<CurrentWeek>(null);
export function useCurrentWeek(){return useContext(CurrentWeekContext);}
