import { isCommandHidden } from '../core/commandprefs';
import { commandPrefs, customizable, setHidden, type CommandContext } from './commands';
import { showContextMenu } from './contextmenu';

/** Every entry of a row or menu, ticked when shown: tap one to hide or show it. */
export function showCustomize(context: CommandContext, x: number, y: number, title = 'Show in this row'): void {
  const prefs = commandPrefs();
  showContextMenu(x, y, [
    { title },
    ...customizable(context).map(({ id, name }) => {
      const hidden = isCommandHidden(prefs, id);
      return { label: name, checked: !hidden, hint: hidden ? 'Show' : 'Hide', run: () => setHidden(id, !hidden) };
    }),
  ]);
}
