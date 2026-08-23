# 74 · GUIÓN DE DEMO — reunión 22-ago-2026, 6:30

**Estado de producción al preparar esto:** backend estable (suite 989 en
verde, vigías de humo callados), portal al día, padrón limpio (4 cuentas).
**Entrar como:** tu cuenta de Entity Admin (con 2FA) — alcanza todas las
obras sin membresía, así que nada te cierra el paso en vivo.

## La narrativa (20–25 min)

**1 · La marca y la puerta (2 min)**
- `visor-ecd-portal.onrender.com` → Hub ALEPHIA: marca madre, dos productos
  (Docs / View), «Mi trabajo» filtrado por membresía.
- Mensaje: *un solo entorno común de datos, con identidad corporativa propia.*

**2 · Identidad y acceso — lo que nadie más enseña (5 min)**
- Usuarios: el padrón con **estado real** (chips ACTIVO/PENDIENTE/DESACTIVADO).
- Clic en un nombre → **la ficha de persona**: la escalera completa —
  persona → empresa → obras → función por obra → qué administra — con 2FA y
  último acceso vivos.
- Mensaje: *invitación con enlace de un solo uso y generaciones (reemitir
  mata los enlaces viejos), 2FA, sesiones con cierre remoto. Modelo
  ACC/Procore: perfil del sistema ≠ función contractual.*

**3 · La obra y su gente (4 min)**
- Abrir **PQT8_TALARA** (la obra real, con documentos de verdad).
- Participantes: empresas con su función contractual, personas, «Administra
  esta obra» como columna propia, y el flujo **«Añadir persona a esta
  obra»** (persona → empresa → función → membresía → ¿admin?).
- Mensaje: *la membresía se administra desde la obra, con la autoridad de la
  obra — retirar a alguien conserva su historia.*

**4 · El expediente (6 min)**
- Archivos: nomenclatura, versiones, estados WIP/SHARED/PUBLISHED,
  cuarentena de nombres fuera de convención.
- Una revisión con independencia autor/revisor; un transmittal con acuse.
- Mensaje: *ISO 19650 operativo, no de folleto: cadena de auditoría con
  hash encadenado.*

**5 · Permisos por carpeta (3 min) — SOLO SI EL BACKEND SE DESPLEGÓ**
- Carpeta → Permisos: reglas a **persona, empresa o función contractual**,
  «Cómo se resuelve» (la carpeta más cercana gana; Persona > Empresa >
  Función), y el **inspector**: elegir a alguien y ver qué tiene y POR QUÉ
  (carpeta ganadora, sujeto ganador).
- Si NO se desplegó: **saltar este punto** — la pantalla nueva pediría
  rutas que aún no existen en producción.

**6 · El visor (4 min)**
- Hub → ALEPHIA View → modelo de PQT8: navegación, y si el tiempo da,
  el 4D LOB (avance por frentes) — es el diferencial técnico.

## Lo que NO enseñar (bordes conocidos, ninguno estructural)
- La **pantalla de login** (aún clona a Revizto — UX POLISH pendiente):
  llega ya logueado o pasa por ella rápido.
- Las **horas** de la ficha salen en UTC sin declararlo (cosmético).
- No borrar/archivar nada en vivo; si piden verlo, contar que existe con
  papelera y restauración probada.

## Preguntas probables → respuesta corta
- *«¿Y si se va la luz / se cae?»* — Backend y portal en Render, base en
  Cloud SQL con copias diarias verificadas y ensayo de restauración hecho.
- *«¿Quién puede entrar?»* — Nadie sin invitación; registro cerrado;
  deny-by-default por obra y por carpeta (ISO 19650 «paranoico»).
- *«¿Esto es Autodesk?»* — El visor usa su motor bajo licencia; los datos,
  la gestión documental y el control de acceso son nuestros, en nuestra
  infraestructura.
- *«¿Cuándo puede usarlo un tercero?»* — Falta cerrar CAPA 9 (en curso hoy)
  y el gate de segundo custodio; el piloto externo es el siguiente hito.
