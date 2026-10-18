/**
 * A finite entry/loading layer. Readiness follows the game, never a timer or
 * the decorative movie. Racing releases both the decoder and the focus trap.
 */
export class EntryScreen {
 constructor({root = document, reduced = false, onEnter = () => {}} = {}) {
  this.root = root;
  this.doc = root.ownerDocument || root;
  this.win = this.doc.defaultView || globalThis;
  this.byId = id => root.getElementById?.(id) || root.querySelector?.(`#${id}`);
  this.element = this.byId('entry-screen');
  this.button = this.byId('entry-enter');
  if (!this.element || !this.button) throw new Error('EntryScreen needs #entry-screen and #entry-enter');
  this.video = this.byId('entry-video');
  this.phase = this.byId('entry-phase');
  this.loadingElement = this.byId('course-loading');
  this.loadingPhase = this.byId('course-loading-phase');
  this.onEnter = onEnter;
  this._ready = false;
  this._entered = false;
  this._loading = false;
  this._destroyed = false;
  this._videoFailed = false;
  this._playToken = 0;
  this._playRequested = false;
  this._subscriptions = [];
  this._locks = new Map();
  this._previousFocus = this.doc.activeElement;
  this._loadingPreviousFocus = null;
  this._motionQuery = this.win.matchMedia?.('(prefers-reduced-motion: reduce)');
  this._forcedReduced = Boolean(reduced);
  this._reduced = this._forcedReduced || Boolean(this._motionQuery?.matches);
  this.element.hidden = false;
  this.element.dataset.ready = 'false';
  this.element.dataset.loading = 'false';
  this.element.dataset.video = 'poster';
  this.button.disabled = true;
  if (this.loadingElement) this.loadingElement.hidden = true;
  if (this.video) {
   this.video.muted = true;
   this.video.defaultMuted = true;
   this.video.playsInline = true;
  }
  this._listen(this.button, 'click', () => this.enter());
  this._listen(this.doc, 'keydown', event => this._onKey(event), true);
  this._listen(this.doc, 'focusin', event => this._onFocus(event), true);
  this._listen(this.doc, 'visibilitychange', () => this._syncVideo());
  this._listen(this.win, 'pagehide', () => this._pauseVideo());
  this._listen(this.win, 'pageshow', () => this._syncVideo());
  this._listen(this.video, 'error', () => {
   this._videoFailed = true;
   this._pauseVideo();
  });
  const onMotionChange = () => {
   this._reduced = this._forcedReduced || Boolean(this._motionQuery?.matches);
   this._syncVideo();
  };
  if (this._motionQuery?.addEventListener) this._listen(this._motionQuery, 'change', onMotionChange);
  else if (this._motionQuery?.addListener) {
   this._motionQuery.addListener(onMotionChange);
   this._subscriptions.push(() => this._motionQuery.removeListener?.(onMotionChange));
  }
  this._setBlocked(true);
  this._pauseVideo();
  this._focusModal();
 }

 _listen(target, type, listener, capture = false) {
  if (!target?.addEventListener) return;
  target.addEventListener(type, listener, capture);
  this._subscriptions.push(() => target.removeEventListener(type, listener, capture));
 }

 _inside(node, ancestor) {
  for (let current = node; current; current = current.parentElement) if (current === ancestor) return true;
  return false;
 }

 _availableFocus(node) {
  if (!node?.focus || node.isConnected === false) return false;
  for (let current = node; current; current = current.parentElement) if (current.hidden || current.inert) return false;
  return true;
 }

 _orientation() {
  const orientation = this.byId('orientation-lock');
  return orientation && !orientation.hidden ? orientation : null;
 }

 _focusModal() {
  const orientation = this._orientation();
  const destination = orientation || (this.visible
   ? this._ready && !this._loading ? this.button : this.element
   : this._loading ? this.loadingElement : null);
  destination?.focus?.({preventScroll: true});
 }

 _onKey(event) {
  if (!this.visible && !this._loading) return;
  // Keep game shortcuts and steering from leaking through the modal. The
  // orientation layer has no controls, so it shares the same containment.
  event.stopImmediatePropagation?.();
  if (event.key === 'Tab') {
   event.preventDefault?.();
   this._focusModal();
  } else if (['Enter', ' '].includes(event.key) && this.doc.activeElement === this.button) {
   event.preventDefault?.();
   this.enter();
  }
 }

 _onFocus(event) {
  if (!this.visible && !this._loading) return;
  const modal = this._orientation() || (this.visible ? this.element : this.loadingElement);
  if (modal && !this._inside(event.target, modal)) this._focusModal();
 }

 _setBlocked(active) {
  if (active) {
   for (const id of ['view', 'garage', 'hud', 'tour-ui', 'dialog', 'pause-screen', 'results']) {
    const element = this.byId(id);
    if (element && !this._locks.has(element)) {
     this._locks.set(element, Boolean(element.inert));
     element.inert = true;
    }
   }
  } else {
   for (const [element, inert] of this._locks) element.inert = inert;
   this._locks.clear();
  }
 }

 _pauseVideo() {
  ++this._playToken;
  this._playRequested = false;
  if (this.video?.pause) {
   try { this.video.pause(); } catch { /* An unavailable media API keeps the poster. */ }
  }
  this.element.dataset.video = 'poster';
 }

 _syncVideo() {
  const mayPlay = this.visible && this._ready && !this._loading
   && !this._reduced && !this._videoFailed && !this.doc.hidden;
  if (!mayPlay || !this.video?.play) {
   this._pauseVideo();
   return;
  }
  if (this._playRequested) return;
  const token = ++this._playToken;
  this._playRequested = true;
  let result;
  try { result = this.video.play(); }
  catch {
   this._videoFailed = true;
   this._pauseVideo();
   return;
  }
  Promise.resolve(result).then(() => {
   if (this._destroyed || !this.visible || this._loading || this._reduced || this.doc.hidden) {
    this._pauseVideo();
   } else if (token === this._playToken) this.element.dataset.video = 'playing';
  }, () => {
   if (token !== this._playToken) return;
   this._videoFailed = true;
   this._pauseVideo();
  });
 }

 ready() {
  if (this._destroyed || this._ready) return;
  this._ready = true;
  this.element.dataset.ready = 'true';
  this.button.disabled = this._loading;
  if (!this._loading) this.setPhase('Lammersdorf ist startklar.');
  this._syncVideo();
  if (this.visible) this._focusModal();
 }

 enter() {
  if (this._destroyed || this._entered || !this._ready || this._loading || this._orientation()) return false;
  this._entered = true;
  this.element.hidden = true;
  this._pauseVideo();
  this._setBlocked(false);
  const next = this.byId('garage-next');
  const focus = next && !next.hidden ? next : this._previousFocus;
  if (focus?.isConnected !== false) focus?.focus?.({preventScroll: true});
  this.onEnter();
  return true;
 }

 setPhase(message) {
  if (this._destroyed) return;
  const text = String(message || 'Deine Strecke macht sich bereit.');
  if (this.phase) this.phase.textContent = text;
  if (this.loadingPhase) this.loadingPhase.textContent = text;
 }

 setLoading(active, message) {
  if (this._destroyed) return;
  const wasLoading = this._loading;
  if (active && !wasLoading && !this.visible) this._loadingPreviousFocus = this.doc.activeElement;
  this._loading = Boolean(active);
  this.element.dataset.loading = String(this._loading);
  this.button.disabled = !this._ready || this._loading;
  if (message) this.setPhase(message);
  else if (this._loading) this.setPhase('Deine Strecke macht sich bereit.');
  else if (this._ready && this.visible) this.setPhase('Lammersdorf ist startklar.');
  if (this.loadingElement) this.loadingElement.hidden = !this._loading || this.visible;
  this._setBlocked(this.visible || this._loading);
  this._syncVideo();
  if (this.visible || this._loading) this._focusModal();
  else if (wasLoading) {
   const destination = [this._loadingPreviousFocus, this.byId('garage-next'), this.byId('view')]
    .find(element => this._availableFocus(element));
   destination?.focus({preventScroll: true});
   this._loadingPreviousFocus = null;
  }
 }

 get visible() { return !this._destroyed && !this._entered; }
 get loading() { return !this._destroyed && this._loading; }

 destroy() {
  if (this._destroyed) return;
  this._destroyed = true;
  this._pauseVideo();
  this.element.hidden = true;
  if (this.loadingElement) this.loadingElement.hidden = true;
  this._setBlocked(false);
  for (const unsubscribe of this._subscriptions) unsubscribe();
  this._subscriptions = [];
 }
}
