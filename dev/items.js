const params = new URLSearchParams(location.search);
const view = params.get('view') || 'showcase';

window.addEventListener('error', (e) => console.error('[items] uncaught', e.message, e.filename, e.lineno));

if (view === 'sim') {
  import('./items-sim.js').then((m) => m.runSim(params)).catch((e) => console.error('[items] sim failed', e.stack || e));
} else {
  import('./items-showcase.js').then((m) => m.runShowcase(params)).catch((e) => console.error('[items] showcase failed', e.stack || e));
}
