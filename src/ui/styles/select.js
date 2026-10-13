/** Character, track and cup selection. */
import { u } from './base.js';

export const selectCSS = `
/* ============================== CHARACTER ============================== */
.tk-chargrid { position: absolute; left: ${u(5.5)}; top: ${u(25)}; display: grid; grid-template-columns: repeat(var(--cols, 4), ${u(17.5)}); gap: ${u(4.4)} ${u(2)}; }
.tk-char { position: relative; display: flex; flex-direction: column; align-items: center; transition: transform .32s var(--spring); }
.tk-char__portrait {
  position: relative; display: block; width: 100%; aspect-ratio: 1 / 1.1; border-radius: ${u(2)}; overflow: hidden; background: var(--cc);
  border: ${u(0.5)} solid var(--ink); box-shadow: 0 0 0 ${u(0.4)} rgba(255,255,255,.3), 0 ${u(0.9)} 0 rgba(0,0,0,.45);
  transition: box-shadow .25s, filter .25s;
  filter: saturate(.7) brightness(.78);
}
.tk-char__portrait svg { width: 100%; height: 100%; }
.tk-char__portrait::after { content: ''; position: absolute; inset: 0; background: linear-gradient(160deg, rgba(255,255,255,.28), rgba(255,255,255,0) 40%); pointer-events: none; }
.tk-char__name {
  position: relative; z-index: 1; margin-top: ${u(1)}; max-width: 118%; font-family: var(--f-display); font-size: ${u(2.6)}; line-height: 1; text-transform: uppercase; white-space: nowrap;
  -webkit-text-stroke: ${u(0.45)} var(--ink); paint-order: stroke fill; text-shadow: 0 ${u(0.35)} 0 var(--ink); color: rgba(255,255,255,.85); transition: color .2s;
}
.tk-char__weight {
  position: absolute; top: ${u(-1)}; right: ${u(-1)}; width: ${u(4.2)}; height: ${u(4.2)}; border-radius: 50%; display: grid; place-items: center;
  font-family: var(--f-display); font-size: ${u(2.3)}; border: ${u(0.45)} solid var(--ink); box-shadow: 0 ${u(0.35)} 0 var(--ink); line-height: 1;
}
.tk-w--light { background: radial-gradient(circle at 35% 30%, #c8ff9f, #6ee83a); color: var(--ink); }
.tk-w--medium { background: radial-gradient(circle at 35% 30%, #fff1a8, #ffc928); color: var(--ink); }
.tk-w--heavy { background: radial-gradient(circle at 35% 30%, #ffb0a0, #ff4d4d); color: #fff; }
.tk-char__cursor {
  position: absolute; top: ${u(-4.4)}; left: 50%; padding: ${u(0.2)} ${u(1.3)} ${u(0.3)}; border-radius: ${u(1)};
  font-size: ${u(2.4)}; color: #fff; background: linear-gradient(180deg, #ff6a7a, #e0203a); border: ${u(0.4)} solid var(--ink);
  -webkit-text-stroke: 0; text-shadow: 0 ${u(0.25)} 0 rgba(0,0,0,.4);
  transform: translateX(-50%) scale(0); transition: transform .3s var(--spring); z-index: 3;
}
.tk-char__cursor::after { content: ''; position: absolute; left: 50%; bottom: ${u(-1.3)}; width: ${u(1.6)}; height: ${u(1)}; margin-left: ${u(-0.8)}; background: var(--ink); clip-path: polygon(0 0, 100% 0, 50% 100%); }
.tk-char.is-focused { transform: translateY(${u(-1)}) scale(1.09); z-index: 2; }
.tk-char.is-focused .tk-char__portrait {
  filter: none;
  box-shadow: 0 0 0 ${u(0.55)} #fff, 0 0 0 ${u(1.1)} var(--yellow), 0 0 ${u(4.5)} ${u(1)} var(--cc), 0 ${u(1.1)} 0 ${u(0.6)} rgba(0,0,0,.45);
}
.tk-char.is-focused .tk-char__name { color: #fff; }
.tk-char.is-focused .tk-char__cursor { transform: translateX(-50%) scale(1); animation: tk-bob .8s ease-in-out infinite; }
.tk-char.is-focus-anim .tk-char__portrait svg { animation: tk-portrait-pop .5s var(--spring); }
@keyframes tk-portrait-pop { 0% { scale: 1.25; } 100% { scale: 1; } }
.tk-char.is-pressed .tk-char__portrait { animation: tk-bump .35s var(--spring); }

.tk-charinfo {
  position: absolute; right: ${u(4)}; bottom: ${u(4)}; width: ${u(58)}; padding: ${u(2.4)} ${u(3)} ${u(2.8)} ${u(4)};
  border-radius: ${u(2.4)}; overflow: hidden;
  background: linear-gradient(160deg, rgba(36,22,100,.9), rgba(14,8,46,.92));
  border: ${u(0.5)} solid rgba(255,255,255,.18); box-shadow: 0 0 0 ${u(0.5)} var(--ink), 0 ${u(1)} 0 rgba(0,0,0,.4);
}
.tk-charinfo::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: ${u(1.4)}; background: linear-gradient(180deg, var(--cc), var(--cc2)); box-shadow: ${u(0.4)} 0 0 var(--ink); }
.tk-charinfo__stripes { position: absolute; right: ${u(-6)}; top: ${u(-6)}; width: ${u(26)}; height: ${u(26)}; border-radius: 50%; background: repeating-linear-gradient(-45deg, color-mix(in srgb, var(--cc) 30%, transparent) 0 ${u(1)}, transparent ${u(1)} ${u(2)}); opacity: .7; }
.tk-charinfo > *:not(.tk-charinfo__stripes) { position: relative; }
.tk-charinfo__head { display: flex; align-items: center; justify-content: space-between; gap: ${u(2)}; }
.tk-charinfo__name { font-size: ${u(6)}; line-height: 1; color: #fff; -webkit-text-stroke-width: ${u(0.7)}; text-shadow: 0 ${u(0.55)} 0 var(--ink), 0 ${u(0.9)} 0 var(--cc); white-space: nowrap; }
.tk-charinfo__weight { flex: none; font-size: ${u(1.5)}; font-weight: 900; padding: ${u(0.45)} ${u(1.3)}; border-radius: 99px; text-transform: uppercase; letter-spacing: .12em; border: ${u(0.3)} solid var(--ink); }
.tk-charinfo__tag { margin-top: ${u(0.8)}; font-size: ${u(2)}; font-style: italic; font-weight: 800; color: rgba(255,255,255,.8); min-height: 1.2em; }
.tk-charinfo__desc { margin-top: ${u(0.5)}; font-size: ${u(1.65)}; font-weight: 700; line-height: 1.3; color: rgba(255,255,255,.62); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.tk-charinfo__desc:empty { display: none; }
.tk-charinfo.is-swap .tk-charinfo__desc { animation: tk-in-r .45s .06s var(--out) both; }
.tk-stats { margin-top: ${u(1.8)}; display: grid; gap: ${u(0.75)}; }
.tk-stat { display: grid; grid-template-columns: ${u(13)} 1fr; align-items: center; }
.tk-stat__label { font-size: ${u(1.65)}; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; color: rgba(255,255,255,.88); }
.tk-stat__bar { display: grid; grid-template-columns: repeat(5, 1fr); gap: ${u(0.5)}; }
.tk-stat__bar i { position: relative; display: block; height: ${u(2)}; background: rgba(255,255,255,.12); transform: skewX(-20deg); border-radius: ${u(0.35)}; overflow: hidden; box-shadow: inset 0 ${u(-0.25)} 0 rgba(0,0,0,.25); }
.tk-stat__bar i b { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: linear-gradient(180deg, #fffbe0 0%, var(--yellow) 40%, var(--orange) 100%); transition: width .4s var(--out); }
.tk-stat__bar i.is-full b { box-shadow: 0 0 ${u(1)} rgba(255,210,63,.6); }
.tk-charinfo.is-swap .tk-charinfo__name { animation: tk-in-r .4s var(--out) both; }
.tk-charinfo.is-swap .tk-charinfo__tag { animation: tk-in-r .45s .04s var(--out) both; }
.tk-charinfo.is-swap .tk-stat { animation: tk-stat-in .45s var(--out) both; animation-delay: calc(var(--i) * 40ms + 60ms); }
@keyframes tk-stat-in { from { opacity: 0; translate: ${u(3)} 0; } to { opacity: 1; translate: 0 0; } }

/* ============================== TRACK ============================== */
.tk-trackrow { position: absolute; left: 50%; top: ${u(23)}; transform: translateX(-50%); display: grid; grid-template-columns: repeat(var(--cols, 4), ${u(36)}); gap: ${u(2.8)}; }
.tk-track {
  position: relative; display: flex; flex-direction: column; height: ${u(42)}; padding: ${u(1.2)} ${u(1.2)} ${u(1.4)};
  border-radius: ${u(2.2)}; background: linear-gradient(170deg, rgba(44,28,116,.95), rgba(16,10,52,.95));
  border: ${u(0.5)} solid rgba(255,255,255,.16); box-shadow: 0 ${u(1)} 0 rgba(0,0,0,.4);
  transition: transform .32s var(--spring), border-color .2s, box-shadow .3s;
}
.tk-track::after { content: ''; position: absolute; inset: 0; border-radius: inherit; background: #fff; opacity: 0; pointer-events: none; }
.tk-track__map {
  position: relative; display: block; height: ${u(25)}; border-radius: ${u(1.4)}; overflow: hidden; border: ${u(0.35)} solid rgba(0,0,0,.45);
  background:
    linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px) 0 0 / ${u(2.5)} ${u(2.5)},
    linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px) 0 0 / ${u(2.5)} ${u(2.5)},
    radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--ac) 32%, #160c44), #0a0624 78%);
}
.tk-map { width: 100%; height: 100%; }
.tk-map__road.is-draw { stroke-dasharray: 1 1; stroke-dashoffset: 0; }
.tk-map__glow { opacity: .3; transition: opacity .3s; }
.tk-track.is-focused .tk-map__glow { opacity: 1; animation: tk-glow 1.6s ease-in-out infinite; }
@keyframes tk-glow { 0%, 100% { opacity: .65; } 50% { opacity: 1; } }
.tk-track.is-focus-anim .tk-map__road, .tk-screen.is-in .tk-map__road.is-draw { animation: tk-draw 1.2s var(--out) both; }
@keyframes tk-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
.tk-map__dot { opacity: 0; transition: opacity .3s; }
.tk-track.is-focused .tk-map__dot { opacity: 1; }
.tk-track__num {
  position: absolute; left: ${u(-1.6)}; top: ${u(-1.6)}; width: ${u(5.2)}; height: ${u(5.2)}; display: grid; place-items: center; z-index: 2;
  border-radius: ${u(1.2)}; background: var(--ac); font-size: ${u(3.2)}; transform: rotate(-8deg); border: ${u(0.45)} solid var(--ink); box-shadow: 0 ${u(0.4)} 0 var(--ink);
}
.tk-track__name { margin-top: ${u(1.6)}; text-align: center; font-size: ${u(3.1)}; line-height: 1.02; color: #fff; }
.tk-track__stars { display: flex; justify-content: center; gap: ${u(0.4)}; margin-top: ${u(1)}; }
.tk-track__best { margin-top: auto; display: block; text-align: center; padding: ${u(0.7)}; border-radius: ${u(1)}; background: rgba(0,0,0,.38); font-size: ${u(1.9)}; font-weight: 900; letter-spacing: .05em; color: rgba(255,255,255,.9); }
.tk-track__best em { font-style: normal; color: var(--ac); margin-right: .45em; letter-spacing: .14em; }
.tk-track.is-focused {
  transform: translateY(${u(-1.8)}) scale(1.06); border-color: #fff; z-index: 2;
  box-shadow: 0 0 0 ${u(0.55)} var(--ink), 0 0 0 ${u(1.1)} var(--ac), 0 0 ${u(5)} var(--ac), 0 ${u(1.4)} 0 ${u(0.6)} rgba(0,0,0,.45);
}
.tk-track:not(.is-focused) { filter: saturate(.8) brightness(.85); }
.tk-track.is-pressed::after { animation: tk-flash .35s ease-out; }

.tk-trackinfo {
  position: absolute; left: 50%; bottom: ${u(10)}; width: ${u(152)}; transform: translateX(-50%);
  display: flex; align-items: center; gap: ${u(3)}; padding: ${u(2)} ${u(3)} ${u(2.2)} ${u(3.4)};
  border-radius: ${u(2)}; background: linear-gradient(90deg, rgba(18,10,58,.94), rgba(36,22,100,.9));
  border: ${u(0.45)} solid rgba(255,255,255,.14); box-shadow: 0 0 0 ${u(0.45)} var(--ink), 0 ${u(1)} 0 rgba(0,0,0,.35);
  overflow: hidden;
}
.tk-trackinfo::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: ${u(1.3)}; background: var(--ac); }
.tk-trackinfo__main { flex: 1; min-width: 0; }
.tk-trackinfo__top { display: flex; align-items: center; gap: ${u(1.4)}; }
.tk-trackinfo__name { font-size: ${u(4.4)}; line-height: 1; color: #fff; margin-right: ${u(0.6)}; }
.tk-trackinfo__desc { margin-top: ${u(0.9)}; font-size: ${u(2)}; font-weight: 700; color: rgba(255,255,255,.82); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tk-trackinfo__rec { display: flex; gap: ${u(3)}; flex: none; }
.tk-trackinfo__rec div { display: flex; flex-direction: column; align-items: flex-end; }
.tk-trackinfo__rec span { font-size: ${u(1.5)}; font-weight: 900; text-transform: uppercase; letter-spacing: .14em; color: rgba(255,255,255,.65); }
.tk-trackinfo__rec b { font-size: ${u(3.4)}; color: var(--yellow); }
.tk-trackinfo.is-swap .tk-trackinfo__main { animation: tk-in-r .4s var(--out) both; }

/* ============================== CUP ============================== */
.tk-cupwrap { position: absolute; left: 50%; top: 53%; transform: translate(-50%, -50%); display: flex; align-items: center; gap: ${u(5)}; }
.tk-cuprow { display: flex; gap: ${u(2.6)}; }
.tk-cup {
  position: relative; width: ${u(40)}; height: ${u(54)}; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden;
  border-radius: ${u(2.6)}; background: linear-gradient(170deg, rgba(48,30,126,.96), rgba(16,10,52,.96));
  border: ${u(0.55)} solid rgba(255,255,255,.18); box-shadow: 0 ${u(1)} 0 rgba(0,0,0,.4);
  transition: transform .32s var(--spring), box-shadow .3s, border-color .2s;
}
.tk-cup > * { position: relative; }
.tk-cup__rays {
  position: absolute !important; left: 50%; top: 42%; width: ${u(90)}; height: ${u(90)}; margin: ${u(-45)} 0 0 ${u(-45)};
  background: repeating-conic-gradient(color-mix(in srgb, var(--ac) 40%, transparent) 0deg 9deg, transparent 9deg 22.5deg);
  -webkit-mask-image: radial-gradient(circle, #000 10%, transparent 55%); mask-image: radial-gradient(circle, #000 10%, transparent 55%);
  animation: tk-spin 16s linear infinite; opacity: .7;
}
.tk-cup__icon { width: ${u(24)}; height: ${u(24)}; filter: drop-shadow(0 ${u(1)} 0 rgba(0,0,0,.4)); animation: tk-float 2.6s ease-in-out infinite; }
.tk-cup__icon svg { width: 100%; height: 100%; }
.tk-cup__name { margin-top: ${u(1.6)}; font-size: ${u(4.8)}; color: var(--ac); line-height: 1; }
.tk-cup__count { margin-top: ${u(0.8)}; font-size: ${u(1.8)}; font-weight: 900; text-transform: uppercase; letter-spacing: .16em; color: rgba(255,255,255,.8); }
.tk-cup.is-focused { transform: scale(1.05); border-color: #fff; box-shadow: 0 0 0 ${u(0.55)} var(--ink), 0 0 0 ${u(1.1)} var(--ac), 0 0 ${u(6)} var(--ac); }
.tk-cup.is-pressed .tk-cup__icon { animation: tk-bump .4s var(--spring); }
.tk-cuppanel {
  width: ${u(74)}; padding: ${u(2.6)} ${u(2.8)} ${u(2.8)}; border-radius: ${u(2.4)};
  background: linear-gradient(170deg, rgba(36,22,100,.92), rgba(14,8,46,.94)); border: ${u(0.5)} solid rgba(255,255,255,.16);
  box-shadow: 0 0 0 ${u(0.5)} var(--ink), 0 ${u(1)} 0 rgba(0,0,0,.4);
}
.tk-cuplist__title { font-size: ${u(4)}; color: var(--yellow); margin-bottom: ${u(0.6)}; }
.tk-cuptrack {
  display: grid; grid-template-columns: ${u(5)} ${u(15)} 1fr; align-items: center; gap: ${u(1.8)};
  margin-top: ${u(1.1)}; padding: ${u(0.8)} ${u(1.4)} ${u(0.8)} ${u(0.8)}; border-radius: ${u(1.2)};
  background: rgba(255,255,255,.06); box-shadow: inset ${u(0.8)} 0 0 var(--ac);
}
.tk-cuplist.is-swap .tk-cuptrack { animation: tk-stat-in .45s var(--out) both; animation-delay: calc(var(--i) * 70ms + 80ms); }
.tk-cuptrack__n { font-size: ${u(3.6)}; color: var(--ac); text-align: center; }
.tk-cuptrack__map { display: block; height: ${u(9)}; border-radius: ${u(0.8)}; background: radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--ac) 25%, #160c44), #0a0624 80%); overflow: hidden; }
.tk-cuptrack__text { display: flex; flex-direction: column; min-width: 0; }
.tk-cuptrack__name { font-size: ${u(2.9)}; line-height: 1.05; color: #fff; }
.tk-cuptrack__meta { display: flex; align-items: center; gap: ${u(0.3)}; margin-top: ${u(0.6)}; }
.tk-cuptrack__meta .tk-star { width: ${u(2.2)}; height: ${u(2.2)}; }
.tk-cuptrack__meta em { margin-left: ${u(1.2)}; font-style: normal; font-size: ${u(1.7)}; font-weight: 900; color: rgba(255,255,255,.7); letter-spacing: .05em; }
`;
