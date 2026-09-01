const baseUrl = (process.env.HARPER_MODEL_URL || "https://harpercfbmodel.com").replace(/\/$/, "");
export {};
const seasons = [2021, 2022, 2023, 2024, 2025];

type ScheduleRow = {
  week:number;seasonType:string;spreadResult:string|null;totalResult:string|null;
  spreadError:number|null;totalError:number|null;generatedFromWeek:number|null;
};

const percentage = (wins:number, losses:number) => wins + losses ? `${(wins / (wins + losses) * 100).toFixed(1)}%` : "—";

for (const season of seasons) {
  const response = await fetch(`${baseUrl}/api/data?view=schedule&season=${season}&week=0`);
  if (!response.ok) throw new Error(`${season} schedule returned HTTP ${response.status}`);
  const payload = await response.json() as { rows?:ScheduleRow[];modelVersion?:string };
  const rows = (payload.rows ?? []).filter((row) => row.week >= 5 || row.seasonType === "postseason");
  const metric = (side:"spread"|"total") => {
    const key = side === "spread" ? "spreadResult" : "totalResult";
    const error = side === "spread" ? "spreadError" : "totalError";
    const wins = rows.filter((row) => row[key] === "W").length;
    const losses = rows.filter((row) => row[key] === "L").length;
    const pushes = rows.filter((row) => row[key] === "PUSH").length;
    const passes = rows.filter((row) => row[key] === "PASS").length;
    const errors = rows.map((row) => row[error]).filter((value):value is number => value !== null && Number.isFinite(value));
    return { wins,losses,pushes,passes,accuracy:percentage(wins,losses),mae:errors.length ? (errors.reduce((sum,value)=>sum+value,0)/errors.length).toFixed(2) : "—" };
  };
  const spread = metric("spread");
  const total = metric("total");
  console.log(`${season} ${payload.modelVersion ?? "unknown"} | ATS ${spread.accuracy} (${spread.wins}-${spread.losses}, ${spread.passes} pass) MAE ${spread.mae} | TOTAL ${total.accuracy} (${total.wins}-${total.losses}, ${total.passes} pass) MAE ${total.mae}`);
}
