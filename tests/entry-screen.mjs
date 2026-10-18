import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EntryScreen} from '../src/entry-screen.js';
import {mobileDOM, Target} from './mobile-dom.mjs';

const html = readFileSync(new URL('../src/game.html', import.meta.url), 'utf8');
const markup = html.slice(html.indexOf('<section id="entry-screen"'), html.indexOf('<main id="garage"'));
assert(markup.includes('playsinline'), 'The real entry video is allowed to stay inline on phones');
assert(markup.includes('preload="metadata"'), 'The opening movie does not force its full download before interaction');
const choices = [...html.matchAll(/<button\b[^>]*data-car="(\d+)"/g)].map(match => Number(match[1]));
assert.deepEqual(choices, [0, 1, 2, 3, 4], 'The garage exposes all five cars in their stable order');

function fixture({reduced = false, playMode = 'resolve', noVideoApi = false} = {}) {
 const env = mobileDOM();
 const {doc, win} = env;
 const motion = new Target('media-query');
 motion.matches = reduced;
 win.matchMedia = () => motion;
 const container = doc.createElement('div');
 container.innerHTML = markup;
 doc.body.appendChild(container);
 for (const id of ['garage', 'hud', 'tour-ui', 'dialog', 'pause-screen', 'results', 'garage-next']) {
  const element = doc.createElement(id === 'garage-next' ? 'button' : 'section');
  element.setAttribute('id', id);
  doc.body.appendChild(element);
 }
 // Preserve a pre-existing modal ownership state; releasing this entry must
 // never mistakenly enable something that was already disabled.
 doc.getElementById('dialog').inert = true;
 const video = doc.getElementById('entry-video');
 let plays = 0, pauses = 0, playing = false, settle;
 if (!noVideoApi) {
  video.pause = () => { ++pauses; playing = false; };
  video.play = () => {
   ++plays;
   if (playMode === 'throw') throw new Error('Media decoder unavailable');
   if (playMode === 'reject') return Promise.reject(new Error('Autoplay denied'));
   if (playMode === 'pending') return new Promise(resolve => { settle = () => { playing = true; resolve(); }; });
   playing = true;
   return Promise.resolve();
  };
 }
 let enters = 0;
 const entry = new EntryScreen({root: doc, onEnter: () => { ++enters; }});
 return {...env, motion, video, entry, element: doc.getElementById('entry-screen'), button: doc.getElementById('entry-enter'),
  get plays() { return plays; }, get pauses() { return pauses; }, get playing() { return playing; },
  get enters() { return enters; }, resolvePlay: () => settle?.()};
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

{
 const f = fixture();
 assert.equal(f.entry.visible, true);
 assert.equal(f.button.disabled, true);
 assert.equal(f.plays, 0, 'Decoration waits until the actual game is ready');
 assert.equal(f.doc.getElementById('garage').inert, true);
 assert.equal(f.doc.getElementById('view').inert, true);
 assert.equal(f.entry.enter(), false);
 assert.equal(f.enters, 0);
 const steering = f.doc.emit('keydown', {key: 'ArrowLeft'});
 assert.equal(steering.stopped, true, 'Game steering cannot leak through the entry dialog');
 const tab = f.doc.emit('keydown', {key: 'Tab'});
 assert.equal(tab.prevented, true);
 assert.equal(f.doc.activeElement, f.element);
 f.entry.ready();
 await tick();
 assert.equal(f.button.disabled, false);
 assert.equal(f.doc.activeElement, f.button);
 assert.equal(f.plays, 1);
 assert.equal(f.element.dataset.video, 'playing');
 assert.equal(f.playing, true);
 f.entry.ready();
 assert.equal(f.plays, 1, 'Readiness is idempotent, without extra decoding requests');
 f.entry.setLoading(true, 'Lammersdorf macht sich bereit.');
 assert.equal(f.playing, false);
 assert.equal(f.button.disabled, true);
 assert.equal(f.doc.getElementById('entry-phase').textContent, 'Lammersdorf macht sich bereit.');
 assert.equal(f.doc.getElementById('course-loading').hidden, true, 'The entry itself owns its initial loading state');
 assert.equal(f.entry.enter(), false, 'Building a world cannot be interrupted by the decorative start button');
 f.entry.setLoading(false);
 await tick();
 assert.equal(f.playing, true);
 f.doc.emit('keydown', {key: 'Enter'});
 assert.equal(f.enters, 1);
 assert.equal(f.entry.visible, false);
 assert.equal(f.element.hidden, true);
 assert.equal(f.playing, false, 'The media decoder is paused before the garage or race starts');
 assert.equal(f.doc.getElementById('garage').inert, false);
 assert.equal(f.doc.getElementById('dialog').inert, true, 'Prior modality ownership is preserved');
 assert.equal(f.doc.activeElement, f.doc.getElementById('garage-next'));
 f.button.emit('click');
 assert.equal(f.enters, 1);
 assert.equal(f.entry.enter(), false);
 assert.equal(f.doc.emit('keydown', {key: 'ArrowLeft'}).stopped, undefined, 'The game receives its controls again');
 f.entry.setLoading(true, 'Bahnhof-Runde macht sich bereit.');
 assert.equal(f.doc.getElementById('course-loading').hidden, false);
 assert.equal(f.doc.activeElement, f.doc.getElementById('course-loading'));
 assert.equal(f.doc.getElementById('garage').inert, true);
 assert.equal(f.playing, false);
 f.entry.setPhase('Dein Rennen wartet.');
 assert.equal(f.doc.getElementById('course-loading-phase').textContent, 'Dein Rennen wartet.');
 f.entry.setLoading(false);
 assert.equal(f.doc.getElementById('course-loading').hidden, true);
 assert.equal(f.doc.getElementById('garage').inert, false);
 assert.equal(f.doc.activeElement, f.doc.getElementById('garage-next'), 'Course loading restores a visible interactive focus target');
 const playCount = f.plays;
 f.doc.hidden = true; f.doc.emit('visibilitychange');
 f.doc.hidden = false; f.doc.emit('visibilitychange');
 assert.equal(f.plays, playCount, 'Racing never resumes the opening video');
 f.entry.destroy(); f.entry.destroy();
 assert.equal(f.entry.visible, false);
 assert.equal(f.doc.listeners.get('keydown').size, 0);
}

{
 const f = fixture();
 f.entry.ready(); await tick();
 f.doc.hidden = true; f.doc.emit('visibilitychange');
 assert.equal(f.playing, false);
 f.doc.hidden = false; f.doc.emit('visibilitychange'); await tick();
 assert.equal(f.playing, true, 'A visible entry may resume its short background loop');
 f.win.emit('pagehide');
 assert.equal(f.playing, false);
 f.win.emit('pageshow'); await tick();
 assert.equal(f.playing, true);
 f.motion.matches = true; f.motion.emit('change');
 assert.equal(f.playing, false, 'A runtime Reduced Motion change immediately releases video decoding');
 assert.equal(f.element.dataset.video, 'poster');
 f.motion.matches = false; f.motion.emit('change'); await tick();
 assert.equal(f.playing, true);
 f.video.emit('error');
 assert.equal(f.playing, false);
 f.doc.emit('visibilitychange');
 assert.equal(f.element.dataset.video, 'poster', 'Media failure keeps the poster instead of a broken moving frame');
 assert.equal(f.entry.enter(), true, 'Failed decorative video never blocks gameplay');
 f.entry.destroy();
}

for (const mode of ['reject', 'throw', 'no-api', 'reduced']) {
 const f = fixture({playMode: mode, noVideoApi: mode === 'no-api', reduced: mode === 'reduced'});
 f.entry.ready(); await tick();
 assert.equal(f.button.disabled, false, `${mode}: gameplay is ready independently of the media capability`);
 assert.equal(f.element.dataset.video, 'poster');
 assert.equal(f.entry.enter(), true);
 assert.equal(f.enters, 1);
 f.entry.destroy();
}

{
 const f = fixture({playMode: 'pending'});
 f.entry.ready();
 assert.equal(f.entry.enter(), true);
 f.resolvePlay(); await tick();
 assert.equal(f.playing, false, 'Late autoplay completion after entering is paused again');
 assert.equal(f.element.dataset.video, 'poster');
 f.entry.destroy();
}
{
 const f = fixture({playMode: 'pending'});
 f.entry.ready(); f.entry.destroy();
 f.resolvePlay(); await tick();
 assert.equal(f.playing, false, 'Late autoplay completion after disposal cannot leak a decoder');
 assert.equal(f.motion.listeners.get('change').size, 0);
}
{
 const f = fixture();
 f.portrait.hidden = false;
 f.entry.ready();
 assert.equal(f.doc.activeElement, f.portrait);
 assert.equal(f.entry.enter(), false, 'The phone must reach the allowed orientation before entering');
 f.portrait.hidden = true;
 f.doc.emit('focusin', {target: f.doc.getElementById('garage-next')});
 assert.equal(f.doc.activeElement, f.button);
 assert.equal(f.entry.enter(), true);
 f.entry.destroy();
}

console.log('PASS entry screen: real markup, five cars, finite loading/readiness, keyboard modality, autoplay denial/failure, Reduced Motion, visibility, orientation and late media completion.');
