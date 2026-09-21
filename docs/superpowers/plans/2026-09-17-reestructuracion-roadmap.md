# Reestructuración de Vorta — Roadmap

Objetivo declarado: **bases internas + rediseño de UI + mejorar el modelo de deuda de TC**, con otras
funciones en cola, y la app pensada para que **varios usuarios la usen y eventualmente se publique
en App Store y Play Store**.

Este documento es el roadmap del programa. Cada fase se implementa con el flujo del repo: spec en
`docs/superpowers/specs/`, plan con checkboxes en `docs/superpowers/plans/`, un commit por tarea.

El inventario de qué está torcido y por qué está en [`../../RESTRUCTURE.md`](../../RESTRUCTURE.md).
Este documento decide **en qué orden** y **qué bloquea qué**.

Los tamaños (S / M / L) son **relativos entre sí**, no estimaciones de calendario.

---

## Fase 0 — Decisiones que bloquean código

No son tareas de implementación. Son bifurcaciones donde elegir después significa tirar trabajo.

### 0.1 Shell nativo — BLOQUEA la Fase 3 (rediseño de UI)

**App Store no acepta PWAs.** Play Store sí, empaquetada como TWA. Así que publicar en las dos
tiendas obliga a elegir, y la elección determina en qué se hace el rediseño:

| Opción | Qué implica | Costo | Reutiliza |
|---|---|---|---|
| **Capacitor** (recomendado) | Envuelve la app React actual en un shell nativo iOS/Android. WebView, con acceso a APIs nativas vía plugins. | S–M | **Todo** el código actual |
| Expo / React Native | UI nativa real. Hay que reescribir las 8 páginas (~4,000 líneas de JSX) y cambiar Recharts por `victory-native` o similar. | **L** | Solo `finanzas.ts`, los hooks y el esquema |
| TWA + PWA | Lo más barato. **Solo Play Store**; App Store queda fuera. | XS | Todo |

**Recomendación: Capacitor.** La app es CRUD + gráficas, que un WebView maneja bien, y preserva
toda la inversión en React — incluidos los 48 tests y la capa de hooks. React Native se justificaría
si hiciera falta rendimiento nativo o gestos complejos, y acá no hace falta.

Consecuencia si se elige Capacitor: el rediseño de la Fase 3 se hace en los componentes React
actuales y **no se tira nada**.

### 0.2 Alcance geográfico — BLOQUEA tocar `formatQ`

Hoy la moneda está cableada: `formatQ` siempre emite `Q` con locale `es-GT`, y
`profiles.moneda` existe y no se usa. Si es solo Guatemala, está bien y no se toca. Si se abre a
más países, hay que meter la moneda en la capa de formateo y en las inversiones — y eso es más fácil
**antes** del rediseño, no después.

### 0.3 Ya decidido

"Varios usuarios la puedan usar" = **multi-tenant, cada usuario con sus propios datos**, que es lo
que RLS por `user_id` ya hace. **No** son hogares compartidos (varias personas sobre las mismas
cuentas), que habría obligado a rehacer el modelo con hogares/miembros/roles. Si eso cambia, avisar
antes de la Fase 1: cambia el esquema de raíz.

---

## Fase 1 — Bases internas

Invisible para el usuario. Todo lo demás se vuelve más barato y más seguro después.

### 1.0 Borrar los datos personales del repo — hacer YA, antes de todo lo demás  · XS

`src/lib/constants.ts` tiene `CUENTAS_INICIALES` con los **saldos bancarios reales de una persona**
(nueve cuentas con montos) y `PRESUPUESTOS_INICIALES` con sus límites. Nadie los importa: son
exports muertos.

Mientras la app era personal era feo. **Con la app pensada para terceros y el repo hacia una
publicación, es un problema de privacidad.** Borrarlos, o convertirlos en una plantilla genérica si
se van a usar para el onboarding de la Fase 2.

### 1.1 Contexto de sesión  · M

Hoy no hay caché: cada página instancia los hooks que necesita y vuelve a pedir lo mismo. Medido:

- `useCuentas` y `useCategorias` se instancian en **6 páginas cada uno**
- `useTarjetas` en 4, `useTransacciones` en 3
- **15** consultas distintas a `transacciones`, **6** a `profiles`, **6** a `tarjetas_credito`
- El Dashboard solo instancia **seis** hooks

Un `SesionProvider` que cargue una vez perfil + cuentas + categorías + tarjetas, con invalidación
explícita tras un write, elimina la mayoría. No hace falta traer react-query: un contexto con los
hooks actuales adentro alcanza, y mantiene el patrón que el equipo ya conoce.

Habilita 1.2, 1.4 y mata el `window.location.reload()` de `CuentasPage`.

### 1.2 Unificar cómo llega el usuario  · S

Las páginas nuevas reciben `{ userId }`; `DashboardPage`, `TransaccionesPage`, `CuentasPage` y
`PerfilPage` reciben el objeto `User` completo. Con 1.1 en su lugar, ninguna necesita recibir nada:
lo leen del contexto. Mecánico.

### 1.3 Partir las páginas gigantes  · L

| Archivo | Líneas |
|---|---|
| `TarjetasPage.tsx` | 749 |
| `TransaccionesPage.tsx` | 710 |
| `InversionesPage.tsx` | 686 |
| `BudgetPage.tsx` | 612 |
| `DashboardPage.tsx` | 436 |

Cada una mezcla lista, formularios, modales y cálculo en un solo archivo. Los tres bugs críticos de
la auditoría vivían en dos de estos archivos, y no es casualidad: a 700 líneas nadie ve que un
handler deriva mal un signo.

Extraer por sección (la lista, cada modal, cada tarjeta) manteniendo el estado donde está. **No**
inventar una abstracción de modal todavía: eso es Fase 3, con el sistema de diseño.

### 1.4 Tests donde hubo bugs  · M

48 tests, **todos en `finanzas.ts`**. Cero en hooks y páginas — incluido el carry-over de
presupuestos, que resucitaba datos borrados y nadie lo habría notado.

Agregar `@testing-library/react` (Vitest y jsdom ya están configurados) y cubrir, en este orden, lo
que ya falló: carry-over de presupuestos, `useAutoApplyPagos` (idempotencia por mes y el
compare-and-swap), reparto de deuda de TC en insert/update/delete, y las carreras de cambio de mes.

### 1.5 `refetch` en los hooks  · S

Cae casi solo con 1.1. Quita los dos `window.location.reload()` de `CuentasPage`.

---

## Fase 2 — Listo para varios usuarios y para tiendas

Requisitos duros para publicar. Varios son de tienda, no de gusto.

### 2.1 Onboarding que de verdad configure la cuenta  · M

Hoy `SetupPage` solo escribe la fila de `profiles`. Un usuario nuevo entra al Dashboard **sin
ninguna cuenta** y ve todo en Q0.00, sin saber qué hacer. Necesita: crear al menos una cuenta con su
saldo inicial, y ofrecer categorías/presupuestos de arranque (acá sí sirve una plantilla genérica,
no los datos de 1.0).

### 2.2 Borrar la cuenta desde la app  · M

**Requisito de App Store** para toda app que permita crear cuenta: tiene que permitir borrarla desde
la app, no solo desactivarla. Necesita un RPC que borre en cascada y una pantalla de confirmación.
Hoy no existe nada.

### 2.3 Opciones de autenticación  · M

Hoy solo magic link. Para tiendas: **Apple exige Sign in with Apple** si se ofrece login de
terceros, y el magic link en móvil es frágil (el correo abre en otro navegador y se pierde la
sesión). Evaluar email+contraseña y proveedores sociales. Ojo: la protección de contraseñas
filtradas está desactivada en el proyecto de Supabase — hay que activarla si se agregan contraseñas.

### 2.4 Legales  · S

Política de privacidad y términos, accesibles desde la app. Requisito de las dos tiendas.

### 2.5 Marca e íconos  · S (diseño)

`public/pwa-192x192.png` y `pwa-512x512.png` son cuadrados sólidos `#12151c` **sin arte** (787 KB
para un PNG en blanco), y `favicon.svg` sigue siendo el rayo de la plantilla de Vite. Hay que dibujar
la marca y exportarla a los tamaños de cada tienda.

---

## Fase 3 — Rediseño de UI e información

**Depende de 0.1.** Con Capacitor se hace sobre los componentes actuales; con React Native, es una
reescritura y cambia todo este bloque.

### 3.0 Lenguaje visual — HECHO en parte  · S

Decidido: la estética es la de Apple, incluido el vidrio translúcido. Las reglas viven en el repo
(`.claude/skills/apple-design`, `.claude/skills/mobile-native`) para que el criterio no dependa de
quién aplique el cambio.

Lo que ya está:

- `src/lib/tokens.js` pasó de paleta a tokens completos: materiales con su desenfoque/canto/sombra,
  radios, curvas, duraciones y tracking. Un cambio ahí mueve clases y gráficas a la vez.
- `src/index.css` trae la base de `mobile-native` (tap highlight, `touch-action`, inputs de 16px,
  `overscroll-behavior`, safe areas) y las clases `.vidrio-*` con sus tres fallbacks
  (`prefers-reduced-transparency`, `prefers-contrast`, `prefers-reduced-motion`).
- El cromo (header + nav) ya es vidrio con el contenido pasando por debajo.
- Barrido de clases: `text-muted` → `text-textDim` (238 sitios que estaban a ~1.5:1 de contraste),
  `text-white` → `text-text`, bordes a `border-{canto,perimetro}`, estados a los system colors.
- La fuente del sistema reemplaza a Inter y JetBrains Mono. Quedó una sola webfont (Outfit, el
  logotipo).

Lo que falta, y por qué no se hizo junto:

- **El tracking y los radios nuevos no están aplicados página por página.** Aplicarlos bien es
  por tamaño de texto y por tipo de superficie, o sea decisión por sitio — y eso viaja con 1.4,
  que ya va a tocar cada archivo. Ponerlos ahora sería tocar los mismos 3,500 renglones dos veces.
- **Los paneles siguen opacos (`bg-surface`).** Es correcto por ahora: §12 reserva el material
  para el cromo y las hojas; una tarjeta sobre un fondo plano no gana nada y apilar vidrio sobre
  vidrio se lee peor. Se revisa con los primitivos de 3.2.
- **No hay animación con resortes.** Requiere una librería (Motion) y decidir sobre gestos, que es
  3.2. Los tokens de curva y duración ya están para cuando llegue.
- **Riesgo medido a mano en un teléfono, pendiente:** `backdrop-filter` en un WebView de Capacitor
  sobre Android de gama media es lo primero que hay que verificar cuando exista el shell (0.1).
  Si cuesta frames, el escape es subir la opacidad de los materiales y bajar el desenfoque — un
  cambio en `tokens.js`, no en las páginas, que es justamente por lo que está centralizado.
- **Nadie ha visto las doce páginas corriendo** con estos cambios: se verificaron tipos, lint,
  tests y el CSS emitido, no la pantalla.

### 3.1 Arquitectura de información  · M

**6 de las 11 secciones están escondidas detrás de Perfil**: Inversiones, Tarjetas, Pagos Fijos,
Categorías, Metas y Proyecciones. Perfil es un cajón de sastre, no una sección. La nav inferior
tiene 5 items y el resto no tiene dónde vivir.

Decidir la IA antes de mover píxeles: qué merece nav, qué es configuración, y qué se puede fusionar
(Metas y Proyecciones son la misma pregunta vista distinto).

### 3.2 Primitivos de UI  · M

Hoy no hay capa de componentes: cada modal es JSX inline con estado local, y el patrón está copiado
ocho veces. Los tokens de Tailwind sí están bien y se quedan. Faltan primitivos: `Sheet`/`Modal`,
`Field`, `Money`, `Card`, `EmptyState`, `ErrorState`, `ConfirmButton` (el patrón de 2 taps, que hoy
se reimplementa en cada página).

Se hace **después** de 1.3: partir primero, abstraer después, o se abstrae sobre la estructura
equivocada.

### 3.3 Accesibilidad como parte del sistema  · S

La auditoría encontró que `role="button"` en las tarjetas de presupuesto podaba del árbol de
accesibilidad **todas** las cifras. Se corrigió, pero el patrón correcto debe vivir en los
primitivos de 3.2 para que no se repita.

---

## Fase 4 — Modelo de deuda de TC

Lo más profundo y lo que más rédito da en confiabilidad: ahí vivían los defectos más graves de la
auditoría.

### 4.1 `cerrado_at` en `ciclos_tc` — prerrequisito  · S

Hoy `ciclos_tc` guarda la `fecha_cierre` **teórica**, pero el usuario cierra cuando quiere, así que
no se sabe cuándo un monto pasó de un bucket al otro. **Sin esto no se puede derivar nada**, porque
la historia no se puede reproducir. Es una columna y un `update` en `cerrar_ciclo_tc`.

### 4.2 Derivar los dos buckets del ledger  · L

Con 4.1 en su lugar: una vista o función que calcule `deuda_actual` y `deuda_ciclo_anterior` desde
`transacciones` + `ciclos_tc`, y retirar los totales corrientes junto con las columnas
`aplicado_*`, el trigger `trg_deuda_tc` y su escape hatch.

**Honestidad sobre el alcance:** solo aplica a ciclos con `cerrado_at`. Lo anterior a 4.1 queda con
el reparto que tiene y no se puede recalcular. Conviene una fecha de corte explícita en el código.

Lo que esto elimina de un golpe: la clase entera de "un delta mal calculado no se detecta y no se
puede reconstruir", que es de donde salieron los tres bugs críticos de TC. También vuelve
reversible la edición de movimientos de TC, que hoy está deshabilitada a propósito.

### 4.3 El reparto de un pago no es un `ciclo_id`  · M

`transacciones.ciclo_id` es una sola FK, pero el trigger reparte un pago entre dos estados de
cuenta. Con 4.2 el problema se disuelve: la atribución se deriva, no se estampa.

### 4.4 Limpiar lo que quedó sin dueño  · S

`ciclos_tc.total_cargos` y `total_pagos` están siempre en 0 y el historial los deriva en el cliente.
Con 4.2, o se llenan desde la vista o se borran. Tenerlos en 0 invita a que alguien los use.

---

### 5.x La inflación de referencia está cableada a Guatemala  · XS

`INFLACION_ANUAL_REF` en `constants.ts` vale 4 (%) y es el umbral contra el que Inversiones dice
"supera la inflación". Con la app abierta a más países tendría que salir del perfil, como la moneda
y la zona horaria. No se parametrizó en la tarea 1.3 porque sin un dato de inflación por país solo
movería el problema de lugar: haría falta o que el usuario lo ponga a mano, o una fuente por país.

## Fase 5 — Funciones en cola

Independientes entre sí. Se pueden intercalar donde haya espacio, con dos excepciones marcadas.

| Función | Tamaño | Nota |
|---|---|---|
| Editar / archivar / borrar cuentas | M | `cuentas.activa` existe y nada la escribe. Una cuenta mal creada es permanente hoy |
| Abonar a una meta | M | Decisión de diseño: ¿un control "Abonar", o derivar del ledger con `meta_id`? Lo segundo es más coherente con el resto |
| Ciclo de TC en `pagado` | S | El badge existe y nada lo escribe. **Mejor después de 4.2** |
| Recuperar pagos fijos atrasados | M | Necesita UI que liste los vencimientos y pida confirmación. **Nunca automático** — ya se intentó y se revirtió |
| Cambiar la moneda de una inversión | M | Necesita RPC atómico que convierta capital, valor y **todo** el historial a un tipo confirmado |
| Auto-apply transaccional | S | Un RPC que haga lectura + insert + avance en una transacción. Cierra la carrera entre dispositivos que el CAS no cubre |

---

## Secuencia recomendada

```
AHORA          1.0  borrar datos personales del repo        (privacidad, XS)
DECIDIR        0.1  shell nativo    ← bloquea Fase 3
               0.2  alcance geográfico

Fase 1         1.1 → 1.2 → 1.5    (contexto, props, refetch)
               1.4  tests          (en paralelo, empezando por lo que ya falló)
               1.3  partir páginas (el más grande; habilita 3.2)

Fase 4         4.1  cerrado_at     (temprano: cuanto antes, más historia queda derivable)

Fase 2         2.1 → 2.2 → 2.3 → 2.4 → 2.5   (todo antes de publicar)

Fase 3         3.1 → 3.2 → 3.3    (después de 1.3)

Fase 4         4.2 → 4.3 → 4.4    (el grande, sobre bases ya limpias)

Fase 5         intercalar
```

Dos cosas que conviene adelantar aunque su fase venga después:

- **1.0 ahora mismo**: es privacidad y cuesta nada.
- **4.1 temprano**: cada ciclo que se cierra sin `cerrado_at` es historia que nunca va a poder
  derivarse. Cuanto antes entre, menos pasado queda inservible.

---

## Cosas pendientes del mundo real

### Q6.50 de diferencia en "Ysi Visa"

Verificado en producción el 2026-09-17, después del pago de ese día:

| | |
|---|---|
| `deuda_actual` guardada | Q718.10 |
| Derivado del ledger (49 cargos − 2 pagos) | Q711.60 |
| Diferencia | **Q6.50** |

Las otras tres tarjetas cuadran exactamente. Comprobado además: **no existe ninguna transacción de
Q6.50** en esa tarjeta, y la diferencia es un offset constante — sobrevivió sin cambio al pago de
Q2,221.80 del 17/09. O sea que no es un cálculo que se repita, es un delta que entró una vez.

**De dónde salió no se puede saber, y eso es el punto de la Fase 4.** `transacciones` no tiene
`updated_at` ni bitácora, y `ciclos_tc` no tiene `cerrado_at`, así que la historia del total
corriente no se puede reproducir. Un delta mal aplicado una sola vez queda permanente y sin rastro.

No es dinero real que se movió: `deuda_actual` es una columna **derivada**, ningún saldo de cuenta
bancaria la toca. El lado confiable es el ledger.

Dos formas de corregirlo, según lo que diga el estado de cuenta del banco:

- **Banco dice Q711.60** → el ledger tiene razón y el total corriente está inflado. Se corrige con
  un `update tarjetas_credito set deuda_actual = 71160 where …`, a mano en el SQL Editor (el
  cliente nunca escribe esa columna).
- **Banco dice Q718.10** → falta un cargo de Q6.50 en el ledger (típicamente una comisión o un
  interés que nunca se ingresó). Se agrega como `gasto_tc` desde TarjetasPage y el trigger cuadra
  solo. **Esta es la preferible**: deja el ledger como fuente de verdad en lugar de parchar el total.

Conviene resolverlo antes de la Fase 4, para que 4.2 arranque de un estado limpio.

### Protección de contraseñas filtradas desactivada

Relevante ya, no a futuro: `LoginPage` usa `signInWithPassword` / `signUp`, o sea contraseñas
reales — no magic link, como decía esta nota antes.

Qué hace: en signup, cambio de contraseña y login, Supabase Auth compara la contraseña contra la
lista de filtraciones de HaveIBeenPwned y rechaza las que ya andan circulando. La comparación es
por k-anonimato (salen los primeros 5 caracteres del hash SHA-1, nunca la contraseña), y lo que
previene es credential stuffing: entrar con una contraseña que el usuario reusó y que ya se filtró
en otro sitio.

**Bloqueado hoy: requiere plan Pro** y la organización está en Free, así que la opción aparece
deshabilitada. Lo que sí se puede hacer gratis, en la misma pantalla
(Authentication → Sign In / Providers → Email): subir el largo mínimo (8 es el piso, mejor 10–12) y
exigir dígitos + mayúsculas + minúsculas + símbolos. Los usuarios existentes pueden seguir entrando
con su contraseña actual; solo reciben un `WeakPasswordError` informativo.

Entra en el checklist de la Fase 2 (listo para tiendas), junto con el upgrade a Pro si se publica.
