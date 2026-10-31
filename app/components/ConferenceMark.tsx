"use client";
/* eslint-disable @next/next/no-img-element -- locally stored conference identity marks */
import { useState } from "react";
import { Select } from "radix-ui";

const conferenceAssets:Record<string,string>={
  "Independent":"fbs-independents","FBS Independents":"fbs-independents",
  "ACC":"acc","Big 12":"big-12","Big Ten":"big-ten","SEC":"sec","Pac-12":"pac-12",
  "Conference USA":"conference-usa","Mid-American":"mid-american","Mountain West":"mountain-west",
  "Sun Belt":"sun-belt","American Athletic":"american-athletic","American":"american-athletic",
  "American Athletic Conference":"american-athletic","Pac 12":"pac-12",
};
export function ConferenceMark({conference,compact=false}:{conference:string;compact?:boolean}){
  const [failed,setFailed]=useState<string|null>(null);
  const asset=conferenceAssets[conference];
  return <span className={`conference-mark${compact?" compact":""}`} title={conference}>
    {asset&&failed!==asset?<img src={`/conference-logos/${asset}.png`} alt={conference} width={64} height={48} onError={()=>setFailed(asset)}/>
      :<span className="conference-mark-fallback" aria-label={conference}>{/independent/i.test(conference)?"IND":conference}</span>}
  </span>;
}
export function ConferenceLogoSelect({label,value,choices,onChange}:{label:string;value:string;choices:readonly string[];onChange:(conference:string)=>void}){
  return <div className="conference-logo-field"><span>{label}</span><Select.Root value={value} onValueChange={onChange}>
    <Select.Trigger className="conference-logo-trigger" aria-label={`${label}: ${value}`} title={value}><Select.Value><ConferenceMark conference={value}/></Select.Value><Select.Icon aria-hidden="true">▾</Select.Icon></Select.Trigger>
    <Select.Portal><Select.Content className="conference-logo-menu" position="popper" sideOffset={5}><Select.Viewport>{choices.map(conference=><Select.Item key={conference} value={conference} textValue={conference} className="conference-logo-option" aria-label={conference}>
      <ConferenceMark conference={conference}/><Select.ItemText><span className="conference-visually-hidden">{conference}</span></Select.ItemText>
    </Select.Item>)}</Select.Viewport></Select.Content></Select.Portal>
  </Select.Root></div>;
}
