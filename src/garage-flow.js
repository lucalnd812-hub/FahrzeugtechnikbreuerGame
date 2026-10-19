/**
 * Keeps the garage's three preparation screens independent of the race engine.
 * Existing selection and settings handlers remain the owners of those values.
 */
export function createGarageFlow({root = document, onStepChange = () => {}, onLayoutChange = onStepChange} = {}) {
  const steps = ['car', 'track', 'race'];
  const labels = {car: 'Auto', track: 'Strecke', race: 'Rennen'};
  const byId = id => root.getElementById?.(id) ?? root.querySelector(`#${id}`);
  const all = selector => [...root.querySelectorAll(selector)];
  const required = id => {
    const element = byId(id);
    if (!element) throw new Error(`Garage preparation is missing #${id}`);
    return element;
  };
  const panels = steps.map(step => required(`garage-panel-${step}`));
  const headings = steps.map(step => required(`garage-heading-${step}`));
  const preparation = required('garage-preparation');
  const launch = required('garage-launch');
  const settingsView = required('advanced-settings');
  const extrasView = required('garage-extras-panel');
  const openSettingsButton = required('open-settings');
  const extrasButton = required('garage-extras');
  const settingsPages = ['race', 'driving', 'graphics'];
  const settingsPanels = settingsPages.map(page => required(`settings-page-${page}`));
  const settingsTabs = settingsPages.map(page => required(`settings-tab-${page}`));
  const stepButtons = steps.map(step => {
    const button = all('[data-setup-step]').find(element => element.dataset.setupStep === step);
    if (!button) throw new Error(`Garage preparation is missing the ${step} step button`);
    return button;
  });
  const back = required('garage-back');
  const next = required('garage-next');
  const progress = required('garage-step-progress');
  const fill = required('garage-step-fill');
  const announcement = required('garage-flow-status');
  const carName = required('setup-car-name');
  const trackName = required('setup-track-name');
  const garage = required('garage');
  const subscriptions = [];
  let index = 0;
  let view = 'setup';
  let settingsPage = 'race';
  let destroyed = false;

  function listen(element, type, handler) {
    if (!element) return;
    element.addEventListener(type, handler);
    subscriptions.push(() => element.removeEventListener(type, handler));
  }

  function refresh() {
    if (destroyed) return;
    const car = all('[data-car]').find(element => element.getAttribute('aria-pressed') === 'true');
    const track = all('[data-track]').find(element => element.getAttribute('aria-pressed') === 'true');
    carName.textContent = byId('preview-name')?.textContent.trim()
      || car?.querySelector('strong')?.textContent.trim() || 'Dein Klassiker';
    trackName.textContent = byId('race-mode')?.value === 'cup'
      ? 'Alle 3 Kurse · Start in Lammersdorf'
      : track?.querySelector('strong')?.textContent.trim() || 'Deine Strecke';
  }

  function render({focus = false, announce = false} = {}) {
    panels.forEach((panel, panelIndex) => {
      const inactive = panelIndex !== index;
      panel.hidden = inactive;
      panel.inert = inactive;
      stepButtons[panelIndex].setAttribute('aria-current', inactive ? 'false' : 'step');
      stepButtons[panelIndex].setAttribute('data-complete', String(panelIndex < index));
    });
    garage.setAttribute('data-setup-current', steps[index]);
    garage.setAttribute('data-garage-view', view);
    preparation.hidden = view !== 'setup';
    preparation.inert = view !== 'setup';
    settingsView.hidden = view !== 'settings';
    settingsView.inert = view !== 'settings';
    extrasView.hidden = view !== 'extras';
    extrasView.inert = view !== 'extras';
    openSettingsButton.setAttribute('aria-expanded', String(view === 'settings'));
    extrasButton.setAttribute('aria-expanded', String(view === 'extras'));
    const description = `Schritt ${index + 1} von 3: ${labels[steps[index]]}`;
    progress.setAttribute('aria-valuenow', String(index + 1));
    progress.setAttribute('aria-valuetext', description);
    fill.style.width = `${(index + 1) / steps.length * 100}%`;
    back.hidden = index === 0;
    next.hidden = index === steps.length - 1;
    launch.hidden = index !== steps.length - 1;
    launch.inert = launch.hidden;
    next.textContent = 'Weiter';
    next.setAttribute('aria-label', index === 0 ? 'Weiter zur Strecke' : 'Weiter zum Rennen');
    refresh();
    if (announce) announcement.textContent = description;
    if (focus) headings[index].focus({preventScroll: true});
  }

  function goTo(step, options = {}) {
    if (!steps.includes(step)) throw new RangeError(`Unknown garage step: ${step}`);
    if (destroyed) return steps[index];
    const nextIndex = steps.indexOf(step);
    const changed = nextIndex !== index;
    const changedView = view !== 'setup';
    index = nextIndex;
    view = 'setup';
    render({focus: true, announce: true, ...options});
    if (changed) onStepChange(step);
    if (changedView) onLayoutChange(step);
    return step;
  }

  function showSettingsPage(page, {focus = true, announce = true} = {}) {
    if (!settingsPages.includes(page)) throw new RangeError(`Unknown settings page: ${page}`);
    if (destroyed) return settingsPage;
    settingsPage = page;
    settingsPanels.forEach((panel, panelIndex) => {
      const inactive = settingsPages[panelIndex] !== page;
      panel.hidden = inactive;
      panel.inert = inactive;
      settingsTabs[panelIndex].setAttribute('aria-selected', String(!inactive));
      settingsTabs[panelIndex].setAttribute('tabindex', inactive ? '-1' : '0');
    });
    if (announce) announcement.textContent = `Einstellungen: ${{race: 'Rennen', driving: 'Fahrstil', graphics: 'Grafik'}[page]}`;
    if (focus) settingsTabs[settingsPages.indexOf(page)].focus({preventScroll: true});
    onLayoutChange(steps[index]);
    return page;
  }

  function openSettings() {
    if (destroyed) return;
    view = 'settings';
    render();
    showSettingsPage(settingsPage, {focus: false});
    required('settings-heading').focus({preventScroll: true});
  }

  function openExtras() {
    if (destroyed) return;
    view = 'extras';
    render();
    required('extras-heading').focus({preventScroll: true});
    announcement.textContent = 'Zusatzmenü: Streckenkarte, Dorf erkunden, Vorführfahrt, Hilfe und Leistungsmessung.';
    onLayoutChange(steps[index]);
  }

  function closeSubview({focus = true} = {}) {
    if (destroyed || view === 'setup') return;
    const previousView = view;
    view = 'setup';
    render();
    if (focus) (previousView === 'settings' ? openSettingsButton : extrasButton).focus({preventScroll: true});
    announcement.textContent = `Zurück zu ${labels[steps[index]]}.`;
    onLayoutChange(steps[index]);
  }

  stepButtons.forEach((button, buttonIndex) => listen(button, 'click', () => goTo(steps[buttonIndex])));
  all('[data-setup-edit]').forEach(button => listen(button, 'click', () => goTo(button.dataset.setupEdit)));
  listen(back, 'click', () => goTo(steps[Math.max(0, index - 1)]));
  listen(next, 'click', () => goTo(steps[Math.min(steps.length - 1, index + 1)]));
  [...all('[data-car]'), ...all('[data-track]'), byId('previous-car'), byId('next-car')]
    .forEach(button => listen(button, 'click', refresh));
  all('select').forEach(select => listen(select, 'change', refresh));
  listen(openSettingsButton, 'click', openSettings);
  listen(extrasButton, 'click', () => view === 'extras' ? closeSubview() : openExtras());
  ['settings-close', 'settings-done', 'extras-close', 'extras-done']
    .forEach(id => listen(required(id), 'click', () => closeSubview()));
  settingsTabs.forEach((tab, tabIndex) => {
    listen(tab, 'click', () => showSettingsPage(settingsPages[tabIndex]));
    listen(tab, 'keydown', event => {
      const direction = {ArrowLeft: -1, ArrowRight: 1}[event.key];
      let destination;
      if (direction) destination = settingsPages[(tabIndex + direction + settingsPages.length) % settingsPages.length];
      else if (event.key === 'Home') destination = settingsPages[0];
      else if (event.key === 'End') destination = settingsPages.at(-1);
      if (destination) {
        event.preventDefault();
        showSettingsPage(destination);
      }
    });
  });
  listen(required('garage-controls'), 'keydown', event => {
    if (event.key === 'Escape' && view !== 'setup') {
      event.preventDefault();
      closeSubview();
    }
  });
  ['start-tour', 'demo-button', 'benchmark-button'].forEach(id => listen(byId(id), 'click', () => closeSubview({focus: false})));
  showSettingsPage(settingsPage, {focus: false, announce: false});
  render();

  return {
    goTo,
    refresh,
    openSettings,
    openExtras,
    closeSubview,
    showSettingsPage,
    get step() { return steps[index]; },
    get view() { return view; },
    get settingsPage() { return settingsPage; },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      subscriptions.forEach(unsubscribe => unsubscribe());
    }
  };
}
