export type BetRecord = {wins:number;losses:number;pushes:number};

// Illustrative flat $100 risk per graded pick at -110. A push returns the stake.
export function flatStakeReturn(record:BetRecord) {
  const bets=record.wins+record.losses+record.pushes;
  const net=record.wins*(10000/110)-record.losses*100;
  const hitRate=record.wins+record.losses>0?record.wins/(record.wins+record.losses):null;
  const tone=hitRate===null?"ungraded":net>0?"profitable":hitRate>=.5?"near":"poor";
  return {bets,net,hitRate,tone};
}
