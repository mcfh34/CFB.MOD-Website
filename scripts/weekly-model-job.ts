import {readFile,writeFile} from "node:fs/promises";
import {computeBackgroundModel,type ModelInput} from "../lib/backgroundModel";
import {JOB_AUDIENCE} from "../lib/githubJobAuth";
const site=process.env.HARPER_SITE_URL??"https://harpercfbmodel.com";
const local=process.argv.includes("--input");
if(!local&&process.env.GITHUB_EVENT_NAME==="schedule"){
 const hour=new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",hour:"2-digit",hourCycle:"h23"}).format(new Date());
 if(hour!=="12"){console.log("Skipping the other daylight-saving candidate");process.exit(0);}
}
let input:ModelInput;
if(local)input=JSON.parse(await readFile(process.argv[process.argv.indexOf("--input")+1],"utf8"));
else{const response=await fetch(`${site}/api/background/input`);if(response.status===202){console.log("No model profiles yet");process.exit(0);}if(!response.ok)throw Error(`Input failed: ${response.status}`);input=await response.json() as ModelInput;}
const existing=local?null:await fetch(`${site}/api/background/result?season=${input.season}`).then(r=>r.status===200?r.json():null) as {sourceStamp?:string;formulaRevision?:string}|null;
if(existing?.sourceStamp===input.sourceStamp&&existing.formulaRevision===input.formulaRevision){console.log("Published calculation already matches this source revision");process.exit(0);}
const output=computeBackgroundModel(input);
if(local){await writeFile(process.argv[process.argv.indexOf("--input")+1]+".result.json",JSON.stringify(output));console.log(`Computed ${output.roundRobin.length} teams, ${output.iterations} simulations`);}
else{
 const tokenUrl=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,tokenAuth=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;if(!tokenUrl||!tokenAuth)throw Error("GitHub job identity unavailable");
 const identity=await fetch(`${tokenUrl}&audience=${encodeURIComponent(JOB_AUDIENCE)}`,{headers:{authorization:`Bearer ${tokenAuth}`}});if(!identity.ok)throw Error("Job identity request failed");const {value}=await identity.json() as {value:string};
 const response=await fetch(`${site}/api/background/result`,{method:"POST",headers:{authorization:`Bearer ${value}`,"content-type":"application/json"},body:JSON.stringify(output)});if(!response.ok)throw Error(`Publication failed: ${response.status} ${await response.text()}`);console.log(await response.text());
}
