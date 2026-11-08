# Lettering prototypes (2026-11-08)

Throwaway spikes for `docs/LETTERING-DESIGN.md`. They are plain Node scripts (no DOM, no app code),
are not part of the build, and are not tests. Run them from this folder:

```
node bench.mjs                # shape detection on 1,800 sloppy synthetic drawings (SEED=n to vary)
node fitdemo.mjs              # the text sets the balloon: fixed lettering size, smallest oval
node tailbench.mjs            # merged tails on 2,000 random oval and lumpy balloons
node tracebench.mjs           # pixel drawings traced into balloons (slow: about a minute)
```

- `classify.mjs`: classifies a drawn closed loop as speech, box, cloud, burst, custom or open. It
  uses solidity (area against convex hull), fill of the minimum-area rectangle, radial peaks, the
  share of straight outline, and the number of inward dents.
- `bench.mjs`: generates hand-drawn-like outlines with wobble, pen jitter, rotation, stretch,
  closure gaps or overshoot, and uneven pen speed, then prints a confusion table.
- `fit.mjs`: finds the smallest speech ellipse for fixed-size text, with balanced line breaks
  (dynamic programming over word breaks) so lines follow the oval. It refuses to squeeze text and
  reports `tooLong` past the frame limits.

- `tails.mjs`: tail geometry. Merged (spliced into the outline, no seam), seam (its own closed
  shape from the edge), bubbles (thought) and lightning (radio).
- `trace.mjs`: rasterises a drawing, closes gaps adaptively, floods the enclosed area from a tap
  point, traces the outside of area plus ink, and classifies it.

Results and limits are summarised in the design doc under "Prototype findings".
