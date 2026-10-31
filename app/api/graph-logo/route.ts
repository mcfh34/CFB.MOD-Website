// Same-origin access to public team-logo CDNs keeps PDF images independent of browser CORS.
export async function GET(request:Request){
  const value=new URL(request.url).searchParams.get("url");
  if(!value||value.length>1024)return new Response("Invalid logo",{status:400});
  let source:URL;try{source=new URL(value);}catch{return new Response("Invalid logo",{status:400});}
  const allowed=source.hostname==="a.espncdn.com"&&source.pathname.startsWith("/i/teamlogos/ncaa/")||source.hostname==="logos.cfbd.com"||source.hostname==="cdn.collegefootballdata.com"&&source.pathname.startsWith("/logos/");
  if(source.protocol!=="https:"||source.port||source.username||source.password||!allowed||!(/\.(png|jpe?g|webp|svg)$/i.test(source.pathname)))return new Response("Unsupported logo",{status:400});
  try{
    const response=await fetch(source.href,{redirect:"error",signal:AbortSignal.timeout(12000)});
    const type=response.headers.get("content-type")??"";
    if(!response.ok||!/^image\/(png|jpeg|webp|svg\+xml)/i.test(type))return new Response("Logo unavailable",{status:404});
    const bytes=await response.arrayBuffer();if(bytes.byteLength>2*1024*1024)return new Response("Logo too large",{status:413});
    return new Response(bytes,{headers:{"content-type":type,"cache-control":"public, max-age=86400","x-content-type-options":"nosniff"}});
  }catch{return new Response("Logo unavailable",{status:404});}
}
