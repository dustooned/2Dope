/**
 * Every change goes through a command. That gives undo/redo now, and autosave, scripting and
 * replay later (the same pattern the Craft apps use).
 */
export interface Command {
  label: string;
  do(): void;
  undo(): void;
}

export class History {
  private done: Command[] = [];
  private undone: Command[] = [];
  onChange: () => void = () => {};

  constructor(private readonly limit = 200) {}

  /** Record a command. Pass `applied = false` to run it now. */
  push(cmd: Command, applied = true): void {
    if (!applied) cmd.do();
    this.done.push(cmd);
    if (this.done.length > this.limit) this.done.shift();
    this.undone = [];
    this.onChange();
  }

  undo(): Command | null {
    const cmd = this.done.pop();
    if (!cmd) return null;
    cmd.undo();
    this.undone.push(cmd);
    this.onChange();
    return cmd;
  }

  redo(): Command | null {
    const cmd = this.undone.pop();
    if (!cmd) return null;
    cmd.do();
    this.done.push(cmd);
    this.onChange();
    return cmd;
  }

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }
}
