import { baselines } from "../app/modelData";
import type { MatchupEdgeAnalysis, PositionGroupEdge } from "./matchupAnalysis";
import type { CoordinatorScouting } from "./matchupIntelligence";

export type FormationId = "air-raid" | "spread" | "multiple" | "i-form" | "flexbone";
export type PlayArtId = "vertical" | "mesh" | "play-action" | "inside-run" | "edge-run" | "triple-option";
export type AttackZoneId = "deep" | "quick" | "interior" | "edge";
export type ZoneTone = "attack" | "lean" | "even" | "caution" | "defense";

export type TacticalZone = {
  id: AttackZoneId;
  label: string;
  score: number;
  grade: number;
  tone: ZoneTone;
  verdict: string;
  note: string;
};

export type TacticalPlan = {
  formation: FormationId;
  formationLabel: string;
  personnel: string;
  defensiveLook: string;
  passRate: number;
  identity: string;
  play: PlayArtId;
  playName: string;
  primary: TacticalZone;
  danger: TacticalZone;
  zones: TacticalZone[];
  coachingPoint: string;
  analystCall: string | null;
  importance: string | null;
  confidence: string | null;
  riskIfIgnored: string | null;
  coordinator: CoordinatorScouting | null;
};

type TacticalPlanInput = {
  offenseTeam: string;
  defenseTeam: string;
  offense: readonly number[];
  offenseIsHome: boolean;
  analysis: MatchupEdgeAnalysis;
};

const clamp = (value:number, minimum:number, maximum:number) => Math.max(minimum, Math.min(maximum, value));

function tone(score:number): ZoneTone {
  if (score >= 0.28) return "attack";
  if (score >= 0.08) return "lean";
  if (score > -0.08) return "even";
  if (score > -0.28) return "caution";
  return "defense";
}

function verdict(value:ZoneTone) {
  return value === "attack" ? "ATTACK" : value === "lean" ? "LEAN HERE" : value === "even" ? "EVEN" : value === "caution" ? "TIGHT WINDOW" : "DEFENSE EDGE";
}

function formation(offense:readonly number[],scouting:CoordinatorScouting|null) {
  const passAttempts = baselines.patt * Number(offense[3] ?? 1);
  const rushAttempts = baselines.ratt * Number(offense[4] ?? 1);
  const passRate = passAttempts / Math.max(1, passAttempts + rushAttempts);
  const optionVolume = Number(offense[3] ?? 1) <= 0.78 && Number(offense[4] ?? 1) >= 1.15;
  if (scouting?.identity.label === "FLEXBONE / OPTION") return { id:"flexbone" as const,label:scouting.identity.label,personnel:scouting.identity.personnel,identity:"Option / constraint run",passRate };
  if (scouting?.identity.label === "VERTICAL AIR RAID" || scouting?.identity.label === "AIR RAID SPACING") return { id:"air-raid" as const,label:scouting.identity.label,personnel:scouting.identity.personnel,identity:scouting.identity.coreConcepts.join(" · "),passRate };
  if (scouting?.identity.label === "SPREAD RPO") return { id:"spread" as const,label:scouting.identity.label,personnel:scouting.identity.personnel,identity:scouting.identity.coreConcepts.join(" · "),passRate };
  if (scouting?.identity.label === "GAP-SCHEME POWER") return { id:"i-form" as const,label:scouting.identity.label,personnel:scouting.identity.personnel,identity:scouting.identity.coreConcepts.join(" · "),passRate };
  if (optionVolume) return { id:"flexbone" as const,label:"FLEXBONE OPTION",personnel:"2 WR · 2 wings · fullback",identity:"Option / constraint run",passRate };
  if (passRate >= 0.58 || Number(offense[3] ?? 1) >= 1.18) return { id:"air-raid" as const,label:"AIR RAID SPREAD",personnel:"10 personnel · four wide",identity:"High-volume spread pass",passRate };
  if (passRate >= 0.52) return { id:"spread" as const,label:"SPREAD 11",personnel:"11 personnel · shotgun",identity:"Spread pass / RPO",passRate };
  if (passRate <= 0.42 || Number(offense[4] ?? 1) >= 1.17) return { id:"i-form" as const,label:"I-FORM POWER",personnel:"21 personnel · under center",identity:"Downhill run / play action",passRate };
  return { id:"multiple" as const,label:"MULTIPLE 11",personnel:"11 personnel · balanced",identity:"Balanced run / pass",passRate };
}

function lane(analysis:MatchupEdgeAnalysis, id:PositionGroupEdge["id"], offenseIsHome:boolean) {
  const group = analysis.positionGroups.find((row)=>row.id===id);
  if (!group) return 0;
  const difference = offenseIsHome ? group.homeScore-group.awayScore : group.awayScore-group.homeScore;
  return clamp(difference/10,-1,1);
}

function zone(id:AttackZoneId, score:number, offenseTeam:string, defenseTeam:string):TacticalZone {
  const value = clamp(score,-1,1);
  const zoneTone = tone(value);
  const notes:Record<AttackZoneId,{positive:string;negative:string;even:string}> = {
    deep:{
      positive:`${offenseTeam}'s receivers can stress ${defenseTeam}'s safeties and corners vertically.`,
      negative:`${defenseTeam}'s coverage is built to squeeze vertical routes and limit explosive catches.`,
      even:"Deep shots are available, but protection and ball placement must be clean.",
    },
    quick:{
      positive:`${offenseTeam} can stay on schedule with leverage throws, crossers, and RPO access passes.`,
      negative:`${defenseTeam} closes underneath windows and can force the quarterback to hold the ball.`,
      even:"The short passing game is a leverage battle rather than a dependable mismatch.",
    },
    interior:{
      positive:`${offenseTeam}'s line projects to create movement in the A/B gaps before contact.`,
      negative:`${defenseTeam}'s front projects to win first contact and muddy the inside run.`,
      even:"The box is close to even; down, distance, and motion should decide the run fit.",
    },
    edge:{
      positive:`${offenseTeam}'s backs can reach space and challenge ${defenseTeam}'s linebackers outside.`,
      negative:`${defenseTeam} has the pursuit and second-level tackling to close perimeter runs.`,
      even:"The perimeter run is viable, but it is not a stand-alone matchup advantage.",
    },
  };
  const note = zoneTone === "attack" || zoneTone === "lean" ? notes[id].positive : zoneTone === "defense" || zoneTone === "caution" ? notes[id].negative : notes[id].even;
  const label = id === "deep" ? "DEEP PASS" : id === "quick" ? "QUICK / MIDDLE" : id === "interior" ? "INTERIOR RUN" : "EDGE RUN";
  return { id,label,score:value,grade:Math.round(clamp(50+value*50,0,100)),tone:zoneTone,verdict:verdict(zoneTone),note };
}

export function buildTacticalPlan({ offenseTeam,defenseTeam,offense,offenseIsHome,analysis }:TacticalPlanInput):TacticalPlan {
  const analystPlan = analysis.intelligence
    ? [analysis.intelligence.home,analysis.intelligence.away].find((row)=>row.offenseTeam===offenseTeam) ?? null
    : null;
  const look = formation(offense,analystPlan?.coordinator??null);
  const passValue = offenseIsHome ? analysis.pass.homeValue : analysis.pass.awayValue;
  const runValue = offenseIsHome ? analysis.run.homeValue : analysis.run.awayValue;
  const passScore = clamp((passValue-baselines.ypa)/1.6,-1,1);
  const runScore = clamp((runValue-baselines.ypc)/0.9,-1,1);
  const scheme = analysis.schematicReads.find((row)=>row.offenseTeam===offenseTeam);
  const schemeScore = scheme?.edgeTeam===offenseTeam ? 0.55 : scheme?.edgeTeam===defenseTeam ? -0.55 : 0;
  const zones = [
    zone("deep",0.52*passScore+0.32*lane(analysis,"receivers",offenseIsHome)+0.16*schemeScore,offenseTeam,defenseTeam),
    zone("quick",0.5*passScore+0.28*lane(analysis,"quarterback",offenseIsHome)+0.22*lane(analysis,"down-leverage",offenseIsHome),offenseTeam,defenseTeam),
    zone("interior",0.58*runScore+0.42*lane(analysis,"trenches",offenseIsHome),offenseTeam,defenseTeam),
    zone("edge",0.55*runScore+0.45*lane(analysis,"run-space",offenseIsHome),offenseTeam,defenseTeam),
  ];
  const analystZone:Record<string,AttackZoneId> = {
    "Vertical pass":"deep","Quick game":"quick","Interior run":"interior","Perimeter run":"edge",
    Protection:"quick","Stay on schedule":"quick",
  };
  const metricPrimary = [...zones].sort((a,b)=>b.score-a.score)[0];
  const primary = analystPlan ? zones.find((row)=>row.id===analystZone[analystPlan.largestAdvantage.area]) ?? metricPrimary : metricPrimary;
  const danger = [...zones].sort((a,b)=>a.score-b.score)[0];
  const play = primary.id === "deep" ? (look.id === "i-form" || look.id === "flexbone" ? "play-action" : "vertical")
    : primary.id === "quick" ? (look.id === "i-form" || look.id === "flexbone" ? "play-action" : "mesh")
      : primary.id === "edge" ? (look.id === "flexbone" ? "triple-option" : "edge-run")
        : look.id === "flexbone" ? "triple-option" : "inside-run";
  const playName:Record<PlayArtId,string> = {
    vertical:"VERTICAL FLOOD / SWITCH RELEASE",mesh:"MESH + RPO ACCESS", "play-action":"PLAY-ACTION POST / CROSS",
    "inside-run":look.id === "i-form" ? "POWER O / DUO" : "INSIDE ZONE / DUO", "edge-run":"COUNTER / OUTSIDE ZONE", "triple-option":"MIDLINE TRIPLE OPTION",
  };
  const defensiveLook = analystPlan?.coordinator.front.structure
    ?? (look.id === "air-raid" || look.id === "spread" ? "NICKEL 4–2–5" : look.id === "i-form" || look.id === "flexbone" ? "8-MAN RUN FIT" : "MULTIPLE 4–2–5");
  const coachingPoint = analystPlan
    ? analystPlan.largestAdvantage.why
    : primary.score < 0.08
    ? `No clean mismatch: use motion and formation changes to identify coverage, then take the efficient answer.`
    : `${primary.note} The first call-sheet priority is ${playName[play].toLowerCase()}.`;
  return {
    formation:look.id,formationLabel:look.label,personnel:look.personnel,defensiveLook,passRate:look.passRate,identity:look.identity,
    play,playName:playName[play],primary,danger,zones,coachingPoint,
    analystCall:analystPlan?.largestAdvantage.call??null,
    importance:analystPlan?.largestAdvantage.importance??null,
    confidence:analystPlan?.largestAdvantage.confidence??null,
    riskIfIgnored:analystPlan?.largestAdvantage.riskIfIgnored??null,
    coordinator:analystPlan?.coordinator??null,
  };
}
