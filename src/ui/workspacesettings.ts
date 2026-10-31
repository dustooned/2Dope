import type { Workspace } from '../core/workspace';
import { WORKSPACE_NAMES, WORKSPACE_TOOLS, WORKSPACE_TOOL_NAMES, defaultWorkspaceLayout, readWorkspaceLayouts, type WorkspaceLayouts, type WorkspaceTool } from '../core/workspacelayout';

/** Edits a detached preference draft. Dragging is confined to this settings surface. */
export function workspaceSettings(initial: WorkspaceLayouts, current: Workspace) {
  let draft = readWorkspaceLayouts(initial), ws = current, dragged: WorkspaceTool | null = null;
  const section = document.createElement('details'); section.className = 'student-settings-section workspace-settings';
  const summary = document.createElement('summary'); summary.textContent = 'Workspace layout';
  const note = document.createElement('p'); note.className = 'menu-note';
  note.textContent = 'Make each mode yours. Pin tools, change their order, or dock them beside the canvas. More tools always keeps the complete set available. Changes wait for Apply settings and never change artwork.';
  const controls = document.createElement('div');
  const mode = document.createElement('select'); mode.setAttribute('aria-label', 'Customize workspace');
  for (const [id, name] of Object.entries(WORKSPACE_NAMES)) { const o = new Option(name, id); mode.append(o); }
  mode.value = ws;
  mode.addEventListener('change', () => { ws = mode.value as Workspace; render(); });
  const modeLabel = document.createElement('label'); modeLabel.className = 'app-settings-field'; modeLabel.append('Workspace', mode);
  section.append(summary, note, modeLabel, controls);
  const select = (label: string, values: [string, string][], value: string, set: (v: string) => void) => {
    const row = document.createElement('label'); row.className = 'app-settings-field';
    const name = document.createElement('span'); name.textContent = label;
    const s = document.createElement('select'); s.setAttribute('aria-label', label);
    for (const [id, text] of values) s.append(new Option(text, id)); s.value = value;
    s.addEventListener('change', () => set(s.value)); row.append(name, s); return row;
  };
  const check = (label: string, value: boolean, set: (v: boolean) => void) => {
    const row = document.createElement('label'); row.className = 'app-settings-check';
    const c = document.createElement('input'); c.type = 'checkbox'; c.checked = value; c.setAttribute('aria-label', label);
    c.addEventListener('change', () => set(c.checked)); row.append(c, label); return row;
  };
  const move = (id: WorkspaceTool, delta: number) => {
    const tools = draft[ws].tools, at = tools.indexOf(id), to = at + delta;
    if (at < 0 || to < 0 || to >= tools.length) return;
    [tools[at], tools[to]] = [tools[to]!, tools[at]!]; render();
    controls.querySelector<HTMLButtonElement>(`[data-move="${id}:${delta}"]`)?.focus();
  };
  function render() {
    const layout = draft[ws], painting = ws === 'draw' || ws === 'animate';
    controls.replaceChildren(
      select('Tool dock', [['top', 'Top'], ['left', 'Left edge'], ['right', 'Right edge']], layout.toolDock, v => { layout.toolDock = v as typeof layout.toolDock; }),
      check('Show tool labels', layout.labels, v => { layout.labels = v; }),
    );
    if (painting) controls.append(
      select('Brush controls edge', [['left', 'Left edge'], ['right', 'Right edge']], layout.brushEdge, v => { layout.brushEdge = v as typeof layout.brushEdge; }),
      check('Show ink / colour targets beside tools', layout.advancedTargets, v => { layout.advancedTargets = v; }),
    );
    const title = document.createElement('h4'); title.textContent = 'Pinned tools · drag or use Move buttons'; controls.append(title);
    const list = document.createElement('div'); list.className = 'workspace-tool-list'; list.setAttribute('aria-label', `${WORKSPACE_NAMES[ws]} pinned tools`);
    const allowed: readonly WorkspaceTool[] = WORKSPACE_TOOLS[ws];
    for (const id of [...layout.tools, ...allowed.filter(t => !layout.tools.includes(t))]) {
      const pinned = layout.tools.includes(id), name = WORKSPACE_TOOL_NAMES[id], row = document.createElement('div'); row.className = 'workspace-tool-row'; row.dataset.pin = id;
      const c = check(`Pin ${name}`, pinned, on => { layout.tools = on ? [...layout.tools, id] : layout.tools.filter(t => t !== id); render(); });
      if (painting && id === 'brush') c.querySelector('input')!.disabled = true;
      row.append(c); row.draggable = pinned;
      row.addEventListener('dragstart', e => { dragged = id; e.dataTransfer?.setData('text/plain', id); });
      row.addEventListener('dragend', () => { dragged = null; });
      row.addEventListener('dragover', e => { if (dragged && pinned) e.preventDefault(); });
      row.addEventListener('drop', e => {
        e.preventDefault(); const from = dragged; dragged = null;
        if (!from || !pinned || from === id || !layout.tools.includes(from)) return;
        layout.tools = layout.tools.filter(t => t !== from); const to = layout.tools.indexOf(id); layout.tools.splice(to, 0, from); render();
      });
      for (const [delta, direction] of [[-1, 'up'], [1, 'down']] as const) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = direction === 'up' ? '↑' : '↓';
        b.setAttribute('aria-label', `Move ${name} ${direction}`); b.dataset.move = `${id}:${delta}`;
        b.disabled = !pinned || layout.tools.indexOf(id) + delta < 0 || layout.tools.indexOf(id) + delta >= layout.tools.length;
        b.addEventListener('click', () => move(id, delta)); row.append(b);
      }
      list.append(row);
    }
    controls.append(list);
    const restore = document.createElement('button'); restore.type = 'button'; restore.textContent = `Restore ${WORKSPACE_NAMES[ws]} class defaults`;
    restore.addEventListener('click', () => { draft[ws] = defaultWorkspaceLayout(ws); render(); }); controls.append(restore);
  }
  render();
  return { section, read: () => readWorkspaceLayouts(draft), fill: (value: WorkspaceLayouts) => { draft = readWorkspaceLayouts(value); render(); } };
}
