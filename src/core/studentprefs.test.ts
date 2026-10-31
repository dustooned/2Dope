import { describe, expect, it } from 'vitest';
import { PROFILE_LIMIT, STUDENT_TOOLS, profileName, readStudentProfiles, readStudentSetup, readStudentUI } from './studentprefs';

describe('student profiles and visibility', () => {
  it('defaults to existing tool visibility and keeps Brush available', () => {
    expect(Object.values(readStudentUI(null).tools).every(Boolean)).toBe(true);
    const ui=readStudentUI({tools:Object.fromEntries(STUDENT_TOOLS.map(([k])=>[k,false])),controls:{guides:false}});
    expect(ui.tools.brush).toBe(true);expect(ui.tools.pen).toBe(false);expect(ui.controls.guides).toBe(false);expect(ui.controls.planes).toBe(true);
  });
  it('repairs unknown tool values without allowing unknown keys into the setup', () => {
    const ui=readStudentUI({tools:{pen:0,eraser:'false',unexpected:false},controls:[]});
    expect(ui.tools.pen&&ui.tools.eraser).toBe(true);expect(ui.tools).not.toHaveProperty('unexpected');
  });
  it('validates the behavioral options, interface level and QuickMenu slots', () => {
    const setup=readStudentSetup({level:'oops',rangeGesture:'true',inkPaint:1,fingerPaint:{},quickShape:false,quickMenu:{actions:['none','bad','eraser'],edge:'left'}});
    expect(setup).toMatchObject({level:'simple',rangeGesture:false,inkPaint:false,fingerPaint:false,quickShape:false});
    expect(setup.quickMenu.actions.slice(0,3)).toEqual(['none','redo','eraser']);expect(setup.quickMenu.edge).toBe('left');
  });
  it('normalizes names and rejects blank, duplicate names and duplicate/invalid ids', () => {
    expect(profileName('  My    drawing\nsetup  ')).toBe('My drawing setup');expect(profileName('x'.repeat(50))).toHaveLength(40);
    const store=readStudentProfiles({version:1,active:'a',profiles:[{id:'a',name:' Draw '},{id:'b',name:'draw'},{id:'a',name:'Other'},{id:'../bad',name:'Bad'},{id:'c',name:'  '}]});
    expect(store.profiles.map(p=>p.name)).toEqual(['Draw']);expect(store.active).toBe('a');
  });
  it('bounds stored profile counts and ignores unsupported versions', () => {
    const profiles=Array.from({length:PROFILE_LIMIT+10},(_,i)=>({id:`p${i}`,name:`Setup ${i}`}));
    expect(readStudentProfiles({version:1,active:'p29',profiles}).profiles).toHaveLength(PROFILE_LIMIT);
    expect(readStudentProfiles({version:1,active:'p29',profiles}).active).toBeNull();
    expect(readStudentProfiles({version:2,profiles})).toEqual({version:1,active:null,profiles:[]});
  });
  it('deep copies setup snapshots so editing one profile cannot alter another or the input', () => {
    const setup=readStudentSetup({ui:{tools:{pen:false}},level:'full',inkPaint:true,rangeGesture:true});
    const store=readStudentProfiles({version:1,profiles:[{id:'a',name:'A',setup},{id:'b',name:'B',setup}]});
    store.profiles[0]!.setup.ui.tools.pen=true;store.profiles[0]!.setup.quickMenu.actions[0]='brush';
    store.profiles[0]!.setup.workspaces.draw.tools.push('pen');
    expect(store.profiles[1]!.setup.workspaces.draw.tools).not.toContain('pen');
    expect(setup.workspaces.draw.tools).not.toContain('pen');
    expect(store.profiles[1]!.setup.ui.tools.pen).toBe(false);expect(setup.ui.tools.pen).toBe(false);expect(setup.quickMenu.actions[0]).toBe('undo');
  });
});
