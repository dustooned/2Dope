import { GESTURES, gestureSentence, type GestureSurface } from '../core/gestures';
import { el } from './dom';
import { gestureOn, resetGestures, setGestureOn } from './gesturestore';
import { openModal } from './modal';

const SURFACES: [GestureSurface, string][] = [['global', 'Anywhere'], ['canvas', 'On the canvas'], ['timeline', 'On the timeline']];

/** Gesture Controls: what each touch gesture does, drawn from the registry, with the switches that exist. */
export function openGestureControls(): void {
  const body = el('div', { class: 'gesture-controls' });
  const render = () => {
    body.replaceChildren(el('p', { class: 'menu-note' }, 'These apply to this browser and device only, never to a project. Switching a gesture off does not remove the button or menu that does the same thing.'));
    for (const [surface, title] of SURFACES) {
      const rows = GESTURES.filter((g) => g.surface === surface && g.status === 'live');
      if (!rows.length) continue;
      const section = el('section', { class: 'gesture-group' });
      section.append(el('h3', {}, title));
      for (const g of rows) {
        const row = el('label', { class: 'gesture-row' });
        const text = el('span', {}, gestureSentence(g));
        if (g.userDisableable) {
          const box = el('input', { type: 'checkbox', 'aria-label': gestureSentence(g) });
          box.checked = gestureOn(g.id);
          box.addEventListener('change', () => { setGestureOn(g.id, box.checked); });
          row.append(box, text);
        } else row.append(text);
        section.append(row);
      }
      body.append(section);
    }
    const planned = GESTURES.filter((g) => g.status === 'planned');
    if (planned.length) {
      const soon = el('section', { class: 'gesture-group gesture-planned' });
      soon.append(el('h3', {}, 'Coming later'));
      for (const g of planned) soon.append(el('p', { class: 'gesture-row' }, gestureSentence(g)));
      body.append(soon);
    }
  };
  render();
  openModal<'done' | 'reset'>({
    title: 'Gesture controls', className: 'small gesture-dialog', ariaLabel: 'Gesture controls', bodyClass: 'dbody', content: body, cancelId: 'done',
    actions: [{ id: 'reset', label: 'Restore defaults', run: () => { resetGestures(); render(); return false; } }, { id: 'done', label: 'Done', primary: true }],
  });
}
