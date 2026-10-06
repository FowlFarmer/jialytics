import { CURSOR_1X, CURSOR_2X } from './cursor';

// Injected once by the dashboard, so there's no stylesheet to import. Everything is scoped
// under .jl-page. The look: a blue sky with falling sakura petals, smoked glass cards, sakura
// pink for the data and a blush white for what's selected.
export const STYLES = `
.jl-page {
  --jl-glass: rgba(14, 16, 38, 0.38);
  --jl-glass-edge: rgba(255, 255, 255, 0.1);
  --jl-text: #ffffff;
  --jl-text-2: rgba(255, 255, 255, 0.78);
  --jl-text-3: rgba(255, 255, 255, 0.58);
  --jl-grid: rgba(255, 255, 255, 0.12);
  --jl-sakura: #ffb5c6;
  --jl-blush: #fff2f6;
  --jl-wash: rgba(255, 181, 198, 0.2);
  --jl-hover: rgba(255, 255, 255, 0.07);
  --jl-focus: #ffb8d0;
  position: relative;
  isolation: isolate;
  box-sizing: border-box;
  min-height: 100vh;
  min-height: 100svh;
  color: var(--jl-text);
  font: 300 14px/1.4 'Inter Variable', Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
  text-align: left;
}
.jl-page *, .jl-page *::before, .jl-page *::after { box-sizing: border-box; }
.jl-page::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -2;
  background: linear-gradient(180deg, #2f56b0 0%, #4c79cf 45%, #7fa6e4 80%, #a9c5ef 100%);
}
.jl-cursor, .jl-cursor * {
  cursor: url('${CURSOR_1X}') 0 0, auto;
  cursor: image-set(url('${CURSOR_1X}') 1x, url('${CURSOR_2X}') 2x) 0 0, auto;
}
.jl-petals, .jl-trail {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.jl-petals { z-index: -1; }
.jl-trail { z-index: 2100; }

.jl-shell { max-width: 1120px; margin: 0 auto; padding: 40px 24px 64px; }
.jl-head {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.jl-head h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 500;
  letter-spacing: -0.01em;
  text-shadow: 0 2px 12px rgba(20, 22, 52, 0.45);
}

.jl-range { display: flex; align-items: center; gap: 14px; flex: 1 1 260px; max-width: 460px; }
.jl-range output {
  flex: none;
  min-width: 76px;
  padding: 6px 12px;
  border-radius: 8px;
  background: var(--jl-blush);
  color: #232333;
  font-size: 13px;
  font-weight: 500;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.jl-range input {
  flex: 1;
  min-width: 0;
  height: 24px;
  margin: 0;
  background: transparent;
  -webkit-appearance: none;
  appearance: none;
}
.jl-range input::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--jl-sakura) var(--jl-range-fill), rgba(255, 255, 255, 0.22) var(--jl-range-fill));
}
.jl-range input::-moz-range-track { height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.22); }
.jl-range input::-moz-range-progress { height: 6px; border-radius: 3px; background: var(--jl-sakura); }
.jl-range input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  margin-top: -7px;
  border: 0;
  border-radius: 50%;
  background: var(--jl-blush);
  box-shadow: 0 2px 8px rgba(14, 16, 38, 0.35);
}
.jl-range input::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 50%;
  background: var(--jl-blush);
  box-shadow: 0 2px 8px rgba(14, 16, 38, 0.35);
}
.jl-range input:focus-visible { outline: none; }
.jl-range input:focus-visible::-webkit-slider-thumb { outline: 3px solid var(--jl-focus); outline-offset: 2px; }
.jl-range input:focus-visible::-moz-range-thumb { outline: 3px solid var(--jl-focus); outline-offset: 2px; }
.jl-chart:focus-visible { outline: 3px solid var(--jl-focus); outline-offset: 3px; }

.jl-body { display: grid; gap: 16px; transition: opacity 150ms; }
.jl-body.is-loading { opacity: 0.55; }
.jl-card {
  min-width: 0;
  background: var(--jl-glass);
  border: 1px solid var(--jl-glass-edge);
  border-radius: 12px;
  -webkit-backdrop-filter: blur(14px) saturate(1.15);
  backdrop-filter: blur(14px) saturate(1.15);
  box-shadow: 0 8px 24px rgba(14, 16, 38, 0.18);
}

.jl-overview { padding: 22px 22px 12px; }
.jl-totals { display: flex; gap: 44px; margin: 0 0 22px; }
.jl-totals dt { font-size: 13px; color: var(--jl-text-2); }
.jl-totals dd {
  margin: 2px 0 0;
  font-size: 36px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.1;
  text-shadow: 0 2px 12px rgba(20, 22, 52, 0.35);
}

.jl-chart { position: relative; border-radius: 4px; }
.jl-chart svg { display: block; overflow: visible; }
.jl-grid { stroke: var(--jl-grid); stroke-width: 1; }
.jl-tick { fill: var(--jl-text-3); font-size: 11px; font-variant-numeric: tabular-nums; }
.jl-line { fill: none; stroke: var(--jl-sakura); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.jl-area-top { stop-color: var(--jl-sakura); stop-opacity: 0.32; }
.jl-area-bottom { stop-color: var(--jl-sakura); stop-opacity: 0; }
.jl-crosshair { stroke: rgba(255, 255, 255, 0.45); stroke-width: 1; }
.jl-dot { fill: var(--jl-blush); stroke: var(--jl-sakura); stroke-width: 2; }
.jl-tip {
  position: absolute;
  top: 0;
  display: grid;
  gap: 2px;
  padding: 8px 11px;
  border-radius: 9px;
  background: var(--jl-blush);
  color: #232333;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 6px 20px rgba(14, 16, 38, 0.3);
}
.jl-tip-day { opacity: 0.65; }
.jl-tip strong { font-weight: 600; font-variant-numeric: tabular-nums; }

.jl-lists { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 16px; }
.jl-list { padding: 16px 12px 12px; }
.jl-list h2 { margin: 0 8px 10px; font-size: 13px; font-weight: 500; color: var(--jl-text-2); }
.jl-list ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.jl-list li {
  position: relative;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 6px 8px;
  border-radius: 6px;
  overflow: hidden;
  font-size: 13px;
}
.jl-list li:hover { background: var(--jl-hover); }
.jl-fill { position: absolute; inset: 0 auto 0 0; background: var(--jl-wash); }
.jl-key { position: relative; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jl-num { position: relative; color: var(--jl-text-2); font-variant-numeric: tabular-nums; }
.jl-empty { margin: 0; padding: 4px 8px; color: var(--jl-text-3); font-size: 13px; }

@media (max-width: 600px) {
  .jl-shell { padding: 24px 16px 48px; }
  .jl-totals { gap: 28px; }
  .jl-totals dd { font-size: 28px; }
  .jl-overview { padding: 16px 16px 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .jl-body { transition: none; }
}
`;
