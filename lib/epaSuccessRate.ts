/** EPA-derived success rate, using CFBD's per-play PPA model. */
export function aggregateEpaSuccessRates(payload:unknown){
  const counts=new Map<string,{successful:number;plays:number}>(),seen=new Set<string>();
  if(!Array.isArray(payload))return new Map<string,number>();
  for(const play of payload){
    if(!play||typeof play!=="object")continue;
    const game=String(play.gameId??play.game_id??""),team=String(play.offense??""),type=String(play.playType??play.play_type??""),description=String(play.playText??play.play_text??"");
    const value=play.ppa??play.epa;
    if(!game||!team||typeof value!=="number"||!Number.isFinite(value)||!(play.down>=1&&play.down<=4))continue;
    if(/kick|punt|field goal|\bpat\b|extra point|conversion|two.point|timeout|penalty|kneel|spike|end period/i.test(type)||/\bno play\b/i.test(description))continue;
    const id=String(play.id??"");if(id){const identity=`${game}:${id}`;if(seen.has(identity))continue;seen.add(identity);}
    const key=`${game}\u0000${team}`,count=counts.get(key)??{successful:0,plays:0};
    count.plays++;if(value>0)count.successful++;counts.set(key,count);
  }
  return new Map([...counts].map(([key,count])=>[key,count.successful/count.plays]));
}
