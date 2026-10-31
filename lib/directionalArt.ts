import {directionalMatchup,rushingRelativeMatchup,runLanes,type DirectionalProfile} from './rushingMatchup';
import {passingDirectionalMatchup,type PassingDirectionalProfile} from './passingMatchup';
import {passLocations} from './passing';
export type ArtZone={id:string;label:string;off:number|null;def:number|null;offSamples:number;defSamples:number;usage:number|null;edge:number|null;offRelative?:number|null;defRelative?:number|null;offCompared?:number;defCompared?:number;tone:'attack'|'defense'|'even'|'untested'};
const tone=(edge:number|null):ArtZone['tone']=>edge===null?'untested':edge>5?'attack':edge< -5?'defense':'even';
export function directionalArt(offRush?:DirectionalProfile|null,defRush?:DirectionalProfile|null,offPass?:PassingDirectionalProfile|null,defPass?:PassingDirectionalProfile|null){
 const rush=directionalMatchup(offRush,defRush),rushDisplay=rushingRelativeMatchup(offRush,defRush),pass=passingDirectionalMatchup(offPass,defPass);
 const rushing:ArtZone[]=runLanes.map(id=>{const lane=rushDisplay.lanes.find(l=>l.lane===id),o=offRush?.offense[id],d=defRush?.defense[id],edge=lane?.edgePercent??null;return {id,label:id,off:o?.ypc??null,def:d?.ypc??null,offSamples:o?.carries??0,defSamples:d?.carries??0,usage:lane?.share??null,edge,offRelative:lane?.offRelative??null,defRelative:lane?.defRelative??null,offCompared:o?.comparedOwnCarries??0,defCompared:d?.comparedOwnCarries??0,tone:tone(edge)};});
 const passing:ArtZone[]=passLocations.map(id=>{const lane=pass.lanes.find(l=>l.lane===id),o=offPass?.offense[id],d=defPass?.defense[id],edge=lane?.tested?lane.edgePercent:null;return {id,label:id,off:o?.ypa??null,def:d?.ypa??null,offSamples:o?.attempts??0,defSamples:d?.attempts??0,usage:lane?.share??null,edge,offRelative:lane?.offRelative??null,defRelative:lane?.defRelative??null,offCompared:o?.comparedOwnAttempts??0,defCompared:d?.comparedOwnAttempts??0,tone:tone(edge)};});
 return {rushing,passing,rushCoverage:[rush.offCoverage,rush.defCoverage],passCoverage:[pass.offCoverage,pass.defCoverage]};
}
