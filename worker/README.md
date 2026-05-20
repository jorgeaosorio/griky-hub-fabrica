# griky-seguimiento-sync (Cloudflare Worker)

Endpoint que recibe el JSON de seguimiento desde el browser y hace commit automático al repo. Reemplaza el flujo manual de "descargar JSON + correr `scripts/merge-seguimiento.mjs` + commit + push".

## Cómo funciona

```
Browser (Seguimiento app)
  │
  │  POST https://griky-seguimiento-sync.<tu-subdomain>.workers.dev
  │  body: { semana, lunes, pms: { sophia: { ..., entregas: [...] } } }
  ▼
Worker
  │
  │  GitHub API: GET /repos/.../data/seguimiento/2026-W21.json
  │  ── merge in-memory ──
  │  GitHub API: PUT /repos/.../data/seguimiento/2026-W21.json
  ▼
GitHub Pages republica en ~1-2 min → Vista Director ve el avance
```

## Setup (una sola vez)

### 1. Crear el Personal Access Token (PAT) de GitHub

1. Ve a https://github.com/settings/personal-access-tokens/new
2. Elige **"Fine-grained personal access token"**.
3. Configura:
   - **Token name:** `griky-seguimiento-sync`
   - **Expiration:** 1 año (o lo que prefieras — renueva antes de que expire)
   - **Repository access:** "Only select repositories" → elige `griky-hub-fabrica`
   - **Permissions** → Repository permissions:
     - **Contents:** Read and write
     - (Todo lo demás déjalo en "No access")
4. Genera el token. Cópialo **ahora** (no se vuelve a mostrar).

### 2. Crear el Worker en Cloudflare

Asumiendo que tienes `wrangler` instalado (`npm install -g wrangler`):

```bash
cd worker
wrangler login                  # Abre browser para autenticarte (primera vez)
wrangler deploy                 # Crea el Worker y lo publica
```

Después del deploy, copia la URL que imprime — algo como `https://griky-seguimiento-sync.<tu-subdomain>.workers.dev`.

### 3. Configurar el secret GITHUB_TOKEN

```bash
wrangler secret put GITHUB_TOKEN
# Pega el PAT cuando te lo pida
```

### 4. (Recomendado) Restringir CORS

Edita `wrangler.toml` y descomenta:

```toml
ALLOWED_ORIGINS = "https://jorgeaosorio.github.io"
```

Luego redeploy:

```bash
wrangler deploy
```

### 5. Conectar el browser al Worker

Edita `data/config.json` en la raíz del repo (créalo si no existe) con la URL del Worker:

```json
{
  "seguimientoSyncUrl": "https://griky-seguimiento-sync.<tu-subdomain>.workers.dev"
}
```

Commit + push. La próxima vez que un PM dé clic en "💾 Guardar progreso", el browser hará POST al Worker en vez de descargar el archivo.

## Verificar que funciona

### Health check (GET)

```bash
curl https://griky-seguimiento-sync.<tu-subdomain>.workers.dev
# → {"ok":true,"service":"griky-seguimiento-sync","method":"POST con JSON de seguimiento"}
```

### Prueba real (POST)

```bash
curl -X POST https://griky-seguimiento-sync.<tu-subdomain>.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "semana": "2026-W21",
    "lunes": "2026-05-18",
    "pms": {
      "sophia": {
        "nombre": "Sophia Pacheco",
        "ultimaActualizacion": "2026-05-21T14:30:00Z",
        "entregas": [
          {"bloqueIdx":0,"proyId":"esam","proyNombre":"ESAM","curso":"Economía Gerencial","recId":"vid_std","comprometidos":5,"entregados":5,"estado":"cumplido","actualizadoEn":"2026-05-21T14:30:00Z"}
        ]
      }
    }
  }'
```

Si todo va bien: `{"ok":true,"commit":"<sha>","pms":[...]}` y aparece un commit nuevo en `griky-hub-fabrica` con mensaje `seguimiento(2026-W21): Sophia Pacheco [actualizado]`.

## Diagnóstico de errores comunes

| Error                                    | Causa                                                                                  |
|------------------------------------------|----------------------------------------------------------------------------------------|
| 500 — "Worker mal configurado"            | Falta `REPO_OWNER`/`REPO_NAME` en `wrangler.toml` o el secret `GITHUB_TOKEN`             |
| 500 — "Error escribiendo al repo" + 401   | El PAT expiró o no tiene scope `Contents: read/write` sobre `griky-hub-fabrica`         |
| 500 — "Error escribiendo al repo" + 409   | Race condition con otro commit reciente. Reintenta — el Worker no hace retry automático |
| CORS error en browser                     | `ALLOWED_ORIGINS` no incluye `https://jorgeaosorio.github.io`. Edita y redeploy.        |

## Costos

Cloudflare Workers Free tier:
- 100,000 requests/día
- 10ms CPU time por request

Este Worker hace 2 requests a GitHub API por POST + cómputo trivial. Asumiendo 5 PMs × 5 guardados/día = 25 POSTs/día. Sobra mucho.

## Rollback

Si quieres desactivar el Worker temporalmente y volver al flujo manual:

```bash
# Opción 1: eliminar la URL del config
echo '{"seguimientoSyncUrl":""}' > ../data/config.json

# Opción 2: pausar el Worker desde el dashboard de Cloudflare
# Dashboard → Workers → griky-seguimiento-sync → Settings → Pause
```

Con la URL vacía, el botón de Seguimiento cae al modo "descargar archivo" como antes.
