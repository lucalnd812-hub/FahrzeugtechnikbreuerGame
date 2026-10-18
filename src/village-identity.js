// Visual families follow the regional references in docs/landmark-references.md.
// Every footprint keeps its surveyed dimensions and roof. Untagged facade colours,
// windows and gardens are a repeatable artistic interpretation, not a survey.
export function identityHash(value){
 let h=2166136261;for(const char of String(value)){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;
}
// Material tiles already carry their painted light and colour. These gentle
// tints distinguish neighbours without multiplying every facade into grey.
const plaster=[0xfff1d9,0xe5eddf,0xf2d8bc,0xddebef,0xe9dfd5,0xf8e7de];
const families=[
 {id:'eifel-stone',wall:'stone',upper:'stone',window:0,windowW:1.04,windowH:1.55,spacing:2.85,shutter:0x344b41,plinth:'stone',fence:'stone'},
 {id:'slate-gable',wall:'plaster',upper:'slate',window:1,windowW:1.32,windowH:1.42,spacing:3.15,shutter:null,plinth:'stone',fence:'hedge'},
 {id:'cream-cottage',wall:'plaster',upper:'plaster',window:2,windowW:1.12,windowH:1.44,spacing:2.95,shutter:0x343d43,plinth:'stone',fence:'timber'},
 {id:'red-brick',wall:'redBrick',upper:'redBrick',window:3,windowW:1.48,windowH:1.45,spacing:3.4,shutter:null,plinth:'dark',fence:'metal'},
 {id:'renovated-slate',wall:'plaster',upper:'slate',window:4,windowW:1.68,windowH:1.26,spacing:3.7,shutter:null,plinth:'dark',fence:'hedge'},
 {id:'pale-brick',wall:'brick',upper:'brick',window:5,windowW:1.46,windowH:1.48,spacing:3.4,shutter:null,plinth:'stone',fence:'metal'},
 {id:'ochre-cottage',wall:'plaster',upper:'plaster',window:6,windowW:1.06,windowH:1.62,spacing:2.9,shutter:0x63534b,plinth:'stone',fence:'timber'},
 {id:'modern-plaster',wall:'plaster',upper:'plaster',window:7,windowW:1.98,windowH:1.28,spacing:4.1,shutter:null,plinth:'dark',fence:'hedge'},
];
export const VILLAGE_STYLE_IDS=Object.freeze(families.map(p=>p.id));
export function buildingIdentity(building,bounds={}){
 const tags=building.tags||{},street=tags['addr:street']||'',seed=identityHash(building.id),roll=identityHash(building.id+':facade');
 const industrial=['garage','garages','shed','hut','industrial','warehouse','hangar','commercial'].includes(building.kind)||Math.max(bounds.w||0,bounds.d||0)>35;
 let candidates=street==='Kirchstraße'?[0,1,2,4,5,6]:street==='Bahnhofstraße'?[0,1,2,3,5,6]:street==='Im Pohl'?[1,2,3,4,5,7]:[0,1,2,3,4,5,6,7];
 let family=families[candidates[roll%candidates.length]];
 const explicit=String(tags['building:material']||tags['facade:material']||'').toLowerCase();
 if(explicit.includes('stone'))family=families[0];else if(explicit.includes('brick'))family=families[3];else if(explicit.includes('slate'))family=families[1];
 // The former 1864 village school beside the church is a known natural stone
 // landmark, never assigned a random contemporary plaster facade.
 if(building.id===93722371)family={...families[0],id:'historic-village-school',window:0,windowW:1.18,windowH:1.94,spacing:3.05,shutter:null};
 const roofPalette=[0xdce4e6,0xd1dce1,0xb9cbd7,0xe6ddd2,0xc1ccda];
 const roofMaterial=String(tags['roof:material']||'').toLowerCase(),roofColour=String(tags['roof:colour']||'').toLowerCase();
 const roofTile=roofMaterial.includes('metal')||industrial?2:roofMaterial.includes('wood')?3:roofMaterial.includes('tile')||roofColour.includes('red')?1:(seed>>>18)%11===0?1:0;
 return {...family,industrial,seed,roofTile,tint:family.wall==='plaster'?plaster[seed%plaster.length]:[0xffffff,0xf0e6d4,0xd8d2c5,0xe6e3de][seed%4],roofTint:roofPalette[(seed>>>4)%roofPalette.length],door:8+(seed>>>8)%4,split:family.upper!==family.wall,flowers:(seed>>>10)%3===0,pv:!industrial&&(seed>>>12)%4===0,garden:(seed>>>15)%3,shutterColor:family.shutter,signature:family.id+':'+(seed%plaster.length)+':'+((seed>>>4)%roofPalette.length)+':'+((seed>>>8)%4)};
}

export const FACADE_ATLAS_SIZE=512;
// One texture supplies all eight window designs, four doors and a solar panel.
// Packed UVs preserve a single shared material/draw call per facade chunk.
export function facadeAtlasPixels(){
 const size=FACADE_ATLAS_SIZE,tile=size/4,data=new Uint8Array(size*size*4);
 const frameColors=[[237,231,212],[211,211,200],[231,231,213],[44,52,54],[57,65,68],[229,222,204],[215,213,200],[35,43,47]];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const tx=x%tile,ty=y%tile,index=Math.floor(x/tile)+Math.floor(y/tile)*4,i=(y*size+x)*4;
  let color;
  if(index<8){
   const thick=index===7?5:index===0?9:7,edge=tx<thick||tx>tile-thick-1||ty<thick||ty>tile-thick-1;
   const mullion=(index<4||index===5)&&Math.abs(tx-tile/2)<3,transom=(index===0||index===2||index===6)&&Math.abs(ty-tile*.66)<3;
   const curtain=(index===2||index===6)&&(tx<26||tx>100),reflection=Math.max(0,1-Math.abs(tx+ty*.5-80)/18);
   const shade=Math.min(1,ty/tile),v=Math.sin(tx*.19+ty*.13+index)*1.3;
   // Painted depth and a broad soft reflected sky, instead of tiled blue noise
   // and a hard white slash. The inner shadow reads as a shallow window reveal.
   color=edge||mullion||transom?frameColors[index]:curtain?[222+v,217+v,197+v]:[55+shade*37+reflection*36+v,103+shade*39+reflection*43+v,134+shade*36+reflection*41+v];
   if(!edge&&!mullion&&!transom&&!curtain&&(tx<thick+3||ty>tile-thick-5))color=color.map(n=>n*.83);
   if(!edge&&!mullion&&!transom&&ty>113)color=[201,198,181];
  }else if(index<12){
   const edge=tx<7||tx>120||ty<6||ty>121,wood=index===8||index===10,glass=ty>63&&tx>23&&tx<104;
   const panel=tx>17&&tx<111&&(Math.abs(ty-25)<2||Math.abs(ty-52)<2||Math.abs(tx-18)<2||Math.abs(tx-110)<2);
   color=edge?[233,226,202]:glass?[92,166,193]:index===10?[96+(tx%7),132+(tx%7),91]:wood?[139+(tx%7),96+(tx%7),55]:index===9?[57,74,90]:[90,128,108];
   if(panel)color=wood?[66,48,33]:[34,47,43];if(tx>102&&tx<107&&ty>55&&ty<75)color=[192,198,192];
  }else if(index===12){
   const grid=tx%31<2||ty%21<2,glint=Math.abs(tx-ty*.35-42)<3;color=grid?[156,167,177]:glint?[74,114,153]:[24,45,66];
  }else color=[128,127,117];
  data[i]=color[0];data[i+1]=color[1];data[i+2]=color[2];data[i+3]=255;
 }
 return {data,width:size,height:size};
}
