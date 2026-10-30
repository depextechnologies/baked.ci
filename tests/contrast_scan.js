() => {
  const parse = (c) => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const effBg = (el) => { let layers = []; let n = el; let img = false; while (n && n.nodeType === 1) { const cs = getComputedStyle(n); if (cs.backgroundImage && cs.backgroundImage !== 'none') img = true; if (n.tagName === 'IMG') img = true; const c = parse(cs.backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break; } n = n.parentElement; } let base = { r: 255, g: 255, b: 255 }; if (layers.length && layers[layers.length - 1].a >= 0.99) base = layers.pop(); for (let i = layers.length - 1; i >= 0; i--) { const L = layers[i]; base = { r: L.r * L.a + base.r * (1 - L.a), g: L.g * L.a + base.g * (1 - L.a), b: L.b * L.a + base.b * (1 - L.a) }; } return { base, img }; };
  const out = [];
  document.querySelectorAll('div,span').forEach((el) => {
    const t = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ');
    if (!t) return; const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0 || r.bottom < 0) return;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) return;
    const fg = parse(cs.color); if (!fg) return; const { base } = effBg(el); const k = ratio(fg, base);
    if (k < 2.2) out.push(`${t.slice(0, 40)} | fg ${cs.color} bg rgb(${base.r | 0},${base.g | 0},${base.b | 0}) | ${k.toFixed(2)}`);
  });
  return out;
}
