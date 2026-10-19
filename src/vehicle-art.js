/** Pre-rendered views of the same meshes used by the WebGL renderer. */
import vehicleArtManifest from '../assets/vehicles/manifest.json' with {type: 'json'};
export const VEHICLE_ART_IDS = Object.freeze(['kadett', 'e30', 'm1', 'm2', 'gt3rs']);
export const VEHICLE_ART_FRAMES = 16;
export const VEHICLE_ART_ASPECT = 640 / 400;
export const VEHICLE_ART_VERSION = vehicleArtManifest.artHash || vehicleArtManifest.geometryHash;
const TAU = Math.PI * 2;
const framingCache=new Map();

/** One projection envelope for the entire turntable, never for one frame.
 * This keeps one metre the same size while the silhouette foreshortens. */
export function getVehicleArtFraming(index){
  if(!Number.isInteger(index)||!VEHICLE_ART_IDS[index])throw new RangeError('Unknown vehicle index');
  if(framingCache.has(index))return framingCache.get(index);
  const car=vehicleArtManifest.cars?.[index],width=vehicleArtManifest.width||640,height=vehicleArtManifest.height||400;
  const projected=vehicleArtManifest.framing?.bounds;
  const all=(vehicleArtManifest.cars||[]).flatMap(spec=>spec.files||[]).map(file=>file.contentBounds).filter(bounds=>bounds?.length===4&&bounds[2]>0&&bounds[3]>0);
  const minX=all.length?Math.min(...all.map(bounds=>bounds[0])):0,minY=all.length?Math.min(...all.map(bounds=>bounds[1])):0;
  const maxX=all.length?Math.max(...all.map(bounds=>bounds[0]+bounds[2])):width,maxY=all.length?Math.max(...all.map(bounds=>bounds[1]+bounds[3])):height;
  const bounds=projected?.length===4?projected:[minX,minY,maxX-minX,maxY-minY];
  const camera=vehicleArtManifest.camera||{},span=camera.orthographicWidth||6.26;
  const elevation=(camera.elevationDegrees??12)*Math.PI/180,targetHeight=camera.targetHeight??.63;
  // Compatibility with previous manifests: the old renderer already had a
  // constant orthographic camera, but did not write its projected ground point.
  const anchor=car?.framing?.groundAnchor||camera.groundAnchor||[width/2,height/2+targetHeight*Math.cos(elevation)*width/span];
  const framing={bounds,anchor,sourceSize:[width,height],pixelsPerMetre:camera.pixelsPerMetre||width/span};
  framingCache.set(index,framing);return framing;
}

/** Crop transparent padding without changing scale or the world-ground pivot. */
export function vehicleArtPlacement(index,frame,{x=0,y=0,width,height,fit=.88,anchorX=.5,anchorY=.64}={}){
  if(!(width>0&&height>0))return null;
  const framing=getVehicleArtFraming(index),[bx,by,bw,bh]=framing.bounds,[ox,oy]=framing.anchor;
  const inset=(1-Math.max(.1,Math.min(1,fit)))/2;
  anchorX=Math.max(inset+.001,Math.min(1-inset-.001,anchorX));
  anchorY=Math.max(inset+.001,Math.min(1-inset-.001,anchorY));
  const scale=Math.min(width*(anchorX-inset)/Math.max(.001,ox-bx),width*(1-inset-anchorX)/Math.max(.001,bx+bw-ox),
    height*(anchorY-inset)/Math.max(.001,oy-by),height*(1-inset-anchorY)/Math.max(.001,by+bh-oy));
  const source=vehicleArtManifest.cars?.[index]?.files?.find(file=>file.frame===frame)?.contentBounds||[0,0,...framing.sourceSize];
  const groundX=x+width*anchorX,groundY=y+height*anchorY;
  return {source,scale,left:groundX+(source[0]-ox)*scale,top:groundY+(source[1]-oy)*scale,
    width:source[2]*scale,height:source[3]*scale,groundX,groundY,sourceAnchor:framing.anchor,
    pixelsPerMetre:scale*framing.pixelsPerMetre};
}

/** Ground-pivot height that centres the whole fleet envelope inside a stage
 * of the given fit, so short landscape garages use their full height. */
export function naturalGroundY(fit=.94){
  const b=vehicleArtManifest.framing?.bounds,a=vehicleArtManifest.camera?.groundAnchor;
  if(!(b?.length===4&&b[3]>0&&a?.length===2))return .735;
  const inset=(1-fit)/2;return inset+(1-2*inset)*(a[1]-b[1])/b[3];
}

/** Showroom backdrop mode: every view is rendered with the painted garage's
 * own camera at the backdrop's exact pixel size (art/blender/ai_sprites.py).
 * Background and car then share one transform and the tyres stay on the
 * painted turntable at any stage size. */
export const VEHICLE_BACKDROP=Object.freeze(vehicleArtManifest.camera?.projection==='backdrop'?{
  image:vehicleArtManifest.camera.backdrop||'/nextlevel/garage-showroom.webp',
  width:vehicleArtManifest.width,height:vehicleArtManifest.height,
  anchor:vehicleArtManifest.camera.groundAnchor,safeWidth:vehicleArtManifest.camera.safeWidth||860,
}:null);

/** Cover the stage width, but never crop the turntable's middle. */
export function backdropTransform(width,height,backdrop=VEHICLE_BACKDROP,focus=.45){
  if(!backdrop||!(width>0&&height>0))return null;
  const {width:bw,height:bh,anchor,safeWidth}=backdrop;
  // A little wider than cover: the whole platform and car stay above the
  // showroom controls; the floor colour fills below the painting.
  const scale=Math.max(width/bw,Math.min(height/bh,width/safeWidth)*.82);
  // The showroom controls cover the stage's lower quarter, so the platform
  // sits at half height; the painted floor continues below as a flat colour.
  const x=width/2-bw/2*scale,y=Math.min(0,height*focus-anchor[1]*scale);
  return {scale,x,y};
}

export function vehicleArtBounds(index,frame){
  return vehicleArtManifest.cars?.[index]?.files?.find(file=>file.frame===frame)?.contentBounds||null;
}

export function frameIndexForAngle(angle = 0, count = VEHICLE_ART_FRAMES) {
  if (!Number.isFinite(angle)) angle = 0;
  return ((Math.round(angle / TAU * count) % count) + count) % count;
}

export function closestLoadedFrame(frames, requested, count = VEHICLE_ART_FRAMES) {
  if (frames.has(requested)) return requested;
  for (let delta = 1; delta <= count / 2; delta++) {
    const next = (requested + delta) % count;
    const previous = (requested - delta + count) % count;
    if (frames.has(next)) return next;
    if (frames.has(previous)) return previous;
  }
  return null;
}

export class VehicleArtLibrary {
  constructor({baseUrl = '/vehicles/', version = VEHICLE_ART_VERSION, imageFactory = () => new globalThis.Image(), onLoad = () => {}} = {}) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    this.imageFactory = imageFactory;
    this.onLoad = onLoad;
    this.version = version;
    this.cars = new Map();
    this.frameAccess=new Map();this.accessCounter=0;
  }

  touch(index,frame){this.frameAccess.set(index+':'+frame,++this.accessCounter);}

  entry(index) {
    if (!Number.isInteger(index) || !VEHICLE_ART_IDS[index]) throw new RangeError('Unknown vehicle index');
    if (!this.cars.has(index)) this.cars.set(index, {frames: new Map(), pending: new Map()});
    return this.cars.get(index);
  }

  loadFrame(index, frame) {
    const entry = this.entry(index);
    frame = ((frame % VEHICLE_ART_FRAMES) + VEHICLE_ART_FRAMES) % VEHICLE_ART_FRAMES;
    if (entry.frames.has(frame)){this.touch(index,frame);return Promise.resolve(entry.frames.get(frame));}
    if (entry.pending.has(frame)) return entry.pending.get(frame);
    const pending = new Promise((resolve, reject) => {
      const img = this.imageFactory();
      img.decoding = 'async';
      img.onload = () => {
        if (!(img.naturalWidth || img.width) || !(img.naturalHeight || img.height)) {
          entry.pending.delete(frame);
          reject(new Error('Empty vehicle artwork'));
          return;
        }
        entry.frames.set(frame, img);
        this.touch(index,frame);
        entry.pending.delete(frame);
        this.onLoad(index, frame);
        resolve(img);
      };
      img.onerror = () => {
        entry.pending.delete(frame);
        reject(new Error('Vehicle artwork could not be loaded'));
      };
      img.src = `${this.baseUrl}${VEHICLE_ART_IDS[index]}/${String(frame).padStart(2, '0')}.webp${this.version ? '?v=' + encodeURIComponent(this.version) : ''}`;
    });
    entry.pending.set(frame, pending);
    return pending;
  }

  /** Returns the first useful view promptly; other views load in the background. */
  async load(index, {angle = Math.PI / 4, all = true} = {}) {
    const first = frameIndexForAngle(angle);
    const img = await this.loadFrame(index, first);
    if (all) {
      // Neighbouring views arrive first, so dragging never waits for a distant rear view.
      const order = [];
      for (let delta = 1; delta <= VEHICLE_ART_FRAMES / 2; delta++) {
        order.push((first + delta) % VEHICLE_ART_FRAMES, (first - delta + VEHICLE_ART_FRAMES) % VEHICLE_ART_FRAMES);
      }
      void Promise.allSettled([...new Set(order)].map(frame => this.loadFrame(index, frame)));
    }
    return img;
  }

  get(index, angle = 0) {
    const entry = this.entry(index);
    const frame = closestLoadedFrame(entry.frames, frameIndexForAngle(angle));
    if(frame!==null)this.touch(index,frame);
    return frame === null ? null : entry.frames.get(frame);
  }

  /** Called by the DOM garage, without changing cache policy for other users.
   * Keep the current 16-view turntable; discard older cars beyond a small bound.
   * Existing image references remain valid while their request finishes. */
  trim({maxFrames=24,keepCar=-1}={}){
    maxFrames=Math.max(VEHICLE_ART_FRAMES,Math.trunc(maxFrames)||24);
    const records=[];
    for(const [index,entry] of this.cars)for(const frame of entry.frames.keys())records.push({index,frame,at:this.frameAccess.get(index+':'+frame)||0});
    records.sort((a,b)=>a.at-b.at);let remaining=records.length,removed=0;
    for(const {index,frame} of records){
      if(remaining<=maxFrames)break;if(index===keepCar)continue;
      this.cars.get(index).frames.delete(frame);this.frameAccess.delete(index+':'+frame);remaining--;removed++;
    }
    return removed;
  }

  has(index) { return this.entry(index).frames.size > 0; }

  /** Draws with preserved proportions. False asks the caller to use its fallback. */
  draw(ctx, index, angle, {x, y, width, height, opacity = 1, contentFit = false,fit=1,anchorX=.5,anchorY=.64}) {
    const img = this.get(index, angle);
    if (!img || !(width > 0 && height > 0)) return false;
    const imageWidth = img.naturalWidth || img.width;
    const imageHeight = img.naturalHeight || img.height;
    const entry=this.entry(index),frame=closestLoadedFrame(entry.frames,frameIndexForAngle(angle));
    ctx.save();
    ctx.globalAlpha *= Math.max(0, Math.min(1, opacity));
    if(contentFit){
      const p=vehicleArtPlacement(index,frame,{x,y,width,height,fit,anchorX,anchorY});
      ctx.drawImage(img,...p.source,p.left,p.top,p.width,p.height);
    }else{
      const scale=Math.min(width/imageWidth,height/imageHeight),w=imageWidth*scale,h=imageHeight*scale;
      ctx.drawImage(img,x+(width-w)/2,y+(height-h)/2,w,h);
    }
    ctx.restore();
    return true;
  }
}

let shared;
export function getVehicleArtLibrary() { return shared ??= new VehicleArtLibrary(); }
export function loadVehicleArt(index, options) { return getVehicleArtLibrary().load(index, options); }
export function getVehicleArt(index, angle) { return getVehicleArtLibrary().get(index, angle); }
export function drawVehicleArt(ctx, index, angle, rect) { return getVehicleArtLibrary().draw(ctx, index, angle, rect); }
