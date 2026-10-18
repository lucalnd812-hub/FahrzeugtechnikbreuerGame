import assert from 'node:assert/strict';
import {drawGarageCourse} from '../src/garage-course-preview.js';
import {TRACKS} from '../src/tracks.js';

function surface(width,height) {
 const paths=[],arcs=[],labels=[];
 let lineWidth=1;
 const c={setTransform(){},clearRect(){},beginPath(){},stroke(){},fill(){},
  set lineWidth(value){lineWidth=value;},get lineWidth(){return lineWidth;},
  moveTo(x,y){paths.push({x,y,lineWidth});},lineTo(x,y){paths.push({x,y,lineWidth});},
  arc(x,y,r){arcs.push({x,y,r});},fillText(text,x,y){labels.push({text,x,y});}};
 const canvas={clientWidth:width,clientHeight:height,width:300,height:150,getContext:()=>c};
 return {canvas,paths,arcs,labels};
}
let count=0;
for (const meta of TRACKS) for (const [width,height] of [[560,390],[430,170],[292,103],[230,68],[150,43]]) {
 const f=surface(width,height);
 assert.equal(drawGarageCourse(f.canvas,meta),true);
 assert.equal(f.canvas.width,width);
 assert.equal(f.canvas.height,height,'The actual short grid height is authoritative, including heights below 90px');
 assert(f.paths.length>0);
 for (const point of f.paths) {
  assert(point.x-point.lineWidth/2>=-.1&&point.x+point.lineWidth/2<=width+.1,`${meta.id}: road width stays inside ${width}×${height}`);
  assert(point.y-point.lineWidth/2>=-.1&&point.y+point.lineWidth/2<=height+.1,`${meta.id}: full course height stays inside ${width}×${height}`);
 }
 for(const marker of f.arcs) {
  assert(marker.x-marker.r>=-.1&&marker.x+marker.r<=width+.1);
  assert(marker.y-marker.r>=-.1&&marker.y+marker.r<=height+.1);
 }
 for(const label of f.labels) assert(label.y<height&&label.x===width/2);
 if(height<120)assert.equal(f.labels.length,0,'Short previews preserve the complete course instead of an overlapping caption');
 ++count;
}
for(const [width,height] of [[0,0],[0,200],[200,0],[1,100]]) {
 const f=surface(width,height);
 assert.equal(drawGarageCourse(f.canvas,TRACKS[0]),false);
 assert.equal(f.paths.length,0);
 assert.equal(f.canvas.width,300,'A hidden preview is not initialized at a fake desktop resolution');
}
console.log(`PASS garage course previews: ${count} real-size route fits, short cells, complete strokes/start markers, compact captions and hidden bootstrap.`);
