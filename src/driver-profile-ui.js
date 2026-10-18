const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=time=>Number.isFinite(time)?time.toFixed(2).replace('.',',')+' s':'–';

/** Separate name/pass pages keep native file controls out of name entry.
 * Credentials never enter document markup or URLs. */
export function createDriverProfileUI({root=document,client,dialog,dialogHead,closeDialog,notify,getCategory,getTrackName}){
 const $=id=>root.getElementById(id),win=root.defaultView||globalThis;
 const subscriptions=[];let generation=0,destroyed=false,draftName='',viewportBaseline=Number(win.visualViewport?.height)||Number(win.innerHeight)||900,viewportLayoutWidth=Number(win.innerWidth)||Number(win.visualViewport?.width)||900,keyboardOpen=false;
 const listen=(target,type,handler)=>{if(!target?.addEventListener)return;target.addEventListener(type,handler);subscriptions.push(()=>target.removeEventListener(type,handler));};
 function updateViewport(){
  const page=$('profile-page'),shade=$('dialog');if(!shade||shade.hidden){keyboardOpen=false;return;}
  const vv=win.visualViewport,height=Number(vv?.height)||Number(win.innerHeight)||900,width=Number(vv?.width)||Number(win.innerWidth)||900;
  for(const [key,value]of Object.entries({top:Math.max(0,Number(vv?.offsetTop)||0),left:Math.max(0,Number(vv?.offsetLeft)||0),height:Math.max(1,height),width:Math.max(1,width)}))shade.style?.setProperty?.('--profile-vv-'+key,value+'px');
  const active=root.activeElement,editing=active?.isConnected!==false&&!!active?.closest?.('#dialog')&&['INPUT','TEXTAREA'].includes(active?.tagName)&&!['file','checkbox','range'].includes(active?.getAttribute?.('type'));
  const layoutWidth=Number(win.innerWidth)||width;
  if(Math.abs(layoutWidth-viewportLayoutWidth)>80){viewportBaseline=Math.max(height,Number(win.innerHeight)||height);viewportLayoutWidth=layoutWidth;keyboardOpen=false;}
  viewportBaseline=Math.max(viewportBaseline,height,Number(win.innerHeight)||height);
  const reducedHeight=height<viewportBaseline-80;
  // A tap on Save can blur the input before pointerup. Keep the compact
  // layout until the keyboard actually leaves, so the action never moves.
  keyboardOpen=(editing||keyboardOpen)&&reducedHeight;
  shade.dataset.keyboard=String(keyboardOpen);
  if(page)page.dataset.keyboard=String(page.dataset.profileStep==='name'&&keyboardOpen);
 }
 listen(win.visualViewport,'resize',updateViewport);listen(win.visualViewport,'scroll',updateViewport);listen(win,'resize',updateViewport);listen(root,'focusin',updateViewport);listen(root,'focusout',updateViewport);
 if(win.MutationObserver&&$('dialog')){const observer=new win.MutationObserver(updateViewport);observer.observe($('dialog'),{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});subscriptions.push(()=>observer.disconnect());}
 const current=(serial,node)=>!destroyed&&serial===generation&&node?.isConnected&&!$('dialog')?.hidden;
 function finish(onReady){closeDialog(false);if(client.profile&&onReady)onReady();}
 function updateButton(){const button=$('open-profile');if(button){button.dataset.hasProfile=String(!!client.profile);button.setAttribute('aria-label',client.profile?'Fahrerprofil: '+client.profile.name:'Fahrername für die Bestenliste wählen');const text=button.querySelector('[data-profile-name]');if(text)text.textContent=client.profile?.name||'Profil';}}
 function profile({onReady=null,readyLabel='Zeit eintragen',step=null,message=''}={}){
  if(destroyed)return;
  const own=client.profile,view=step==='pass'?'pass':own?'summary':'name',serial=++generation,options={onReady,readyLabel};
  let content,footer;
  if(view==='name'){
   content=`<form id="driver-name-form" class="profile-name-form"><label for="driver-name">Dein Fahrername</label><input id="driver-name" name="driver-name" minlength="2" maxlength="20" placeholder="z. B. EifelRacer" autocomplete="nickname" autocapitalize="off" spellcheck="false" required aria-describedby="driver-name-hint profile-feedback"><p id="driver-name-hint" class="profile-name-hint">2–20 Zeichen. Dein Name gehört nur dir.</p></form><button id="profile-open-pass" class="profile-pass-link secondary" type="button">Ich habe einen Fahrerpass</button>`;
   footer='<button id="profile-done" class="secondary" type="button">Später</button><button id="driver-name-save" type="submit" form="driver-name-form" class="primary">Name sichern</button>';
  }else if(view==='summary'){
   content=`<section class="profile-summary"><strong class="profile-driver-name">${escape(own.name)}</strong><span class="profile-reserved">Dein Fahrername</span><p>Deine Bestzeiten werden mit diesem Namen gespeichert.</p></section><button id="profile-open-pass" class="profile-pass-link secondary" type="button">Fahrerpass verwalten</button>`;
   footer=`<button id="profile-done" class="primary" type="button">${onReady?escape(readyLabel):'Fertig'}</button>`;
  }else{
   content=`<section class="profile-pass-intro"><p>${own?'Nimm deinen Fahrer auf ein anderes Gerät mit.':'Melde deinen bisherigen Fahrer mit seiner Passdatei an.'}</p>${own?`<strong>${escape(own.name)}</strong>`:''}</section><div class="profile-pass-tools"><button id="driver-pass-choose" type="button" class="${own?'secondary':'primary'}" aria-controls="driver-pass-file">Pass laden</button>${own?'<button id="driver-pass-export" class="primary" type="button">Pass speichern</button>':''}<input id="driver-pass-file" class="profile-file-input" type="file" accept="application/json,.json" tabindex="-1" aria-hidden="true"></div>`;
   footer='<button id="profile-pass-back" class="secondary" type="button">Zurück</button><button id="profile-done" class="secondary" type="button">Schließen</button>';
  }
  const status=message||(own&&!client.persistent?'Nur für diese Sitzung gespeichert. Sichere deinen Fahrerpass.':'');
  dialog(`${dialogHead(view==='pass'?'Fahrerpass':view==='summary'?'Dein Fahrer':'Dein Fahrername')}<div class="dialog-pages profile-page" id="profile-page" data-profile-step="${view}" data-keyboard="false">${content}<p id="profile-feedback" class="profile-feedback" role="status" aria-live="polite">${escape(status)}</p></div><footer class="dialog-footer profile-actions">${footer}</footer>`,false,true);
  $('profile-done').onclick=()=>view==='summary'?finish(onReady):closeDialog(false);
  if($('profile-open-pass'))$('profile-open-pass').onclick=()=>{if($('driver-name'))draftName=$('driver-name').value;profile({...options,step:'pass'});};
  if($('profile-pass-back'))$('profile-pass-back').onclick=()=>{profile(options);$('driver-name')?.focus({preventScroll:true});updateViewport();};
  if($('driver-name-form')){
   const input=$('driver-name');input.value=draftName;
   input.oninput=()=>{draftName=input.value;input.removeAttribute('aria-invalid');const feedback=$('profile-feedback');if(feedback?.dataset.state==='error'){feedback.textContent='';feedback.removeAttribute('data-state');}};
   $('driver-name-form').onsubmit=async event=>{
    event.preventDefault();const name=input.value,feedback=$('profile-feedback'),button=$('driver-name-save');if(button.disabled)return;draftName=name;
    button.disabled=true;feedback.textContent='Name wird geprüft …';feedback.removeAttribute('data-state');
    try{await client.create(name);updateButton();if(!current(serial,feedback))return;draftName='';notify('Dein Fahrername ist reserviert.');if(onReady)finish(onReady);else profile({message:'Dein Fahrer ist bereit.'});}
    catch(error){if(!current(serial,feedback))return;feedback.textContent=error.message;feedback.dataset.state='error';button.disabled=false;input.setAttribute('aria-invalid','true');input.focus({preventScroll:true});updateViewport();}
   };
  }
  if($('driver-pass-file')){
   const input=$('driver-pass-file');$('driver-pass-choose').onclick=()=>input.click();
   input.onchange=async event=>{
    const file=event.target.files?.[0],feedback=$('profile-feedback');if(!file)return;
    feedback.textContent='Fahrerpass wird geprüft …';feedback.removeAttribute('data-state');
    try{if(file.size>8000)throw new Error('Diese Datei ist kein gültiger Fahrerpass.');await client.restore(await file.text());updateButton();if(!current(serial,feedback))return;if(onReady)finish(onReady);else profile({message:'Dein Fahrerpass ist geladen.'});}
    catch(error){if(current(serial,feedback)){feedback.textContent=error.message;feedback.dataset.state='error';}}
   };
  }
  if($('driver-pass-export'))$('driver-pass-export').onclick=()=>{
   const url=URL.createObjectURL(new Blob([JSON.stringify(client.exportPass(),null,2)],{type:'application/json'})),link=root.createElement('a');link.href=url;link.download='Breuer-GP-privater-Fahrerpass.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('profile-feedback').textContent='Pass gespeichert. Bewahre die Datei privat auf.';$('profile-feedback').dataset.state='success';
  };
  updateViewport();
 }
 async function leaderboard(config=getCategory()){
  if(destroyed)return;
  const serial=++generation,category={...config};
  dialog(`${dialogHead('Bestenliste')}<div class="dialog-pages leaderboard-body"><div class="leaderboard-empty-art" aria-hidden="true"></div><p class="leaderboard-category">${escape(getTrackName(category.trackId))} · ${category.laps} ${category.laps===1?'Runde':'Runden'} · ${category.raceType==='online'?'Online':'Solo'}</p><p class="leaderboard-state" id="leaderboard-state" role="status">Bestenliste wird geladen …</p><ol id="leaderboard-list" class="leaderboard-list"></ol><p id="leaderboard-own" class="leaderboard-own"></p><p class="leaderboard-note">Gleiche Autos, Fahrhilfen und Rennregeln.</p></div><footer class="dialog-footer profile-actions"><button id="leaderboard-profile" class="secondary">Mein Fahrer</button><button id="leaderboard-refresh" class="primary">Aktualisieren</button></footer>`,true,true);
  $('leaderboard-profile').onclick=()=>profile({onReady:()=>leaderboard(category),readyLabel:'Bestenliste'});$('leaderboard-refresh').onclick=()=>leaderboard(category);
  const state=$('leaderboard-state'),list=$('leaderboard-list'),own=$('leaderboard-own');
  const height=Number(win.visualViewport?.height)||Number(win.innerHeight)||900,limit=height<300?2:height<500?3:5;
  try{const data=await client.board(category,{limit});if(!current(serial,state))return;
   state.closest('.leaderboard-body')?.classList.toggle('is-empty',!data.top.length);
   state.textContent=data.top.length?`${data.totalPlayers} Fahrer in dieser Wertung`:'Noch kein Rekord. Deine Strecke wartet.';
   list.innerHTML=data.top.slice(0,limit).map(row=>`<li${row.profileId===client.profile?.id?' class="is-you" data-current="true"':''}><span class="rank">${row.rank}</span><strong class="driver">${escape(row.name)}</strong><span class="time">${label(row.time)}</span></li>`).join('');
   own.textContent=data.own?'Dein Rang: '+data.own.rank+' · '+label(data.own.time):client.profile?'Hier wartet deine erste Zeit.':'Wähle deinen Fahrer, um Zeiten einzutragen.';
  }catch(error){if(current(serial,state)){state.textContent=error.message;state.dataset.state='error';}}
 }
 if($('open-profile'))$('open-profile').onclick=()=>profile();
 if($('open-leaderboard'))$('open-leaderboard').onclick=()=>leaderboard();
 updateButton();return {profile,leaderboard,updateButton,destroy(){if(destroyed)return;destroyed=true;++generation;for(const unsubscribe of subscriptions)unsubscribe();}};
}
