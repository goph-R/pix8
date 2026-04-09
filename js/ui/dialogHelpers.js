/**
 * Shared styles and DOM helpers for modal dialogs.
 */

export const INPUT_STYLE = 'width:100%;padding:6px;background:var(--bg-input);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:13px;box-sizing:border-box;';

export const ROW_STYLE = 'display:flex;align-items:center;gap:8px;';

const SELECT_STYLE = 'background:var(--bg-input);border:1px solid var(--border);border-radius:2px;color:var(--text);padding:2px 4px;font-size:12px;';

const DITHER_OPTIONS = [
    ['none', 'None'],
    ['floyd-steinberg', 'Floyd-Steinberg'],
    ['ordered', 'Ordered (Bayer)'],
];

/**
 * Creates a dither mode <select> with label, wrapped in a row div.
 * Returns { row, select } where select.value gives the chosen mode.
 */
export function createDitherRow() {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px;';
    const label = document.createElement('label');
    label.textContent = 'Dithering:';
    const select = document.createElement('select');
    select.style.cssText = SELECT_STYLE;
    for (const [val, text] of DITHER_OPTIONS) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = text;
        select.appendChild(opt);
    }
    row.appendChild(label);
    row.appendChild(select);
    return { row, select };
}
