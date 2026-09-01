import type { AdvancedProfile, AdvancedSideProjection } from "./advancedMetrics";
import type { OffensiveViability } from "./offensiveViability";
import type { PossessionScoreReceipt } from "./scoringModel";
import { baselines } from "../app/modelData";

export type Importance = "Minor Edge" | "Moderate Edge" | "Major Edge" | "Game Defining Edge";
export type Confidence = "Developing" | "Solid" | "High";

export type BroadcastMetric = {
  label: string;
  value: string;
  comparison: string;
  tone: "advantage" | "warning" | "neutral";
};

export type GamePlanRecommendation = {
  call: string;
  area: "Vertical pass" | "Quick game" | "Interior run" | "Perimeter run" | "Protection" | "Stay on schedule";
  importance: Importance;
  confidence: Confidence;
  why: string;
  statistics: string[];
  riskIfIgnored: string;
  score: number;
};

export type CoordinatorScouting = {
  identity: {
    label: string;
    personnel: string;
    passRate: number;
    coreConcepts: string[];
    evidence: string[];
    broadcastStats: BroadcastMetric[];
  };
  pressure: {
    grade: number;
    threat: "LOW" | "MANAGEABLE" | "HIGH" | "SEVERE";
    defensivePlan: string;
    protectionCall: string;
    hotAnswer: string;
    why: string;
    evidence: string[];
    broadcastStats: BroadcastMetric[];
  };
  coverage: {
    shell: string;
    leverage: string;
    attack: string;
    conflictDefender: string;
    why: string;
    evidence: string[];
    broadcastStats: BroadcastMetric[];
  };
  front: {
    structure: string;
    fit: string;
    runAnswer: string;
    why: string;
    evidence: string[];
    broadcastStats: BroadcastMetric[];
  };
  situations: {
    earlyDown: string;
    passingDown: string;
    thirdDown: string;
    redZone: string;
  };
  dataNote: string;
};

export type SideGamePlan = {
  offenseTeam: string;
  defenseTeam: string;
  largestAdvantage: GamePlanRecommendation;
  recommendations: GamePlanRecommendation[];
  failureAnalysis: string;
  viability: OffensiveViability;
  scoreReceipt: PossessionScoreReceipt;
  coordinator: CoordinatorScouting;
};

export type DecidingFactor = {
  title: string;
  summary: string;
  team: string;
  score: number;
  importance: Importance;
  confidence: Confidence;
  evidence: string[];
  edgeSide: "OFFENSE" | "DEFENSE";
};

export type MatchupIntelligence = {
  home: SideGamePlan;
  away: SideGamePlan;
  decidingFactors: DecidingFactor[];
  controlTeam: string | null;
  controlUnit: string;
  controlReason: string;
  confidence: Confidence;
  gameScript: string;
};

const clamp = (value:number, minimum:number, maximum:number) => Math.max(minimum, Math.min(maximum, value));
const num = (value:number, digits=2) => value.toFixed(digits);
const pct = (value:number) => `${(value * 100).toFixed(0)}%`;

function importance(score:number):Importance {
  const magnitude=Math.abs(score);
  return magnitude>=.78?"Game Defining Edge":magnitude>=.5?"Major Edge":magnitude>=.25?"Moderate Edge":"Minor Edge";
}

function confidence(score:number,coverage:number):Confidence {
  const value=Math.abs(score)*clamp(coverage/7,.45,1);
  return value>=.62?"High":value>=.3?"Solid":"Developing";
}

function recommendation(
  call:string,area:GamePlanRecommendation["area"],score:number,coverage:number,why:string,statistics:string[],riskIfIgnored:string,
):GamePlanRecommendation {
  return {call,area,score,importance:importance(score),confidence:confidence(score,coverage),why,statistics,riskIfIgnored};
}

function ratio(value:number|null|undefined,baseline:number|null|undefined) {
  return value!==null&&value!==undefined&&baseline!==null&&baseline!==undefined&&baseline!==0?value/baseline-1:0;
}

function metricLine(label:string,value:number|null|undefined,format:"rate"|"number"="rate") {
  if(value===null||value===undefined||!Number.isFinite(value)) return null;
  return `${label} ${format==="rate"?pct(value):num(value)}`;
}

function broadcastMetric(
  label:string,
  value:number|null|undefined,
  baseline:number|null|undefined,
  format:"rate"|"number"="rate",
  higherIsBetter=true,
):BroadcastMetric|null {
  if(value===null||value===undefined||baseline===null||baseline===undefined||!Number.isFinite(value)||!Number.isFinite(baseline)) return null;
  const rawDelta=format==="rate" ? value-baseline : baseline===0 ? 0 : value/baseline-1;
  const favorableDelta=higherIsBetter?rawDelta:-rawDelta;
  const tone=favorableDelta>=.025?"advantage":favorableDelta<=-.025?"warning":"neutral";
  const comparison=format==="rate"
    ? `${rawDelta>=0?"+":""}${(rawDelta*100).toFixed(1)} pts vs FBS`
    : `${rawDelta>=0?"+":""}${(rawDelta*100).toFixed(0)}% vs FBS`;
  return {
    label,
    value:format==="rate"?`${(value*100).toFixed(1)}%`:value.toFixed(2),
    comparison,
    tone,
  };
}

function matchupEvidence(
  label:string,
  value:number|null|undefined,
  baseline:number|null|undefined,
  format:"rate"|"number"="rate",
) {
  const metric=broadcastMetric(label,value,baseline,format);
  return metric?`${metric.label} ${metric.value} · ${metric.comparison}`:null;
}

function coordinatorScouting(
  offenseTeam:string,
  defenseTeam:string,
  projection:AdvancedSideProjection,
  offenseProfile:AdvancedProfile,
  coreOffense:readonly number[]|undefined,
):CoordinatorScouting {
  const baseline=offenseProfile.baseline;
  const passAttempts=baselines.patt*Number(coreOffense?.[3]??1);
  const rushAttempts=baselines.ratt*Number(coreOffense?.[4]??1);
  const passRate=passAttempts/Math.max(1,passAttempts+rushAttempts);
  const nationalPassRate=baselines.patt/(baselines.patt+baselines.ratt);
  const optionVolume=Number(coreOffense?.[3]??1)<=.78&&Number(coreOffense?.[4]??1)>=1.15;
  const passEfficiency=.55*ratio(projection.pass.passingSuccessRate,baseline.passingSuccessRate)+.45*ratio(projection.pass.completionRate,baseline.completionRate);
  const passDepth=.55*ratio(projection.pass.passingExplosiveness,baseline.passingExplosiveness)+.45*ratio(projection.pass.yardsPerCompletion,baseline.yardsPerCompletion);
  const runEfficiency=.5*ratio(projection.run.rushingSuccessRate,baseline.rushingSuccessRate)+.3*ratio(projection.run.lineYards,baseline.lineYards)+.2*ratio(projection.run.secondLevelYards,baseline.secondLevelYards);
  const identity=optionVolume
    ? {label:"FLEXBONE / OPTION",personnel:"Flexbone · two wings · fullback",coreConcepts:["Midline option","Veer","Rocket motion"]}
    : passRate>=.59&&passDepth>=.035
      ? {label:"VERTICAL AIR RAID",personnel:"10 personnel · four wide",coreConcepts:["Four verticals","Switch release","Boundary flood"]}
      : passRate>=.57
        ? {label:"AIR RAID SPACING",personnel:"10 personnel · four wide",coreConcepts:["Mesh","Y-cross","Quick screens"]}
        : passRate>=.51&&passEfficiency>=runEfficiency
          ? {label:"SPREAD RPO",personnel:"11 personnel · shotgun",coreConcepts:["Inside zone RPO","Glance route","Mesh"]}
          : passRate<=.43&&runEfficiency>=.02
            ? {label:"GAP-SCHEME POWER",personnel:"21 / 12 personnel · under center",coreConcepts:["Duo","Power O","Play-action cross"]}
            : runEfficiency>passEfficiency+.055
              ? {label:"RUN-FIRST MULTIPLE",personnel:"11 / 12 personnel · multiple",coreConcepts:["Inside-out run menu","Counter","Boot action"]}
              : passEfficiency>runEfficiency+.055
                ? {label:"PASS-FIRST MULTIPLE",personnel:"11 personnel · multiple",coreConcepts:["Quick game","Dropback flood","RPO access"]}
                : {label:"BALANCED MULTIPLE",personnel:"11 personnel · multiple",coreConcepts:["Inside zone","Play action","Concept rotation"]};

  const frontSevenDelta=ratio(projection.overall.frontSevenHavoc,baseline.frontSevenHavoc);
  const havocDelta=ratio(projection.overall.havocRate,baseline.havocRate);
  const passingDownStress=-ratio(projection.pass.passingDownSuccessRate,baseline.passingDownSuccessRate);
  const passingDownValueStress=-ratio(projection.pass.passingDownPpa,baseline.passingDownPpa);
  const pressureSignal=clamp((.44*frontSevenDelta+.28*havocDelta+.18*passingDownStress+.1*passingDownValueStress)/.28,-1,1);
  const pressureGrade=Math.round(50+50*pressureSignal);
  const pressureThreat=pressureGrade>=76?"SEVERE":pressureGrade>=61?"HIGH":pressureGrade>=41?"MANAGEABLE":"LOW";
  const defensivePressurePlan=optionVolume
    ? "EDGE CONTAIN + SCRAPE EXCHANGE"
    : pressureGrade>=76
      ? "SIMULATED PRESSURE + FIVE-MAN CHANGEUP"
      : pressureGrade>=61
        ? "FOUR-MAN RUSH + CREEPER TAGS"
        : pressureGrade<=40
          ? "RUSH FOUR / DROP SEVEN"
          : "MIXED FOUR-MAN RUSH";
  const protectionCall=pressureGrade>=76
    ? passDepth>.035?"7-MAN MAX PROTECT · TWO-MAN ROUTE":"6-MAN HALF-SLIDE · BUILT-IN HOT"
    : pressureGrade>=61
      ? "HALF-SLIDE TO THE THREAT · CHIP THE EDGE"
      : pressureGrade<=40
        ? "5-MAN SCAT · RELEASE THE BACK"
        : "5-MAN SLIDE · RB CHECK-RELEASE";
  const hotAnswer=optionVolume
    ? "Arc release the wing and throw behind the scrape player"
    : identity.label.includes("AIR RAID")
      ? "Back option route with glance access"
      : identity.label.includes("POWER")
        ? "Boot away from pressure with TE leak"
        : "Replace the blitzer with slant, stick or shallow";
  const pressureEvidence=[
    metricLine("Projected front-seven havoc",projection.overall.frontSevenHavoc),
    metricLine("Projected total havoc",projection.overall.havocRate),
    metricLine("Passing-down success",projection.pass.passingDownSuccessRate),
    metricLine("Passing-down PPA",projection.pass.passingDownPpa,"number"),
  ].filter((value):value is string=>Boolean(value));

  const completionDelta=ratio(projection.pass.completionRate,baseline.completionRate);
  const yardsPerCompletionDelta=ratio(projection.pass.yardsPerCompletion,baseline.yardsPerCompletion);
  const explosiveDelta=ratio(projection.pass.passingExplosiveness,baseline.passingExplosiveness);
  const dbHavocDelta=ratio(projection.overall.dbHavoc,baseline.dbHavoc);
  const coverage=yardsPerCompletionDelta<=-.05&&explosiveDelta<=-.04
    ? {shell:"QUARTERS / MATCH",leverage:"Top-down on outside receivers",attack:"Flood one sideline; pair a corner with a flat route",conflictDefender:"Boundary safety"}
    : completionDelta<=-.045&&dbHavocDelta>=.04
      ? {shell:"COVER 1 ROBBER / MAN MATCH",leverage:"Inside shade with low-hole help",attack:"Mesh, bunch releases and RB option routes",conflictDefender:"Robber safety"}
      : completionDelta>=.045&&yardsPerCompletionDelta<=0
        ? {shell:"COVER 3 / RALLY",leverage:"Protect deep thirds; concede underneath",attack:"Seams, curls and four-vertical spacing",conflictDefender:"Hook defender"}
        : yardsPerCompletionDelta>=.06||explosiveDelta>=.07
          ? {shell:"TWO-HIGH BRACKET",leverage:"Cap the primary vertical threat",attack:"Run into light boxes, then use play-action crossers",conflictDefender:"Field safety"}
          : {shell:"MIXED TWO-HIGH SHELL",leverage:"Change the picture after the snap",attack:"Use motion to declare leverage, then attack the rotation",conflictDefender:"Nickel / STAR"};
  const coverageEvidence=[
    metricLine("Projected completion",projection.pass.completionRate),
    metricLine("Yards per completion",projection.pass.yardsPerCompletion,"number"),
    metricLine("Pass explosiveness",projection.pass.passingExplosiveness,"number"),
    metricLine("DB havoc",projection.overall.dbHavoc),
  ].filter((value):value is string=>Boolean(value));

  const lineDelta=ratio(projection.run.lineYards,baseline.lineYards);
  const stuffDelta=ratio(projection.run.stuffRate,baseline.stuffRate);
  const secondLevelDelta=ratio(projection.run.secondLevelYards,baseline.secondLevelYards);
  const front=optionVolume
    ? {structure:"ODD OPTION FRONT",fit:"Surf the mesh; scrape QB to pitch",runAnswer:"Arc the end and force the overhang to declare"}
    : passRate>=.57
      ? {structure:"NICKEL EVEN FRONT",fit:"Four-man rush with light-box run fits",runAnswer:lineDelta>=.02?"Run at the light box before throwing":"Use split zone and draws to slow the edge rush"}
      : stuffDelta>=.06||lineDelta<=-.05
        ? {structure:"TITE / BEAR FRONT",fit:"Close A/B gaps and spill the ball to support",runAnswer:"Counter, pin-pull and perimeter screens; avoid static inside zone"}
        : runEfficiency>=.04
          ? {structure:"OVER FRONT + SAFETY INSERT",fit:"Fit downhill and make the back bounce",runAnswer:"Use motion and split flow to hold the overhang"}
          : {structure:"MULTIPLE FOUR-DOWN FRONT",fit:"Keep both edges firm and box interior gaps",runAnswer:secondLevelDelta>=.04?"Press the front, then cut behind linebacker flow":"Use formation width to create a lighter box"};
  const frontEvidence=[
    metricLine("Line yards",projection.run.lineYards,"number"),
    metricLine("Stuff rate",projection.run.stuffRate),
    metricLine("Rush success",projection.run.rushingSuccessRate),
    metricLine("Second-level yards",projection.run.secondLevelYards,"number"),
  ].filter((value):value is string=>Boolean(value));

  const standardDownDelta=ratio(projection.pass.standardDownSuccessRate,baseline.standardDownSuccessRate);
  const standardExplosiveDelta=ratio(projection.pass.standardDownExplosiveness,baseline.standardDownExplosiveness);
  const thirdDownDelta=ratio(projection.overall.thirdDownSuccessRate,baseline.thirdDownSuccessRate);
  const redZoneDelta=ratio(projection.overall.redZoneEfficiency,baseline.redZoneEfficiency);
  const earlyDown=standardDownDelta>=.035&&standardExplosiveDelta>=.04
    ? "SHOT DOWN · run-action post/cross before the rush can tee off"
    : standardDownDelta>=0
      ? "STAY AHEAD · RPO access and efficient first-down calls"
      : "STEAL FOUR YARDS · motion, screens and perimeter runs";
  const passingDown=pressureGrade>=61
    ? "PROTECT FIRST · chip, hot answer and a moving launch point"
    : ratio(projection.pass.passingDownSuccessRate,baseline.passingDownSuccessRate)>=.025
      ? "SPREAD EMPTY · isolate the best leverage matchup"
      : "CONDENSE · bunch and mesh to manufacture a free release";
  const thirdDown=thirdDownDelta>=.04
    ? "TRUST THE QB · option route against the leverage defender"
    : pressureGrade>=61
      ? "WIN BEFORE THE STICKS · rub route, screen or QB movement"
      : "CREATE TRAFFIC · mesh with a sit route over the ball";
  const redZone=redZoneDelta>=.04
    ? "KEEP IDENTITY · use the same core concept in compressed space"
    : projection.run.powerSuccess!==null&&ratio(projection.run.powerSuccess,baseline.powerSuccess)>=.03
      ? "ADD A GAP · heavy set, duo and play-action leak"
      : "CREATE WIDTH · bunch, sprint-out and RPO glance";

  return {
    identity:{
      ...identity,
      passRate,
      evidence:[
        `${pct(passRate)} projected pass`,
        ...[
          metricLine("Pass success",projection.pass.passingSuccessRate),
          metricLine("Rush success",projection.run.rushingSuccessRate),
          metricLine("Overall explosiveness",projection.overall.explosiveness,"number"),
        ].filter((value):value is string=>Boolean(value)),
      ],
      broadcastStats:[
        broadcastMetric("Pass rate",passRate,nationalPassRate),
        broadcastMetric("Pass success",projection.pass.passingSuccessRate,baseline.passingSuccessRate),
        broadcastMetric("Rush success",projection.run.rushingSuccessRate,baseline.rushingSuccessRate),
      ].filter((value):value is BroadcastMetric=>Boolean(value)),
    },
    pressure:{
      grade:pressureGrade,threat:pressureThreat,defensivePlan:defensivePressurePlan,protectionCall,hotAnswer,
      why:`${defenseTeam}'s front is projected to create ${pressureThreat.toLowerCase()} pass-rush stress once ${offenseTeam} reaches obvious passing downs.`,
      evidence:pressureEvidence,
      broadcastStats:[
        broadcastMetric("Front-7 havoc",projection.overall.frontSevenHavoc,baseline.frontSevenHavoc,"rate",false),
        broadcastMetric("Pass-down success",projection.pass.passingDownSuccessRate,baseline.passingDownSuccessRate),
      ].filter((value):value is BroadcastMetric=>Boolean(value)),
    },
    coverage:{
      ...coverage,
      why:`The expected coverage answer follows the matchup's completion, chunk-play and defensive-back disruption profile.`,
      evidence:coverageEvidence,
      broadcastStats:[
        broadcastMetric("Completion",projection.pass.completionRate,baseline.completionRate),
        broadcastMetric("Yds / completion",projection.pass.yardsPerCompletion,baseline.yardsPerCompletion,"number"),
        broadcastMetric("DB havoc",projection.overall.dbHavoc,baseline.dbHavoc,"rate",false),
      ].filter((value):value is BroadcastMetric=>Boolean(value)),
    },
    front:{
      ...front,
      why:`The projected front balances ${offenseTeam}'s formation tendency against line movement, stuffs and second-level access.`,
      evidence:frontEvidence,
      broadcastStats:[
        broadcastMetric("Line yards",projection.run.lineYards,baseline.lineYards,"number"),
        broadcastMetric("Stuff rate",projection.run.stuffRate,baseline.stuffRate,"rate",false),
        broadcastMetric("2nd-level yards",projection.run.secondLevelYards,baseline.secondLevelYards,"number"),
      ].filter((value):value is BroadcastMetric=>Boolean(value)),
    },
    situations:{earlyDown,passingDown,thirdDown,redZone},
    dataNote:"Coordinator calls are inferred from opponent-adjusted outcomes and tendencies. They describe the highest-value expected answer, not charted play-call frequency.",
  };
}

export function buildSideGamePlan(
  offenseTeam:string,
  defenseTeam:string,
  projection:AdvancedSideProjection,
  offenseProfile:AdvancedProfile,
  defenseProfile:AdvancedProfile,
  scoreReceipt:PossessionScoreReceipt,
  viability:OffensiveViability,
  coreOffense?:readonly number[],
):SideGamePlan {
  const coverage=Math.min(offenseProfile.coverage.advancedGames,defenseProfile.coverage.advancedGames);
  const passBase=offenseProfile.baseline.passingSuccessRate;
  const deepBase=offenseProfile.baseline.passingExplosiveness;
  const lineBase=offenseProfile.baseline.lineYards;
  const havocThreshold=viability.requirements.find((row)=>row.id==="havoc")?.threshold ?? .2;
  const deep=ratio(projection.pass.passingExplosiveness,deepBase);
  const quick=.56*ratio(projection.pass.passingSuccessRate,passBase)+.44*ratio(projection.pass.completionRate,offenseProfile.baseline.completionRate);
  const interior=.6*ratio(projection.run.lineYards,lineBase)+.4*ratio(projection.run.powerSuccess,offenseProfile.baseline.powerSuccess)-.45*ratio(projection.run.stuffRate,offenseProfile.baseline.stuffRate);
  const perimeter=.55*ratio(projection.run.secondLevelYards,offenseProfile.baseline.secondLevelYards)+.45*ratio(projection.run.openFieldYards,offenseProfile.baseline.openFieldYards);
  const protection=projection.overall.havocRate===null?0:(havocThreshold-projection.overall.havocRate)/.08;
  const schedule=.55*ratio(projection.overall.successRate,offenseProfile.baseline.successRate)+.45*ratio(projection.pass.standardDownSuccessRate,offenseProfile.baseline.standardDownSuccessRate);
  const stats=(...values:Array<string|null>)=>values.filter((value):value is string=>Boolean(value));
  const verticalStats=stats(
    matchupEvidence("Yds / completion",projection.pass.yardsPerCompletion,offenseProfile.baseline.yardsPerCompletion,"number"),
    matchupEvidence("Pass explosiveness",projection.pass.passingExplosiveness,offenseProfile.baseline.passingExplosiveness,"number"),
  );
  const quickStats=stats(
    matchupEvidence("Completion",projection.pass.completionRate,offenseProfile.baseline.completionRate),
    matchupEvidence("Pass success",projection.pass.passingSuccessRate,offenseProfile.baseline.passingSuccessRate),
  );
  const interiorStats=stats(
    matchupEvidence("Line yards",projection.run.lineYards,offenseProfile.baseline.lineYards,"number"),
    matchupEvidence("Stuff rate",projection.run.stuffRate,offenseProfile.baseline.stuffRate),
    matchupEvidence("Power success",projection.run.powerSuccess,offenseProfile.baseline.powerSuccess),
  );
  const perimeterStats=stats(
    matchupEvidence("2nd-level yards",projection.run.secondLevelYards,offenseProfile.baseline.secondLevelYards,"number"),
    matchupEvidence("Open-field yards",projection.run.openFieldYards,offenseProfile.baseline.openFieldYards,"number"),
  );
  const pressureStats=stats(
    matchupEvidence("Havoc allowed",projection.overall.havocRate,offenseProfile.baseline.havocRate),
    matchupEvidence("Front-7 havoc",projection.overall.frontSevenHavoc,offenseProfile.baseline.frontSevenHavoc),
    matchupEvidence("Pass-down success",projection.pass.passingDownSuccessRate,offenseProfile.baseline.passingDownSuccessRate),
  );
  const scheduleStats=stats(
    matchupEvidence("Standard-down success",projection.pass.standardDownSuccessRate,offenseProfile.baseline.standardDownSuccessRate),
    matchupEvidence("Pass-down success",projection.pass.passingDownSuccessRate,offenseProfile.baseline.passingDownSuccessRate),
  );
  const rows=[
    recommendation(
      deep>=.08?"Attack outside leverage with play-action shots":deep<=-.08?"Create explosives with motion and double moves":"Use intermediate crossers before taking shots",
      "Vertical pass",deep,coverage,
      `${offenseTeam} projects ${projection.pass.yardsPerCompletion===null?"limited chunk data":`${num(projection.pass.yardsPerCompletion,1)} yards per completion`} against ${defenseTeam}; ${deep>=.08?"the vertical window is a real scoring path":deep<=-.08?"dropback shot volume is a low-EV bet":"explosives must be protection-created"}.`,
      verticalStats,
      `${offenseTeam} becomes dependent on long drives if it cannot produce at least one explosive completion.`,
    ),
    recommendation(
      quick>=.08?"Lean on rhythm throws and RPO access":quick<=-.08?"Manufacture free releases with bunch and mesh":"Use quick game to control down-and-distance",
      "Quick game",quick,coverage,
      `${offenseTeam} projects ${projection.pass.completionRate===null?"without stable completion data":`${pct(projection.pass.completionRate)} completions and ${projection.pass.passingSuccessRate===null?"uncertain":pct(projection.pass.passingSuccessRate)} pass success`} against ${defenseTeam}.`,
      quickStats,
      `Falling behind the sticks lets ${defenseTeam} trade disguise for aggression.`,
    ),
    recommendation(
      interior>=.08?"Make the A/B gaps the first test":interior<=-.08?"Avoid static inside zone into the loaded box":"Use downhill runs only versus favorable box counts",
      "Interior run",interior,coverage,
      `${offenseTeam} projects ${projection.run.lineYards===null?"without stable trench data":`${num(projection.run.lineYards)} line yards with a ${projection.run.stuffRate===null?"—":pct(projection.run.stuffRate)} stuff rate`} against ${defenseTeam}.`,
      interiorStats,
      `Interior losses create the passing downs where ${defenseTeam} can use its full pressure menu.`,
    ),
    recommendation(
      perimeter>=.08?"Stress the edge with counter and outside zone":perimeter<=-.08?"Use screens and motion instead of slow-developing edge runs":"Use perimeter runs as a constraint",
      "Perimeter run",perimeter,coverage,
      `${offenseTeam} projects ${projection.run.secondLevelYards===null?"uncertain":num(projection.run.secondLevelYards)} second-level yards and ${projection.run.openFieldYards===null?"uncertain":num(projection.run.openFieldYards)} open-field yards against ${defenseTeam}.`,
      perimeterStats,
      `Without width, ${defenseTeam} can compress its linebackers and attack downhill.`,
    ),
    recommendation(
      protection>=.08?"Release five and force the defense to cover":protection<=-.08?"Build every dropback around the pressure answer":"Use check-release protection with a built-in hot",
      "Protection",protection,coverage,
      `${defenseTeam} projects ${projection.overall.frontSevenHavoc===null?"uncertain front pressure":`${pct(projection.overall.frontSevenHavoc)} front-seven havoc`} while ${offenseTeam} projects ${projection.pass.passingDownSuccessRate===null?"uncertain":pct(projection.pass.passingDownSuccessRate)} passing-down success.`,
      pressureStats,
      `Crossing ${pct(havocThreshold)} havoc allowed erases otherwise efficient possessions.`,
    ),
    recommendation(
      schedule>=.08?"Keep the full call sheet open on first down":schedule<=-.08?"Steal efficient first downs with motion and screens":"Treat early-down efficiency as the swing point",
      "Stay on schedule",schedule,coverage,
      `${offenseTeam} projects ${projection.pass.standardDownSuccessRate===null?"uncertain":pct(projection.pass.standardDownSuccessRate)} success on standard downs versus ${projection.pass.passingDownSuccessRate===null?"uncertain":pct(projection.pass.passingDownSuccessRate)} on passing downs.`,
      scheduleStats,
      `Repeated third-and-long snaps move the matchup toward ${defenseTeam}'s best personnel and calls.`,
    ),
  ].sort((a,b)=>b.score-a.score);
  const primary=viability.primary;
  const failureAnalysis=primary
    ? `If ${offenseTeam} cannot keep ${primary.label.toLowerCase()} ${primary.higherIsBetter?"above":"below"} ${pct(primary.threshold)}, its normal call sheet becomes harder to sustain. ${viability.alternativePath}`
    : `No single requirement dominates this matchup; standard-down execution and field position are the likely separators.`;
  const coordinator=coordinatorScouting(offenseTeam,defenseTeam,projection,offenseProfile,coreOffense);
  return {offenseTeam,defenseTeam,largestAdvantage:rows[0],recommendations:rows.slice(0,4),failureAnalysis,viability,scoreReceipt,coordinator};
}

function swingReason(offenseTeam:string,defenseTeam:string,recommendation:GamePlanRecommendation) {
  const offense=offenseTeam.replace(/^\d{4} /,"");
  const defense=defenseTeam.replace(/^\d{4} /,"");
  const offenseEdge=recommendation.score>=0;
  if(recommendation.area==="Quick game") return offenseEdge
    ? `Easy completions keep ${offense} ahead of the chains and out of pressure downs.`
    : `Taking away easy throws forces ${offense} to hold the ball against ${defense}'s pressure.`;
  if(recommendation.area==="Vertical pass") return offenseEdge
    ? `One explosive throw can flip field position and shorten ${offense}'s scoring drives.`
    : `${defense} can force ${offense} to earn points through long, mistake-free drives.`;
  if(recommendation.area==="Interior run") return offenseEdge
    ? `Interior push keeps ${offense} ahead of the chains and preserves play-action.`
    : `Interior stops can make ${offense} one-dimensional before third down.`;
  if(recommendation.area==="Perimeter run") return offenseEdge
    ? `Winning outside stretches ${defense}'s linebackers and creates cutback space.`
    : `${defense}'s edge pursuit can erase space and funnel ${offense} back into the box.`;
  if(recommendation.area==="Protection") return offenseEdge
    ? `Clean pockets give ${offense}'s best route concepts time to develop.`
    : `${defense}'s pressure can end the play before ${offense}'s routes develop.`;
  return offenseEdge
    ? `Efficient early downs keep ${offense}'s full call sheet available.`
    : `Negative early downs can make ${offense}'s next call predictable.`;
}

function factor(offenseTeam:string,defenseTeam:string,recommendation:GamePlanRecommendation):DecidingFactor {
  const edgeSide=recommendation.score>=0?"OFFENSE":"DEFENSE";
  return {
    title: recommendation.area,
    summary: swingReason(offenseTeam,defenseTeam,recommendation),
    team:edgeSide==="OFFENSE"?offenseTeam:defenseTeam,
    score: recommendation.score,
    importance: recommendation.importance,
    confidence: recommendation.confidence,
    evidence: recommendation.statistics,
    edgeSide,
  };
}

export function buildMatchupIntelligence(
  homeTeam:string,awayTeam:string,
  homeProjection:AdvancedSideProjection|null|undefined,awayProjection:AdvancedSideProjection|null|undefined,
  homeProfile:AdvancedProfile|null|undefined,awayProfile:AdvancedProfile|null|undefined,
  homeReceipt:PossessionScoreReceipt|undefined,awayReceipt:PossessionScoreReceipt|undefined,
  homeViability:OffensiveViability|undefined,awayViability:OffensiveViability|undefined,
  homeOffense?:readonly number[],awayOffense?:readonly number[],
):MatchupIntelligence|null {
  if(!homeProjection||!awayProjection||!homeProfile||!awayProfile||!homeReceipt||!awayReceipt||!homeViability||!awayViability) return null;
  const home=buildSideGamePlan(homeTeam,awayTeam,homeProjection,homeProfile,awayProfile,homeReceipt,homeViability,homeOffense);
  const away=buildSideGamePlan(awayTeam,homeTeam,awayProjection,awayProfile,homeProfile,awayReceipt,awayViability,awayOffense);
  const margin=homeReceipt.finalExpectedPoints-awayReceipt.finalExpectedPoints;
  const controlTeam=Math.abs(margin)<1.5?null:margin>0?homeTeam:awayTeam;
  const favored=margin>=0?home:away;
  const opposed=margin>=0?away:home;
  const controlUnit=favored.largestAdvantage.area.includes("run")?"run game":favored.largestAdvantage.area.includes("pass")||favored.largestAdvantage.area==="Quick game"?"passing game":"down-and-distance battle";
  const controlEvidence=favored.largestAdvantage.statistics[0];
  const controlReason=controlTeam
    ? `${favored.scoreReceipt.expectedPointsPerPossession.toFixed(2)} vs ${opposed.scoreReceipt.expectedPointsPerPossession.toFixed(2)} points per possession${controlEvidence?` · ${controlEvidence}`:""}.`
    : `${home.scoreReceipt.expectedPointsPerPossession.toFixed(2)} vs ${away.scoreReceipt.expectedPointsPerPossession.toFixed(2)} points per possession; no stable unit edge separates the teams.`;
  const conclusionScore=Math.abs(margin)/10+Math.abs(favored.largestAdvantage.score)*.45;
  const candidates=[
    factor(home.offenseTeam,home.defenseTeam,home.largestAdvantage),
    factor(away.offenseTeam,away.defenseTeam,away.largestAdvantage),
    ...[...home.recommendations.slice(1),...away.recommendations.slice(1)].sort((left,right)=>Math.abs(right.score)-Math.abs(left.score)).map((row)=>factor(
      home.recommendations.includes(row)?home.offenseTeam:away.offenseTeam,
      home.recommendations.includes(row)?home.defenseTeam:away.defenseTeam,
      row,
    )),
  ];
  const decidingFactors=candidates.filter((row,index,all)=>all.findIndex((candidate)=>candidate.team===row.team&&candidate.title===row.title)===index).slice(0,3);
  const viabilityLine=opposed.viability.status==="At Risk"||opposed.viability.status==="Critical"
    ? `${opposed.offenseTeam}'s ${opposed.viability.primary?.label.toLowerCase()??"primary requirement"} is ${opposed.viability.status.toLowerCase()}, making long drives less stable.`
    : `${opposed.offenseTeam} remains structurally viable, so ${favored.offenseTeam} still needs to finish drives.`;
  const gameScript=controlTeam
    ? `${controlTeam}: ${favored.largestAdvantage.call}. ${viabilityLine} Projection: ${homeReceipt.expectedPossessions.toFixed(1)} possessions per team.`
    : `No stable control edge. The first offense to lose early-down efficiency or field position is projected to break the tie.`;
  return {home,away,decidingFactors,controlTeam,controlUnit,controlReason,confidence:conclusionScore>.75?"High":conclusionScore>.35?"Solid":"Developing",gameScript};
}
