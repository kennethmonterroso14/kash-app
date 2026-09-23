/**
 * Rasteriza `public/marca.svg` y `public/marca-maskable.svg` a los PNG que
 * piden las tiendas y el manifest de la PWA.
 *
 * Por qué un script y no un PNG commiteado a mano: los que había pesaban
 * 787 KB y 110 KB **para un cuadrado de un solo color** (#141417, sin arte),
 * porque nadie los volvió a generar después de exportarlos. Con el SVG como
 * fuente y esto al lado, regenerarlos es un comando y el peso no se escapa.
 *
 * Usa el Chromium de Playwright para rasterizar. **Playwright NO es una
 * dependencia del proyecto y no debe serlo**: es una herramienta de una sola
 * tarea y el bundle de la app no tiene por qué cargarla. Si no lo tenés a mano:
 *
 *   npx --yes playwright@latest install chromium
 *   node --experimental-import-meta-resolve scripts/generar-iconos.mjs
 *
 * o simplemente `npm i -D playwright`, generá, y desinstalalo. No corre en CI
 * ni en el build: se corre a mano cuando cambia la marca.
 *
 *   node scripts/generar-iconos.mjs
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

const SALIDAS = [
  // 180×180 es el tamaño nativo del ícono de pantalla de inicio en iPhone.
  { svg: 'marca.svg',          png: 'apple-touch-icon.png', lado: 180 },
  { svg: 'marca.svg',          png: 'pwa-192x192.png', lado: 192 },
  { svg: 'marca.svg',          png: 'pwa-512x512.png', lado: 512 },
  { svg: 'marca-maskable.svg', png: 'pwa-maskable-512x512.png', lado: 512 },
]

const nav = await chromium.launch()
for (const { svg, png, lado } of SALIDAS) {
  const fuente = readFileSync(join(raiz, 'public', svg), 'utf8')
  const ctx = await nav.newContext({ viewport: { width: lado, height: lado }, deviceScaleFactor: 1 })
  const pag = await ctx.newPage()
  // `margin:0` y el SVG al 100%: el screenshot del viewport ES el PNG.
  await pag.setContent(
    `<!doctype html><style>*{margin:0;padding:0}svg{display:block;width:${lado}px;height:${lado}px}</style>${fuente}`,
  )
  const buf = await pag.screenshot({ type: 'png' })
  writeFileSync(join(raiz, 'public', png), buf)
  console.log(`${png.padEnd(28)} ${lado}×${lado}  ${(buf.length / 1024).toFixed(1)} KB`)
  await ctx.close()
}
await nav.close()
