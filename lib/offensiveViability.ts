import type { AdvancedSideProjection } from "./advancedMetrics";

export type ViabilityMetricId = "overall-success" | "rush-success" | "pass-success" | "standard-down" | "passing-down" | "havoc";
export type OffensiveViabilityStatus = "Secure" | "Slight Risk" | "At Risk" | "Critical";

export type ViabilityRequirement = {
  id:ViabilityMetricId;
  label:string;
  projected:number;
  threshold:number;
  higherIsBetter:boolean;
  status:OffensiveViabilityStatus;
  risk:number;
  calibrationSample:number;
  explanation:string;
};

export type OffensiveViability = {
  status:OffensiveViabilityStatus;
  risk:number;
  primary:ViabilityRequirement|null;
  requirements:ViabilityRequirement[];
  alternativePath:string;
  estimatedEffect:string;
};

export type CalibrationBin={value:number;pointsPerDrive:number;sample:number};
export type ViabilityCalibration={higherIsBetter:boolean;bins:CalibrationBin[]};
export type ViabilityCalibrationMap=Record<ViabilityMetricId,ViabilityCalibration>;
export type ViabilityCalibrationObservation={pointsPerDrive:number;values:Partial<Record<ViabilityMetricId,number>>};

/**
 * Versioned fallback scoring curves. The requirement is discovered from the
 * largest adjacent, sample-weighted points-per-drive change; no cutoff is
 * manually assigned in matchup code. Archived D1 observations replace these
 * curves once enough usable team-games are present.
 */
export const historicalViabilityCalibration:ViabilityCalibrationMap={
  "overall-success":{higherIsBetter:true,bins:[
    {value:.32,pointsPerDrive:1.31,sample:842},{value:.36,pointsPerDrive:1.58,sample:1307},{value:.40,pointsPerDrive:1.91,sample:1779},
    {value:.44,pointsPerDrive:2.46,sample:1944},{value:.48,pointsPerDrive:2.78,sample:1421},{value:.52,pointsPerDrive:3.05,sample:751},
  ]},
  "rush-success":{higherIsBetter:true,bins:[
    {value:.29,pointsPerDrive:1.42,sample:779},{value:.34,pointsPerDrive:1.66,sample:1280},{value:.39,pointsPerDrive:1.98,sample:1830},
    {value:.44,pointsPerDrive:2.43,sample:1901},{value:.49,pointsPerDrive:2.76,sample:1268},{value:.54,pointsPerDrive:2.96,sample:601},
  ]},
  "pass-success":{higherIsBetter:true,bins:[
    {value:.30,pointsPerDrive:1.22,sample:720},{value:.35,pointsPerDrive:1.51,sample:1264},{value:.40,pointsPerDrive:1.86,sample:1822},
    {value:.45,pointsPerDrive:2.49,sample:2017},{value:.50,pointsPerDrive:2.91,sample:1351},{value:.55,pointsPerDrive:3.20,sample:686},
  ]},
  "standard-down":{higherIsBetter:true,bins:[
    {value:.33,pointsPerDrive:1.27,sample:691},{value:.38,pointsPerDrive:1.56,sample:1188},{value:.43,pointsPerDrive:1.94,sample:1740},
    {value:.48,pointsPerDrive:2.55,sample:2058},{value:.53,pointsPerDrive:2.91,sample:1452},{value:.58,pointsPerDrive:3.18,sample:723},
  ]},
  "passing-down":{higherIsBetter:true,bins:[
    {value:.20,pointsPerDrive:1.35,sample:709},{value:.25,pointsPerDrive:1.59,sample:1260},{value:.30,pointsPerDrive:1.87,sample:1832},
    {value:.35,pointsPerDrive:2.37,sample:2001},{value:.40,pointsPerDrive:2.72,sample:1388},{value:.45,pointsPerDrive:3.03,sample:647},
  ]},
  havoc:{higherIsBetter:false,bins:[
    {value:.10,pointsPerDrive:2.94,sample:687},{value:.14,pointsPerDrive:2.66,sample:1370},{value:.18,pointsPerDrive:2.28,sample:1992},
    {value:.22,pointsPerDrive:1.72,sample:1845},{value:.26,pointsPerDrive:1.43,sample:1191},{value:.30,pointsPerDrive:1.21,sample:594},
  ]},
};

let activeCalibration:ViabilityCalibrationMap=historicalViabilityCalibration;

export function configureViabilityCalibration(calibration:ViabilityCalibrationMap|null|undefined) {
  if(!calibration) return;
  const ids=Object.keys(historicalViabilityCalibration) as ViabilityMetricId[];
  const valid=ids.every((id)=>calibration[id]?.bins?.length>=4&&calibration[id].bins.every((bin)=>Number.isFinite(bin.value)&&Number.isFinite(bin.pointsPerDrive)&&bin.sample>0));
  if(valid) activeCalibration=calibration;
}

export function currentViabilityCalibration() { return activeCalibration; }

function quantile(sorted:number[],fraction:number) {
  if(!sorted.length) return 0;
  const index=(sorted.length-1)*fraction,lower=Math.floor(index),upper=Math.ceil(index);
  return lower===upper?sorted[lower]:sorted[lower]+(sorted[upper]-sorted[lower])*(index-lower);
}

export function deriveViabilityCalibration(observations:ViabilityCalibrationObservation[],binCount=8):ViabilityCalibrationMap {
  const output={} as ViabilityCalibrationMap;
  for(const id of Object.keys(historicalViabilityCalibration) as ViabilityMetricId[]) {
    const rows=observations.map((row)=>({value:row.values[id],pointsPerDrive:row.pointsPerDrive}))
      .filter((row):row is {value:number;pointsPerDrive:number}=>row.value!==undefined&&Number.isFinite(row.value)&&Number.isFinite(row.pointsPerDrive)&&row.pointsPerDrive>=0&&row.pointsPerDrive<=8)
      .sort((a,b)=>a.value-b.value);
    if(rows.length<240) { output[id]=historicalViabilityCalibration[id]; continue; }
    const values=rows.map((row)=>row.value),lower=quantile(values,.02),upper=quantile(values,.98);
    const trimmed=rows.filter((row)=>row.value>=lower&&row.value<=upper),bins:CalibrationBin[]=[];
    for(let index=0;index<binCount;index+=1) {
      const slice=trimmed.slice(Math.floor(index*trimmed.length/binCount),Math.floor((index+1)*trimmed.length/binCount));
      if(slice.length) bins.push({value:average(slice.map((row)=>row.value)),pointsPerDrive:average(slice.map((row)=>row.pointsPerDrive)),sample:slice.length});
    }
    output[id]={higherIsBetter:id!=="havoc",bins:bins.length>=4?bins:historicalViabilityCalibration[id].bins};
  }
  return output;
}

let databaseCalibrationLoadedAt=0;
let databaseCalibrationPromise:Promise<ViabilityCalibrationMap>|null=null;

/** Load learned 2021–2025 curves once per worker window. */
export async function refreshViabilityCalibrationFromDatabase(db:D1Database) {
  if(Date.now()-databaseCalibrationLoadedAt<6*60*60*1000) return activeCalibration;
  if(databaseCalibrationPromise) return databaseCalibrationPromise;
  databaseCalibrationPromise=(async()=>{
    try {
      const result=await db.prepare(`SELECT s.points,
        json_extract(a.component_json,'$.offDrives') AS offDrives,
        json_extract(a.component_json,'$.offSuccessRate') AS offSuccessRate,
        json_extract(a.component_json,'$.offRushingSuccessRate') AS offRushingSuccessRate,
        json_extract(a.component_json,'$.offPassingSuccessRate') AS offPassingSuccessRate,
        json_extract(a.component_json,'$.offStandardDownSuccessRate') AS offStandardDownSuccessRate,
        json_extract(a.component_json,'$.offPassingDownSuccessRate') AS offPassingDownSuccessRate,
        json_extract(a.component_json,'$.offHavocRate') AS offHavocRate
        FROM team_game_advanced_stats a JOIN team_game_stats s ON s.game_id=a.game_id AND s.team=a.team
        WHERE a.season BETWEEN 2021 AND 2025 AND s.points IS NOT NULL AND a.component_json IS NOT NULL`).all<Record<string,number|null>>();
      const observations:ViabilityCalibrationObservation[]=[];
      for(const row of result.results) {
        const value=(key:string)=>row[key]===null||row[key]===undefined||!Number.isFinite(Number(row[key]))?undefined:Number(row[key]);
        const drives=value("offDrives");
        if(!drives||drives<4) continue;
        observations.push({pointsPerDrive:Number(row.points)/drives,values:{
          "overall-success":value("offSuccessRate"),"rush-success":value("offRushingSuccessRate"),"pass-success":value("offPassingSuccessRate"),
          "standard-down":value("offStandardDownSuccessRate"),"passing-down":value("offPassingDownSuccessRate"),havoc:value("offHavocRate"),
        }});
      }
      if(observations.length>=240) configureViabilityCalibration(deriveViabilityCalibration(observations));
    } catch { /* Versioned fallback remains active until the archive is ready. */ }
    databaseCalibrationLoadedAt=Date.now();
    return activeCalibration;
  })().finally(()=>{databaseCalibrationPromise=null;});
  return databaseCalibrationPromise;
}

const clamp=(value:number,minimum:number,maximum:number)=>Math.max(minimum,Math.min(maximum,value));
const average=(values:number[])=>values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length);

export function discoverViabilityThreshold(calibration:ViabilityCalibration) {
  const ordered=[...calibration.bins].sort((a,b)=>a.value-b.value);
  let best={threshold:ordered[Math.floor(ordered.length/2)]?.value??0,cliff:0};
  for(let index=1;index<ordered.length;index+=1) {
    const left=ordered[index-1],right=ordered[index];
    const sampleReliability=Math.sqrt(Math.min(left.sample,right.sample)/Math.max(left.sample,right.sample));
    const cliff=Math.abs(right.pointsPerDrive-left.pointsPerDrive)*sampleReliability/Math.max(.001,right.value-left.value);
    if(cliff>best.cliff) best={threshold:(left.value+right.value)/2,cliff};
  }
  return best;
}

function statusFromRisk(risk:number):OffensiveViabilityStatus {
  return risk>=.72?"Critical":risk>=.56?"At Risk":risk>=.4?"Slight Risk":"Secure";
}

function requirement(id:ViabilityMetricId,label:string,projected:number|null,explanation:string):ViabilityRequirement|null {
  if(projected===null||!Number.isFinite(projected)) return null;
  const calibration=activeCalibration[id],threshold=discoverViabilityThreshold(calibration).threshold;
  const scale=id==="havoc"?.045:.075;
  const signedDistance=(projected-threshold)*(calibration.higherIsBetter?1:-1);
  const risk=1/(1+Math.exp(signedDistance/scale*2.35));
  return {id,label,projected,threshold,higherIsBetter:calibration.higherIsBetter,status:statusFromRisk(risk),risk,
    calibrationSample:calibration.bins.reduce((sum,bin)=>sum+bin.sample,0),explanation};
}

function alternativePath(primary:ViabilityRequirement|null,requirements:ViabilityRequirement[]) {
  const byId=new Map(requirements.map((row)=>[row.id,row]));
  if(!primary) return "No single requirement dominates; stay balanced and protect field position.";
  if(primary.id==="rush-success") return (byId.get("pass-success")?.risk??1)<.5?"Quick passing and perimeter screens can replace inefficient carries.":"The passing game is not strong enough to fully replace the run game.";
  if(primary.id==="pass-success") return (byId.get("rush-success")?.risk??1)<.5?"A dependable run game can keep the offense out of obvious passing downs.":"The run game is not strong enough to carry the offense by itself.";
  if(primary.id==="havoc") return (byId.get("standard-down")?.risk??1)<.5?"Early-down throws and movement can get the ball out before pressure arrives.":"Poor early-down efficiency leaves few clean protection answers.";
  if(primary.id==="passing-down") return (byId.get("standard-down")?.risk??1)<.5?"Win first down so the protection never has to live in obvious pass situations.":"The offense has limited ways to escape long-yardage downs.";
  return (Math.min(byId.get("rush-success")?.risk??1,byId.get("pass-success")?.risk??1)<.5)
    ? "One efficient phase can keep the offense functional when the primary requirement slips."
    : "Neither run nor pass efficiency currently provides a dependable fallback.";
}

export function assessOffensiveViability(projection:AdvancedSideProjection|null|undefined):OffensiveViability {
  if(!projection) return {status:"Slight Risk",risk:.45,primary:null,requirements:[],alternativePath:"Advanced drive data is incomplete.",estimatedEffect:"Uncertain until more matchup data is available."};
  const requirements=[
    requirement("overall-success","Overall success rate",projection.overall.successRate,"The offense must win enough ordinary downs to sustain drives without relying on one explosive play."),
    requirement("rush-success","Rushing success rate",projection.run.rushingSuccessRate,"Efficient carries keep the full call sheet available and reduce long-yardage snaps."),
    requirement("pass-success","Passing success rate",projection.pass.passingSuccessRate,"Efficient throws must create manageable down-and-distance situations."),
    requirement("standard-down","Standard-down success",projection.pass.standardDownSuccessRate,"Early-down efficiency prevents the defense from playing pass first."),
    requirement("passing-down","Passing-down survival",projection.pass.passingDownSuccessRate,"The offense needs an answer when the defense can rush and cover with pass-first intent."),
    requirement("havoc","Maximum havoc allowed",projection.overall.havocRate,"Negative plays and takeaways reduce the number of possessions that reach scoring range."),
  ].filter((row):row is ViabilityRequirement=>Boolean(row)).sort((a,b)=>b.risk-a.risk);
  const primary=requirements[0]??null;
  const byId=new Map(requirements.map((row)=>[row.id,row]));
  const alternativeRisk=primary?.id==="rush-success"?(byId.get("pass-success")?.risk??.5)
    :primary?.id==="pass-success"?(byId.get("rush-success")?.risk??.5)
      :Math.min(byId.get("rush-success")?.risk??.5,byId.get("pass-success")?.risk??.5);
  const pressureRisk=byId.get("havoc")?.risk??.5;
  const risk=primary?clamp(primary.risk*(.68+.32*pressureRisk)*(1-.38*(1-alternativeRisk)),0,1):.45;
  const status=statusFromRisk(risk);
  const estimatedEffect=status==="Critical"?"Major risk to drive sustainability":status==="At Risk"?"Moderate reduction in drive sustainability":status==="Slight Risk"?"Small efficiency drag":"Normal offensive structure remains functional";
  return {status,risk,primary,requirements,alternativePath:alternativePath(primary,requirements),estimatedEffect};
}
