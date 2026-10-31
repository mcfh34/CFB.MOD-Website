import {conferenceStrengthLayout,conferenceStrengthLogo} from './conferenceStrengthChart';
import type {ConferenceRatingSeries} from './conferenceRatingChart';
import type {PdfLogo} from './exportGraphPdf';
import {GRAPH_BRAND_PNG} from './graphBrandLogo';
export async function buildConferenceStrengthPdf(series:readonly ConferenceRatingSeries[],subtitle:string,logos:ReadonlyMap<string,PdfLogo>){
 const {PDFDocument,StandardFonts,rgb,degrees}=await import('pdf-lib'),layout=conferenceStrengthLayout(series),pdf=await PDFDocument.create(),page=pdf.addPage([layout.width,layout.height]);
 pdf.setTitle('Harper+ Conference Average Strength');pdf.setSubject(subtitle);
 const font=await pdf.embedFont(StandardFonts.Courier),bold=await pdf.embedFont(StandardFonts.CourierBold),ink=rgb(.1,.14,.17),gold=rgb(.4,.28,.05);
 const text=(s:string,x:number,y:number,size=12,center=false,strong=false)=>{s=s.replace(/·/g,' | ').replace(/[^\x20-\x7e]/g,'');const f=strong?bold:font;page.drawText(s,{x:center?x-f.widthOfTextAtSize(s,size)/2:x,y:layout.height-y-size/2,size,font:f,color:ink});};
 const color=(hex:string)=>rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
 const line=(x1:number,x2:number,y:number,c=rgb(.85,.88,.86),width=1,dash?:number[])=>page.drawLine({start:{x:x1,y:layout.height-y},end:{x:x2,y:layout.height-y},color:c,thickness:width,dashArray:dash});
 const images=new Map<string,Awaited<ReturnType<typeof pdf.embedPng>>>();for(const [url,logo] of logos)images.set(url,await (logo.type==='png'?pdf.embedPng(logo.bytes):pdf.embedJpg(logo.bytes)));
 const draw=(url:string|null,x:number,y:number,w:number,h:number)=>{const image=url?images.get(url):undefined;if(image){const d=image.scaleToFit(w,h);page.drawImage(image,{x:x-d.width/2,y:layout.height-y-d.height/2,width:d.width,height:d.height});return true;}return false;};
 const brand=await pdf.embedPng(GRAPH_BRAND_PNG);page.drawImage(brand,{x:24,y:layout.height-70,width:66,height:48});text('Conference Average Strength',layout.width/2,42,26,true,true);text(subtitle,layout.width/2,66,Math.min(12,(layout.width-220)/Math.max(1,subtitle.replace(/·/g," | ").length*.6)),true);
 for(const b of layout.bands){page.drawRectangle({x:b.start,y:layout.height-layout.bottom,width:b.end-b.start,height:layout.bottom-layout.top,color:color(b.color),opacity:.07});page.drawLine({start:{x:b.start,y:layout.height-layout.top},end:{x:b.start,y:layout.height-layout.bottom},color:rgb(.5,.55,.53),thickness:1});if(!draw(conferenceStrengthLogo(b.conference),b.center,115,76,44))text(b.conference,b.center,113,12,true);text(`Avg ${b.average.toFixed(1)}`,b.center,149,15,true,true);}
 for(let value=layout.low;value<=layout.high;value+=5){line(layout.left,layout.right,layout.y(value),value===0?ink:undefined,value===0?1.2:.6);text(String(value),layout.left-24,layout.y(value),12,true);}
 for(const b of layout.bands){line(b.start+4,b.end-4,b.meanY,rgb(.95,.82,.54),8);for(const p of b.points){page.drawRectangle({x:p.x-4,y:layout.height-Math.max(p.y,layout.y(0)),width:8,height:Math.max(.75,Math.abs(p.y-layout.y(0))),color:color(p.color)});draw(p.logo,p.x,p.rating>=0?p.y-9:p.y+9,12,12);page.drawText(p.abbreviation.replace(/[^\x20-\x7e]/g,''),{x:p.x+4,y:layout.height-517-font.widthOfTextAtSize(p.abbreviation.replace(/[^\x20-\x7e]/g,''),12),font,size:12,color:ink,rotate:degrees(90)});}line(b.start+4,b.end-4,b.meanY,gold,2.5,[7,5]);}
 const axis='H+ Power Rating (points)',axisSize=15;
 page.drawText(axis,{x:23,y:layout.height-(layout.top+layout.bottom)/2-bold.widthOfTextAtSize(axis,axisSize)/2,size:axisSize,font:bold,color:ink,rotate:degrees(90)});
 text('Dashed line = conference average | Teams grouped by conference',layout.width/2,622,17,true,true);text('Each team counts equally | Average neutral margin against the full FBS field',layout.width/2,637,11,true);
 return pdf.save();
}
