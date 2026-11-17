/* ============================================================
   ifc-core.js — leitor de IFC (STEP / ISO-10303-21)
   Escrito para arquivos IFC2x3 / IFC4 exportados pelo Revit.
   Funciona no navegador e no Node.
   ============================================================ */

/* ---------- 1. Tokenizador do arquivo STEP ---------- */
// Varre o texto e monta um mapa  id -> { t: TIPO, p: "parametros crus" }
function tokenizeStep(text, onProgress) {
  const ents = new Map();
  const n = text.length;
  let i = text.indexOf('DATA;');
  i = i < 0 ? 0 : i + 5;

  let stmtStart = i;
  let inStr = false;
  let lastReport = 0;

  for (; i < n; i++) {
    const c = text.charCodeAt(i);
    if (inStr) {
      if (c === 39 /* ' */) {
        // '' = apóstrofo literal dentro da string
        if (text.charCodeAt(i + 1) === 39) i++;
        else inStr = false;
      }
      continue;
    }
    if (c === 39) { inStr = true; continue; }
    if (c === 59 /* ; */) {
      addStatement(ents, text, stmtStart, i);
      stmtStart = i + 1;
      if (onProgress && i - lastReport > 2000000) {
        lastReport = i;
        onProgress(i / n);
      }
    }
  }
  return ents;
}

function addStatement(ents, text, from, to) {
  // acha '#'
  let i = from;
  while (i < to) {
    const c = text.charCodeAt(i);
    if (c === 35 /* # */) break;
    if (c > 32) return;            // não é "#id=..."  (ENDSEC, etc.)
    i++;
  }
  if (i >= to) return;
  i++;
  let id = 0;
  while (i < to) {
    const c = text.charCodeAt(i);
    if (c < 48 || c > 57) break;
    id = id * 10 + (c - 48);
    i++;
  }
  if (!id) return;
  while (i < to && text.charCodeAt(i) <= 32) i++;
  if (text.charCodeAt(i) !== 61 /* = */) return;
  i++;
  while (i < to && text.charCodeAt(i) <= 32) i++;
  const typeStart = i;
  while (i < to) {
    const c = text.charCodeAt(i);
    if (c === 40 /* ( */) break;
    i++;
  }
  const type = text.slice(typeStart, i).trim();
  if (!type || type.charCodeAt(0) === 40) return;
  ents.set(id, { t: type, p: text.slice(i + 1, to).replace(/\)\s*$/, '') });
}

/* ---------- 2. Decodificação de texto IFC ---------- */
function decodeIfcString(s) {
  if (s.indexOf('\\') < 0 && s.indexOf("''") < 0) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && s[i + 1] === "'") { out += "'"; i++; continue; }
    if (ch !== '\\') { out += ch; continue; }
    const tag = s.slice(i).match(/^\\(X2|X4|X|S|PC|PA|PB|PD|PE|PF|PG|N|T)\\/i);
    if (!tag) { out += ch; continue; }
    const kind = tag[1].toUpperCase();
    i += tag[0].length;
    if (kind === 'X') {                       // \X\E1  -> 1 byte latin-1
      const hex = s.substr(i, 2); i += 1;
      out += String.fromCharCode(parseInt(hex, 16));
    } else if (kind === 'X2' || kind === 'X4') {
      const w = kind === 'X2' ? 4 : 8;
      const end = s.indexOf('\\X0\\', i);
      const body = end < 0 ? s.slice(i) : s.slice(i, end);
      for (let k = 0; k + w <= body.length; k += w) {
        const cp = parseInt(body.substr(k, w), 16);
        if (!isNaN(cp)) out += String.fromCodePoint(cp);
      }
      i = (end < 0 ? s.length : end + 3);
    } else if (kind === 'S') {                // \S\x -> x + 128 (latin-1)
      out += String.fromCharCode(s.charCodeAt(i) + 128);
    } else {
      i -= 1;                                 // diretivas de página: ignora
    }
  }
  return out;
}

/* ---------- 3. Parser de parâmetros (sob demanda) ---------- */
const REF = 1, STR = 2, ENUM = 3, TYPED = 4;

function parseParams(p) {
  let i = 0;
  const n = p.length;

  function skip() { while (i < n && (p.charCodeAt(i) === 32 || p.charCodeAt(i) === 10 || p.charCodeAt(i) === 13 || p.charCodeAt(i) === 9)) i++; }

  function list() {
    const out = [];
    skip();
    if (i < n && p[i] === ')') { i++; return out; }
    for (;;) {
      out.push(value());
      skip();
      if (i >= n) break;
      if (p[i] === ',') { i++; continue; }
      if (p[i] === ')') { i++; break; }
      i++;
    }
    return out;
  }

  function value() {
    skip();
    if (i >= n) return null;
    const c = p[i];
    if (c === '$') { i++; return null; }
    if (c === '*') { i++; return undefined; }
    if (c === '(') { i++; return list(); }
    if (c === '#') {
      i++; let v = 0;
      while (i < n) { const d = p.charCodeAt(i); if (d < 48 || d > 57) break; v = v * 10 + (d - 48); i++; }
      return { k: REF, v };
    }
    if (c === "'") {
      i++; const start = i;
      for (;;) {
        if (i >= n) break;
        if (p[i] === "'") { if (p[i + 1] === "'") { i += 2; continue; } break; }
        i++;
      }
      const raw = p.slice(start, i); i++;
      return { k: STR, v: decodeIfcString(raw) };
    }
    if (c === '.') {
      const end = p.indexOf('.', i + 1);
      const v = p.slice(i + 1, end < 0 ? n : end);
      i = (end < 0 ? n : end + 1);
      return { k: ENUM, v };
    }
    if (/[A-Za-z_]/.test(c)) {                 // IFCLABEL(...), IFCINTEGER(...)
      const start = i;
      while (i < n && /[A-Za-z0-9_]/.test(p[i])) i++;
      const name = p.slice(start, i);
      skip();
      if (i < n && p[i] === '(') { i++; const inner = list(); return { k: TYPED, t: name, v: inner.length === 1 ? inner[0] : inner }; }
      return { k: ENUM, v: name };
    }
    // número
    const start = i;
    while (i < n && /[0-9eE+\-.]/.test(p[i])) i++;
    const num = parseFloat(p.slice(start, i));
    if (isNaN(num)) { if (i === start) i++; return null; }
    return num;
  }

  const out = [];
  skip();
  if (n === 0) return out;
  for (;;) {
    out.push(value());
    skip();
    if (i >= n) break;
    if (p[i] === ',') { i++; continue; }
    i++;
    if (i >= n) break;
  }
  return out;
}

/* ---------- 4. Modelo ---------- */
class IfcModel {
  constructor(text, onProgress) {
    this.ents = tokenizeStep(text, onProgress);
    this._cache = new Map();
    this.lengthScale = 1;      // fator para metros
    this._readUnits();
    this._index();
  }

  type(id) { const e = this.ents.get(id); return e ? e.t : null; }

  args(id) {
    let a = this._cache.get(id);
    if (a === undefined) {
      const e = this.ents.get(id);
      a = e ? parseParams(e.p) : null;
      this._cache.set(id, a);
    }
    return a;
  }

  // helpers de leitura
  ref(v) { return v && v.k === REF ? v.v : 0; }
  str(v) {
    if (v == null) return '';
    if (v.k === STR) return v.v;
    if (v.k === ENUM) return v.v;
    if (v.k === TYPED) return this.str(v.v);
    return String(v);
  }
  num(v) {
    if (typeof v === 'number') return v;
    if (v && v.k === TYPED) return this.num(v.v);
    return NaN;
  }
  refs(v) { return Array.isArray(v) ? v.filter(x => x && x.k === REF).map(x => x.v) : []; }

  /* --- unidades --- */
  _readUnits() {
    const PREFIX = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 100, DECA: 10, DECI: .1, CENTI: .01, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9 };
    for (const [id, e] of this.ents) {
      if (e.t !== 'IFCSIUNIT') continue;
      const a = this.args(id);
      if (this.str(a[1]) !== 'LENGTHUNIT') continue;
      const pref = this.str(a[2]);
      this.lengthScale = (PREFIX[pref] || 1);
      this.unitName = (pref ? pref.toLowerCase() : '') + 'metro';
      return;
    }
    // IFCCONVERSIONBASEDUNIT (pés, polegadas)
    for (const [id, e] of this.ents) {
      if (e.t !== 'IFCCONVERSIONBASEDUNIT') continue;
      const a = this.args(id);
      if (this.str(a[1]) !== 'LENGTHUNIT') continue;
      const mw = this.args(this.ref(a[3]));
      if (mw) { this.lengthScale = this.num(mw[0]); this.unitName = this.str(a[2]); }
      return;
    }
  }

  /* --- índices de relacionamentos --- */
  _index() {
    this.psetsOf = new Map();      // elemento -> [idsPropertySet]
    this.typeOf = new Map();       // elemento -> idTipo
    this.groupsOf = new Map();     // elemento -> [idGrupo]
    this.storeyOf = new Map();     // elemento -> idPavimento
    this.materialOf = new Map();   // elemento -> idMaterial
    this.portsOf = new Map();      // elemento -> [idPorta]
    this.portOwner = new Map();    // porta -> elemento
    this.portLink = new Map();     // porta -> porta
    this.styleOfItem = new Map();  // item geométrico -> cor
    this.elementIds = [];

    const push = (m, k, v) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };

    for (const [id, e] of this.ents) {
      const t = e.t;
      switch (t) {
        case 'IFCRELDEFINESBYPROPERTIES': {
          const a = this.args(id);
          const ps = this.ref(a[5]);
          for (const o of this.refs(a[4])) push(this.psetsOf, o, ps);
          break;
        }
        case 'IFCRELDEFINESBYTYPE': {
          const a = this.args(id);
          const ty = this.ref(a[5]);
          for (const o of this.refs(a[4])) this.typeOf.set(o, ty);
          break;
        }
        case 'IFCRELASSIGNSTOGROUP': {
          const a = this.args(id);
          const g = this.ref(a[6]);
          for (const o of this.refs(a[4])) push(this.groupsOf, o, g);
          break;
        }
        case 'IFCRELCONTAINEDINSPATIALSTRUCTURE': {
          const a = this.args(id);
          const st = this.ref(a[5]);
          for (const o of this.refs(a[4])) this.storeyOf.set(o, st);
          break;
        }
        case 'IFCRELASSOCIATESMATERIAL': {
          const a = this.args(id);
          const m = this.ref(a[5]);
          for (const o of this.refs(a[4])) this.materialOf.set(o, m);
          break;
        }
        case 'IFCRELCONNECTSPORTTOELEMENT': {
          const a = this.args(id);
          const port = this.ref(a[4]), el = this.ref(a[5]);
          push(this.portsOf, el, port); this.portOwner.set(port, el);
          break;
        }
        case 'IFCRELCONNECTSPORTS': {
          const a = this.args(id);
          const p1 = this.ref(a[4]), p2 = this.ref(a[5]);
          this.portLink.set(p1, p2); this.portLink.set(p2, p1);
          break;
        }
        case 'IFCSTYLEDITEM': {
          const a = this.args(id);
          const item = this.ref(a[0]);
          const col = this._colorFromStyles(this.refs(a[1]));
          if (item && col) this.styleOfItem.set(item, col);
          break;
        }
        default:
          if (ELEMENT_TYPES.has(t)) this.elementIds.push(id);
      }
    }
  }

  _colorFromStyles(styleIds) {
    for (const sid of styleIds) {
      const t = this.type(sid);
      let list = [sid];
      if (t === 'IFCPRESENTATIONSTYLEASSIGNMENT') list = this.refs(this.args(sid)[0]);
      for (const s of list) {
        if (this.type(s) !== 'IFCSURFACESTYLE') continue;
        const sa = this.args(s);
        for (const r of this.refs(sa[2])) {
          if (this.type(r) !== 'IFCSURFACESTYLERENDERING') continue;
          const ra = this.args(r);
          const c = this.args(this.ref(ra[0]));
          if (!c) continue;
          const transp = this.num(ra[1]);
          return {
            r: this.num(c[1]), g: this.num(c[2]), b: this.num(c[3]),
            a: isNaN(transp) ? 1 : 1 - transp
          };
        }
      }
    }
    return null;
  }

  /* --- propriedades de um elemento --- */
  properties(id) {
    const out = {};
    const read = (owner) => {
      for (const ps of (this.psetsOf.get(owner) || [])) {
        if (this.type(ps) !== 'IFCPROPERTYSET') continue;
        const pa = this.args(ps);
        const setName = this.str(pa[2]);
        const bag = out[setName] || (out[setName] = {});
        for (const pid of this.refs(pa[4])) {
          const pt = this.type(pid);
          const p = this.args(pid);
          if (!p) continue;
          const name = this.str(p[0]);
          if (pt === 'IFCPROPERTYSINGLEVALUE') {
            const v = p[2];
            bag[name] = { value: v && v.k === TYPED ? this.str(v.v) : this.str(v), raw: v, num: this.num(v) };
          } else if (pt === 'IFCPROPERTYENUMERATEDVALUE' || pt === 'IFCPROPERTYLISTVALUE') {
            const vals = (Array.isArray(p[2]) ? p[2] : [p[2]]).map(x => this.str(x && x.k === TYPED ? x.v : x));
            bag[name] = { value: vals.join(', ') };
          }
        }
      }
    };
    read(id);
    const ty = this.typeOf.get(id);
    if (ty) read(ty);
    return out;
  }
}

/* tipos tratados como elementos visíveis */
const ELEMENT_TYPES = new Set(['IFCFLOWSEGMENT', 'IFCFLOWFITTING', 'IFCFLOWTERMINAL', 'IFCFLOWCONTROLLER',
  'IFCFLOWMOVINGDEVICE', 'IFCFLOWSTORAGEDEVICE', 'IFCFLOWTREATMENTDEVICE', 'IFCENERGYCONVERSIONDEVICE',
  'IFCDISTRIBUTIONELEMENT', 'IFCDISTRIBUTIONFLOWELEMENT', 'IFCDISTRIBUTIONCONTROLELEMENT',
  'IFCPIPESEGMENT', 'IFCPIPEFITTING', 'IFCDUCTSEGMENT', 'IFCDUCTFITTING', 'IFCVALVE', 'IFCPUMP', 'IFCTANK',
  'IFCFILTER', 'IFCSANITARYTERMINAL', 'IFCAIRTERMINAL', 'IFCWASTETERMINAL', 'IFCFIRESUPPRESSIONTERMINAL',
  'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCSLAB', 'IFCBEAM', 'IFCCOLUMN', 'IFCDOOR', 'IFCWINDOW', 'IFCROOF',
  'IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCRAMP', 'IFCRAILING', 'IFCCOVERING', 'IFCPLATE', 'IFCMEMBER',
  'IFCFOOTING', 'IFCPILE', 'IFCBUILDINGELEMENTPROXY', 'IFCFURNISHINGELEMENT', 'IFCCURTAINWALL',
  'IFCREINFORCINGBAR', 'IFCCHIMNEY', 'IFCSHADINGDEVICE', 'IFCOPENINGELEMENT',
  'IFCCABLECARRIERSEGMENT', 'IFCCABLECARRIERFITTING', 'IFCCABLESEGMENT', 'IFCCABLEFITTING',
  'IFCELECTRICAPPLIANCE', 'IFCLIGHTFIXTURE', 'IFCOUTLET', 'IFCSWITCHINGDEVICE', 'IFCJUNCTIONBOX',
  'IFCMECHANICALFASTENER', 'IFCDISCRETEACCESSORY', 'IFCELEMENTASSEMBLY', 'IFCSPACE']);

/* ---------- 5. Geometria: matrizes 4x4 (column-major, estilo three.js) ---------- */
function matIdentity() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }

function matMul(a, b) {               // a * b
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}

function matFromAxes(x, y, z, t) {
  return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, t[0], t[1], t[2], 1];
}

function applyMat(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
  ];
}

const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function vnorm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

/* ---------- 6. Extração de geometria ---------- */
class GeometryReader {
  constructor(model) {
    this.m = model;
    this.scale = model.lengthScale;      // para metros
    this.mapCache = new Map();
  }

  point(id) { const a = this.m.args(id); return a ? (a[0] || []).map(v => this.m.num(v)) : [0, 0, 0]; }
  dir(id) { const a = this.m.args(id); return a ? (a[0] || []).map(v => this.m.num(v)) : [0, 0, 1]; }

  placement3d(id) {                      // IFCAXIS2PLACEMENT3D -> matriz
    const a = this.m.args(id);
    if (!a) return matIdentity();
    const loc = this.point(this.m.ref(a[0]));
    let z = a[1] ? vnorm(this.dir(this.m.ref(a[1]))) : [0, 0, 1];
    let x = a[2] ? this.dir(this.m.ref(a[2])) : [1, 0, 0];
    // ortogonaliza x em relação a z
    const d = vdot(x, z);
    x = vnorm([x[0] - d * z[0], x[1] - d * z[1], x[2] - d * z[2]]);
    if (!isFinite(x[0]) || Math.hypot(x[0], x[1], x[2]) < 1e-9) x = Math.abs(z[2]) < .9 ? vnorm(vcross([0, 0, 1], z)) : [1, 0, 0];
    const y = vcross(z, x);
    return matFromAxes(x, y, z, [loc[0] || 0, loc[1] || 0, loc[2] || 0]);
  }

  placement2d(id) {                      // IFCAXIS2PLACEMENT2D -> matriz 3D no plano XY
    const a = this.m.args(id);
    if (!a) return matIdentity();
    const loc = this.point(this.m.ref(a[0]));
    let x = a[1] ? this.dir(this.m.ref(a[1])) : [1, 0];
    x = vnorm([x[0] || 0, x[1] || 0, 0]);
    const y = [-x[1], x[0], 0];
    return matFromAxes(x, y, [0, 0, 1], [loc[0] || 0, loc[1] || 0, 0]);
  }

  localPlacement(id) {                   // IFCLOCALPLACEMENT -> matriz acumulada
    let m = matIdentity();
    let cur = id, guard = 0;
    const chain = [];
    while (cur && guard++ < 64) {
      const t = this.m.type(cur);
      if (t !== 'IFCLOCALPLACEMENT') break;
      const a = this.m.args(cur);
      chain.push(this.m.ref(a[1]));
      cur = this.m.ref(a[0]);
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      const rel = chain[i];
      const rt = this.m.type(rel);
      const lm = rt === 'IFCAXIS2PLACEMENT2D' ? this.placement2d(rel) : this.placement3d(rel);
      m = matMul(m, lm);
    }
    return m;
  }

  /* devolve { positions:Float32Array, indices:Uint32Array } em metros */
  elementGeometry(elId) {
    const a = this.m.args(elId);
    if (!a) return null;
    const placeId = this.m.ref(a[5]);
    const repId = this.m.ref(a[6]);
    if (!repId) return null;
    const base = this.localPlacement(placeId);

    // leaves: um registro por sólido de folha (faixa de vértices e de índices),
    // para que o construtor possa separar partes de um mesmo elemento
    const out = { pos: [], idx: [], colors: [], leaves: [] };
    const repA = this.m.args(repId);
    if (!repA) return null;
    for (const sr of this.m.refs(repA[2])) {
      if (this.m.type(sr) !== 'IFCSHAPEREPRESENTATION') continue;
      const sa = this.m.args(sr);
      const ident = this.m.str(sa[1]);
      if (ident && ident !== 'Body') continue;          // só o sólido
      for (const item of this.m.refs(sa[3])) this.item(item, base, out);
    }
    if (!out.idx.length) return null;
    return out;
  }

  /* registra cada sólido de folha; mapeamentos, estilos e booleanas só repassam */
  item(id, mat, out) {
    const t = this.m.type(id);
    if (!out.leaves || t === 'IFCMAPPEDITEM' || t === 'IFCSTYLEDITEM' ||
        t === 'IFCBOOLEANCLIPPINGRESULT' || t === 'IFCBOOLEANRESULT') return this._item(id, mat, out);
    const v0 = out.pos.length / 3, i0 = out.idx.length;
    this._item(id, mat, out);
    if (out.idx.length > i0) out.leaves.push({ id, v0, v1: out.pos.length / 3, i0, i1: out.idx.length });
  }

  _item(id, mat, out) {
    const t = this.m.type(id);
    const a = this.m.args(id);
    if (!a) return;
    switch (t) {
      case 'IFCMAPPEDITEM': {
        const src = this.m.ref(a[0]);
        const target = this.m.ref(a[1]);
        const sa = this.m.args(src);
        if (!sa) return;
        const originM = this.placement3d(this.m.ref(sa[0]));
        const tm = this.transformOperator(target);
        const inner = matMul(matMul(mat, tm), originM);
        const mapped = this.m.ref(sa[1]);
        const ma = this.m.args(mapped);
        if (!ma) return;
        for (const mi of this.m.refs(ma[3] !== undefined ? ma[3] : ma[2])) this.item(mi, inner, out);
        break;
      }
      case 'IFCSTYLEDITEM':
        this.item(this.m.ref(a[0]), mat, out); break;
      case 'IFCEXTRUDEDAREASOLID':
        this.extruded(id, mat, out); break;
      case 'IFCFACETEDBREP':
        this.faceSet(this.m.refs(this.m.args(this.m.ref(a[0]))[0]), mat, out, id); break;
      case 'IFCFACEBASEDSURFACEMODEL': {
        for (const cfs of this.m.refs(a[0])) {
          const ca = this.m.args(cfs);
          if (ca) this.faceSet(this.m.refs(ca[0]), mat, out, id);
        }
        break;
      }
      case 'IFCSHELLBASEDSURFACEMODEL': {
        for (const sh of this.m.refs(a[0])) {
          const ca = this.m.args(sh);
          if (ca) this.faceSet(this.m.refs(ca[0]), mat, out, id);
        }
        break;
      }
      case 'IFCBOOLEANCLIPPINGRESULT':
      case 'IFCBOOLEANRESULT':
        this.item(this.m.ref(a[1]), mat, out); break;      // aproxima pelo primeiro operando
      default: break;
    }
  }

  transformOperator(id) {
    const t = this.m.type(id);
    if (!t || t.indexOf('IFCCARTESIANTRANSFORMATIONOPERATOR') !== 0) return matIdentity();
    const a = this.m.args(id);
    const loc = this.point(this.m.ref(a[2]));
    let x = a[0] ? this.dir(this.m.ref(a[0])) : [1, 0, 0];
    let y = a[1] ? this.dir(this.m.ref(a[1])) : null;
    const s = isNaN(this.m.num(a[3])) ? 1 : this.m.num(a[3]);
    let z = a[4] ? this.dir(this.m.ref(a[4])) : null;
    x = vnorm([x[0] || 0, x[1] || 0, x[2] || 0]);
    if (!y) { z = z || [0, 0, 1]; y = vnorm(vcross(vnorm(z), x)); }
    else { y = vnorm([y[0] || 0, y[1] || 0, y[2] || 0]); }
    if (!z) z = vcross(x, y); else z = vnorm([z[0] || 0, z[1] || 0, z[2] || 0]);
    return matFromAxes([x[0] * s, x[1] * s, x[2] * s], [y[0] * s, y[1] * s, y[2] * s], [z[0] * s, z[1] * s, z[2] * s],
      [loc[0] || 0, loc[1] || 0, loc[2] || 0]);
  }

  /* --- perfil 2D -> lista de pontos [x,y] --- */
  profilePoints(id) {
    const t = this.m.type(id);
    const a = this.m.args(id);
    if (!a) return null;
    const SEG = 20;
    let pts = null, posId = 0;
    if (t === 'IFCCIRCLEPROFILEDEF' || t === 'IFCCIRCLEHOLLOWPROFILEDEF') {
      const r = this.m.num(a[3]);
      posId = this.m.ref(a[2]);
      pts = [];
      for (let k = 0; k < SEG; k++) { const ang = k / SEG * Math.PI * 2; pts.push([r * Math.cos(ang), r * Math.sin(ang)]); }
    } else if (t === 'IFCRECTANGLEPROFILEDEF' || t === 'IFCRECTANGLEHOLLOWPROFILEDEF') {
      const X = this.m.num(a[3]) / 2, Y = this.m.num(a[4]) / 2;
      posId = this.m.ref(a[2]);
      pts = [[-X, -Y], [X, -Y], [X, Y], [-X, Y]];
    } else if (t === 'IFCARBITRARYCLOSEDPROFILEDEF' || t === 'IFCARBITRARYPROFILEDEFWITHVOIDS') {
      pts = this.curvePoints(this.m.ref(a[2]));
    } else if (t === 'IFCDERIVEDPROFILEDEF') {
      const base = this.profilePoints(this.m.ref(a[2]));
      if (!base) return null;
      const op = this.transformOperator(this.m.ref(a[3]));
      return base.map(p => { const q = applyMat(op, [p[0], p[1], 0]); return [q[0], q[1]]; });
    } else if (t === 'IFCIPROFILEDEF' || t === 'IFCTPROFILEDEF' || t === 'IFCLPROFILEDEF' ||
      t === 'IFCUPROFILEDEF' || t === 'IFCCSHAPEPROFILEDEF' || t === 'IFCZSHAPEPROFILEDEF') {
      // aproximação por retângulo envolvente
      const w = this.m.num(a[4]) || this.m.num(a[3]) || 0, h = this.m.num(a[3]) || 0;
      pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    }
    if (!pts) return null;
    if (posId) {
      const pm = this.placement2d(posId);
      pts = pts.map(p => { const q = applyMat(pm, [p[0], p[1], 0]); return [q[0], q[1]]; });
    }
    return pts;
  }

  curvePoints(id) {
    const t = this.m.type(id);
    const a = this.m.args(id);
    if (!a) return null;
    if (t === 'IFCPOLYLINE') return this.m.refs(a[0]).map(p => { const q = this.point(p); return [q[0] || 0, q[1] || 0]; });
    if (t === 'IFCCOMPOSITECURVE') {
      const out = [];
      for (const segId of this.m.refs(a[0])) {
        const sa = this.m.args(segId);
        if (!sa) continue;
        const sub = this.curvePoints(this.m.ref(sa[2]));
        const sameSense = this.m.str(sa[1]) !== 'F';
        if (sub) { const s = sameSense ? sub : sub.slice().reverse(); for (const p of s) out.push(p); }
      }
      return out.length ? out : null;
    }
    if (t === 'IFCTRIMMEDCURVE') {
      const basis = this.m.ref(a[0]);
      if (this.m.type(basis) !== 'IFCCIRCLE') return null;
      const ca = this.m.args(basis);
      const r = this.m.num(ca[1]);
      const pm = this.placement2d(this.m.ref(ca[0]));
      const t1 = this.trimAngle(a[1]), t2 = this.trimAngle(a[2]);
      const ccw = this.m.str(a[4]) !== 'F';
      let s = t1, e = t2;
      if (isNaN(s) || isNaN(e)) return null;
      if (ccw) { while (e < s) e += 360; } else { while (e > s) e -= 360; }
      const N = Math.max(4, Math.ceil(Math.abs(e - s) / 12));
      const out = [];
      for (let k = 0; k <= N; k++) {
        const ang = (s + (e - s) * k / N) * Math.PI / 180;
        const q = applyMat(pm, [r * Math.cos(ang), r * Math.sin(ang), 0]);
        out.push([q[0], q[1]]);
      }
      return out;
    }
    if (t === 'IFCCIRCLE') {
      const r = this.m.num(a[1]);
      const pm = this.placement2d(this.m.ref(a[0]));
      const out = [];
      for (let k = 0; k < 24; k++) { const ang = k / 24 * Math.PI * 2; const q = applyMat(pm, [r * Math.cos(ang), r * Math.sin(ang), 0]); out.push([q[0], q[1]]); }
      return out;
    }
    return null;
  }

  trimAngle(v) {
    const list = Array.isArray(v) ? v : [v];
    for (const x of list) {
      if (x && x.k === TYPED && /PARAMETERVALUE/i.test(x.t)) return this.m.num(x.v);
      if (typeof x === 'number') return x;
    }
    return NaN;
  }

  extruded(id, mat, out) {
    const a = this.m.args(id);
    const pts = this.profilePoints(this.m.ref(a[0]));
    if (!pts || pts.length < 3) return;
    const pos = this.placement3d(this.m.ref(a[1]));
    const d = this.dir(this.m.ref(a[2]));
    const depth = this.m.num(a[3]);
    if (!isFinite(depth)) return;
    const M = matMul(mat, pos);
    const ext = [(d[0] || 0) * depth, (d[1] || 0) * depth, (d[2] || 0) * depth];
    const n = pts.length;
    const base = out.pos.length / 3;
    const s = this.scale;
    const put = (x, y, z) => { const q = applyMat(M, [x, y, z]); out.pos.push(q[0] * s, q[1] * s, q[2] * s); };
    // anéis das laterais (0..n-1 base, n..2n-1 topo)
    for (const p of pts) put(p[0], p[1], 0);
    for (const p of pts) put(p[0] + ext[0], p[1] + ext[1], ext[2]);
    // anéis duplicados para as tampas (2n.. e 3n..) -> normais planas corretas
    for (const p of pts) put(p[0], p[1], 0);
    for (const p of pts) put(p[0] + ext[0], p[1] + ext[1], ext[2]);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      out.idx.push(base + i, base + j, base + n + j, base + i, base + n + j, base + n + i);
    }
    const c0 = base + 2 * n, c1 = base + 3 * n;
    for (let i = 1; i < n - 1; i++) {
      out.idx.push(c0, c0 + i + 1, c0 + i);
      out.idx.push(c1, c1 + i, c1 + i + 1);
    }
  }

  faceSet(faceIds, mat, out, styleOwner) {
    const s = this.scale;
    for (const fId of faceIds) {
      if (this.m.type(fId) !== 'IFCFACE') continue;
      const fa = this.m.args(fId);
      if (!fa) continue;
      for (const bId of this.m.refs(fa[0])) {
        const bt = this.m.type(bId);
        if (bt !== 'IFCFACEOUTERBOUND' && bt !== 'IFCFACEBOUND') continue;
        if (bt === 'IFCFACEBOUND') continue;          // furo: ignorado
        const ba = this.m.args(bId);
        const loopId = this.m.ref(ba[0]);
        if (this.m.type(loopId) !== 'IFCPOLYLOOP') continue;
        const orient = this.m.str(ba[1]) !== 'F';
        const ptIds = this.m.refs(this.m.args(loopId)[0]);
        if (ptIds.length < 3) continue;
        const base = out.pos.length / 3;
        for (const pid of ptIds) {
          const p = this.point(pid);
          const q = applyMat(mat, [p[0] || 0, p[1] || 0, p[2] || 0]);
          out.pos.push(q[0] * s, q[1] * s, q[2] * s);
        }
        const n = ptIds.length;
        for (let i = 1; i < n - 1; i++) {
          if (orient) out.idx.push(base, base + i, base + i + 1);
          else out.idx.push(base, base + i + 1, base + i);
        }
      }
    }
  }

  /* eixo do tubo (para comprimento e diâmetro): primeiro extrudado circular */
  pipeAxis(elId) {
    const a = this.m.args(elId);
    if (!a) return null;
    const repId = this.m.ref(a[6]);
    const repA = this.m.args(repId);
    if (!repA) return null;
    const base = this.localPlacement(this.m.ref(a[5]));
    for (const sr of this.m.refs(repA[2])) {
      if (this.m.type(sr) !== 'IFCSHAPEREPRESENTATION') continue;
      const sa = this.m.args(sr);
      for (const item of this.m.refs(sa[3])) {
        const r = this._axisOf(item, base);
        if (r) return r;
      }
    }
    return null;
  }

  _axisOf(item, mat) {
    const t = this.m.type(item);
    const a = this.m.args(item);
    if (!a) return null;
    if (t === 'IFCSTYLEDITEM') return this._axisOf(this.m.ref(a[0]), mat);
    if (t === 'IFCMAPPEDITEM') {
      const sa = this.m.args(this.m.ref(a[0]));
      if (!sa) return null;
      const inner = matMul(matMul(mat, this.transformOperator(this.m.ref(a[1]))), this.placement3d(this.m.ref(sa[0])));
      const ma = this.m.args(this.m.ref(sa[1]));
      if (!ma) return null;
      for (const mi of this.m.refs(ma[3] !== undefined ? ma[3] : ma[2])) {
        const r = this._axisOf(mi, inner);
        if (r) return r;
      }
      return null;
    }
    if (t !== 'IFCEXTRUDEDAREASOLID') return null;
    const profId = this.m.ref(a[0]);
    const pt = this.m.type(profId);
    const pa = this.m.args(profId);
    const M = matMul(mat, this.placement3d(this.m.ref(a[1])));
    const d = this.dir(this.m.ref(a[2]));
    const depth = this.m.num(a[3]);
    const s = this.scale;
    const p0 = applyMat(M, [0, 0, 0]);
    const p1 = applyMat(M, [(d[0] || 0) * depth, (d[1] || 0) * depth, (d[2] || 0) * depth]);
    const res = {
      start: [p0[0] * s, p0[1] * s, p0[2] * s],
      end: [p1[0] * s, p1[1] * s, p1[2] * s],
      length: Math.abs(depth) * s,
      profileName: this.m.str(pa[1]),
      profileType: pt
    };
    if (pt === 'IFCCIRCLEPROFILEDEF') res.diameter = this.m.num(pa[3]) * 2 * s;
    else if (pt === 'IFCCIRCLEHOLLOWPROFILEDEF') { res.diameter = this.m.num(pa[3]) * 2 * s; res.wall = this.m.num(pa[4]) * s; }
    else if (pt === 'IFCRECTANGLEPROFILEDEF') { res.width = this.m.num(pa[3]) * s; res.height = this.m.num(pa[4]) * s; }
    return res;
  }
}

if (typeof module !== 'undefined') module.exports = { IfcModel, GeometryReader, ELEMENT_TYPES, matIdentity, matMul, applyMat };
