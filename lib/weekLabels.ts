/** Human-facing labels only. Keep numeric week IDs unchanged in data and URLs. */
export function weekLabel(week:number|string,style:"title"|"upper"|"compact"="title"){
  const value=Number(week);
  if(value===14)return style==="upper"?"RIVALRY WEEK":style==="compact"?"Rivalry":"Rivalry Week";
  if(value===15)return"CC";
  return style==="upper"?`WEEK ${week}`:style==="compact"?`W${week}`:`Week ${week}`;
}
