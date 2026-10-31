/** Albers projections preserve each landmass's shape without stretching.
 * The mainland and three boxed insets use separate display scales.
 */
export const IMPERIALISM_WIDTH=1100,IMPERIALISM_HEIGHT=880;
export const IMPERIALISM_SCALE=.21;
export const IMPERIALISM_BACKGROUND="#ffffff";
export type ImperialismMapRegion="mainland"|"alaska"|"hawaii"|"puerto-rico";
const radians=Math.PI/180;
const specs:Record<ImperialismMapRegion,{lon:number;lat:number;parallels:[number,number];translate:[number,number];scale:number}>= {
 mainland:{lon:-96,lat:38,parallels:[29.5,45.5],translate:[546,345],scale:IMPERIALISM_SCALE},
 alaska:{lon:-154,lat:64,parallels:[55,65],translate:[216,756],scale:.07},
 hawaii:{lon:-157,lat:20,parallels:[18,22],translate:[573,788],scale:.33},
 "puerto-rico":{lon:-66.5,lat:18,parallels:[16,20],translate:[915,782],scale:.75},
};
export const IMPERIALISM_INSET_BOXES=[
 {region:"alaska",name:"ALASKA",x:20,y:658,width:344,height:200},
 {region:"hawaii",name:"HAWAII",x:378,y:658,width:344,height:200},
 {region:"puerto-rico",name:"PUERTO RICO",x:736,y:658,width:344,height:200},
] as const;
export const IMPERIALISM_INSET_LABELS=IMPERIALISM_INSET_BOXES.map(box=>({name:box.name,x:box.x+box.width/2,y:box.y+23}));
export function imperialismMapRegion(lon:number,lat:number):ImperialismMapRegion {
 if(lat>50&&(lon< -128||lon>0))return "alaska";
 if(lat<30&&lon< -150)return "hawaii";
 if(lon> -68&&lat<20)return "puerto-rico";
 return "mainland";
}
export function projectImperialismPoint(lon:number,lat:number,region=imperialismMapRegion(lon,lat)):[number,number]{
 const spec=specs[region],phi=lat*radians,[a,b]=spec.parallels.map(p=>p*radians);
 const n=(Math.sin(a)+Math.sin(b))/2,c=Math.cos(a)**2+2*n*Math.sin(a);
 const rho=6371*Math.sqrt(c-2*n*Math.sin(phi))/n,rho0=6371*Math.sqrt(c-2*n*Math.sin(spec.lat*radians))/n;
 // Normalize date-line-crossing Aleutian coordinates around Alaska's meridian.
 const theta=n*(((lon-spec.lon+180)%360+360)%360-180)*radians;
 return [spec.translate[0]+rho*Math.sin(theta)*spec.scale,spec.translate[1]+(rho*Math.cos(theta)-rho0)*spec.scale];
}
