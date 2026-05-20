#!/usr/bin/env node
/**
 * merge-seguimiento.mjs
 *
 * Toma uno o más archivos JSON de seguimiento (descargados por los PMs desde la
 * app de Seguimiento — botón "💾 Guardar progreso (.json)") y los mezcla al
 * data/seguimiento/{semana}.json central del repo.
 *
 * USO:
 *   node scripts/merge-seguimiento.mjs ~/Downloads/2026-W21_sophia.json
 *
 * Múltiples archivos a la vez:
 *   node scripts/merge-seguimiento.mjs ~/Downloads/2026-W21_*.json
 *
 * Cada archivo descargado contiene { semana, lunes, pms: { [pmKey]: ... } }.
 * El merge:
 * - Si la semana destino no existe, la crea.
 * - Si el PM ya existía en la semana, lo SOBRESCRIBE con la versión nueva
 *   (el JSON descargado siempre representa el estado más reciente del PM).
 * - Si el PM es nuevo, se agrega al lado de los otros sin tocarlos.
 *
 * No requiere git. Solo edita el archivo destino y lo deja listo para commit.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DEST_DIR = path.join(REPO_ROOT, 'data', 'seguimiento');

function mergeOne(srcPath){
  if(!fs.existsSync(srcPath)){
    console.error('  ✗ No existe:', srcPath);
    return false;
  }

  let src;
  try { src = JSON.parse(fs.readFileSync(srcPath, 'utf8')); }
  catch(e){ console.error('  ✗ JSON inválido en', srcPath, '→', e.message); return false; }

  if(!src.semana || !src.pms){
    console.error('  ✗ Shape inválido en', srcPath, '(esperaba {semana, pms})');
    return false;
  }

  const destFile = path.join(DEST_DIR, src.semana + '.json');
  let dest;

  if(fs.existsSync(destFile)){
    try { dest = JSON.parse(fs.readFileSync(destFile, 'utf8')); }
    catch(e){
      console.error('  ✗ JSON inválido en archivo destino', destFile, '→', e.message);
      return false;
    }
    if(!dest.pms) dest.pms = {};
  } else {
    dest = {
      semana: src.semana,
      lunes: src.lunes || '',
      pms: {}
    };
  }

  // Merge cada PM del archivo fuente al destino (sobrescribe si ya existía)
  const pmsAfectados = [];
  Object.keys(src.pms).forEach(pmKey => {
    const pmData = src.pms[pmKey];
    if(!pmData.entregas || !pmData.entregas.length){
      console.warn('  ⚠ PM', pmKey, 'sin entregas — saltando');
      return;
    }
    const yaExistia = !!dest.pms[pmKey];
    dest.pms[pmKey] = pmData;
    pmsAfectados.push({
      pmKey,
      nombre: pmData.nombre || pmKey,
      nEntregas: pmData.entregas.length,
      accion: yaExistia ? 'actualizado' : 'agregado'
    });
  });

  if(pmsAfectados.length === 0){
    console.log('  ⚠ Nada para mergear desde', srcPath);
    return false;
  }

  // Asegurar carpeta destino
  if(!fs.existsSync(DEST_DIR)) fs.mkdirSync(DEST_DIR, { recursive: true });

  fs.writeFileSync(destFile, JSON.stringify(dest, null, 2) + '\n');
  console.log('  ✓', path.basename(srcPath), '→', path.relative(REPO_ROOT, destFile));
  pmsAfectados.forEach(p => {
    console.log('     ·', p.nombre, '('+p.pmKey+'):', p.accion, '—', p.nEntregas, 'entregas');
  });
  return true;
}

// ── Main ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if(args.length === 0){
  console.error('Uso: node scripts/merge-seguimiento.mjs <archivo1.json> [archivo2.json ...]');
  console.error('Ejemplo: node scripts/merge-seguimiento.mjs ~/Downloads/2026-W21_sophia.json');
  process.exit(1);
}

console.log('Mergeando '+args.length+' archivo(s) a data/seguimiento/:');
let okCount = 0;
args.forEach(arg => {
  const abs = path.resolve(process.cwd(), arg);
  if(mergeOne(abs)) okCount++;
});

console.log('\nResultado:', okCount, 'de', args.length, 'mergeados.');
if(okCount > 0){
  console.log('\nSiguiente paso:');
  console.log('  git add data/seguimiento/');
  console.log('  git commit -m "seguimiento: actualizar avance de los PMs (W{NN})"');
  console.log('  git push origin main');
}
