/** The same authored route coordinates as the selection cards, drawn once
 * per selection/resize. This is a menu preview, never a generated map. */
export function drawGarageCourse(canvas, meta) {
  if (!canvas || !meta?.preview?.length) return;
  const width = Number(canvas.clientWidth);
  const height = Number(canvas.clientHeight);
  // Hidden/initial grid cells have no layout yet. Their eventual drawing
  // surface must never inherit an invented 640×360 or a 90px minimum height.
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) return false;
  const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const c = canvas.getContext('2d');
  if (!c) return false;
  c.setTransform(ratio, 0, 0, ratio, 0, 0);
  c.clearRect(0, 0, width, height);
  const b = meta.preview.reduce((a,p) => [Math.min(a[0],p[0]), Math.max(a[1],p[0]), Math.min(a[2],p[1]), Math.max(a[3],p[1])], [Infinity,-Infinity,Infinity,-Infinity]);
  const outerStroke = Math.max(2, Math.min(20, width*.075, height*.16));
  const padding = outerStroke/2 + Math.min(12, width*.035, height*.07);
  const labelSpace = width >= 220 && height >= 120 ? 25 : 0;
  const drawingHeight = Math.max(1, height - labelSpace);
  const scale = Math.max(0, Math.min((width-padding*2)/Math.max(1,b[1]-b[0]), (drawingHeight-padding*2)/Math.max(1,b[3]-b[2])));
  const X = x => (x-(b[0]+b[1])/2)*scale+width/2;
  const Z = z => (z-(b[2]+b[3])/2)*scale+drawingHeight/2;
  c.lineJoin = c.lineCap = 'round';
  for (const [color, lineWidth] of [['#0c162bbe',outerStroke], ['#667d99',outerStroke*.65], ['#fbd76c',outerStroke*.3]]) {
    c.strokeStyle=color;c.lineWidth=lineWidth;c.beginPath();
    meta.preview.forEach((p,i) => i ? c.lineTo(X(p[0]),Z(p[1])) : c.moveTo(X(p[0]),Z(p[1])));
    c.stroke();
  }
  const start = meta.preview[0], x=X(start[0]), y=Z(start[1]);
  const markerRadius = Math.min(9, Math.max(1, outerStroke*.44));
  c.fillStyle='#f12d4c';c.beginPath();c.arc(x,y,markerRadius,0,Math.PI*2);c.fill();
  c.strokeStyle='#fffdf5';c.lineWidth=Math.min(3,outerStroke*.15);c.stroke();
  if(labelSpace){
   c.font='700 12px Barlow,Arial,sans-serif';c.textAlign='center';c.fillStyle='#fff8dc';
   c.fillText('BREUER · START / ZIEL',width/2,height-8);
  }
  return true;
}
