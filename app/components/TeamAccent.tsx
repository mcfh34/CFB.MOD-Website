import type {CSSProperties, ReactNode} from "react";
import {teams} from "../modelData";

const defaultColors=new Map(teams.map(team=>[team.name,team.color]));

export function teamIdentityStyle(name:string,color?:string|null):CSSProperties {
  const candidate=(color??defaultColors.get(name)??"").trim().replace(/^#/,"");
  const accent=/^[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(candidate)?`#${candidate}`:"#687a85";
  const hex=accent.slice(1);
  const full=hex.length===3?hex.split("").map(c=>c+c).join(""):hex;
  const channels=[0,2,4].map(i=>parseInt(full.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  const luminance=.2126*channels[0]+.7152*channels[1]+.0722*channels[2];
  const ink=luminance>.179?"#000000":"#ffffff";
  return {"--team-accent":accent,"--team-ink":ink} as CSSProperties;
}

export function TeamAccent({name,color,children}:{name:string;color?:string|null;children?:ReactNode}){
  return <span className="team-accent" style={teamIdentityStyle(name,color)}>{children??name}</span>;
}
