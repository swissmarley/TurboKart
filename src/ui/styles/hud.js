/** In-race HUD + race overlays. */
import { u } from './base.js';

export const hudCSS = `
/* ============================== HUD LAYOUT ============================== */
.tk-hud__tl { position: absolute; left: ${u(3.2)}; top: ${u(3.2)}; }
.tk-hud__tr { position: absolute; right: ${u(3)}; top: ${u(3)}; display: flex; flex-direction: column; align-items: flex-end; gap: ${u(1.6)}; }
.tk-hud__bl { position: absolute; left: ${u(3)}; bottom: ${u(2.6)}; display: flex; flex-direction: column; align-items: flex-start; gap: ${u(0.6)}; }
.tk-hud__br { position: absolute; right: ${u(3)}; bottom: ${u(3.4)}; display: flex; align-items: flex-end; gap: ${u(1.2)}; }
.tk-hud.is-in .tk-hud__tl { animation: tk-hud-in-l .7s .05s var(--spring) both; }
.tk-hud.is-in .tk-hud__bl { animation: tk-hud-in-l .7s .15s var(--spring) both; }
.tk-hud.is-in .tk-hud__tr { animation: tk-hud-in-r .7s .1s var(--spring) both; }
.tk-hud.is-in .tk-hud__br { animation: tk-hud-in-r .7s .2s var(--spring) both; }
.tk-hud.is-out { animation: tk-fade-out .3s ease forwards; }
@keyframes tk-hud-in-l { from { opacity: 0; translate: ${u(-20)} 0; } to { opacity: 1; translate: 0 0; } }
@keyframes tk-hud-in-r { from { opacity: 0; translate: ${u(20)} 0; } to { opacity: 1; translate: 0 0; } }
.tk-hud.is-tt .tk-pos { display: none; }
.tk-hud.is-finished .tk-hud__tl, .tk-hud.is-finished .tk-speedo, .tk-hud.is-finished .tk-minimap { opacity: 0; transition: opacity .6s ease; }

/* ============================== ITEM SLOT ============================== */
.tk-item { position: relative; width: ${u(17)}; height: ${u(17)}; }
.tk-item__bubble {
  position: absolute; inset: 0; border-radius: 50%; overflow: hidden;
  background: radial-gradient(circle at 50% 38%, rgba(84,62,190,.82), rgba(22,12,66,.9) 72%);
  border: ${u(0.85)} solid #fff;
  box-shadow: 0 0 0 ${u(0.55)} var(--ink), 0 ${u(0.8)} 0 ${u(0.4)} rgba(0,0,0,.35), inset 0 ${u(-1.2)} ${u(2.2)} rgba(0,0,0,.55);
}
.tk-item__bubble::before {
  content: ''; position: absolute; inset: 0; border-radius: 50%;
  background: repeating-conic-gradient(rgba(255,255,255,.07) 0deg 15deg, transparent 15deg 30deg);
}
.tk-item__shine { position: absolute; left: 16%; top: 6%; width: 58%; height: 32%; border-radius: 50%; z-index: 3; background: linear-gradient(180deg, rgba(255,255,255,.5), rgba(255,255,255,0)); pointer-events: none; }
.tk-item__icons { position: absolute; inset: 13%; z-index: 2; }
.tk-item__icon { position: absolute; inset: 0; display: none; }
.tk-item__icon.is-on { display: block; }
.tk-item__icon svg { width: 100%; height: 100%; filter: drop-shadow(0 ${u(0.4)} 0 rgba(0,0,0,.35)); }
.tk-item.is-rolling .tk-item__bubble { border-color: var(--yellow); animation: tk-roll-ring .24s ease-in-out infinite alternate; }
@keyframes tk-roll-ring { from { box-shadow: 0 0 0 ${u(0.55)} var(--ink), 0 0 ${u(1)} rgba(255,210,63,.4); } to { box-shadow: 0 0 0 ${u(0.55)} var(--ink), 0 0 ${u(4)} rgba(255,210,63,.95); } }
.tk-item.is-landed .tk-item__icons { animation: tk-land .55s var(--spring); }
@keyframes tk-land { 0% { scale: .3; rotate: -25deg; } 60% { scale: 1.28; rotate: 6deg; } 100% { scale: 1; rotate: 0deg; } }
.tk-item__flash { position: absolute; inset: 0; border-radius: 50%; z-index: 4; pointer-events: none; opacity: 0; background: radial-gradient(circle, rgba(255,255,255,.95) 0%, rgba(255,255,255,0) 70%); }
.tk-item.is-landed .tk-item__flash { animation: tk-flash .5s ease-out; }
.tk-item.is-landed .tk-item__bubble { animation: tk-bump .45s var(--spring); }
.tk-item.is-used .tk-item__icons { animation: tk-used .26s var(--in) forwards; }
@keyframes tk-used { to { scale: 1.6; opacity: 0; } }
.tk-item.is-use .tk-item__icons { animation: tk-squash .3s var(--spring); }
@keyframes tk-squash { 0% { scale: 1; } 40% { scale: 1.2 .8; } 100% { scale: 1; } }
.tk-item.is-empty .tk-item__bubble { background: radial-gradient(circle at 50% 38%, rgba(60,44,140,.6), rgba(16,8,50,.75) 72%); }
.tk-item__count {
  position: absolute; right: ${u(-1.4)}; bottom: ${u(-1)}; z-index: 5; font-size: ${u(4.4)}; color: #fff; line-height: 1;
  opacity: 0; scale: .4; transition: opacity .2s, scale .35s var(--spring);
}
.tk-item__count.is-on { opacity: 1; scale: 1; }
.tk-item__count.is-bump { animation: tk-bump .35s var(--spring); }
.tk-item__timer { position: absolute; inset: ${u(-1.6)}; z-index: 1; opacity: 0; transition: opacity .3s; }
.tk-item__timer svg { width: 100%; height: 100%; filter: drop-shadow(0 0 ${u(1)} rgba(255,190,0,.7)); }
.tk-item.is-golden .tk-item__timer { opacity: 1; }
.tk-item.is-golden .tk-item__bubble { border-color: #ffe27a; }
.tk-item__label {
  position: absolute; left: ${u(-0.4)}; top: 100%; margin-top: ${u(1.6)}; white-space: nowrap;
  font-size: ${u(1.6)}; font-weight: 900; text-transform: uppercase; letter-spacing: .1em;
  padding: ${u(0.35)} ${u(1.3)}; border-radius: 99px; background: rgba(10,6,34,.78); opacity: 0;
}
.tk-item__label.is-show { animation: tk-label 2.4s ease both; }
@keyframes tk-label { 0% { opacity: 0; translate: 0 ${u(-1)}; } 12%, 75% { opacity: 1; translate: 0 0; } 100% { opacity: 0; translate: 0 0; } }
.tk-item.is-holding .tk-item__bubble { border-color: #7dff4a; animation: tk-hold 0.7s ease-in-out infinite alternate; }
@keyframes tk-hold { from { box-shadow: 0 0 0 ${u(0.55)} var(--ink), 0 0 ${u(0.6)} rgba(125,255,74,.4); } to { box-shadow: 0 0 0 ${u(0.55)} var(--ink), 0 0 ${u(3)} rgba(125,255,74,.9); } }
.tk-triple[data-count="2"] .c3, .tk-triple[data-count="1"] .c3, .tk-triple[data-count="1"] .c2 { display: none; }
.tk-triple[data-count="1"] .c1 { transform: translate(4px, 4px) scale(.88); }

/* ============================== TIMER ============================== */
.tk-timer { display: flex; flex-direction: column; align-items: flex-end; gap: ${u(0.7)}; }
.tk-timer__row { position: relative; display: flex; align-items: center; gap: ${u(1.3)}; padding: ${u(0.5)} ${u(2.2)} ${u(0.7)} ${u(2.6)}; isolation: isolate; }
.tk-timer__row::before {
  content: ''; position: absolute; inset: 0; z-index: -1; transform: skewX(-14deg); border-radius: ${u(1)};
  background: linear-gradient(90deg, rgba(14,8,46,.55), rgba(14,8,46,.82)); box-shadow: inset 0 0 0 ${u(0.3)} rgba(255,255,255,.14);
}
.tk-timer__label { font-family: var(--f-display); font-size: ${u(2.4)}; color: var(--yellow); text-transform: uppercase; -webkit-text-stroke: ${u(0.4)} var(--ink); paint-order: stroke fill; }
.tk-timer__digits { contain: layout style; display: flex; font-size: ${u(4.4)}; line-height: 1; color: #fff; }
.tk-timer__digits .d { display: inline-block; width: .58em; text-align: center; }
.tk-timer__digits .s { display: inline-block; width: .28em; text-align: center; color: var(--yellow); }
.tk-split {
  display: flex; align-items: center; gap: ${u(1.2)}; padding: ${u(0.4)} ${u(1.6)} ${u(0.5)}; border-radius: ${u(0.9)};
  background: rgba(14,8,46,.82); box-shadow: inset 0 0 0 ${u(0.3)} rgba(255,255,255,.2); opacity: 0; height: 0; padding-top: 0; padding-bottom: 0; overflow: hidden;
}
.tk-split.is-show { animation: tk-split 3.6s var(--out) both; height: auto; padding-top: ${u(0.4)}; padding-bottom: ${u(0.5)}; overflow: visible; }
@keyframes tk-split {
  0% { opacity: 0; translate: ${u(6)} 0; }
  8% { opacity: 1; translate: 0 0; }
  12%, 22%, 32% { opacity: .35; } 17%, 27%, 37% { opacity: 1; }
  85% { opacity: 1; translate: 0 0; }
  100% { opacity: 0; translate: ${u(4)} 0; }
}
.tk-split__lap { font-size: ${u(1.6)}; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; }
.tk-split__time { font-size: ${u(2.8)}; color: #fff; }
.tk-split.is-best { background: linear-gradient(90deg, #12a346, #5ef04a); }
.tk-split.is-best .tk-split__lap { color: var(--ink); }
.tk-bestlap { font-size: ${u(1.6)}; font-weight: 900; letter-spacing: .08em; color: rgba(255,255,255,.75); text-shadow: 0 ${u(0.2)} 0 rgba(0,0,0,.7); margin-right: ${u(1)}; }
.tk-bestlap:empty { display: none; }
.tk-bestlap em { font-style: normal; color: var(--yellow); text-transform: uppercase; letter-spacing: .14em; margin-right: .4em; }

/* ============================== MINIMAP ============================== */
.tk-minimap { position: relative; width: ${u(30)}; height: ${u(30)}; }
.tk-minimap__bg { position: absolute; inset: 4%; border-radius: 50%; background: radial-gradient(circle, rgba(14,8,46,.5) 0%, rgba(14,8,46,.28) 55%, rgba(14,8,46,0) 72%); }
.tk-minimap__canvas { position: absolute; inset: 0; width: 100%; height: 100%; }

/* ============================== LAP / COINS ============================== */
.tk-lap { position: relative; display: flex; align-items: baseline; gap: ${u(0.6)}; padding: ${u(0.2)} ${u(3)} ${u(0.6)} ${u(1.8)}; isolation: isolate; line-height: 1; }
.tk-lap::before {
  content: ''; position: absolute; left: 0; right: 0; top: ${u(0.9)}; bottom: ${u(0.2)}; z-index: -1; transform: skewX(-14deg); border-radius: ${u(1)};
  background: linear-gradient(90deg, rgba(14,8,46,.85), rgba(14,8,46,.5)); box-shadow: inset 0 0 0 ${u(0.3)} rgba(255,255,255,.14);
}
.tk-lap__label { font-size: ${u(3)}; color: var(--yellow); }
.tk-lap__cur { font-size: ${u(6.6)}; color: #fff; }
.tk-lap__tot { font-size: ${u(3.6)}; color: rgba(255,255,255,.9); }
.tk-lap.is-final .tk-lap__cur { color: #ff6a7a; }
.tk-lap.is-bump .tk-lap__cur { display: inline-block; animation: tk-bump .5s var(--spring); }
.tk-coins { display: flex; align-items: center; gap: ${u(0.3)}; padding-left: ${u(0.4)}; line-height: 1; }
.tk-coins__icon { width: ${u(6.4)}; height: ${u(6.4)}; animation: tk-coin 2.6s ease-in-out infinite; }
.tk-coins__icon svg { width: 100%; height: 100%; filter: drop-shadow(0 ${u(0.4)} 0 rgba(0,0,0,.35)); }
@keyframes tk-coin { 0%, 70%, 100% { scale: 1 1; } 80% { scale: .15 1; } 90% { scale: 1 1; } }
.tk-coins__x { font-size: ${u(3)}; color: #fff; }
.tk-coins__n { font-size: ${u(5.8)}; color: #fff; min-width: 1.15em; }
.tk-coins.is-max .tk-coins__n { color: var(--yellow); text-shadow: 0 ${u(0.45)} 0 var(--ink), 0 0 ${u(2)} rgba(255,210,63,.9); }
.tk-coins.is-gain .tk-coins__n, .tk-coins.is-gain .tk-coins__icon { animation: tk-bump .35s var(--spring); }
.tk-coins.is-loss .tk-coins__n { animation: tk-coin-loss .5s ease; }
@keyframes tk-coin-loss { 0%, 100% { translate: 0 0; color: #fff; } 20% { translate: ${u(-0.8)} 0; color: #ff5a6e; } 40% { translate: ${u(0.8)} 0; } 60% { translate: ${u(-0.5)} 0; color: #ff5a6e; } }

/* ============================== POSITION ============================== */
.tk-pos { position: relative; display: flex; align-items: flex-start; font-family: var(--f-display); line-height: .82; transform-origin: 60% 85%; padding-right: ${u(0.5)}; }
.tk-pos__num, .tk-pos__suf { position: relative; display: inline-block; }
.tk-pos__num { font-size: ${u(19)}; }
.tk-pos__suf { font-size: ${u(7)}; margin-top: ${u(1.2)}; margin-left: ${u(0.2)}; }
.tk-pos__num::before, .tk-pos__suf::before {
  content: attr(data-t); position: absolute; left: 0; top: 0; z-index: -1; color: var(--ink);
  -webkit-text-stroke: ${u(1.7)} var(--ink); text-shadow: 0 ${u(0.9)} 0 var(--ink), 0 ${u(1.8)} ${u(1.4)} rgba(0,0,0,.45);
}
.tk-pos__suf::before { -webkit-text-stroke-width: ${u(1.1)}; text-shadow: 0 ${u(0.6)} 0 var(--ink); }
.tk-pos__num b, .tk-pos__suf b { display: block; font-weight: 400; -webkit-background-clip: text; background-clip: text; color: transparent; background-image: var(--pos-grad); }
.tk-pos { --pos-grad: linear-gradient(180deg, #f2fbff 0%, #a5e6ff 38%, #3a9bff 72%, #2f5bff 100%); isolation: isolate; }
.tk-pos[data-pos="1"] { --pos-grad: linear-gradient(180deg, #fffce0 0%, #ffe85a 34%, #ffb300 66%, #ff8a00 100%); }
.tk-pos[data-pos="2"] { --pos-grad: linear-gradient(180deg, #ffffff 0%, #eef3fa 36%, #b4c1d6 68%, #8090ad 100%); }
.tk-pos[data-pos="3"] { --pos-grad: linear-gradient(180deg, #ffe6cc 0%, #f4ab6c 38%, #cc7232 72%, #a3501b 100%); }
.tk-pos__of { position: absolute; right: ${u(0.4)}; bottom: ${u(0.6)}; font-size: ${u(2.6)}; color: rgba(255,255,255,.9); -webkit-text-stroke: ${u(0.45)} var(--ink); paint-order: stroke fill; text-shadow: 0 ${u(0.3)} 0 var(--ink); }
.tk-pos__glow { position: absolute; left: 50%; top: 50%; width: ${u(24)}; height: ${u(24)}; margin: ${u(-12)} 0 0 ${u(-12)}; border-radius: 50%; z-index: -2; opacity: 0; }
.tk-pos.is-bump { animation: tk-pos-bump .6s var(--spring); }
@keyframes tk-pos-bump { 0% { scale: 1; rotate: 0deg; } 30% { scale: 1.32; rotate: -7deg; } 60% { scale: .93; rotate: 2deg; } 100% { scale: 1; rotate: 0deg; } }
.tk-pos.is-bump.is-gain .tk-pos__glow { background: radial-gradient(circle, rgba(125,255,74,.85), rgba(125,255,74,0) 65%); animation: tk-flash .7s ease-out; }
.tk-pos.is-bump.is-loss .tk-pos__glow { background: radial-gradient(circle, rgba(255,61,77,.85), rgba(255,61,77,0) 65%); animation: tk-flash .7s ease-out; }

/* ============================== SPEEDOMETER ============================== */
.tk-speedo { contain: layout style; position: relative; width: ${u(19)}; height: ${u(19)}; margin-bottom: ${u(-0.6)}; }
.tk-speedo__dial { position: absolute; inset: 0; }
.tk-speedo__dial svg { width: 100%; height: 100%; overflow: visible; }
.tk-speedo__fill { transition: stroke-dasharray .08s linear; }
.tk-speedo__boost { opacity: 0; transition: opacity .25s; }
.tk-speedo.is-boost .tk-speedo__boost { opacity: 1; animation: tk-boost-flicker .12s steps(2) infinite; }
@keyframes tk-boost-flicker { 0% { opacity: .75; } 100% { opacity: 1; } }
.tk-speedo__ring { transition: stroke .2s; }
.tk-speedo[data-drift="1"] .tk-speedo__ring { stroke: #3fb4ff; }
.tk-speedo[data-drift="2"] .tk-speedo__ring { stroke: #ff8a1f; }
.tk-speedo[data-drift="3"] .tk-speedo__ring { stroke: #c45bff; }
.tk-speedo__num { position: absolute; left: 0; right: 0; top: 32%; text-align: center; font-size: ${u(5.4)}; line-height: 1; color: #fff; }
.tk-speedo.is-boost .tk-speedo__num { color: var(--yellow); animation: tk-glitch .15s steps(2) infinite; }
.tk-speedo__unit { position: absolute; left: 0; right: 0; top: 60%; text-align: center; font-size: ${u(1.4)}; font-weight: 900; text-transform: uppercase; letter-spacing: .14em; color: rgba(255,255,255,.72); }
.tk-drift { position: absolute; left: 50%; bottom: 3%; translate: -50% 0; display: flex; gap: ${u(0.2)}; --charge: 0; }
.tk-drift i { width: ${u(2)}; height: ${u(2.4)}; background: rgba(255,255,255,.18); clip-path: polygon(0 0, 50% 0, 100% 50%, 50% 100%, 0 100%, 50% 50%); transition: background .15s; }
.tk-speedo[data-drift="1"] .tk-drift i:nth-child(1) { background: #3fb4ff; }
.tk-speedo[data-drift="2"] .tk-drift i:nth-child(-n+2) { background: #ff8a1f; }
.tk-speedo[data-drift="3"] .tk-drift i { background: #c45bff; }
.tk-speedo:not([data-drift="0"]) .tk-drift { filter: drop-shadow(0 0 ${u(0.6)} rgba(255,255,255,.7)); }
.tk-drift.is-up { animation: tk-bump .35s var(--spring); }

/* ============================== OVERLAYS ============================== */
.tk-count { position: absolute; left: 50%; top: 40%; translate: -50% -50%; opacity: 0; }
.tk-count.is-show { animation: tk-count 1.05s var(--out) both; }
.tk-count.is-go.is-show { animation: tk-count-go 1.4s var(--out) both; }
@keyframes tk-count { 0% { opacity: 0; scale: 2.8; } 16% { opacity: 1; scale: .86; } 28% { scale: 1.08; } 40% { scale: 1; } 78% { opacity: 1; scale: 1; } 100% { opacity: 0; scale: .65; } }
@keyframes tk-count-go { 0% { opacity: 0; scale: 3; } 14% { opacity: 1; scale: .84; } 26% { scale: 1.12; } 38% { scale: 1; } 75% { opacity: 1; scale: 1.04; } 100% { opacity: 0; scale: 1.7; } }
.tk-count__n { position: relative; display: block; font-size: ${u(36)}; line-height: 1; white-space: nowrap; -webkit-text-stroke-width: ${u(1.8)}; text-shadow: 0 ${u(1.4)} 0 var(--ink), 0 ${u(2.6)} ${u(3)} rgba(0,0,0,.45); }
.tk-count[data-n="3"] .tk-count__n { color: #ff4d5e; }
.tk-count[data-n="2"] .tk-count__n { color: #ffae1f; }
.tk-count[data-n="1"] .tk-count__n { color: #ffe14a; }
.tk-count[data-n="go"] .tk-count__n { color: #7dff4a; font-size: ${u(38)}; }
.tk-count__rays {
  position: absolute; left: 50%; top: 50%; width: ${u(110)}; height: ${u(110)}; margin: ${u(-55)} 0 0 ${u(-55)}; opacity: 0;
  background: repeating-conic-gradient(rgba(125,255,74,.4) 0deg 7deg, transparent 7deg 18deg);
  -webkit-mask-image: radial-gradient(circle, #000 18%, transparent 60%); mask-image: radial-gradient(circle, #000 18%, transparent 60%);
}
.tk-count.is-go .tk-count__rays { opacity: 1; animation: tk-spin 5s linear infinite; }

.tk-banner { position: absolute; left: 0; right: 0; top: 21%; height: ${u(14)}; display: flex; align-items: center; justify-content: center; opacity: 0; }
.tk-banner.is-show { animation: tk-banner 2.1s var(--out) both; }
.tk-banner.is-final.is-show { animation-duration: 2.6s; }
@keyframes tk-banner { 0% { opacity: 0; translate: 45% 0; } 14% { opacity: 1; translate: -2% 0; } 22% { translate: 0 0; } 80% { opacity: 1; translate: 0 0; } 100% { opacity: 0; translate: -40% 0; } }
.tk-banner__band {
  position: absolute; left: 50%; top: 50%; width: ${u(108)}; height: ${u(10.5)}; translate: -50% -50%; transform: skewX(-18deg);
  background: linear-gradient(90deg, rgba(20,12,70,0), rgba(20,12,70,.9) 14%, rgba(44,26,130,.94) 50%, rgba(20,12,70,.9) 86%, rgba(20,12,70,0));
  border-top: ${u(0.5)} solid rgba(255,255,255,.75); border-bottom: ${u(0.5)} solid rgba(255,255,255,.75);
}
.tk-banner__text { position: relative; font-size: ${u(8.5)}; color: #fff; -webkit-text-stroke-width: ${u(0.9)}; text-shadow: 0 ${u(0.8)} 0 var(--ink); }
.tk-banner.is-final .tk-banner__band { background: repeating-linear-gradient(-45deg, rgba(255,255,255,.12) 0 ${u(1.4)}, transparent ${u(1.4)} ${u(2.8)}), linear-gradient(90deg, rgba(170,10,40,0), rgba(190,12,48,.92) 14%, rgba(255,64,64,.96) 50%, rgba(190,12,48,.92) 86%, rgba(170,10,40,0)); animation: tk-stripes .5s linear infinite; }
.tk-banner.is-final .tk-banner__text { color: var(--yellow); font-size: ${u(10)}; animation: tk-pulse .45s ease-in-out infinite; }

.tk-finish { position: absolute; left: 0; right: 0; top: 27%; display: flex; flex-direction: column; align-items: center; opacity: 0; visibility: hidden; }
.tk-finish.is-show { opacity: 1; visibility: visible; }
.tk-finish__band {
  position: absolute; left: -10%; right: -10%; top: ${u(2)}; height: ${u(17)}; transform: skewY(-4deg); opacity: .9;
  background: repeating-conic-gradient(#ffffff 0 25%, #1d0f2e 0 50%) 0 0 / ${u(4.4)} ${u(4.4)};
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent); mask-image: linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent);
  border-top: ${u(0.8)} solid var(--ink); border-bottom: ${u(0.8)} solid var(--ink);
}
.tk-finish.is-show .tk-finish__band { animation: tk-band-in .5s var(--out) both, tk-checker 1.2s linear infinite; }
@keyframes tk-band-in { from { scale: 0 1; } to { scale: 1 1; } }
@keyframes tk-checker { from { background-position: 0 0; } to { background-position: ${u(8.8)} 0; } }
.tk-finish__word { position: relative; display: flex; font-size: ${u(18)}; line-height: 1; transform: rotate(-4deg); -webkit-text-stroke-width: ${u(1.6)}; text-shadow: 0 ${u(1.1)} 0 var(--ink), 0 ${u(2)} 0 #ff3d8b, 0 ${u(3)} ${u(2.5)} rgba(0,0,0,.5); }
.tk-finish__word span { display: inline-block; color: #fff; }
.tk-finish.is-show .tk-finish__word span { animation: tk-letter-in .75s var(--spring2) both; animation-delay: calc(var(--i) * 55ms); }
.tk-finish__word span:nth-child(odd) { color: var(--yellow); }
.tk-finish__pos { position: relative; margin-top: ${u(2.6)}; font-size: ${u(15)}; line-height: 1; color: #8fdcff; -webkit-text-stroke-width: ${u(1.2)}; text-shadow: 0 ${u(0.9)} 0 var(--ink); }
.tk-finish__pos sup { font-size: .42em; vertical-align: top; position: relative; top: .3em; margin-left: .05em; text-transform: lowercase; }
.tk-finish__pos[data-pos="1"] { color: #ffd23f; }
.tk-finish__pos[data-pos="2"] { color: #e8eef7; }
.tk-finish__pos[data-pos="3"] { color: #f4ab6c; }
.tk-finish.is-show .tk-finish__pos { animation: tk-in-pop .7s .55s var(--spring) both; }

.tk-wrongway {
  position: absolute; left: 50%; top: 28%; translate: -50% 0; display: flex; align-items: center; gap: ${u(2.4)};
  padding: ${u(1.6)} ${u(4)}; border-radius: ${u(1.8)}; transform: skewX(-10deg);
  background: repeating-linear-gradient(-45deg, rgba(255,255,255,.1) 0 ${u(1.4)}, transparent ${u(1.4)} ${u(2.8)}), linear-gradient(180deg, #ff5a5a, #c8002e);
  border: ${u(0.65)} solid #fff; box-shadow: 0 0 0 ${u(0.6)} var(--ink), 0 ${u(1)} 0 rgba(0,0,0,.35), 0 0 ${u(7)} rgba(255,40,60,.75);
  opacity: 0; scale: .5; transition: opacity .2s, scale .4s var(--spring);
}
.tk-wrongway.is-on { opacity: 1; scale: 1; animation: tk-ww .9s steps(1) infinite; }
@keyframes tk-ww { 0%, 60% { filter: none; } 61%, 100% { filter: brightness(.65); } }
.tk-wrongway__text { font-size: ${u(7)}; color: #fff; transform: skewX(10deg); white-space: nowrap; }
.tk-wrongway__icon { width: ${u(6.6)}; height: ${u(6.6)}; transform: skewX(10deg); }
.tk-wrongway__icon svg { width: 100%; height: 100%; }
.tk-wrongway.is-on .tk-wrongway__icon { animation: tk-pulse .45s ease-in-out infinite; }

.tk-spiny {
  position: absolute; left: 50%; top: ${u(5)}; translate: -50% 0; display: flex; align-items: center; gap: ${u(1.6)};
  padding: ${u(0.8)} ${u(3.4)} ${u(0.8)} ${u(1)}; border-radius: 99px;
  background: linear-gradient(90deg, #1238a8, #2f7bff); border: ${u(0.5)} solid #fff;
  box-shadow: 0 0 0 ${u(0.5)} var(--ink), 0 0 ${u(5)} rgba(47,123,255,.85); opacity: 0;
}
.tk-spiny.is-show { animation: tk-spiny 3.8s ease both; }
@keyframes tk-spiny { 0% { opacity: 0; translate: -50% ${u(-8)}; } 8% { opacity: 1; translate: -50% 0; } 14%, 26%, 38%, 50% { filter: brightness(1.5); } 20%, 32%, 44%, 56% { filter: none; } 88% { opacity: 1; translate: -50% 0; } 100% { opacity: 0; translate: -50% ${u(-6)}; } }
.tk-spiny__icon { width: ${u(9.5)}; height: ${u(9.5)}; animation: tk-wobble .35s ease-in-out infinite alternate; }
.tk-spiny__icon svg { width: 100%; height: 100%; }
@keyframes tk-wobble { from { rotate: -10deg; } to { rotate: 10deg; } }
.tk-spiny__text { display: flex; flex-direction: column; }
.tk-spiny__text b { font-size: ${u(4.8)}; font-weight: 400; color: #fff; line-height: 1; }
.tk-spiny__text span { font-size: ${u(1.8)}; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; color: rgba(255,255,255,.9); }
.tk-danger { position: absolute; inset: 0; opacity: 0; box-shadow: inset 0 0 ${u(14)} ${u(3)} rgba(47,123,255,.75); }
.tk-danger.is-show { animation: tk-danger 3.8s ease both; }
@keyframes tk-danger { 0%, 100% { opacity: 0; } 10%, 30%, 50%, 70% { opacity: 1; } 20%, 40%, 60%, 80% { opacity: .35; } }

.tk-intro { position: absolute; left: ${u(5)}; bottom: ${u(30)}; padding: ${u(1.8)} ${u(8)} ${u(2.2)} ${u(3.4)}; opacity: 0; isolation: isolate; }
.tk-intro.is-show { animation: tk-intro 6.5s var(--out) both; }
@keyframes tk-intro { 0% { opacity: 0; translate: ${u(-30)} 0; } 8% { opacity: 1; translate: 0 0; } 90% { opacity: 1; translate: 0 0; } 100% { opacity: 0; translate: ${u(-10)} 0; } }
.tk-intro__band {
  position: absolute; inset: 0; z-index: -1; transform: skewX(-14deg); border-radius: ${u(1)};
  background: repeating-linear-gradient(-45deg, rgba(255,255,255,.04) 0 ${u(1.2)}, transparent ${u(1.2)} ${u(2.4)}), linear-gradient(90deg, rgba(14,8,46,.94), rgba(36,22,100,.88) 75%, rgba(36,22,100,0));
  border-left: ${u(1.4)} solid var(--ac, var(--yellow));
}
.tk-intro__cup { font-size: ${u(2)}; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; color: var(--ac, var(--yellow)); text-shadow: 0 ${u(0.25)} 0 rgba(0,0,0,.6); }
.tk-intro__name { margin-top: ${u(0.6)}; font-size: ${u(8)}; line-height: 1; color: #fff; -webkit-text-stroke-width: ${u(0.8)}; text-shadow: 0 ${u(0.7)} 0 var(--ink); }
.tk-intro__hint { margin-top: ${u(1.4)}; display: flex; align-items: center; gap: ${u(0.8)}; font-size: ${u(1.6)}; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; color: rgba(255,255,255,.8); }
.tk-ui.is-paused .tk-overlays { opacity: .35; }
`;
