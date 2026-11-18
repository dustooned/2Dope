/**
 * Every touch gesture 2Dope knows, in one declarative list. The Gesture Controls page is drawn
 * from this list, and its sentences are generated from it, so help text cannot drift from the
 * bindings. `status: 'live'` rows are real today; `'planned'` rows are not wired yet and are not
 * shown as working.
 */

export type GestureSurface = 'global' | 'canvas' | 'timeline' | 'stage' | 'flipbook';
export type GestureMotion = 'tap' | 'swipe' | 'pinch' | 'hold' | 'double' | 'scribble';

export interface GestureDef {
  id: string;
  surface: GestureSurface;
  fingers: 1 | 2 | 3 | 4;
  motion: GestureMotion;
  axis?: 'h' | 'v';
  /** Where on the surface, when it matters ("the timeline ruler"). Used in the generated sentence. */
  where?: string;
  /** What it does: a key of GESTURE_ACTIONS. */
  actionId: string;
  status: 'live' | 'planned';
  /** The user can turn this one off on this device. */
  userDisableable: boolean;
  enabledByDefault: boolean;
}

/** The words for each action, in the form "… will <label>". */
export const GESTURE_ACTIONS: Record<string, string> = {
  'edit.undo': 'undo',
  'edit.redo': 'redo',
  'view.toggle-ui': 'hide or show the interface',
  'view.pan': 'move the page',
  'view.zoom-page': 'zoom, move and turn the page',
  'view.canvas-menu': 'open the canvas menu',
  'paint.eyedropper': 'pick the colour under your finger',
  'frame.clear': 'clear the drawing (Undo brings it back)',
  'timeline.zoom': 'zoom the timeline',
  'timeline.fit': 'fit the whole shot on the timeline',
  'timeline.zoom-to-point': 'zoom in closer to that spot',
  'timeline.time-scale': 'change how much time is visible',
  'timeline.content-scale': 'scale the content vertically',
  'timeline.ruler-scale': 'change the project timescale',
};

export const GESTURES: readonly GestureDef[] = [
  { id: 'tap2', surface: 'global', fingers: 2, motion: 'tap', actionId: 'edit.undo', status: 'live', userDisableable: true, enabledByDefault: true },
  { id: 'tap3', surface: 'global', fingers: 3, motion: 'tap', actionId: 'edit.redo', status: 'live', userDisableable: true, enabledByDefault: true },
  { id: 'tap4', surface: 'global', fingers: 4, motion: 'tap', actionId: 'view.toggle-ui', status: 'live', userDisableable: true, enabledByDefault: true },
  { id: 'pinch2-canvas', surface: 'canvas', fingers: 2, motion: 'pinch', actionId: 'view.zoom-page', status: 'live', userDisableable: false, enabledByDefault: true },
  { id: 'hold1-canvas', surface: 'canvas', fingers: 1, motion: 'hold', actionId: 'paint.eyedropper', status: 'live', userDisableable: false, enabledByDefault: true },
  { id: 'double1-canvas', surface: 'canvas', fingers: 1, motion: 'double', actionId: 'view.canvas-menu', status: 'live', userDisableable: false, enabledByDefault: true },
  { id: 'scribble3-canvas', surface: 'canvas', fingers: 3, motion: 'scribble', actionId: 'frame.clear', status: 'live', userDisableable: false, enabledByDefault: true },
  { id: 'pinch2-timeline', surface: 'timeline', fingers: 2, motion: 'pinch', actionId: 'timeline.zoom', status: 'live', userDisableable: false, enabledByDefault: true },
  { id: 'fit-timeline', surface: 'timeline', fingers: 2, motion: 'pinch', where: 'quickly, fingers together', actionId: 'timeline.fit', status: 'live', userDisableable: false, enabledByDefault: true },
  { id: 'double1-ruler', surface: 'timeline', fingers: 1, motion: 'double', where: 'the timeline ruler', actionId: 'timeline.zoom-to-point', status: 'live', userDisableable: false, enabledByDefault: true },
  { id: 'swipe3h-timeline', surface: 'timeline', fingers: 3, motion: 'swipe', axis: 'h', where: 'the timeline', actionId: 'timeline.time-scale', status: 'planned', userDisableable: false, enabledByDefault: true },
  { id: 'swipe3v-timeline', surface: 'timeline', fingers: 3, motion: 'swipe', axis: 'v', where: 'the timeline', actionId: 'timeline.content-scale', status: 'planned', userDisableable: false, enabledByDefault: true },
  { id: 'drag1-ruler', surface: 'timeline', fingers: 1, motion: 'swipe', axis: 'h', where: 'the ruler', actionId: 'timeline.ruler-scale', status: 'planned', userDisableable: false, enabledByDefault: true },
];

/** The ids a saved preference may name: only gestures the user can turn off. */
export const DISABLEABLE_GESTURES: readonly string[] = GESTURES.filter((g) => g.userDisableable).map((g) => g.id);

const NUMBER = ['', 'one', 'two', 'three', 'four'];
const FINGERS = (n: number) => `${NUMBER[n]} finger${n === 1 ? '' : 's'}`;

/** "Tapping with two fingers", "Swiping sideways with three fingers on the timeline", … */
export function gesturePhrase(g: GestureDef): string {
  const f = FINGERS(g.fingers);
  const where = g.where && g.motion !== 'pinch' ? ` on ${g.where}` : '';
  switch (g.motion) {
    case 'tap': return `Tapping with ${f}`;
    case 'double': return g.fingers === 1 ? `Double-tapping${where}` : `Double-tapping with ${f}${where}`;
    case 'hold': return `Holding ${f} still`;
    case 'scribble': return `Scribbling back and forth with ${f}`;
    case 'pinch': return `Pinching with ${f}${g.where ? ` ${g.where}` : ''}`;
    case 'swipe': return `${g.fingers === 1 ? 'Dragging' : 'Swiping'} ${g.axis === 'v' ? 'up or down' : 'left or right'} with ${f}${where}`;
  }
}

/** The one-line help for a gesture, from its binding: "<phrase> [on the surface] will <action>." */
export function gestureSentence(g: GestureDef): string {
  const action = GESTURE_ACTIONS[g.actionId] ?? g.actionId;
  const named = !!g.where && (g.motion === 'swipe' || g.motion === 'double');
  const place = !named && (g.surface === 'timeline' || g.surface === 'canvas') ? ` on the ${g.surface}` : '';
  return `${gesturePhrase(g)}${place} will ${action}.`;
}
