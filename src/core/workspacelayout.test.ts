import { describe, expect, it } from 'vitest';
import { defaultWorkspaceLayout, readWorkspaceLayouts, WORKSPACE_TOOLS } from './workspacelayout';

describe('workspace layout preferences', () => {
  it('gives Draw painting tools and Animate asset access without sharing mutable defaults', () => {
    const a = readWorkspaceLayouts(null), b = readWorkspaceLayouts(null);
    expect(a.draw.tools).toEqual(defaultWorkspaceLayout('draw').tools);
    expect(a.animate.tools).toContain('assets');
    a.draw.tools.reverse(); a.draw.brushEdge = 'right';
    expect(b.draw).toEqual(defaultWorkspaceLayout('draw'));
    expect(a.animate.brushEdge).toBe('left');
  });
  it('keeps valid order, removes duplicates and cross-mode/unknown actions, and recovers Brush', () => {
    // (saved with today's tool set: `seen` keeps new defaults out of this check)
    const seen = [...WORKSPACE_TOOLS.draw, ...WORKSPACE_TOOLS.animate];
    const result = readWorkspaceLayouts({ draw: { tools: ['pen', 'pen', 'camera', 'fill', {}, 'bad'], toolDock: 'right', labels: true, seen }, animate: { tools: [], seen } });
    expect(result.draw.tools).toEqual(['brush', 'pen', 'fill']);
    expect(result.draw.toolDock).toBe('right'); expect(result.draw.labels).toBe(true);
    expect(result.animate.tools).toEqual(['brush']);
  });
  it('repairs malformed fields, bounds stored input and deep-copies saved arrangements', () => {
    const input = { draw: { tools: [...Array(45).fill('pen'), 'fill'], brushEdge: 'elsewhere', advancedTargets: 'true', seen: [...WORKSPACE_TOOLS.draw] } };
    const result = readWorkspaceLayouts(input);
    expect(result.draw.tools).toEqual(['brush', 'pen']);
    expect(result.draw.brushEdge).toBe('left'); expect(result.draw.advancedTargets).toBe(false);
    result.draw.tools.push('eraser'); expect(input.draw.tools).not.toContain('eraser');
  });

  it('adds a default tool that is new since the layout was saved, once', () => {
    // saved before Motion had the view switches (no `seen`): they join the end
    const old = readWorkspaceLayouts({ motion: { tools: ['camera', 'addlayer'] }, draw: { tools: ['brush', 'eraser'] } });
    expect(old.motion.tools).toEqual(['camera', 'addlayer', 'safeareas', 'centrecross', 'overscan']);
    expect(old.draw.tools).toEqual(['brush', 'eraser', 'eyedrop']);
    // taken off after that: it stays off
    const later = readWorkspaceLayouts(JSON.parse(JSON.stringify({ ...old, motion: { ...old.motion, tools: ['camera'] } })));
    expect(later.motion.tools).toEqual(['camera']);
    expect(later.draw.tools).toEqual(['brush', 'eraser', 'eyedrop']);
  });

  it('moves only the untouched Story bar to sketch tools and keeps custom actions', () => {
    const legacy = ['panel', 'images', 'dup', 'del', 'play', 'export'];
    expect(readWorkspaceLayouts({ board: { tools: legacy } }).board.tools).toEqual(['brush', 'eraser', 'color']);
    expect(readWorkspaceLayouts({ board: { tools: ['play', 'panel'], seen: legacy } }).board.tools).toEqual(['play', 'panel', 'brush', 'eraser', 'color']);
    const customized = readWorkspaceLayouts({ board: { tools: legacy, labels: true } }).board;
    expect(customized.tools.slice(0, 6)).toEqual(legacy);
    const later = readWorkspaceLayouts({ board: { tools: ['brush', 'play'], seen: [...WORKSPACE_TOOLS.board] } }).board;
    expect(later.tools).toEqual(['brush', 'play']);
  });
});

