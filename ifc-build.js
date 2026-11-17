/* ============================================================
   ifc-build.js — camada de engenharia sobre o leitor IFC
   Extrai: diâmetro, tipo de tubo, sistema, pavimento, material
   e monta a geometria unificada para o visualizador.
   ============================================================ */

const CATEGORIA = {
  IFCFLOWSEGMENT: 'Tubo',
  IFCPIPESEGMENT: 'Tubo',
  IFCDUCTSEGMENT: 'Duto',
  IFCFLOWFITTING: 'Conexão',
  IFCPIPEFITTING: 'Conexão',
  IFCDUCTFITTING: 'Conexão',
  IFCFLOWTERMINAL: 'Dispositivo terminal',
  IFCFLOWCONTROLLER: 'Registro / controle',
  IFCVALVE: 'Registro / controle',
  IFCFLOWMOVINGDEVICE: 'Bomba / motobomba',
  IFCPUMP: 'Bomba / motobomba',
  IFCFLOWTREATMENTDEVICE: 'Filtro / tratamento',
  IFCFILTER: 'Filtro / tratamento',
  IFCFLOWSTORAGEDEVICE: 'Reservatório',
  IFCTANK: 'Reservatório',
  IFCENERGYCONVERSIONDEVICE: 'Trocador / aquecimento',
  IFCDISTRIBUTIONCONTROLELEMENT: 'Controle / automação',
  IFCDISTRIBUTIONELEMENT: 'Elemento de instalação',
  IFCDISTRIBUTIONFLOWELEMENT: 'Elemento de instalação',
  IFCCABLECARRIERSEGMENT: 'Eletroduto / calha',
  IFCCABLECARRIERFITTING: 'Conexão de eletroduto',
  IFCCABLESEGMENT: 'Cabo',
  IFCLIGHTFIXTURE: 'Luminária',
  IFCELECTRICAPPLIANCE: 'Equipamento elétrico',
  IFCOUTLET: 'Tomada',
  IFCJUNCTIONBOX: 'Caixa de passagem',
  IFCSANITARYTERMINAL: 'Louça / metal sanitário',
  IFCWASTETERMINAL: 'Ralo / caixa',
  IFCSLAB: 'Piso / laje',
  IFCWALL: 'Parede',
  IFCWALLSTANDARDCASE: 'Parede',
  IFCBEAM: 'Viga',
  IFCCOLUMN: 'Pilar',
  IFCFOOTING: 'Fundação',
  IFCBUILDINGELEMENTPROXY: 'Elemento genérico',
  IFCFURNISHINGELEMENT: 'Mobiliário',
  IFCSPACE: 'Ambiente'
};

/* categorias em que o perfil extrudado é, de fato, a bitola do elemento */
const PERFIL_E_BITOLA = new Set(['Tubo', 'Duto', 'Eletroduto / calha', 'Cabo',
  'Registro / controle', 'Conexão', 'Conexão de eletroduto']);

const FONTE_DN = {
  geom: 'geometria (perfil circular)',
  geomRet: 'geometria (perfil retangular)',
  porta: 'porta conectada',
  pset: 'propriedade do IFC',
  nome: 'nome do tipo'
};

function splitFamilyType(s) {
  if (!s) return ['', ''];
  const i = s.indexOf(':');
  if (i < 0) return [s, ''];
  return [s.slice(0, i), s.slice(i + 1)];
}

function dnFromName(s) {
  if (!s) return 0;
  const m = s.match(/(\d{2,3})\s*mm/i);
  if (m) { const v = +m[1]; if (v >= 15 && v <= 600) return v; }
  return 0;
}

function propLookup(props, names) {
  for (const set of Object.keys(props)) {
    for (const key of Object.keys(props[set])) {
      const k = key.toLowerCase();
      for (const want of names) if (k === want || k.replace(/[\s_]/g, '') === want) return props[set][key];
    }
  }
  return null;
}

async function buildIfcModel(text, onProgress) {
  const report = async (frac, label) => { if (onProgress) await onProgress(frac, label); };

  await report(0.02, 'Lendo o arquivo IFC');
  const m = new IfcModel(text, f => { if (onProgress) onProgress(0.02 + f * 0.25, 'Lendo o arquivo IFC'); });
  const g = new GeometryReader(m);

  await report(0.3, 'Identificando sistemas');

  /* ---- sistemas (IfcSystem via IfcRelAssignsToGroup) ---- */
  const sysInfo = new Map();
  for (const [id, e] of m.ents) {
    if (e.t !== 'IFCSYSTEM' && e.t !== 'IFCDISTRIBUTIONSYSTEM' && e.t !== 'IFCGROUP' && e.t !== 'IFCZONE') continue;
    const a = m.args(id);
    const nome = m.str(a[2]);
    const classe = m.str(a[4]) || nome.replace(/\s+\d+$/, '');
    sysInfo.set(id, { nome, classe, tipo: e.t });
  }

  /* ---- cores nativas por material ---- */
  const matColor = new Map(), matName = new Map();
  for (const [id, e] of m.ents) {
    if (e.t === 'IFCMATERIAL') matName.set(id, m.str(m.args(id)[0]));
    else if (e.t === 'IFCMATERIALDEFINITIONREPRESENTATION') {
      const a = m.args(id);
      const mat = m.ref(a[3]);
      for (const rep of m.refs(a[2])) {
        const ra = m.args(rep);
        if (!ra) continue;
        for (const it of m.refs(ra[3])) {
          if (m.type(it) !== 'IFCSTYLEDITEM') continue;
          const c = m._colorFromStyles(m.refs(m.args(it)[1]));
          if (c) { matColor.set(mat, c); break; }
        }
      }
    }
  }
  const materialOfElement = (id) => {
    let mid = m.materialOf.get(id);
    if (!mid) { const ty = m.typeOf.get(id); if (ty) mid = m.materialOf.get(ty); }
    if (!mid) return { nome: '', cor: null };
    const t = m.type(mid);
    if (t === 'IFCMATERIALLIST') {
      const l = m.refs(m.args(mid)[0]);
      const nomes = l.map(x => matName.get(x)).filter(Boolean);
      return { nome: nomes.join(' + '), cor: matColor.get(l[0]) || null };
    }
    if (t === 'IFCMATERIALLAYERSETUSAGE' || t === 'IFCMATERIALLAYERSET') {
      return { nome: matName.get(mid) || '', cor: null };
    }
    return { nome: matName.get(mid) || '', cor: matColor.get(mid) || null };
  };

  await report(0.34, 'Extraindo parâmetros dos elementos');

  /* ---- elementos ---- */
  const elements = [];
  const byId = new Map();
  const ids = m.elementIds;

  for (let k = 0; k < ids.length; k++) {
    const id = ids[k];
    const a = m.args(id);
    const ifcType = m.type(id);
    const objType = m.str(a[4]);
    const nome = m.str(a[2]);
    const [familia, tipo] = splitFamilyType(objType || nome);
    const props = m.properties(id);

    // tipo declarado (IfcRelDefinesByType)
    let tipoIfc = '';
    const tyId = m.typeOf.get(id);
    if (tyId) { tipoIfc = m.type(tyId); }

    // sistemas
    const sistemas = (m.groupsOf.get(id) || []).map(x => sysInfo.get(x)).filter(Boolean);

    // pavimento
    const stId = m.storeyOf.get(id);
    const pavimento = stId ? m.str(m.args(stId)[2]) : '';

    const mat = materialOfElement(id);
    const fab = propLookup(props, ['manufacturer', 'fabricante']);

    const el = {
      i: elements.length,
      id, ifcType,
      guid: m.str(a[0]),
      categoria: CATEGORIA[ifcType] || ifcType.replace(/^IFC/, ''),
      familia, tipo,
      objType,
      tag: m.str(a[7]),
      tipoIfc,
      sistema: sistemas.length ? sistemas[0].nome : '',
      sistemaClasse: sistemas.length ? sistemas[0].classe : '(sem sistema)',
      sistemas: sistemas.map(s => s.nome),
      pavimento: pavimento || '(sem pavimento)',
      material: mat.nome,
      corNativa: mat.cor,
      fabricante: fab ? fab.value : '',
      props,
      dn: 0, dnFonte: '', dnPortas: [],
      comprimento: 0,
      largura: 0, altura: 0, parede: 0,
      eixo: null
    };

    // ---- diâmetro e comprimento pela geometria ----
    // O perfil extrudado só vale como bitola em elementos lineares de rede.
    // Em dispositivos e lajes o primeiro sólido é parte do corpo, não a conexão.
    const perfilEBitola = PERFIL_E_BITOLA.has(el.categoria);
    const ax = g.pipeAxis(id);
    if (ax) {
      el.eixo = { ini: ax.start, fim: ax.end };
      el.linear = perfilEBitola;
      if (perfilEBitola) el.comprimento = ax.length;
      el.extrusao = ax.length;
      el.perfil = ax.profileName;
      if (perfilEBitola) {
        if (ax.diameter) { el.dn = Math.round(ax.diameter * 1000); el.dnFonte = 'geom'; }
        else if (ax.width) { el.largura = ax.width * 1000; el.altura = ax.height * 1000; el.dnFonte = 'geomRet'; }
        if (ax.wall) el.parede = ax.wall * 1000;
      }
    }
    // ---- comprimento / diâmetro por propriedade (complemento) ----
    const pComp = propLookup(props, ['length', 'comprimento']);
    if (!el.comprimento && pComp && isFinite(pComp.num)) el.comprimento = pComp.num * m.lengthScale;
    if (!el.dn) {
      const pd = propLookup(props, ['nominaldiameter', 'diameter', 'diametro', 'outsidediameter', 'diametronominal']);
      if (pd && isFinite(pd.num) && pd.num > 0) {
        let v = pd.num * m.lengthScale * 1000;
        el.dn = Math.round(v); el.dnFonte = 'pset';
      }
    }
    elements.push(el);
    byId.set(id, el);
    if ((k & 63) === 0) await report(0.34 + k / ids.length * 0.18, 'Extraindo parâmetros dos elementos');
  }

  await report(0.53, 'Propagando diâmetros pelas conexões');

  /* ---- inferência de DN pelo grafo de portas ---- */
  const vizinhos = (el) => {
    const out = [];
    for (const p of (m.portsOf.get(el.id) || [])) {
      const q = m.portLink.get(p);
      if (!q) continue;
      const o = m.portOwner.get(q);
      if (o && o !== el.id && byId.has(o)) out.push(byId.get(o));
    }
    return out;
  };
  for (let pass = 0; pass < 4; pass++) {
    const novos = [];
    for (const el of elements) {
      if (el.dn) continue;
      const ds = vizinhos(el).map(o => o.dn).filter(d => d > 0);
      if (ds.length) novos.push([el, [...new Set(ds)].sort((x, y) => y - x)]);
    }
    if (!novos.length) break;
    for (const [el, ds] of novos) { el.dn = ds[0]; el.dnPortas = ds; el.dnFonte = 'porta'; }
  }
  // registra os DN das portas também para quem já tinha DN (reduções, tês)
  for (const el of elements) {
    if (el.dnPortas.length) continue;
    const ds = vizinhos(el).map(o => o.dn).filter(d => d > 0);
    const set = [...new Set(el.dn ? [el.dn, ...ds] : ds)].sort((x, y) => y - x);
    if (set.length > 1) el.dnPortas = set;
  }
  // último recurso: nome do tipo
  for (const el of elements) {
    if (el.dn) continue;
    const d = dnFromName(el.objType);
    if (d) { el.dn = d; el.dnFonte = 'nome'; }
  }

  await report(0.6, 'Montando a geometria');

  /* ---- geometria unificada ---- */
  let totalV = 0, totalI = 0;
  const parts = [];
  for (let k = 0; k < elements.length; k++) {
    const el = elements[k];
    const geo = g.elementGeometry(el.id);
    parts.push(geo);
    if (geo) { totalV += geo.pos.length / 3; totalI += geo.idx.length; }
    if ((k & 31) === 0) await report(0.6 + k / elements.length * 0.32, 'Montando a geometria');
  }

  const positions = new Float32Array(totalV * 3);
  const indices = new Uint32Array(totalI);
  const triElem = new Uint32Array(totalI / 3);
  let vo = 0, io = 0, to = 0;
  const bbox = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };

  for (let k = 0; k < elements.length; k++) {
    const el = elements[k], geo = parts[k];
    el.vStart = vo; el.iStart = io; el.vCount = 0; el.iCount = 0;
    if (!geo) continue;
    const nv = geo.pos.length / 3;
    // caixa envolvente de cada peça: usada no enquadramento e na âncora do zoom
    const emin = [Infinity, Infinity, Infinity], emax = [-Infinity, -Infinity, -Infinity];
    for (let j = 0; j < geo.pos.length; j++) {
      const v = geo.pos[j];
      positions[vo * 3 + j] = v;
      const axis = j % 3;
      if (v < bbox.min[axis]) bbox.min[axis] = v;
      if (v > bbox.max[axis]) bbox.max[axis] = v;
      if (v < emin[axis]) emin[axis] = v;
      if (v > emax[axis]) emax[axis] = v;
    }
    el.min = emin; el.max = emax;
    for (let j = 0; j < geo.idx.length; j++) indices[io + j] = geo.idx[j] + vo;
    for (let j = 0; j < geo.idx.length / 3; j++) triElem[to + j] = k;
    el.vCount = nv; el.iCount = geo.idx.length;
    vo += nv; io += geo.idx.length; to += geo.idx.length / 3;
    parts[k] = null;
  }

  await report(0.95, 'Calculando quantitativos');

  /* ---- listas para legendas e filtros ---- */
  const uniq = (arr) => [...new Set(arr)];
  const diametros = uniq(elements.filter(e => e.dn).map(e => e.dn)).sort((a, b) => a - b);
  const sistemas = uniq(elements.map(e => e.sistemaClasse)).sort();
  const tipos = uniq(elements.map(e => e.objType)).sort();
  const categorias = uniq(elements.map(e => e.categoria)).sort();
  const pavimentos = uniq(elements.map(e => e.pavimento)).sort();

  return {
    ifc: m, geo: g,
    elements, byId,
    positions, indices, triElem, bbox,
    diametros, sistemas, tipos, categorias, pavimentos,
    sysInfo,
    unidade: m.unitName || 'metro',
    schema: (text.match(/FILE_SCHEMA\(\('([^']+)'/) || [, '?'])[1],
    origem: (text.match(/FILE_NAME\('([^']*)'/) || [, ''])[1],
    aplicacao: (text.match(/'([^']*Revit[^']*)'\s*,\s*''\s*\)\s*;/) || [, ''])[1] ||
      (text.match(/FILE_NAME\([^;]*?'([^']*)','[^']*'\)/) || [, ''])[1],
    dataExport: (text.match(/FILE_NAME\('[^']*','([^']+)'/) || [, ''])[1]
  };
}

/* ---- quantitativos ---- */
function quantitativos(model, filtro) {
  const ativos = model.elements.filter(e => !filtro || filtro(e));
  const ehLin = (e) => e.categoria === 'Tubo' || e.categoria === 'Eletroduto / calha' || e.categoria === 'Duto';
  const tubos = ativos.filter(ehLin);

  // tubos: metros por sistema x DN
  const porSistemaDN = new Map();
  const porDN = new Map();
  for (const e of tubos) {
    const kDN = e.dn || 0;
    const d = porDN.get(kDN) || { dn: kDN, m: 0, ids: [] };
    d.m += e.comprimento; d.ids.push(e.i);
    porDN.set(kDN, d);
    const k = e.sistemaClasse + '\u0000' + kDN;
    const cur = porSistemaDN.get(k) || { sistema: e.sistemaClasse, dn: kDN, m: 0, n: 0, tipo: e.tipo, ids: [] };
    cur.m += e.comprimento; cur.n++; cur.ids.push(e.i);
    porSistemaDN.set(k, cur);
  }

  // conexões e dispositivos: contagem por tipo x DN, e o mesmo cruzado com o sistema
  const pecas = new Map();
  const pecasPorSistema = new Map();
  for (const e of ativos) {
    if (ehLin(e)) continue;
    const bitola = e.dnPortas.length > 1 ? e.dnPortas.join(' × ') : (e.dn ? String(e.dn) : '—');
    const base = {
      categoria: e.categoria, familia: e.familia, tipo: e.tipo, objType: e.objType, bitola
    };
    const k = e.objType + '\u0000' + bitola;
    const cur = pecas.get(k) || Object.assign({ n: 0, ids: [] }, base);
    cur.n++; cur.ids.push(e.i);
    pecas.set(k, cur);

    const ks = e.sistemaClasse + '\u0000' + k;
    const cs = pecasPorSistema.get(ks) || Object.assign({ sistema: e.sistemaClasse, n: 0, ids: [] }, base);
    cs.n++; cs.ids.push(e.i);
    pecasPorSistema.set(ks, cs);
  }

  return {
    totalM: tubos.reduce((s, e) => s + e.comprimento, 0),
    nElementos: ativos.length,
    porDN: [...porDN.values()].sort((a, b) => a.dn - b.dn),
    porSistemaDN: [...porSistemaDN.values()].sort((a, b) => a.sistema.localeCompare(b.sistema) || a.dn - b.dn),
    pecas: [...pecas.values()].sort((a, b) =>
      a.categoria.localeCompare(b.categoria) || a.objType.localeCompare(b.objType) || a.bitola.localeCompare(b.bitola)),
    pecasPorSistema: [...pecasPorSistema.values()].sort((a, b) =>
      a.sistema.localeCompare(b.sistema, 'pt-BR') || a.categoria.localeCompare(b.categoria) ||
      a.objType.localeCompare(b.objType) || a.bitola.localeCompare(b.bitola, 'pt-BR', { numeric: true }))
  };
}
