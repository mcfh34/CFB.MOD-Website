export type GameMarketSummaryInput={
  completed:boolean|number;
  homePoints:number|null;
  awayPoints:number|null;
  modelHomeSpread:number|null;
  modelTotal:number|null;
  vegasSpread:number|null;
  vegasTotal:number|null;
  spreadQualified?:boolean;
  spreadResult?:string|null;
  spreadRecommendation?:string|null;
};

export type GameMarketRead={
  label:string;
  tone:"positive"|"negative"|"neutral";
};

const finite=(value:number|null|undefined):value is number=>typeof value==="number"&&Number.isFinite(value);
const sign=(value:number)=>Math.abs(value)<1e-9?0:value>0?1:-1;

function directionalRead(completed:boolean,predictedEdge:number|null,actualEdge:number|null):GameMarketRead{
  if(predictedEdge===null)return{label:"NO LINE",tone:"neutral"};
  if(!completed)return{label:"PENDING",tone:"neutral"};
  if(actualEdge===null)return{label:"NOT GRADED",tone:"neutral"};
  if(sign(predictedEdge)===0)return{label:"NO EDGE",tone:"neutral"};
  if(sign(actualEdge)===0)return{label:"PUSH",tone:"neutral"};
  return sign(predictedEdge)===sign(actualEdge)
    ?{label:"ACCURATE",tone:"positive"}
    :{label:"MISSED",tone:"negative"};
}

export function modelSpreadRead(input:GameMarketSummaryInput):GameMarketRead{
  const predictedEdge=finite(input.vegasSpread)&&finite(input.modelHomeSpread)
    ?input.vegasSpread-input.modelHomeSpread
    :null;
  const actualEdge=finite(input.vegasSpread)&&finite(input.homePoints)&&finite(input.awayPoints)
    ?input.homePoints-input.awayPoints+input.vegasSpread
    :null;
  return directionalRead(Boolean(input.completed),predictedEdge,actualEdge);
}

export function modelTotalRead(input:GameMarketSummaryInput):GameMarketRead{
  const predictedEdge=finite(input.vegasTotal)&&finite(input.modelTotal)
    ?input.modelTotal-input.vegasTotal
    :null;
  const actualEdge=finite(input.vegasTotal)&&finite(input.homePoints)&&finite(input.awayPoints)
    ?input.homePoints+input.awayPoints-input.vegasTotal
    :null;
  return directionalRead(Boolean(input.completed),predictedEdge,actualEdge);
}

export function officialAtsSetRead(input:GameMarketSummaryInput):GameMarketRead{
  if(!finite(input.vegasSpread))return{label:"NO LINE",tone:"neutral"};
  if(!input.spreadQualified){
    return input.spreadRecommendation==="LINE QUARANTINED"
      ?{label:"NOT ELIGIBLE",tone:"neutral"}
      :{label:"NOT INCLUDED",tone:"neutral"};
  }
  if(!input.completed)return{label:"INCLUDED",tone:"positive"};
  if(input.spreadResult==="W")return{label:"INCLUDED · WIN",tone:"positive"};
  if(input.spreadResult==="L")return{label:"INCLUDED · LOSS",tone:"negative"};
  if(input.spreadResult==="PUSH")return{label:"INCLUDED · PUSH",tone:"neutral"};
  return{label:"INCLUDED",tone:"positive"};
}
