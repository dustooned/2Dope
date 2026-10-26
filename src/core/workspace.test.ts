import { describe, expect, it } from 'vitest';
import { isPaintingWorkspace, optionsRow, paintingView, toolChoice, type OptionsState, type Workspace } from './workspace';
describe('painting workspace preferences', () => {
  it('opens Draw as a still canvas and Animate as a flipbook', () => {
    expect(paintingView('draw', null)).toBe('still');
    expect(paintingView('animate', null)).toBe('flipbook');
  });
  it('keeps Draw optional animation independent from Animate clips', () => {
    expect(paintingView('draw', 'flipbook')).toBe('flipbook');
    expect(paintingView('draw', 'clips')).toBe('still');
    expect(paintingView('animate', 'clips')).toBe('clips');
    expect(paintingView('animate', 'timeline')).toBe('clips');
    expect(paintingView('animate', 'broken')).toBe('flipbook');
  });
  it('both painting modes permit painting without making Timing or Motion painting modes', () => {
    expect(['board', 'draw', 'animate', 'time', 'motion'].map(w => isPaintingWorkspace(w as Parameters<typeof isPaintingWorkspace>[0])))
      .toEqual([false, true, true, false, false]);
  });
});

const state = (over: Partial<OptionsState>): OptionsState => ({
  workspace: 'draw', tool: 'brush', fillMode: 'tap', smudging: false, adjusting: false,
  transforming: false, pointEditing: false, arranging: false, layersOpen: false, ...over,
});
const others: Workspace[] = ['board', 'time', 'motion'];
const own = { board: 'board', time: 'time', motion: 'motion' } as const;

describe('bubble options row follows the workspace', () => {
  it('Fill chosen in Draw does not leave Fill options in Motion, Timing or Story', () => {
    for (const ws of others) expect(optionsRow(state({ workspace: ws, tool: 'fill' }))).toBe(own[ws as keyof typeof own]);
    expect(optionsRow(state({ workspace: 'draw', tool: 'fill' }))).toBe('fill');
    expect(optionsRow(state({ workspace: 'animate', tool: 'fill' }))).toBe('fill');
  });
  it('Select, Smudge and drawing states stay in Draw and Animate', () => {
    const drawingStates: Partial<OptionsState>[] = [
      { tool: 'fill', fillMode: 'lasso' }, { tool: 'brush', smudging: true }, { adjusting: true },
      { transforming: true }, { pointEditing: true }, { arranging: true }, { tool: 'pen' }, { tool: 'eraser' },
    ];
    for (const ws of others) for (const over of drawingStates) expect(optionsRow(state({ workspace: ws, ...over }))).toBe(own[ws as keyof typeof own]);
  });
  it('an adjustment shows its own controls on top of Fill or Select', () => {
    expect(toolChoice(state({ tool: 'fill', fillMode: 'lasso', adjusting: true }))).toBe('adjust');
    expect(optionsRow(state({ tool: 'fill', fillMode: 'lasso', adjusting: true }))).toBe('adjust');
    expect(optionsRow(state({ tool: 'fill', adjusting: true }))).toBe('adjust');
  });
  it('keeps the drawing states in the order the editors need', () => {
    expect(optionsRow(state({ arranging: true, pointEditing: true }))).toBe('assets');
    expect(optionsRow(state({ pointEditing: true, transforming: true }))).toBe('points');
    expect(optionsRow(state({ transforming: true, layersOpen: true }))).toBe('transform');
    expect(optionsRow(state({ layersOpen: true }))).toBe('layers');
    expect(optionsRow(state({ workspace: 'time', layersOpen: true }))).toBe('layers');
    expect(optionsRow(state({ workspace: 'motion', layersOpen: true }))).toBe('motion');
    expect(optionsRow(state({ tool: 'brush', smudging: true }))).toBe('smudge');
    expect(optionsRow(state({ tool: 'pen' }))).toBe('paint');
  });
});
