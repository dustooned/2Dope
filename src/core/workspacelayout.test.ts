import { describe, expect, it } from 'vitest';
import { defaultWorkspaceLayout, readWorkspaceLayouts } from './workspacelayout';

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
    const result = readWorkspaceLayouts({ draw: { tools: ['pen', 'pen', 'camera', 'fill', {}, 'bad'], toolDock: 'right', labels: true }, animate: { tools: [] } });
    expect(result.draw.tools).toEqual(['brush', 'pen', 'fill']);
    expect(result.draw.toolDock).toBe('right'); expect(result.draw.labels).toBe(true);
    expect(result.animate.tools).toEqual(['brush']);
  });
  it('repairs malformed fields, bounds stored input and deep-copies saved arrangements', () => {
    const input = { draw: { tools: [...Array(45).fill('pen'), 'fill'], brushEdge: 'elsewhere', advancedTargets: 'true' } };
    const result = readWorkspaceLayouts(input);
    expect(result.draw.tools).toEqual(['brush', 'pen']);
    expect(result.draw.brushEdge).toBe('left'); expect(result.draw.advancedTargets).toBe(false);
    result.draw.tools.push('eraser'); expect(input.draw.tools).not.toContain('eraser');
  });
});
