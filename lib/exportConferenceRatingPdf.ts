import {conferenceRatingLayout,type ConferenceRatingSeries} from "./conferenceRatingChart";
import {conferenceStrengthLogo} from "./conferenceStrengthChart";
import {GRAPH_BRAND_PNG} from "./graphBrandLogo";
import type {PdfLogo} from "./exportGraphPdf";
export async function buildConferenceRatingPdf(series:readonly ConferenceRatingSeries[],subtitle:string,logos:ReadonlyMap<string,PdfLogo>=new Map(),includeAdjustment=false,view:"ranked"|"strength"="ranked"){
 if(view==="strength"){const {buildConferenceStrengthPdf}=await import("./exportConferenceStrengthPdf");return buildConferenceStrengthPdf(series,subtitle,logos);}
 const {PDFDocument,StandardFonts,rgb,degrees}=await import("pdf-lib");
 const pdf=await PDFDocument.create(),page=pdf.addPage([1100,740]),layout=conferenceRatingLayout(series);
 pdf.setTitle("Harper+ Conference Rating Comparison");pdf.setSubject(subtitle);
 const regular=await pdf.embedFont(StandardFonts.Courier),bold=await pdf.embedFont(StandardFonts.CourierBold),ink=rgb(.1,.14,.17),grid=rgb(.85,.88,.86);
 const ascii=(value:string)=>value.replace(/·/g," | ").replace(/[–−]/g,"-").replace(/[^\x20-\x7e]/g,"");
 const text=(value:string,x:number,y:number,size=12,center=false,strong=false)=>{value=ascii(value);const font=strong?bold:regular;page.drawText(value,{x:center?x-font.widthOfTextAtSize(value,size)/2:x,y:740-y-size/2,size,font,color:ink});};
 const color=(hex:string)=>rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
 const line=(x1:number,y1:number,x2:number,y2:number,c=grid,width=1)=>page.drawLine({start:{x:x1,y:740-y1},end:{x:x2,y:740-y2},color:c,thickness:width});
 const brand=await pdf.embedPng(GRAPH_BRAND_PNG);page.drawImage(brand,{x:24,y:666,width:66,height:48});
 text("Conference Rating Comparison",550,42,26,true,true);text(subtitle,550,68,12,true);
 for(let value=layout.low;value<=layout.high;value+=5){line(layout.left,layout.y(value),layout.right,layout.y(value),value===0?ink:grid,value===0?1.2:.6);text(String(value),layout.left-26,layout.y(value),12,true);}
 for(let rank=1;rank<=layout.maxRank;rank++){line(layout.x(rank),layout.top,layout.x(rank),layout.bottom,grid,.4);text(String(rank),layout.x(rank),590,12,true);}
 for(const s of series){for(let i=1;i<s.teams.length;i++)line(layout.x(i),layout.y(s.teams[i-1].rating),layout.x(i+1),layout.y(s.teams[i].rating),color(s.color),2.5);}
 const embedded=new Map<string,Awaited<ReturnType<typeof pdf.embedPng>>>();
 for(const [url,logo] of logos)embedded.set(url,await (logo.type==="png"?pdf.embedPng(logo.bytes):pdf.embedJpg(logo.bytes)));
 for(const p of layout.points){page.drawCircle({x:p.x,y:740-p.y,size:3,color:color(p.color)});const image=p.logo?embedded.get(p.logo):null;if(image){const d=image.scaleToFit(30,30);page.drawImage(image,{x:p.logoX-d.width/2,y:740-p.logoY-d.height/2,width:d.width,height:d.height});}else text(p.team.slice(0,3),p.logoX,p.logoY,9,true,true);}
 text("Rank Within Conference",550,620,17,true,true);
 page.drawText("H+ Power Rating (points)",{x:25,y:290,size:17,font:bold,color:ink,rotate:degrees(90)});
 text(`Average neutral margin vs full FBS field | Conference adjustment ${includeAdjustment?"included":"excluded"}`,550,645,10,true);
 const legendRows:typeof series[number][][]=[[]];let rowWidth=0;
 for(const s of series){const size=regular.widthOfTextAtSize(`${s.conference} (${s.teams.length})`,10)+42;if(rowWidth+size>1020){legendRows.push([]);rowWidth=0;}legendRows.at(-1)!.push(s);rowWidth+=size;}
 legendRows.forEach((row,rowIndex)=>{const total=row.reduce((n,s)=>n+regular.widthOfTextAtSize(`${s.conference} (${s.teams.length})`,10)+42,0);let lx=(1100-total)/2;row.forEach(s=>{const label=`${s.conference} (${s.teams.length})`;line(lx,674+rowIndex*22,lx+20,674+rowIndex*22,color(s.color),3);text(label,lx+26,674+rowIndex*22,10);lx+=regular.widthOfTextAtSize(label,10)+42;});});
 return pdf.save();
}
export async function exportConferenceRatingPdf(series:readonly ConferenceRatingSeries[],subtitle:string,filename:string,includeAdjustment=false,view:"ranked"|"strength"="ranked"){
 const logos=new Map<string,PdfLogo>();
 await Promise.all([...new Set(series.flatMap(s=>[...s.teams.map(t=>t.logo),...(view==="strength"?[conferenceStrengthLogo(s.conference)]:[])]).filter((url):url is string=>Boolean(url)))].map(async url=>{
  const source=url.startsWith("/team-logos/")?url.replace("/team-logos/","/pdf-team-logos/").replace(/\.webp$/,".png"):url.startsWith("https://")?`/api/graph-logo?url=${encodeURIComponent(url)}`:url;
  const response=await fetch(source,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error("Logo unavailable");
  const bytes=new Uint8Array(await response.arrayBuffer()),type=bytes[0]===137?"png":bytes[0]===255?"jpg":null;
  if(type)logos.set(url,{bytes,type});else{const objectUrl=URL.createObjectURL(new Blob([bytes],{type:response.headers.get("content-type")||"image/webp"}));try{const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("Logo decode failed"));image.src=objectUrl;});const canvas=document.createElement("canvas");canvas.width=128;canvas.height=128;const context=canvas.getContext("2d");if(!context)throw new Error("Canvas unavailable");const scale=Math.min(128/image.width,128/image.height);context.drawImage(image,(128-image.width*scale)/2,(128-image.height*scale)/2,image.width*scale,image.height*scale);const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png"));if(!blob)throw new Error("Logo conversion failed");logos.set(url,{bytes:new Uint8Array(await blob.arrayBuffer()),type:"png"});}finally{URL.revokeObjectURL(objectUrl);}}
 }));
 const bytes=await buildConferenceRatingPdf(series,subtitle,logos,includeAdjustment,view),url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:"application/pdf"}));const anchor=document.createElement("a");anchor.href=url;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30000);
}
