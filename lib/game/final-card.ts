import { PDFDocument, StandardFonts, rgb, type PDFFont, type RGB } from "pdf-lib";
import type { GameState, IndividualPlayerStats, Player, TeamConfig } from "./types";

type QuarterLine = { label: string; home: number; away: number };

export function quarterScoring(state: GameState): QuarterLine[] {
  const highestPeriod = Math.max(4, ...state.playLog.map((entry) => entry.period));
  const lines: QuarterLine[] = Array.from({ length: highestPeriod }, (_, index) => ({
    label: index < 4 ? `Q${index + 1}` : `OT${index - 3}`,
    home: 0,
    away: 0,
  }));
  let previous = { home: 0, away: 0 };
  for (const entry of state.playLog) {
    const line = lines[Math.max(0, entry.period - 1)];
    line.home += Math.max(0, entry.scoreAfter.home - previous.home);
    line.away += Math.max(0, entry.scoreAfter.away - previous.away);
    previous = entry.scoreAfter;
  }
  return lines;
}

function color(hex: string, fallback = "#28D17C"): RGB {
  const value = /^#[0-9A-F]{6}$/i.test(hex) ? hex.slice(1) : fallback.slice(1);
  return rgb(
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  );
}

function fitText(text: string, font: PDFFont, maxWidth: number, maxSize: number, minSize = 7) {
  let size = maxSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
  return size;
}

function playerLine(
  team: TeamConfig,
  state: GameState,
  position: "QB" | "rush" | "receive" | "defense",
) {
  const stats = state.playerStats[team.side];
  const line = (player: Player) => stats[player.id] ?? ({} as IndividualPlayerStats);
  if (position === "QB") {
    const player = team.roster.offense.find((candidate) => candidate.position === "QB") ?? team.roster.offense[0];
    const value = line(player);
    return `${player.name}  ${value.completions ?? 0}/${value.passAttempts ?? 0}, ${value.passYards ?? 0} YDS, ${value.passTouchdowns ?? 0} TD`;
  }
  if (position === "rush") {
    const player = [...team.roster.offense].sort((a, b) => (line(b).rushYards ?? 0) - (line(a).rushYards ?? 0))[0];
    const value = line(player);
    return `${player.name}  ${value.rushAttempts ?? 0} CAR, ${value.rushYards ?? 0} YDS`;
  }
  if (position === "receive") {
    const player = [...team.roster.offense].sort((a, b) => (line(b).receivingYards ?? 0) - (line(a).receivingYards ?? 0))[0];
    const value = line(player);
    return `${player.name}  ${value.receptions ?? 0} REC, ${value.receivingYards ?? 0} YDS`;
  }
  const player = [...team.roster.defense].sort((a, b) => (line(b).tackles ?? 0) - (line(a).tackles ?? 0))[0];
  const value = line(player);
  return `${player.position} ${player.name}  ${value.tackles ?? 0} TKL, ${value.sacks ?? 0} SK, ${value.interceptions ?? 0} INT`;
}

export async function buildFinalCardPdf(state: GameState) {
  const document = await PDFDocument.create();
  document.setTitle(`Down by Down — ${state.homeTeam.name} vs ${state.awayTeam.name}`);
  document.setAuthor("Down by Down");
  document.setSubject("Final college football game card");
  const page = document.addPage([612, 792]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.93, 0.95, 0.94);
  const muted = rgb(0.55, 0.61, 0.58);
  const panel = rgb(0.065, 0.078, 0.071);
  const border = rgb(0.16, 0.19, 0.17);
  const homeColor = color(state.homeTeam.primaryColor);
  const awayColor = color(state.awayTeam.primaryColor, "#F05A43");

  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(0.025, 0.032, 0.028) });
  page.drawRectangle({ x: 24, y: 24, width: 564, height: 744, color: panel, borderColor: border, borderWidth: 1 });
  page.drawRectangle({ x: 24, y: 748, width: 282, height: 20, color: homeColor });
  page.drawRectangle({ x: 306, y: 748, width: 282, height: 20, color: awayColor });

  page.drawText("DOWN BY DOWN", { x: 44, y: 716, size: 11, font: bold, color: rgb(0.16, 0.82, 0.49) });
  page.drawText("FINAL GAME CARD", { x: 451, y: 716, size: 9, font: bold, color: muted });

  const teams = [
    { side: "home" as const, team: state.homeTeam, x: 44, align: "left" as const },
    { side: "away" as const, team: state.awayTeam, x: 326, align: "right" as const },
  ];
  for (const item of teams) {
    const score = String(state.score[item.side]);
    const teamSize = fitText(item.team.name.toUpperCase(), bold, 190, 22, 12);
    page.drawText(item.team.name.toUpperCase(), { x: item.x, y: 674, size: teamSize, font: bold, color: ink });
    page.drawText(item.team.mascot.toUpperCase(), { x: item.x, y: 653, size: 9, font: regular, color: muted });
    const scoreWidth = bold.widthOfTextAtSize(score, 44);
    page.drawText(score, {
      x: item.align === "left" ? 247 - scoreWidth : 568 - scoreWidth,
      y: 659,
      size: 44,
      font: bold,
      color: item.side === "home" ? homeColor : awayColor,
    });
  }
  page.drawText("—", { x: 299, y: 668, size: 20, font: bold, color: muted });

  const quarters = quarterScoring(state);
  const tableX = 44;
  const tableY = 610;
  const labelWidth = 122;
  const cellWidth = Math.min(56, (524 - labelWidth) / quarters.length);
  page.drawRectangle({ x: tableX, y: tableY - 44, width: 524, height: 58, color: rgb(0.035, 0.043, 0.039), borderColor: border, borderWidth: 1 });
  quarters.forEach((quarter, index) => {
    const x = tableX + labelWidth + index * cellWidth;
    page.drawText(quarter.label, { x: x + 14, y: tableY, size: 8, font: bold, color: muted });
    page.drawText(String(quarter.home), { x: x + 17, y: tableY - 19, size: 10, font: bold, color: ink });
    page.drawText(String(quarter.away), { x: x + 17, y: tableY - 37, size: 10, font: bold, color: ink });
  });
  page.drawText(state.homeTeam.abbreviation, { x: tableX + 10, y: tableY - 19, size: 9, font: bold, color: homeColor });
  page.drawText(state.awayTeam.abbreviation, { x: tableX + 10, y: tableY - 37, size: 9, font: bold, color: awayColor });
  page.drawText("FINAL", { x: 527, y: tableY, size: 8, font: bold, color: muted });
  page.drawText(String(state.score.home), { x: 540, y: tableY - 19, size: 10, font: bold, color: ink });
  page.drawText(String(state.score.away), { x: 540, y: tableY - 37, size: 10, font: bold, color: ink });

  page.drawText("TEAM STATS", { x: 44, y: 533, size: 9, font: bold, color: muted });
  const statRows = [
    ["FIRST DOWNS", state.stats.home.firstDowns, state.stats.away.firstDowns],
    ["TOTAL YARDS", state.stats.home.rushYards + state.stats.home.passYards, state.stats.away.rushYards + state.stats.away.passYards],
    ["RUSHING", `${state.stats.home.rushAttempts}-${state.stats.home.rushYards}`, `${state.stats.away.rushAttempts}-${state.stats.away.rushYards}`],
    ["PASSING", `${state.stats.home.completions}/${state.stats.home.passAttempts}-${state.stats.home.passYards}`, `${state.stats.away.completions}/${state.stats.away.passAttempts}-${state.stats.away.passYards}`],
    ["TURNOVERS", state.stats.home.interceptionsThrown + state.stats.home.fumblesLost, state.stats.away.interceptionsThrown + state.stats.away.fumblesLost],
    ["PUNTS", state.stats.home.punts, state.stats.away.punts],
    ["FIELD GOALS", `${state.stats.home.fieldGoalsMade}/${state.stats.home.fieldGoalsAttempted}`, `${state.stats.away.fieldGoalsMade}/${state.stats.away.fieldGoalsAttempted}`],
  ] as const;
  statRows.forEach((row, index) => {
    const y = 505 - index * 29;
    page.drawLine({ start: { x: 44, y: y - 8 }, end: { x: 568, y: y - 8 }, thickness: 0.6, color: border });
    page.drawText(String(row[1]), { x: 48, y, size: 11, font: bold, color: ink });
    const labelWidthAtSize = regular.widthOfTextAtSize(row[0], 8);
    page.drawText(row[0], { x: 306 - labelWidthAtSize / 2, y: y + 1, size: 8, font: regular, color: muted });
    const awayWidth = bold.widthOfTextAtSize(String(row[2]), 11);
    page.drawText(String(row[2]), { x: 564 - awayWidth, y, size: 11, font: bold, color: ink });
  });

  page.drawText("NOTABLE PLAYERS", { x: 44, y: 286, size: 9, font: bold, color: muted });
  const notableKinds = ["QB", "rush", "receive", "defense"] as const;
  teams.forEach((item, teamIndex) => {
    const x = teamIndex === 0 ? 44 : 326;
    page.drawText(item.team.abbreviation, { x, y: 260, size: 11, font: bold, color: teamIndex === 0 ? homeColor : awayColor });
    notableKinds.forEach((kind, index) => {
      const value = playerLine(item.team, state, kind);
      const size = fitText(value, regular, 238, 8.5, 6.5);
      page.drawText(value, { x, y: 239 - index * 25, size, font: regular, color: ink });
    });
  });

  page.drawLine({ start: { x: 44, y: 118 }, end: { x: 568, y: 118 }, thickness: 1, color: border });
  page.drawText(`${state.playLog.length} PLAYS  •  ${state.roomCode}`, { x: 44, y: 92, size: 8, font: bold, color: muted });
  const stamp = "CALL IT. COUNTER IT. LIVE WITH THE RESULT.";
  page.drawText(stamp, { x: 568 - bold.widthOfTextAtSize(stamp, 7.5), y: 92, size: 7.5, font: bold, color: rgb(0.16, 0.82, 0.49) });

  return document.save();
}
