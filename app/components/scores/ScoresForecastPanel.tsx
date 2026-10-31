"use client";
import { weekLabel } from "../../../lib/weekLabels";

import type {ReactNode} from "react";

type ScoresForecastPanelProps={
  season:number;
  week:number;
  rankingDisplayWeek:number;
  effectiveRankingSnapshotWeek:number;
  controls:ReactNode;
  rankings:ReactNode;
  methodology?:string;
};

export function ScoresForecastPanel({season,week,rankingDisplayWeek,effectiveRankingSnapshotWeek,controls,rankings,methodology}:ScoresForecastPanelProps){
  return <>
    <div className="weekly-ranking-snapshot" role="note">
      <span>{week?`ENTERING ${weekLabel(rankingDisplayWeek,"upper")}`:effectiveRankingSnapshotWeek?`LATEST SNAPSHOT · AFTER ${weekLabel(effectiveRankingSnapshotWeek,"upper")}`:"PRESEASON SNAPSHOT"}</span>
      <strong>Actual results to the snapshot + projected remaining schedule</strong>
      <p>This is the same projected-final order produced by Season Sim. It weighs expected wins, the game-by-game projected record, schedule strength, current team strength, head-to-head evidence, and projected conference title games.</p>
    </div>
    <div className="weekly-ranking-toolbar">{controls}<span>{season} · RANKING ENTERING {weekLabel(week,"upper")}</span></div>
    {rankings}
    {methodology?<p className="weekly-ranking-method">{methodology}</p>:null}
  </>;
}
