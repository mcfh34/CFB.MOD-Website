"""Prepare a reviewed, fixed weekly recovery snapshot from published ESPN/SDV data.
Usage: python scripts/data/prepare-reviewed-week.py /tmp 8 week8-current.json
Reads the site's week7-before.json and four downloaded 2026 parquet datasets.
This does not write to production; normal refresh authorization still applies.
"""
import json,sys,pathlib,datetime,hashlib
import pyarrow.parquet as pq
root=pathlib.Path(sys.argv[1]); season=2026; week=int(sys.argv[2]) if len(sys.argv)>2 else 7
input_name=sys.argv[3] if len(sys.argv)>3 else 'week7-before.json'
retrieved=datetime.date.today().isoformat()
load=lambda name:pq.read_table(root/name).to_pandas()
expected=json.loads((root/input_name).read_text())['rows']
schedule=load('current-schedule.parquet');teams=load('current-teams.parquet');boxes=load('current-team-box.parquet')
plays=pq.read_table(root/'current-pbp.parquet',columns=['id','game_id','pos_team_id','sack','yds_sacked','statYardage','text','penalty_no_play','penalty_negated_play','status_type_completed','homeFinalScore','awayFinalScore']).to_pandas()
team_names={str(int(r.team_id)):r.school for _,r in teams.iterrows()}
games={str(r.game_id):r for _,r in schedule.iterrows()}
output=[]
for stored in expected:
    r=games[stored['gameId']]
    assert r.completed and r.season==season and r.week==week
    assert datetime.datetime.fromisoformat(str(r.start_date).replace('Z','+00:00'))<datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(hours=8)
    assert abs((datetime.datetime.fromisoformat(str(r.start_date).replace('Z','+00:00'))-datetime.datetime.fromisoformat(stored['startDate'].replace('Z','+00:00'))).total_seconds())<=36*3600
    gp=plays[plays.game_id==r.game_id].drop_duplicates('id')
    assert len(gp)>50 and gp.status_type_completed.all()
    assert set(gp.homeFinalScore.dropna())=={r.home_points} and set(gp.awayFinalScore.dropna())=={r.away_points}
    game={'id':stored['gameId'],'season':season,'week':week,'startDate':datetime.datetime.fromisoformat(str(r.start_date).replace('Z','+00:00')).isoformat(),'homeTeam':stored['homeTeam'],'awayTeam':stored['awayTeam'],'homePoints':int(r.home_points),'awayPoints':int(r.away_points),'teams':[],'sackPlays':[]}
    for side in ['home','away']:
        team_id=int(r[side+'_id']);name=team_names[str(team_id)]
        assert name==stored[side+'Team']
        matches=boxes[(boxes.game_id==r.game_id)&(boxes.team_id==team_id)&(boxes.home_away==side)]
        assert len(matches)==1
        box=matches.iloc[0]
        assert int(box.totalYards)==int(box.netPassingYards)+int(box.rushingYards)
        comp,att=map(int,box.completionAttempts.split('/'));assert 0<=comp<=att
        fields=['totalYards','netPassingYards','completionAttempts','rushingYards','rushingAttempts','turnovers']
        game['teams'].append({'school':name,'homeAway':side,'points':game[side+'Points'],'stats':[{'category':key,'stat':str(box[key])} for key in fields]})
        sacks=gp[(gp.pos_team_id==team_id)&(gp.sack==True)&(gp.penalty_no_play!=True)&(gp.penalty_negated_play!=True)]
        for _,p in sacks.iterrows():
            yard=p.yds_sacked if p.yds_sacked==p.yds_sacked else p.statYardage
            assert yard==yard
            game['sackPlays'].append({'gameId':stored['gameId'],'offense':name,'playType':'Sack','playText':p.text,'yardsGained':float(yard)})
    output.append(game)
assert len(output)==len(expected)>0 and len({g['id'] for g in output})==len(expected)
files={'schedule':'current-schedule.parquet','teamBox':'current-team-box.parquet','playByPlay':'current-pbp.parquet'}
base='https://github.com/sportsdataverse/sportsdataverse-data/releases/download/'
manifest={'id':f'espn-sdv-{season}-week-{week}-'+retrieved.replace('-',''),'season':season,'week':week,'source':'ESPN via SportsDataverse','retrievedAt':retrieved,'sources':[base+'cfb_schedules/cfb_schedules_2026.parquet',base+'espn_cfb_team_box/team_box_2026.parquet',base+'espn_cfb_pbp/play_by_play_2026.parquet'],'sha256':{k:hashlib.sha256((root/v).read_bytes()).hexdigest() for k,v in files.items()},'games':output}
path=pathlib.Path(f'lib/data/reviewed-week-{season}-{week}.json');path.write_text(json.dumps(manifest,separators=(',',':'))+'\n')
print(f'Validated {len(output)} finals, {sum(len(g["teams"]) for g in output)} box scores, {sum(len(g["sackPlays"]) for g in output)} sack plays; wrote {path}')
