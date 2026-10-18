import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGarageFlow} from '../src/garage-flow.js';

// Exercise the real flow module against the actual garage markup. The small
// DOM is deliberately limited to functional state; browser sizing is separate.
const html = readFileSync(new URL('../src/game.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/game.css', import.meta.url), 'utf8');
const registry = new Map();
const allElements = [];
let activeElement = null;
const decode = value => value.replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"');

class Element {
  constructor(tag, attributes) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this.listeners = new Map();
    this.ownText = '';
    this.value = '';
    this.hidden = /(?:^|\s)hidden(?:\s|$)/.test(attributes);
    this.disabled = /(?:^|\s)disabled(?:\s|$)/.test(attributes);
    this.checked = /(?:^|\s)checked(?:\s|$)/.test(attributes);
    this.open = /(?:^|\s)open(?:\s|$)/.test(attributes);
    this.selected = /(?:^|\s)selected(?:\s|$)/.test(attributes);
    for (const match of attributes.matchAll(/([\w-]+)="([^"]*)"/g)) {
      const [, name, value] = match;
      this.attributes.set(name, decode(value));
      if (name === 'id') {
        assert(!registry.has(value), `Duplicated HTML ID: ${value}`);
        registry.set(value, this);
      }
      if (name === 'value') this.value = value;
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    }
    allElements.push(this);
  }
  get textContent() { return decode(this.ownText) + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.ownText = String(value); this.children = []; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  matches(selector) {
    if (selector.startsWith('#')) return this.getAttribute('id') === selector.slice(1);
    if (selector.startsWith('[')) return this.attributes.has(selector.slice(1, -1));
    return this.tagName === selector.toUpperCase();
  }
  descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
  querySelectorAll(selector) { return this.descendants().filter(element => element.matches(selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  emit(type, values = {}) {
    const event = {target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...values};
    for (const handler of this.listeners.get(type) ?? []) handler(event);
    return event;
  }
  focus(options) { activeElement = this; this.focusOptions = options; }
  scrollTo(options) { this.lastScroll = options; }
}

const rootElement = new Element('root', '');
const stack = [rootElement];
const voidTags = new Set(['AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR']);
for (const match of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<\/?([a-z][\w-]*)\b([^>]*)>|([^<]+)/gi)) {
  if (match[3]) { stack.at(-1).ownText += match[3]; continue; }
  if (match[0].startsWith('</')) {
    const index = stack.findLastIndex(element => element.tagName === match[1].toUpperCase());
    if (index > 0) stack.splice(index);
    continue;
  }
  const element = new Element(match[1], match[2]);
  element.parentElement = stack.at(-1);
  element.parentElement.children.push(element);
  if (element.tagName === 'OPTION' && element.parentElement.tagName === 'SELECT'
    && (element.selected || element.parentElement.children.length === 1)) element.parentElement.value = element.value;
  if (!voidTags.has(element.tagName)) stack.push(element);
}
const root = {
  getElementById: id => registry.get(id),
  querySelectorAll: selector => allElements.filter(element => element.matches(selector)),
  querySelector: selector => allElements.find(element => element.matches(selector))
};
const byId = id => root.getElementById(id);
const selected = kind => root.querySelectorAll(`[data-${kind}]`).find(element => element.getAttribute('aria-pressed') === 'true');
const inside = (element, ancestor) => element === ancestor || !!element.parentElement && inside(element.parentElement, ancestor);
const choice = (kind, value) => root.querySelectorAll(`[data-${kind}]`).find(element => element.dataset[kind] === value);
const advanced = byId('advanced-settings');
const garage = byId('garage');
const settings = ['race-mode', 'laps', 'opponents', 'difficulty', 'rules', 'graphics',
  'auto-gas', 'auto-drift', 'ghost', 'steering-sensitivity'];

assert.equal(advanced.hidden, true, 'Advanced settings must start closed');
for (const id of settings) assert(inside(byId(id), advanced), `${id} must be inside advanced settings`);
assert(inside(byId('open-settings'), byId('garage-panel-race')));
assert.equal(byId('open-settings').getAttribute('aria-controls'), 'advanced-settings');
assert.equal(advanced.tagName, 'SECTION', 'Settings have their own bounded viewport page');
assert.equal(byId('touch-layout'), undefined, 'Mobile layout selection has been removed');
assert.equal(byId('steering-stick'), undefined, 'There is no analog stick in the UI');
assert.equal(byId('steering-thumb'), undefined);
assert.equal(byId('touch-controls').dataset.layout, 'buttons');
assert.equal(root.querySelectorAll('[data-touch]').filter(element => ['left', 'right'].includes(element.dataset.touch)).length, 2);
const preparation = byId('garage-preparation');
assert.equal(byId('garage-launch').parentElement, byId('garage-back').parentElement);
assert.equal(byId('garage-launch').parentElement.parentElement, preparation,
  'Start/Online share the fixed preparation dock outside the variable page content');
for (const id of ['show-track', 'start-tour', 'demo-button', 'show-help', 'benchmark-button']) {
  assert(inside(byId(id), byId('garage-extras-panel')));
  assert(!['car', 'track', 'race'].some(step => inside(byId(id), byId(`garage-panel-${step}`))), `${id} remains reachable at every step`);
}
const showroom = root.querySelectorAll('aside').find(element => element.getAttribute('aria-label') === 'Interaktive Fahrzeugvorschau');
assert(showroom && inside(byId('showroom-slot'), showroom));
assert(!inside(showroom, byId('garage-panel-car')), 'The preview must stay independent of the active step');

// Existing engine handlers own car/track choices. The wizard must only observe.
for (const button of root.querySelectorAll('[data-car]')) button.addEventListener('click', () => {
  root.querySelectorAll('[data-car]').forEach(element => element.setAttribute('aria-pressed', String(element === button)));
  byId('preview-name').textContent = ['Opel Kadett C', 'AC Schnitzer BMW E30 M3', 'BMW M1 Procar'][Number(button.dataset.car)];
});
for (const button of root.querySelectorAll('[data-track]')) button.addEventListener('click', () => {
  root.querySelectorAll('[data-track]').forEach(element => element.setAttribute('aria-pressed', String(element === button)));
});
const changes = [], layouts = [];
const flow = createGarageFlow({root, onStepChange: step => changes.push(step), onLayoutChange: step => layouts.push(step)});
layouts.length = 0;
function assertStep(step, number) {
  assert.equal(flow.step, step);
  for (const name of ['car', 'track', 'race']) {
    assert.equal(byId(`garage-panel-${name}`).hidden, name !== step);
    assert.equal(byId(`garage-panel-${name}`).inert, name !== step);
  }
  assert.equal(root.querySelectorAll('[data-setup-step]').filter(button => button.getAttribute('aria-current') === 'step').length, 1);
  assert.equal(byId('garage-step-progress').getAttribute('aria-valuenow'), String(number));
  assert(byId('garage-step-progress').getAttribute('aria-valuetext').includes(`Schritt ${number} von 3`));
}
assertStep('car', 1);
assert.equal(flow.view, 'setup');
assert.equal(preparation.hidden, false);
assert.equal(preparation.inert, false);
assert.equal(byId('garage-launch').hidden, true);
assert.equal(activeElement, null, 'Initialization must not steal keyboard focus');
assert.equal(byId('garage-back').hidden, true);
assert.equal(byId('garage-next').hidden, false);
assert.equal(byId('start-solo').disabled, true, 'Loading/start is still owned by the engine');

choice('car', '2').emit('click');
assert.equal(byId('setup-car-name').textContent, 'BMW M1 Procar');
byId('garage-next').emit('click');
assertStep('track', 2);
assert.equal(activeElement, byId('garage-heading-track'));
assert.deepEqual(activeElement.focusOptions, {preventScroll: true});
assert.equal(garage.lastScroll, undefined, 'Navigation never scrolls any garage container');
choice('track', 'bahnhof').emit('click');
byId('garage-next').emit('click');
assertStep('race', 3);
assert.equal(byId('garage-next').hidden, true);
assert.equal(byId('garage-launch').hidden, false, 'The race step exposes Start/Online in the fixed dock');
assert.equal(byId('garage-launch').inert, false);
assert.equal(byId('setup-track-name').textContent, 'Bahnhof-Runde');
assert.equal(byId('setup-car-name').textContent, 'BMW M1 Procar');
assert.equal(advanced.hidden, true);
assert.equal(selected('car').dataset.car, '2');
assert.equal(selected('track').dataset.track, 'bahnhof');

byId('open-settings').emit('click');
assert.equal(flow.view, 'settings');
assert.equal(advanced.hidden, false);
assert.equal(preparation.hidden, true);
assert.equal(preparation.inert, true, 'Background preparation cannot receive focus behind settings');
assert.equal(byId('open-settings').getAttribute('aria-expanded'), 'true');
assert.equal(activeElement, byId('settings-heading'));
assert.deepEqual(layouts, ['race']);
function assertSettingsPage(page) {
  assert.equal(flow.settingsPage, page);
  for (const name of ['race', 'driving', 'graphics']) {
    assert.equal(byId(`settings-page-${name}`).hidden, name !== page);
    assert.equal(byId(`settings-page-${name}`).inert, name !== page);
    assert.equal(byId(`settings-tab-${name}`).getAttribute('aria-selected'), String(name === page));
    assert.equal(byId(`settings-tab-${name}`).getAttribute('tabindex'), name === page ? '0' : '-1');
  }
}
assertSettingsPage('race');
byId('laps').value = '5';
byId('settings-tab-driving').emit('click');
assertSettingsPage('driving');
byId('difficulty').value = '1.06';
byId('auto-gas').checked = false;
const forwardTab = byId('settings-tab-driving').emit('keydown', {key: 'ArrowRight'});
assert.equal(forwardTab.defaultPrevented, true);
assertSettingsPage('graphics');
assert.equal(activeElement, byId('settings-tab-graphics'));
byId('graphics').value = 'smooth';
byId('steering-sensitivity').value = '1.4';
const savedSettings = settings.map(id => ({id, value: byId(id).value, checked: byId(id).checked}));
byId('settings-tab-graphics').emit('keydown', {key: 'Home'});
assertSettingsPage('race');
byId('settings-tab-race').emit('keydown', {key: 'ArrowLeft'});
assertSettingsPage('graphics');
byId('settings-tab-graphics').emit('keydown', {key: 'End'});
assertSettingsPage('graphics');
byId('settings-done').emit('click');
assert.equal(flow.view, 'setup');
assert.equal(preparation.inert, false);
assert.equal(advanced.hidden, true);
assert.equal(byId('open-settings').getAttribute('aria-expanded'), 'false');
assert.equal(activeElement, byId('open-settings'));
assert.equal(byId('garage-launch').hidden, false);
byId('garage-back').emit('click');
assertStep('track', 2);
byId('garage-back').emit('click');
assertStep('car', 1);
assert.equal(selected('car').dataset.car, '2');
assert.equal(selected('track').dataset.track, 'bahnhof');
for (const saved of savedSettings) {
  assert.equal(byId(saved.id).value, saved.value, `${saved.id} survives backwards navigation`);
  assert.equal(byId(saved.id).checked, saved.checked, `${saved.id} checkbox survives navigation`);
}
const raceStep = root.querySelectorAll('[data-setup-step]').find(button => button.dataset.setupStep === 'race');
raceStep.emit('click');
assertStep('race', 3);
byId('open-settings').emit('click');
assert.equal(flow.view, 'settings');
assertSettingsPage('graphics');
byId('settings-close').emit('click');
assert.equal(flow.view, 'setup');
assert.equal(advanced.hidden, true);
const editCar = root.querySelectorAll('[data-setup-edit]').find(button => button.dataset.setupEdit === 'car');
editCar.emit('click');
assertStep('car', 1);
choice('car', '1').emit('click');
flow.goTo('race', {focus: false, announce: false, scroll: false});
assert.equal(byId('setup-car-name').textContent, 'AC Schnitzer BMW E30 M3');
byId('race-mode').value = 'cup';
byId('race-mode').emit('change');
assert.equal(byId('setup-track-name').textContent, 'Alle 3 Kurse · Start in Lammersdorf');
byId('race-mode').value = 'race';
flow.refresh();
assert.equal(byId('setup-track-name').textContent, 'Bahnhof-Runde', 'Leaving Cup restores the chosen standalone track');
assert.throws(() => flow.goTo('unknown'), RangeError);
assert.throws(() => flow.showSettingsPage('unknown'), RangeError);

byId('garage-extras').emit('click');
assert.equal(flow.view, 'extras');
assert.equal(byId('garage-extras-panel').hidden, false);
assert.equal(byId('garage-extras').getAttribute('aria-expanded'), 'true');
assert.equal(preparation.inert, true);
assert.equal(activeElement, byId('extras-heading'));
byId('show-help').emit('click');
assert.equal(flow.view, 'extras', 'Help/Map can return keyboard focus to their menu button after their own dialog closes');
byId('extras-done').emit('click');
assert.equal(flow.view, 'setup');
assert.equal(activeElement, byId('garage-extras'));
flow.openExtras();
byId('demo-button').emit('click');
assert.equal(flow.view, 'setup', 'A driving extra closes its menu before entering the race');
flow.openSettings();
const escape = byId('garage-controls').emit('keydown', {key: 'Escape'});
assert.equal(escape.defaultPrevented, true);
assert.equal(flow.view, 'setup');
assert.equal(activeElement, byId('open-settings'));
flow.openExtras();
byId('garage-extras').emit('click');
assert.equal(flow.view, 'setup', 'The More trigger also closes its menu');

const changesBeforeRefresh = changes.length;
garage.hidden = true;
flow.refresh();
assert.equal(garage.hidden, true, 'Refresh must not reopen the garage during a race');
assert.equal(changes.length, changesBeforeRefresh);
assert.deepEqual(changes, ['track', 'race', 'track', 'car', 'race', 'car', 'race']);
assert.equal(garage.lastScroll, undefined);
const layoutsBeforeDestroy = layouts.length;
flow.destroy();
byId('garage-back').emit('click');
assert.equal(flow.step, 'race');
byId('open-settings').emit('click');
assert.equal(flow.view, 'setup');
assert.equal(layouts.length, layoutsBeforeDestroy);
assert.equal(byId('laps').value, '5');
assert.equal(byId('auto-gas').checked, false);
assert.throws(() => createGarageFlow({root: {getElementById: () => null, querySelector: () => null, querySelectorAll: () => []}}), /missing #garage-panel-car/);

assert(css.includes('@media(prefers-reduced-motion:reduce)'), 'Existing reduced-motion support remains');
assert(css.includes('.garage-steps button') && css.includes('min-height:44px'), 'Navigation includes full touch targets');
console.log('PASS Fixed garage flow: Auto → Strecke → Rennen, a separate Start/Online dock, selections retained, three settings pages, keyboard tabs/Escape, More menu, focus/announcements, independent preview, no scrolling and fixed Links/Rechts without analog UI.');
console.log('Functional DOM checks; viewport visibility must be verified from actual browser rectangles/screenshots at 568×320, 667×375, 844×390 and 1366×768.');
