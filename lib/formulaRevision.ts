/** Shared cache key for the current-season projection and profile response. */
export const currentMatchupFormulaRevision = "2026-predictive-matchups-v15-win-probability";
const siteDataViewRevision = "unified-power-evidence-13-market-source-audit";

/** Cache each published formula separately across every analytical tab. */
export function modelDataFetch(url:string, init?:RequestInit){
  const separator=url.includes("?")?"&":"?";
  const revision=url.includes("revision=")?"":`&revision=${currentMatchupFormulaRevision}`;
  const target=`${url}${separator}viewRevision=${siteDataViewRevision}${revision}`;
  return typeof window==="undefined"?fetch(target,init):import("./clientQuery").then(({cachedClientFetch})=>cachedClientFetch(target,init));
}
