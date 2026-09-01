import type { FormationId, PlayArtId } from "./tacticalPlan";

export type DiagramPlayer = {
  x: number;
  y: number;
  role: string;
};

export type DiagramPathKind = "primary" | "route" | "ball" | "block" | "action";

export type DiagramPath = {
  d: string;
  kind: DiagramPathKind;
};

export type PlayDiagram = {
  paths: DiagramPath[];
  read?: { x:number; y:number; label:string };
};

const offensiveLine = [
  { x:29,y:67,role:"LT" },
  { x:39.5,y:67,role:"LG" },
  { x:50,y:67,role:"C" },
  { x:60.5,y:67,role:"RG" },
  { x:71,y:67,role:"RT" },
] as const;

/**
 * Every formation is drawn from the offense's perspective, attacking toward
 * the top of the field. Players on the line sit at y=67 and the line of
 * scrimmage is y=61.5, leaving a readable neutral zone on narrow screens.
 */
export const offenseFormations:Record<FormationId,readonly DiagramPlayer[]> = {
  "air-raid":[
    {x:7,y:67,role:"X"},{x:21,y:72,role:"H"},...offensiveLine,{x:79,y:72,role:"Y"},{x:93,y:67,role:"Z"},
    {x:50,y:80,role:"QB"},{x:63,y:89,role:"RB"},
  ],
  spread:[
    {x:7,y:67,role:"X"},{x:21,y:72,role:"H"},...offensiveLine,{x:81,y:67,role:"TE"},{x:93,y:67,role:"Z"},
    {x:50,y:80,role:"QB"},{x:63,y:89,role:"RB"},
  ],
  multiple:[
    {x:7,y:67,role:"X"},{x:21,y:72,role:"F"},...offensiveLine,{x:81,y:67,role:"Y"},{x:93,y:67,role:"Z"},
    {x:50,y:79,role:"QB"},{x:50,y:90,role:"RB"},
  ],
  "i-form":[
    {x:7,y:67,role:"X"},...offensiveLine,{x:81,y:67,role:"TE"},{x:93,y:67,role:"Z"},
    {x:50,y:77,role:"QB"},{x:50,y:85,role:"FB"},{x:50,y:93,role:"TB"},
  ],
  flexbone:[
    {x:7,y:67,role:"X"},...offensiveLine,{x:93,y:67,role:"Z"},{x:50,y:77,role:"QB"},
    {x:50,y:91,role:"B"},{x:27,y:84,role:"LA"},{x:73,y:84,role:"RA"},
  ],
};

const nickel425:readonly DiagramPlayer[] = [
  {x:7,y:21,role:"CB"},{x:34,y:18,role:"S"},{x:65,y:18,role:"FS"},{x:93,y:21,role:"CB"},
  {x:22,y:39,role:"NB"},{x:42,y:43,role:"W"},{x:59,y:43,role:"M"},
  {x:31,y:56,role:"DE"},{x:43.5,y:56,role:"DT"},{x:56.5,y:56,role:"NT"},{x:69,y:56,role:"DE"},
];

const multiple425:readonly DiagramPlayer[] = [
  {x:7,y:21,role:"CB"},{x:35,y:18,role:"S"},{x:65,y:18,role:"FS"},{x:93,y:21,role:"CB"},
  {x:76,y:39,role:"STAR"},{x:42,y:43,role:"W"},{x:58,y:43,role:"M"},
  {x:31,y:56,role:"DE"},{x:43.5,y:56,role:"DT"},{x:56.5,y:56,role:"NT"},{x:69,y:56,role:"DE"},
];

const eightManFit:readonly DiagramPlayer[] = [
  {x:7,y:21,role:"CB"},{x:50,y:18,role:"FS"},{x:93,y:21,role:"CB"},
  {x:24,y:42,role:"S"},{x:40,y:43,role:"W"},{x:59,y:43,role:"M"},{x:76,y:42,role:"SS"},
  {x:31,y:56,role:"DE"},{x:43.5,y:56,role:"DT"},{x:56.5,y:56,role:"NT"},{x:69,y:56,role:"DE"},
];

const optionFit:readonly DiagramPlayer[] = [
  {x:7,y:21,role:"CB"},{x:50,y:18,role:"FS"},{x:93,y:21,role:"CB"},
  {x:20,y:42,role:"OLB"},{x:40,y:43,role:"W"},{x:60,y:43,role:"M"},{x:80,y:42,role:"OLB"},
  {x:32,y:56,role:"DE"},{x:44,y:56,role:"DT"},{x:56,y:56,role:"NT"},{x:68,y:56,role:"DE"},
];

export const defenseFormations:Record<FormationId,readonly DiagramPlayer[]> = {
  "air-raid":nickel425,
  spread:nickel425,
  multiple:multiple425,
  "i-form":eightManFit,
  flexbone:optionFit,
};

function player(formation:FormationId,...roles:string[]) {
  for (const role of roles) {
    const match = offenseFormations[formation].find((row)=>row.role===role);
    if (match) return match;
  }
  throw new Error(`Missing ${roles.join("/")} in ${formation}`);
}

function protection(formation:FormationId):DiagramPath[] {
  return offenseFormations[formation]
    .filter((row)=>["LT","LG","C","RG","RT"].includes(row.role))
    .map((row,index)=>({
      d:`M${row.x} ${row.y-1} Q${row.x+(index-2)*0.9} 61 ${row.x+(index-2)*1.5} 56`,
      kind:"block" as const,
    }));
}

function passEligible(formation:FormationId) {
  return {
    x:player(formation,"X"),
    z:player(formation,"Z"),
    left:player(formation,"H","F","LA","X"),
    right:player(formation,"Y","TE","RA","Z"),
    back:player(formation,"RB","TB","B","FB"),
    qb:player(formation,"QB"),
  };
}

function ballCarrier(formation:FormationId) {
  return player(formation,"TB","RB","B","FB");
}

export function buildPlayDiagram(formation:FormationId,play:PlayArtId):PlayDiagram {
  const eligible = passEligible(formation);
  const line = protection(formation);

  if (play === "vertical") {
    return { paths:[
      {d:`M${eligible.x.x} ${eligible.x.y} C${eligible.x.x} 49 ${eligible.x.x+1} 26 ${eligible.x.x+5} 7`,kind:"primary"},
      {d:`M${eligible.left.x} ${eligible.left.y} C${eligible.left.x+1} 51 37 26 44 8`,kind:"route"},
      {d:`M${eligible.right.x} ${eligible.right.y} C${eligible.right.x-1} 51 63 26 56 8`,kind:"route"},
      {d:`M${eligible.z.x} ${eligible.z.y} C${eligible.z.x} 48 ${eligible.z.x-1} 25 ${eligible.z.x-5} 7`,kind:"route"},
      {d:`M${eligible.back.x} ${eligible.back.y} C72 85 82 78 91 70`,kind:"route"},
      ...line,
    ] };
  }

  if (play === "mesh") {
    return { paths:[
      {d:`M${eligible.left.x} ${eligible.left.y} C31 63 48 51 82 47`,kind:"primary"},
      {d:`M${eligible.right.x} ${eligible.right.y} C68 63 51 52 18 47`,kind:"route"},
      {d:`M${eligible.x.x} ${eligible.x.y} C9 47 24 26 39 12`,kind:"route"},
      {d:`M${eligible.z.x} ${eligible.z.y} C${eligible.z.x} 48 91 26 87 9`,kind:"route"},
      {d:`M${eligible.back.x} ${eligible.back.y} C74 85 84 80 93 73`,kind:"route"},
      ...line,
    ] };
  }

  if (play === "play-action") {
    const runBack = ballCarrier(formation);
    return { paths:[
      {d:`M${eligible.x.x} ${eligible.x.y} C18 50 34 29 51 9`,kind:"primary"},
      {d:`M${eligible.z.x} ${eligible.z.y} C80 58 64 45 37 36`,kind:"route"},
      {d:`M${eligible.right.x} ${eligible.right.y} C78 52 82 34 86 17`,kind:"route"},
      {d:`M${eligible.qb.x} ${eligible.qb.y} Q${runBack.x} ${runBack.y-1} ${runBack.x} ${runBack.y-7}`,kind:"action"},
      ...line,
    ] };
  }

  if (play === "inside-run") {
    const back = ballCarrier(formation);
    const lead = offenseFormations[formation].find((row)=>row.role==="FB");
    return { paths:[
      {d:`M${back.x} ${back.y} C${back.x} ${back.y-9} 52 69 53 55`,kind:"primary"},
      {d:`M${eligible.qb.x} ${eligible.qb.y} Q${back.x} ${back.y-3} ${back.x} ${back.y-8}`,kind:"action"},
      ...(lead?[{d:`M${lead.x} ${lead.y} C${lead.x} 74 54 64 55 56`,kind:"ball" as const}]:[]),
      ...line,
    ] };
  }

  if (play === "edge-run") {
    const back = ballCarrier(formation);
    const lg = player(formation,"LG");
    const rt = player(formation,"RT");
    const edgeBlocker = player(formation,"TE","Y","RA","Z");
    return { paths:[
      {d:`M${back.x} ${back.y} C${back.x+10} ${back.y-7} 75 72 90 56`,kind:"primary"},
      {d:`M${eligible.qb.x} ${eligible.qb.y} Q${back.x} ${back.y-3} ${back.x+4} ${back.y-8}`,kind:"action"},
      {d:`M${lg.x} ${lg.y} C49 71 65 69 78 58`,kind:"block"},
      {d:`M${rt.x} ${rt.y} Q72 63 76 57`,kind:"block"},
      {d:`M${edgeBlocker.x} ${edgeBlocker.y} Q82 62 87 55`,kind:"block"},
    ] };
  }

  const bBack = player(formation,"B","FB","RB");
  const rightBack = player(formation,"RA","RB","TB");
  return {
    paths:[
      {d:`M${eligible.qb.x} ${eligible.qb.y} C59 73 70 65 84 56`,kind:"primary"},
      {d:`M${bBack.x} ${bBack.y} C${bBack.x} 78 50 67 50 55`,kind:"ball"},
      {d:`M${rightBack.x} ${rightBack.y} C81 79 89 68 96 58`,kind:"action"},
      ...line,
    ],
    read:{x:68,y:56,label:"READ"},
  };
}
