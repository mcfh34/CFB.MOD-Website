export const passingEndpoints = {
  'team-season':'/passing/teams/season', 'player-season':'/passing/players/season',
  'team-games':'/passing/teams/games', 'player-games':'/passing/players/games', plays:'/passing/plays',
} as const;
export type PassingView=keyof typeof passingEndpoints;
export type PassingRow=Record<string,unknown>;
export const passLocations=['short left','short middle','short right','deep left','deep middle','deep right'] as const;
export type PassLocation=typeof passLocations[number];
export const passingMetrics=[
 ['attempts','Attempts',false],['completions','Completions',false],['totalYards','Pass yards',false],
 ['yardsPerAttempt','Yards / attempt',false],['completionRate','Completion rate',true],['interceptions','Interceptions',false],
 ['averageDepthOfTarget','ADOT',false],['averageYardsAfterCatch','YAC / completion',false],
 ['successRate','Success rate',true],['ppa','PPA / play',false],['totalPpa','Total PPA',false],['explosiveness','Explosiveness',false],
 ['locationEligibleAttempts','Location-eligible attempts',false],['locationAvailableAttempts','Known-location attempts',false],
] as const;
export function passingObject(value:unknown):PassingRow{return value&&typeof value==='object'&&!Array.isArray(value)?value as PassingRow:{};}
export function passingYpa(row:PassingRow){
 if(typeof row.yardsPerAttempt==='number'&&Number.isFinite(row.yardsPerAttempt))return row.yardsPerAttempt;
 const n=row.totalYardsAttemptsAvailable;
 return typeof n==='number'&&n>0&&typeof row.totalYards==='number'?row.totalYards/n:null;
}
export function passingPlayerKey(row:PassingRow){const id=row.playerId??row.passerId;return id!=null?String(id):String(row.player??row.passer??'');}
export function passingPlayerOptions(rows:PassingRow[]){return [...new Map(rows.flatMap(r=>{const key=passingPlayerKey(r);return key?[[key,{key,label:String(r.player??r.passer??key)}] as const]:[];})).values()].sort((a,b)=>a.label.localeCompare(b.label));}
export function filterPassingRows(rows:PassingRow[],filters:{game?:string;player?:string;location?:string;offense?:string}){return rows.filter(r=>(!filters.game||String(r.gameId)===filters.game)&&(!filters.player||passingPlayerKey(r)===filters.player)&&(!filters.location||String(r.passLocation??'unknown')===filters.location)&&(!filters.offense||r.offense===filters.offense));}
