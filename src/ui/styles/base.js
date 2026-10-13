/** Base tokens, typography, shared chrome (header / footer / keys / buttons) and keyframes. */
export const u = (n) => `calc(var(--u) * ${n})`;

export const baseCSS = `
.tk-ui {
  position: absolute; inset: 0; overflow: hidden;
  --u: min(1vh, 0.5625vw);
  --f-display: 'Lilita One', 'Arial Rounded MT Bold', 'Arial Black', sans-serif;
  --f-body: 'Nunito', 'Segoe UI', system-ui, sans-serif;
  --ink: #1d0f2e;
  --yellow: #ffd23f; --orange: #ff8a1f; --red: #ff3d4d; --pink: #ff3d8b;
  --cyan: #22d3ff; --blue: #2f6bff; --lime: #7dff4a; --purple: #a05cff;
  --panel-a: rgba(44, 28, 120, .94); --panel-b: rgba(16, 10, 52, .94);
  --spring: cubic-bezier(.34, 1.56, .64, 1);
  --spring2: cubic-bezier(.2, 1.9, .45, 1);
  --out: cubic-bezier(.16, 1, .3, 1);
  --in: cubic-bezier(.6, 0, .9, .35);
  font-family: var(--f-body); font-weight: 800; color: #fff;
  font-size: ${u(2.2)}; line-height: 1.15;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  user-select: none; -webkit-user-select: none;
  contain: layout style;
}
.tk-ui *, .tk-ui *::before, .tk-ui *::after { box-sizing: border-box; }
.tk-ui button {
  font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0;
  cursor: pointer; text-align: inherit; outline: none; -webkit-tap-highlight-color: transparent;
}
.tk-ui [hidden] { display: none !important; }
.tk-ui svg { display: block; }
.tk-layer, .tk-screen, .tk-overlays, .tk-hud { position: absolute; inset: 0; pointer-events: none; }
.tk-layer--screens { z-index: 5; }
.tk-overlays { z-index: 3; }
.tk-hud { z-index: 2; }
.tk-screen.is-in .tk-focusable, .tk-screen.is-in button, .tk-screen.is-in .tk-interactive { pointer-events: auto; }
.tk-screen.is-out, .tk-screen.is-out * { pointer-events: none !important; }
.tk-screen--title.is-in { pointer-events: auto; cursor: pointer; }

.tk-display {
  font-family: var(--f-display); font-weight: 400; letter-spacing: .015em; text-transform: uppercase;
  -webkit-text-stroke: ${u(0.55)} var(--ink); paint-order: stroke fill;
  text-shadow: 0 ${u(0.45)} 0 var(--ink);
}

/* ---------- screen enter / exit ---------- */
.tk-screen.is-in .tk-anim-l { animation: tk-in-l .6s var(--out) both; animation-delay: calc(var(--i, 0) * 55ms + 40ms); }
.tk-screen.is-in .tk-anim-r { animation: tk-in-r .6s var(--out) both; animation-delay: calc(var(--i, 0) * 55ms + 80ms); }
.tk-screen.is-in .tk-anim-u { animation: tk-in-u .6s var(--out) both; animation-delay: calc(var(--i, 0) * 55ms + 60ms); }
.tk-screen.is-in .tk-anim-d { animation: tk-in-d .6s var(--out) both; animation-delay: calc(var(--i, 0) * 55ms + 120ms); }
.tk-screen.is-in .tk-anim-pop { animation: tk-in-pop .62s var(--spring) both; animation-delay: calc(var(--i, 0) * 55ms + 60ms); }
.tk-screen.is-in .tk-backdrop { animation: tk-fade-in .45s ease both; }
.tk-screen.is-out { animation: tk-fade-out .34s ease forwards; }
.tk-screen.is-out .tk-anim-l, .tk-screen.is-out .tk-anim-u { animation: tk-out-l .3s var(--in) both; }
.tk-screen.is-out .tk-anim-r { animation: tk-out-r .3s var(--in) both; }
.tk-screen.is-out .tk-anim-d { animation: tk-out-d .3s var(--in) both; }
.tk-screen.is-out .tk-anim-pop { animation: tk-out-pop .3s var(--in) both; animation-delay: calc(var(--i, 0) * 20ms); }
.tk-screen.is-back.is-in .tk-anim-l { animation-name: tk-in-r; }

@keyframes tk-in-l { from { opacity: 0; translate: ${u(-16)} 0; } to { opacity: 1; translate: 0 0; } }
@keyframes tk-in-r { from { opacity: 0; translate: ${u(16)} 0; } to { opacity: 1; translate: 0 0; } }
@keyframes tk-in-u { from { opacity: 0; translate: 0 ${u(-8)}; } to { opacity: 1; translate: 0 0; } }
@keyframes tk-in-d { from { opacity: 0; translate: 0 ${u(8)}; } to { opacity: 1; translate: 0 0; } }
@keyframes tk-in-pop { 0% { opacity: 0; scale: .45; } 55% { opacity: 1; scale: 1.07; } 100% { opacity: 1; scale: 1; } }
@keyframes tk-out-l { to { opacity: 0; translate: ${u(-10)} 0; } }
@keyframes tk-out-r { to { opacity: 0; translate: ${u(10)} 0; } }
@keyframes tk-out-d { to { opacity: 0; translate: 0 ${u(6)}; } }
@keyframes tk-out-pop { to { opacity: 0; scale: .8; } }
@keyframes tk-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes tk-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes tk-spin { to { rotate: 360deg; } }
@keyframes tk-pulse { 0%, 100% { scale: 1; } 50% { scale: 1.07; } }
@keyframes tk-float { 0%, 100% { translate: 0 0; } 50% { translate: 0 ${u(-1.2)}; } }
@keyframes tk-bob { 0%, 100% { translate: 0 0; } 50% { translate: 0 ${u(-0.8)}; } }
@keyframes tk-chev { 0%, 100% { opacity: .2; } 35% { opacity: 1; } }
@keyframes tk-stripes { from { background-position: 0 0; } to { background-position: ${u(4.8)} 0; } }
@keyframes tk-flash { 0% { opacity: .85; } 100% { opacity: 0; } }
@keyframes tk-pop { 0% { opacity: 0; scale: .3; } 60% { opacity: 1; scale: 1.25; } 100% { opacity: 1; scale: 1; } }
@keyframes tk-bump { 0% { scale: 1; } 35% { scale: 1.28; } 65% { scale: .94; } 100% { scale: 1; } }
@keyframes tk-focus-pop { 0% { scale: .92; } 55% { scale: 1.05; } 100% { scale: 1; } }
@keyframes tk-nudge-l { 0%, 100% { translate: 0 0; } 50% { translate: ${u(-0.6)} 0; } }
@keyframes tk-nudge-r { 0%, 100% { translate: 0 0; } 50% { translate: ${u(0.6)} 0; } }
@keyframes tk-shine { 0% { background-position: 160% 0; } 45%, 100% { background-position: -60% 0; } }
@keyframes tk-letter-in {
  0% { opacity: 0; translate: 0 ${u(-30)}; scale: 1.5; rotate: -14deg; }
  55% { opacity: 1; translate: 0 ${u(1.5)}; scale: .92; rotate: 3deg; }
  78% { translate: 0 ${u(-0.6)}; scale: 1.04; rotate: -1deg; }
  100% { opacity: 1; translate: 0 0; scale: 1; rotate: 0deg; }
}

/* ---------- header / footer chrome ---------- */
.tk-header { position: absolute; left: ${u(5)}; top: ${u(3.6)}; display: flex; flex-direction: column; align-items: flex-start; gap: ${u(0.5)}; z-index: 4; }
.tk-header__crumbs {
  display: flex; align-items: center; gap: ${u(0.8)}; min-height: ${u(2.4)}; padding-left: ${u(2.4)};
  font-size: ${u(1.75)}; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; color: rgba(255,255,255,.82);
  text-shadow: 0 ${u(0.25)} 0 rgba(0,0,0,.55);
}
.tk-crumb-sep { color: var(--yellow); font-style: normal; font-size: 1.3em; line-height: 1; }
.tk-header__title { position: relative; margin: 0; padding: ${u(0.9)} ${u(6)} ${u(1.3)} ${u(2.6)}; font-size: ${u(6.2)}; line-height: 1; color: var(--yellow); font-weight: 400; isolation: isolate; }
.tk-header__title::before {
  content: ''; position: absolute; inset: 0; z-index: -1; transform: skewX(-14deg); border-radius: ${u(0.6)};
  background:
    repeating-linear-gradient(-45deg, rgba(255,255,255,.05) 0 ${u(1)}, transparent ${u(1)} ${u(2)}),
    linear-gradient(90deg, rgba(18,10,58,.96) 0%, rgba(44,26,120,.9) 72%, rgba(44,26,120,0) 100%);
  border-left: ${u(1.3)} solid var(--yellow);
  box-shadow: ${u(-0.5)} 0 0 var(--ink);
}
.tk-header__title::after {
  content: ''; position: absolute; left: ${u(-2.2)}; bottom: ${u(-0.9)}; width: ${u(16)}; height: ${u(0.7)};
  background: linear-gradient(90deg, var(--pink), var(--orange)); transform: skewX(-14deg); border-radius: 99px;
}
.tk-header__title span { display: inline-block; }
.tk-header__title.is-swap span { animation: tk-in-r .45s var(--out) both; }

.tk-footer {
  position: absolute; left: ${u(5)}; bottom: ${u(3)}; display: flex; align-items: center; gap: ${u(1.4)}; z-index: 4;
  font-size: ${u(1.8)}; font-weight: 900; letter-spacing: .1em; text-transform: uppercase;
}
.tk-prompt {
  display: inline-flex; align-items: center; gap: ${u(0.8)}; color: rgba(255,255,255,.92); text-shadow: 0 ${u(0.25)} 0 rgba(0,0,0,.6); white-space: nowrap;
  padding: ${u(0.5)} ${u(1.6)} ${u(0.5)} ${u(0.6)}; border-radius: 99px; background: rgba(12,6,40,.62); box-shadow: inset 0 0 0 ${u(0.25)} rgba(255,255,255,.12);
}
.tk-prompt--btn { box-shadow: inset 0 0 0 ${u(0.3)} rgba(255,255,255,.22); transition: transform .25s var(--spring), background .2s, color .2s; }
.tk-prompt--btn:hover { background: var(--yellow); color: var(--ink); text-shadow: none; transform: scale(1.07); }
.tk-key {
  display: inline-flex; align-items: center; justify-content: center; min-width: ${u(3.1)}; height: ${u(3.1)}; padding: 0 ${u(0.8)};
  border-radius: ${u(0.7)}; background: linear-gradient(#ffffff, #d9ddf3); color: var(--ink);
  font-family: var(--f-body); font-weight: 900; font-size: ${u(1.5)}; letter-spacing: .03em; text-transform: none; text-shadow: none;
  box-shadow: 0 ${u(0.35)} 0 #8189b3, 0 ${u(0.5)} ${u(0.8)} rgba(0,0,0,.45); -webkit-text-stroke: 0;
}
.tk-key--arrows { letter-spacing: .12em; font-size: ${u(1.6)}; }
.tk-key--a, .tk-key--b { min-width: ${u(3.1)}; padding: 0; border-radius: 50%; color: #fff; font-family: var(--f-display); font-size: ${u(1.9)}; text-shadow: 0 ${u(0.2)} 0 rgba(0,0,0,.4); }
.tk-key--a { background: radial-gradient(circle at 35% 30%, #8dff8a, #19b34a 70%); box-shadow: 0 ${u(0.35)} 0 #0b6b2a, 0 ${u(0.5)} ${u(0.8)} rgba(0,0,0,.45); }
.tk-key--b { background: radial-gradient(circle at 35% 30%, #ff9a9a, #e0203a 70%); box-shadow: 0 ${u(0.35)} 0 #8a0f20, 0 ${u(0.5)} ${u(0.8)} rgba(0,0,0,.45); }
.tk-key--dpad { padding: ${u(0.35)}; background: linear-gradient(#5b5f7a, #2c2f45); color: #fff; box-shadow: 0 ${u(0.35)} 0 #15172a; }
.tk-key--dpad svg { width: 100%; height: 100%; }
.tk-key--big { height: ${u(5)}; min-width: ${u(5)}; font-size: ${u(2.6)}; padding: 0 ${u(1.4)}; border-radius: ${u(1)}; }
.tk-key--big.tk-key--a { padding: 0; font-size: ${u(3)}; border-radius: 50%; }
.tk-ui[data-device="gamepad"] .k { display: none !important; }
.tk-ui:not([data-device="gamepad"]) .g { display: none !important; }

/* ---------- backdrops ---------- */
.tk-backdrop { position: absolute; inset: 0; pointer-events: none; }
.tk-backdrop--left {
  background:
    linear-gradient(90deg, rgba(10,5,34,.9) 0%, rgba(10,5,34,.72) 34%, rgba(10,5,34,.15) 58%, rgba(10,5,34,0) 70%),
    linear-gradient(0deg, rgba(10,5,34,.55) 0%, rgba(10,5,34,0) 22%);
}
.tk-backdrop--full {
  background:
    radial-gradient(ellipse 85% 70% at 50% 50%, rgba(14,8,46,.38) 0%, rgba(10,5,34,.82) 100%),
    linear-gradient(0deg, rgba(10,5,34,.5), rgba(10,5,34,0) 30%);
}
.tk-backdrop--charsel {
  background:
    linear-gradient(90deg, rgba(10,5,34,.88) 0%, rgba(10,5,34,.74) 36%, rgba(10,5,34,.25) 46%, rgba(10,5,34,0) 52%);
}
.tk-backdrop--results {
  background:
    linear-gradient(90deg, rgba(10,5,34,.92) 0%, rgba(10,5,34,.8) 48%, rgba(10,5,34,.35) 75%, rgba(10,5,34,.2) 100%);
}
.tk-backdrop::after {
  content: ''; position: absolute; left: 0; right: 0; top: 0; height: ${u(2.2)};
  background: repeating-linear-gradient(-45deg, rgba(255,210,63,.85) 0 ${u(1.2)}, rgba(29,15,46,.85) ${u(1.2)} ${u(2.4)});
  animation: tk-stripes 1.6s linear infinite; opacity: .55;
  -webkit-mask-image: linear-gradient(90deg, #000, rgba(0,0,0,.2) 60%, transparent);
          mask-image: linear-gradient(90deg, #000, rgba(0,0,0,.2) 60%, transparent);
}

/* ---------- shared panels / chevrons / buttons ---------- */
.tk-panel__stripes {
  position: absolute; inset: 0; border-radius: inherit; overflow: hidden; pointer-events: none;
  background: repeating-linear-gradient(-45deg, rgba(255,255,255,.035) 0 ${u(1.4)}, transparent ${u(1.4)} ${u(2.8)});
}
.tk-chevrons { display: inline-flex; gap: ${u(0.15)}; opacity: 0; transition: opacity .2s; flex: none; }
.is-focused .tk-chevrons { opacity: 1; }
.tk-chevrons i { width: ${u(1.5)}; height: ${u(2.6)}; background: #fff; clip-path: polygon(0 0, 45% 0, 100% 50%, 45% 100%, 0 100%, 55% 50%); animation: tk-chev .9s linear infinite; filter: drop-shadow(0 0 ${u(0.3)} rgba(0,0,0,.4)); }
.tk-chevrons i:nth-child(2) { animation-delay: .15s; }
.tk-chevrons i:nth-child(3) { animation-delay: .3s; }
.tk-chevrons.is-left { transform: scaleX(-1); }
.tk-chevrons.is-left i:nth-child(1) { animation-delay: .3s; }
.tk-chevrons.is-left i:nth-child(3) { animation-delay: 0s; }

.tk-btn { position: relative; display: block; width: 100%; height: ${u(8)}; }
.tk-btn__plate {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: ${u(1.4)};
  transform: skewX(-10deg); border-radius: ${u(1.4)}; overflow: hidden;
  background: linear-gradient(180deg, rgba(64,42,156,.96), rgba(28,16,82,.96));
  border: ${u(0.5)} solid rgba(255,255,255,.2);
  box-shadow: 0 ${u(0.8)} 0 rgba(0,0,0,.4);
  transition: transform .32s var(--spring), border-color .2s, box-shadow .3s;
}
.tk-btn__plate::before {
  content: ''; position: absolute; inset: 0; opacity: 0; transition: opacity .2s;
  background: repeating-linear-gradient(-45deg, rgba(255,255,255,.14) 0 ${u(1.2)}, transparent ${u(1.2)} ${u(2.4)}), linear-gradient(180deg, var(--c1), var(--c2));
  animation: tk-stripes 1s linear infinite;
}
.tk-btn__plate::after { content: ''; position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
.tk-btn__plate > * { position: relative; transform: skewX(10deg); }
.tk-btn__label { font-size: ${u(4)}; color: #fff; }
.tk-btn .tk-chevrons { position: absolute; right: ${u(2.6)}; }
.tk-btn.is-focused .tk-btn__plate {
  transform: skewX(-10deg) scale(1.06); border-color: #fff;
  box-shadow: 0 0 0 ${u(0.5)} var(--ink), 0 ${u(1)} 0 rgba(0,0,0,.45), 0 0 ${u(4)} var(--c1);
}
.tk-btn.is-focused .tk-btn__plate::before { opacity: 1; }
.tk-btn.is-focus-anim .tk-btn__label { animation: tk-focus-pop .4s var(--spring); }
.tk-btn.is-pressed .tk-btn__plate::after { animation: tk-flash .35s ease-out; }
.tk-btn--sm { width: ${u(34)}; height: ${u(7.4)}; }
.tk-btn--sm .tk-btn__label { font-size: ${u(3.4)}; }

/* chips + stars */
.tk-chip { display: inline-block; font-size: ${u(1.5)}; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; padding: ${u(0.45)} ${u(1.3)}; border-radius: 99px; background: var(--ac, var(--yellow)); color: var(--ink); white-space: nowrap; }
.tk-chip--dark { background: rgba(255,255,255,.14); color: #fff; }
.tk-star { width: ${u(2.8)}; height: ${u(2.8)}; }
.tk-star.on path { fill: var(--yellow); }
.tk-star.off path { fill: rgba(255,255,255,.14); stroke: rgba(0,0,0,.5); }

/* FPS counter */
.tk-fps {
  position: absolute; left: 50%; top: ${u(1)}; translate: -50% 0; z-index: 50; pointer-events: none;
  padding: ${u(0.3)} ${u(1.3)}; border-radius: 99px; background: rgba(10,6,34,.72); box-shadow: inset 0 0 0 ${u(0.25)} rgba(255,255,255,.15);
  font-size: ${u(1.5)}; font-weight: 900; letter-spacing: .1em; color: rgba(255,255,255,.75);
}
.tk-fps b { color: #7dff4a; font-variant-numeric: tabular-nums; }
.tk-fps[data-band="ok"] b { color: var(--yellow); }
.tk-fps[data-band="bad"] b { color: #ff5a6e; }

@media (prefers-reduced-motion: reduce) {
  .tk-ui *, .tk-ui *::before, .tk-ui *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
`;
