// Shared by scenery, physics and AI: decorative rails stay outside the race corridor.
export function clearOfCourse(track,x,z,width,depth,angle,clearance=6){
 const c=Math.cos(angle),s=Math.sin(angle),nx=Math.max(2,Math.ceil(width/.6)),nz=Math.max(2,Math.ceil(depth/.6));
 for(let i=0;i<=nx;i++)for(let j=0;j<=nz;j++){
  const a=(i/nx-.5)*width,b=(j/nz-.5)*depth;
  if(track.nearest(x+c*a+s*b,z-s*a+c*b).distance<clearance)return false;
 }
 return true;
}

export function courseObstacles(track){
 const result=[];
 // Four clearly marked slaloms on straights, away from the grid and tight junctions.
 for(const [index,wanted] of [160,405,670,960].entries()){
  let selected=null;
  for(let d=0;d<=54&&!selected;d+=3)for(const sign of [1,-1]){
   const s=wanted+d*sign;if(s<65||s>track.length-65)continue;
   const p=track.at(s),angles=[-16,8,22,34].map(n=>track.at(s+n).angle);
   if(angles.some(a=>Math.abs(Math.atan2(Math.sin(a-p.angle),Math.cos(a-p.angle)))>.24))continue;
   if(result.some(h=>Math.abs(track.delta(s,h.s))<48))continue;
   if([85,230,375,520,665,810,955,1100].some(n=>Math.abs(s-n)<10||Math.abs(s+20-n)<10))continue;
   selected=s;break;
  }
  if(selected===null)continue;
  for(let j=0;j<2;j++){
   const s=selected+j*20,p=track.at(s),side=(index+j)%2?1:-1,offset=side*1.65;
   result.push({id:'slalom-'+index+'-'+j,s,x:p.x+p.dz*offset,z:p.z-p.dx*offset,angle:p.angle,side,radius:.86,kind:j?'tyres':'bale'});
  }
 }
 return result;
}

export function hitCourseObstacle(v,obstacles){
 if(v.obstacleCooldown>0||v.finish!==null)return false;
 for(const h of obstacles){
  const dx=v.x-h.x,dz=v.z-h.z,d2=dx*dx+dz*dz,r=h.radius+.94;if(d2>=r*r)continue;
  const d=Math.sqrt(d2),nx=d>.001?dx/d:Math.cos(h.angle),nz=d>.001?dz/d:-Math.sin(h.angle);
  v.x=h.x+nx*(r+.04);v.z=h.z+nz*(r+.04);if(!v.shield)v.speed*=.57;
  v.obstacleCooldown=.8;return true;
 }
 return false;
}
