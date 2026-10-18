#!/usr/bin/env node
/**
 * Offline form review of the real Three.js landmark geometry.
 * Uses Three's SVGRenderer/Projector, not browser automation or WebGL.
 * Texture pixels are averaged into material colours; textures, shadows and PBR
 * are not reproduced. Photographs, when present, go only into a comparison sheet.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import * as THREE from 'three';
import {SVGRenderer} from 'three/addons/renderers/SVGRenderer.js';
import {installLandmarks} from '../src/landmarks.js';
import {sampleGround} from '../src/tracks.js';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argv=process.argv.slice(2);
const option=(name,fallback)=>{const i=argv.indexOf(name);return i<0?fallback:argv[i+1];};
const output=path.resolve(option('--out',path.join(project,'deliverables','Modellansichten')));
const references=path.resolve(option('--references-dir',path.join(project,'..','research','landmarks')));
const makePNG=!argv.includes('--skip-png');
const width=1280,height=860,viewHeight=700,svgNS='http://www.w3.org/2000/svg';
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

// Only APIs actually used by SVGRenderer and the model's procedural sign helper.
class Element {
  constructor(name){this.tagName=name;this.attributes=new Map();this.childNodes=[];this.style={};this.parentNode=null;}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  getAttribute(name){return this.attributes.get(name)??null;}
  appendChild(child){if(child.parentNode)child.parentNode.removeChild(child);child.parentNode=this;this.childNodes.push(child);return child;}
  removeChild(child){const i=this.childNodes.indexOf(child);if(i>=0)this.childNodes.splice(i,1);child.parentNode=null;return child;}
  get outerHTML(){
    const attrs=new Map(this.attributes);
    const styles=Object.entries(this.style).map(([k,v])=>k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+':'+v).join(';');
    if(styles)attrs.set('style',(attrs.get('style')||'')+';'+styles);
    return '<'+this.tagName+' '+[...attrs].map(([k,v])=>k+'="'+escape(v)+'"').join(' ')+'>'+this.childNodes.map(c=>c.outerHTML).join('')+'</'+this.tagName+'>';
  }
}
function canvas(){
  const c={width:0,height:0,_offlineBackground:'#262a2d',_offlineText:[]};
  const ctx={fillStyle:'#000',font:'',textAlign:'',textBaseline:'',fillRect(){c._offlineBackground=this.fillStyle;},fillText(text){c._offlineText.push(String(text));}};
  c.getContext=()=>ctx;return c;
}
const fakeLogo={width:512,height:215,complete:true,_offlineBackground:'#26272a'};
globalThis.document={createElementNS:(_,name)=>new Element(name),createElement:name=>name==='canvas'?canvas():new Element(name),querySelector:selector=>selector==='.logo'?fakeLogo:null};

function simplifiedMaterial(material,cache){
  if(cache.has(material))return cache.get(material);
  if(!material?.isMaterial)throw new Error('A landmark contains an invalid THREE.Material.');
  const m=material.clone(),image=m.map?.image;
  if(image?.data){
    const data=image.data,channels=data.length/(image.width*image.height),sum=[0,0,0];let weight=0;
    for(let i=0;i<data.length;i+=channels){const alpha=channels>3?data[i+3]/255:1;for(let j=0;j<3;j++)sum[j]+=data[i+j]*alpha;weight+=alpha;}
    if(weight)m.color.multiply(new THREE.Color().setRGB(sum[0]/weight/255,sum[1]/weight/255,sum[2]/weight/255,THREE.SRGBColorSpace));
  }else if(image?._offlineBackground){m.color.multiply(new THREE.Color(image._offlineBackground));}
  m.map=null;cache.set(material,m);return m;
}
function reviewCopy(source){
  const copy=source.clone(true),cache=new Map();
  copy.traverse(o=>{if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(m=>simplifiedMaterial(m,cache)):simplifiedMaterial(o.material,cache);});
  return copy;
}
function corners(box){const points=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new THREE.Vector3(x,y,z));return points;}
function cameraFor(model,view){
  model.updateMatrixWorld(true);
  const worldBox=new THREE.Box3().setFromObject(model);
  const focus=view.localBox?new THREE.Box3(new THREE.Vector3(...view.localBox[0]),new THREE.Vector3(...view.localBox[1])).applyMatrix4(model.matrixWorld):worldBox;
  const target=view.target?model.localToWorld(new THREE.Vector3(...view.target)):focus.getCenter(new THREE.Vector3());
  const extent=focus.getSize(new THREE.Vector3()).length();
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,Math.max(500,extent*12));
  if(view.eye)camera.position.copy(model.localToWorld(new THREE.Vector3(...view.eye)));
  else camera.position.copy(target).add(new THREE.Vector3(...view.direction).normalize().applyQuaternion(model.quaternion).multiplyScalar(extent*3));
  camera.lookAt(target);camera.updateMatrixWorld(true);
  const projected=corners(focus).map(p=>p.applyMatrix4(camera.matrixWorldInverse));
  const minX=Math.min(...projected.map(p=>p.x)),maxX=Math.max(...projected.map(p=>p.x)),minY=Math.min(...projected.map(p=>p.y)),maxY=Math.max(...projected.map(p=>p.y));
  const shift=new THREE.Vector3();
  // Translate in the camera's actual right/up basis; transformDirection normalises.
  shift.setFromMatrixColumn(camera.matrixWorld,0).multiplyScalar((minX+maxX)/2);
  shift.add(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1).multiplyScalar((minY+maxY)/2));
  camera.position.add(shift);camera.updateMatrixWorld(true);
  const halfH=Math.max((maxY-minY)/2,(maxX-minX)/(2*(width/viewHeight)))*1.12;
  camera.left=-halfH*width/viewHeight;camera.right=-camera.left;camera.bottom=-halfH;camera.top=halfH;camera.updateProjectionMatrix();return camera;
}
function renderView(model,spec,view){
  const copy=reviewCopy(model),scene=new THREE.Scene();scene.add(copy);
  // SVGRenderer ignores AmbientLight.intensity; encode ambient strength in colour.
  scene.add(new THREE.AmbientLight(new THREE.Color().setRGB(.51,.54,.57)));
  const sunlight=new THREE.DirectionalLight(0xfff3df,.60);sunlight.position.copy(new THREE.Vector3(-.6,1.5,1.1).applyQuaternion(copy.quaternion));scene.add(sunlight);
  const camera=cameraFor(copy,view),renderer=new SVGRenderer();renderer.setSize(width,viewHeight);renderer.setPrecision(2);renderer.overdraw=.25;renderer.setQuality('high');renderer.render(scene,camera);
  const node=renderer.domElement;node.style={};node.setAttribute('x',0);node.setAttribute('y',96);node.setAttribute('xmlns',svgNS);
  const source=model.userData.sourceGeometry?'Amtliche Dachflächen + stilisierte Fassadendetails':'Beobachtete Architektur; Dachform und Höhe interpretiert';
  const svg='<?xml version="1.0" encoding="UTF-8"?>\n'+
    '<svg xmlns="'+svgNS+'" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'">'+
    '<title>'+escape(spec.title+' – '+view.label)+'</title><desc>Offline-Projektion der tatsächlichen Three.js-Geometrie, ohne WebGL, Texturen, Schatten oder PBR.</desc>'+
    '<rect width="100%" height="100%" fill="#f2f3ef"/>'+
    '<rect x="32" y="30" width="5" height="46" fill="#d42937"/>'+
    '<text x="52" y="52" font-family="DejaVu Sans,sans-serif" font-size="26" font-weight="700" fill="#24272b">'+escape(spec.title)+'</text>'+
    '<text x="52" y="76" font-family="DejaVu Sans,sans-serif" font-size="14" fill="#62696e">'+escape(view.label+' · '+source)+'</text>'+
    node.outerHTML+
    '<text x="36" y="824" font-family="DejaVu Sans,sans-serif" font-size="13" fill="#62696e">Formprüfung · SVGRenderer / Projector · Materialfarben gemittelt · '+renderer.info.render.faces+' sichtbare Dreiecke</text>'+
    '<text x="36" y="847" font-family="DejaVu Sans,sans-serif" font-size="12" fill="#767d80">Texturen, Schildertexte, Schatten und WebGL-Beleuchtung sind in dieser Prüfung nicht wiedergegeben.</text></svg>';
  return {svg,faces:renderer.info.render.faces};
}

const specs=[
  {id:'breuer',file:'01-breuer',title:'Fahrzeugtechnik Breuer',views:[{id:'hof',label:'Hof und Gebäudegruppen',direction:[.75,.72,1.50]},{id:'gegenansicht',label:'Straßenflügel und Werkstatthalle',direction:[-1.05,.57,1.50]},
    {id:'werkstatt',label:'Blick in beide Arbeitsbuchten und Hebebühnen',eye:[1.0,2.08,22],target:[-2.6,1.80,-10],localBox:[[-8.5,0,-15.4],[3.1,3.6,.6]]}]},
  {id:'bakery',file:'02-leo',title:'LEO · Café zur Pol-Ecke',views:[{id:'terrasse',label:'Straßenfront, Windfang und Terrasse',direction:[.85,.57,1.50]},{id:'dach',label:'Amtliches Dach und Gebäudetiefe',direction:[-1.05,.95,1.25]}]},
  {id:'school',file:'03-kalltalschule',title:'Kalltalschule',views:[{id:'hof',label:'Verbundene Flügel und niedriger blauer Anbau',direction:[.75,.80,1.45]},{id:'dach',label:'Dachgruppen und Grundriss',direction:[-1.15,1.25,1.50]}]},
  {id:'museum',file:'04-bauernmuseum',title:'Bauernmuseum Lammersdorf',views:[{id:'front',label:'Fachwerkfront und Straßenkante',direction:[.80,.48,1.60]},{id:'giebel',label:'Giebel, amtliches Dach und Schornstein',direction:[-1.35,.70,1.15]}]},
  {id:'chapelTower',file:'05-kapellenturm',title:'Kapellenturm Lammersdorf',views:[{id:'front',label:'Offene A-Stützen und Lamellenband',direction:[.65,.24,1.70]},{id:'seite',label:'Schlanke Spitze · unvermessen',direction:[-1.45,.43,1.25]}]},
];
await fs.mkdir(output,{recursive:true});
const map=JSON.parse(await fs.readFile(path.join(project,'src','tracks','base.json'),'utf8'));
const installed=installLandmarks(new THREE.Group(),map,null,2,{sampleGround});
const manifest={generatedAt:new Date().toISOString(),method:'Three.js SVGRenderer / Projector; orthographic cameras',limitations:['No WebGL','No texture detail or sign text','No shadows or PBR; material maps averaged','Painter sorting can differ from a depth-buffer renderer'],stats:installed.stats,views:[]};
for(const spec of specs){
  const model=installed.byId[spec.id];if(!model)throw new Error('Missing landmark '+spec.id);
  for(const view of spec.views){const result=renderView(model,spec,view),name=spec.file+'-'+view.id,svgPath=path.join(output,name+'.svg');await fs.writeFile(svgPath,result.svg);
    const entry={modelId:spec.id,title:spec.title,view:view.id,label:view.label,svg:name+'.svg',faces:result.faces,sourcedRoof:!!model.userData.sourceGeometry};
    if(makePNG){const pngPath=path.join(output,name+'.png'),conversion=spawnSync('inkscape',['--app-id-tag=landmark-review-'+process.pid+'-'+name,'--batch-process',svgPath,'--export-type=png','--export-filename='+pngPath,'--export-background=#f2f3ef'],{encoding:'utf8',timeout:30000});
      if(conversion.status!==0)throw new Error('SVG-to-PNG conversion failed: '+(conversion.error?.message||conversion.stderr));
      const png=await fs.readFile(pngPath);if(png.subarray(-8,-4).toString()!=='IEND')throw new Error('SVG-to-PNG export was incomplete: '+name);
      entry.png=name+'.png';}
    manifest.views.push(entry);
  }
}
await fs.writeFile(path.join(output,'render-manifest.json'),JSON.stringify(manifest,null,2)+'\n');

// Compose a contact sheet and a private photo comparison. References never enter
// the Three scene, the application assets, or any model material.
if(makePNG){
  const composition=spawnSync('python',['-c',String.raw`
import json,os,sys
from PIL import Image,ImageDraw,ImageFont,ImageOps
data=json.load(sys.stdin); out=data['output']; entries=data['manifest']['views']
fontpath='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font=lambda size:ImageFont.truetype(fontpath,size)
selected=[e for e in entries if e['view']!='werkstatt']
cell_w,cell_h=768,516
board=Image.new('RGB',(cell_w*2,cell_h*5+96),'#e9ece6');draw=ImageDraw.Draw(board)
draw.text((28,24),'Lammersdorf · Geometrieprüfung der fünf Landmarken',fill='#252a2d',font=font(27))
draw.text((28,63),'Echte Three-Geometrie · SVG-Projektion · keine WebGL-/Texturprüfung',fill='#687174',font=font(17))
for i,e in enumerate(selected):
 image=Image.open(os.path.join(out,e['png'])).convert('RGB');image=ImageOps.contain(image,(cell_w,cell_h))
 x=(i%2)*cell_w+(cell_w-image.width)//2;y=96+(i//2)*cell_h+(cell_h-image.height)//2;board.paste(image,(x,y))
board.save(os.path.join(out,'00-alle-landmarken.png'))
references=[('breuer1.jpg','breuer','Betreiberfoto · Fahrzeugtechnik Breuer'),('bakery-old.jpg','bakery','Historisches Außenfoto · frühere Prümmer-Filiale'),('school-home.jpg','school','Luftbild des Schulbetreibers · Kalltalschule')]
available=[r for r in references if os.path.isfile(os.path.join(data['references'],r[0]))]
if available:
 compare=Image.new('RGB',(1600,100+560*len(available)),'#eef0ea');draw=ImageDraw.Draw(compare)
 draw.text((28,23),'Privater Architekturvergleich · Referenzfotos und Modellformen',fill='#252a2d',font=font(27))
 draw.text((28,64),'Fotos ausschließlich hier als Referenz; nicht als Texturen im Spiel. Quellen in docs/landmark-references.md.',fill='#626b6d',font=font(16))
 for row,(filename,model,caption) in enumerate(available):
  y=100+560*row;reference=Image.open(os.path.join(data['references'],filename)).convert('RGB');reference=ImageOps.contain(reference,(744,465))
  compare.paste(reference,(28+(744-reference.width)//2,y+58+(465-reference.height)//2))
  render=next(e for e in entries if e['modelId']==model); image=Image.open(os.path.join(out,render['png'])).convert('RGB');image=ImageOps.contain(image,(800,537))
  compare.paste(image,(800+(800-image.width)//2,y+(537-image.height)//2))
  draw.text((28,y+14),caption,fill='#424b4f',font=font(18))
  draw.text((28,y+535),'Historische Fotos sind kein Nachweis für die aktuelle Beschilderung.',fill='#697275',font=font(14))
 compare.save(os.path.join(out,'00-privater-fotovergleich.png'))
print('Contact sheet and reference comparison written.')
`],{input:JSON.stringify({output,references,manifest}),encoding:'utf8',timeout:30000});
  if(composition.status!==0)throw new Error('Contact sheet failed: '+(composition.error?.message||composition.stderr));
}
console.log(JSON.stringify({output,models:installed.stats.landmarkModelCount,views:manifest.views.length,triangles:installed.stats.landmarkTriangleCount,png:makePNG},null,2));
