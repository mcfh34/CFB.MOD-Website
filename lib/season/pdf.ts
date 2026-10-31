import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { recordLabel, topPlayerLeaders } from "./simulation";
import type { SeasonSave } from "./types";

function formatDuration(seconds:number){
  return `${Math.floor(seconds/60)}:${Math.round(seconds%60).toString().padStart(2,"0")}`;
}

function result(save:SeasonSave,game:SeasonSave["games"][number]){
  if(game.homeScore===null||game.awayScore===null)return "—";
  const own=game.homeTeam===save.selectedTeam?game.homeScore:game.awayScore;
  const opponent=game.homeTeam===save.selectedTeam?game.awayScore:game.homeScore;
  return `${own>opponent?"W":"L"} ${own}–${opponent}`;
}

export async function buildSeasonPdf(save:SeasonSave,logo?:{bytes:ArrayBuffer;type:string}){
  const pdf=await PDFDocument.create();
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const size:[number,number]=[612,792];
  let page=pdf.addPage(size),y=744;
  const ink=rgb(.08,.1,.09),muted=rgb(.36,.4,.37),green=rgb(.08,.34,.2),gold=rgb(.82,.57,.15);
  const addPage=()=>{page=pdf.addPage(size);y=744;};
  const line=(text:string,fontSize=9,font=regular,color=ink,x=42)=>{if(y<52)addPage();page.drawText(text,{x,y,size:fontSize,font,color,maxWidth:528});y-=fontSize+6;};
  const section=(title:string)=>{y-=5;line(title.toUpperCase(),10,bold,gold);y-=2;};
  if(logo){
    try{const image=logo.type.includes("jpeg")||logo.type.includes("jpg")?await pdf.embedJpg(logo.bytes):await pdf.embedPng(logo.bytes);page.drawImage(image,{x:500,y:704,width:62,height:62});}catch{/* Keep the team name when an unsupported image is supplied. */}
  }
  line("HARPER+ // SEASON MODE",9,bold,gold);
  line(save.selectedTeam,24,bold,ink);
  line(`${save.season} SEASON · FINAL RECORD ${recordLabel(save.records[save.selectedTeam])}`,12,bold,green);
  const accomplishments=[save.accomplishments.conferenceChampion?"Conference Champion":null,save.accomplishments.bowlGame?`${save.accomplishments.bowlChampion?"Won":"Played in"} ${save.accomplishments.bowlGame}`:null,save.accomplishments.playoffQualifier?`CFP #${save.accomplishments.playoffSeed} seed`:null,save.accomplishments.nationalChampion?"National Champion":null].filter((value):value is string=>Boolean(value));
  for(const accomplishment of accomplishments)line(accomplishment,8,bold,muted);
  section("Schedule and results");
  for(const game of save.games.filter((item)=>item.completed&&(item.homeTeam===save.selectedTeam||item.awayTeam===save.selectedTeam))){
    const opponent=game.homeTeam===save.selectedTeam?game.awayTeam:game.homeTeam;
    const site=game.neutralSite?"N":game.homeTeam===save.selectedTeam?"vs":"at";
    if(y<52)addPage();
    page.drawText(game.label,{x:42,y,size:8,font:regular,color:ink,maxWidth:125});
    page.drawText(`${site} ${opponent}`,{x:180,y,size:8,font:regular,color:ink,maxWidth:230});
    page.drawText(result(save,game),{x:462,y,size:8,font:bold,color:ink,maxWidth:105});
    y-=14;
  }
  section("Team statistics");
  const stats=save.userTeamStats;
  for(const text of [
    `Points for / against  ${stats.pointsFor} / ${stats.pointsAgainst}`,
    `Total offense  ${stats.rushYards+stats.passYards} yards`,
    `Rushing  ${stats.rushAttempts} attempts · ${stats.rushYards} yards · ${stats.rushTouchdowns} TD`,
    `Passing  ${stats.completions}/${stats.passAttempts} · ${stats.passYards} yards · ${stats.passTouchdowns} TD`,
    `Turnovers  ${stats.interceptionsThrown+stats.fumblesLost} · First downs  ${stats.firstDowns}`,
    `Time of possession  ${formatDuration(stats.timeOfPossessionSeconds)}`,
  ])line(text,9,regular,ink);
  section("Statistical leaders");
  const leaders=topPlayerLeaders(save);
  const rows=[
    ["Passing",leaders.passing,leaders.passing?.stats.passYards,"yards"],
    ["Rushing",leaders.rushing,leaders.rushing?.stats.rushYards,"yards"],
    ["Receiving",leaders.receiving,leaders.receiving?.stats.receivingYards,"yards"],
    ["Tackles",leaders.tackles,leaders.tackles?.stats.tackles,"tackles"],
    ["Sacks",leaders.sacks,leaders.sacks?.stats.sacks,"sacks"],
  ] as const;
  for(const [label,leader,value,unit] of rows)line(`${label.padEnd(12)} ${leader?.player?.name??"—"} · ${value??0} ${unit}`,9,regular,ink);
  section("Season finish");
  line(`Conference: ${save.accomplishments.conferenceChampion?"Champion":"Did not win conference"}`,9);
  line(`Bowl: ${save.accomplishments.bowlGame?`${save.accomplishments.bowlChampion?"Won":"Played in"} ${save.accomplishments.bowlGame}`:"—"}`,9);
  line(`Playoff: ${save.accomplishments.playoffQualifier?save.accomplishments.playoffRoundReached??"Qualified":"Did not qualify"}`,9);
  line(`National championship: ${save.accomplishments.nationalChampion?"Won":"—"}`,9);
  page.drawText("Generated locally in Harper+ Season Mode. Authoritative model data was not modified.",{x:42,y:26,size:7,font:regular,color:muted});
  return pdf.save();
}
