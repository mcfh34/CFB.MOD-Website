import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectImperialismPoint,IMPERIALISM_WIDTH,IMPERIALISM_HEIGHT,IMPERIALISM_INSET_BOXES} from '../lib/imperialismProjection';
import {wrapImperialismExportSvg,buildImperialismPdf} from '../lib/exportImperialismMap';
import {GRAPH_BRAND_PNG} from '../lib/graphBrandLogo';

test('all counties fit inside the mainland view or their labeled inset boxes',()=>{
 const counties=JSON.parse(readFileSync('public/imperialism/counties.json','utf8')) as {i:string;g:number[][][][]}[];
 const bounds=new Map<string,{left:number;right:number;top:number;bottom:number}>();
 for(const county of counties){const region=['02','15','72'].includes(county.i.slice(0,2))?county.i.slice(0,2):'main';const box=bounds.get(region)??{left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
  for(const polygon of county.g)for(const ring of polygon)for(const [lon,lat] of ring){const [x,y]=projectImperialismPoint(lon,lat);assert.ok(x>20&&x<IMPERIALISM_WIDTH-20&&y>20&&y<IMPERIALISM_HEIGHT-20,`${county.i}: ${x},${y}`);box.left=Math.min(box.left,x);box.right=Math.max(box.right,x);box.top=Math.min(box.top,y);box.bottom=Math.max(box.bottom,y);}bounds.set(region,box);
 }
 const main=bounds.get('main')!;
 assert.ok(main.bottom<IMPERIALISM_INSET_BOXES[0].y-15);
 for(const [fips,region] of [['02','alaska'],['15','hawaii'],['72','puerto-rico']]){const inset=bounds.get(fips)!,box=IMPERIALISM_INSET_BOXES.find(b=>b.region===region)!;assert.ok(inset.left>box.x+12&&inset.right<box.x+box.width-12);assert.ok(inset.top>box.y+35&&inset.bottom<box.y+box.height-12);}
 assert.ok(bounds.get('02')!.right-bounds.get('02')!.left<300);
 assert.equal(IMPERIALISM_INSET_BOXES[0].x,20);assert.equal(IMPERIALISM_INSET_BOXES.at(-1)!.x+IMPERIALISM_INSET_BOXES.at(-1)!.width,IMPERIALISM_WIDTH-20);
});
test('each inset uses a uniform scale without stretching its landmass',()=>{
 const points=[[-96,38,.21],[-154,64,.07],[-157,20,.33],[-66.5,18,.75]];
 const determinants=points.map(([lon,lat,scale])=>{const step=.0001,p=projectImperialismPoint(lon,lat),east=projectImperialismPoint(lon+step,lat),north=projectImperialismPoint(lon,lat+step);return Math.abs((east[0]-p[0])*(north[1]-p[1])-(east[1]-p[1])*(north[0]-p[0]))/(Math.cos(lat*Math.PI/180)*scale**2);});
 for(const value of determinants)assert.ok(Math.abs(value/determinants[0]-1)<.00002);
 assert.deepEqual(projectImperialismPoint(179,52),projectImperialismPoint(-181,52));
});
test('export includes selected week, white background, full map and bundled brand artwork',()=>{
 const svg=wrapImperialismExportSvg('<path d="M0,0L1,1"/>',{season:2026,stage:'Week 5',counties:3221,teams:138});
 assert.ok(svg.includes('College Football Empires · Week 5'));assert.ok(svg.includes('fill="#ffffff"'));assert.ok(svg.includes('data:image/png;base64,'));assert.ok(svg.includes('Boxed insets shown at separate scales'));assert.ok(svg.includes(`viewBox="0 0 1100 ${IMPERIALISM_HEIGHT+140}"`));
});
test('PDF keeps map aspect ratio and embeds image instead of external logos',async()=>{
 const bytes=await buildImperialismPdf(new Uint8Array(Buffer.from(GRAPH_BRAND_PNG,'base64')),{season:2026,stage:'CC',counties:3221,teams:138});
 const {PDFDocument}=await import('pdf-lib'),pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),1);const page=pdf.getPage(0);assert.ok(Math.abs(page.getWidth()/page.getHeight()-IMPERIALISM_WIDTH/(IMPERIALISM_HEIGHT+140))<1e-10);assert.equal(pdf.getTitle(),'Harper+ Imperialism · 2026 · CC');
});

test('neighboring counties use identical border coordinates and reciprocal connections',()=>{
 const counties=JSON.parse(readFileSync('public/imperialism/counties.json','utf8')) as {i:string;g:number[][][][]}[];
 const neighbors=JSON.parse(readFileSync('public/imperialism/county-adjacency.json','utf8')) as number[][];
 assert.equal(neighbors.length,counties.length);
 const edges=(index:number)=>new Set(counties[index].g.flatMap(p=>p.flatMap(r=>r.slice(1).map((point,i)=>[JSON.stringify(r[i]),JSON.stringify(point)].sort().join('|')))));
 const autauga=counties.findIndex(c=>c.i==='01001'),lowndes=counties.findIndex(c=>c.i==='01085');
 const otherEdges=edges(lowndes);assert.ok([...edges(autauga)].filter(edge=>otherEdges.has(edge)).length>5,'Detailed shared border must align exactly');
 assert.ok(neighbors[autauga].includes(lowndes));
 for(let index=0;index<neighbors.length;index++)for(const other of neighbors[index]){assert.ok(other>=0&&other<counties.length&&other!==index);assert.ok(neighbors[other].includes(index));assert.equal(counties[index].i.startsWith('72'),counties[other].i.startsWith('72'),'Puerto Rico cannot connect to mainland through inset proximity');}
});
