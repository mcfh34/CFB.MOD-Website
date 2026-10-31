import {readFile,writeFile} from 'node:fs/promises';
import {deriveViabilityCalibration,type ViabilityCalibrationObservation} from '../lib/offensiveViability';
const observations:ViabilityCalibrationObservation[]=[];
for(const season of [2021,2022,2023,2024]){
 const rows=JSON.parse(await readFile(`/workspace/scratch/fd5945e15a5d/model-audit-cache/${season}-advanced.json`,'utf8')).rows;
 for(const r of rows)for(const side of ['home','away']){const a=r[`${side}ActualAdvanced`];if(!r.completed||!a||a.pointsPerDrive==null||a.playsPerDrive==null)continue;
 const stats=r[`${side}ActualStats`],plays=stats?.passAttempts!=null&&stats?.rushAttempts!=null?stats.passAttempts+stats.rushAttempts:null;
 if(plays==null||plays/a.playsPerDrive<4)continue;
 const values={"overall-success":a.successRate,"rush-success":a.rushingSuccessRate,"pass-success":a.passingSuccessRate,"standard-down":a.standardDownSuccessRate,"passing-down":a.passingDownSuccessRate,havoc:a.havocRate};
 observations.push({pointsPerDrive:a.pointsPerDrive,values:Object.fromEntries(Object.entries(values).filter(([,v])=>v!=null))});}
}
if(observations.length<240)throw Error('Insufficient training calibration samples');
const calibration=deriveViabilityCalibration(observations);
await writeFile('lib/frozenViabilityCalibration.ts',`import type {ViabilityCalibrationMap} from './offensiveViability';\n/** Frozen 2021–2024 team-game observations (${observations.length}); 2025 remains excluded. */\nexport const frozenViabilityCalibration:ViabilityCalibrationMap=${JSON.stringify(calibration,null,2)};\n`);
console.log('Calibration training observations',observations.length);
