import * as THREE from 'three';

/** Cel shading for every lit material in the game (Lambert at low quality,
 * Standard/Physical above it), without swapping a single material: the sun's
 * diffuse term snaps into a lit band and a shade band with a narrow soft edge,
 * and sun shadows get a crisp rim instead of a long blur. The sky fill light
 * stays smooth, so shaded sides keep their colour instead of going flat grey.
 * Patching the shared shader chunks once keeps every existing program cache,
 * texture atlas hook and quality variant working as before. A material can opt
 * out with defines.SMOOTH_SHADING (the photo-textured cars: their texture
 * already carries the shading, and banding their dense normals looks dirty). */

export const TOON_BAND=Object.freeze({edge:.075,floor:.8});

const DIFFUSE='float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
const SHADOW_OPEN='directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]';
const SHADOW_CLOSE='vDirectionalShadowCoord[ i ] ) : 1.0;';

const helpers=`
#ifdef SMOOTH_SHADING
float comicBand( const in float x ) { return x; }
#else
float comicBand( const in float x ) { return smoothstep( 0.0, ${TOON_BAND.edge.toFixed(3)}, x ) * ( ${TOON_BAND.floor.toFixed(3)} + ${(1-TOON_BAND.floor).toFixed(3)} * x ); }
#endif
float comicShadow( const in float s ) { return smoothstep( 0.32, 0.68, s ); }
`;

let installed=false;
export function installToonShading(chunks=THREE.ShaderChunk){
 if(installed||chunks.lights_pars_begin.includes('comicBand'))return false;
 const patch=(name,from,to)=>{if(!chunks[name].includes(from))throw new Error('Toon shading: three.js chunk changed: '+name);chunks[name]=chunks[name].replace(from,to);};
 chunks.lights_pars_begin=helpers+chunks.lights_pars_begin;
 patch('lights_physical_pars_fragment',DIFFUSE,'float dotNL = comicBand( saturate( dot( geometryNormal, directLight.direction ) ) );');
 patch('lights_lambert_pars_fragment',DIFFUSE,'float dotNL = comicBand( saturate( dot( geometryNormal, directLight.direction ) ) );');
 patch('lights_fragment_begin',SHADOW_OPEN,'directLight.color *= ( directLight.visible && receiveShadow ) ? comicShadow( getShadow( directionalShadowMap[ i ]');
 patch('lights_fragment_begin',SHADOW_CLOSE,'vDirectionalShadowCoord[ i ] ) ) : 1.0;');
 installed=true;return true;
}
