#!/usr/bin/env node
/**
 * md-to-json.mjs
 *
 * Convierte un .md de planeación semanal (formato Griky Fábrica) en una entrada
 * dentro de data/planeaciones/{semana}.json. Actualiza también el index.json.
 *
 * USO:
 *   node scripts/md-to-json.mjs ../avances/planeacion-18-de-may---22-de-may-sophia.md
 *
 * O desde la raíz del repo:
 *   node scripts/md-to-json.mjs ruta/al/archivo.md
 *
 * Detecta automáticamente el PM y la semana del contenido del .md.
 * Si la semana ya existe en data/planeaciones/, fusiona el PM nuevo conservando
 * los otros PMs ya cargados. Si el mismo PM ya existía, lo sobreescribe.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(REPO_ROOT, 'data', 'planeaciones');

// ── Mapping nombres → pmKey ─────────────────────────────────────────────────
const PM_KEY_FROM_NOMBRE = {
  'Margarita Rosales':'margarita', 'Sophia Pacheco':'sophia',
  'Marcela Osorio':'marcela', 'Juan Ochoa':'andres',
  'Jorge Osorio':'jorge', 'Jean Villamizar':'jean'
};

// Mapping tipos texto → códigos counts del sistema
const TIPO_TO_REC_ID = {
  // Video
  'video estándar':'vid_std', 'video estandar':'vid_std',
  'video avatar':'vid_ava',
  'video podcast':'vid_pod', 'podcast':'vid_pod',
  'video audiolibro':'vid_aud', 'audiolibro':'vid_aud',
  'video interactivo':'vid_int',
  'video premiere':'vid_pre', 'premiere':'vid_pre',
  'video web':'vid_web',
  'video pixar':'vid_pix',
  'video básico':'vid_bas', 'video basico':'vid_bas',
  // Multimedia
  'rise':'mul_ris',
  'infografía interactiva':'mul_inf', 'infografia interactiva':'mul_inf',
  'presentación interactiva':'mul_pre', 'presentacion interactiva':'mul_pre',
  'actividad interactiva':'mul_act',
  'storyline':'mul_sto',
  'genially':'mul_gen',
  'diseño plataforma':'mul_dis', 'diseno plataforma':'mul_dis',
  'video story':'mul_vst',
  // Gráfico
  'infografía':'gra_inf', 'infografia':'gra_inf', 'infografía estándar':'gra_inf', 'infografia estandar':'gra_inf',
  'pdf':'gra_pdf',
  'ebook':'gra_ebo',
  'banner':'gra_ban',
  'presentación estándar':'gra_pre', 'presentacion estandar':'gra_pre',
  // Implementación
  'disponibilización lms':'impl_lms', 'disponibilizacion lms':'impl_lms', 'disp. lms':'impl_lms'
};

// Mapping proyNombre → proyId
const PROY_ID_FROM_NOMBRE = {
  'ESAM':'esam', 'USS':'uss', 'Ibero México':'ibero_mexico',
  'U América':'u_america', 'Cinemark':'cinemark', 'ICami':'icami',
  'Politécnica':'politecnica', 'Indoamérica':'indoamerica',
  'UDLA':'udla', 'UMB':'umb', 'ESIC':'esic',
  'USAP':'usap', 'Externado':'externado', 'Cesún':'cesun',
  'Vértice':'vertice', 'EIA':'eia_lideres',
  'APUS':'apus_ingles', 'Universidad Europea':'ue'
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const MESES_ES = { ene:0, feb:1, mar:2, abr:3, may:4, jun:5, jul:6, ago:7, sep:8, oct:9, nov:10, dic:11 };

function parseFecha(diaStr, mesStr, year){
  const mes = MESES_ES[mesStr.toLowerCase().slice(0,3)];
  if(mes===undefined) throw new Error('Mes no reconocido: '+mesStr);
  return new Date(year, mes, parseInt(diaStr,10));
}

function fmtISO(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function isoWeek(d){
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay()+6)%7;
  target.setDate(target.getDate()-dayNr+3);
  const firstThursday = new Date(target.getFullYear(),0,4);
  const diff = (target - firstThursday)/86400000;
  return target.getFullYear() + '-W' + String(1 + Math.round((diff - 3 + (firstThursday.getDay()+6)%7)/7)).padStart(2,'0');
}

function slugProyId(nombre){
  if(PROY_ID_FROM_NOMBRE[nombre]) return PROY_ID_FROM_NOMBRE[nombre];
  return nombre.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
}

function recIdFromTipo(tipoStr){
  const t = tipoStr.toLowerCase().trim();
  if(TIPO_TO_REC_ID[t]) return TIPO_TO_REC_ID[t];
  // Fallback heurístico
  const norm = t.normalize('NFD').replace(/[̀-ͯ]/g,'');
  if(TIPO_TO_REC_ID[norm]) return TIPO_TO_REC_ID[norm];
  throw new Error('Tipo de recurso no reconocido: "'+tipoStr+'"');
}

// ── Parser principal ────────────────────────────────────────────────────────
function parseMd(mdContent){
  const lines = mdContent.split('\n');

  // Encabezado
  let pmNombre = null, semanaTexto = null, objetivo = '';
  for(const ln of lines){
    let m;
    if((m = ln.match(/^\*\*PM:\*\*\s+(.+)$/))) pmNombre = m[1].trim();
    if((m = ln.match(/^\*\*Semana:\*\*\s+(.+)$/))) semanaTexto = m[1].trim();
    if((m = ln.match(/^\*\*Objetivo:\*\*\s+(.+)$/))){
      const v = m[1].trim();
      if(v && v !== '—' && v !== '-') objetivo = v;
    }
  }
  if(!pmNombre) throw new Error('No se encontró el PM en el .md (busqué "**PM:** Nombre")');
  if(!semanaTexto) throw new Error('No se encontró la semana en el .md (busqué "**Semana:** XX de mes – XX de mes")');

  const pmKey = PM_KEY_FROM_NOMBRE[pmNombre];
  if(!pmKey) throw new Error('PM no mapeado a pmKey: "'+pmNombre+'"');

  // Parsear semana "18 de may – 22 de may"
  const semM = semanaTexto.match(/(\d+)\s+de\s+(\w+)\s*[–-]\s*(\d+)\s+de\s+(\w+)/);
  if(!semM) throw new Error('Formato de semana no reconocido: '+semanaTexto);
  const today = new Date();
  const year = today.getFullYear();
  const lunes = parseFecha(semM[1], semM[2], year);
  const viernes = parseFecha(semM[3], semM[4], year);
  const semanaId = isoWeek(lunes);
  const lunesISO = fmtISO(lunes);
  const viernesISO = fmtISO(viernes);

  // Bloques: "### Bloque N: Cliente — Curso"
  const bloques = [];
  let bIdx = 0;
  for(let i=0; i<lines.length; i++){
    const m = lines[i].match(/^###\s+Bloque\s+\d+:\s*(.+?)\s*[—-]\s*(.+)$/);
    if(!m) continue;
    bIdx++;
    let clienteNombre = m[1].trim();
    // Quitar paréntesis del cliente: "ESIC (General)" → "ESIC"
    clienteNombre = clienteNombre.replace(/\s*\([^)]*\)\s*$/,'').trim();
    const curso = m[2].trim();

    // Leer filas de la tabla "| Área | Tipo | Cantidad |"
    const counts = {};
    let total = 0;
    let j = i+1;
    while(j < lines.length && !lines[j].startsWith('###')){
      const ln = lines[j];
      // Subtotal: "**Subtotal bloque:** N recursos"
      const sub = ln.match(/^\*\*Subtotal bloque:\*\*\s+(\d+)/);
      if(sub){ total = parseInt(sub[1],10); break; }
      // Fila: "| Área | Tipo | **N** |"
      const row = ln.match(/^\|\s*(?:Video|Multimedia|Gráfico|Grafico|DI|Implementación|Implementacion)\s*\|\s*([^|]+?)\s*\|\s*\*\*(\d+)\*\*\s*\|/);
      if(row){
        const tipo = row[1].trim();
        const cant = parseInt(row[2],10);
        if(cant > 0){
          const recId = recIdFromTipo(tipo);
          counts[recId] = (counts[recId]||0) + cant;
        }
      }
      j++;
    }

    // Si no se encontró subtotal explícito, sumar
    if(!total){
      total = Object.values(counts).reduce((a,b)=>a+b, 0);
    }

    const pmShort = pmKey.slice(0,2);
    const semanaShort = String(lunes.getDate()).padStart(2,'0');
    bloques.push({
      id: 'pre_'+pmShort+semanaShort+'_'+bIdx,
      proyId: slugProyId(clienteNombre),
      proyNombre: clienteNombre,
      color: 'verde',
      curso, up:'',
      nota: '',
      counts, total
    });
  }

  // Metas por cliente: tabla "## Metas de cierre por cliente"
  const metas = {};
  const idxMetas = lines.findIndex(l => /^##\s+Metas de cierre por cliente/i.test(l));
  if(idxMetas >= 0){
    for(let i = idxMetas+1; i < lines.length; i++){
      if(lines[i].startsWith('## ') || lines[i].startsWith('### ')) break;
      const m = lines[i].match(/^\|\s*([^|]+?)\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|/);
      if(m){
        // Limpiar markdown bold/italics del nombre del cliente
        const cliente = m[1].replace(/\*\*/g,'').replace(/\*/g,'').trim();
        const cl = cliente.toLowerCase();
        if(cl === 'cliente' || cl === 'total' || cl === '') continue;
        metas[cliente] = { entrega: parseInt(m[2],10), aprobar: parseInt(m[3],10) };
      }
    }
  }

  return {
    pmKey, pmNombre, objetivo,
    semanaId, lunesISO, viernesISO,
    bloques, metas
  };
}

// ── Escritura ───────────────────────────────────────────────────────────────
function upsertSemana(parsed){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, parsed.semanaId+'.json');

  let semanaJson;
  if(fs.existsSync(file)){
    semanaJson = JSON.parse(fs.readFileSync(file, 'utf8'));
  } else {
    semanaJson = {
      semana: parsed.semanaId,
      lunes: parsed.lunesISO,
      viernes: parsed.viernesISO,
      pms: {}
    };
  }

  semanaJson.pms[parsed.pmKey] = {
    nombre: parsed.pmNombre,
    objetivo: parsed.objetivo,
    bloques: parsed.bloques,
    metas: parsed.metas
  };

  fs.writeFileSync(file, JSON.stringify(semanaJson, null, 2)+'\n');
  console.log('✓ Escrito:', path.relative(REPO_ROOT, file));

  // Actualizar index.json
  const idxFile = path.join(DATA_DIR, 'index.json');
  let idx = { semanas: [] };
  if(fs.existsSync(idxFile)){
    idx = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
  }
  if(!idx.semanas.find(s => s.id === parsed.semanaId)){
    idx.semanas.push({
      id: parsed.semanaId,
      lunes: parsed.lunesISO,
      viernes: parsed.viernesISO,
      file: parsed.semanaId+'.json'
    });
    idx.semanas.sort((a,b) => a.lunes.localeCompare(b.lunes));
    fs.writeFileSync(idxFile, JSON.stringify(idx, null, 2)+'\n');
    console.log('✓ Actualizado:', path.relative(REPO_ROOT, idxFile));
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
const arg = process.argv[2];
if(!arg){
  console.error('Uso: node scripts/md-to-json.mjs <ruta-al-md>');
  console.error('Ejemplo: node scripts/md-to-json.mjs ../avances/planeacion-18-de-may---22-de-may-sophia.md');
  process.exit(1);
}

const mdPath = path.resolve(process.cwd(), arg);
if(!fs.existsSync(mdPath)){
  console.error('No existe el archivo:', mdPath);
  process.exit(1);
}

try {
  const mdContent = fs.readFileSync(mdPath, 'utf8');
  const parsed = parseMd(mdContent);
  console.log('PM:', parsed.pmNombre, '· pmKey:', parsed.pmKey);
  console.log('Semana:', parsed.semanaId, '·', parsed.lunesISO, '→', parsed.viernesISO);
  console.log('Bloques:', parsed.bloques.length, '· Total recursos:',
    parsed.bloques.reduce((a,b)=>a+b.total, 0));
  console.log('Metas:', Object.keys(parsed.metas).length, 'clientes');
  upsertSemana(parsed);
  console.log('\nListo. Verifica con:');
  console.log('  cat data/planeaciones/'+parsed.semanaId+'.json | jq .pms.'+parsed.pmKey+'.bloques');
} catch(e){
  console.error('ERROR:', e.message);
  process.exit(1);
}
