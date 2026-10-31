const issuer="https://token.actions.githubusercontent.com";
export const JOB_AUDIENCE="harper-cfb-weekly-model";
export function validJobClaims(c:Record<string,unknown>,now=Date.now()/1000){return c.iss===issuer&&c.aud===JOB_AUDIENCE&&c.repository_id==="1210714132"&&c.repository==="mcfh34/CFB.MOD-Website"&&c.ref==="refs/heads/main"&&c.workflow_ref==="mcfh34/CFB.MOD-Website/.github/workflows/weekly-model.yml@refs/heads/main"&&["schedule","workflow_dispatch","push"].includes(String(c.event_name))&&typeof c.exp==="number"&&c.exp>now&&typeof c.iat==="number"&&c.iat<=now+30&&now-c.iat<600&&typeof c.nbf==="number"&&c.nbf<=now+30;}
function decode(part:string){return Uint8Array.from(atob(part.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));}
export async function verifyJobToken(token:string){
 try{const [headerPart,claimsPart,signaturePart,...rest]=token.split(".");if(rest.length||!signaturePart)return false;const header=JSON.parse(new TextDecoder().decode(decode(headerPart)));const claims=JSON.parse(new TextDecoder().decode(decode(claimsPart)));if(header.alg!=="RS256"||!validJobClaims(claims))return false;
 const response=await fetch(`${issuer}/.well-known/jwks`,{signal:AbortSignal.timeout(10000)});if(!response.ok)return false;const jwks=await response.json() as {keys:(JsonWebKey&{kid:string})[]};const jwk=jwks.keys.find(k=>k.kid===header.kid);if(!jwk)return false;
 const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);return await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,decode(signaturePart),new TextEncoder().encode(`${headerPart}.${claimsPart}`));
 }catch{return false;}
}
