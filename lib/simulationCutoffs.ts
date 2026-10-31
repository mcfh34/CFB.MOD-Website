/** Results advance independently of delayed statistical profile imports. */
export function simulationCutoffs(throughWeek:number,latestProfileWeek:number|null){
 const resultsWeek=Math.max(0,Math.min(20,Math.trunc(throughWeek)));
 return {resultsWeek,profileWeek:Math.max(0,Math.min(resultsWeek,latestProfileWeek??0))};
}
