/**
 * Independent Babylon.js demo shell. Original Dungeon Forge UI/core:
 * Copyright (c) 2026 Majid Manzarpour, MIT (see LICENSE).
 */
import { generateDungeon, THEMES, THEME_KEYS } from './core/generator.js';
import type { ThemeKey } from './core/types';
import { DungeonView } from './babylon/DungeonView';

type ThemeSelection = 'auto' | ThemeKey;
type Layer = 'props' | 'torches' | 'particles' | 'liquids' | 'lights';

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing demo element: ${id}`);
  return result as T;
}

const inputs = {
  seed: element<HTMLInputElement>('seed'), rooms: element<HTMLInputElement>('rooms'),
  loops: element<HTMLInputElement>('loops'), decor: element<HTMLInputElement>('decor'),
  graph: element<HTMLInputElement>('tGraph'), heat: element<HTMLInputElement>('tHeat'),
  animate: element<HTMLInputElement>('tAnim'), post: element<HTMLInputElement>('tPost'),
};
const forgeButton = element<HTMLButtonElement>('forge');
const diceButton = element<HTMLButtonElement>('dice');
const panel = element('panel');
const panelContent = element('panel-content');
const collapseButton = element<HTMLButtonElement>('collapse');
const status = element('status');
const errorBox = element('error');
const pipe = Array.from(document.querySelectorAll<HTMLElement>('#pipe li'));
const themeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('#chips button'));
const layerButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('#objchips button'));
const stages = ['Scatter', 'Separate', 'Delaunay', 'MST + loops', 'Carve', 'Theme'];
const visibility: Record<Layer, boolean> = { props: true, torches: true, particles: true, liquids: true, lights: true };
const events = new AbortController();
const listenerOptions = { signal: events.signal };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let themeSelection: ThemeSelection = 'auto';
let view: DungeonView | undefined;
let pendingForge: number | undefined;
let disposed = false;
let ready = false;
let hasResult = false;
let generating = false;
let lastFrameReport = 0;

function resetStages(): void {
  pipe.forEach((item) => { item.classList.remove('active', 'done'); item.removeAttribute('aria-current'); });
}

function setStage(stage: number): void {
  if (disposed || !hasResult) return;
  const complete = stage >= 6;
  pipe.forEach((item, index) => {
    item.classList.toggle('active', !complete && index === stage);
    item.classList.toggle('done', complete || index < stage);
    if (!complete && index === stage) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
  status.textContent = complete ? 'Ready · drag the scene to explore' : `Build reveal · ${stages[stage] ?? 'Preparing'}`;
}

function reportError(error: unknown): void {
  hasResult = false;
  resetStages();
  status.textContent = 'Unable to forge dungeon';
  errorBox.textContent = error instanceof Error ? error.message : String(error);
  errorBox.hidden = false;
  console.error('Dungeon Forge:', error);
}

function setBusy(busy: boolean): void {
  generating = busy;
  panel.setAttribute('aria-busy', String(busy));
  forgeButton.disabled = busy || !ready;
  diceButton.disabled = busy || !ready;
}

function selectTheme(theme: ThemeSelection): void {
  themeSelection = theme;
  themeButtons.forEach((button) => {
    const selected = button.dataset.t === theme;
    button.classList.toggle('on', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function resolveTheme(seed: number): ThemeKey {
  return themeSelection === 'auto'
    ? THEME_KEYS[(Math.imul(seed ^ 0x9e37, 2654435761) >>> 0) % THEME_KEYS.length] as ThemeKey
    : themeSelection;
}

function applyViewSettings(): void {
  if (!view) return;
  for (const layer of Object.keys(visibility) as Layer[]) view.setLayerVisible(layer, visibility[layer]);
  view.setGraphVisible(inputs.graph.checked);
  view.setHeatmap(inputs.heat.checked);
  view.setPostFX(inputs.post.checked);
}

function forge(animate: boolean): void {
  pendingForge = undefined;
  if (disposed || !view || !ready) return;
  setBusy(true);
  errorBox.hidden = true;
  errorBox.textContent = '';
  hasResult = false;
  resetStages();
  try {
    const seedNumber = Number(inputs.seed.value);
    if (inputs.seed.value.trim() === '' || !Number.isInteger(seedNumber) || seedNumber < 0 || seedNumber > 0xffffffff) {
      throw new Error('Seed must be a whole number between 0 and 4294967295.');
    }
    const themeKey = resolveTheme(seedNumber);
    const dungeon = generateDungeon({
      seed: seedNumber, roomCount: Number(inputs.rooms.value),
      loopChance: Number(inputs.loops.value) / 100,
      decorDensity: Number(inputs.decor.value) / 100, themeKey,
    });
    if (!dungeon.valid) throw new Error('Could not produce a connected layout. Try another seed or fewer rooms.');
    const theme = THEMES[themeKey];
    hasResult = true;
    view.build(dungeon, animate && inputs.animate.checked && !reducedMotion.matches);
    applyViewSettings();
    document.documentElement.style.setProperty('--ember', theme.accent);
    element('vTheme').textContent = themeSelection === 'auto' ? `AUTO · ${theme.label}` : theme.label;
    element('dname').textContent = dungeon.name;
    const rerolls = dungeon.stats.attempts > 1 ? ` · rerolled ${dungeon.stats.attempts - 1}×` : '';
    element('dsub').textContent = `seed ${dungeon.seed} · ${theme.label.toLowerCase()} · connected ✓${rerolls}`;
    element('sRooms').textContent = String(dungeon.stats.rooms);
    element('sEdges').textContent = `${dungeon.stats.edges} · ${dungeon.stats.loops}`;
    element('sCrit').textContent = `${dungeon.stats.critLen} rm`;
    element('sTiles').textContent = dungeon.stats.floorTiles.toLocaleString();
    element('sMs').textContent = `${dungeon.stats.genMs.toFixed(1)}ms`;
    if (!animate || !inputs.animate.checked || reducedMotion.matches) setStage(6);
  } catch (error) {
    reportError(error);
    try { view.skipAnimation(); } catch (cleanupError) { console.warn('Could not finish the failed build reveal:', cleanupError); }
  } finally {
    setBusy(false);
  }
}

function queueForge(animate: boolean, delay = 0): void {
  if (disposed || !ready) return;
  window.clearTimeout(pendingForge);
  hasResult = false;
  status.textContent = delay > 0 ? 'Settings changed · waiting to forge…' : 'Generating layout…';
  pendingForge = window.setTimeout(() => forge(animate), delay);
}

function randomize(): void {
  inputs.seed.value = String(crypto.getRandomValues(new Uint32Array(1))[0]);
  queueForge(true);
}

function setCollapsed(collapsed: boolean): void {
  panel.classList.toggle('min', collapsed);
  panelContent.inert = collapsed;
  collapseButton.textContent = collapsed ? '+' : '−';
  collapseButton.setAttribute('aria-expanded', String(!collapsed));
  collapseButton.setAttribute('aria-label', collapsed ? 'Expand controls' : 'Collapse controls');
  collapseButton.title = collapsed ? 'Expand controls' : 'Collapse controls';
}

function dispose(): void {
  if (disposed) return;
  disposed = true;
  window.clearTimeout(pendingForge);
  events.abort();
  view?.dispose();
  view = undefined;
}

inputs.animate.checked = !reducedMotion.matches;
selectTheme('auto');
layerButtons.forEach((button) => {
  const layer = button.dataset.o as Layer;
  if (layer in visibility) visibility[layer] = button.getAttribute('aria-pressed') !== 'false';
});
setCollapsed(innerWidth < 640);
setBusy(false);
try {
  view = new DungeonView(element<HTMLCanvasElement>('dungeon-canvas'), {
    onStage: setStage,
    onFrame: (stats) => {
      const now = performance.now();
      if (disposed || now - lastFrameReport < 300) return;
      lastFrameReport = now;
      element('sFps').textContent = String(Math.round(stats.fps));
      element('sCalls').textContent = String(stats.drawCalls);
      element('sTris').textContent = stats.triangles >= 1e6 ? `${(stats.triangles / 1e6).toFixed(2)}M` : `${(stats.triangles / 1e3).toFixed(1)}k`;
      element('sLights').textContent = String(stats.lights);
    },
  });
  ready = true;
  setBusy(false);
} catch (error) {
  view?.dispose();
  view = undefined;
  reportError(error);
  document.querySelectorAll<HTMLInputElement | HTMLButtonElement>('#panel-content input, #panel-content button')
    .forEach((control) => { control.disabled = true; });
}

for (const [input, label, suffix] of [
  [inputs.rooms, element('vRooms'), ''], [inputs.loops, element('vLoops'), '%'], [inputs.decor, element('vDecor'), '%'],
] as const) {
  input.addEventListener('input', () => { label.textContent = input.value + suffix; queueForge(false, 220); }, listenerOptions);
}
inputs.seed.addEventListener('change', () => queueForge(true), listenerOptions);
forgeButton.addEventListener('click', () => queueForge(true), listenerOptions);
diceButton.addEventListener('click', randomize, listenerOptions);
inputs.graph.addEventListener('change', () => view?.setGraphVisible(inputs.graph.checked), listenerOptions);
inputs.heat.addEventListener('change', () => view?.setHeatmap(inputs.heat.checked), listenerOptions);
inputs.post.addEventListener('change', () => view?.setPostFX(inputs.post.checked), listenerOptions);
inputs.animate.addEventListener('change', () => { if (!inputs.animate.checked) view?.skipAnimation(); }, listenerOptions);
themeButtons.forEach((button) => button.addEventListener('click', () => {
  const theme = button.dataset.t;
  if (theme === 'auto' || (theme !== undefined && THEME_KEYS.includes(theme as ThemeKey))) {
    selectTheme(theme as ThemeSelection);
    queueForge(true);
  }
}, listenerOptions));
layerButtons.forEach((button) => button.addEventListener('click', () => {
  const layer = button.dataset.o as Layer;
  if (!(layer in visibility)) return;
  visibility[layer] = !visibility[layer];
  button.classList.toggle('on', visibility[layer]);
  button.setAttribute('aria-pressed', String(visibility[layer]));
  view?.setLayerVisible(layer, visibility[layer]);
}, listenerOptions));
collapseButton.addEventListener('click', () => setCollapsed(!panel.classList.contains('min')), listenerOptions);
window.addEventListener('resize', () => view?.resize(), listenerOptions);
// A back/forward-cache entry resumes the same JS heap. Keep its engine and
// event handlers alive; the browser freezes render scheduling while cached.
window.addEventListener('pagehide', (event: PageTransitionEvent) => {
  if (!event.persisted) dispose();
}, listenerOptions);
window.addEventListener('pageshow', (event: PageTransitionEvent) => {
  if (event.persisted) view?.resize();
}, listenerOptions);
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) { inputs.animate.checked = false; view?.skipAnimation(); }
}, listenerOptions);
window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (!ready || generating || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, button, a, [role="textbox"]'))) return;
  switch (event.code) {
    case 'KeyR': randomize(); break;
    case 'KeyT': {
      const order: ThemeSelection[] = ['auto', ...THEME_KEYS as ThemeKey[]];
      selectTheme(order[(order.indexOf(themeSelection) + 1) % order.length]);
      queueForge(true);
      break;
    }
    case 'KeyG': inputs.graph.checked = !inputs.graph.checked; view?.setGraphVisible(inputs.graph.checked); break;
    case 'KeyH': inputs.heat.checked = !inputs.heat.checked; view?.setHeatmap(inputs.heat.checked); break;
    case 'KeyP': inputs.post.checked = !inputs.post.checked; view?.setPostFX(inputs.post.checked); break;
    case 'Space': event.preventDefault(); view?.skipAnimation(); break;
  }
}, listenerOptions);
if (import.meta.hot) import.meta.hot.dispose(dispose);
queueForge(true);
