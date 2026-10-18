const GAME_SURFACES='#garage,#hud,#view,#touch-controls,#dialog,#pause-screen,#results,#orientation-lock,#entry-screen,#tour-ui,.race-briefing,.start-briefing';

/** Keep a held game control from opening native copy/image menus. Text fields,
 * selects and real links retain their normal browser editing and link actions.
 * CSS supplies WebKit's touch-callout/user-select rules; this covers the native
 * events too, without suppressing pointer input or keyboard activation. */
export function installInteractionGuard(root=document){
 const editable=target=>{
  if(target.closest?.('input,textarea,select,a[href]'))return true;
  const editor=target.closest?.('[contenteditable]');
  return !!editor&&editor.getAttribute?.('contenteditable')!=='false';
 };
 const protect=event=>{
  const target=event.target?.nodeType===3?event.target.parentElement:event.target;
  if(!target||editable(target)||!target.closest?.(GAME_SURFACES))return;
  if(event.cancelable!==false)event.preventDefault();
 };
 for(const name of ['contextmenu','selectstart','dragstart'])root.addEventListener(name,protect,{capture:true,passive:false});
 return ()=>{for(const name of ['contextmenu','selectstart','dragstart'])root.removeEventListener(name,protect,{capture:true});};
}
