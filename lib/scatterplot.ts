export type ScatterDomain = { min:number; max:number };
export type ScatterPair = { x:number; y:number };

const finite = (value:number) => Number.isFinite(value);

export function scatterDomain(values:readonly number[],padding=.08):ScatterDomain {
  const valid=values.filter(finite);
  if(!valid.length)return{min:0,max:1};
  const minimum=Math.min(...valid),maximum=Math.max(...valid);
  if(minimum===maximum){
    const spread=Math.max(Math.abs(minimum)*padding,minimum>=0&&minimum<=1?.05:1);
    return{min:minimum-spread,max:maximum+spread};
  }
  const spread=(maximum-minimum)*padding;
  return{min:minimum-spread,max:maximum+spread};
}

export function scatterTicks(domain:ScatterDomain,count=6) {
  const tickCount=Math.max(2,Math.trunc(count));
  return Array.from({length:tickCount},(_,index)=>domain.min+(domain.max-domain.min)*(index/(tickCount-1)));
}

export function scatterMean(values:readonly number[]) {
  const valid=values.filter(finite);
  return valid.length?valid.reduce((sum,value)=>sum+value,0)/valid.length:null;
}

export function scatterPosition(value:number,domain:ScatterDomain) {
  if(!finite(value)||domain.max===domain.min)return.5;
  return Math.max(0,Math.min(1,(value-domain.min)/(domain.max-domain.min)));
}

export function scatterRegression(points:readonly ScatterPair[]) {
  const valid=points.filter((point)=>finite(point.x)&&finite(point.y));
  if(valid.length<2)return null;
  const meanX=valid.reduce((sum,point)=>sum+point.x,0)/valid.length;
  const meanY=valid.reduce((sum,point)=>sum+point.y,0)/valid.length;
  const denominator=valid.reduce((sum,point)=>sum+(point.x-meanX)**2,0);
  if(denominator===0)return null;
  const slope=valid.reduce((sum,point)=>sum+(point.x-meanX)*(point.y-meanY),0)/denominator;
  return{slope,intercept:meanY-slope*meanX};
}
