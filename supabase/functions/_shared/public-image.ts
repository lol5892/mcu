import { decode, encode } from "npm:jpeg-js@0.4.4";
type Pixels={width:number;height:number;data:Uint8Array};
function resize(image:Pixels,side:number):Pixels {
 const ratio=Math.min(1,side/Math.max(image.width,image.height));
 if(ratio===1)return image;
 const width=Math.max(1,Math.round(image.width*ratio)),height=Math.max(1,Math.round(image.height*ratio)),data=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const sx=(x+.5)*image.width/width-.5,sy=(y+.5)*image.height/height-.5;
  const x0=Math.max(0,Math.floor(sx)),y0=Math.max(0,Math.floor(sy)),x1=Math.min(image.width-1,x0+1),y1=Math.min(image.height-1,y0+1),dx=Math.max(0,sx-x0),dy=Math.max(0,sy-y0);
  const p=(y*width+x)*4;
  for(let c=0;c<3;c++)data[p+c]=Math.round((image.data[(y0*image.width+x0)*4+c]*(1-dx)+image.data[(y0*image.width+x1)*4+c]*dx)*(1-dy)+(image.data[(y1*image.width+x0)*4+c]*(1-dx)+image.data[(y1*image.width+x1)*4+c]*dx)*dy);
  data[p+3]=255;
 }
 return {width,height,data};
}
export function publicJPEG(bytes:Uint8Array){
 if(bytes.length<32||bytes.length>524288||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw Error("INVALID_JPEG");
 const decoded=decode(bytes,{useTArray:true,formatAsRGBA:true,maxResolutionInMP:4,maxMemoryUsageInMB:64});
 if(!decoded.width||!decoded.height||decoded.width>2000||decoded.height>2000)throw Error("IMAGE_DIMENSIONS_TOO_LARGE");
 const image:Pixels={width:decoded.width,height:decoded.height,data:decoded.data};
 let output:Uint8Array|undefined;
 for(const side of [1600,1280,960]){
  const pixels=resize(image,side);
  for(const quality of [82,72,62]){const jpeg=encode(pixels,quality).data;if(jpeg.byteLength<=524288){output=Uint8Array.from(jpeg);break;}}
  if(output)break;
 }
 if(!output)throw Error("IMAGE_TOO_LARGE");
 const thumbnail=Uint8Array.from(encode(resize(image,240),72).data);
 if(thumbnail.byteLength>65536)throw Error("THUMBNAIL_TOO_LARGE");
 return {photo:new Blob([output.buffer as ArrayBuffer],{type:"image/jpeg"}),thumbnail:new Blob([thumbnail.buffer as ArrayBuffer],{type:"image/jpeg"})};
}
