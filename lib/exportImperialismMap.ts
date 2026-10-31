import {GRAPH_BRAND_PNG} from "./graphBrandLogo";
import {writePngClipboard} from './copyGraphImage';
import {IMPERIALISM_WIDTH,IMPERIALISM_HEIGHT,IMPERIALISM_BACKGROUND} from "./imperialismProjection";
export type ImperialismExportMeta={season:number|string;stage:string;counties:number;teams:number};
const escape=(text:string)=>text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const HEIGHT=IMPERIALISM_HEIGHT+140;
export function wrapImperialismExportSvg(mapMarkup:string,meta:ImperialismExportMeta){
 return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${IMPERIALISM_WIDTH}" height="${HEIGHT}" viewBox="0 0 ${IMPERIALISM_WIDTH} ${HEIGHT}">
 <rect width="${IMPERIALISM_WIDTH}" height="${HEIGHT}" fill="${IMPERIALISM_BACKGROUND}"/>
 <rect width="${IMPERIALISM_WIDTH}" height="92" fill="#202322"/>
 <image href="data:image/png;base64,${GRAPH_BRAND_PNG}" xlink:href="data:image/png;base64,${GRAPH_BRAND_PNG}" x="22" y="16" width="64" height="64"/>
 <g font-family="Consolas,monospace" fill="#f5f3e9"><text x="106" y="39" font-size="25" font-weight="bold">College Football Empires · ${escape(meta.stage)}</text><text x="106" y="68" font-size="14">${meta.season} · ${meta.counties.toLocaleString()} counties · ${meta.teams} starting FBS teams</text></g>
 <g transform="translate(0 92)">${mapMarkup}</g>
 <g font-family="Consolas,monospace" fill="#424944" text-anchor="middle"><text x="550" y="${HEIGHT-26}" font-size="14">Alaska, Hawaii and Puerto Rico · Boxed insets shown at separate scales</text><text x="550" y="${HEIGHT-7}" font-size="12">HARPER+ · FBS games only · County geography / CFBD results</text></g></svg>`;
}
async function embeddedLogo(source:string):Promise<string>{
 const url=source.startsWith("/team-logos/")?source.replace("/team-logos/","/pdf-team-logos/").replace(/\.webp$/,".png"):source.startsWith("https://")?`/api/graph-logo?url=${encodeURIComponent(source)}`:source;
 const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error("Map logo unavailable");
 const blob=await response.blob();return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error("Map logo unavailable"));reader.readAsDataURL(blob);});
}
export async function imperialismExportPng(map:SVGSVGElement,meta:ImperialismExportMeta):Promise<Uint8Array>{
 const clone=map.cloneNode(true) as SVGSVGElement;
 // Export the entire selected week's map, independently of pan/zoom/follow.
 clone.setAttribute("viewBox",`0 0 ${IMPERIALISM_WIDTH} ${IMPERIALISM_HEIGHT}`);clone.setAttribute("width",String(IMPERIALISM_WIDTH));clone.setAttribute("height",String(IMPERIALISM_HEIGHT));
 clone.querySelectorAll(".imperialism-dim,.imperialism-mark-dim").forEach(node=>{node.classList.remove("imperialism-dim","imperialism-mark-dim");});
 clone.querySelectorAll(".imperialism-map-mark g[transform]").forEach(node=>node.setAttribute("transform",(node.getAttribute("transform")||"").replace(/\s*scale\([^)]*\)/,"")));
 clone.querySelectorAll(".imperialism-campus-marker").forEach(node=>node.setAttribute("transform",(node.getAttribute("transform")||"").replace(/\s*scale\([^)]*\)/,"")));
 clone.querySelectorAll(".imperialism-county").forEach(node=>{node.setAttribute("stroke","none");node.setAttribute("fill-rule","evenodd");});
 clone.querySelectorAll(".imperialism-border").forEach(node=>{const territory=node.classList.contains("imperialism-territory-border"),state=node.classList.contains("imperialism-state-border")||node.classList.contains("imperialism-land-outline");node.setAttribute("stroke",state?"#000":"#18242a");node.setAttribute("stroke-opacity",state?"1":territory?".38":".16");node.setAttribute("stroke-width",state?"1.1":territory?".4":".18");node.setAttribute("stroke-linejoin","round");node.setAttribute("stroke-linecap","round");node.setAttribute("fill","none");node.setAttribute("vector-effect","non-scaling-stroke");});
 clone.querySelectorAll(".imperialism-inset-labels text").forEach(node=>{node.setAttribute("fill","#424944");node.setAttribute("font-family","Consolas,monospace");node.setAttribute("font-size","12");node.setAttribute("letter-spacing","1.5");});
 const images=[...clone.querySelectorAll("image")],urls=[...new Set(images.map(node=>node.getAttribute("href")||node.getAttributeNS("http://www.w3.org/1999/xlink","href")).filter((url):url is string=>!!url))];
 const logos=new Map(await Promise.all(urls.map(async url=>[url,await embeddedLogo(url)] as const)));
 images.forEach(node=>{const source=node.getAttribute("href")||node.getAttributeNS("http://www.w3.org/1999/xlink","href")||"";node.removeAttributeNS("http://www.w3.org/1999/xlink","href");node.setAttribute("href",logos.get(source)!);node.setAttributeNS("http://www.w3.org/1999/xlink","xlink:href",logos.get(source)!);});
 const svg=wrapImperialismExportSvg(clone.innerHTML,meta);
 const svgUrl=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
 {const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error("Map export could not render"));image.src=svgUrl;});
  const canvas=document.createElement("canvas");canvas.width=IMPERIALISM_WIDTH*2;canvas.height=HEIGHT*2;const context=canvas.getContext("2d");if(!context)throw Error("Map export unavailable");context.drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png"));if(!blob)throw Error("Map export unavailable");return new Uint8Array(await blob.arrayBuffer());
 }
}
export async function buildImperialismPdf(png:Uint8Array,meta:ImperialismExportMeta){
 const {PDFDocument}=await import("pdf-lib"),pdf=await PDFDocument.create();pdf.setTitle(`Harper+ Imperialism · ${meta.season} · ${meta.stage}`);pdf.setCreator("Harper+ College Football Model");
 const image=await pdf.embedPng(png),page=pdf.addPage([IMPERIALISM_WIDTH*.6,HEIGHT*.6]);page.drawImage(image,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});return pdf.save();
}
export function copyImperialismImage(map:SVGSVGElement,meta:ImperialismExportMeta){
 return writePngClipboard(async()=>new Blob([new Uint8Array(await imperialismExportPng(map,meta))],{type:'image/png'}));
}
export async function exportImperialismMap(map:SVGSVGElement,meta:ImperialismExportMeta){
 const png=await imperialismExportPng(map,meta),bytes=await buildImperialismPdf(png,meta);
 const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:"application/pdf"})),anchor=document.createElement("a");anchor.href=url;anchor.download=`harper-imperialism-${meta.season}-${meta.stage.toLowerCase().replace(/[^a-z0-9]+/g,"-")}.pdf`;document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30000);
}
