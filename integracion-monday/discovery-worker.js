/**
 * Griky Hub Fábrica — Monday.com Discovery Worker
 * ------------------------------------------------
 * Cloudflare Worker que actúa como proxy seguro hacia la API de Monday.
 * Su única función es LISTAR todos los boards activos de griky-cast.monday.com
 * con sus columnas, dueños y workspace, para que el equipo elija cuáles
 * exponer en el Hub.
 *
 * El token de Monday vive en la variable de entorno MONDAY_TOKEN, nunca
 * se expone al navegador.
 *
 * Endpoints:
 *   GET /                      → JSON con todos los boards y sus columnas
 *   GET /board/:id             → JSON con detalle de un board específico
 *                                (incluye una muestra de 5 ítems para ver
 *                                cómo se ven los valores reales de las columnas)
 *   GET /health                → ping de salud
 *
 * Despliegue: ver README-despliegue.md
 */

const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_API_VERSION = "2024-10";

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

/* ----------------------------- GraphQL queries ---------------------------- */

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
      workspace {
        id
        name
      }
      owners {
        id
        name
        email
      }
      columns {
        id
        title
        type
        settings_str
      }
      groups {
        id
        title
        color
      }
    }
  }
`;

const QUERY_BOARD_DETAIL = `
  query BoardDetail($boardId: [ID!]) {
    boards(ids: $boardId) {
      id
      name
      description
      url
      items_count
      columns {
        id
        title
        type
        settings_str
      }
      groups {
        id
        title
        color
      }
      items_page(limit: 5) {
        items {
          id
          name
          group { id title }
          column_values {
            id
            type
            text
            value
          }
        }
      }
    }
  }
`;

/* ------------------------------- Helpers --------------------------------- */

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

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

function errorResponse(message, status = 500) {
  return jsonResponse(
    {
      ok: false,
      error: message,
      hint:
        "Revisa que la variable MONDAY_TOKEN esté configurada en Settings → Variables del Worker.",
    },
    status
  );
}

/**
 * Reduce el JSON crudo de Monday a una vista compacta
 * pensada para que un humano elija qué boards entran al Hub.
 */
function summarizeBoards(rawBoards) {
  return rawBoards.map((b) => ({
    id: b.id,
    name: b.name,
    workspace: b.workspace ? b.workspace.name : null,
    items_count: b.items_count,
    updated_at: b.updated_at,
    url: b.url,
    owners: (b.owners || []).map((o) => ({ name: o.name, email: o.email })),
    groups: (b.groups || []).map((g) => ({
      id: g.id,
      title: g.title,
      color: g.color,
    })),
    status_columns: (b.columns || [])
      .filter((c) => c.type === "status" || c.type === "color")
      .map((c) => ({
        id: c.id,
        title: c.title,
        labels: parseStatusLabels(c.settings_str),
      })),
    date_columns: (b.columns || [])
      .filter((c) => c.type === "date" || c.type === "timeline")
      .map((c) => ({ id: c.id, title: c.title, type: c.type })),
    people_columns: (b.columns || [])
      .filter((c) => c.type === "people" || c.type === "person")
      .map((c) => ({ id: c.id, title: c.title })),
    all_columns: (b.columns || []).map((c) => ({
      id: c.id,
      title: c.title,
      type: c.type,
    })),
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
      color: s.labels_colors && s.labels_colors[index]
        ? s.labels_colors[index].color
        : null,
    }));
  } catch (_) {
    return [];
  }
}

/* --------------------------------- Router -------------------------------- */

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const token = env.MONDAY_TOKEN;
    if (!token) {
      return errorResponse(
        "MONDAY_TOKEN no está configurado en este Worker.",
        500
      );
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");

    try {
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

      if (path === "/health") {
        return jsonResponse({ ok: true, status: "alive" });
      }

      const boardMatch = path.match(/^\/board\/(\d+)$/);
      if (boardMatch) {
        const boardId = boardMatch[1];
        const data = await callMonday(token, QUERY_BOARD_DETAIL, {
          boardId: [boardId],
        });
        return jsonResponse({
          ok: true,
          generated_at: new Date().toISOString(),
          board: data.boards[0] || null,
        });
      }

      return errorResponse(
        `Ruta no encontrada: ${path}. Usa "/", "/health" o "/board/:id".`,
        404
      );
    } catch (err) {
      return errorResponse(err.message, 500);
    }
  },
};
