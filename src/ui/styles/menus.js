/** Title, main menu, engine, settings, pause, loading. */
import { u } from './base.js';

export const menusCSS = `
/* ============================== TITLE ============================== */
.tk-title { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
.tk-title__shade { position: absolute; inset: 0; background: radial-gradient(ellipse 75% 65% at 50% 44%, rgba(40,14,100,.12) 0%, rgba(14,6,44,.55) 60%, rgba(8,3,26,.88) 100%); }
.tk-title__burst {
  position: absolute; left: 50%; top: 43%; width: ${u(170)}; height: ${u(170)}; margin: ${u(-85)} 0 0 ${u(-85)};
  background: repeating-conic-gradient(from 0deg, rgba(255,210,63,.2) 0deg 8deg, rgba(255,255,255,0) 8deg 20deg);
  -webkit-mask-image: radial-gradient(circle, #000 0%, rgba(0,0,0,.8) 22%, transparent 60%);
          mask-image: radial-gradient(circle, #000 0%, rgba(0,0,0,.8) 22%, transparent 60%);
  animation: tk-spin 50s linear infinite, tk-fade-in 1.2s ease both;
  translate: calc(var(--px, 0) * 3 * var(--u)) calc(var(--py, 0) * 2.4 * var(--u)); transition: translate .6s var(--out);
}
.tk-title__streaks { position: absolute; inset: 0; overflow: hidden; }
.tk-title__streaks i {
  position: absolute; left: 0; top: var(--y); width: var(--w); height: ${u(0.5)}; border-radius: 99px;
  background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.7) 70%, rgba(255,255,255,0));
  animation: tk-streak 1.5s linear infinite; animation-delay: calc(var(--i) * -0.41s); opacity: .45;
}
@keyframes tk-streak { from { transform: translateX(110vw); } to { transform: translateX(-60vw); } }

.tk-logo { position: relative; display: flex; flex-direction: column; align-items: center; margin-top: ${u(-8)};
  translate: calc(var(--px, 0) * -1.8 * var(--u)) calc(var(--py, 0) * -1.4 * var(--u)); transition: translate .5s var(--out); }
.tk-logo__word {
  position: relative; display: flex; font-family: var(--f-display); font-size: ${u(22)}; line-height: .92; letter-spacing: -.005em;
  transform: rotate(-4deg) skewX(-9deg);
}
.tk-logo__l { position: relative; display: inline-block; color: transparent; animation: tk-letter-in .95s var(--spring2) both, tk-wave 3.4s ease-in-out infinite; animation-delay: calc(var(--i) * 70ms + 150ms), calc(var(--i) * 110ms + 2s); }
.tk-logo__l::before {
  content: attr(data-c); position: absolute; left: 0; top: 0; z-index: 0; color: var(--ink);
  -webkit-text-stroke: ${u(2.6)} var(--ink);
  text-shadow: 0 ${u(0.9)} 0 var(--ink), 0 ${u(1.8)} 0 var(--ink), 0 ${u(2.6)} 0 #12082e, 0 ${u(4)} ${u(3)} rgba(0,0,0,.5);
}
.tk-logo__l b {
  position: relative; z-index: 1; display: block; font-weight: 400;
  background: linear-gradient(180deg, #fffbe0 0%, #ffe45a 30%, #ffb21f 58%, #ff6a1a 82%, #ff4d1f 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.tk-logo__l.is-kart b { background-image: linear-gradient(180deg, #f2fdff 0%, #8ff0ff 30%, #28c4ff 58%, #2f6bff 85%, #3a3fff 100%); }
.tk-logo__l::after {
  content: attr(data-c); position: absolute; left: 0; top: 0; z-index: 2;
  background: linear-gradient(105deg, rgba(255,255,255,0) 38%, rgba(255,255,255,.95) 49%, rgba(255,255,255,0) 60%) no-repeat;
  background-size: 260% 100%; background-position: 160% 0;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: tk-shine 3.8s ease-in-out infinite; animation-delay: calc(var(--i) * 55ms + 1.4s);
}
@keyframes tk-wave { 0%, 100% { translate: 0 0; } 12% { translate: 0 ${u(-1.4)}; } 24% { translate: 0 0; } }
.tk-logo__speed { position: absolute; left: ${u(-20)}; top: 24%; width: ${u(28)}; display: flex; flex-direction: column; gap: ${u(2)}; transform: rotate(-4deg); z-index: -1; }
.tk-logo__speed i {
  display: block; height: ${u(1.6)}; border-radius: 99px; margin-left: auto; transform: skewX(-30deg);
  background: linear-gradient(90deg, rgba(255,210,63,0), #ffd23f 70%);
  animation: tk-speedline .7s ease-in-out infinite alternate;
}
.tk-logo__speed i:nth-child(1) { width: 60%; animation-delay: -.2s; }
.tk-logo__speed i:nth-child(2) { width: 95%; background: linear-gradient(90deg, rgba(255,106,26,0), #ff6a1a); animation-delay: -.5s; }
.tk-logo__speed i:nth-child(3) { width: 75%; background: linear-gradient(90deg, rgba(34,211,255,0), #22d3ff); }
.tk-logo__speed i:nth-child(4) { width: 45%; animation-delay: -.35s; }
@keyframes tk-speedline { from { translate: ${u(2)} 0; opacity: .6; } to { translate: ${u(-3)} 0; opacity: 1; } }
.tk-logo__ribbon {
  position: relative; margin-top: ${u(-1)}; margin-left: ${u(30)}; padding: ${u(0.8)} ${u(4)} ${u(1)};
  transform: rotate(-4deg) skewX(-14deg); background: linear-gradient(90deg, #ff3d8b, #a05cff);
  border: ${u(0.5)} solid #fff; box-shadow: 0 0 0 ${u(0.5)} var(--ink), 0 ${u(0.8)} 0 var(--ink);
  animation: tk-in-r .7s 1s var(--spring) both;
}
.tk-logo__ribbon span { display: block; transform: skewX(14deg); font-family: var(--f-display); font-size: ${u(3.4)}; letter-spacing: .14em; text-transform: uppercase; color: #fff; text-shadow: 0 ${u(0.35)} 0 var(--ink); }
.tk-press {
  position: absolute; bottom: ${u(17)}; display: flex; align-items: center; gap: ${u(2.4)};
  font-family: var(--f-display); font-size: ${u(4.4)}; text-transform: uppercase; letter-spacing: .04em;
  animation: tk-in-d .7s 1.3s var(--out) both;
}
.tk-press__txt { display: flex; align-items: center; gap: ${u(1.4)}; -webkit-text-stroke: ${u(0.55)} var(--ink); paint-order: stroke fill; text-shadow: 0 ${u(0.5)} 0 var(--ink); animation: tk-pulse 1.15s ease-in-out infinite; }
.tk-press .tk-chevrons { opacity: 1; }
.tk-press .tk-chevrons i { width: ${u(2)}; height: ${u(3.4)}; background: var(--yellow); }
.tk-title__foot { position: absolute; bottom: ${u(3)}; font-size: ${u(1.5)}; letter-spacing: .12em; text-transform: uppercase; color: rgba(255,255,255,.5); }
.tk-screen--title.is-pressed .tk-press__txt { animation: tk-bump .35s var(--spring); }
.tk-screen--title.is-out .tk-logo { animation: tk-title-out .45s var(--in) both; }
@keyframes tk-title-out { to { opacity: 0; scale: 1.25; } }

/* ============================== MAIN MENU ============================== */
.tk-minilogo {
  position: absolute; right: ${u(5)}; top: ${u(4)}; display: flex; gap: ${u(0.4)};
  font-family: var(--f-display); font-size: ${u(6)}; line-height: 1; transform: rotate(-4deg) skewX(-9deg);
  translate: calc(var(--px, 0) * -1.6 * var(--u)) calc(var(--py, 0) * -1.2 * var(--u)); transition: translate .5s var(--out);
  -webkit-text-stroke: ${u(0.7)} var(--ink); paint-order: stroke fill; text-shadow: 0 ${u(0.6)} 0 var(--ink), 0 ${u(1.1)} 0 var(--ink);
}
.tk-minilogo .is-turbo { color: var(--yellow); }
.tk-minilogo .is-kart { color: var(--cyan); }
.tk-modes { position: absolute; left: ${u(6)}; top: 50%; width: ${u(80)}; transform: translateY(-46%);
  translate: calc(var(--px, 0) * 0.9 * var(--u)) calc(var(--py, 0) * 0.7 * var(--u)); transition: translate .5s var(--out); display: flex; flex-direction: column; gap: ${u(2.6)}; }
.tk-mode { position: relative; display: block; height: ${u(14.5)}; }
.tk-mode__plate {
  position: absolute; inset: 0; display: flex; align-items: center; gap: ${u(2.6)}; padding: 0 ${u(4)} 0 ${u(2.2)};
  transform: skewX(-12deg); border-radius: ${u(1.6)}; overflow: hidden;
  background: linear-gradient(180deg, rgba(48,30,126,.94), rgba(20,12,62,.94));
  border: ${u(0.5)} solid rgba(255,255,255,.16);
  box-shadow: 0 ${u(0.9)} 0 rgba(0,0,0,.4);
  transition: transform .38s var(--spring), border-color .2s, box-shadow .3s;
}
.tk-mode__plate::before {
  content: ''; position: absolute; inset: 0; opacity: 0; transition: opacity .25s;
  background: linear-gradient(180deg, var(--c1), var(--c2));
}
.tk-mode__plate::after { content: ''; position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
.tk-mode__plate > * { position: relative; transform: skewX(12deg); }
.tk-mode__stripes { position: absolute !important; inset: 0; transform: none !important; opacity: 0; transition: opacity .25s;
  background: repeating-linear-gradient(-45deg, rgba(255,255,255,.13) 0 ${u(1.2)}, transparent ${u(1.2)} ${u(2.4)}); animation: tk-stripes 1s linear infinite; }
.tk-mode__icon {
  flex: none; width: ${u(10)}; height: ${u(10)}; border-radius: ${u(1.8)}; display: grid; place-items: center;
  background: linear-gradient(160deg, var(--c1), var(--c2));
  box-shadow: inset 0 ${u(0.5)} 0 rgba(255,255,255,.5), inset 0 ${u(-0.6)} 0 rgba(0,0,0,.25), 0 0 0 ${u(0.45)} var(--ink);
  transition: background .25s, transform .35s var(--spring);
}
.tk-mode__icon svg { width: 74%; height: 74%; filter: drop-shadow(0 ${u(0.35)} 0 rgba(0,0,0,.35)); }
.tk-mode__text { display: flex; flex-direction: column; gap: ${u(0.5)}; flex: 1; min-width: 0; }
.tk-mode__title { font-size: ${u(5.2)}; line-height: 1; color: #fff; }
.tk-mode__desc { font-size: ${u(1.9)}; font-weight: 800; color: rgba(255,255,255,.7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 ${u(0.2)} 0 rgba(0,0,0,.35); }
.tk-mode .tk-chevrons i { width: ${u(1.8)}; height: ${u(3.2)}; }
.tk-mode.is-focused .tk-mode__plate {
  transform: skewX(-12deg) translateX(${u(3.4)}) scale(1.05); border-color: #fff;
  box-shadow: 0 0 0 ${u(0.55)} var(--ink), 0 ${u(1.1)} 0 rgba(0,0,0,.45), 0 0 ${u(5)} color-mix(in srgb, var(--c1) 75%, transparent);
}
.tk-mode.is-focused .tk-mode__plate::before, .tk-mode.is-focused .tk-mode__stripes { opacity: 1; }
.tk-mode.is-focused .tk-mode__icon { background: linear-gradient(160deg, #ffffff, #e9e3ff); transform: skewX(12deg) rotate(-6deg) scale(1.08); }
.tk-mode.is-focused .tk-mode__desc { color: #fff; text-shadow: 0 ${u(0.25)} 0 rgba(0,0,0,.45); }
.tk-mode.is-focus-anim .tk-mode__icon svg { animation: tk-focus-pop .45s var(--spring); }
.tk-mode.is-pressed .tk-mode__plate::after { animation: tk-flash .35s ease-out; }

/* ============================== ENGINE ============================== */
.tk-ccrow { position: absolute; left: 50%; top: 53%; transform: translate(-50%, -50%); display: flex; gap: ${u(3.2)}; }
.tk-cc { position: relative; width: ${u(32)}; height: ${u(50)}; display: flex; flex-direction: column; align-items: center; padding-top: ${u(5)}; transition: transform .35s var(--spring); }
.tk-cc__bg {
  position: absolute; inset: 0; border-radius: ${u(2.4)}; transform: skewX(-6deg); overflow: hidden;
  background: linear-gradient(170deg, rgba(48,30,126,.95), rgba(18,10,58,.95));
  border: ${u(0.55)} solid rgba(255,255,255,.18); box-shadow: 0 ${u(1)} 0 rgba(0,0,0,.4);
  transition: border-color .2s, box-shadow .3s;
}
.tk-cc__bg::before {
  content: ''; position: absolute; left: 0; right: 0; top: 0; height: 40%;
  background: repeating-linear-gradient(-45deg, rgba(255,255,255,.12) 0 ${u(1.2)}, transparent ${u(1.2)} ${u(2.4)}), linear-gradient(160deg, var(--c1), var(--c2));
  clip-path: polygon(0 0, 100% 0, 100% 72%, 0 100%);
}
.tk-cc__bg::after { content: ''; position: absolute; inset: 0; background: #fff; opacity: 0; }
.tk-cc > *:not(.tk-cc__bg):not(.tk-cc__flame) { position: relative; }
.tk-cc__num { font-size: ${u(10.5)}; line-height: 1; color: #fff; -webkit-text-stroke-width: ${u(0.8)}; text-shadow: 0 ${u(0.7)} 0 var(--ink); }
.tk-cc__num small { font-size: .42em; margin-left: .04em; }
.tk-cc__label { margin-top: ${u(5.2)}; font-family: var(--f-display); font-size: ${u(3.6)}; text-transform: uppercase; letter-spacing: .04em; color: var(--c1); -webkit-text-stroke: ${u(0.45)} var(--ink); paint-order: stroke fill; text-shadow: 0 ${u(0.35)} 0 var(--ink); }
.tk-cc__meter { display: flex; gap: ${u(0.4)}; margin-top: ${u(1.4)}; }
.tk-cc__meter i { width: ${u(3)}; height: ${u(3.2)}; background: rgba(255,255,255,.16); clip-path: polygon(0 0, 50% 0, 100% 50%, 50% 100%, 0 100%, 50% 50%); }
.tk-cc__meter i.on { background: var(--c1); }
.tk-cc__desc { margin: ${u(1.8)} ${u(3)} 0; text-align: center; font-size: ${u(1.85)}; line-height: 1.3; color: rgba(255,255,255,.78); }
.tk-cc.is-focused { transform: translateY(${u(-2)}) scale(1.08); z-index: 2; }
.tk-cc.is-focused .tk-cc__bg { border-color: #fff; box-shadow: 0 0 0 ${u(0.55)} var(--ink), 0 ${u(1.2)} 0 rgba(0,0,0,.45), 0 0 ${u(6)} var(--c1); }
.tk-cc.is-focused .tk-cc__meter i.on { animation: tk-chev .8s linear infinite; }
.tk-cc.is-focused .tk-cc__meter i.on:nth-child(2) { animation-delay: .1s; }
.tk-cc.is-focused .tk-cc__meter i.on:nth-child(3) { animation-delay: .2s; }
.tk-cc.is-focused .tk-cc__meter i.on:nth-child(4) { animation-delay: .3s; }
.tk-cc.is-focus-anim .tk-cc__num { animation: tk-focus-pop .45s var(--spring); }
.tk-cc.is-pressed .tk-cc__bg::after { animation: tk-flash .35s ease-out; }
.tk-cc:not(.is-focused) { filter: saturate(.8) brightness(.9); }
.tk-cc--extreme .tk-cc__bg { background: linear-gradient(170deg, rgba(58,8,44,.96), rgba(16,2,18,.96)); }
.tk-cc--extreme .tk-cc__num { color: #ffe3f0; text-shadow: 0 ${u(0.7)} 0 var(--ink), 0 0 ${u(3)} #ff2d7a; }
.tk-cc__hazard {
  position: absolute; left: 0; right: 0; bottom: 0; height: ${u(4.2)};
  background: repeating-linear-gradient(-45deg, #ff2d7a 0 ${u(1.2)}, #160310 ${u(1.2)} ${u(2.4)}); animation: tk-stripes .5s linear infinite;
}
.tk-cc--extreme .tk-cc__stats { margin-bottom: ${u(6.6)}; }
.tk-cc__stats { width: 100%; margin-top: auto; margin-bottom: ${u(4.4)}; padding: 0 ${u(3.4)}; display: flex; flex-direction: column; gap: ${u(1)}; }
.tk-cc__stat { display: grid; grid-template-columns: ${u(10)} 1fr; align-items: center; gap: ${u(1)}; }
.tk-cc__stat em { font-style: normal; font-size: ${u(1.4)}; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; color: rgba(255,255,255,.7); }
.tk-cc__track { position: relative; height: ${u(1.4)}; border-radius: 99px; background: rgba(0,0,0,.45); overflow: hidden; transform: skewX(-20deg); }
.tk-cc__track b { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, var(--c2), var(--c1)); border-radius: 99px; }
.tk-cc__flame { position: absolute !important; top: ${u(-4)}; right: ${u(-2.5)}; width: ${u(8)}; height: ${u(8)}; transform-origin: 50% 100%; animation: tk-flicker .18s ease-in-out infinite alternate; }
.tk-cc__flame svg { width: 100%; height: 100%; filter: drop-shadow(0 0 ${u(1.5)} rgba(255,90,31,.8)); }
@keyframes tk-flicker { from { scale: 1 1; rotate: -4deg; } to { scale: .92 1.08; rotate: 4deg; } }
.tk-cc--extreme.is-focused .tk-cc__num { animation: tk-glitch .35s steps(2) infinite; }
.tk-cc--extreme.is-focused .tk-cc__bg { box-shadow: 0 0 0 ${u(0.55)} var(--ink), 0 ${u(1.2)} 0 rgba(0,0,0,.45), 0 0 ${u(7)} #ff2d7a, 0 0 ${u(14)} rgba(106,0,255,.6); }
@keyframes tk-glitch { 0% { translate: 0 0; } 25% { translate: ${u(-0.4)} ${u(0.2)}; } 50% { translate: ${u(0.4)} ${u(-0.2)}; } 75% { translate: ${u(0.2)} ${u(0.3)}; } 100% { translate: 0 0; } }

/* ============================== SETTINGS ============================== */
.tk-setpanel {
  position: absolute; left: 50%; top: ${u(55)}; width: ${u(104)}; transform: translate(-50%, -50%);
  padding: ${u(2.6)} ${u(3)}; border-radius: ${u(2.6)};
  background: linear-gradient(170deg, var(--panel-a), var(--panel-b));
  border: ${u(0.5)} solid rgba(255,255,255,.16); box-shadow: 0 0 0 ${u(0.5)} var(--ink), 0 ${u(1.2)} 0 rgba(0,0,0,.4);
}
.tk-setlist { position: relative; display: flex; flex-direction: column; gap: ${u(0.8)}; }
.tk-set {
  position: relative; display: flex; align-items: center; justify-content: space-between; height: ${u(6)};
  padding: 0 ${u(2)} 0 ${u(3)}; border-radius: ${u(1.2)}; background: rgba(255,255,255,.05);
  transition: background .2s, transform .3s var(--spring), box-shadow .2s;
}
.tk-set::before { content: ''; position: absolute; left: ${u(0.8)}; top: ${u(1)}; bottom: ${u(1)}; width: ${u(0.7)}; border-radius: 99px; background: var(--yellow); transform: scaleY(0); transition: transform .3s var(--spring); }
.tk-set.is-focused { background: linear-gradient(90deg, rgba(255,210,63,.26), rgba(255,210,63,.06)); box-shadow: inset 0 0 0 ${u(0.35)} rgba(255,210,63,.85); transform: translateX(${u(1)}); }
.tk-set.is-focused::before { transform: scaleY(1); }
.tk-set__label { font-size: ${u(2.4)}; font-weight: 900; text-transform: uppercase; letter-spacing: .07em; text-shadow: 0 ${u(0.25)} 0 rgba(0,0,0,.5); }
.tk-set__ctrl { display: flex; align-items: center; gap: ${u(1.2)}; }
.tk-arrow { width: ${u(2.6)}; height: ${u(2.6)}; color: rgba(255,255,255,.28); cursor: pointer; transition: color .2s; pointer-events: auto; }
.tk-arrow svg { width: 100%; height: 100%; }
.tk-set.is-focused .tk-arrow { color: var(--yellow); }
.tk-set.is-focused .tk-arrow.is-l { animation: tk-nudge-l .9s ease-in-out infinite; }
.tk-set.is-focused .tk-arrow.is-r { animation: tk-nudge-r .9s ease-in-out infinite; }
.tk-slider { position: relative; width: ${u(32)}; height: ${u(2.2)}; border-radius: 99px; background: rgba(0,0,0,.45); box-shadow: inset 0 ${u(0.3)} ${u(0.5)} rgba(0,0,0,.6), 0 0 0 ${u(0.3)} rgba(255,255,255,.12); cursor: pointer; pointer-events: auto; touch-action: none; }
.tk-slider__ticks { position: absolute; inset: 0 ${u(1)}; background: repeating-linear-gradient(90deg, rgba(255,255,255,.18) 0 ${u(0.2)}, transparent ${u(0.2)} 10%); border-radius: 99px; }
.tk-slider__fill {
  position: absolute; left: 0; top: 0; bottom: 0; border-radius: 99px;
  background: repeating-linear-gradient(-45deg, rgba(255,255,255,.22) 0 ${u(0.8)}, transparent ${u(0.8)} ${u(1.6)}), linear-gradient(90deg, var(--cyan), var(--lime) 60%, var(--yellow));
  box-shadow: 0 0 ${u(1.5)} rgba(125,255,74,.45); transition: width .18s var(--out);
}
.tk-slider__knob {
  position: absolute; top: 50%; width: ${u(3.8)}; height: ${u(3.8)}; margin: ${u(-1.9)} 0 0 ${u(-1.9)}; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff, #e3e6ff 55%, #a9b0e0); border: ${u(0.45)} solid var(--ink);
  box-shadow: 0 ${u(0.3)} 0 rgba(0,0,0,.4); transition: left .18s var(--out), transform .25s var(--spring), box-shadow .2s;
}
.tk-set.is-focused .tk-slider__knob { transform: scale(1.15); box-shadow: 0 0 0 ${u(0.6)} rgba(255,210,63,.65), 0 ${u(0.3)} 0 rgba(0,0,0,.4); }
.tk-set__val { width: ${u(5.6)}; text-align: right; font-size: ${u(3.2)}; color: var(--yellow); }
.tk-set__val.is-bump { animation: tk-bump .3s var(--spring); }
.tk-seg { display: flex; gap: ${u(0.4)}; padding: ${u(0.4)}; border-radius: ${u(1.2)}; background: rgba(0,0,0,.42); box-shadow: inset 0 0 0 ${u(0.25)} rgba(255,255,255,.1); }
.tk-seg__opt {
  min-width: ${u(9.6)}; padding: ${u(0.75)} ${u(1.4)}; border-radius: ${u(0.9)}; text-align: center; cursor: pointer; pointer-events: auto;
  font-size: ${u(1.8)}; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; color: rgba(255,255,255,.5);
}
.tk-seg__opt:hover { color: #fff; }
.tk-seg__opt.is-on { background: linear-gradient(180deg, #fff6c0, var(--yellow) 50%, #ffae1f); color: var(--ink); box-shadow: 0 ${u(0.3)} 0 #b26a00, inset 0 ${u(0.2)} 0 rgba(255,255,255,.75); }
.tk-seg__opt.is-bump { animation: tk-bump .3s var(--spring); }
.tk-set--btn { justify-content: center; padding: 0; font-size: ${u(2.4)}; }
.tk-set--btn .tk-set__label { font-family: var(--f-display); font-weight: 400; font-size: ${u(3)}; letter-spacing: .05em; }
.tk-set--btn.is-primary { background: linear-gradient(180deg, rgba(125,255,74,.22), rgba(20,168,74,.22)); }
.tk-set--btn.is-primary.is-focused { background: linear-gradient(180deg, #8dff5a, #14a84a); box-shadow: inset 0 0 0 ${u(0.35)} #fff; }
.tk-set--btn.is-pressed { animation: tk-bump .3s var(--spring); }

/* ============================== PAUSE ============================== */
.tk-pause { position: absolute; inset: 0; }
.tk-pause__dim { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(16,8,52,.5), rgba(8,4,26,.86)); -webkit-backdrop-filter: blur(${u(0.7)}) saturate(1.15); backdrop-filter: blur(${u(0.7)}) saturate(1.15); animation: tk-fade-in .25s ease both; }
.tk-pause__panel {
  position: absolute; left: 50%; top: 47%; width: ${u(62)}; transform: translate(-50%, -50%); text-align: center;
  padding: ${u(4)} ${u(6)} ${u(4.6)}; border-radius: ${u(3)};
  background: linear-gradient(170deg, rgba(54,34,140,.97), rgba(18,10,58,.97));
  border: ${u(0.6)} solid rgba(255,255,255,.22); box-shadow: 0 0 0 ${u(0.6)} var(--ink), 0 ${u(2)} ${u(6)} rgba(0,0,0,.55);
}
.tk-pause__title { position: relative; font-size: ${u(9.5)}; line-height: 1; color: var(--yellow); transform: rotate(-3deg); -webkit-text-stroke-width: ${u(0.8)}; text-shadow: 0 ${u(0.7)} 0 var(--ink), 0 ${u(1.2)} 0 var(--ink); }
.tk-pause__sub { position: relative; margin-top: ${u(1.2)}; font-size: ${u(1.9)}; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; color: rgba(255,255,255,.75); }
.tk-pause__list { position: relative; margin-top: ${u(3.2)}; display: flex; flex-direction: column; gap: ${u(1.8)}; }

/* ============================== LOADING ============================== */
.tk-load { position: absolute; inset: 0; overflow: hidden; pointer-events: auto; cursor: progress; }
.tk-load__bg { position: absolute; inset: 0; background: radial-gradient(ellipse 70% 80% at 72% 42%, color-mix(in srgb, var(--ac, #22d3ff) 34%, #1c1060) 0%, #150c45 42%, #08041c 100%); }
.tk-load__stripes { position: absolute; inset: -10%; background: repeating-linear-gradient(-55deg, rgba(255,255,255,.035) 0 ${u(3)}, transparent ${u(3)} ${u(6)}); animation: tk-load-stripes 2.4s linear infinite; }
@keyframes tk-load-stripes { from { transform: translateX(0); } to { transform: translateX(${u(-7.3)}); } }
.tk-load__map { position: absolute; right: ${u(4)}; top: ${u(7)}; width: ${u(88)}; height: ${u(66)}; animation: tk-in-pop .8s .1s var(--spring) both; }
.tk-load__map svg { width: 100%; height: 100%; overflow: visible; }
.tk-load__road { transition: stroke-dashoffset .3s var(--out); }
.tk-load__kart { animation: tk-pulse .6s ease-in-out infinite; transform-box: fill-box; }
.tk-load__info { position: absolute; left: ${u(7)}; top: ${u(17)}; max-width: ${u(82)}; }
.tk-load__crumb {
  display: inline-block; padding: ${u(0.55)} ${u(2)}; transform: skewX(-12deg); background: var(--ac, var(--yellow)); color: var(--ink);
  font-size: ${u(1.9)}; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; box-shadow: ${u(0.6)} ${u(0.6)} 0 var(--ink);
}
.tk-load__name { margin-top: ${u(2)}; font-size: ${u(10.5)}; line-height: .95; color: #fff; -webkit-text-stroke-width: ${u(0.9)}; text-shadow: 0 ${u(0.8)} 0 var(--ink), 0 ${u(1.4)} 0 var(--ink); }
.tk-load__stars { display: flex; gap: ${u(0.6)}; margin-top: ${u(2)}; }
.tk-load__stars .tk-star { width: ${u(4)}; height: ${u(4)}; }
.tk-load__desc { margin-top: ${u(1.8)}; max-width: ${u(64)}; font-size: ${u(2.3)}; font-weight: 700; line-height: 1.38; color: rgba(255,255,255,.85); }
.tk-tip {
  position: absolute; left: ${u(7)}; bottom: ${u(17)}; max-width: ${u(112)}; display: flex; align-items: center; gap: ${u(2)};
  padding: ${u(1.6)} ${u(2.6)} ${u(1.6)} ${u(1.6)}; border-radius: ${u(1.8)}; background: rgba(10,6,34,.72);
  box-shadow: inset 0 0 0 ${u(0.35)} rgba(255,255,255,.12);
}
.tk-tip.is-swap .tk-tip__text { animation: tk-in-r .5s var(--out) both; }
.tk-tip__badge { flex: none; font-size: ${u(2.6)}; padding: ${u(0.5)} ${u(1.4)}; border-radius: ${u(1)}; background: var(--yellow); color: #fff; transform: rotate(-4deg); }
.tk-tip__text { font-size: ${u(2.2)}; font-weight: 800; line-height: 1.45; }
.tk-tip__text b { font-weight: 900; }
.tk-tip__text kbd {
  display: inline-block; padding: 0 ${u(0.7)}; border-radius: ${u(0.5)}; background: #fff; color: var(--ink);
  font-family: var(--f-body); font-weight: 900; font-size: .82em; line-height: 1.5; box-shadow: 0 ${u(0.25)} 0 #8189b3; margin: 0 .08em;
}
.c-blue { color: #3fb4ff; } .c-orange { color: #ff8a1f; } .c-purple { color: #c45bff; }
.tk-load__bar { position: absolute; left: ${u(7)}; right: ${u(7)}; bottom: ${u(6)}; }
.tk-load__barhead { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: ${u(1)}; }
.tk-load__status { font-size: ${u(2)}; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; color: rgba(255,255,255,.88); }
.tk-load__pct { font-size: ${u(4.4)}; color: var(--yellow); }
.tk-load__track { height: ${u(3.2)}; border-radius: ${u(0.8)}; background: rgba(0,0,0,.5); transform: skewX(-20deg); overflow: hidden; border: ${u(0.4)} solid rgba(255,255,255,.22); box-shadow: 0 0 0 ${u(0.4)} var(--ink); }
.tk-load__fill {
  height: 100%; width: 0; transition: width .3s var(--out);
  background: repeating-linear-gradient(-45deg, rgba(255,255,255,.28) 0 ${u(1.2)}, transparent ${u(1.2)} ${u(2.4)}), linear-gradient(180deg, #fff6b8, var(--yellow) 45%, var(--orange));
  animation: tk-stripes .6s linear infinite; box-shadow: 0 0 ${u(2)} var(--yellow);
}
`;
