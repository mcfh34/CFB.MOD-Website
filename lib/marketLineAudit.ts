import type {MarketLineCandidate} from './marketLineQuality';
export type MarketLineIdentity={homeTeam?:string;awayTeam?:string};
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const key=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
/** Validate source fields without guessing a favorite or substituting opening odds. */
export function inspectMarketLine(input:MarketLineCandidate&MarketLineIdentity){
 const line={...input};const issues:string[]=[];
 for(const field of ['spread','spreadOpen'] as const)if(line[field]!==null&&(!finite(line[field])||Math.abs(line[field]!)>200)){issues.push(`${field}:invalid`);line[field]=null;if(field==='spread')line.formattedSpread=null;}
 for(const field of ['overUnder','overUnderOpen'] as const)if(line[field]!==null&&(!finite(line[field])||line[field]!<=0||line[field]!>200)){issues.push(`${field}:invalid`);line[field]=null;}
 const match=input.formattedSpread?.trim().match(/^(.+?)\s+([+-]?\d+(?:\.\d+)?)$/);
 if(match&&finite(line.spread)){
  const label=key(match[1]),amount=Number(match[2]);
  const home=input.homeTeam&&label===key(input.homeTeam),away=input.awayTeam&&label===key(input.awayTeam);
  if(home||away){
   const expected=home?amount:-amount;
   if(Math.abs(expected-line.spread)>.001){issues.push('spread:favorite-or-value-conflict');line.spread=null;line.formattedSpread=null;}
  }
 }
 if(!line.provider?.trim()&&[line.spread,line.spreadOpen,line.overUnder,line.overUnderOpen].some(finite)){
  issues.push('provider:missing');line.spread=null;line.spreadOpen=null;line.formattedSpread=null;line.overUnder=null;line.overUnderOpen=null;
 }
 return {line,issues};
}
