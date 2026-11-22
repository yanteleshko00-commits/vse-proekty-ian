import { deflateSync } from 'node:zlib';

const FONT = {
  '2':['01110','10001','00001','00010','00100','01000','11111'],
  'x':['00000','00000','10001','01010','00100','01010','10001'],
  '+':['00000','00100','00100','11111','00100','00100','00000'],
  '3':['11110','00001','00001','01110','00001','00001','11110'],
  '=':['00000','11111','00000','00000','11111','00000','00000'],
  '7':['11111','00001','00010','00100','01000','01000','01000']
};
function crc32(buffer) {
  let crc=0xffffffff;
  for(const byte of buffer){
    crc ^= byte;
    for(let i=0;i<8;i++)crc=(crc>>>1) ^ (crc&1?0xedb88320:0);
  }
  return (crc ^ 0xffffffff)>>>0;
}
function chunk(type,data){
  const label=Buffer.from(type,'ascii'),len=Buffer.alloc(4),sum=Buffer.alloc(4);
  len.writeUInt32BE(data.length,0);
  sum.writeUInt32BE(crc32(Buffer.concat([label,data])),0);
  return Buffer.concat([len,label,data,sum]);
}
export function mathTestImage() {
  const width=700,height=230,scale=13,phrase='2x+3=7';
  const pixels=Buffer.alloc(width*height*3,255);
  let x=60;
  for(const character of phrase){
    const rows=FONT[character];
    if(!rows)throw new Error('Unknown character');
    for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(rows[row][col]==='1'){
      for(let yy=0;yy<scale;yy++)for(let xx=0;xx<scale;xx++){
        const px=x+col*scale+xx,py=65+row*scale+yy;
        const at=(py*width+px)*3;
        pixels[at]=20;pixels[at+1]=22;pixels[at+2]=35;
      }
    }
    x+=6*scale;
  }
  const scanlines=Buffer.alloc(height*(width*3+1));
  for(let y=0;y<height;y++) pixels.copy(scanlines,y*(width*3+1)+1,y*width*3,(y+1)*width*3);
  const header=Buffer.alloc(13);
  header.writeUInt32BE(width,0);
  header.writeUInt32BE(height,4);
  header[8]=8;header[9]=2;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),
    chunk('IDAT',deflateSync(scanlines)),chunk('IEND',Buffer.alloc(0))
  ]);
}
