import type { App } from '../app';
import { openModal } from './modal';

/** Drafts stay in this dialog, never in the shared drawing pool. Escape/Cancel need no rollback. */
export function showVectorRestyle(app:App):void {
  if(document.querySelector('dialog[data-vector-restyle]'))return;
  let preview=app.previewVectorRestyle();if(!preview)return;
  const note=document.createElement('p');note.textContent=`${preview.count} vector line${preview.count===1?'':'s'} · ${app.brush.name}. Colour and recorded pressure stay with the lines.`;
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=Math.max(1,Math.round(640*app.docH/app.docW));canvas.setAttribute('aria-label','Vector brush preview');
  const label=document.createElement('label'), defaults=document.createElement('input');defaults.type='checkbox';label.append(defaults,document.createTextNode('Use this brush’s weight and taper (otherwise keep line weight)'));
  const draw=()=>{const g=canvas.getContext('2d')!;g.clearRect(0,0,canvas.width,canvas.height);preview?.paint(g);};
  const modal=openModal({title:'Apply brush to selected lines',className:'vector-restyle',bodyClass:null,content:[note,canvas,label],
    footer:{tag:'div',className:'student-profile-actions'},
    actions:[{id:'cancel',label:'Cancel'},{id:'apply',label:'Apply brush',run:()=>!!preview?.apply()}]});
  modal.dialog.dataset.vectorRestyle='';
  defaults.onchange=()=>{preview=app.previewVectorRestyle(defaults.checked);modal.buttons.apply.disabled=!preview;draw();};
  draw();modal.buttons.cancel.focus();
}
