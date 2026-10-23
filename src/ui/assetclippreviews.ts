import type { App } from '../app';
import type { Project } from '../core/project';
import { assetPreviewKey, renderAssetPreview } from '../view/assetpreview';

/** Visible clips share bounded source previews. Completion paints existing nodes, never rebuilds rails. */
export class AssetClipPreviews {
  private project: Project | null = null;
  private targets = new Map<HTMLElement,{source:string;key:string}>();
  private visible = new Set<HTMLElement>();
  private cache = new Map<string,string>();
  private failed = new Set<string>();
  private busy = false;
  private scheduled = false;
  private observer: IntersectionObserver;
  constructor(private app: App, private track: HTMLElement) {
    this.observer = new IntersectionObserver(entries => {
      for (const e of entries) {
        const node=e.target as HTMLElement;
        if(e.isIntersecting&&this.targets.has(node)) this.visible.add(node); else this.visible.delete(node);
      }
      this.schedule();
    },{root:track,rootMargin:'0px 120px'});
    document.addEventListener('visibilitychange',()=>this.refresh());
  }
  private enabled(): boolean {return this.app.workspace==='animate'&&!this.app.flipbookView&&!document.hidden;}
  refresh(): void {
    if (this.project !== this.app.project) {
      this.project=this.app.project;this.cache.clear();this.failed.clear();
      this.observer.disconnect();this.targets.clear();this.visible.clear();
    }
    if (!this.enabled()) {this.observer.disconnect();this.targets.clear();this.visible.clear();return;}
    const nodes=new Set(this.track.querySelectorAll<HTMLElement>('.asset-clip-art[data-asset-source]'));
    for(const node of this.targets.keys()) if(!nodes.has(node)) {
      this.observer.unobserve(node);this.targets.delete(node);this.visible.delete(node);
    }
    const keys=new Map<string,string>();
    for(const node of nodes) {
      const source=node.dataset.assetSource!;
      if(!keys.has(source)) keys.set(source,assetPreviewKey(this.app.project,source));
      const key=keys.get(source)!;
      const previous=this.targets.get(node);
      this.targets.set(node,{source,key});
      if(previous?.key!==key) {node.style.backgroundImage='';node.dataset.preview='loading';}
      const hit=this.cache.get(key);
      if(hit) {this.cache.delete(key);this.cache.set(key,hit);this.paint(node,hit);}
      else if(this.failed.has(key)) node.dataset.preview='unavailable';
      if(!previous) this.observer.observe(node);
    }
    this.schedule();
  }
  private paint(node: HTMLElement,url: string): void {
    node.style.backgroundImage=`url("${url}")`;node.dataset.preview='ready';
  }
  private schedule(): void {
    if(this.scheduled||this.busy||!this.enabled()||this.app.strokeActive||this.app.playing) return;
    this.scheduled=true;
    requestAnimationFrame(()=>{this.scheduled=false;void this.pump();});
  }
  private async pump(): Promise<void> {
    if(this.busy||!this.enabled()||this.app.strokeActive||this.app.playing) return;
    const target=[...this.targets].find(([node,t])=>this.visible.has(node)&&node.dataset.preview!=='ready'&&t.key&&!this.cache.has(t.key)&&!this.failed.has(t.key));
    if(!target) return;
    const [,t]=target,p=this.app.project;
    const current=()=>this.app.project===p&&this.enabled()&&!this.app.strokeActive&&
      [...this.targets].some(([node,x])=>node.isConnected&&this.visible.has(node)&&x.key===t.key);
    this.busy=true;
    try {
      const url=await renderAssetPreview(p,t.source,this.app.residency,current);
      if(!url||!current()) return;
      if(assetPreviewKey(p,t.source)!==t.key) {this.refresh();return;}
      this.cache.set(t.key,url);
      while(this.cache.size>32) this.cache.delete(this.cache.keys().next().value!);
      for(const [node,x] of this.targets) if(x.key===t.key) this.paint(node,url);
    } catch {
      if(current()) {
        this.failed.add(t.key);while(this.failed.size>32)this.failed.delete(this.failed.values().next().value!);
        for(const [node,x] of this.targets) if(x.key===t.key) node.dataset.preview='unavailable';
      }
    } finally {this.busy=false;this.schedule();}
  }
}
