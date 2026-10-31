import { resolveTeamLogoAsset } from "./teamLogoAssets";
import { GRAPH_BRAND_PNG } from "./graphBrandLogo";
import { NET_GAME_METRICS, netBarColor, netGraphStep, type NetGameMetric, type NetSuccessRow } from "./netSuccessRate";
export type GraphPdfInput={rows:readonly NetSuccessRow[];metricKey:NetGameMetric;title:string;subtitle:string;xAxisLabel?:string;seasonAverage?:boolean};
export type PdfLogo={bytes:Uint8Array;type:"png"|"jpg"};
/** Draw the graph directly into PDF: no SVG serialization, canvas snapshot or tainted canvas. */
export async function buildGraphPdf(input:GraphPdfInput,logos:ReadonlyMap<string,PdfLogo>=new Map()){
  const {PDFDocument,StandardFonts,rgb,degrees}=await import("pdf-lib");
  const pdf=await PDFDocument.create(),page=pdf.addPage([1000,620]);
  pdf.setTitle(`Harper+ ${input.title}`);pdf.setSubject(input.subtitle);pdf.setCreator("Harper+ College Football Model");
  const regular=await pdf.embedFont(StandardFonts.Courier),bold=await pdf.embedFont(StandardFonts.CourierBold);
  const ink=rgb(.15,.19,.24),grid=rgb(.84,.87,.9);
  const ascii=(text:string)=>text.replace(/[–−]/g,"-").replace(/·/g," | ").replace(/[^\x20-\x7e]/g,"");
  const text=(value:string,x:number,y:number,size=10,center=false,strong=false)=>{value=ascii(value);const font=strong?bold:regular;page.drawText(value,{x:center?x-font.widthOfTextAtSize(value,size)/2:x,y,size,font,color:ink});};
  const embedded=new Map<string,Awaited<ReturnType<typeof pdf.embedPng>>>();
  embedded.set("brand",await pdf.embedPng(GRAPH_BRAND_PNG));
  for(const [url,logo] of logos){try{embedded.set(url,await (logo.type==="png"?pdf.embedPng(logo.bytes):pdf.embedJpg(logo.bytes)));}catch{/* A text identity remains available below. */}}
  const mark=(url:string|null,name:string,x:number,y:number,size:number)=>{const image=url?embedded.get(url):null;if(image){const dims=image.scaleToFit(size,size);page.drawImage(image,{x:x-dims.width/2,y:y-dims.height/2,width:dims.width,height:dims.height});}else{text(name.slice(0,3),x,y-3,Math.min(9,size/2),true,true);}};
  mark("brand","H+",47,578,62);text(input.title.toUpperCase(),500,587,Math.min(18,850/(input.title.length*.6)),true,true);text(input.subtitle,500,568,9,true);text(input.seasonAverage?"Team game average minus opponent game average | FBS vs FBS":"Winner minus opponent | Bars: endpoint team color | FBS vs FBS",500,550,9,true);
  const metric=NET_GAME_METRICS.find(item=>item.key===input.metricKey)!,factor=metric.format==="rate"?100:1;
  const values=input.rows.map(row=>row.netSuccessRate*factor);
  const low=Math.min(...values,0),high=Math.max(...values,0)||(low===0?1:0);
  const y=(value:number)=>143+(value-low)/(high-low)*334;
  const tick=netGraphStep(high-low,9);
  for(let value=Math.ceil(low/tick)*tick;value<=high+tick*.01;value+=tick){page.drawLine({start:{x:65,y:y(value)},end:{x:980,y:y(value)},thickness:Math.abs(value)<tick*.01?1.2:.5,color:Math.abs(value)<tick*.01?ink:grid});text(value.toFixed(1),30,y(value)-3,10);}
  const slot=915/Math.max(input.rows.length,1),size=Math.min(26,slot*.85);
  const valueLabelEvery=Math.max(1,Math.ceil(40/slot));
  input.rows.forEach((row,index)=>{const x=65+slot*(index+.5),value=row.netSuccessRate*factor,end=y(value),zero=y(0),bar=Math.min(24,slot*.7);
    page.drawRectangle({x:x-bar/2,y:Math.min(end,zero),width:bar,height:Math.max(1,Math.abs(end-zero)),color:rgb(...([1,3,5].map(start=>parseInt(netBarColor(row).slice(start,start+2),16)/255) as [number,number,number]))});
    const winnerY=value>=0?end+size/2+4:end-size/2-4,loserY=value>=0?zero-size/2-5:zero+size/2+4;
    mark(row.winnerLogo,row.winner,x,winnerY,size);if(!input.seasonAverage)mark(row.loserLogo,row.loser,x,loserY,size);
    if(index%valueLabelEvery===0)text(`${value>0?"+":""}${value.toFixed(1)}`,x,value>=0?winnerY+size/2+5:winnerY-size/2-10,Math.min(9,Math.max(6,slot/3)),true,true);
    const caption=input.seasonAverage?row.winner:`${row.winnerPoints}-${row.loserPoints}`;
    if(slot>=16)text(caption,x,77,Math.min(9,slot/4),true);
    else page.drawText(ascii(input.seasonAverage?row.winner.slice(0,3):caption),{x:x-3,y:80,size:6,font:regular,color:ink,rotate:degrees(55)});
  });
  const verticalLabel=ascii(`NET ${metric.label.toUpperCase()} (${metric.format==="rate"?"PERCENTAGE POINTS":"STAT UNITS"})`);
  const verticalSize=Math.min(10,330/(verticalLabel.length*.6));
  page.drawText(verticalLabel,{x:13,y:310-bold.widthOfTextAtSize(verticalLabel,verticalSize)/2,size:verticalSize,font:bold,color:ink,rotate:degrees(90)});
  const axisLabel=input.xAxisLabel??"Games in selected order";
  text(axisLabel,500,45,Math.min(11,900/(axisLabel.length*.6)),true,true);
  text(input.metricKey==="epaSuccessRate"?"CFBD PPA > 0 | Garbage time included | Final scores: winner first":"CFBD | Garbage time excluded | Final scores: winner first | Missing stats excluded",500,25,9,true);
  return pdf.save();
}
export async function exportGraphPdf(input:GraphPdfInput,filename:string){
  const urls=[...new Set(input.rows.flatMap(row=>[row.winnerLogo,row.loserLogo]).filter((url):url is string=>Boolean(url)))];
  const logos=new Map<string,PdfLogo>();
  const localSources=new Map(input.rows.flatMap(row=>[[row.winnerLogo,resolveTeamLogoAsset(row.winner)],[row.loserLogo,resolveTeamLogoAsset(row.loser)]]).filter(([url,asset])=>url&&asset).map(([url,asset])=>[url!,asset!.replace("/team-logos/","/pdf-team-logos/").replace(/\.webp$/, ".png")]));
  await Promise.all(urls.map(async url=>{try{
    const source=localSources.get(url)??(url.startsWith("https://")?`/api/graph-logo?url=${encodeURIComponent(url)}`:url);
    const response=await fetch(source,{signal:AbortSignal.timeout(15000)});if(!response.ok)return;
    const bytes=new Uint8Array(await response.arrayBuffer());
    const type=bytes[0]===137&&bytes[1]===80?"png":bytes[0]===255&&bytes[1]===216?"jpg":null;
    if(type)logos.set(url==="/apple-touch-icon.png"?"brand":url,{bytes,type});
    else{
      // Decode WebP/SVG into PNG using an embedded image, without cross-origin canvas access.
      const dataUrl=URL.createObjectURL(new Blob([bytes],{type:response.headers.get("content-type")??"image/webp"}));
      try{const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("Logo decode failed"));image.src=dataUrl;});
        const canvas=document.createElement("canvas");canvas.width=128;canvas.height=128;const context=canvas.getContext("2d");if(!context)return;
        const scale=Math.min(128/image.width,128/image.height);context.drawImage(image,(128-image.width*scale)/2,(128-image.height*scale)/2,image.width*scale,image.height*scale);
        const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png"));if(blob)logos.set(url,{bytes:new Uint8Array(await blob.arrayBuffer()),type:"png"});
      }finally{URL.revokeObjectURL(dataUrl);}
    }
  }catch{/* Unavailable logos use team abbreviations, preserving each team's identity. */}}));
  const bytes=await buildGraphPdf(input,logos);
  const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:"application/pdf"}));
  const anchor=document.createElement("a");anchor.href=url;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30000);
}
