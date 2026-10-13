import { baseCSS } from './base.js';
import { menusCSS } from './menus.js';
import { selectCSS } from './select.js';
import { hudCSS } from './hud.js';
import { resultsCSS } from './results.js';

const STYLE_ID = 'tk-ui-styles';

/** Inject the UI stylesheet once (idempotent). */
export function injectStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = baseCSS + menusCSS + selectCSS + hudCSS + resultsCSS;
  document.head.appendChild(style);
}

export function removeStyles() {
  if (typeof document === 'undefined') return;
  document.getElementById(STYLE_ID)?.remove();
}
