"use client";
import {visualizationDataUrl} from "../lib/visualizationFreshness";
import {useVisualizationRefresh} from "./components/useVisualizationRefresh";
import {copyImperialismImage} from "../lib/exportImperialismMap";

import { useEffect, useMemo, useRef, useState, type PointerEvent as MapPointerEvent } from "react";
import { connectedTerritories, imperialismStages, largestInteriorSquares, milesBetween, territoryOwners, type ImperialGame } from "../lib/imperialism";
import { resolveTeamLogoAsset } from "../lib/teamLogoAssets";
import { IMPERIALISM_WIDTH as WIDTH, IMPERIALISM_HEIGHT as HEIGHT, IMPERIALISM_INSET_LABELS, IMPERIALISM_INSET_BOXES, projectImperialismPoint as point } from "../lib/imperialismProjection";
import { imperialismBorders, imperialismOutline } from "../lib/imperialismBorders";
import {imperialismControlHistory} from "../lib/imperialismHistory";
import "./imperialism.css";

type Team = { team: string; conference: string | null; color: string | null; altColor: string | null; logo: string | null; lat: number; lon: number };
type County = { i: string; n: string; g: number[][][][] };
type Dataset = { freshness?:{latestCompletedWeek:number|null;pendingFinals:number}; locationSource?:string; teams: Team[]; games: ImperialGame[]; startingTeams?:string[]; missingLocations: string[] };
type SeededCounty = County & { seed: string; d: string; x: number; y: number; area: number };
type RegionMark = { owner: string; x: number; y: number; size: number; mass: number; indices: number[]; needsClip: boolean };
const clamp = (value:number,min:number,max:number) => Math.min(max,Math.max(min,value));
const boundedFocus = (x:number,y:number,zoom:number) => ({
  x:clamp(x,WIDTH/(2*zoom),WIDTH-WIDTH/(2*zoom)),
  y:clamp(y,HEIGHT/(2*zoom),HEIGHT-HEIGHT/(2*zoom)),
});
const validColor = (value: string | null | undefined) => value && /^#[a-f\d]{6}$/i.test(value) ? value : "#737f8d";
const stateName = (fips: string) => ({
  "01":"Alabama","02":"Alaska","04":"Arizona","05":"Arkansas","06":"California","08":"Colorado","09":"Connecticut","10":"Delaware","11":"District of Columbia","12":"Florida","13":"Georgia","15":"Hawaii","16":"Idaho","17":"Illinois","18":"Indiana","19":"Iowa","20":"Kansas","21":"Kentucky","22":"Louisiana","23":"Maine","24":"Maryland","25":"Massachusetts","26":"Michigan","27":"Minnesota","28":"Mississippi","29":"Missouri","30":"Montana","31":"Nebraska","32":"Nevada","33":"New Hampshire","34":"New Jersey","35":"New Mexico","36":"New York","37":"North Carolina","38":"North Dakota","39":"Ohio","40":"Oklahoma","41":"Oregon","42":"Pennsylvania","44":"Rhode Island","45":"South Carolina","46":"South Dakota","47":"Tennessee","48":"Texas","49":"Utah","50":"Vermont","51":"Virginia","53":"Washington","54":"West Virginia","55":"Wisconsin","56":"Wyoming","72":"Puerto Rico",
} as Record<string,string>)[fips] ?? fips;

function path(polygons: number[][][][]) {
  return polygons.map(polygon => polygon.map(ring => ring.map(([lon,lat], index) => {
    const [x,y] = point(lon,lat);
    return `${index ? "L" : "M"}${x.toFixed(3)},${y.toFixed(3)}`;
  }).join("") + "Z").join("")).join("");
}
function interior(polygons: number[][][][]): {lon:number;lat:number;x:number;y:number} {
  // The midpoint of the widest horizontal slice is inside an actual land polygon.
  let best: {lon:number;lat:number;x:number;y:number;width:number} | null=null;
  for(const polygon of polygons) {
    const ring=polygon[0] ?? [];
    if(ring.length<3)continue;
    const vertices=ring.map(([lon,lat])=>({lon,lat,xy:point(lon,lat)}));
    const ys=vertices.map(vertex=>vertex.xy[1]);
    const min=Math.min(...ys),max=Math.max(...ys);
    for(const fraction of [.25,.5,.75]) {
      const y=min+(max-min)*fraction;
      const intersections:{x:number;lon:number;lat:number}[]=[];
      for(let i=0;i<vertices.length;i++) {
        const a=vertices[i],b=vertices[(i+1)%vertices.length],dy=b.xy[1]-a.xy[1];
        if((a.xy[1]<=y && b.xy[1]>y)||(b.xy[1]<=y && a.xy[1]>y)) {
          const t=(y-a.xy[1])/dy;
          intersections.push({x:a.xy[0]+t*(b.xy[0]-a.xy[0]),lon:a.lon+t*(((b.lon-a.lon+180)%360+360)%360-180),lat:a.lat+t*(b.lat-a.lat)});
        }
      }
      intersections.sort((a,b)=>a.x-b.x);
      for(let i=0;i+1<intersections.length;i+=2) {
        const a=intersections[i],b=intersections[i+1],width=b.x-a.x;
        if(width>(best?.width ?? 0))best={lon:a.lon+(((b.lon-a.lon+180)%360+360)%360-180)/2,lat:(a.lat+b.lat)/2,x:(a.x+b.x)/2,y,width};
      }
    }
  }
  if(best)return best;
  const [lon,lat]=polygons[0]?.[0]?.[0] ?? [-98,39];
  const [x,y]=point(lon,lat);
  return {lon,lat,x,y};
}
function mapArea(polygons: number[][][][]) {
  let area=0;
  for (const polygon of polygons) for (const [index,ring] of polygon.entries()) {
    let doubled=0;
    for(let i=0;i<ring.length-1;i++) {
      const [x1,y1]=point(ring[i][0],ring[i][1]),[x2,y2]=point(ring[i+1][0],ring[i+1][1]);
      doubled+=x1*y2-x2*y1;
    }
    area+=(index ? -1 : 1)*Math.abs(doubled)/2;
  }
  return Math.max(1,Math.min(2200,Math.abs(area)));
}
function regionMarks(counties: SeededCounty[],owners: Map<string,string>,adjacency:number[][]): RegionMark[] {
  if(adjacency.length!==counties.length)return [];
  const regions=connectedTerritories(counties.map(county=>owners.get(county.seed) ?? county.seed),adjacency);
  const gridSize=4, gridWidth=Math.ceil(WIDTH/gridSize), gridHeight=Math.ceil(HEIGHT/gridSize);
  const canvas=document.createElement("canvas");
  canvas.width=gridWidth; canvas.height=gridHeight;
  const context=canvas.getContext("2d",{willReadFrequently:true});
  const labels=new Uint16Array(gridWidth*gridHeight);
  if(context) {
    regions.forEach((region,index) => {
      context.setTransform(1,0,0,1,0,0);
      context.clearRect(0,0,gridWidth,gridHeight);
      context.scale(1/gridSize,1/gridSize);
      context.lineWidth=gridSize*1.5;
      context.lineJoin="round";
      context.fillStyle="#fff";
      context.strokeStyle="#fff";
      for(const countyIndex of region.counties) {
        const shape=new Path2D(counties[countyIndex].d);
        context.fill(shape,"evenodd");
        // Close subpixel seams where separately rendered county edges meet.
        context.stroke(shape);
      }
      const pixels=context.getImageData(0,0,gridWidth,gridHeight).data;
      for(let pixel=0;pixel<labels.length;pixel++)if(pixels[pixel*4+3]>=250)labels[pixel]=index+1;
    });
  }
  const squares=largestInteriorSquares(labels,gridWidth,gridHeight);
  return regions.map(({owner,counties:indices},index) => {
    const group=indices.map(index=>counties[index]);
    const mass=group.reduce((sum,county)=>sum+county.area,0);
    const centerX=group.reduce((sum,county)=>sum+county.x*county.area,0)/mass;
    const centerY=group.reduce((sum,county)=>sum+county.y*county.area,0)/mass;
    // A tiny island may be smaller than a raster cell; keep its county anchor.
    const anchor=group.reduce((best,county)=>
      (county.x-centerX)**2+(county.y-centerY)**2<(best.x-centerX)**2+(best.y-centerY)**2?county:best);
    const square=squares.get(index+1);
    const available=square ? square.side*gridSize-6 : 0;
    return {owner,x:square?(square.x+.5)*gridSize:anchor.x,y:square?(square.y+.5)*gridSize:anchor.y,mass,indices,
      size:Math.min(108,Math.max(10,available)),needsClip:available<10};
  });
}
export default function ImperialismChart({initialSeason,latestSeason}:{initialSeason:number;latestSeason:number}) {
  const [season,setSeason] = useState(initialSeason);
  const refreshRevision=useVisualizationRefresh(season===0||season===latestSeason);
  const [data,setData] = useState<Dataset | null>(null);
  const [counties,setCounties] = useState<County[]>([]);
  const [adjacency,setAdjacency] = useState<number[][]>([]);
  const [error,setError] = useState("");
  const [stage,setStage] = useState(-1);
  const [selected,setSelected] = useState("");
  const [majorHistoryOnly,setMajorHistoryOnly]=useState(true);
  const [hover,setHover] = useState<SeededCounty | null>(null);
  const [zoom,setZoom] = useState(1);
  const mapRef=useRef<SVGSVGElement>(null);
  const [copied,setCopied]=useState(false);
  const [exporting,setExporting]=useState<"copy"|"pdf"|null>(null);
  const [exportError,setExportError]=useState("");
  const [focus,setFocus] = useState({x:WIDTH/2,y:HEIGHT/2});
  const pointerPositions=useRef(new Map<number,{x:number;y:number}>());
  const dragged=useRef(false);
  const gesture=useRef<
    {kind:"pan";x:number;y:number;focus:{x:number;y:number};zoom:number} |
    {kind:"pinch";distance:number;zoom:number;anchor:{x:number;y:number}}
  >({kind:"pan",x:0,y:0,focus:{x:WIDTH/2,y:HEIGHT/2},zoom:1});
  useEffect(() => {
    let active=true;
    Promise.all([
      fetch("/imperialism/counties.json?revision=aligned-borders-1").then(r => { if(!r.ok) throw Error("County map unavailable"); return r.json() as Promise<County[]>; }),
      fetch("/imperialism/county-adjacency.json?revision=aligned-borders-1").then(r => { if(!r.ok) throw Error("County connections unavailable"); return r.json() as Promise<number[][]>; }),
    ]).then(([shapes,neighbors]) => { if(active){setCounties(shapes);setAdjacency(neighbors);} }).catch(e => { if(active) setError(String(e)); });
    return () => { active=false; };
  },[]);
  useEffect(()=>{setData(null);setError("");setStage(-1);setSelected("");setZoom(1);setFocus({x:WIDTH/2,y:HEIGHT/2});},[season]);
  useEffect(() => {
    let active=true;
    fetch(visualizationDataUrl(`/api/imperialism?season=${season===0?"all":season}`),{cache:"no-store"}).then(async r => {
      const value=await r.json() as Dataset & { message?: string };
      if(!r.ok) throw Error(value.message || "Map data unavailable");
      return value;
    }).then(value => { if(active){setData(value);setError("");} }).catch(e => { if(active) setError(String(e)); });
    return () => { active=false; };
  },[season,refreshRevision]);
  const teams = data?.teams ?? [];
  const openingTeams=useMemo(()=>data?.startingTeams?teams.filter(team=>data.startingTeams!.includes(team.team)):teams,[data,teams]);
  const seasonLabel=season===0?`2014–${latestSeason}`:season;
  const byName = useMemo(() => new Map(teams.map(team => [team.team,{
    ...team,logo:resolveTeamLogoAsset(team.team) ?? team.logo,
  }])),[teams]);
  const seeded = useMemo<SeededCounty[]>(() => {
    if(!openingTeams.length) return [];
    return counties.map(county => {
      const {lon,lat,x,y}=interior(county.g);
      let closest=openingTeams[0], distance=Infinity;
      for(const team of openingTeams) {
        const next=milesBetween(lat,lon,team.lat,team.lon);
        if(next<distance) { closest=team; distance=next; }
      }
      return { ...county,seed:closest.team,d:path(county.g),x,y,area:mapArea(county.g) };
    });
  },[counties,openingTeams]);
  const borders=useMemo(()=>imperialismBorders(counties),[counties]);
  const landOutline=useMemo(()=>imperialismOutline(counties),[counties]);
  const timeline=useMemo(() => imperialismStages(data?.games ?? [],season===0),[data,season]);
  const chosenStage=stage<0 ? timeline.length-1 : Math.min(stage,timeline.length-1);
  const owners=useMemo(() => territoryOwners(teams.map(team=>team.team),data?.games ?? [],timeline[chosenStage]?.count ?? 0),
    [teams,data,timeline,chosenStage]);
  const totals=useMemo(() => {
    const counts=new Map<string,number>();
    for(const county of seeded) {
      const owner=owners.get(county.seed) ?? county.seed;
      counts.set(owner,(counts.get(owner) ?? 0)+1);
    }
    return [...counts].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0]));
  },[seeded,owners]);
  const history=useMemo(()=>season===0&&data&&seeded.length?imperialismControlHistory(seeded.map(county=>county.seed),teams.map(team=>team.team),data.games,new Date(Math.max(Date.now(),...data.games.map(game=>Date.parse(game.startDate??"")).filter(Number.isFinite))).toISOString()):null,[season,data,seeded,teams]);
  const historyRows=history?.stints.filter(row=>!majorHistoryOnly||row.peakShare>=25)??[];
  const historyDate=(value:string)=>new Date(value).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"America/Chicago"});
  const marks=useMemo(()=>regionMarks(seeded,owners,adjacency),[seeded,owners,adjacency]);
  const borderMesh=useMemo(()=>{
    let county="",territory="",state="";
    for(const border of borders){
      const first=seeded[border.first],second=seeded[border.second];if(!first||!second)continue;
      if(first.i.slice(0,2)!==second.i.slice(0,2))state+=border.path;
      if((owners.get(first.seed)??first.seed)!==(owners.get(second.seed)??second.seed))territory+=border.path;
      else county+=border.path;
    }
    return {county,territory,state};
  },[borders,seeded,owners]);
  const exportMap=async(format:"copy"|"pdf")=>{
    if(!mapRef.current||exporting)return;
    setExporting(format);setExportError("");setCopied(false);
    try{const meta={season:seasonLabel,stage:timeline[chosenStage]?.label??"Opening map",counties:seeded.length,teams:openingTeams.length};if(format==="copy"){await copyImperialismImage(mapRef.current,meta);setCopied(true);window.setTimeout(()=>setCopied(false),3000);}else{const {exportImperialismMap}=await import("../lib/exportImperialismMap");await exportImperialismMap(mapRef.current,meta);}}
    catch(error){setExportError(error instanceof Error?error.message:"Map export failed. Please try again.");}finally{setExporting(null);}
  };
  const activeOwner=hover ? owners.get(hover.seed) ?? hover.seed : "";
  const viewWidth=WIDTH/zoom,viewHeight=HEIGHT/zoom;
  const viewBox=`${focus.x-viewWidth/2} ${focus.y-viewHeight/2} ${viewWidth} ${viewHeight}`;
  const followTeam=(name:string,nextZoom=zoom) => {
    setSelected(name);
    const team=byName.get(name);
    if(team) {
      const territory=marks.filter(mark=>mark.owner===name).sort((a,b)=>b.mass-a.mass)[0];
      const [x,y]=territory?[territory.x,territory.y]:point(team.lon,team.lat);
      setFocus(boundedFocus(x,y,nextZoom));
    }
  };
  const mapFraction=(element:SVGSVGElement,x:number,y:number) => {
    const bounds=element.getBoundingClientRect();
    return {x:clamp((x-bounds.left)/bounds.width,0,1),y:clamp((y-bounds.top)/bounds.height,0,1)};
  };
  const zoomAt=(next:number,xFraction=.5,yFraction=.5) => {
    const newZoom=clamp(next,1,6);
    const anchorX=focus.x+(xFraction-.5)*viewWidth;
    const anchorY=focus.y+(yFraction-.5)*viewHeight;
    setFocus(boundedFocus(anchorX+(.5-xFraction)*WIDTH/newZoom,anchorY+(.5-yFraction)*HEIGHT/newZoom,newZoom));
    setZoom(newZoom);
  };
  const startPinch=(element:SVGSVGElement) => {
    const points=[...pointerPositions.current.values()];
    if(points.length<2)return;
    const mid={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2};
    const fraction=mapFraction(element,mid.x,mid.y);
    gesture.current={kind:"pinch",distance:Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y),
      zoom,anchor:{x:focus.x+(fraction.x-.5)*viewWidth,y:focus.y+(fraction.y-.5)*viewHeight}};
  };
  const pointerDown=(event:MapPointerEvent<SVGSVGElement>) => {
    dragged.current=false;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerPositions.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointerPositions.current.size===1) gesture.current={kind:"pan",x:event.clientX,y:event.clientY,focus,zoom};
    else startPinch(event.currentTarget);
  };
  const pointerMove=(event:MapPointerEvent<SVGSVGElement>) => {
    if(!pointerPositions.current.has(event.pointerId))return;
    pointerPositions.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
    const bounds=event.currentTarget.getBoundingClientRect();
    if(pointerPositions.current.size===1&&gesture.current.kind==="pan") {
      const start=gesture.current;
      if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>5)dragged.current=true;
      setFocus(boundedFocus(start.focus.x-(event.clientX-start.x)*WIDTH/(bounds.width*start.zoom),
        start.focus.y-(event.clientY-start.y)*HEIGHT/(bounds.height*start.zoom),start.zoom));
    } else if(pointerPositions.current.size>=2&&gesture.current.kind==="pinch") {
      dragged.current=true;
      const points=[...pointerPositions.current.values()];
      const distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
      const next=clamp(gesture.current.zoom*distance/Math.max(1,gesture.current.distance),1,6);
      const mid={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2};
      const fraction=mapFraction(event.currentTarget,mid.x,mid.y);
      setFocus(boundedFocus(gesture.current.anchor.x+(.5-fraction.x)*WIDTH/next,
        gesture.current.anchor.y+(.5-fraction.y)*HEIGHT/next,next));
      setZoom(next);
    }
  };
  const pointerUp=(event:MapPointerEvent<SVGSVGElement>) => {
    pointerPositions.current.delete(event.pointerId);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    const remaining=[...pointerPositions.current.values()];
    if(remaining.length===1) gesture.current={kind:"pan",x:remaining[0].x,y:remaining[0].y,focus,zoom};
  };
  useEffect(()=>{
    const map=mapRef.current;if(!map)return;
    // React delegates wheel events passively; a native non-passive handler is
    // required to cancel browser page scrolling while the map owns the wheel.
    const wheelZoom=(event:WheelEvent)=>{
      event.preventDefault();event.stopPropagation();
      const fraction=mapFraction(map,event.clientX,event.clientY);
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?map.getBoundingClientRect().height:1);
      zoomAt(zoom*Math.exp(-clamp(delta,-120,120)*.0025),fraction.x,fraction.y);
    };
    map.addEventListener("wheel",wheelZoom,{passive:false});
    return()=>map.removeEventListener("wheel",wheelZoom);
  },[zoom,focus.x,focus.y,seeded.length]);
  return <section className="imperialism">
    <div className="imperialism-heading">
      <div><span className="imperialism-kicker">HARPER+ · COLLEGE FOOTBALL</span><h2>Imperialism</h2>
        <p>Every county begins with its nearest FBS team. Beat a team and claim every county it holds.</p></div>
      <div className="imperialism-summary"><strong>{totals.length}</strong><span>empires holding land</span></div>
    </div>
    <div className="imperialism-controls">
      <label>SEASON<select value={season} onChange={e=>setSeason(Number(e.target.value))}>
        <option value={0}>All years · 2014–present</option>
        {Array.from({length:latestSeason-2014+1},(_,i)=>latestSeason-i).map(year=><option key={year} value={year}>{year}</option>)}
      </select></label>
      <label>THROUGH<select value={chosenStage} onChange={e=>setStage(Number(e.target.value))}>
        {timeline.map((item,index)=><option key={index} value={index}>{item.label}</option>)}
      </select></label>
      <label>FOLLOW TEAM<select value={selected} onChange={e=>{
        const nextZoom=e.target.value?Math.max(zoom,1.5):zoom;
        setZoom(nextZoom);followTeam(e.target.value,nextZoom);
      }}>
        <option value="">All teams</option>{[...byName.values()].sort((a,b)=>a.team.localeCompare(b.team)).map(team=><option key={team.team}>{team.team}</option>)}
      </select></label>
      <div className="imperialism-zoom"><button type="button" onClick={()=>zoomAt(zoom/1.5)} aria-label="Zoom out">−</button><span>{Math.round(zoom*100)}%</span><button type="button" onClick={()=>zoomAt(zoom*1.5)} aria-label="Zoom in">+</button></div>
    </div>
    {!!seeded.length&&<div className="imperialism-export-controls"><button type="button" disabled={!!exporting||!marks.length} onClick={()=>exportMap("pdf")}>{exporting==="pdf"?"BUILDING PDF…":"EXPORT PDF"}</button><button type="button" disabled={!!exporting||!marks.length} onClick={()=>exportMap("copy")}>{exporting==="copy"?"COPYING IMAGE…":copied?"COPIED":"COPY IMAGE"}</button><span>Full map · selected week</span></div>}
    {!!data?.freshness?.pendingFinals&&<p className="imperialism-note" role="status">Map results are incomplete: {data.freshness.pendingFinals} past games still await imported finals. Territory reflects stored results through Week {data.freshness.latestCompletedWeek??"—"}; pending games do not transfer land.</p>}
    {exportError&&<p className="imperialism-error" role="alert">{exportError}</p>}
    {error && <p className="imperialism-error" role="alert">{error}</p>}
    {!error && (!data || !counties.length || !adjacency.length) && <p className="imperialism-loading">Loading counties and team locations…</p>}
    {history&&<details className="imperialism-history">
      <summary>Map control history · 2014–present <span>{historyRows.length} stints</span></summary>
      <div className="imperialism-history-controls"><label><input type="checkbox" checked={majorHistoryOnly} onChange={event=>setMajorHistoryOnly(event.target.checked)}/>Only stints reaching 25% or more</label><span>Largest county holder · uninterrupted stints · includes offseasons</span></div>
      <div className="imperialism-history-scroll"><table><thead><tr><th>Team</th><th>Peak counties</th><th>From</th><th>Until</th><th>Streak</th><th>100% since</th></tr></thead><tbody>{historyRows.map((row,index)=>{
        const days=Math.max(0,Math.floor((Date.parse(row.endDate??history.asOf)-Date.parse(row.startDate))/86400000)),logo=byName.get(row.team)?.logo;
        return <tr key={`${row.team}-${index}`}><th scope="row"><span>{logo&&<img src={logo} alt=""/>}{row.team}</span></th><td>{row.peakShare.toFixed(1)}%</td><td>{historyDate(row.startDate)}</td><td>{row.endDate?historyDate(row.endDate):"Ongoing"}</td><td>{days?`${days.toLocaleString()} days`:"Less than 1 day"}</td><td>{row.fullControlDate?historyDate(row.fullControlDate):"—"}</td></tr>;
      })}</tbody></table></div>
      {!historyRows.length&&<p>No stints have reached 25% yet. Uncheck the filter to see every holder.</p>}
      <p>Share counts counties, not land area. Ties retain the incumbent. Current streak measured through {historyDate(history.asOf)}. Source: completed FBS results.</p>
    </details>}
    {!!seeded.length && <div className="imperialism-layout">
      <div className="imperialism-map-wrap">
        <div className="imperialism-map-title"><div><span>HARPER+ IMPERIALISM</span><strong>College Football Empires · {timeline[chosenStage]?.label}</strong></div><span>{seasonLabel} · {seeded.length.toLocaleString()} COUNTIES · {openingTeams.length} STARTING TEAMS</span></div>
        <svg ref={mapRef} className="imperialism-map" viewBox={viewBox} role="img" aria-label={`United States county Imperialism map through ${timeline[chosenStage]?.label}`}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
          onDoubleClick={event=>{const fraction=mapFraction(event.currentTarget,event.clientX,event.clientY);zoomAt(zoom*1.5,fraction.x,fraction.y);}}>
          <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="#fff"/>
          <g className="imperialism-inset-boxes" aria-hidden="true">{IMPERIALISM_INSET_BOXES.map(box=><rect key={box.region} x={box.x} y={box.y} width={box.width} height={box.height} rx="5" fill="#f6f7f5" stroke="#aeb6b0" strokeWidth="1.2" vectorEffect="non-scaling-stroke"/>)}</g>
          <defs>{marks.map((mark,index)=><clipPath key={index} id={`imperial-region-${index}`} clipPathUnits="userSpaceOnUse">
            {mark.indices.map(countyIndex=><path key={countyIndex} d={seeded[countyIndex].d}/>) }
          </clipPath>)}</defs>
          {seeded.map(county => {
            const owner=owners.get(county.seed) ?? county.seed;
            return <path key={county.i} d={county.d} fillRule="evenodd" strokeLinejoin="round" strokeLinecap="round" fill={validColor(byName.get(owner)?.color)}
              className={`imperialism-county ${selected && owner!==selected ? "imperialism-dim" : ""}`}
              onMouseEnter={()=>setHover(county)} onMouseLeave={()=>setHover(null)}
              onClick={()=>{if(!dragged.current)setSelected(owner);}}><title>{county.n}, {stateName(county.i.slice(0,2))} · {owner} · originally {county.seed}</title></path>;
          })}
          <g className="imperialism-border-mesh" pointerEvents="none" aria-hidden="true">
            <path d={borderMesh.county} fill="none" className="imperialism-border"/>
            <path d={borderMesh.territory} fill="none" className="imperialism-border imperialism-territory-border"/>
            <path d={borderMesh.state} fill="none" className="imperialism-border imperialism-state-border"/>
            <path d={landOutline} fill="none" className="imperialism-border imperialism-land-outline"/>
          </g>
          {marks.map((mark,index) => {
            const team=byName.get(mark.owner); if(!team?.logo)return null;
            const imageSize=mark.size;
            return <g key={`${mark.owner}-${index}`} className={`imperialism-map-mark ${selected&&mark.owner!==selected?"imperialism-mark-dim":""}`}
              data-owner={mark.owner} onClick={event=>{event.stopPropagation();if(!dragged.current)followTeam(mark.owner);}}>
              <title>{mark.owner} territory</title>
              <g clipPath={mark.needsClip?`url(#imperial-region-${index})`:undefined}><g transform={`translate(${mark.x} ${mark.y}) scale(${1/zoom})`}>
                <image href={team.logo} x={-imageSize/2} y={-imageSize/2} width={imageSize} height={imageSize} preserveAspectRatio="xMidYMid meet"/>
              </g></g>
            </g>;
          })}
          {teams.map(team=>{
            const helmet=resolveTeamLogoAsset(team.team,"helmet");if(!helmet)return null;
            const [x,y]=point(team.lon,team.lat);
            return <g key={`campus-${team.team}`} className="imperialism-campus-marker" transform={`translate(${x} ${y}) scale(${Math.min(1,2/zoom)})`}>
              <title>{team.team} campus · Permanent school location</title>
              <image href={helmet} x="-3" y="-3" width="6" height="6" preserveAspectRatio="xMidYMid meet"/>
            </g>;
          })}
          <g className="imperialism-inset-labels" aria-hidden="true">{IMPERIALISM_INSET_LABELS.map(label=><text key={label.name} x={label.x} y={label.y} textAnchor="middle">{label.name}</text>)}</g>

        </svg>
        <div className="imperialism-map-help">SCROLL OR PINCH TO ZOOM · DRAG TO MOVE · DOUBLE TAP TO ZOOM</div>
        <div className="imperialism-hover" aria-live="polite">{hover ? <><strong>{hover.n}, {stateName(hover.i.slice(0,2))}</strong><span>Held by {activeOwner} · Started with {hover.seed}</span></> : <span>Tap a county to follow its current owner.</span>}</div>
        <input className="imperialism-slider" type="range" min="0" max={Math.max(0,timeline.length-1)} value={chosenStage}
          onChange={e=>setStage(Number(e.target.value))} aria-label="Imperialism week" />
        <div className="imperialism-slider-labels"><span>Opening map</span><strong>{timeline[chosenStage]?.label}</strong><span>{timeline.at(-1)?.label}</span></div>
        <p className="imperialism-method">FBS teams seed the map by nearest campus. Completed FBS games transfer all land held by the loser. {season===0&&"Territory carries forward from 2014 without annual resets. "}Alaska, Hawaii and Puerto Rico appear in boxed insets at separate display scales.</p>
      </div>
      <aside className="imperialism-leaders"><h3>Territory leaders</h3><p>Counties controlled</p>
        <div className="imperialism-leader-list">{totals.slice(0,20).map(([name,count],index)=> {
          const team=byName.get(name);
          return <button type="button" key={name} className={selected===name?"active":""}
            onClick={()=>{const next=selected===name?"":name,nextZoom=Math.max(zoom,1.5);setZoom(nextZoom);followTeam(next,nextZoom);}}>
            <span className="imperialism-place">{index+1}</span>{team?.logo && <img src={team.logo} alt="" />}
            <span className="imperialism-team">{name}</span><strong>{count}</strong></button>;
        })}</div>
        {data?.missingLocations.length ? <p className="imperialism-note">Campus locations unavailable for: {data.missingLocations.join(", ")}.</p> : null}
      </aside>
    </div>}
  </section>;
}
