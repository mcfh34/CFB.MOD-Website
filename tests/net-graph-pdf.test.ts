import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PDFDocument} from "pdf-lib";
import {buildGraphPdf,exportGraphPdf} from "../lib/exportGraphPdf";
import {buildNetSuccessReport} from "../lib/netSuccessRate";
const rows=buildNetSuccessReport([{gameId:"1",season:2026,week:4,seasonType:"regular",completed:true,homeTeam:"Alabama",awayTeam:"Georgia",homePoints:30,awayPoints:20,homeSuccessRate:null,awaySuccessRate:null,homeValues:{ypa:8.5},awayValues:{ypa:6},homeLogo:"a.png",awayLogo:"b.png"}],new Set(["Alabama","Georgia"]),2026,4,"regular","ypa").rows;
const input={rows,metricKey:"ypa" as const,title:"Net YPA",subtitle:"2026 · Week 4 · SEC · Low to high",xAxisLabel:"Games sorted by Net YPA · Low to high"};
test("PDF is valid, one page, branded with embedded images and the selected metric",async()=>{
  const bytes=await readFile(new URL("../public/apple-touch-icon.png",import.meta.url));
  const output=await buildGraphPdf(input,new Map([["brand",{bytes,type:"png" as const}],["a.png",{bytes,type:"png" as const}]]));
  assert.equal(new TextDecoder().decode(output.slice(0,5)),"%PDF-");
  const pdf=await PDFDocument.load(output);assert.equal(pdf.getPageCount(),1);assert.equal(pdf.getTitle(),"Harper+ Net YPA");assert.equal(pdf.getSubject(),input.subtitle);assert.equal(pdf.getPages()[0].getWidth(),1000);
  assert.ok(pdf.context.enumerateIndirectObjects().some(([,object])=>String(object).includes("/Subtype /Image")));
});
test("PDF download path generates a readable file even when external logos fail",async()=>{
  const originalFetch=globalThis.fetch,originalDocument=globalThis.document,originalWindow=globalThis.window;
  let clicked=false,download="",href="";
  try{
    const bytes=await readFile(new URL("../public/apple-touch-icon.png",import.meta.url));
    globalThis.fetch=async(input)=>String(input)==="/apple-touch-icon.png"?new Response(bytes,{headers:{"content-type":"image/png"}}):new Response("",{status:404});
    globalThis.document={createElement:()=>({set href(value:string){href=value;},set download(value:string){download=value;},click:()=>{clicked=true;},remove:()=>{}}),body:{appendChild:()=>{}}} as unknown as Document;
    globalThis.window={setTimeout:()=>0} as unknown as Window & typeof globalThis;
    await exportGraphPdf(input,"net-ypa-2026-week4.pdf");assert.equal(clicked,true);assert.equal(download,"net-ypa-2026-week4.pdf");
    const response=await originalFetch(href);const pdf=await PDFDocument.load(await response.arrayBuffer());assert.equal(pdf.getPageCount(),1);URL.revokeObjectURL(href);
  }finally{globalThis.fetch=originalFetch;globalThis.document=originalDocument;globalThis.window=originalWindow;}
});

test("PDF export embeds both team logos from the bundled site artwork",async()=>{
  const originalFetch=globalThis.fetch,originalDocument=globalThis.document,originalWindow=globalThis.window;
  const requested:string[]=[];let href="";
  try{
    const bytes=await readFile(new URL("../public/apple-touch-icon.png",import.meta.url));
    globalThis.fetch=async(input)=>{requested.push(String(input));return new Response(bytes,{headers:{"content-type":"image/png"}});};
    globalThis.document={createElement:()=>({set href(value:string){href=value;},set download(_value:string){},click:()=>{},remove:()=>{}}),body:{appendChild:()=>{}}} as unknown as Document;
    globalThis.window={setTimeout:()=>0} as unknown as Window & typeof globalThis;
    const a="https://a.espncdn.com/i/teamlogos/ncaa/500/333.png",b="https://a.espncdn.com/i/teamlogos/ncaa/500/61.png";
    await exportGraphPdf({...input,rows:rows.map(row=>({...row,winnerLogo:a,loserLogo:b}))},"logos.pdf");
    assert.ok(requested.includes("/pdf-team-logos/alabama.png"));assert.ok(requested.includes("/pdf-team-logos/georgia.png"));
    const response=await originalFetch(href),pdf=await PDFDocument.load(await response.arrayBuffer());
    assert.ok(pdf.context.enumerateIndirectObjects().filter(([,object])=>String(object).includes("/Subtype /Image")).length>=3);URL.revokeObjectURL(href);
  }finally{globalThis.fetch=originalFetch;globalThis.document=originalDocument;globalThis.window=originalWindow;}
});
test("logo access rejects non-CDN, insecure and non-image addresses",async()=>{
  const {GET}=await import("../app/api/graph-logo/route");
  for(const url of ["http://a.espncdn.com/i/teamlogos/ncaa/500/333.png","https://example.com/a.png","https://a.espncdn.com/private.json","https://user@logos.cfbd.com/a.png","https://127.0.0.1/a.png"]){assert.equal((await GET(new Request(`https://example.com/api/graph-logo?url=${encodeURIComponent(url)}`))).status,400);}
});

test("PDF always embeds the site logo without fetching any asset",async()=>{
  const output=await buildGraphPdf(input);
  const pdf=await PDFDocument.load(output);
  assert.ok(pdf.context.enumerateIndirectObjects().some(([,object])=>String(object).includes("/Subtype /Image")));
});

test("logo proxy accepts the actual CFBD logo host returned by team metadata",async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(new Uint8Array([137,80,78,71]),{headers:{"content-type":"image/png"}});
  const {GET}=await import("../app/api/graph-logo/route");
  const response=await GET(new Request("https://example.com/api/graph-logo?url="+encodeURIComponent("https://cdn.collegefootballdata.com/logos/500/333.png")));
  assert.equal(response.status,200);
 }finally{globalThis.fetch=original;}
});
