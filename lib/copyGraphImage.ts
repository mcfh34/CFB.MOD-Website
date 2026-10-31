import {GRAPH_BRAND_PNG} from './graphBrandLogo';
const appearance=['fill','fill-opacity','fill-rule','stroke','stroke-opacity','stroke-width','stroke-dasharray','stroke-linecap','stroke-linejoin','opacity','font-family','font-size','font-weight','font-style','letter-spacing','text-anchor','dominant-baseline','paint-order','color','marker-end','marker-start','clip-path'];
export function writePngClipboard(render:()=>Promise<Blob>):Promise<void>{
 if(typeof ClipboardItem==='undefined'||!navigator.clipboard?.write)return Promise.reject(Error('Image copying is unavailable in this browser. Open the site in Safari or Chrome.'));
 // Invoke write during the original click. Safari permits promised PNG data.
 return navigator.clipboard.write([new ClipboardItem({'image/png':render()})]);
}
async function logoData(url:string):Promise<string>{
 if(url==='/harper-football.svg')return `data:image/png;base64,${GRAPH_BRAND_PNG}`;
 if(url.startsWith('data:'))return url;
 const source=url.startsWith('/team-logos/')?url.replace('/team-logos/','/pdf-team-logos/').replace(/\.webp$/,'.png'):url.startsWith('https://')?`/api/graph-logo?url=${encodeURIComponent(url)}`:url;
 const response=await fetch(source,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('A chart logo could not be loaded. Try again.');
 const blob=await response.blob();return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('A chart logo could not be loaded.'));reader.readAsDataURL(blob);});
}
function background(element:Element){
 for(let node:Element|null=element;node;node=node.parentElement){const color=getComputedStyle(node).backgroundColor;if(color&&color!=='transparent'&&color!=='rgba(0, 0, 0, 0)')return color;}
 return '#fafbf8';
}
/** Entire SVG viewBox, including offscreen points, resolved theme styles and embedded logos. */
export async function renderGraphImage(chart:SVGSVGElement,title?:string):Promise<Blob>{
 await document.fonts.ready;
 const clone=chart.cloneNode(true) as SVGSVGElement,box=chart.viewBox.baseVal;
 if(!box.width||!box.height)throw Error('Graph is unavailable.');
 const original=[chart,...chart.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
 original.forEach((node,index)=>{const style=getComputedStyle(node);appearance.forEach(property=>{
  const value=style.getPropertyValue(property).replace(/url\(["']?[^)]*#([^"')]+)["']?\)/g,'url(#$1)');
  if(value)copies[index].setAttribute(property,value);
 });copies[index].removeAttribute('style');});
 clone.removeAttribute('style');clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('width',String(box.width));clone.setAttribute('height',String(box.height));
 const images=[...clone.querySelectorAll('image')],href=(node:Element)=>node.getAttribute('href')||node.getAttributeNS('http://www.w3.org/1999/xlink','href')||'';
 const hasBrand=images.some(image=>href(image)==='/harper-football.svg'||href(image)===`data:image/png;base64,${GRAPH_BRAND_PNG}`);
 const embedded=new Map(await Promise.all([...new Set(images.map(href).filter(Boolean))].map(async url=>[url,await logoData(url)] as const)));
 images.forEach(image=>{const value=embedded.get(href(image));if(value){image.removeAttributeNS('http://www.w3.org/1999/xlink','href');image.setAttribute('href',value);}});
 const color=background(chart),ns='http://www.w3.org/2000/svg';
 const caption=title||(!hasBrand?'Harper+ College Football Model':'');
 const root=document.createElementNS(ns,'svg'),header=caption?Math.max(38,box.width*.065):0;
 root.setAttribute('xmlns',ns);root.setAttribute('width',String(box.width));root.setAttribute('height',String(box.height+header));root.setAttribute('viewBox',`0 0 ${box.width} ${box.height+header}`);
 const rect=document.createElementNS(ns,'rect');rect.setAttribute('width',String(box.width));rect.setAttribute('height',String(box.height+header));rect.setAttribute('fill',color);root.append(rect);
 if(caption){
  const mark=document.createElementNS(ns,'image');mark.setAttribute('href',`data:image/png;base64,${GRAPH_BRAND_PNG}`);mark.setAttribute('x','8');mark.setAttribute('y','5');mark.setAttribute('width',String(header-10));mark.setAttribute('height',String(header-10));root.append(mark);
  const text=document.createElementNS(ns,'text');text.setAttribute('x',String(header+8));text.setAttribute('y',String(header*.62));text.setAttribute('font-family','Consolas,monospace');text.setAttribute('font-size',String(Math.min(header*.28,(box.width-header-20)/Math.max(caption.length*.6,1))));text.setAttribute('fill',getComputedStyle(chart.querySelector('text')||chart).fill||getComputedStyle(chart).color);text.textContent=caption;root.append(text);
 }
 clone.setAttribute('x','0');clone.setAttribute('y',String(header));root.append(clone);
 const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('Chart image could not render. Try again.'));image.src=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(root))}`;});
 const scale=Math.min(3,8192/box.width,8192/(box.height+header)),canvas=document.createElement('canvas');canvas.width=Math.ceil(box.width*scale);canvas.height=Math.ceil((box.height+header)*scale);
 const context=canvas.getContext('2d');if(!context)throw Error('Image copying unavailable.');context.drawImage(image,0,0,canvas.width,canvas.height);
 const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Chart image could not render.');return blob;
}
export function copyGraphImage(chart:SVGSVGElement,title?:string){return writePngClipboard(()=>renderGraphImage(chart,title));}
