import {DefensiveKeysPanel,DefensiveKeysMethod} from "./DefensiveKeysPanel";
import { buildWeeklyPreviews } from "../../lib/weeklyPreview";
import type { WeeklyReviewGame, WeeklyProjectedRank } from "../../lib/weeklyReview";
import type { WeeklyApRank } from "../../lib/weeklyApPoll";
import { resolveTeamLogoAsset } from "../../lib/teamLogoAssets";
import type { CSSProperties } from "react";

export function WeeklyPreview({games,rankings,apRankings=[],onOpenGame}:{games:WeeklyReviewGame[];rankings:WeeklyProjectedRank[];apRankings?:WeeklyApRank[];onOpenGame:(game:WeeklyReviewGame)=>void}){
  const stories=buildWeeklyPreviews(games,rankings,apRankings);
  const rounded=(value:number|null|undefined)=>typeof value==="number"&&Number.isFinite(value)?Math.round(value):null;
  const topEdge=(game:WeeklyReviewGame,team:string)=>game.edgeAnalysis?.positionGroups
    .filter(edge=>edge.edgeTeam===team)
    .sort((a,b)=>({strong:3,clear:2,slight:1,even:0})[b.strength]-({strong:3,clear:2,slight:1,even:0})[a.strength])[0];
  const untested=(game:WeeklyReviewGame,team:string)=>game.matchupTests
    ?.filter(test=>test.team===team&&test.credibleTests===0)
    .sort((a,b)=>(b.upcomingChallengePercent??0)-(a.upcomingChallengePercent??0))[0];
  return <section className="weekly-preview weekly-scoreboard" aria-label="Upcoming games preview">
    <header><span>THE WEEK AHEAD · MODEL PROJECTIONS</span><strong>Upset watch and games with stakes</strong></header>
    <div className="weekly-preview-grid">{stories.slice(0,12).map(({game,home,away,homeApRank,awayApRank,upset,conference,playoff})=><article key={game.gameId}>
      <span>{[upset?"UPSET WATCH":null,conference?"CONFERENCE RACE":null,playoff?"PLAYOFF WATCH":null].filter(Boolean).join(" · ")||"MATCHUP TO WATCH"}</span>
      <h3>{game.awayTeam} vs. {game.homeTeam}</h3>
      <div className="weekly-result-pair">{([{team:game.awayTeam,score:game.predictedAwayScore,rank:away,apRank:awayApRank,color:game.awayColor,record:game.awayRecordBefore,conferenceRecord:game.awayConferenceRecordBefore,winChance:typeof game.homeWinProbability==="number"?1-game.homeWinProbability:null,stats:game.awayPredictedStats,success:game.awayPredictedAdvanced?.successRate},{team:game.homeTeam,score:game.predictedHomeScore,rank:home,apRank:homeApRank,color:game.homeColor,record:game.homeRecordBefore,conferenceRecord:game.homeConferenceRecordBefore,winChance:game.homeWinProbability,stats:game.homePredictedStats,success:game.homePredictedAdvanced?.successRate}]).map(row=>{
        const edge=topEdge(game,row.team),test=untested(game,row.team);
        return <span className="weekly-result-team weekly-preview-team" style={{"--team-color":row.color&&/^#[0-9a-f]{6}$/i.test(row.color)?row.color:"#344759"} as CSSProperties} key={row.team}>
        <span className="weekly-team-crest">{resolveTeamLogoAsset(row.team)?<img src={resolveTeamLogoAsset(row.team)!} alt=""/>:<b>{row.team.slice(0,2).toUpperCase()}</b>}</span>
        <span className="weekly-team-copy"><strong>{row.team}</strong><small>{row.apRank?`AP #${row.apRank} · `:""}{row.rank?`H+ #${row.rank.rank}`:"H+ NR"} · {row.record??"—"} OVERALL · {row.conferenceRecord??"—"} CONF</small></span>
        <b className="weekly-team-score">{typeof row.score==="number"?Math.round(row.score):"—"}</b>
        <span className="weekly-preview-highlights" aria-label="Projected team statistics">
          {typeof row.winChance==="number"&&Number.isFinite(row.winChance)?<span><small>WIN CHANCE</small><b>{Math.round(row.winChance*100)}%</b></span>:null}
          {rounded(row.stats?.passYards)!==null?<span><small>PASS YDS</small><b>{rounded(row.stats?.passYards)}</b></span>:null}
          {rounded(row.stats?.rushYards)!==null?<span><small>RUSH YDS</small><b>{rounded(row.stats?.rushYards)}</b></span>:null}
          {rounded(row.stats?.passAttempts)!==null?<span><small>PASS ATT</small><b>{rounded(row.stats?.passAttempts)}</b></span>:null}
          {rounded(row.stats?.rushAttempts)!==null?<span><small>RUSH ATT</small><b>{rounded(row.stats?.rushAttempts)}</b></span>:null}
          {typeof row.success==="number"&&Number.isFinite(row.success)?<span><small>ON SCHEDULE</small><b>{Math.round(row.success*100)}%</b></span>:null}
        </span>
        <span className="weekly-preview-read"><small>UNIT MATCHUP ADVANTAGE</small><b>{edge?`${edge.label} · ${edge.strength}`:"No clear unit edge"}</b>{edge?<em>{edge.matchup}</em>:null}</span>
        <span className="weekly-preview-read"><small>POTENTIALLY UNTESTED UNIT</small><b>{test?test.area:"None flagged"}</b>{test?<em>{test.priorOpponents?`0 of ${test.priorOpponents} comparable prior opponents tested it`:`No comparable completed games`}</em>:null}</span>
      </span>})}</div>
      <details className="weekly-defense-keys" open><summary>Saban defensive priorities · Both defenses</summary><div className="defense-keys-grid"><DefensiveKeysPanel defenseSnapshot={game.generatedFromWeek===undefined?undefined:{season:game.season,week:game.generatedFromWeek}} offenseSnapshot={game.generatedFromWeek===undefined?undefined:{season:game.season,week:game.generatedFromWeek}} compact analysis={game.edgeAnalysis?.defensiveKeys?.away} color={game.awayColor??undefined} pointsAllowed={game.predictedHomeScore}/><DefensiveKeysPanel defenseSnapshot={game.generatedFromWeek===undefined?undefined:{season:game.season,week:game.generatedFromWeek}} offenseSnapshot={game.generatedFromWeek===undefined?undefined:{season:game.season,week:game.generatedFromWeek}} compact analysis={game.edgeAnalysis?.defensiveKeys?.home} color={game.homeColor??undefined} pointsAllowed={game.predictedAwayScore}/></div></details>
      <button className="weekly-game-link" onClick={()=>onOpenGame(game)}>View game in Scores →</button>
    </article>)}</div>
    <DefensiveKeysMethod/>
    <p>Race implications use projected final ranks and conference membership. Changes in qualification probability are not calculated here.</p>
  </section>;
}
