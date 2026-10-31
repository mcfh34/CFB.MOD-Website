import { AsyncLocalStorage } from 'node:async_hooks';

export const WEEKLY_API_LIMIT = 40;
export function sundayNoonSlot(now = new Date()): string | null {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const p = Object.fromEntries(parts.map(part => [part.type,part.value]));
  return p.weekday === 'Sun' && p.hour === '12' ? `${p.year}-${p.month}-${p.day}` : null;
}
type Context = {db:D1Database; write:boolean; remaining:number; pending:Map<string,Promise<unknown>>; blocked:boolean};
const context = new AsyncLocalStorage<Context>();
export function withApiPolicy<T>(db:D1Database, write:boolean, action:()=>Promise<T>) {
  return context.run({db,write,remaining:WEEKLY_API_LIMIT,pending:new Map(),blocked:false},action);
}
async function cacheTable(db:D1Database) {
  await db.prepare('CREATE TABLE IF NOT EXISTS weekly_api_cache (cache_key TEXT NOT NULL, part INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(cache_key,part))').run();
}
export async function cachedApiRequest(url:URL, fetcher:()=>Promise<unknown>) {
  const state=context.getStore();
  if(!state) throw new Error('Stats update only Sundays at 12:00 PM America/Chicago');
  const params=new URLSearchParams(url.searchParams);
  const bulkPaths=["/games/players","/passing/players/season","/rushing/players/season","/ppa/players/games","/stats/player/success/game","/rankings","/passing/teams/season","/passing/teams/games","/passing/players/games","/rushing/teams/season","/rushing/teams/games","/rushing/players/games"];
  const bulk=bulkPaths.includes(url.pathname);
  if(bulk)for(const name of [...params.keys()])if(name!=="year")params.delete(name);
  params.sort();
  const cacheKey=`${url.pathname}?${params}`;
  const select=(input:unknown)=>{
    if(!bulk||!Array.isArray(input))return input;
    const team=url.searchParams.get("team"),week=url.searchParams.get("week"),player=url.searchParams.get("playerId"),seasonType=url.searchParams.get("seasonType");
    return input.filter(row=>{
      if(week && Number(row.week)!==Number(week))return false;
      if(seasonType && seasonType!=="both" && row.seasonType && row.seasonType!==seasonType)return false;
      if(team && row.team && row.team!==team)return false;
      if(team && Array.isArray(row.teams) && !row.teams.some((t:{school?:string;team?:string})=>t.school===team||t.team===team))return false;
      if(player && (row.playerId??row.id) && String(row.playerId??row.id)!==player)return false;
      return true;
    });
  };
  const pending=state.pending.get(cacheKey);if(pending)return select(await pending);
  const task=(async()=>{
    await cacheTable(state.db);
    const rows=await state.db.prepare('SELECT payload FROM weekly_api_cache WHERE cache_key=? ORDER BY part').bind(cacheKey).all<{payload:string}>();
    if(!state.write) return rows.results.length ? JSON.parse(rows.results.map(r=>r.payload).join('')) : [];
    if(state.blocked||state.remaining<=0)throw new Error('Weekly API budget exhausted; existing published data preserved');
    state.remaining--;
    let result:unknown;
    try {result=await fetcher();} catch(error) {if([401,403,429].includes(Number((error as {status?:number}).status)))state.blocked=true;throw error;}
    const payload=JSON.stringify(result);
    const statements=[state.db.prepare('DELETE FROM weekly_api_cache WHERE cache_key=?').bind(cacheKey)];
    for(let offset=0;offset<payload.length;offset+=100000)statements.push(state.db.prepare('INSERT INTO weekly_api_cache(cache_key,part,payload) VALUES(?,?,?)').bind(cacheKey,offset/100000,payload.slice(offset,offset+100000)));
    for(let i=0;i<statements.length;i+=20)await state.db.batch(statements.slice(i,i+20));
    return result;
  })();
  state.pending.set(cacheKey,task);
  return select(await task);
}
