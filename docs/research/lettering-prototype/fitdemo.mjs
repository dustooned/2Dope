import { fitSpeech, mono } from './fit.mjs';
const size = 1080 * 0.032; // Body = 3.2% of page height on a 1920×1080 page
const texts = ['HEY!', 'WAIT FOR ME, I LEFT MY LUNCH ON THE BUS!', 'IF YOU THINK THAT DRAGON IS GOING TO WAIT WHILE WE ARGUE ABOUT WHO FORGOT THE MAP, YOU HAVE NOT MET MANY DRAGONS.', Array(120).fill('WORD').join(' ')];
for (const t of texts) {
  const r = fitSpeech(t.split(' '), mono(size), size, { maxW: 1920 * 0.6, maxH: 1080 * 0.7 });
  if (r.tooLong) { console.log(`${t.length} chars -> too long for one balloon (split suggested)`); continue; }
  console.log(`${String(t.length).padStart(3)} chars -> ${r.n} lines, balloon ${Math.round(r.a * 2)}×${Math.round(r.b * 2)}; line widths ${r.lines.map(l => Math.round(l.width)).join(', ')}`);
}
