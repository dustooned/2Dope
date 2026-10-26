import type { App } from '../app';
import { defaultQuickMenu, QUICK_ACTIONS, type QuickMenuPrefs } from '../core/quickmenu';
import { decorate } from './icons';
import { commandById, commandName, commandPrefs, ROW_NAMES, setHidden } from './commands';
import { PROFILE_LIMIT, STUDENT_CONTROLS, STUDENT_PROFILES_KEY, STUDENT_TOOLS, profileName, readStudentProfiles, readStudentSetup, readStudentUI, type StudentSetup } from '../core/studentprefs';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string) => {
  const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e;
};

/** Preferences are drafted locally and applied together, outside document History. */
export class AppSettingsUI {
  private dialog: HTMLDialogElement | null = null;
  constructor(private app: App, private canvas: HTMLCanvasElement, private prefs: () => QuickMenuPrefs, private apply: (prefs: QuickMenuPrefs) => void) {}
  show(anchor?: HTMLElement, focus: 'profiles' | 'quickmenu' = 'profiles'): void {
    if (this.dialog || this.app.strokeActive || document.querySelector('dialog[open]')) return;
    if (this.app.adjusting || this.app.gradEditing) { this.app.onNotice?.('Finish or cancel the current adjustment before opening App settings.'); return; }
    if (this.app.playing) this.app.togglePlay();
    const d = el('dialog', 'app-settings'); this.dialog = d; d.setAttribute('aria-labelledby', 'app-settings-title');
    const header = el('header', 'app-settings-head'), title = el('h2', '', 'App settings'); title.id = 'app-settings-title';
    const close = el('button', 'icon-only', 'Close'); close.type = 'button'; close.setAttribute('aria-label', 'Close app settings'); decorate(close, 'close');
    header.append(title, close);
    const body = el('div', 'app-settings-body'), section = el('details', 'student-settings-section');
    section.open = focus === 'quickmenu';
    const liveSetup = (): StudentSetup => readStudentSetup({ ui: this.app.studentUI, level: this.app.interfaceLevel,
      quickMenu: this.prefs(), rangeGesture: this.app.rangeGestureEnabled, inkPaint: this.app.inkPaint.enabled,
      quickShape: this.app.quickShape, fingerPaint: this.app.fingerPaint });
    const initial = liveSetup();
    let stored: unknown; try { stored = JSON.parse(localStorage.getItem(STUDENT_PROFILES_KEY) ?? 'null'); } catch { /* recover invalid preferences */ }
    const profiles = readStudentProfiles(stored);
    const profileSection = el('section', 'student-profiles');
    const profileTitle = el('h3', '', 'Student profiles');
    const chooser = el('select'); chooser.setAttribute('aria-label', 'Student profile');
    const name = el('input'); name.type = 'text'; name.maxLength = 40; name.setAttribute('aria-label', 'Profile name'); name.placeholder = 'e.g. Background painting';
    const profileActions = el('div', 'student-profile-actions');
    const save = el('button', '', 'Save as new profile'), rename = el('button', '', 'Rename profile'), remove = el('button', '', 'Delete profile');
    for (const b of [save,rename,remove]) b.type = 'button';
    profileActions.append(save,rename,remove);
    const message = el('p', 'student-profile-message'); message.setAttribute('role', 'status');
    profileSection.append(profileTitle, el('p', 'menu-note', 'Choose a profile to preview it. Apply settings updates that profile; Save as new profile keeps a separate setup. Changes and deletion stay in draft until Apply. Profiles save on this browser/device.'), chooser, name, profileActions);
    body.append(profileSection);
    const toolsSection = el('details', 'student-settings-section');
    toolsSection.append(el('summary', '', 'Visible tools and controls'), el('p', 'menu-note', 'Choose what appears in Draw and Animate at your interface level. Shortcuts and QuickMenu remain available. The current tool stays visible until you switch. Brush always stays available.'));
    const toolGrid = el('div', 'student-tools-grid'), toolChecks = new Map<string,HTMLInputElement>(), controlChecks = new Map<string,HTMLInputElement>();
    const checkbox = (label:string, text:string) => {
      const row=el('label','app-settings-check'), input=el('input'); input.type='checkbox'; input.setAttribute('aria-label',label);
      row.append(input,document.createTextNode(text)); return {row,input};
    };
    for (const [id,label] of STUDENT_TOOLS) {
      const {row,input}=checkbox(`Show ${label} tool`,id==='brush'?'Brush (always available)':label);
      if(id==='brush')input.disabled=true; toolChecks.set(id,input); toolGrid.append(row);
    }
    toolsSection.append(toolGrid);
    for (const [id,label] of STUDENT_CONTROLS) { const {row,input}=checkbox(`Show ${label}`,label); controlChecks.set(id,input); toolsSection.append(row); }
    const allTools=el('button','','Show all tools and controls'); allTools.type='button';
    allTools.addEventListener('click',()=>{for(const c of [...toolChecks.values(),...controlChecks.values()])c.checked=true;}); toolsSection.append(allTools);
    // option-row actions hidden on this device (from a row's Customize or a hold); Show applies with Apply
    const hiddenControls=el('section','hidden-controls'),toShow=new Set<string>();
    const renderHidden=()=>{
      hiddenControls.replaceChildren(el('h4','','Hidden controls'));
      const ids=commandPrefs().hidden;
      if(!ids.length){hiddenControls.append(el('p','menu-note','Nothing is hidden. Hold or right-click an action in an options row, or use its Customize button, to hide it.'));return;}
      hiddenControls.append(el('p','menu-note','Actions hidden from the options rows on this browser/device. Student profiles do not include them.'));
      for(const id of ids){
        const c=commandById(id),row=el('div','app-settings-field'),b=el('button','',toShow.has(id)?'Will show':'Show');b.type='button';
        b.setAttribute('aria-label',`Show ${c?commandName(c):id}`);b.setAttribute('aria-pressed',String(toShow.has(id)));
        b.addEventListener('click',()=>{if(toShow.has(id))toShow.delete(id);else toShow.add(id);renderHidden();});
        row.append(el('span','',c?`${commandName(c)} (${ROW_NAMES[c.contexts[0]!]??c.contexts[0]} row)`:id),b);hiddenControls.append(row);
      }
    };
    renderHidden();toolsSection.append(hiddenControls);
    const options=el('details','student-settings-section'); options.append(el('summary','','Drawing options'));
    const levelRow=el('label','app-settings-field'), level=el('select'); level.setAttribute('aria-label','Interface level');
    for(const [value,label] of [['clean','Focus'],['simple','Simple'],['full','Full']]){const o=el('option','',label);o.value=value!;level.append(o);} levelRow.append(el('span','','Interface'),level);
    const inkPaint=checkbox('Enable Ink & Paint','Ink & Paint automatic fills'), quickShape=checkbox('Enable QuickShape','QuickShape (hold to make a shape)'), fingerPaint=checkbox('Enable finger painting','Draw with a finger');
    options.append(levelRow,inkPaint.row,quickShape.row,fingerPaint.row,el('p','menu-note','These switches change drawing behavior. The tool visibility choices above only change which controls are shown. Auto Paint still respects this device’s canvas limits.'));
    body.append(toolsSection,options);
    section.setAttribute('aria-labelledby', 'quickmenu-settings-title');
    const h = el('summary', '', 'QuickMenu'); h.id = 'quickmenu-settings-title';
    section.append(h, el('p', 'menu-note', 'Choose six actions, clockwise from the top. Tap QuickMenu or press Q in Draw and Animate. Preferences apply to this browser/device.'));
    const showRow = el('label', 'app-settings-check'), show = el('input'); show.type = 'checkbox';
    show.setAttribute('aria-label', 'Show QuickMenu button'); showRow.append(show, document.createTextNode('Show QuickMenu button'));
    const edgeRow = el('label', 'app-settings-field'), edge = el('select'); edge.setAttribute('aria-label', 'QuickMenu button edge');
    for (const [value, label] of [['left', 'Left edge'], ['right', 'Right edge']]) { const o = el('option', '', label); o.value = value!; edge.append(o); }
    edgeRow.append(el('span', '', 'Button position'), edge);
    section.append(showRow, edgeRow, el('p', 'menu-note', 'Q still opens QuickMenu when its button is hidden. Empty slots are allowed.'));
    const slots = el('div', 'app-settings-slots');
    const selects: HTMLSelectElement[] = [];
    for (let i = 0; i < 6; i++) {
      const row = el('label', 'app-settings-field'), select = el('select'); select.setAttribute('aria-label', `QuickMenu action ${i + 1}`);
      for (const a of QUICK_ACTIONS) { const o = el('option', '', a.label); o.value = a.id; select.append(o); }
      row.append(el('span', '', `Action ${i + 1}`), select); selects.push(select); slots.append(row);
    }
    const fill = (prefs: QuickMenuPrefs) => { show.checked = prefs.showButton; edge.value = prefs.edge; selects.forEach((s, i) => { s.value = prefs.actions[i]!; }); };
    fill(this.prefs()); section.append(slots); body.append(section);
    const reset = el('button', '', 'Restore QuickMenu defaults'); reset.type = 'button'; reset.addEventListener('click', () => fill(defaultQuickMenu())); section.append(reset);
    const gestures = el('details', 'student-settings-section'); gestures.setAttribute('aria-labelledby', 'gesture-settings-title');
    const gestureTitle = el('summary', '', 'Gestures'); gestureTitle.id = 'gesture-settings-title';
    const rangeRow = el('label', 'app-settings-check'), rangeGesture = el('input'); rangeGesture.type = 'checkbox';
    rangeGesture.checked = this.app.rangeGestureEnabled; rangeGesture.setAttribute('aria-label', 'Hold ruler to set playback range');
    rangeRow.append(rangeGesture, document.createTextNode('Hold ruler to set playback range'));
    gestures.append(gestureTitle, rangeRow, el('p', 'menu-note', 'In Flipbook or Clips, hold still on the frame-number ruler, then drag to the other end of your loop. Lift to apply. Quick drags still scrub; use Range → Whole animation to clear the loop. This option applies to this browser/device.'));
    body.append(gestures);
    const readDraft = (): StudentSetup => readStudentSetup({
      ui:{tools:Object.fromEntries([...toolChecks].map(([id,c])=>[id,c.checked])),controls:Object.fromEntries([...controlChecks].map(([id,c])=>[id,c.checked]))},
      level:level.value,quickMenu:{showButton:show.checked,edge:edge.value,actions:selects.map(s=>s.value)},
      rangeGesture:rangeGesture.checked,inkPaint:inkPaint.input.checked,quickShape:quickShape.input.checked,fingerPaint:fingerPaint.input.checked,
    });
    const fillSetup = (setup:StudentSetup) => {
      fill(setup.quickMenu);level.value=setup.level;rangeGesture.checked=setup.rangeGesture;
      inkPaint.input.checked=setup.inkPaint;quickShape.input.checked=setup.quickShape;fingerPaint.input.checked=setup.fingerPaint;
      for(const [id,c] of toolChecks)c.checked=setup.ui.tools[id as keyof StudentSetup['ui']['tools']];
      for(const [id,c] of controlChecks)c.checked=setup.ui.controls[id as keyof StudentSetup['ui']['controls']];
    };
    const selected = () => profiles.profiles.find(p=>p.id===chooser.value);
    const updateProfiles = (id:string) => {
      chooser.replaceChildren();const current=el('option','','Current setup');current.value='';chooser.append(current);
      for(const p of profiles.profiles){const o=el('option','',p.name);o.value=p.id;chooser.append(o);}
      chooser.value=id;const p=selected();rename.disabled=remove.disabled=!p;save.disabled=profiles.profiles.length>=PROFILE_LIMIT;
      name.value=p?.name??'';
    };
    const validName = (except='') => {
      const value=profileName(name.value);
      if(!value){message.textContent='Enter a profile name.';name.focus();return null;}
      if(profiles.profiles.some(p=>p.id!==except&&p.name.toLowerCase()===value.toLowerCase())){message.textContent='Choose a name that is not already used.';name.focus();return null;}
      return value;
    };
    chooser.addEventListener('change',()=>{const p=selected();fillSetup(p?.setup??initial);name.value=p?.name??'';rename.disabled=remove.disabled=!p;message.textContent='Preview only. Apply settings to keep this setup.';});
    save.addEventListener('click',()=>{
      if(profiles.profiles.length>=PROFILE_LIMIT){message.textContent=`Up to ${PROFILE_LIMIT} profiles can be saved on this device.`;return;}
      const value=validName();if(!value)return;
      let n=1;while(profiles.profiles.some(p=>p.id===`profile${n}`))n++;
      const id=`profile${n}`;profiles.profiles.push({id,name:value,setup:readDraft()});updateProfiles(id);message.textContent='New profile is ready. Apply settings to save it.';
    });
    rename.addEventListener('click',()=>{const p=selected();if(!p)return;const value=validName(p.id);if(!value)return;p.name=value;updateProfiles(p.id);message.textContent='Rename is ready. Apply settings to save it.';});
    remove.addEventListener('click',()=>{const p=selected();if(!p)return;profiles.profiles=profiles.profiles.filter(x=>x.id!==p.id);updateProfiles('');message.textContent='Deletion is ready. Apply settings to keep it, or Cancel to restore the profile.';});
    fillSetup(initial);
    const active=profiles.profiles.find(p=>p.id===profiles.active&&JSON.stringify(p.setup)===JSON.stringify(initial));updateProfiles(active?.id??'');
    const footer = el('footer', 'app-settings-foot'), cancel = el('button', '', 'Cancel'), apply = el('button', 'primary', 'Apply settings');
    cancel.type = apply.type = 'button'; footer.append(message, cancel, apply);
    let finished = false;
    const done = () => {
      if (finished) return; finished = true;
      d.close(); d.remove(); this.dialog = null;
      const target = anchor?.isConnected && anchor.getBoundingClientRect().height ? anchor : this.canvas;
      target.focus({ preventScroll: true });
    };
    apply.addEventListener('click', () => {
      if(this.app.strokeActive||this.app.adjusting||this.app.gradEditing){message.textContent='Finish the current drawing edit before applying settings.';return;}
      const setup=readDraft();
      if(setup.inkPaint&&!this.app.autoPaintSupported&&setup.inkPaint!==this.app.inkPaint.enabled){message.textContent='Auto Paint is not available at this canvas size on this device. Turn it off for this setup, or use a smaller canvas.';return;}
      const p=selected();if(p)p.setup=setup;profiles.active=p?.id??null;
      try{localStorage.setItem(STUDENT_PROFILES_KEY,JSON.stringify(profiles));}catch{message.textContent='This browser could not save profiles. Your draft is still here; free storage and try Apply again, or Cancel.';return;}
      if(JSON.stringify(setup.ui)!==JSON.stringify(this.app.studentUI))this.app.setStudentUI(readStudentUI(setup.ui));
      if(setup.level!==this.app.interfaceLevel)this.app.setInterfaceLevel(setup.level);
      if(setup.rangeGesture!==this.app.rangeGestureEnabled)this.app.setRangeGestureEnabled(setup.rangeGesture);
      if(setup.quickShape!==this.app.quickShape)this.app.setQuickShape(setup.quickShape);
      if(setup.fingerPaint!==this.app.fingerPaint)this.app.setFingerPaint(setup.fingerPaint);
      if(setup.inkPaint!==this.app.inkPaint.enabled)this.app.setInkPaint(setup.inkPaint);
      for(const id of toShow)setHidden(id,false);
      this.apply(setup.quickMenu); done();
    });
    close.addEventListener('click', done); cancel.addEventListener('click', done);
    d.addEventListener('cancel', e => { e.preventDefault(); done(); }); d.addEventListener('close', done);
    d.append(header, body, footer); document.body.append(d); d.showModal(); (focus === 'quickmenu' ? show : chooser).focus();
  }
}
