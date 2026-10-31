export type ScheduledWeek = {week:number; firstStart:string};

function centralDate(date:Date){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const part=(type:string)=>parts.find(item=>item.type===type)?.value??"";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function currentSeason(date:Date){
  const [year,month]=centralDate(date).split("-").map(Number);
  return month>=7?year:year-1;
}

/** Assign each scheduled week to the Monday–Sunday containing its first game in Central time. */
export function currentScheduledWeek(rows:ScheduledWeek[],date:Date):number|null{
  const today=centralDate(date);
  const eligible=rows.filter(row=>Number.isInteger(row.week)&&row.week>=0&&row.week<=16&&Number.isFinite(Date.parse(row.firstStart)));
  for(const row of eligible){
    const first=centralDate(new Date(row.firstStart));
    const monday=new Date(`${first}T12:00:00Z`);
    monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
    const start=monday.toISOString().slice(0,10);
    const end=new Date(monday);
    end.setUTCDate(end.getUTCDate()+7);
    if(today>=start&&today<end.toISOString().slice(0,10))return row.week;
  }
  return null;
}
