/** Small-view navigation delegates to the real selection buttons. Their
 * existing handlers own persistence, the preview, race options and feedback. */
export function createGarageCarousel({root = document} = {}) {
 const subscriptions = [];
 let destroyed = false;
 const all = selector => [...root.querySelectorAll(selector)];
 const families = {car: '[data-car]', track: '[data-track]'};
 const listen = (node, type, callback) => {
  node.addEventListener(type, callback);
  subscriptions.push(() => node.removeEventListener(type, callback));
 };
 function select(family, direction) {
  if (destroyed || !families[family]) return null;
  const choices = all(families[family]);
  if (!choices.length) return null;
  const current = Math.max(0, choices.findIndex(button => button.getAttribute('aria-pressed') === 'true'));
  const index = direction === 'first' ? 0 : direction === 'last' ? choices.length - 1
   : (current + Math.sign(Number(direction) || 0) + choices.length) % choices.length;
  const target = choices[index];
  if (!target.disabled) target.click();
  return target;
 }
 for (const arrow of all('[data-choice-family]')) {
  listen(arrow, 'click', event => {
   event.preventDefault?.();
   event.stopPropagation?.();
   // The delegated selection click supplies the single UI sound/announcement.
   select(arrow.dataset.choiceFamily, arrow.dataset.choiceDirection);
  });
 }
 for (const [family, selector] of Object.entries(families)) {
  const region = all(selector)[0]?.closest('.choice-carousel');
  if (!region) continue;
  listen(region, 'keydown', event => {
   const direction = {ArrowLeft: -1, ArrowRight: 1, Home: 'first', End: 'last'}[event.key];
   if (!direction) return;
   event.preventDefault();
   event.stopPropagation();
   const selected = select(family, direction);
   if (selected) selected.focus({preventScroll: true});
  });
 }
 return {select, destroy() {
  if (destroyed) return;
  destroyed = true;
  for (const unsubscribe of subscriptions) unsubscribe();
 }};
}
