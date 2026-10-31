export type Section="overview"|"performance"|"rankings"|"standings"|"conferences"|"matchup"|"whatif"|"all137"|"stats"|"visualize"|"playerstats"|"schedule"|"teams"|"directory"|"players"|"methodology"|"game"|"explore";
export const destinations:[Section,string][]=[["overview","Weekly Review"],["schedule","Scores"],["matchup","Matchup"],["directory","Team Directory"],["teams","Team Profile"],["rankings","Rankings"],["stats","Team & Player Stats"],["players","Player Ratings"],["whatif","Season & What If"],["standings","Standings"],["conferences","Conferences"],["all137","All137"],["visualize","Charts & Maps"],["performance","Model Performance"],["game","Down by Down"],["explore","Explore"]];
export const primaryNavigation:[Section,string][]=[["overview","This Week"],["matchup","Matchup"],["directory","Teams"],["whatif","Season"],["explore","Explore"]];
export const subNavigation:Record<string,[Section,string][]>= {
 overview:[["overview","Weekly Review"],["schedule","Scores"]],
 matchup:[],
 directory:[["directory","Directory"],["rankings","Rankings"],["stats","Statistics"],["players","Players"]],
 whatif:[["whatif","Outlook & What If"],["standings","Standings"],["conferences","Conferences"]],
 explore:[["explore","All tools"],["visualize","Charts & Maps"],["all137","All137"],["performance","Performance"],["game","Down by Down"]]
};
export function primaryFor(section:Section):Section{
 if(["overview","schedule"].includes(section))return "overview";
 if(["directory","teams","rankings","stats","players","playerstats"].includes(section))return "directory";
 if(["whatif","standings","conferences"].includes(section))return "whatif";
 return section==="matchup"?"matchup":"explore";
}
export function validSection(raw:string):raw is Section{return destinations.some(([id])=>id===raw)||raw==="playerstats"||raw==="methodology";}
export function parseSiteLocation(hash:string){const [raw,query=""]=hash.replace(/^#\/?/,"").split("?");const params=new URLSearchParams(query);const section=raw==="simulation"?"whatif":raw;const season=Number(params.get("season")),week=Number(params.get("week"));return {section:validSection(section)?section:"overview" as Section,season:params.has("season")&&Number.isInteger(season)&&season>=2014&&season<=new Date().getFullYear()+1?season:null,week:params.has("week")&&Number.isInteger(week)&&week>=0&&week<=16?week:null,team:params.get("team")};}
