"use client";
import {visualizationDataUrl} from "../../lib/visualizationFreshness";
import {useVisualizationRefresh} from "./useVisualizationRefresh";
import {CopyImageButton} from "./CopyImageButton";
/* eslint-disable @next/next/no-img-element -- season-specific team logos */
import { useEffect, useRef, useState } from "react";
import { NET_GAME_METRICS, buildNetSuccessReport, netBarColor, netGraphStep, NET_SUCCESS_SORTS, canonicalNetSuccessConference, netSuccessConferenceGroup, selectNetSuccessRows, type NetGameMetric, type NetSuccessSort, type NetSuccessReport, type NetSuccessGame } from "../../lib/netSuccessRate";
import type { WeeklyReviewGame } from "../../lib/weeklyReview";
import { weekLabel } from "../../lib/weekLabels";
type Payload = NetSuccessReport & { weeks: number[]; freshness?:{latestCompletedWeek:number|null;pendingFinals:number} };
export function NetSuccessRateChart({ initialSeason, initialWeek, latestSeason, embedded=false, projectedGames }: { initialSeason: number; initialWeek: number; latestSeason: number; embedded?:boolean; projectedGames?:WeeklyReviewGame[] }) {
  const projected=projectedGames!==undefined;
  const [season,setSeason] = useState(Math.max(2014, Math.min(latestSeason,initialSeason)));
  const refreshRevision=useVisualizationRefresh(!projected&&season===latestSeason);
  const [week,setWeek] = useState<number|"all">(Math.max(0,embedded?initialWeek:initialWeek - 1));
  const [seasonType,setSeasonType] = useState("regular");
  const [retry,setRetry] = useState(0);
  const [pdfStatus,setPdfStatus]=useState<"idle"|"preparing"|"error">("idle");
  const [conference,setConference] = useState("All conferences");
  const [group,setGroup] = useState("all");
  const [metricKey,setMetricKey]=useState<NetGameMetric>("successRate");
  const [sortChoice,setSortChoice]=useState("netSuccessRate:asc");
  const [sort,direction]=sortChoice.split(":") as [NetSuccessSort,"asc"|"desc"];
  const metric=NET_GAME_METRICS.find(item=>item.key===metricKey)!;
  const seasonAverage=week==="all";
  const periodLabel=seasonAverage?`${seasonType==="postseason"?"Postseason":"Regular season"} average`:`${seasonType==="postseason"?"Postseason · ":""}${weekLabel(week)}`;
  const factor=metric.format==="rate"?100:1;
  const net=(value:number)=>`${value>0?"+":""}${(value*factor).toFixed(1)}`;
  const pct=(value:number)=>metric.format==="rate"?`${(value*100).toFixed(1)}%`:value.toFixed(1);
  const [result,setResult] = useState<{ key: string; data: Payload | null; error: string }>({ key:"",data:null,error:"" });
  const key = `${season}:${week}:${seasonType}:${metricKey}:${retry}:${refreshRevision}`;
  useEffect(() => {
    if(projected)return;
    const controller = new AbortController();
    fetch(visualizationDataUrl(`/api/net-success-rate?season=${season}&week=${week}&seasonType=${seasonType}&metric=${metricKey}&schema=5`),{signal:controller.signal,cache:"no-store"})
      .then(async response => { const payload = await response.json(); if (!response.ok || !Array.isArray(payload.rows)) throw new Error(payload.message || "Success-rate data could not be loaded."); return payload as Payload; })
      .then(data => { if (!controller.signal.aborted) setResult({key,data,error:""}); })
      .catch(error => { if (!controller.signal.aborted) setResult({key,data:null,error:error.message}); });
    return () => controller.abort();
  },[key,season,week,seasonType,metricKey,projected]);
  const projectedReport:Payload|null=projectedGames?(()=>{
    const eligible=projectedGames.filter(game=>!game.completed&&game.homeConference&&!/fcs/i.test(game.homeConference)&&game.awayConference&&!/fcs/i.test(game.awayConference));
    const mapped:NetSuccessGame[]=eligible.map(game=>({gameId:game.gameId,season:game.season,week:game.week,seasonType:game.seasonType??"regular",completed:true,
      homeTeam:game.homeTeam,awayTeam:game.awayTeam,homePoints:game.predictedHomeScore,awayPoints:game.predictedAwayScore,
      homeSuccessRate:game.homePredictedAdvanced?.successRate??null,awaySuccessRate:game.awayPredictedAdvanced?.successRate??null,
      homeLogo:game.homeLogo??null,awayLogo:game.awayLogo??null,homeColor:game.homeColor,awayColor:game.awayColor,homeConference:game.homeConference,awayConference:game.awayConference}));
    return {...buildNetSuccessReport(mapped,new Set(eligible.flatMap(game=>[game.homeTeam,game.awayTeam])),season,Number(week),seasonType),weeks:[Number(week)]};
  })():null;
  const data = projected?projectedReport:result.key === key ? result.data : null;
  const error = projected?"":result.key === key ? result.error : "";
  const loading = !projected&&result.key !== key;
  const conferences = ["All conferences", ...[...new Set((data?.rows ?? []).flatMap(row=>[row.winnerConference,row.loserConference]).filter(name=>group==="all"||netSuccessConferenceGroup(name)===group).map(canonicalNetSuccessConference))].sort()];
  const activeConference = conferences.includes(conference)?conference:"All conferences";
  const rows = selectNetSuccessRows(data?.rows ?? [],activeConference,group,sort,direction);
  const sortName=(key:string)=>key==="netSuccessRate"?`Net ${metric.label}`:key==="winnerSuccessRate"?`Winner ${metric.label}`:key==="loserSuccessRate"?`Opponent ${metric.label}`:NET_SUCCESS_SORTS.find(item=>item.key===key)?.label??key;
  const sortLabel=sortName(sort);
  const axisLabel=`${seasonAverage?"Teams":"Games"} sorted by ${sortLabel} · ${sort==="conference"?(direction==="asc"?"A–Z":"Z–A"):(direction==="asc"?"Low to high":"High to low")}`;
  const weeks = [...new Set([...Array.from({length:seasonType === "regular" ? 17 : 5},(_,index) => seasonType === "regular" ? index : index + 1),...(data?.weeks ?? []),...(typeof week==="number"?[week]:[])])].sort((a,b)=>a-b);
  const chartRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [chartSize,setChartSize] = useState({width:1000,height:380});
  useEffect(()=>{
    const element=chartRef.current;
    if (!element) return;
    const observer=new ResizeObserver(entries=>{
      const {width,height}=entries[0].contentRect;
      if(width>0&&height>0)setChartSize({width,height});
    });
    observer.observe(element);
    return ()=>observer.disconnect();
  },[rows.length]);
  const width=chartSize.width,height=chartSize.height;
  const left=70,top=90,plotHeight=Math.max(80,height-174);
  const displayValues=rows.map(row=>row.netSuccessRate*factor);
  const low=Math.min(...displayValues,0);
  const high=Math.max(...displayValues,0)||(low===0?1:0);
  const mobileExtent=Math.max(1,...displayValues.map(value=>Math.abs(value)));
  const y=(value:number)=>top+36+(high-value*factor)/(high-low)*Math.max(8,plotHeight-72);
  const tickStep=netGraphStep(high-low,Math.max(2,Math.floor(plotHeight/24)));
  const firstTick=Math.ceil(low/tickStep)*tickStep;
  const ticks=Array.from({length:Math.floor((high-firstTick)/tickStep)+1},(_,index)=>(firstTick+index*tickStep)/factor);
  const slot = (width - left - 12) / Math.max(rows.length,1);
  const logoSize = Math.min(30,Math.max(3,slot*.88));
  const barWidth = Math.min(24,slot*.72);
  const dense = slot<22;
  const valueLabelEvery=Math.max(1,Math.ceil(48/slot));
  const exportPdf=async()=>{
    if(loading||!rows.length||pdfStatus==="preparing")return;
    setPdfStatus("preparing");
    try{
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      if(!svgRef.current)throw new Error("Graph unavailable");
      const {exportGraphPdf}=await import("../../lib/exportGraphPdf");
      await exportGraphPdf({rows,metricKey,seasonAverage,title:`${projected?"Projected ":""}Net ${metric.label}`,xAxisLabel:axisLabel,subtitle:`${season} · ${periodLabel} · ${group==="all"?"All FBS":group==="power4"?"Power 4":group==="group6"?"Group of 6":"Independents"} · ${activeConference} · ${sortLabel} ${direction}`},`harper-cfb-${projected?"projected-":""}net-${metricKey}-${season}-${seasonAverage?"average":`week-${week}`}-${seasonType}.pdf`);
      setPdfStatus("idle");
    }catch{setPdfStatus("error");}
  };
  return <section className="nsr-view" aria-label="Net game statistics">
    {!embedded?<div className="nsr-controls" aria-label="Net game statistic filters">
      <label><span>STATISTIC</span><select aria-label="Net graph statistic" value={metricKey} onChange={event=>setMetricKey(event.target.value as NetGameMetric)}>{NET_GAME_METRICS.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label><span>YEAR</span><select aria-label="Net Success Rate year" value={season} onChange={event=>setSeason(Number(event.target.value))}>{Array.from({length:latestSeason-2014+1},(_,index)=>latestSeason-index).map(year=><option key={year} value={year}>{year}</option>)}</select></label>
      <label><span>SEASON</span><select aria-label="Net Success Rate season type" value={seasonType} onChange={event=>{setSeasonType(event.target.value);setWeek(1);}}><option value="regular">REGULAR SEASON</option><option value="postseason">POSTSEASON</option></select></label>
      <label><span>WEEK</span><select aria-label="Net graph week or season average" value={week} onChange={event=>{setWeek(event.target.value==="all"?"all":Number(event.target.value));if(event.target.value==="all")setSortChoice("netSuccessRate:asc");}}><option value="all">SEASON AVERAGE</option>{weeks.map(value=><option key={value} value={value}>{weekLabel(value,"upper")}</option>)}</select></label>
      <label><span>GROUP</span><select aria-label="Net Success Rate conference group" value={group} onChange={event=>{setGroup(event.target.value);setConference("All conferences");}}><option value="all">ALL FBS</option><option value="power4">POWER 4</option><option value="group6">GROUP OF 6</option><option value="other">INDEPENDENTS / OTHER</option></select></label>
      <label><span>CONFERENCE</span><select aria-label="Net Success Rate conference" value={activeConference} onChange={event=>setConference(event.target.value)}>{conferences.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
      <label><span>SORT</span><select aria-label="Net graph sorting and direction" value={sortChoice} onChange={event=>setSortChoice(event.target.value)}>{NET_SUCCESS_SORTS.filter(option=>!seasonAverage||["netSuccessRate","winnerSuccessRate","loserSuccessRate","conference"].includes(option.key)).flatMap(option=>["asc","desc"].map(order=><option key={`${option.key}:${order}`} value={`${option.key}:${order}`}>{sortName(option.key)} · {option.key==="conference"?(order==="asc"?"A–Z":"Z–A"):(order==="asc"?"Low to high":"High to low")}</option>))}</select></label>
    </div>:null}
    <div className="nsr-panel" aria-busy={loading}>
      <header className="nsr-heading nsr-branded-heading">

        <div className="nsr-centered-title"><span className="nsr-kicker">HARPER+ · FBS VS FBS</span><h2>NET {metric.label.toUpperCase()}</h2><p>{season} · {periodLabel}</p></div>
        <div className="nsr-actions">
          <CopyImageButton getSvg={()=>svgRef.current} disabled={loading||!rows.length||pdfStatus==="preparing"}/>
          <button className="nsr-export-button" type="button" onClick={exportPdf} disabled={loading||!rows.length||pdfStatus==="preparing"}>{pdfStatus==="preparing"?"BUILDING PDF…":"EXPORT PDF"}</button>
          {embedded&&!projected?<select className="nsr-embedded-stat" aria-label="Harper Weekly net graph statistic" value={metricKey} onChange={event=>setMetricKey(event.target.value as NetGameMetric)}><option value="successRate">ON-SCHEDULE RATE</option><option value="epaSuccessRate">EPA SUCCESS RATE</option></select>:null}
        </div>
        {!embedded?<div className="nsr-legend"><span>Bars use the endpoint team’s color</span></div>:null}
      </header>
      {!!data?.freshness?.pendingFinals&&<p className="nsr-status" role="status">Results are incomplete: {data.freshness.pendingFinals} past games still await imported finals. Charts reflect stored results through {data.freshness.latestCompletedWeek===null?"no completed week":weekLabel(data.freshness.latestCompletedWeek)}.</p>}
      {pdfStatus==="error"?<p className="nsr-export-error" role="alert">PDF export failed. Try again.</p>:null}
      {!embedded?<p className="nsr-explainer">{seasonAverage?"Each team’s mean game result minus its opponents’ mean · one bar per team":"Winner minus opponent · opponent at zero"} · {metric.format==="rate"?"percentage points":"stat units"}. Higher is not better for every statistic.</p>:null}
      {(!embedded||loading||error||!data?.completedGames||projected&&!rows.length)?<div role="status" className="nsr-status">{loading ? seasonAverage?"Loading season averages…":"Loading weekly results…" : error ? <>{error} <button type="button" onClick={()=>setRetry(value=>value+1)}>RETRY</button></> : projected&&!rows.length?"Projected on-schedule rates will appear when the model stores success-rate forecasts for these games.":data?.completedGames ? `Showing ${rows.length} ${seasonAverage?"teams":"games"} from ${data.completedGames} ${projected?"projected":"completed"} FBS games · Sorted by ${sortLabel.toLowerCase()}${data.missingGames ? ` · ${data.missingGames} games missing selected-stat data` : ""}` : projected?"No projected FBS games are available for this week.":"No completed FBS games are available for this selection."}</div>:null}
      {!loading && !error && rows.length > 0 ? <>
        <div ref={chartRef} className="nsr-chart-fit" aria-label={`Net ${metric.label} chart; all ${seasonAverage?"teams":"games"} fit the available screen width`}>
          <svg ref={svgRef} className="nsr-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="nsr-title nsr-description">
            <title id="nsr-title">{season} {periodLabel} {projected?"Projected ":""}Net {metric.label}</title><desc id="nsr-description">{projected?"Model projected success rates. ":""}{seasonAverage?"Teams":"Games"} sorted by {sortLabel.toLowerCase()}, {direction === "asc" ? "ascending" : "descending"}. Bars use the endpoint team’s color. The team’s logo marks its net value. {embedded?"Hover over a bar for exact values.":"Exact values are in details below."}</desc>
            <image href="/harper-football.svg" x={14} y={10} width={72} height={48}/>
            <text className="nsr-graph-title" style={{fontSize:Math.min(17,(width-180)/((metric.label.length+(projected?10:0))*.65+4))}} x={width/2} y={30} textAnchor="middle">{projected?"PROJECTED ":""}NET {metric.label.toUpperCase()}</text>
            <text className="nsr-graph-subtitle" x={width/2} y={50} textAnchor="middle">{season} · {periodLabel} · {activeConference}</text>
            {ticks.map(tick=><g key={tick}><line className={tick===0?"nsr-zero":"nsr-grid"} x1={left} x2={width-20} y1={y(tick)} y2={y(tick)}/><text className="nsr-tick" x={left-10} y={y(tick)+4} textAnchor="end">{net(tick)}</text></g>)}
            <text className="nsr-axis-title" x={14} y={top+plotHeight/2} transform={`rotate(-90 14 ${top+plotHeight/2})`} textAnchor="middle">NET {metric.label.toUpperCase()} · {metric.format==="rate"?"PERCENTAGE POINTS":"STAT UNITS"}</text>
            {rows.map((row,index)=>{const x=left+slot*(index+.5),valueY=y(row.netSuccessRate),barHeight=Math.abs(y(0)-valueY),negative=row.netSuccessRate<0,winnerY=negative?valueY+4:valueY-logoSize-4,loserY=negative?y(0)-logoSize-4:y(0)+5;return <g key={row.gameId}>
              <title>{seasonAverage?`${row.winner} (${row.seasonGames} games)`: `${row.winner} ${row.winnerPoints}–${row.loserPoints} ${row.loser}`}: net {metric.label} {net(row.netSuccessRate)} {metric.format==="rate"?"pp":""}; {pct(row.winnerSuccessRate)} vs {pct(row.loserSuccessRate)}{row.tied?" (tied game; home team shown first)":""}</title>
              <rect className="nsr-bar" style={{fill:netBarColor(row)}} x={x-barWidth/2} y={Math.min(y(0),valueY)} width={barWidth} height={Math.max(barHeight,1)} rx={2}/>
              {index%valueLabelEvery===0?<text className="nsr-value" textAnchor="middle" x={x} y={negative?winnerY+logoSize+14:winnerY-9}>{net(row.netSuccessRate)}</text>:null}
              <g className="nsr-endpoint" data-team={row.winner} data-net-sr={row.netSuccessRate}>
                {row.winnerLogo?<image href={row.winnerLogo} x={x-logoSize/2} y={winnerY} width={logoSize} height={logoSize}/>:<text className="nsr-tick" style={{fontSize:Math.min(11,slot/2)}} textAnchor="middle" x={x} y={winnerY+logoSize/2+4}>{row.winner.slice(0,3)}</text>}
              </g>
              {!seasonAverage?<g className="nsr-baseline" data-team={row.loser}>
                {row.loserLogo?<image href={row.loserLogo} x={x-logoSize/2} y={loserY} width={logoSize} height={logoSize}/>:<text className="nsr-tick" style={{fontSize:Math.min(11,slot/2)}} textAnchor="middle" x={x} y={loserY+logoSize/2+4}>{row.loser.slice(0,3)}</text>}
              </g>:null}
              {slot>=12?<text className="nsr-score" style={{fontSize:dense?9:12}} textAnchor="middle" x={x} y={height-58} transform={`rotate(-55 ${x} ${height-58})`}>{seasonAverage?row.winner:`${row.winnerPoints}–${row.loserPoints}`}</text>:null}
            </g>;})}
            <text className="nsr-axis-title nsr-sort-axis-label" style={{fontSize:Math.min(12,(width-30)/(axisLabel.length*.62))}} x={(left+width-12)/2} y={height-10} textAnchor="middle">{axisLabel}</text>
          </svg>
        </div>
        <div className="nsr-mobile-list" aria-label={`Net ${metric.label} ${seasonAverage?"team":"game"} results, sorted by ${sortLabel}`}>
          <div className="nsr-mobile-list-heading"><b>NET {metric.label.toUpperCase()}</b><span>{rows.length} {seasonAverage?"TEAMS":"GAMES"} · {direction==="asc"?"LOW TO HIGH":"HIGH TO LOW"}</span></div>
          <div className="nsr-mobile-list-scroll">{rows.map(row=>{
            const amount=row.netSuccessRate*factor;
            const barPercent=Math.max(amount===0?0:2,Math.abs(amount)/mobileExtent*50);
            return <div className="nsr-mobile-row" key={row.gameId}>
              <div className="nsr-mobile-matchup">
                <span>{row.winnerLogo?<img src={row.winnerLogo} alt=""/>:null}<strong>{row.winner}</strong>{!seasonAverage?<small>{row.winnerPoints}</small>:null}</span>
                {!seasonAverage?<span><b>vs</b>{row.loserLogo?<img src={row.loserLogo} alt=""/>:null}<strong>{row.loser}</strong><small>{row.loserPoints}</small></span>:<span><small>{row.seasonGames} games</small></span>}
              </div>
              <div className="nsr-mobile-result"><span>{pct(row.winnerSuccessRate)} <i>vs</i> {pct(row.loserSuccessRate)}</span><b className={amount<0?"nsr-negative":"nsr-positive"}>{net(row.netSuccessRate)}{metric.format==="rate"?" pp":""}</b></div>
              <div className="nsr-mobile-track" aria-hidden="true"><span style={{left:amount<0?`${50-barPercent}%`:"50%",width:`${barPercent}%`,background:netBarColor(row)}}/></div>
            </div>;
          })}</div>
          <p>{axisLabel}</p>
        </div>
        {!embedded?<details className="nsr-details"><summary>{seasonAverage?"TEAM AVERAGES":"GAME DETAILS"} · {rows.length} {seasonAverage?"TEAMS":"GAMES"}</summary><div className="nsr-table-scroll"><table><thead><tr><th>{seasonAverage?"Team":"Winner"}</th><th>{seasonAverage?"Games":"Loser"}</th><th>{seasonAverage?"Conference":"Final"}</th><th>{seasonAverage?"Team":"Winner"} {metric.label}</th><th>{seasonAverage?"Opponents":"Loser"} {metric.label}</th><th>Net {metric.format==="rate"?"(pp)":""}</th></tr></thead><tbody>{rows.map(row=><tr key={row.gameId}><td>{row.winner}{row.tied?" (tie)":""}</td><td>{seasonAverage?row.seasonGames:row.loser}</td><td>{seasonAverage?row.winnerConference:`${row.winnerPoints}–${row.loserPoints}`}</td><td>{pct(row.winnerSuccessRate)}</td><td>{pct(row.loserSuccessRate)}</td><td className={row.netSuccessRate<0?"nsr-negative":"nsr-positive"}>{net(row.netSuccessRate)}</td></tr>)}</tbody></table></div></details>:null}
      </> : !loading && !error && data && data.completedGames > 0 && !projected ? <p className="nsr-empty">{data.rows.length ? "No games match these filters. Choose another conference or group." : "Selected stats have not been archived for these games yet. Select another week or year."}</p> : null}
      {!embedded?<details className="nsr-method"><summary>METHOD &amp; SOURCE</summary><p className="nsr-footnote">{metricKey==="epaSuccessRate"?"EPA Success Rate: share of eligible plays with CFBD PPA greater than zero. Includes garbage time; excludes special teams, penalties, kneels, spikes, no-plays and missing PPA. Uses the positive-EPA definition; CFBD’s model and play sample can differ from Fleming’s. ":"Source: CFBD advanced game stats with garbage time excluded. "} On-Schedule Rate (50/70/100): a successful play gains at least 50% of the yards needed on first down, 70% on second down, or 100% on third or fourth down. Net = winner offensive on-schedule rate minus opponent offensive on-schedule rate. Rates are displayed in percentage points: +10.0 pp equals +0.100 on a decimal-rate chart. FCS opponents excluded. Filters include games involving a team in the selected conference and group. Power 4: ACC, Big Ten, Big 12, SEC. Group of 6: American, CUSA, MAC, Mountain West, Pac-12, Sun Belt. Independents are separate. Game statistics are unadjusted for opponent strength; this is a performance comparison, not a power rating.</p></details>:null}
    </div>
  </section>;
}
