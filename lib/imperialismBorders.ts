import {projectImperialismPoint} from "./imperialismProjection";
type CountyGeometry={g:number[][][][]};
export type ImperialismBorder={first:number;second:number;path:string};
/** Draw each shared county edge once. Coastlines remain the edge of the land
 * fill, avoiding doubled outlines around very narrow barrier islands.
 */
export function imperialismBorders(counties:readonly CountyGeometry[]):ImperialismBorder[]{
 const edges=new Map<string,{county:number;first:number[];second:number[]}>(),borders=new Map<string,ImperialismBorder>();
 for(let county=0;county<counties.length;county++)for(const polygon of counties[county].g)for(const ring of polygon)for(let i=1;i<ring.length;i++){
  const first=ring[i-1],second=ring[i];if(first[0]===second[0]&&first[1]===second[1])continue;
  const a=`${first[0]},${first[1]}`,b=`${second[0]},${second[1]}`,key=a<b?`${a}|${b}`:`${b}|${a}`,prior=edges.get(key);
  if(!prior){edges.set(key,{county,first,second});continue;}if(prior.county===county)continue;
  const pair=`${prior.county}:${county}`,border=borders.get(pair)??{first:prior.county,second:county,path:""};
  const start=projectImperialismPoint(first[0],first[1]),end=projectImperialismPoint(second[0],second[1]);
  border.path+=`M${start[0].toFixed(3)},${start[1].toFixed(3)}L${end[0].toFixed(3)},${end[1].toFixed(3)}`;borders.set(pair,border);
 }
 return [...borders.values()];
}

/** Exterior land edges only: no internal county/state seams or connecting lines. */
export function imperialismOutline(counties:readonly CountyGeometry[]):string{
 const edges=new Map<string,{count:number;first:number[];second:number[]}>();
 for(const county of counties)for(const polygon of county.g)for(const ring of polygon)for(let i=1;i<ring.length;i++){
  const first=ring[i-1],second=ring[i];if(first[0]===second[0]&&first[1]===second[1])continue;
  const a=`${first[0]},${first[1]}`,b=`${second[0]},${second[1]}`,key=a<b?`${a}|${b}`:`${b}|${a}`;
  const prior=edges.get(key);if(prior)prior.count++;else edges.set(key,{count:1,first,second});
 }
 return [...edges.values()].filter(e=>e.count===1).map(e=>{
  const a=projectImperialismPoint(e.first[0],e.first[1]),b=projectImperialismPoint(e.second[0],e.second[1]);
  return `M${a[0].toFixed(3)},${a[1].toFixed(3)}L${b[0].toFixed(3)},${b[1].toFixed(3)}`;
 }).join('');
}
