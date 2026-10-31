export const visualizationDataRevision='results-freshness-v2';
/** Do not reuse a browser response across data refreshes. */
export function visualizationDataUrl(path:string){
 return `${path}${path.includes('?')?'&':'?'}dataRevision=${visualizationDataRevision}`;
}
export function visualizationCacheControl(active:boolean){return active?'no-store':'public, max-age=300, must-revalidate';}
