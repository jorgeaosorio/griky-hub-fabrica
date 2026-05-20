/**
 * griky-seguimiento-sync — Cloudflare Worker
 *
 * Recibe un POST con el JSON de seguimiento descargable de la app (botón
 * "Guardar progreso") y hace commit al repo `griky-hub-fabrica` vía GitHub API.
 * Hace merge con el archivo existente: PMs nuevos se agregan, PMs existentes
 * se sobrescriben con la versión más reciente. Otros PMs quedan intactos.
 *
 * REQUIERE estas variables/secrets en el Worker:
 *   - REPO_OWNER       (variable):  ej. "jorgeaosorio"
 *   - REPO_NAME        (variable):  ej. "griky-hub-fabrica"
 *   - GITHUB_TOKEN     (secret):    PAT con scope `public_repo`
 *   - ALLOWED_ORIGINS  (variable, opcional): coma-separados. Por defecto "*".
 *
 * Endpoint:
 *   POST /
 *   Content-Type: application/json
 *   Body: { semana, lunes, pms: { [pmKey]: { nombre, ultimaActualizacion, entregas: [...] } } }
 *
 * Respuesta OK 200:
 *   { ok: true, commit: "<sha>", pms: [{pmKey, nombre, accion, nEntregas}], url: "<html_url>" }
 *
 * Respuesta error 4xx/5xx:
 *   { ok: false, error: "...", detail?: "..." }
 */

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === 'GET') {
      // Health check útil para verificar que el Worker está vivo
      return json({ ok: true, service: 'griky-seguimiento-sync', method: 'POST con JSON de seguimiento' }, 200, cors);
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Método no permitido. Usa POST.' }, 405, cors);
    }

    // Validar config del Worker
    const { REPO_OWNER, REPO_NAME, GITHUB_TOKEN } = env;
    if (!REPO_OWNER || !REPO_NAME || !GITHUB_TOKEN) {
      return json({ ok: false, error: 'Worker mal configurado: faltan REPO_OWNER, REPO_NAME o GITHUB_TOKEN' }, 500, cors);
    }

    // Parsear body
    let body;
    try { body = await request.json(); }
    catch (e) { return json({ ok: false, error: 'JSON inválido en el body' }, 400, cors); }

    // Validar shape
    if (!body.semana || typeof body.semana !== 'string' || !/^\d{4}-W\d{2}$/.test(body.semana)) {
      return json({ ok: false, error: 'Campo `semana` ausente o con formato distinto a YYYY-W##' }, 400, cors);
    }
    if (!body.pms || typeof body.pms !== 'object') {
      return json({ ok: false, error: 'Campo `pms` ausente o no es objeto' }, 400, cors);
    }

    const filePath = `data/seguimiento/${body.semana}.json`;
    const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;

    // 1. Leer archivo actual del repo (si existe)
    let currentSha = null;
    let currentContent = { semana: body.semana, lunes: body.lunes || '', pms: {} };

    const getResp = await fetch(apiUrl, {
      headers: ghHeaders(GITHUB_TOKEN)
    });
    if (getResp.ok) {
      const fileData = await getResp.json();
      currentSha = fileData.sha;
      try {
        const decoded = atob(fileData.content.replace(/\n/g, ''));
        const parsed = JSON.parse(decoded);
        if (parsed && parsed.pms && typeof parsed.pms === 'object') {
          currentContent = parsed;
        }
      } catch (e) {
        return json({ ok: false, error: 'Archivo destino existe pero JSON está corrupto', detail: e.message }, 500, cors);
      }
    } else if (getResp.status !== 404) {
      const errText = await getResp.text();
      return json({ ok: false, error: 'Error leyendo archivo del repo', status: getResp.status, detail: errText }, 500, cors);
    }

    // 2. Mergear PMs
    const pmsAfectados = [];
    Object.keys(body.pms).forEach(pmKey => {
      const pmData = body.pms[pmKey];
      if (!pmData || !pmData.entregas || !Array.isArray(pmData.entregas) || pmData.entregas.length === 0) return;
      const yaExistia = !!currentContent.pms[pmKey];
      currentContent.pms[pmKey] = pmData;
      pmsAfectados.push({
        pmKey,
        nombre: pmData.nombre || pmKey,
        accion: yaExistia ? 'actualizado' : 'agregado',
        nEntregas: pmData.entregas.length
      });
    });

    if (pmsAfectados.length === 0) {
      return json({ ok: false, error: 'No hay PMs con entregas para mergear' }, 400, cors);
    }

    // 3. Asegurar metadata
    if (!currentContent.semana) currentContent.semana = body.semana;
    if (!currentContent.lunes && body.lunes) currentContent.lunes = body.lunes;

    // 4. Commit nuevo contenido
    const newContent = JSON.stringify(currentContent, null, 2) + '\n';
    const commitMsg = `seguimiento(${body.semana}): ${pmsAfectados.map(p => p.nombre).join(', ')} [${pmsAfectados.map(p => p.accion).join('+')}]`;

    const putBody = {
      message: commitMsg,
      content: utf8ToBase64(newContent)
    };
    if (currentSha) putBody.sha = currentSha;

    const putResp = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...ghHeaders(GITHUB_TOKEN), 'Content-Type': 'application/json' },
      body: JSON.stringify(putBody)
    });

    if (!putResp.ok) {
      const errText = await putResp.text();
      return json({ ok: false, error: 'Error escribiendo al repo', status: putResp.status, detail: errText }, 500, cors);
    }

    const putData = await putResp.json();
    return json({
      ok: true,
      commit: putData.commit && putData.commit.sha,
      message: commitMsg,
      pms: pmsAfectados,
      url: putData.content && putData.content.html_url
    }, 200, cors);
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function ghHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'griky-seguimiento-sync',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = allowed.includes('*') ? '*' :
    (allowed.includes(origin) ? origin : allowed[0] || '*');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

// btoa de Cloudflare solo acepta latin1. Para UTF-8 (tildes, ñ, símbolos)
// hay que codificar primero a bytes.
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
