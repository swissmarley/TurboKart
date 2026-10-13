/** Results, time trial and Grand Prix ceremony. */
import { u } from './base.js';

export const resultsCSS = `
.tk-results { position: absolute; inset: 0; }
.tk-results__body { position: absolute; inset: 0; }
.tk-results__btns { position: absolute; left: ${u(6)}; bottom: ${u(9.5)}; display: flex; gap: ${u(2.6)}; z-index: 3; }

/* ---------- standings ---------- */
.tk-standings-wrap { position: absolute; left: ${u(6)}; top: ${u(17.5)}; width: ${u(102)}; }
.tk-standings__head, .tk-row { display: grid; grid-template-columns: ${u(8)} ${u(6)} 1fr ${u(22)}; align-items: center; gap: ${u(1.6)}; }
.tk-standings__head.is-gp, .tk-standings.is-gp .tk-row { grid-template-columns: ${u(8)} ${u(6)} 1fr ${u(19)} ${u(7)} ${u(8)}; }
.tk-standings__head { padding: 0 ${u(2.4)} ${u(0.8)} ${u(0.6)}; font-size: ${u(1.4)}; font-weight: 900; text-transform: uppercase; letter-spacing: .16em; color: rgba(255,255,255,.6); }
.tk-standings__head span:nth-child(1) { text-align: center; }
.tk-standings__head span:nth-child(4), .tk-standings__head span:nth-child(6) { text-align: right; }
.tk-standings__head span:nth-child(5) { text-align: center; }
.tk-standings { position: relative; height: calc(var(--rows, 8) * ${u(7.3)}); }
.tk-row {
  position: absolute; left: 0; right: 0; top: calc(var(--row) * ${u(7.3)}); height: ${u(6.5)}; padding: 0 ${u(2.4)} 0 ${u(0.6)};
  isolation: isolate; transition: top .8s var(--spring);
}
.tk-screen.is-in .tk-row { animation: tk-row-in .55s var(--out) both; animation-delay: calc(var(--i) * 75ms + 250ms); }
@keyframes tk-row-in { from { opacity: 0; translate: ${u(30)} 0; } to { opacity: 1; translate: 0 0; } }
.tk-row__plate {
  position: absolute; inset: 0; z-index: -1; transform: skewX(-12deg); border-radius: ${u(1)};
  background: linear-gradient(90deg, rgba(44,28,120,.94), rgba(24,14,72,.9));
  box-shadow: inset ${u(1.1)} 0 0 var(--cc), 0 ${u(0.5)} 0 rgba(0,0,0,.35);
}
.tk-row[data-pos="1"] .tk-row__plate { background: linear-gradient(90deg, rgba(120,84,10,.9), rgba(44,28,120,.92) 45%, rgba(24,14,72,.9)); }
.tk-row.is-player .tk-row__plate {
  background: repeating-linear-gradient(-45deg, rgba(255,255,255,.14) 0 ${u(1.2)}, transparent ${u(1.2)} ${u(2.4)}), linear-gradient(90deg, #ffd23f, #ff9a1f);
  box-shadow: inset ${u(1.1)} 0 0 var(--cc), 0 0 0 ${u(0.45)} #fff, 0 0 0 ${u(0.9)} var(--ink), 0 0 ${u(4)} rgba(255,210,63,.7);
  animation: tk-stripes 1.2s linear infinite;
}
.tk-row__pos { text-align: center; font-size: ${u(4.4)}; line-height: 1; color: #fff; }
.tk-row__pos small { font-size: .5em; margin-left: .04em; text-transform: lowercase; }
.tk-row__pos[data-pos="1"] { color: #ffd23f; }
.tk-row__pos[data-pos="2"] { color: #e8eef7; }
.tk-row__pos[data-pos="3"] { color: #f4ab6c; }
.tk-row.is-player .tk-row__pos { color: #fff; }
.tk-row.is-sorted .tk-row__pos { animation: tk-bump .45s var(--spring); }
.tk-row__portrait { width: ${u(5.8)}; height: ${u(5.8)}; border-radius: ${u(1.1)}; overflow: hidden; border: ${u(0.4)} solid var(--ink); box-shadow: 0 0 0 ${u(0.3)} rgba(255,255,255,.4); background: var(--cc); }
.tk-row__portrait svg { width: 100%; height: 100%; }
.tk-row__name { display: flex; align-items: center; gap: ${u(1.2)}; min-width: 0; white-space: nowrap; overflow: hidden; font-family: var(--f-display); font-size: ${u(3.1)}; text-transform: uppercase; -webkit-text-stroke: ${u(0.45)} var(--ink); paint-order: stroke fill; text-shadow: 0 ${u(0.35)} 0 var(--ink); }
.tk-row__you { flex: none; font-family: var(--f-body); font-style: normal; font-weight: 900; font-size: ${u(1.4)}; letter-spacing: .14em; padding: ${u(0.25)} ${u(0.9)}; border-radius: 99px; background: var(--ink); color: var(--yellow); -webkit-text-stroke: 0; text-shadow: none; }
.tk-row__time { display: flex; flex-direction: column; align-items: flex-end; font-family: var(--f-display); font-size: ${u(2.9)}; line-height: 1; -webkit-text-stroke: ${u(0.4)} var(--ink); paint-order: stroke fill; }
.tk-row__time small { margin-top: ${u(0.3)}; font-family: var(--f-body); font-weight: 900; font-size: ${u(1.4)}; letter-spacing: .06em; color: rgba(255,255,255,.7); -webkit-text-stroke: 0; }
.tk-row.is-player .tk-row__time small { color: var(--ink); }
.tk-row__pts { text-align: center; font-size: ${u(2.9)}; color: var(--lime); opacity: 0; }
.tk-row__pts.is-pop { animation: tk-pop .5s var(--spring) forwards; }
.tk-row.is-player .tk-row__pts { color: #fff; }
.tk-row__total { text-align: right; font-size: ${u(3.8)}; color: #fff; }

/* ---------- time trial ---------- */
.tk-tt { position: absolute; left: ${u(6)}; top: ${u(18)}; display: flex; align-items: flex-start; gap: ${u(4)}; }
.tk-tt__card {
  position: relative; width: ${u(66)}; padding: ${u(3)} ${u(3.6)} ${u(3.6)}; border-radius: ${u(2.6)};
  background: linear-gradient(165deg, rgba(48,30,130,.96), rgba(16,10,52,.96));
  border: ${u(0.55)} solid rgba(255,255,255,.2); box-shadow: 0 0 0 ${u(0.55)} var(--ink), 0 ${u(1.2)} 0 rgba(0,0,0,.4);
}
.tk-tt__card > *:not(.tk-panel__stripes):not(.tk-tt__stamp):not(.tk-tt__portrait) { position: relative; }
.tk-tt__portrait { position: absolute; right: ${u(2.6)}; top: ${u(2.6)}; width: ${u(10)}; height: ${u(10)}; border-radius: ${u(1.6)}; overflow: hidden; border: ${u(0.45)} solid var(--ink); box-shadow: 0 0 0 ${u(0.4)} rgba(255,255,255,.5); }
.tk-tt__portrait svg { width: 100%; height: 100%; }
.tk-tt__label { font-size: ${u(2)}; font-weight: 900; text-transform: uppercase; letter-spacing: .18em; color: rgba(255,255,255,.75); }
.tk-tt__time { margin-top: ${u(1.2)}; font-size: ${u(11.5)}; line-height: 1; color: #fff; -webkit-text-stroke-width: ${u(1)}; text-shadow: 0 ${u(0.9)} 0 var(--ink), 0 ${u(1.6)} 0 var(--ink); }
.tk-tt.is-record .tk-tt__time { color: var(--yellow); animation: tk-pulse 1.2s 1.2s ease-in-out infinite; transform-origin: 0 50%; }
.tk-tt__cmp { margin-top: ${u(1.8)}; display: flex; align-items: center; gap: ${u(1.4)}; font-size: ${u(2)}; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; color: rgba(255,255,255,.85); }
.tk-tt__cmp b { padding: ${u(0.3)} ${u(1.1)}; border-radius: ${u(0.7)}; color: #fff; letter-spacing: .04em; }
.tk-tt__cmp.is-better b { background: #14a84a; }
.tk-tt__cmp.is-worse b { background: #c8002e; }
.tk-tt__stamp {
  position: absolute; right: ${u(-3)}; bottom: ${u(-3)}; display: flex; flex-direction: column; align-items: center;
  padding: ${u(1.2)} ${u(2.8)} ${u(1.4)}; border-radius: ${u(1.6)}; rotate: -10deg;
  font-size: ${u(4.4)}; line-height: .95; color: #fff;
  background: repeating-linear-gradient(-45deg, rgba(255,255,255,.14) 0 ${u(1)}, transparent ${u(1)} ${u(2)}), linear-gradient(160deg, #ff5a8a, #e0144a);
  border: ${u(0.6)} solid #fff; box-shadow: 0 0 0 ${u(0.55)} var(--ink), 0 ${u(0.9)} 0 rgba(0,0,0,.4), 0 0 ${u(5)} rgba(255,61,139,.8);
  animation: tk-stamp .7s .7s var(--spring) both;
}
.tk-tt__stamp span:last-child { font-size: 1.15em; color: var(--yellow); }
@keyframes tk-stamp { 0% { opacity: 0; scale: 3; } 60% { opacity: 1; scale: .9; } 100% { opacity: 1; scale: 1; } }
.tk-tt__laps { width: ${u(46)}; display: flex; flex-direction: column; gap: ${u(1.1)}; }
.tk-tt__lapshead { font-family: var(--f-display); font-size: ${u(3.2)}; text-transform: uppercase; color: var(--yellow); -webkit-text-stroke: ${u(0.45)} var(--ink); paint-order: stroke fill; text-shadow: 0 ${u(0.35)} 0 var(--ink); margin-bottom: ${u(0.4)}; }
.tk-lapsplit { position: relative; display: grid; grid-template-columns: ${u(10)} 1fr ${u(7)}; align-items: center; height: ${u(6.2)}; padding: 0 ${u(2.2)}; isolation: isolate; }
.tk-lapsplit::before { content: ''; position: absolute; inset: 0; z-index: -1; transform: skewX(-12deg); border-radius: ${u(1)}; background: linear-gradient(90deg, rgba(44,28,120,.94), rgba(24,14,72,.9)); box-shadow: 0 ${u(0.5)} 0 rgba(0,0,0,.35); }
.tk-lapsplit.is-best::before { background: linear-gradient(90deg, #12a346, #4fe04a); box-shadow: 0 0 0 ${u(0.4)} #fff, 0 0 ${u(3)} rgba(125,255,74,.6); }
.tk-lapsplit__n { font-size: ${u(1.8)}; font-weight: 900; text-transform: uppercase; letter-spacing: .14em; }
.tk-lapsplit__t { font-size: ${u(3.4)}; color: #fff; }
.tk-lapsplit__b { text-align: right; font-size: ${u(1.5)}; font-weight: 900; text-transform: uppercase; letter-spacing: .14em; color: var(--ink); }

/* ---------- ceremony ---------- */
.tk-ceremony { position: absolute; inset: 0; overflow: hidden; }
.tk-results__body.is-ceremony::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 30% 45%, rgba(60,30,140,.4), rgba(8,4,26,.9) 75%); animation: tk-fade-in .6s ease both; }
.tk-ceremony__rays {
  position: absolute; left: 25%; top: 45%; width: ${u(150)}; height: ${u(150)}; margin: ${u(-75)} 0 0 ${u(-75)};
  background: repeating-conic-gradient(rgba(255,210,63,.2) 0deg 9deg, transparent 9deg 22.5deg);
  -webkit-mask-image: radial-gradient(circle, #000 10%, transparent 60%); mask-image: radial-gradient(circle, #000 10%, transparent 60%);
  animation: tk-spin 30s linear infinite, tk-fade-in 1s ease both;
}
.tier-2 .tk-ceremony__rays { background: repeating-conic-gradient(rgba(230,238,250,.2) 0deg 9deg, transparent 9deg 22.5deg); }
.tier-3 .tk-ceremony__rays { background: repeating-conic-gradient(rgba(244,171,108,.2) 0deg 9deg, transparent 9deg 22.5deg); }
.tier-0 .tk-ceremony__rays { background: repeating-conic-gradient(rgba(34,211,255,.12) 0deg 9deg, transparent 9deg 22.5deg); }
.tk-ceremony__main { position: absolute; left: ${u(7)}; top: ${u(10)}; display: flex; align-items: center; gap: ${u(4)}; }
.tk-ceremony__trophy { width: ${u(40)}; height: ${u(48)}; flex: none; filter: drop-shadow(0 ${u(2)} ${u(2)} rgba(0,0,0,.5)); animation: tk-trophy-in 1.1s .2s var(--spring) both, tk-float 3s 1.4s ease-in-out infinite; }
.tk-ceremony__trophy svg { width: 100%; height: 100%; }
.tier-0 .tk-ceremony__trophy { width: ${u(26)}; height: ${u(26)}; }
@keyframes tk-trophy-in { 0% { opacity: 0; scale: .2; rotate: -30deg; translate: 0 ${u(20)}; } 70% { opacity: 1; scale: 1.08; rotate: 4deg; translate: 0 0; } 100% { opacity: 1; scale: 1; rotate: 0deg; } }
.tk-ceremony__text { animation: tk-in-r .7s .5s var(--out) both; }
.tk-ceremony__cup { font-size: ${u(2.2)}; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; color: var(--yellow); }
.tk-ceremony__title { margin-top: ${u(0.6)}; font-size: ${u(11)}; line-height: .95; color: #fff; -webkit-text-stroke-width: ${u(1)}; text-shadow: 0 ${u(0.9)} 0 var(--ink), 0 ${u(1.6)} 0 var(--ink); }
.tier-1 .tk-ceremony__title { color: var(--yellow); }
.tier-2 .tk-ceremony__title { color: #eef3fa; }
.tier-3 .tk-ceremony__title { color: #f4ab6c; }
.tk-ceremony__sub { margin-top: ${u(1.2)}; font-size: ${u(2.4)}; font-weight: 800; color: rgba(255,255,255,.88); }
.tk-ceremony__score { margin-top: ${u(1.6)}; font-size: ${u(2.2)}; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; color: rgba(255,255,255,.85); }
.tk-ceremony__score b { font-size: ${u(5.2)}; color: var(--yellow); letter-spacing: 0; margin-right: ${u(0.4)}; }
.tk-podium { position: absolute; right: ${u(7)}; bottom: ${u(9)}; display: flex; align-items: flex-end; gap: ${u(1.6)}; }
.tk-podium__slot { width: ${u(18)}; display: flex; flex-direction: column; align-items: center; animation: tk-in-d .7s var(--spring) both; animation-delay: calc(var(--i) * 220ms + 700ms); }
.tk-podium__portrait { width: ${u(12)}; height: ${u(12)}; border-radius: 50%; overflow: hidden; border: ${u(0.6)} solid #fff; box-shadow: 0 0 0 ${u(0.5)} var(--ink), 0 0 ${u(3)} var(--cc); background: var(--cc); animation: tk-bob 1.6s ease-in-out infinite; }
.tk-podium__portrait svg { width: 100%; height: 100%; }
.tk-podium__name { margin-top: ${u(0.8)}; font-family: var(--f-display); font-size: ${u(2.4)}; text-transform: uppercase; -webkit-text-stroke: ${u(0.4)} var(--ink); paint-order: stroke fill; text-shadow: 0 ${u(0.3)} 0 var(--ink); white-space: nowrap; }
.tk-podium__slot.is-player .tk-podium__name { color: var(--yellow); }
.tk-podium__pts { font-size: ${u(1.6)}; font-weight: 900; color: rgba(255,255,255,.8); letter-spacing: .08em; }
.tk-podium__block {
  margin-top: ${u(1)}; width: 100%; display: grid; place-items: center; font-size: ${u(7)}; color: #fff;
  background: linear-gradient(180deg, var(--b1), var(--b2)); border: ${u(0.5)} solid var(--ink); border-bottom: 0;
  border-radius: ${u(1.2)} ${u(1.2)} 0 0; box-shadow: inset 0 ${u(0.7)} 0 rgba(255,255,255,.5), inset 0 ${u(-1)} ${u(2)} rgba(0,0,0,.25);
}
.tk-podium__slot.is-p1 .tk-podium__block { height: ${u(22)}; --b1: #ffe66a; --b2: #e09200; }
.tk-podium__slot.is-p2 .tk-podium__block { height: ${u(15)}; --b1: #f4f7fc; --b2: #8f9db8; }
.tk-podium__slot.is-p3 .tk-podium__block { height: ${u(10)}; --b1: #f7c08e; --b2: #b0622a; }
.tk-confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 2; }
.tk-confetti i { position: absolute; top: 0; left: var(--x); width: ${u(1.2)}; height: ${u(1.9)}; scale: var(--s); border-radius: ${u(0.2)}; animation: tk-confetti var(--t) linear infinite; animation-delay: var(--d); opacity: 0; }
.tk-confetti i.is-round { width: ${u(1.3)}; height: ${u(1.3)}; border-radius: 50%; }
.tk-confetti i.is-strip { width: ${u(0.6)}; height: ${u(2.8)}; }
@keyframes tk-confetti {
  0% { opacity: 1; transform: translate3d(0, -8vh, 0) rotate(var(--r)) rotateY(0deg); }
  100% { opacity: 1; transform: translate3d(calc(var(--sway) * 1vw), 108vh, 0) rotate(calc(var(--r) + 540deg)) rotateY(900deg); }
}
`;
