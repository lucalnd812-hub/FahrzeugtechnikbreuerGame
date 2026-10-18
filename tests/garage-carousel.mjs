import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGarageCarousel} from '../src/garage-carousel.js';
import {mobileDOM} from './mobile-dom.mjs';

const html = readFileSync(new URL('../src/game.html', import.meta.url), 'utf8');
const env = mobileDOM();
const host = env.doc.createElement('main');
host.innerHTML = html.slice(html.indexOf('<main id="garage"'), html.indexOf('<section id="tour-ui"'));
env.doc.body.appendChild(host);
const root = {querySelectorAll: selector => host.querySelectorAll(selector)};
const choices = kind => root.querySelectorAll(`[data-${kind}]`);
const calls = [];
// The carousel must click through to the existing engine-owned handler. A
// small stand-in here records that contract instead of changing state itself.
for (const family of ['car', 'track']) for (const button of choices(family)) {
 button.click = () => {
  calls.push({family, value: button.dataset[family]});
  for (const choice of choices(family)) choice.setAttribute('aria-pressed', String(choice === button));
 };
}
const byId = id => host.querySelector('#' + id);
const selected = family => choices(family).find(button => button.getAttribute('aria-pressed') === 'true').dataset[family];
const carousel = createGarageCarousel({root});
assert.equal(choices('car').length, 5);
assert.equal(choices('track').length, 3);
byId('car-choice-prev').emit('click');
assert.equal(selected('car'), '4', 'Back wraps to the Porsche without changing the authoritative click handler');
byId('car-choice-next').emit('click');
assert.equal(selected('car'), '0');
for (let i = 0; i < 3; ++i) byId('car-choice-next').emit('click');
assert.equal(selected('car'), '3');
byId('track-choice-prev').emit('click');
assert.equal(selected('track'), 'kraemer');
byId('track-choice-next').emit('click');
assert.equal(selected('track'), 'lammersdorf');
const region = choices('car')[0].closest('.choice-carousel');
const key = region.emit('keydown', {key: 'End', stopPropagation() { this.propagationStopped = true; }});
assert.equal(key.prevented, true);
assert.equal(key.propagationStopped, true);
assert.equal(selected('car'), '4');
assert.equal(env.doc.activeElement, choices('car').at(-1));
region.emit('keydown', {key: 'Home', stopPropagation() {}});
assert.equal(selected('car'), '0');
region.emit('keydown', {key: 'ArrowRight', stopPropagation() {}});
assert.equal(selected('car'), '1');
assert.equal(region.emit('keydown', {key: 'Tab'}).prevented, undefined, 'Ordinary keyboard focus keeps its native behavior');
assert.equal(carousel.select('missing', 1), null);
const before = calls.length;
carousel.destroy(); carousel.destroy();
byId('car-choice-next').emit('click');
assert.equal(calls.length, before, 'Disposed arrows cannot trigger a stale selection');
assert.equal(carousel.select('car', 1), null);
assert(byId('open-profile'), 'Profile stays reachable outside the changing wizard panels');
assert(byId('open-leaderboard').closest('#garage-extras-panel'), 'The full ranking is a secondary action');
console.log('PASS garage carousel: actual five-car/three-course markup, wrapping, engine-owned selection clicks, keyboard focus, profile/ranking hooks and cleanup.');
