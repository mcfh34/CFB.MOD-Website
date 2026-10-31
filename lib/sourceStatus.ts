/** Classify upstream failures without exposing response bodies or credentials. */
export function sourceIssue(detail:string){
 if(!/CollegeFootballData/.test(detail))return null;
 const status=Number(detail.match(/returned (\d{3})/)?.[1]??0);
 if(status===429){
  const quota=/monthly|quota|per month|this month|month.*limit|limit.*month|subscription.*limit/i.test(detail);
  return {code:quota?'source-quota':'source-rate-limit',status,message:quota?'CollegeFootballData reports that the API usage quota is exhausted. New results cannot be imported until the quota resets or access is restored.':'CollegeFootballData is rejecting requests with HTTP 429. The refresh has not completed; previously stored results remain visible.'};
 }
 if(status===401||status===403)return {code:'source-access',status,message:'CollegeFootballData rejected the configured API access. New results have not been imported.'};
 return {code:'source-error',status,message:'CollegeFootballData could not supply the latest data. Previously stored results remain visible.'};
}
