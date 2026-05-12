/**
 * Griky Hub Fábrica — Monday.com Production Worker
 * -------------------------------------------------
 * Evolución del Discovery Worker. Mantiene los endpoints de exploración
 * (/, /board/:id, /health) y agrega endpoints optimizados para el Hub:
 *
 *   GET /hub              → payload completo para el Hub (clientes, semáforo,
 *                           fechas próximas, carga por PM, ítems abiertos, UDDI)
 *   GET /hub/cursos       → solo el detalle de cursos (MASTER CONTENIDO)
 *   GET /hub/recursos     → solo subelementos (Subelementos de MASTER CONTENIDO)
 *   GET /hub/uddi         → contador del board UDDI
 *
 * El token de Monday vive en env.MONDAY_TOKEN (Secret en Cloudflare).
 */

const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_API_VERSION = "2024-10";

/* ───────────────────── Configuración de boards ───────────────────── */

const BOARDS = {
  MASTER_CONTENIDO: "9186901942",
  SUBELEMENTOS: "9186902272",
  UDDI: "9972870907",
};

// Mapa de columnas clave en MASTER CONTENIDO (nivel curso)
const COL_MASTER = {
  cliente_text: "text_mkrane1",              // CLIENTEV3 (texto)
  cliente_relation: "board_relation_mkr7fr5h", // CLIENTE (board_relation, fallback)
  codigo_proyecto: "text_mkrnztv1",          // CÓDIGO DEL PROYECTO
  avance_curso: "columns_battery_mkqx63rq",  // AVANCE CURSO (progress)
  estado_curso_formula: "formula_mkra9wy3",  // ESTADO CURSO (formula)
  etapa_real: "formula_mm06aw2a",            // ETAPA REAL CURSO (formula)
  semaforo: "color_mkqs10yn",                // REVISIÓN FINAL CLIENTE (status) ← fuente del semáforo
  estado_contenido: "color_mkqqfbk5",        // ESTADO CONTENIDO
  estado_produccion: "color_mkqsvjkd",       // ESTADO PRODUCCIÓN
  estado_implementacion: "color_mkqsqsyw",   // ESTADO IMPLEMENTACIÓN
  pm: "multiple_person_mkqsf36f",            // PM (people)
  di: "multiple_person_mkqs1fc4",            // DI
  tipo: "color_mkqyfpq1",                    // TIPO (CURSO SUELTO / ILIMITADO / etc.)
  lote: "color_mknr4fwr",                    // LOTE
  prioridad: "color_mky9x42a",               // PRIORIDAD PRODUCCIÓN
  fecha_aprobacion_curso: "date_mkqsxkck",   // FECHA REAL APROBACIÓN CURSO
  fecha_cierre_produccion: "date_mkqsezqb",  // FECHA REAL CIERRE PRODUCCIÓN
  fecha_cierre_migracion: "date_mkqsqjgk",   // FECHA REAL CIERRE MIGRACIÓN
};

// Mapa de columnas clave en Subelementos (nivel recurso)
const COL_SUB = {
  recurso_tipo: "status",                    // "Recurso a producir" (status)
  vertical: "color_mkqrcahp",                // Vertical (Multimedia/Video/Gráfico)
  produccion: "color_mkqrkp6g",              // Producción ← semáforo operativo
  revision_di: "color_mkqrxy2r",             // Revisión DI
  revision_cliente: "color_mkqrxxcg",        // Revisión cliente
  disenador_qa: "color_mkqrr71z",            // Diseñador QA / Creativo
  implementacion: "color_mkqxg1wf",          // Implementación
  disenador: "multiple_person_mkqr7v64",     // Diseñador (people)
  fecha_entrega_diseno: "date_mkqrp1jk",     // Fecha entrega diseñador
  fecha_final_produccion: "date_mkrc1a6g",   // Fecha final producción
};

// Mapeo de "REVISIÓN FINAL CLIENTE" → color semáforo
const SEMAFORO_MAP = {
  "APROBADO": "green",
  "EN REVISIÓN CLIENTE": "yellow",
  "EN PAUSA": "yellow",
  "DEVUELTO PARA AJUSTES": "red",
  "CANCELADO": "red",
};
const SEMAFORO_DEFAULT = "gray";

/* ───────────────────────── HTTP helpers ──────────────────────────── */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

function errorResponse(message, status = 500) {
  return jsonResponse({ ok: false, error: message }, status);
}

/* ─────────────────────── Monday client ──────────────────────── */

async function callMonday(token, query, variables = {}) {
  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      "API-Version": MONDAY_API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    const err = json.errors ? JSON.stringify(json.errors) : `HTTP ${res.status}`;
    throw new Error(`Monday API error: ${err}`);
  }
  return json.data;
}

/* ─────────────────────── Discovery (legacy) ──────────────────────── */

const QUERY_LIST_BOARDS = `
  query ListBoards {
    boards(limit: 200, state: active) {
      id
      name
      description
      state
      board_kind
      updated_at
      url
      items_count
      workspace { id name }
      owners { id name email }
      columns { id title type settings_str }
      groups { id title color }
    }
  }
`;

const QUERY_BOARD_DETAIL = `
  query BoardDetail($boardId: [ID!]) {
    boards(ids: $boardId) {
      id name description url items_count
      columns { id title type settings_str }
      groups { id title color }
      items_page(limit: 5) {
        items {
          id name
          group { id title }
          column_values { id type text value }
        }
      }
    }
  }
`;

function summarizeBoards(rawBoards) {
  return rawBoards.map((b) => ({
    id: b.id,
    name: b.name,
    workspace: b.workspace ? b.workspace.name : null,
    items_count: b.items_count,
    updated_at: b.updated_at,
    url: b.url,
    owners: (b.owners || []).map((o) => ({ name: o.name, email: o.email })),
    groups: (b.groups || []).map((g) => ({ id: g.id, title: g.title, color: g.color })),
    status_columns: (b.columns || [])
      .filter((c) => c.type === "status" || c.type === "color")
      .map((c) => ({ id: c.id, title: c.title, labels: parseStatusLabels(c.settings_str) })),
    date_columns: (b.columns || [])
      .filter((c) => c.type === "date" || c.type === "timeline")
      .map((c) => ({ id: c.id, title: c.title, type: c.type })),
    people_columns: (b.columns || [])
      .filter((c) => c.type === "people" || c.type === "person")
      .map((c) => ({ id: c.id, title: c.title })),
    all_columns: (b.columns || []).map((c) => ({ id: c.id, title: c.title, type: c.type })),
  }));
}

function parseStatusLabels(settingsStr) {
  if (!settingsStr) return [];
  try {
    const s = JSON.parse(settingsStr);
    if (!s.labels) return [];
    return Object.entries(s.labels).map(([index, label]) => ({
      index: Number(index),
      label,
      color: s.labels_colors && s.labels_colors[index] ? s.labels_colors[index].color : null,
    }));
  } catch (_) {
    return [];
  }
}

/* ─────────────────────── Hub production logic ──────────────────────── */

/**
 * Trae TODOS los ítems de un board con paginación por cursor.
 * Solicita solo las columnas indicadas (optimización).
 */
async function fetchAllItems(token, boardId, columnIds) {
  const items = [];
  let cursor = null;
  const limit = 500;
  const query = `
    query($boardId: [ID!], $limit: Int!, $cursor: String, $columnIds: [String!]) {
      boards(ids: $boardId) {
        items_page(limit: $limit, cursor: $cursor) {
          cursor
          items {
            id
            name
            group { id title }
            column_values(ids: $columnIds) {
              id
              type
              text
              value
              ... on MirrorValue { display_value }
              ... on BoardRelationValue { linked_item_ids linked_items { id name } }
              ... on StatusValue { label index }
              ... on PeopleValue { persons_and_teams { id kind } }
              ... on DateValue { date time }
            }
          }
        }
      }
    }
  `;
  while (true) {
    const vars = { boardId: [boardId], limit, cursor, columnIds };
    const data = await callMonday(token, query, vars);
    const page = data.boards[0] && data.boards[0].items_page;
    if (!page) break;
    items.push(...(page.items || []));
    if (!page.cursor) break;
    cursor = page.cursor;
    if (items.length > 5000) break; // safety cap
  }
  return items;
}

/**
 * Utilitarios para leer valores de un ítem según el column_id.
 */
function cv(item, colId) {
  return (item.column_values || []).find((c) => c.id === colId);
}
function cvText(item, colId) {
  const c = cv(item, colId);
  if (!c) return null;
  return (c.text && c.text.trim()) ? c.text.trim() : null;
}
function cvStatusLabel(item, colId) {
  const c = cv(item, colId);
  if (!c) return null;
  if (c.label) return c.label;
  if (c.text) return c.text.trim() || null;
  return null;
}
function cvDate(item, colId) {
  const c = cv(item, colId);
  if (!c || !c.text) return null;
  return c.text; // formato YYYY-MM-DD
}
function cvProgress(item, colId) {
  // columns_battery devuelve un número 0-100 en value (JSON) o text
  const c = cv(item, colId);
  if (!c) return null;
  if (c.text && !isNaN(parseFloat(c.text))) return parseFloat(c.text);
  if (c.value) {
    try {
      const v = JSON.parse(c.value);
      if (v && typeof v.progress === "number") return v.progress;
      if (typeof v === "number") return v;
    } catch (_) { /* ignore */ }
  }
  return null;
}
function cvPeopleNames(item, colId) {
  const c = cv(item, colId);
  if (!c) return [];
  if (c.text) return c.text.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}
function cvBoardRelationNames(item, colId) {
  const c = cv(item, colId);
  if (!c) return [];
  if (c.linked_items && c.linked_items.length)
    return c.linked_items.map((i) => i.name).filter(Boolean);
  if (c.text) return c.text.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function semaforoFromLabel(label) {
  if (!label) return SEMAFORO_DEFAULT;
  const key = label.trim().toUpperCase();
  for (const [k, v] of Object.entries(SEMAFORO_MAP)) {
    if (k.toUpperCase() === key) return v;
  }
  return SEMAFORO_DEFAULT;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T23:59:59Z");
  if (isNaN(target.getTime())) return null;
  const now = new Date();
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Construye el payload del Hub consultando MASTER CONTENIDO, Subelementos y UDDI.
 */
async function buildHubPayload(token) {
  const masterCols = Object.values(COL_MASTER);
  const subCols = Object.values(COL_SUB);

  const [masterItems, subItems, uddiCount] = await Promise.all([
    fetchAllItems(token, BOARDS.MASTER_CONTENIDO, masterCols),
    fetchAllItems(token, BOARDS.SUBELEMENTOS, subCols),
    fetchBoardCount(token, BOARDS.UDDI),
  ]);

  const cursos = masterItems.map((it) => {
    const cliente =
      cvText(it, COL_MASTER.cliente_text) ||
      cvBoardRelationNames(it, COL_MASTER.cliente_relation)[0] ||
      "Sin cliente";
    const semaforoLabel = cvStatusLabel(it, COL_MASTER.semaforo);
    return {
      id: it.id,
      nombre: it.name,
      cliente,
      codigo: cvText(it, COL_MASTER.codigo_proyecto),
      grupo: it.group && it.group.title,
      pm: cvPeopleNames(it, COL_MASTER.pm),
      di: cvPeopleNames(it, COL_MASTER.di),
      tipo: cvStatusLabel(it, COL_MASTER.tipo),
      lote: cvStatusLabel(it, COL_MASTER.lote),
      prioridad: cvStatusLabel(it, COL_MASTER.prioridad),
      avance: cvProgress(it, COL_MASTER.avance_curso),
      estado_curso: cvText(it, COL_MASTER.estado_curso_formula),
      etapa: cvText(it, COL_MASTER.etapa_real),
      estado_contenido: cvStatusLabel(it, COL_MASTER.estado_contenido),
      estado_produccion: cvStatusLabel(it, COL_MASTER.estado_produccion),
      estado_implementacion: cvStatusLabel(it, COL_MASTER.estado_implementacion),
      revision_final_cliente: semaforoLabel,
      semaforo: semaforoFromLabel(semaforoLabel),
      fecha_aprobacion: cvDate(it, COL_MASTER.fecha_aprobacion_curso),
      fecha_cierre_produccion: cvDate(it, COL_MASTER.fecha_cierre_produccion),
      fecha_cierre_migracion: cvDate(it, COL_MASTER.fecha_cierre_migracion),
      monday_url: `https://griky-cast.monday.com/boards/${BOARDS.MASTER_CONTENIDO}/pulses/${it.id}`,
    };
  });

  const recursos = subItems.map((it) => ({
    id: it.id,
    nombre: it.name,
    grupo: it.group && it.group.title,
    tipo: cvStatusLabel(it, COL_SUB.recurso_tipo),
    vertical: cvStatusLabel(it, COL_SUB.vertical),
    produccion: cvStatusLabel(it, COL_SUB.produccion),
    revision_di: cvStatusLabel(it, COL_SUB.revision_di),
    revision_cliente: cvStatusLabel(it, COL_SUB.revision_cliente),
    disenador_qa: cvStatusLabel(it, COL_SUB.disenador_qa),
    implementacion: cvStatusLabel(it, COL_SUB.implementacion),
    disenador: cvPeopleNames(it, COL_SUB.disenador),
    fecha_entrega_diseno: cvDate(it, COL_SUB.fecha_entrega_diseno),
    fecha_final_produccion: cvDate(it, COL_SUB.fecha_final_produccion),
  }));

  /* ---- Agregados por cliente ---- */
  const clientesMap = new Map();
  for (const c of cursos) {
    if (!clientesMap.has(c.cliente)) {
      clientesMap.set(c.cliente, {
        nombre: c.cliente,
        cursos: [],
        agregado: { total: 0, green: 0, yellow: 0, red: 0, gray: 0, avance_promedio: 0 },
      });
    }
    const entry = clientesMap.get(c.cliente);
    entry.cursos.push(c);
    entry.agregado.total += 1;
    entry.agregado[c.semaforo] = (entry.agregado[c.semaforo] || 0) + 1;
  }
  for (const entry of clientesMap.values()) {
    const avances = entry.cursos.map((c) => c.avance).filter((v) => v != null);
    entry.agregado.avance_promedio = avances.length
      ? Math.round(avances.reduce((a, b) => a + b, 0) / avances.length)
      : 0;
    entry.cursos.sort((a, b) => (b.avance || 0) - (a.avance || 0));
  }
  const clientes = Array.from(clientesMap.values())
    .sort((a, b) => b.agregado.total - a.agregado.total);

  /* ---- Carga por PM ---- */
  const pmMap = new Map();
  for (const c of cursos) {
    (c.pm || []).forEach((p) => {
      if (!pmMap.has(p)) {
        pmMap.set(p, { pm: p, cursos_activos: 0, green: 0, yellow: 0, red: 0, gray: 0 });
      }
      const e = pmMap.get(p);
      e.cursos_activos += 1;
      e[c.semaforo] = (e[c.semaforo] || 0) + 1;
    });
  }
  const carga_pm = Array.from(pmMap.values()).sort((a, b) => b.cursos_activos - a.cursos_activos);

  /* ---- Próximas fechas de cierre ---- */
  const proximas_fechas_cierre = cursos
    .filter((c) => c.fecha_aprobacion || c.fecha_cierre_produccion)
    .map((c) => {
      const f = c.fecha_aprobacion || c.fecha_cierre_produccion;
      return {
        curso_id: c.id,
        curso: c.nombre,
        cliente: c.cliente,
        pm: c.pm,
        fecha: f,
        dias_restantes: daysUntil(f),
        semaforo: c.semaforo,
      };
    })
    .filter((f) => f.dias_restantes !== null && f.dias_restantes >= -30)
    .sort((a, b) => a.dias_restantes - b.dias_restantes)
    .slice(0, 50);

  /* ---- Semáforo global ---- */
  const semaforo_global = { green: 0, yellow: 0, red: 0, gray: 0 };
  for (const c of cursos) semaforo_global[c.semaforo] = (semaforo_global[c.semaforo] || 0) + 1;

  /* ---- Ítems abiertos por columna/etapa (recursos) ---- */
  const recursos_por_produccion = {};
  const recursos_por_vertical = {};
  for (const r of recursos) {
    const p = r.produccion || "Sin estado";
    recursos_por_produccion[p] = (recursos_por_produccion[p] || 0) + 1;
    const v = r.vertical || "Sin vertical";
    recursos_por_vertical[v] = (recursos_por_vertical[v] || 0) + 1;
  }

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    source: "griky-cast.monday.com",
    summary: {
      total_cursos: cursos.length,
      total_clientes: clientes.length,
      total_recursos: recursos.length,
      semaforo_global,
    },
    clientes,
    carga_pm,
    proximas_fechas_cierre,
    recursos: {
      total: recursos.length,
      por_produccion: recursos_por_produccion,
      por_vertical: recursos_por_vertical,
    },
    uddi: { items_count: uddiCount },
  };
}

async function fetchBoardCount(token, boardId) {
  const data = await callMonday(
    token,
    `query($boardId: [ID!]) { boards(ids: $boardId) { items_count } }`,
    { boardId: [boardId] }
  );
  return (data.boards[0] && data.boards[0].items_count) || 0;
}

/* ─────────────────────────── Router ──────────────────────────── */

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    const token = env.MONDAY_TOKEN;
    if (!token) {
      return errorResponse("MONDAY_TOKEN no está configurado.", 500);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");

    try {
      // Discovery endpoints (mantener)
      if (path === "" || path === "/") {
        const data = await callMonday(token, QUERY_LIST_BOARDS);
        return jsonResponse({
          ok: true,
          generated_at: new Date().toISOString(),
          source: "griky-cast.monday.com",
          total_boards: data.boards.length,
          boards: summarizeBoards(data.boards),
        });
      }
      if (path === "/health") return jsonResponse({ ok: true, status: "alive" });

      const boardMatch = path.match(/^\/board\/(\d+)$/);
      if (boardMatch) {
        const data = await callMonday(token, QUERY_BOARD_DETAIL, { boardId: [boardMatch[1]] });
        return jsonResponse({
          ok: true,
          generated_at: new Date().toISOString(),
          board: data.boards[0] || null,
        });
      }

      // Hub endpoints
      if (path === "/hub") {
        const payload = await buildHubPayload(token);
        return jsonResponse(payload);
      }
      if (path === "/hub/cursos") {
        const masterCols = Object.values(COL_MASTER);
        const items = await fetchAllItems(token, BOARDS.MASTER_CONTENIDO, masterCols);
        return jsonResponse({ ok: true, total: items.length, items });
      }
      if (path === "/hub/recursos") {
        const subCols = Object.values(COL_SUB);
        const items = await fetchAllItems(token, BOARDS.SUBELEMENTOS, subCols);
        return jsonResponse({ ok: true, total: items.length, items });
      }
      if (path === "/hub/uddi") {
        const count = await fetchBoardCount(token, BOARDS.UDDI);
        return jsonResponse({ ok: true, board: "UDDI", items_count: count });
      }

      return errorResponse(
        `Ruta no encontrada: ${path}. Usa /, /board/:id, /hub, /hub/cursos, /hub/recursos, /hub/uddi, /health.`,
        404
      );
    } catch (err) {
      return errorResponse(err.message, 500);
    }
  },
};
