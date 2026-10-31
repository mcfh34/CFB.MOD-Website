import { readFile, writeFile } from "node:fs/promises";
import { buildSeasonPdf } from "../lib/season/pdf";
import { createSeasonSave, recalculateSeason } from "../lib/season/simulation";

const profiles=Array.from({length:16},(_,index)=>({
  team:`Program ${index+1}`,teamId:index+1,abbreviation:`P${index+1}`,mascot:"Testers",conference:["SEC","Big Ten","Big 12","ACC"][Math.floor(index/4)],
  color:"#173d2a",altColor:"#ffffff",eloRating:1700-index*12,offYppIndex:1.1,defYppIndex:.9,
}));
const schedule=Array.from({length:12},(_,index)=>({gameId:String(index+1),week:index+1,seasonType:"regular",homeTeam:index%2?"Program 2":"Program 1",awayTeam:index%2?"Program 1":`Program ${index%15+2}`,predictedHomeScore:30,predictedAwayScore:23,homeWinProbability:.66}));
const save=createSeasonSave({season:2026,selectedTeam:"Program 1",profiles,schedule,rosters:{}});
for(const game of save.games){game.completed=true;game.userPlayed=true;game.homeScore=game.homeTeam==="Program 1"?31:20;game.awayScore=game.awayTeam==="Program 1"?31:20;}
save.phase="complete";save.accomplishments={conferenceChampion:true,bowlGame:null,bowlChampion:false,playoffQualifier:true,playoffSeed:3,playoffRoundReached:"National Championship",nationalChampion:true};
save.userTeamStats={...save.userTeamStats,plays:792,firstDowns:286,rushAttempts:451,rushYards:2394,rushTouchdowns:28,passAttempts:341,completions:226,passYards:3188,passTouchdowns:31,interceptionsThrown:7,fumblesLost:4,timeOfPossessionSeconds:21948,pointsFor:428,pointsAgainst:244};
recalculateSeason(save);
const output=process.argv[2]??"/tmp/harper-season-mode-sample.pdf";
const logoPath=process.argv[3];
const logoFile=logoPath?await readFile(logoPath):null;
const logo=logoFile?{bytes:logoFile.buffer.slice(logoFile.byteOffset,logoFile.byteOffset+logoFile.byteLength) as ArrayBuffer,type:"image/png"}:undefined;
await writeFile(output,await buildSeasonPdf(save,logo));
console.log(output);
