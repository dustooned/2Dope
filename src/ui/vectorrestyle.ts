import type { App } from '../app';

/** Drafts stay in this dialog, never in the shared drawing pool. Escape/Cancel need no rollback. */
export function showVectorRestyle(app:App):void {
  if(document.querySelector('dialog[data-vector-restyle]'))return;
  let preview=app.previewVectorRestyle();if(!preview)return;
  const dialog=document.createElement('dialog');dialog.dataset.vectorRestyle='';dialog.className='vector-restyle';
  const title=document.createElement('h2');title.textContent='Apply brush to selected lines';
  const note=document.createElement('p');note.textContent=`${preview.count} vector line${preview.count===1?'':'s'} · ${app.brush.name}. Colour and recorded pressure stay with the lines.`;
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=Math.max(1,Math.round(640*app.docH/app.docW));canvas.setAttribute('aria-label','Vector brush preview');
  const label=document.createElement('label'), defaults=document.createElement('input');defaults.type='checkbox';label.append(defaults,document.createTextNode('Use this brush’s weight and taper (otherwise keep line weight)'));
  const actions=document.createElement('div');actions.className='student-profile-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';
  const apply=document.createElement('button');apply.type='button';apply.textContent='Apply brush';
  const draw=()=>{const g=canvas.getContext('2d')!;g.clearRect(0,0,canvas.width,canvas.height);preview?.paint(g);};
  defaults.onchange=()=>{preview=app.previewVectorRestyle(defaults.checked);apply.disabled=!preview;draw();};
  cancel.onclick=()=>dialog.close();apply.onclick=()=>{if(preview?.apply())dialog.close();};
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  actions.append(cancel,apply);dialog.append(title,note,canvas,label,actions);document.body.append(dialog);draw();dialog.showModal();cancel.focus();
}
