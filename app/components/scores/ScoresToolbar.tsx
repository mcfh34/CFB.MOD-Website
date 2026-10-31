"use client";
import { weekLabel } from "../../../lib/weekLabels";
import { useCurrentWeek } from "../CurrentWeekContext";

type ScoresToolbarProps={
  season:number;
  week:number;
  seasons:number[];
  filtersOpen:boolean;
  activeFilterCount:number;
  onSeasonChange:(season:number)=>void;
  onWeekChange:(week:number)=>void;
  onToggleFilters:()=>void;
};

export function ScoresToolbar({season,week,seasons,filtersOpen,activeFilterCount,onSeasonChange,onWeekChange,onToggleFilters}:ScoresToolbarProps){
  const current=useCurrentWeek();
  return <div className="scores-compact-toolbar">
    <span className="scores-week-label">Week</span>
    <select className="scores-week-select" id="week-scores" aria-label="Week" value={week} onChange={(event)=>onWeekChange(Number(event.target.value))}>{Array.from({length:17},(_,index)=><option key={index} value={index}>{index===14||index===15?weekLabel(index,"compact"):index}{current?.season===season&&current.week===index?" · NOW":""}</option>)}</select>
    <select className="scores-season-select" id="season-scores" aria-label="Season" value={season} onChange={(event)=>onSeasonChange(Number(event.target.value))}>{seasons.map((value)=><option key={value}>{value}</option>)}</select>
    <button className="schedule-filter-toggle" type="button" aria-label={`More score filters${activeFilterCount?`, ${activeFilterCount} active`:""}`} aria-expanded={filtersOpen} aria-controls="schedule-filter-panel" onClick={onToggleFilters}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6.5 7.2v5.3l-3 1.5v-6.8L4 5Z"/></svg>
      {activeFilterCount?<b>{activeFilterCount}</b>:null}
    </button>
  </div>;
}
