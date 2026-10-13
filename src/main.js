import { Game } from './core/Game.js';

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');

const game = new Game({ canvas, uiRoot });
game.init().catch((err) => {
  console.error('[TurboKart] failed to start', err);
  const box = document.createElement('pre');
  box.style.cssText =
    'position:fixed;left:24px;bottom:24px;max-width:70vw;padding:16px 20px;background:rgba(20,0,0,.85);' +
    'color:#ffb3b3;font:13px/1.4 ui-monospace,monospace;border:2px solid #ff4d4d;border-radius:10px;' +
    'white-space:pre-wrap;pointer-events:auto;z-index:99';
  box.textContent = `TurboKart failed to start:\n${err && err.stack ? err.stack : err}`;
  document.body.appendChild(box);
});
