import type {RushingRow} from './rushing';
export function rushingPlayerKey(row:RushingRow){const id=row.playerId??row.rusherId;return id!=null?String(id):String(row.player??row.rusher??'');}
export function rushingPlayerOptions(rows:RushingRow[]){return [...new Map(rows.flatMap(r=>{const key=rushingPlayerKey(r);return key?[[key,{key,label:String(r.player??r.rusher??key)}] as const]:[];})).values()].sort((a,b)=>a.label.localeCompare(b.label));}
export function filterRushingRows(rows:RushingRow[],filters:{game?:string;player?:string;direction?:string}){return rows.filter(r=>(!filters.game||String(r.gameId)===filters.game)&&(!filters.player||rushingPlayerKey(r)===filters.player)&&(!filters.direction||String(r.rushDirection??'unknown')===filters.direction));}
