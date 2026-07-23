from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f"Could not find {label} marker")
    return text.replace(old, new, 1)


page_path = Path("app/page.tsx")
page = page_path.read_text()
page = replace_once(
    page,
    '} from "../lib/teamStatsSort";\n\ntype Section',
    '} from "../lib/teamStatsSort";\nimport { buildTeamProjectedSeason } from "../lib/teamProjectedRecords";\n\ntype Section',
    "page import",
)
page = replace_once(
    page,
    '  const spread = performance.data?.spread;\n  const total = performance.data?.total;\n',
    '  const spread = performance.data?.spread;\n  const total = performance.data?.total;\n  const teamProjection = useMemo(() => buildTeamProjectedSeason(activeRows, teamFilter), [activeRows, teamFilter]);\n',
    "team projection memo",
)
page = replace_once(
    page,
    '<span>{loading ? "Loading games…" : `${activeRows.length} games shown`}</span>',
    '<span>{loading ? "Loading games…" : teamFilter && teamProjection.games.length ? `${activeRows.length} games · H+ ${teamProjection.finalProjectedRecord} · ${teamProjection.expectedWins.toFixed(1)} xW` : `${activeRows.length} games shown`}</span>',
    "schedule filter summary",
)
page = replace_once(
    page,
    '        const location = row.neutralSite ? "NEUTRAL" : teamFilter ? (row.homeTeam === teamFilter ? "HOME" : "AWAY") : (row.venue || "");\n        return <article',
    '        const location = row.neutralSite ? "NEUTRAL" : teamFilter ? (row.homeTeam === teamFilter ? "HOME" : "AWAY") : (row.venue || "");\n        const projected = teamFilter ? teamProjection.byGame.get(row.gameId) : undefined;\n        return <article',
    "per-game projected record lookup",
)
page = replace_once(
    page,
    '          <div data-label="H+ MODEL" className="schedule-model-cell"><b>{row.predictedAwayScore === null || row.predictedHomeScore === null ? "—" : `${row.predictedAwayScore.toFixed(0)}–${row.predictedHomeScore.toFixed(0)}`}</b><small>Spread {signed(row.modelHomeSpread)} · Total {row.modelTotal === null ? "—" : row.modelTotal.toFixed(1)}</small><small>{row.homeWinProbability === null ? "MODEL BUILD PENDING" : `${row.homeTeam} ${(row.homeWinProbability * 100).toFixed(0)}% · ${row.predictionSource === "live-profile" ? "LIVE PROFILE" : `FROM WK ${row.generatedFromWeek ?? "—"}`}`}</small></div>',
    '          <div data-label="H+ MODEL" className="schedule-model-cell"><b>{row.predictedAwayScore === null || row.predictedHomeScore === null ? "—" : `${row.predictedAwayScore.toFixed(0)}–${row.predictedHomeScore.toFixed(0)}`}</b><small>Spread {signed(row.modelHomeSpread)} · Total {row.modelTotal === null ? "—" : row.modelTotal.toFixed(1)}</small><small>{row.homeWinProbability === null ? "MODEL BUILD PENDING" : `${row.homeTeam} ${(row.homeWinProbability * 100).toFixed(0)}% · ${row.predictionSource === "live-profile" ? "LIVE PROFILE" : `FROM WK ${row.generatedFromWeek ?? "—"}`}`}</small>{projected ? <small className={projected.projectedResult === "W" ? "positive" : projected.projectedResult === "L" ? "negative" : ""}>H+ {projected.projectedResult} · PROJ RECORD {projected.projectedRecord} · xW {projected.expectedWins.toFixed(1)}</small> : null}</div>',
    "projected record display",
)
page = replace_once(
    page,
    'Predictions are generated from the prior week’s profile so completed-game results never leak into the forecast. The season ATS, totals and error cards are intentionally graded from Week 5 onward; the schedule table still preserves every game and result.',
    'Predictions are generated from the prior week’s profile so completed-game results never leak into the forecast. When a team is selected, H+ projected record is the cumulative win/loss path from those game-level picks; xW is the cumulative probability-based expected-win total. The season ATS, totals and error cards are intentionally graded from Week 5 onward.',
    "schedule disclaimer",
)
page_path.write_text(page)


test_path = Path("tests/model-logic.test.ts")
tests = test_path.read_text()
tests = replace_once(
    tests,
    'import { TEAM_STATS_SORT_COLUMNS, defaultTeamStatsSortDirection, sortTeamStatsRows, type TeamStatsSortableRow } from "../lib/teamStatsSort";\n',
    'import { TEAM_STATS_SORT_COLUMNS, defaultTeamStatsSortDirection, sortTeamStatsRows, type TeamStatsSortableRow } from "../lib/teamStatsSort";\nimport { buildTeamProjectedSeason } from "../lib/teamProjectedRecords";\n',
    "test import",
)
new_test = '''\n\ntest("team schedules accumulate deterministic projected records and probability-based expected wins", () => {\n  const projection = buildTeamProjectedSeason([\n    { gameId:"1", homeTeam:"Alabama", awayTeam:"Auburn", homeWinProbability:.7, predictedHomeScore:31, predictedAwayScore:20 },\n    { gameId:"2", homeTeam:"Georgia", awayTeam:"Alabama", homeWinProbability:.6, predictedHomeScore:27, predictedAwayScore:24 },\n    { gameId:"3", homeTeam:"LSU", awayTeam:"Alabama", homeWinProbability:.3, predictedHomeScore:21, predictedAwayScore:28 },\n    { gameId:"4", homeTeam:"Alabama", awayTeam:"Tennessee", homeWinProbability:null, predictedHomeScore:null, predictedAwayScore:null },\n  ], "Alabama");\n\n  assert.deepEqual(projection.games.map((game) => game.projectedRecord), ["1-0", "1-1", "2-1", "2-1"]);\n  assert.deepEqual(projection.games.map((game) => game.projectedResult), ["W", "L", "W", "—"]);\n  assert.equal(projection.finalProjectedRecord, "2-1");\n  assert.ok(Math.abs(projection.expectedWins - 1.8) < 1e-9);\n  assert.ok(Math.abs(projection.expectedLosses - 1.2) < 1e-9);\n});\n'''
if 'test("team schedules accumulate deterministic projected records' not in tests:
    tests += new_test
test_path.write_text(tests)
