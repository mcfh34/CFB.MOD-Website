"use client";

import type {SchedulePickFilter,ScheduleSortMode} from "../../../lib/scheduleFilters";

type ScoresFiltersProps={
  open:boolean;
  loading:boolean;
  team:string;
  conference:string;
  pick:SchedulePickFilter;
  sort:ScheduleSortMode;
  teams:string[];
  conferences:string[];
  powerConferenceValue:string;
  powerConferenceLabel:string;
  onTeamChange:(value:string)=>void;
  onConferenceChange:(value:string)=>void;
  onPickChange:(value:SchedulePickFilter)=>void;
  onSortChange:(value:ScheduleSortMode)=>void;
  onClose:()=>void;
};

export function ScoresFilters(props:ScoresFiltersProps){
  return <div id="schedule-filter-panel" className={`schedule-filter-panel ${props.open?"open":""}`} role="dialog" aria-label="Additional score filters" aria-hidden={!props.open}>
    <div className="schedule-filter">
      <header><div><strong>FILTERS</strong><small>Narrow the weekly board</small></div><button type="button" aria-label="Close score filters" onClick={props.onClose}>×</button></header>
      <div className="schedule-filter-control schedule-filter-team"><label htmlFor="schedule-team">TEAM</label><select id="schedule-team" value={props.team} onChange={(event)=>props.onTeamChange(event.target.value)}><option value="">All FBS games</option>{props.teams.map((team)=><option key={team}>{team}</option>)}</select></div>
      <div className="schedule-filter-control"><label htmlFor="schedule-conference">CONFERENCE</label><select id="schedule-conference" value={props.conference} onChange={(event)=>props.onConferenceChange(event.target.value)}><option value="ALL">All conferences</option><option value={props.powerConferenceValue}>{props.powerConferenceLabel}</option>{props.conferences.map((conference)=><option key={conference}>{conference}</option>)}</select></div>
      <div className="schedule-filter-control"><label htmlFor="schedule-picks">PICKS</label><select id="schedule-picks" value={props.pick} onChange={(event)=>props.onPickChange(event.target.value as SchedulePickFilter)}><option value="all">All games</option><option value="ats">ATS picks only</option><option value="total">O/U test picks only</option><option value="any">Any qualified pick</option></select></div>
      <div className="schedule-filter-control"><label htmlFor="schedule-sort">SORT</label><select id="schedule-sort" value={props.sort} onChange={(event)=>props.onSortChange(event.target.value as ScheduleSortMode)}><option value="date">Date played</option><option value="week">Week, then date</option><option value="conference">Conference, then date</option></select></div>
      <span className="schedule-filter-status" role="status" aria-live="polite">{props.loading?"Loading games…":""}</span>
      <button className="schedule-filter-done" type="button" onClick={props.onClose}>APPLY FILTERS</button>
    </div>
  </div>;
}
