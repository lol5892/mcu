import {encode,decode} from "npm:jpeg-js@0.4.4";
import {publicJPEG} from "./public-image.ts";
function assert(ok:boolean,label:string){if(!ok)throw Error(label);}
Deno.test("beta photo sanitization makes bounded distinct full image and thumbnail",async()=>{
 const width=900,height=600,data=new Uint8Array(width*height*4);for(let i=0;i<data.length;i+=4){data[i]=(i/4)%255;data[i+1]=100;data[i+2]=180;data[i+3]=255;}
 const raw=Uint8Array.from(encode({width,height,data},80).data);const r=publicJPEG(raw);
 assert(r.photo.size<=524288,"photo size");assert(r.thumbnail.size<=65536,"thumbnail size");assert(r.thumbnail.size<r.photo.size,"thumbnail is smaller");
 const t=decode(new Uint8Array(await r.thumbnail.arrayBuffer()),{useTArray:true});assert(Math.max(t.width,t.height)<=240,"thumbnail dimensions");
});
Deno.test("beta server rejects forged oversized upload before decode",()=>{let rejected=false;try{publicJPEG(new Uint8Array(524289));}catch{rejected=true;}assert(rejected,"must reject oversize");});
