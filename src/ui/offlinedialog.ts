import { canInstall, install, isInstalled, offlineState, onOfflineChange } from '../offline';
import { el } from './dom';
import { openModal } from './modal';

/** "Use 2Dope offline": the status, an Install button, and plain steps for each device. */
export function openOfflineDialog(onMessage: (m: string) => void = () => {}): void {
  const status = el('p', { role: 'status', class: 'hint' });
  const installBtn = el('button', { type: 'button', class: 'primary' }, 'Install 2Dope on this device');
  installBtn.addEventListener('click', async () => {
    if (await install()) onMessage('Installed. Open 2Dope from your apps or desktop.');
  });
  const refresh = () => {
    const st = offlineState();
    status.textContent = isInstalled()
      ? 'You are using the installed app. It works with no internet.'
      : st === 'ready'
        ? 'Ready: 2Dope is saved on this device and will open with no internet.'
        : st === 'preparing'
          ? 'Saving 2Dope to this device… keep this page open until this says Ready.'
          : 'Offline use is not available in this window. Open 2Dope from its web address (https), not from a file, then try again.';
    installBtn.hidden = !canInstall() || isInstalled();
  };
  refresh();
  const off = onOfflineChange(refresh);
  const steps = (title: string, items: string[]) => {
    const det = el('details', {});
    det.append(el('summary', {}, title));
    const ol = el('ol', {});
    for (const t of items) ol.append(el('li', {}, t));
    det.append(ol);
    return det;
  };
  const note = el('p', { class: 'hint' });
  note.append(el('strong', {}, 'Your drawings stay on this device. '), 'They are saved in this browser, not on a server. On a shared or lab computer they can disappear when it is reset, so before you leave use Menu → Export .2dope and keep the file on a USB stick or cloud drive. Updates arrive by themselves the next time you open 2Dope online.');
  openModal({
    title: 'Use 2Dope offline',
    className: 'small offline',
    ariaLabel: 'Use 2Dope offline',
    bodyClass: null,
    content: [
      status,
      installBtn,
      steps('Windows or Mac: Chrome or Edge', [
        'Open 2Dope once while you are online.',
        'Wait until the message above says Ready.',
        'Click the Install icon at the right end of the address bar (or press Install above).',
        '2Dope now opens from your Start menu, Dock or desktop, with no internet.',
      ]),
      steps('iPad or iPhone: Safari', [
        'Open 2Dope once while you are online, and wait for Ready.',
        'Tap the Share button, then Add to Home Screen.',
        'Open 2Dope from the new icon on your Home Screen.',
      ]),
      steps('Android or Chromebook: Chrome', [
        'Open 2Dope once while you are online, and wait for Ready.',
        'Tap the menu (three dots), then Install app or Add to Home screen.',
      ]),
      note,
    ],
    actions: [{ id: 'done', label: 'Done', primary: true }],
    onClose: off,
  });
}
