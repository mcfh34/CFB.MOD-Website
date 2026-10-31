import type { GameDifficulty, GameState, IndividualPlayerStats, Player, TeamRoster, TeamStats } from "@/lib/game/types";
import { resolveTeamLogoAsset } from "@/lib/teamLogoAssets";
import { weekLabel } from "../weekLabels";
import {
  SEASON_SAVE_VERSION,
  type CompletedSeasonSummary,
  type ModelProfileRow,
  type ModelScheduleRow,
  type PlayerRatingRow,
  type SeasonGame,
  type SeasonPhase,
  type SeasonSave,
  type SeasonTeam,
  type TeamRecord,
} from "./types";

const POWER_CONFERENCES = new Set(["ACC", "Big Ten", "Big 12", "SEC"]);
const BOWL_NAMES = [
  "Summit Signal Bowl",
  "Atlas Industrial Bowl",
  "Northstar Mobility Bowl",
  "ForgeWorks Bowl",
  "BluePeak Energy Bowl",
  "Crescent Health Bowl",
  "Horizon Data Bowl",
  "Beacon Foods Bowl",
  "Riverstone Bank Bowl",
  "Granite Tools Bowl",
  "Evergreen Wireless Bowl",
  "IronGate Security Bowl",
  "Clearwater Homes Bowl",
  "Heritage Coffee Bowl",
  "Vantage Sports Bowl",
  "Redline Auto Bowl",
  "Copper Ridge Bowl",
  "Pioneer Credit Bowl",
  "Metro Medical Bowl",
  "Liberty Logistics Bowl",
  "PrimePath Travel Bowl",
  "Keystone Insurance Bowl",
  "Oakline Markets Bowl",
  "TrueField Technology Bowl",
  "CrownPoint Aerospace Bowl",
  "Trailhead Outfitters Bowl",
  "Silverline Telecom Bowl",
  "Foundry Supply Bowl",
  "BrightWave Media Bowl",
  "Union Square Finance Bowl",
  "Timberline Equipment Bowl",
  "Coastline Resorts Bowl",
  "Sterling Motors Bowl",
  "Capital Grain Bowl",
  "Frontier Aviation Bowl",
  "Landmark Materials Bowl",
] as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFor(seed: string) {
  let value = hashString(seed);
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(random: () => number) {
  const first = Math.max(1e-8, random());
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function emptyRecord(): TeamRecord {
  return { wins:0,losses:0,conferenceWins:0,conferenceLosses:0,pointsFor:0,pointsAgainst:0 };
}

export function emptyTeamStats(): TeamStats {
  return {
    plays:0,firstDowns:0,rushAttempts:0,rushYards:0,rushTouchdowns:0,passAttempts:0,completions:0,
    passYards:0,passTouchdowns:0,sacksAllowed:0,interceptionsThrown:0,fumblesLost:0,punts:0,
    puntReturns:0,puntReturnYards:0,kickReturns:0,kickReturnYards:0,fieldGoalsMade:0,
    fieldGoalsAttempted:0,timeOfPossessionSeconds:0,
  };
}

export function emptyPlayerStats(playerId: string): IndividualPlayerStats {
  return {
    playerId,passAttempts:0,completions:0,passYards:0,passTouchdowns:0,interceptionsThrown:0,
    rushAttempts:0,rushYards:0,rushTouchdowns:0,targets:0,receptions:0,receivingYards:0,
    receivingTouchdowns:0,tackles:0,soloTackles:0,assistedTackles:0,tacklesForLoss:0,sacks:0,
    interceptions:0,passBreakups:0,forcedFumbles:0,
  };
}

const POSITION_MAP: Record<string, Player["position"]> = {
  QB:"QB",RB:"RB",WR:"WR",TE:"TE",OT:"RT",LT:"LT",RT:"RT",OG:"RG",LG:"LG",RG:"RG",C:"C",OL:"OL",
  EDGE:"DE",DE:"DE",DL:"DT",DT:"DT",NT:"DT",LB:"LB",ILB:"LB",OLB:"LB",CB:"CB",S:"FS",FS:"FS",SS:"SS",DB:"DB",
  K:"K",P:"P",LS:"LS",H:"H",
};

function playerFrom(row: PlayerRatingRow, fallbackPosition: Player["position"], fallbackNumber: number, team: string): Player {
  return {
    id: row.id || `${team}-${fallbackPosition}-${fallbackNumber}`,
    name: row.name || `${team} ${fallbackPosition}`,
    number: Math.max(0, Math.min(99, Math.round(row.jersey ?? fallbackNumber))),
    position: POSITION_MAP[row.position.toUpperCase()] ?? fallbackPosition,
    rating: clamp(Math.round(row.overall ?? 78), 55, 99),
  };
}

export function starterFromRating(
  row: PlayerRatingRow,
  position: Player["position"],
  team: string,
  fallbackNumber = 0,
): Player {
  return { ...playerFrom(row, position, fallbackNumber, team), position };
}

function choosePlayers(
  rows: PlayerRatingRow[],
  positions: Player["position"][],
  count: number,
  team: string,
  startNumber: number,
  slotPositions: Player["position"][] = positions,
) {
  const candidates = rows
    .filter((row) => positions.includes(POSITION_MAP[row.position.toUpperCase()] ?? "DB"))
    .sort((left, right) => Number(Boolean(right.projectedStarter)) - Number(Boolean(left.projectedStarter)) || Number(right.overall ?? 0) - Number(left.overall ?? 0));
  const result: Player[]=[];
  for (let index = 0; index < count; index += 1) {
    const fallbackPosition = slotPositions[Math.min(index, slotPositions.length - 1)];
    const row = candidates[index] ?? { id:`${team}-${fallbackPosition}-${index}`,name:`${team} ${fallbackPosition}`,position:fallbackPosition,overall:76,jersey:startNumber+index };
    result.push(starterFromRating(row, fallbackPosition, team, startNumber + index));
  }
  return result;
}

export function buildRoster(team: string, players: PlayerRatingRow[]): TeamRoster {
  const offense = [
    ...choosePlayers(players,["QB"],1,team,12),
    ...choosePlayers(players,["RB"],1,team,4),
    ...choosePlayers(players,["WR"],3,team,1),
    ...choosePlayers(players,["TE"],1,team,87),
    ...choosePlayers(players,["LT","RT","OL"],2,team,72,["LT","RT"]),
    ...choosePlayers(players,["LG","RG","OL"],2,team,65,["LG","RG"]),
    ...choosePlayers(players,["C","OL"],1,team,55),
  ].slice(0,11);
  const defense = [
    ...choosePlayers(players,["DE","DL"],2,team,90,["DE"]),
    ...choosePlayers(players,["DT","DL"],2,team,92,["DT"]),
    ...choosePlayers(players,["LB"],3,team,30),
    ...choosePlayers(players,["CB","DB"],2,team,2,["CB"]),
    ...choosePlayers(players,["FS","SS","DB"],2,team,5,["FS","SS"]),
  ].slice(0,11);
  const specialTeams = [
    ...choosePlayers(players,["K"],1,team,19),
    ...choosePlayers(players,["P"],1,team,98),
    ...choosePlayers(players,["LS"],1,team,46),
    ...choosePlayers(players,["H"],1,team,14),
  ];
  return { offense,defense,specialTeams };
}

export function modelRating(profile: ModelProfileRow) {
  const elo = Number(profile.eloRating ?? 1500);
  const efficiency = ((Number(profile.offYppIndex ?? 1) - 1) - (Number(profile.defYppIndex ?? 1) - 1)) * 30;
  return clamp(Math.round(82 + (elo - 1500) / 25 + efficiency), 60, 99);
}

export function createSeasonSave(input: {
  season: number;
  selectedTeam: string;
  difficulty?: GameDifficulty;
  quarterLengthMinutes?: number;
  profiles: ModelProfileRow[];
  schedule: ModelScheduleRow[];
  rosters: Record<string, PlayerRatingRow[]>;
}) {
  const teams: Record<string, SeasonTeam> = {};
  for (const profile of input.profiles) {
    const rating = modelRating(profile);
    teams[profile.team] = {
      teamId:String(profile.teamId ?? profile.team),name:profile.team,mascot:profile.mascot ?? "",
      abbreviation:profile.abbreviation ?? profile.team.slice(0,3).toUpperCase(),conference:profile.conference ?? "Independent",
      primaryColor:profile.color && /^#[0-9a-f]{6}$/i.test(profile.color) ? profile.color : "#1F5132",
      secondaryColor:profile.altColor && /^#[0-9a-f]{6}$/i.test(profile.altColor) ? profile.altColor : "#FFFFFF",
      logo:resolveTeamLogoAsset(profile.team) ?? profile.logo ?? "",rating,modelRating:rating,eloRating:Number(profile.eloRating ?? 1500),
      roster:buildRoster(profile.team,input.rosters[profile.team] ?? []),
    };
  }
  for(const row of input.schedule){
    for(const side of ["home","away"] as const){
      const name=side==="home"?row.homeTeam:row.awayTeam;if(teams[name])continue;
      const conference=side==="home"?row.homeConference:row.awayConference;
      const logo=side==="home"?row.homeLogo:row.awayLogo;
      teams[name]={teamId:`schedule-${name.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`,name,mascot:"",abbreviation:name.slice(0,4).toUpperCase(),conference:conference??"FCS",
        primaryColor:"#34423A",secondaryColor:"#FFFFFF",logo:resolveTeamLogoAsset(name) ?? logo ?? "",rating:67,modelRating:67,eloRating:1375,roster:buildRoster(name,[])};
    }
  }
  const games = input.schedule
    .filter((row) => !row.seasonType || row.seasonType.toLowerCase() === "regular")
    .map((row): SeasonGame => {
      const homeRating = teams[row.homeTeam]?.modelRating ?? 72;
      const awayRating = teams[row.awayTeam]?.modelRating ?? 72;
      const expectedMargin = (homeRating - awayRating) * 0.7 + (row.neutralSite ? 0 : 2.5);
      const baseTotal = 52;
      return {
        id:`regular-${row.gameId}`,week:Number(row.week),stage:"regular",label:weekLabel(row.week),
        startDate:row.startDate ?? null,venue:row.venue ?? null,neutralSite:Boolean(row.neutralSite),conferenceGame:Boolean(row.conferenceGame),
        homeTeam:row.homeTeam,awayTeam:row.awayTeam,
        predictedHomeScore:Number(row.predictedHomeScore ?? baseTotal / 2 + expectedMargin / 2),
        predictedAwayScore:Number(row.predictedAwayScore ?? baseTotal / 2 - expectedMargin / 2),
        homeWinProbability:Number(row.homeWinProbability ?? 1 / (1 + Math.exp(-expectedMargin / 7.5))),
        completed:false,userPlayed:false,homeScore:null,awayScore:null,
      };
    });
  const records = Object.fromEntries(Object.keys(teams).map((team) => [team,emptyRecord()]));
  for (const game of games) {
    records[game.homeTeam] ??= emptyRecord();
    records[game.awayTeam] ??= emptyRecord();
  }
  const firstWeek = Math.min(...games.filter((game)=>game.homeTeam===input.selectedTeam||game.awayTeam===input.selectedTeam).map((game)=>game.week),1);
  const id = `season-${input.season}-${input.selectedTeam.toLowerCase().replace(/[^a-z0-9]+/g,"-")}-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const selectedRoster = teams[input.selectedTeam]?.roster;
  const playerIds = selectedRoster ? [...selectedRoster.offense,...selectedRoster.defense,...(selectedRoster.specialTeams ?? [])].map((player)=>player.id) : [];
  const save: SeasonSave = {
    schemaVersion:SEASON_SAVE_VERSION,id,season:input.season,createdAt:now,updatedAt:now,selectedTeam:input.selectedTeam,difficulty:input.difficulty??"easy",quarterLengthMinutes:input.quarterLengthMinutes===0?0:Math.max(1,Math.min(15,Math.round(input.quarterLengthMinutes??15))),
    dynastyStartSeason:input.season,seasonHistory:[],
    currentWeek:firstWeek,phase:"regular",teams,games,records,rankings:Object.keys(teams).sort((left,right)=>(teams[right]?.modelRating??0)-(teams[left]?.modelRating??0)),
    userTeamStats:{...emptyTeamStats(),pointsFor:0,pointsAgainst:0},
    userPlayerStats:Object.fromEntries(playerIds.map((playerId)=>[playerId,emptyPlayerStats(playerId)])),
    accomplishments:{conferenceChampion:false,bowlGame:null,bowlChampion:false,playoffQualifier:false,playoffSeed:null,playoffRoundReached:null,nationalChampion:false},
    playoffSeeds:[],activeGame:null,
  };
  return recalculateSeason(save);
}

function addRecord(records: Record<string, TeamRecord>, game: SeasonGame) {
  if (game.homeScore === null || game.awayScore === null) return;
  records[game.homeTeam] ??= emptyRecord();
  records[game.awayTeam] ??= emptyRecord();
  const home = records[game.homeTeam], away = records[game.awayTeam];
  home.pointsFor += game.homeScore; home.pointsAgainst += game.awayScore;
  away.pointsFor += game.awayScore; away.pointsAgainst += game.homeScore;
  const homeWon = game.homeScore > game.awayScore;
  if (homeWon) { home.wins += 1; away.losses += 1; }
  else { away.wins += 1; home.losses += 1; }
  if (game.conferenceGame) {
    if (homeWon) { home.conferenceWins += 1; away.conferenceLosses += 1; }
    else { away.conferenceWins += 1; home.conferenceLosses += 1; }
  }
}

export function recalculateSeason(save: SeasonSave) {
  for(const game of save.games){
    if(!game.completed||game.homeScore===null||game.awayScore===null||game.teamStats)continue;
    const random=randomFor(`${save.id}:${game.id}:box-score`);
    game.teamStats={
      [game.homeTeam]:simulatedStatLine(game.homeScore,save.teams[game.homeTeam]?.rating??75,random),
      [game.awayTeam]:simulatedStatLine(game.awayScore,save.teams[game.awayTeam]?.rating??75,random),
    };
  }
  const records: Record<string, TeamRecord> = Object.fromEntries(Object.keys(save.records).map((team)=>[team,emptyRecord()]));
  for (const game of save.games.filter((candidate)=>candidate.completed)) addRecord(records,game);
  save.records = records;
  const opponents = new Map<string,string[]>();
  for (const game of save.games.filter((candidate)=>candidate.completed)) {
    (opponents.get(game.homeTeam) ?? opponents.set(game.homeTeam,[]).get(game.homeTeam)!).push(game.awayTeam);
    (opponents.get(game.awayTeam) ?? opponents.set(game.awayTeam,[]).get(game.awayTeam)!).push(game.homeTeam);
  }
  const rankingScore = (team:string) => {
    const record=records[team]??emptyRecord();
    const games=record.wins+record.losses;
    const rating=save.teams[team]?.modelRating??70;
    const priorWinRate=clamp(.5+(rating-78)*.018,.2,.8);
    const adjustedWinRate=(record.wins+priorWinRate*4)/(games+4);
    const opponentRows=opponents.get(team)??[];
    const sos=opponentRows.reduce((sum,opponent)=>{
      const opponentRecord=records[opponent]??emptyRecord();
      const opponentGames=opponentRecord.wins+opponentRecord.losses;
      return sum+(opponentRecord.wins+.5)/(opponentGames+1);
    },0)/Math.max(1,opponentRows.length);
    const margin=games?clamp((record.pointsFor-record.pointsAgainst)/games,-28,28):0;
    const evidence=Math.min(1,games/6);
    return adjustedWinRate*80+rating*.42+sos*4+margin*.22*evidence+record.wins*1.3-record.losses*.4;
  };
  save.rankings = Object.keys(records)
    .filter((team)=>save.teams[team]?.conference!=="FCS")
    .sort((left,right)=>rankingScore(right)-rankingScore(left)||(save.teams[right]?.modelRating??0)-(save.teams[left]?.modelRating??0));
  return save;
}

export function simulateGame(game: SeasonGame, save: SeasonSave) {
  const random = randomFor(`${save.id}:${game.id}`);
  const homeRating=save.teams[game.homeTeam]?.modelRating??72,awayRating=save.teams[game.awayTeam]?.modelRating??72;
  const modelMargin = game.predictedHomeScore-game.predictedAwayScore;
  const strengthMargin = (homeRating-awayRating)*0.65+(game.neutralSite?0:2.5);
  const expectedMargin = modelMargin*0.72+strengthMargin*0.28;
  const expectedTotal = clamp(game.predictedHomeScore+game.predictedAwayScore,34,78);
  const total = clamp(Math.round(expectedTotal+normal(random)*8),20,96);
  const margin = Math.round(expectedMargin+normal(random)*10.5);
  let homeScore=Math.max(3,Math.round((total+margin)/2)),awayScore=Math.max(3,total-homeScore);
  if(homeScore===awayScore){ if(random()<0.5)homeScore+=3;else awayScore+=3; }
  const statRandom=randomFor(`${save.id}:${game.id}:box-score`);
  const teamStats={
    [game.homeTeam]:simulatedStatLine(homeScore,save.teams[game.homeTeam]?.rating??75,statRandom),
    [game.awayTeam]:simulatedStatLine(awayScore,save.teams[game.awayTeam]?.rating??75,statRandom),
  };
  return {...game,completed:true,userPlayed:false,homeScore,awayScore,teamStats};
}

export function projectedPlayoffSeeds(save: SeasonSave) {
  if(save.season<2024)return save.rankings.slice(0,4);
  const rankIndex = new Map(save.rankings.map((team, index) => [team, index]));
  const conferenceLeaders = new Map<string, string>();
  for (const team of save.rankings) {
    const conference = save.teams[team]?.conference;
    if (!conference || conference === "Independent" || conference === "FCS" || conferenceLeaders.has(conference)) continue;
    conferenceLeaders.set(conference, team);
  }
  const automatic = [...conferenceLeaders.values()]
    .sort((left, right) => (rankIndex.get(left) ?? 999) - (rankIndex.get(right) ?? 999))
    .slice(0, 5);
  return [...automatic, ...save.rankings.filter((team) => !automatic.includes(team))]
    .slice(0, 12)
    .sort((left, right) => (rankIndex.get(left) ?? 999) - (rankIndex.get(right) ?? 999));
}

function addTeamStats(target: SeasonSave["userTeamStats"], source: TeamStats) {
  for (const key of Object.keys(source) as Array<keyof TeamStats>) target[key] += source[key];
}

function addPlayerStats(target: IndividualPlayerStats, source: IndividualPlayerStats) {
  for (const key of Object.keys(source) as Array<keyof IndividualPlayerStats>) {
    if (key !== "playerId") (target[key] as number) += source[key] as number;
  }
}

export function applyUserGameResult(save: SeasonSave, gameId: string, state: GameState) {
  const index = save.games.findIndex((game)=>game.id===gameId);
  if(index<0)return save;
  const game=save.games[index];
  save.games[index]={...game,completed:true,userPlayed:true,homeScore:state.score.home,awayScore:state.score.away,
    teamStats:{[game.homeTeam]:state.stats.home,[game.awayTeam]:state.stats.away},
    playerStats:{[game.homeTeam]:state.playerStats.home,[game.awayTeam]:state.playerStats.away}};
  const userSide=game.homeTeam===save.selectedTeam?"home":"away";
  const opponentSide=userSide==="home"?"away":"home";
  addTeamStats(save.userTeamStats,state.stats[userSide]);
  save.userTeamStats.pointsFor+=state.score[userSide];
  save.userTeamStats.pointsAgainst+=state.score[opponentSide];
  for(const stats of Object.values(state.playerStats[userSide])){
    save.userPlayerStats[stats.playerId]??=emptyPlayerStats(stats.playerId);
    addPlayerStats(save.userPlayerStats[stats.playerId],stats);
  }
  save.activeGame=null;
  return recalculateSeason(save);
}

function conferenceChampionships(save:SeasonSave){
  const byConference=new Map<string,string[]>();
  for(const [team,config] of Object.entries(save.teams)){
    if(!config.conference||config.conference==="Independent"||config.conference==="FCS")continue;
    const list=byConference.get(config.conference)??[];list.push(team);byConference.set(config.conference,list);
  }
  const games:SeasonGame[]=[];
  for(const [conference,teams] of byConference){
    if(teams.length<2)continue;
    teams.sort((left,right)=>{
      const a=save.records[left]??emptyRecord(),b=save.records[right]??emptyRecord();
      return b.conferenceWins-a.conferenceWins||a.conferenceLosses-b.conferenceLosses||b.wins-a.wins||(save.teams[right]?.modelRating??0)-(save.teams[left]?.modelRating??0);
    });
    const [homeTeam,awayTeam]=teams;
    const homeRating=save.teams[homeTeam].modelRating,awayRating=save.teams[awayTeam].modelRating;
    const margin=(homeRating-awayRating)*.7;
    games.push({id:`conference-${conference.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`,week:17,stage:"conference",label:`${conference} Championship`,startDate:null,venue:null,neutralSite:true,conferenceGame:true,
      homeTeam,awayTeam,predictedHomeScore:27+margin/2,predictedAwayScore:27-margin/2,homeWinProbability:1/(1+Math.exp(-margin/7.5)),completed:false,userPlayed:false,homeScore:null,awayScore:null});
  }
  return games;
}

function createBracketGame(save:SeasonSave,stage:SeasonPhase,label:string,homeTeam:string,awayTeam:string,index:number):SeasonGame{
  const homeRating=save.teams[homeTeam]?.modelRating??75,awayRating=save.teams[awayTeam]?.modelRating??75;
  const margin=(homeRating-awayRating)*.7;
  return {id:`${stage}-${index}-${homeTeam}-${awayTeam}`.toLowerCase().replace(/[^a-z0-9-]+/g,"-"),week:18+index,stage,label,startDate:null,venue:null,
    neutralSite:stage!=="playoff-first",conferenceGame:false,homeTeam,awayTeam,predictedHomeScore:27+margin/2+(stage==="playoff-first"?1.5:0),predictedAwayScore:27-margin/2,
    homeWinProbability:1/(1+Math.exp(-(margin+(stage==="playoff-first"?3:0))/7.5)),completed:false,userPlayed:false,homeScore:null,awayScore:null};
}

function bowlEligibilityThreshold(save:SeasonSave,team:string){
  const regularGames=save.games.filter((game)=>game.stage==="regular"&&(game.homeTeam===team||game.awayTeam===team)).length;
  return Math.min(6,Math.max(1,Math.ceil(regularGames/2)));
}

function prepareBowls(save:SeasonSave){
  if(save.games.some((game)=>game.stage==="bowl"))return [];
  const playoffTeams=new Set(save.playoffSeeds);
  const candidates=save.rankings.filter((team)=>{
    const config=save.teams[team];
    const record=save.records[team]??emptyRecord();
    return config?.conference!=="FCS"&&!playoffTeams.has(team)&&record.wins>=bowlEligibilityThreshold(save,team);
  }).slice(0,BOWL_NAMES.length*2);
  const games:SeasonGame[]=[];
  for(const label of BOWL_NAMES){
    const homeTeam=candidates.shift();
    if(!homeTeam||!candidates.length)break;
    const differentConference=candidates.findIndex((team)=>save.teams[team]?.conference!==save.teams[homeTeam]?.conference);
    const awayIndex=differentConference>=0?differentConference:0;
    const [awayTeam]=candidates.splice(awayIndex,1);
    const homeRating=save.teams[homeTeam]?.modelRating??75,awayRating=save.teams[awayTeam]?.modelRating??75;
    const margin=(homeRating-awayRating)*.7;
    games.push({
      id:`bowl-${label}-${homeTeam}-${awayTeam}`.toLowerCase().replace(/[^a-z0-9-]+/g,"-"),
      week:18,stage:"bowl",label,startDate:null,venue:null,neutralSite:true,conferenceGame:false,
      homeTeam,awayTeam,predictedHomeScore:27+margin/2,predictedAwayScore:27-margin/2,
      homeWinProbability:1/(1+Math.exp(-margin/7.5)),completed:false,userPlayed:false,homeScore:null,awayScore:null,
    });
  }
  return games;
}

function preparePlayoff(save:SeasonSave){
  if(save.season<2024){
    const seeds=save.rankings.slice(0,4);save.playoffSeeds=seeds;
    const userSeed=seeds.indexOf(save.selectedTeam)+1;
    if(userSeed){save.accomplishments.playoffQualifier=true;save.accomplishments.playoffSeed=userSeed;save.accomplishments.playoffRoundReached="Semifinal";}
    return [[seeds[0],seeds[3]],[seeds[1],seeds[2]]].map(([home,away],index)=>createBracketGame(save,"playoff-semifinal","CFP Semifinal",home,away,index));
  }
  const conferenceWinners=save.games.filter((game)=>game.stage==="conference"&&game.completed).map((game)=>Number(game.homeScore)>Number(game.awayScore)?game.homeTeam:game.awayTeam);
  const ordered=[...save.rankings];
  conferenceWinners.sort((a,b)=>ordered.indexOf(a)-ordered.indexOf(b));
  const auto=conferenceWinners.slice(0,5);
  const seeds=[...auto,...ordered.filter((team)=>!auto.includes(team))].slice(0,12).sort((a,b)=>ordered.indexOf(a)-ordered.indexOf(b));
  save.playoffSeeds=seeds;
  const userSeed=seeds.indexOf(save.selectedTeam)+1;
  if(userSeed){save.accomplishments.playoffQualifier=true;save.accomplishments.playoffSeed=userSeed;save.accomplishments.playoffRoundReached="First Round";}
  const pairings=[[4,11],[5,10],[6,9],[7,8]];
  return pairings.map(([homeIndex,awayIndex],index)=>createBracketGame(save,"playoff-first","CFP First Round",seeds[homeIndex],seeds[awayIndex],index));
}

function winners(games:SeasonGame[]){return games.map((game)=>Number(game.homeScore)>Number(game.awayScore)?game.homeTeam:game.awayTeam);}

function nextPlayoffRound(save:SeasonSave,stage:SeasonPhase){
  const prior=save.games.filter((game)=>game.stage===stage&&game.completed);
  const won=winners(prior);
  if(stage==="playoff-first"){
    const seeds=save.playoffSeeds;
    const matchups=[[seeds[0],won[3]],[seeds[1],won[2]],[seeds[2],won[1]],[seeds[3],won[0]]];
    return matchups.map(([home,away],index)=>createBracketGame(save,"playoff-quarterfinal","CFP Quarterfinal",home,away,index));
  }
  if(stage==="playoff-quarterfinal"){
    return [[won[0],won[3]],[won[1],won[2]]].map(([home,away],index)=>createBracketGame(save,"playoff-semifinal","CFP Semifinal",home,away,index));
  }
  if(stage==="playoff-semifinal")return [createBracketGame(save,"championship","National Championship",won[0],won[1],0)];
  return [];
}

function userGameFor(save:SeasonSave){
  return save.games.find((game)=>(game.homeTeam===save.selectedTeam||game.awayTeam===save.selectedTeam)&&
    (save.phase==="regular"?game.stage==="regular"&&game.week===save.currentWeek:game.stage===save.phase));
}

export function currentUserGame(save:SeasonSave){return userGameFor(save)??null;}

function simulatedStatLine(points: number, rating: number, random: () => number): TeamStats {
  const plays = clamp(Math.round(64 + normal(random) * 5), 50, 82);
  const passAttempts = clamp(Math.round(31 + normal(random) * 5), 18, plays - 20);
  const rushAttempts = plays - passAttempts;
  const totalYards = clamp(Math.round(205 + points * 6.2 + (rating - 75) * 3 + normal(random) * 42), 180, 690);
  const passShare = clamp(0.54 + normal(random) * 0.08, 0.38, 0.72);
  const passYards = Math.round(totalYards * passShare);
  const rushYards = totalYards - passYards;
  const touchdowns = Math.max(0, Math.floor(points / 7));
  const rushTouchdowns = Math.min(touchdowns, Math.max(0, Math.round(touchdowns * (0.38 + normal(random) * 0.12))));
  const passTouchdowns = touchdowns - rushTouchdowns;
  const turnovers = random() < 0.58 ? 1 : random() < 0.82 ? 2 : 0;
  return {
    plays, firstDowns:clamp(Math.round(totalYards/19),8,34), rushAttempts, rushYards, rushTouchdowns,
    passAttempts, completions:clamp(Math.round(passAttempts*(0.6+random()*0.1)),0,passAttempts), passYards, passTouchdowns,
    sacksAllowed:clamp(Math.round(random()*4),0,6), interceptionsThrown:turnovers>0&&random()<0.68?1:0,
    fumblesLost:turnovers>1?1:0, punts:clamp(Math.round(6-points/10+random()*2),1,8), puntReturns:Math.round(random()*3),
    puntReturnYards:Math.round(random()*28), kickReturns:clamp(Math.round(1+random()*3),1,5), kickReturnYards:Math.round(20+random()*70),
    fieldGoalsMade:Math.max(0,Math.floor((points-touchdowns*7)/3)), fieldGoalsAttempted:Math.max(0,Math.floor((points-touchdowns*7)/3))+Math.round(random()),
    timeOfPossessionSeconds:clamp(Math.round(1800+normal(random)*170),1250,2350),
  };
}

function simulatedUserPlayers(team: SeasonTeam, teamStats: TeamStats) {
  const quarterback=team.roster.offense.find((player)=>player.position==="QB")??team.roster.offense[0];
  const runner=team.roster.offense.find((player)=>player.position==="RB")??team.roster.offense[1];
  const receiver=team.roster.offense.find((player)=>player.position==="WR")??team.roster.offense[2];
  const result:Record<string,IndividualPlayerStats>={};
  for(const player of [quarterback,runner,receiver])if(player)result[player.id]=emptyPlayerStats(player.id);
  if(quarterback){Object.assign(result[quarterback.id],{passAttempts:teamStats.passAttempts,completions:teamStats.completions,passYards:teamStats.passYards,passTouchdowns:teamStats.passTouchdowns,interceptionsThrown:teamStats.interceptionsThrown});}
  if(runner){Object.assign(result[runner.id],{rushAttempts:teamStats.rushAttempts,rushYards:teamStats.rushYards,rushTouchdowns:teamStats.rushTouchdowns});}
  if(receiver){Object.assign(result[receiver.id],{targets:Math.round(teamStats.passAttempts*.3),receptions:Math.round(teamStats.completions*.34),receivingYards:Math.round(teamStats.passYards*.42),receivingTouchdowns:Math.min(teamStats.passTouchdowns,Math.round(teamStats.passTouchdowns*.55))});}
  return result;
}

export function simulateUserGame(save: SeasonSave) {
  const game = userGameFor(save);
  if (!game || game.completed) return recalculateSeason(save);
  const index = save.games.findIndex((candidate) => candidate.id === game.id);
  if (index >= 0) {
    const result=simulateGame(game,save);
    const random=randomFor(`${save.id}:${game.id}:user-stats`);
    const homeStats=simulatedStatLine(Number(result.homeScore),save.teams[game.homeTeam]?.rating??75,random);
    const awayStats=simulatedStatLine(Number(result.awayScore),save.teams[game.awayTeam]?.rating??75,random);
    const userSide=game.homeTeam===save.selectedTeam?"home":"away";
    const userStats=userSide==="home"?homeStats:awayStats;
    const userPlayers=simulatedUserPlayers(save.teams[save.selectedTeam],userStats);
    save.games[index]={...result,teamStats:{[game.homeTeam]:homeStats,[game.awayTeam]:awayStats},playerStats:{[save.selectedTeam]:userPlayers}};
    addTeamStats(save.userTeamStats,userStats);
    save.userTeamStats.pointsFor+=Number(userSide==="home"?result.homeScore:result.awayScore);
    save.userTeamStats.pointsAgainst+=Number(userSide==="home"?result.awayScore:result.homeScore);
    for(const stats of Object.values(userPlayers)){save.userPlayerStats[stats.playerId]??=emptyPlayerStats(stats.playerId);addPlayerStats(save.userPlayerStats[stats.playerId],stats);}
  }
  save.activeGame = null;
  return recalculateSeason(save);
}

export function canAdvance(save:SeasonSave){
  const userGame=userGameFor(save);
  return !userGame||userGame.completed;
}

export function advanceSeason(save:SeasonSave){
  const userGame=userGameFor(save);if(userGame&&!userGame.completed)return save;
  if(save.phase==="regular"){
    save.games=save.games.map((game)=>game.stage==="regular"&&game.week===save.currentWeek&&!game.completed?simulateGame(game,save):game);
    recalculateSeason(save);
    const maxWeek=Math.max(...save.games.filter((game)=>game.stage==="regular").map((game)=>game.week));
    if(save.currentWeek<maxWeek){save.currentWeek+=1;return save;}
    const championshipGames=conferenceChampionships(save);save.games.push(...championshipGames);save.phase="conference";save.currentWeek=17;return save;
  }
  const stage=save.phase;
  save.games=save.games.map((game)=>game.stage===stage&&!game.completed?simulateGame(game,save):game);
  recalculateSeason(save);
  if(stage==="conference"){
    const conferenceGame=save.games.find((game)=>game.stage==="conference"&&(game.homeTeam===save.selectedTeam||game.awayTeam===save.selectedTeam));
    if(conferenceGame&&conferenceGame.completed){const winner=Number(conferenceGame.homeScore)>Number(conferenceGame.awayScore)?conferenceGame.homeTeam:conferenceGame.awayTeam;save.accomplishments.conferenceChampion=winner===save.selectedTeam;}
    const playoffGames=preparePlayoff(save);const bowlGames=prepareBowls(save);save.games.push(...bowlGames,...playoffGames);
    const userBowl=bowlGames.find((game)=>game.homeTeam===save.selectedTeam||game.awayTeam===save.selectedTeam);
    if(userBowl){save.accomplishments.bowlGame=userBowl.label;save.phase="bowl";}
    else{
      save.games=save.games.map((game)=>game.stage==="bowl"&&!game.completed?simulateGame(game,save):game);
      recalculateSeason(save);save.phase=playoffGames[0]?.stage??"complete";
    }
    save.currentWeek=18;return save;
  }
  if(stage==="bowl"){
    const userBowl=save.games.find((game)=>game.stage==="bowl"&&(game.homeTeam===save.selectedTeam||game.awayTeam===save.selectedTeam));
    if(userBowl?.completed){const winner=Number(userBowl.homeScore)>Number(userBowl.awayScore)?userBowl.homeTeam:userBowl.awayTeam;save.accomplishments.bowlGame=userBowl.label;save.accomplishments.bowlChampion=winner===save.selectedTeam;}
    const playoffStage:SeasonPhase=save.season<2024?"playoff-semifinal":"playoff-first";
    save.phase=save.games.some((game)=>game.stage===playoffStage)?playoffStage:"complete";save.currentWeek=19;return save;
  }
  if(stage==="championship"){
    const title=save.games.find((game)=>game.stage==="championship");
    if(title){const champion=Number(title.homeScore)>Number(title.awayScore)?title.homeTeam:title.awayTeam;save.accomplishments.nationalChampion=champion===save.selectedTeam;}
    save.phase="complete";return save;
  }
  const next=nextPlayoffRound(save,stage);save.games.push(...next);
  save.phase=next[0]?.stage??"complete";save.currentWeek+=1;
  const roundLabels:Record<string,string>={"playoff-first":"Quarterfinal","playoff-quarterfinal":"Semifinal","playoff-semifinal":"National Championship"};
  if(save.accomplishments.playoffQualifier&&save.games.some((game)=>game.stage===stage&&game.completed&&(game.homeTeam===save.selectedTeam||game.awayTeam===save.selectedTeam))){
    const played=save.games.find((game)=>game.stage===stage&&(game.homeTeam===save.selectedTeam||game.awayTeam===save.selectedTeam));
    const winner=played&&(Number(played.homeScore)>Number(played.awayScore)?played.homeTeam:played.awayTeam);
    if(winner===save.selectedTeam)save.accomplishments.playoffRoundReached=roundLabels[stage]??save.accomplishments.playoffRoundReached;
  }
  return save;
}

export function recordLabel(record:TeamRecord|undefined){return record?`${record.wins}-${record.losses}`:"0-0";}

export function rankingFor(save:SeasonSave,team:string){const index=save.rankings.indexOf(team);return index>=0&&index<25?index+1:null;}

export function archiveCompletedSeason(save:SeasonSave):CompletedSeasonSummary{
  const finalIndex=save.rankings.indexOf(save.selectedTeam);
  return {
    season:save.season,
    team:save.selectedTeam,
    finalRecord:{...(save.records[save.selectedTeam]??emptyRecord())},
    finalRanking:finalIndex>=0?finalIndex+1:null,
    accomplishments:{...save.accomplishments},
    schedule:save.games.filter((game)=>game.homeTeam===save.selectedTeam||game.awayTeam===save.selectedTeam).map((game)=>({...game})),
    teamStats:{...save.userTeamStats},
    playerStats:Object.fromEntries(Object.entries(save.userPlayerStats).map(([id,stats])=>[id,{...stats}])),
  };
}

export function continueDynastySeason(previous:SeasonSave,next:SeasonSave){
  const archive=archiveCompletedSeason(previous);
  return {
    ...next,
    id:previous.id,
    createdAt:previous.createdAt,
    dynastyStartSeason:previous.dynastyStartSeason??previous.season,
    difficulty:previous.difficulty??"easy",
    quarterLengthMinutes:previous.quarterLengthMinutes??15,
    seasonHistory:[...(previous.seasonHistory??[]).filter((season)=>season.season!==archive.season),archive],
  } satisfies SeasonSave;
}

export function topPlayerLeaders(save:SeasonSave){
  const roster=save.teams[save.selectedTeam]?.roster;const byId=new Map([...(roster?.offense??[]),...(roster?.defense??[]),...(roster?.specialTeams??[])].map((player)=>[player.id,player]));
  const rows=Object.values(save.userPlayerStats).map((stats)=>({stats,player:byId.get(stats.playerId)}));
  const top=(key:keyof IndividualPlayerStats)=>rows.sort((a,b)=>Number(b.stats[key])-Number(a.stats[key]))[0];
  return {passing:top("passYards"),rushing:top("rushYards"),receiving:top("receivingYards"),tackles:top("tackles"),sacks:top("sacks")};
}

export function phaseLabel(phase:SeasonPhase,week:number){
  const labels:Record<SeasonPhase,string>={regular:weekLabel(week),conference:"Conference Championship Week",bowl:"Bowl Week","playoff-first":"CFP First Round","playoff-quarterfinal":"CFP Quarterfinal","playoff-semifinal":"CFP Semifinal",championship:"National Championship",complete:"Season Complete"};
  return labels[phase];
}

export function powerConference(conference:string){return POWER_CONFERENCES.has(conference);}
