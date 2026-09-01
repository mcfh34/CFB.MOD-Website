import {
  buildPregameElo,
  buildPregameMatchupEvidence,
  latestProfile,
  project,
  type NormalizedGame,
  type Profile,
} from "../lib/dataPipeline";

type ApiScheduleRow = {
  gameId:string;season:number;week:number;seasonType:string;startDate:string|null;completed:boolean|number;neutralSite:boolean|number;
  homeTeam:string;homeConference:string|null;homePoints:number|null;awayTeam:string;awayConference:string|null;awayPoints:number|null;
  generatedFromWeek:number|null;modelHomeSpread:number|null;modelTotal:number|null;homeWinProbability:number|null;vegasSpread:number|null;vegasTotal:number|null;
};

type ApiProfileRow = {
  season:number;week:number;team:string;gamesPlayed:number;
  offYpp:number;offYpa:number;offYpc:number;offPatt:number;offRatt:number;defYpp:number;defYpa:number;defYpc:number;defPatt:number;defRatt:number;
  offYppIndex:number;offYpaIndex:number;offYpcIndex:number;offPattIndex:number;offRattIndex:number;
  defYppIndex:number;defYpaIndex:number;defYpcIndex:number;defPattIndex:number;defRattIndex:number;
};

type Counters = { games:number;marginError:number,suWins:number,atsWins:number,atsLosses:number,totalWins:number,totalLosses:number };

const base = "https://harpercfbmodel.com/api/data";
const seasons = (process.argv.slice(2).map(Number).filter(Number.isFinite).length ? process.argv.slice(2).map(Number) : [2021,2022,2023,2024,2025]);

async function json<T>(url:string):Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json() as Promise<T>;
}

function normalizedGame(row:ApiScheduleRow):NormalizedGame {
  return {
    id:String(row.gameId),season:Number(row.season),week:Number(row.week),seasonType:String(row.seasonType ?? "regular"),startDate:row.startDate ?? null,
    completed:Boolean(row.completed),neutralSite:Boolean(row.neutralSite),conferenceGame:false,venue:null,
    homeTeam:row.homeTeam,homeConference:row.homeConference ?? null,homePoints:row.homePoints === null ? null : Number(row.homePoints),
    awayTeam:row.awayTeam,awayConference:row.awayConference ?? null,awayPoints:row.awayPoints === null ? null : Number(row.awayPoints),
  };
}

function profile(row:ApiProfileRow):Profile {
  return {
    season:Number(row.season),week:Number(row.week),team:row.team,gamesPlayed:Number(row.gamesPlayed),
    off:[row.offYpp,row.offYpa,row.offYpc,row.offPatt,row.offRatt],def:[row.defYpp,row.defYpa,row.defYpc,row.defPatt,row.defRatt],
    oi:[row.offYppIndex,row.offYpaIndex,row.offYpcIndex,row.offPattIndex,row.offRattIndex],
    di:[row.defYppIndex,row.defYpaIndex,row.defYpcIndex,row.defPattIndex,row.defRattIndex],
  };
}

function empty():Counters { return { games:0,marginError:0,suWins:0,atsWins:0,atsLosses:0,totalWins:0,totalLosses:0 }; }

function grade(target:Counters, row:ApiScheduleRow, margin:number, total:number) {
  if (row.homePoints === null || row.awayPoints === null) return;
  const actualMargin = Number(row.homePoints) - Number(row.awayPoints);
  const actualTotal = Number(row.homePoints) + Number(row.awayPoints);
  target.games += 1;
  target.marginError += Math.abs(margin - actualMargin);
  if (actualMargin !== 0 && ((margin >= 0 && actualMargin > 0) || (margin < 0 && actualMargin < 0))) target.suWins += 1;
  const marketEligible = row.week >= 5 || row.seasonType === "postseason";
  if (!marketEligible) return;
  if (row.vegasSpread !== null) {
    const modelEdge = margin + Number(row.vegasSpread);
    const actualEdge = actualMargin + Number(row.vegasSpread);
    if (modelEdge !== 0 && actualEdge !== 0) {
      if (Math.sign(modelEdge) === Math.sign(actualEdge)) target.atsWins += 1;
      else target.atsLosses += 1;
    }
  }
  if (row.vegasTotal !== null) {
    const modelEdge = total - Number(row.vegasTotal);
    const actualEdge = actualTotal - Number(row.vegasTotal);
    if (modelEdge !== 0 && actualEdge !== 0) {
      if (Math.sign(modelEdge) === Math.sign(actualEdge)) target.totalWins += 1;
      else target.totalLosses += 1;
    }
  }
}

function summarize(value:Counters) {
  const ats = value.atsWins + value.atsLosses;
  const totals = value.totalWins + value.totalLosses;
  return {
    games:value.games,
    marginMae:value.games ? value.marginError/value.games : null,
    straightUp:value.games ? value.suWins/value.games : null,
    ats:ats ? value.atsWins/ats : null,
    atsRecord:`${value.atsWins}-${value.atsLosses}`,
    totals:totals ? value.totalWins/totals : null,
    totalsRecord:`${value.totalWins}-${value.totalLosses}`,
  };
}

const overallOld = empty();
const overallV8 = empty();
const crossOld = empty();
const crossV8 = empty();
const output:Array<Record<string,unknown>> = [];

for (const season of seasons) {
  const schedulePayload = await json<{rows:ApiScheduleRow[]}>(`${base}?view=schedule&season=${season}&week=0`);
  const profilePayloads = await Promise.all(Array.from({length:17},(_,week) => json<{rows:ApiProfileRow[]}>(`${base}?view=profiles&season=${season}&week=${week}`)));
  const deduped = new Map<string,Profile>();
  for (const payload of profilePayloads) for (const row of payload.rows ?? []) deduped.set(`${row.week}|${row.team}`,profile(row));
  const profiles = [...deduped.values()];
  const eligibleTeams = new Set(profiles.map((row) => row.team));
  const games = schedulePayload.rows.map(normalizedGame);
  const pregameElo = buildPregameElo(games, profiles.filter((row) => row.week === 0), eligibleTeams);
  const pregameEvidence = buildPregameMatchupEvidence(games, pregameElo, eligibleTeams);
  const old = empty();
  const v8 = empty();
  const oldCross = empty();
  const v8Cross = empty();

  for (const row of schedulePayload.rows) {
    if (row.homePoints === null || row.awayPoints === null) continue;
    const game = games.find((candidate) => candidate.id === String(row.gameId));
    if (!game) continue;
    const generatedFromWeek = Number(row.generatedFromWeek ?? (row.seasonType === "postseason" ? Math.max(...profiles.map((candidate) => candidate.week)) : Math.max(0,row.week-1)));
    const ratings = pregameElo.get(game.id);
    const evidence = pregameEvidence.get(game.id);
    const prediction = project(
      latestProfile(profiles,row.homeTeam,generatedFromWeek),latestProfile(profiles,row.awayTeam,generatedFromWeek),Boolean(row.neutralSite),
      ratings?.get(row.homeTeam),ratings?.get(row.awayTeam),evidence?.get(row.homeTeam),evidence?.get(row.awayTeam),
    );
    const oldMargin = row.modelHomeSpread === null ? prediction.margin : -Number(row.modelHomeSpread);
    const oldTotal = row.modelTotal === null ? prediction.modelTotal : Number(row.modelTotal);
    grade(old,row,oldMargin,oldTotal);
    grade(v8,row,prediction.margin,prediction.modelTotal);
    const homeEvidence = evidence?.get(row.homeTeam);
    const awayEvidence = evidence?.get(row.awayTeam);
    if (homeEvidence && awayEvidence && (Math.abs(homeEvidence.reliability-awayEvidence.reliability) >= 0.12 || Math.abs(homeEvidence.scheduleStrength-awayEvidence.scheduleStrength) >= 0.18)) {
      grade(oldCross,row,oldMargin,oldTotal);
      grade(v8Cross,row,prediction.margin,prediction.modelTotal);
    }
    if (season === 2025 && row.homeTeam === "Oregon" && row.awayTeam === "James Madison") {
      output.push({ example:"Oregon vs James Madison",oldMargin,newMargin:prediction.margin,actualMargin:Number(row.homePoints)-Number(row.awayPoints),homeEvidence,awayEvidence });
    }
  }

  for (const [target, source] of [[overallOld,old],[overallV8,v8],[crossOld,oldCross],[crossV8,v8Cross]] as const) for (const key of Object.keys(target) as Array<keyof Counters>) target[key] += source[key];
  output.push({season,old:summarize(old),v8:summarize(v8),crossScheduleOld:summarize(oldCross),crossScheduleV8:summarize(v8Cross)});
}

output.push({overallOld:summarize(overallOld),overallV8:summarize(overallV8),crossScheduleOld:summarize(crossOld),crossScheduleV8:summarize(crossV8)});
console.log(JSON.stringify(output,null,2));
