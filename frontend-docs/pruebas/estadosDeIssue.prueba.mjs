// Banco de los estados de una incidencia (migración 45): node frontend-docs/pruebas/estadosDeIssue.prueba.mjs
// Los códigos tienen que ser los de backend/flujo_de_issue.py y del CHECK de backend/sql/45_estados_de_issue.sql.
import { readFileSync } from 'node:fs';
import {
  ESTADOS_DE_ISSUE, OPCIONALES, CODIGOS_VIVOS, estadoDeIssue, issueViva, usaEstado, actosDeIssue, puedeVerificar,
  aQuienLeTocaIssue, EVENTOS_DE_ISSUE,
} from '../src/utils/estadosDeIssue.js';
import { filasDelInforme } from '../src/utils/informeDeIncidencias.js';

let pass = 0, fail = 0;
function test(nombre, fn) {
  try { fn(); pass++; console.log(JSON.stringify({ name: nombre, status: 'PASS' })); }
  catch (e) { fail++; console.log(JSON.stringify({ name: nombre, status: 'FAIL', error: String(e) })); }
}
function igual(a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); }

test('los códigos son los del CHECK de la 45 y los opcionales también', () => {
  const sql = readFileSync(new URL('../../backend/sql/45_estados_de_issue.sql', import.meta.url), 'utf8');
  const check = /CHECK \(estado IN \(([^)]*)\)\)/.exec(sql)[1].match(/'([^']+)'/g).map(x => x.slice(1, -1));
  igual([...check].sort(), ESTADOS_DE_ISSUE.map(e => e.codigo).sort());
  const opc = /opcionales <@ ARRAY\[([^\]]*)\]/.exec(sql)[1].match(/'([^']+)'/g).map(x => x.slice(1, -1));
  igual([...opc].sort(), [...OPCIONALES].sort());
});

test('las etiquetas son las de ACC y los vivos los del servidor', () => {
  igual(['Corregido', 'Reabierto', 'Verificado'].map(c => estadoDeIssue(c).etiqueta), ['En revisión', 'No aprobada', 'Cerrada']);
  igual(CODIGOS_VIVOS, ['Abierto', 'En curso', 'En disputa', 'Corregido', 'Reabierto']);
  if (issueViva({ estado: 'Borrador' }) || !issueViva({ estado: 'En disputa' })) throw new Error('viva');
  igual(estadoDeIssue('raro').etiqueta, 'raro');
});

test('una obra puede apagar solo los opcionales', () => {
  igual([usaEstado('En curso', null), usaEstado('En curso', []), usaEstado('Corregido', [])], [true, false, true]);
});

test('cada acto es de quien le toca', () => {
  const i = { estado: 'Abierto', autor_id: 7, responsable_id: 9, verificador_id: 7 };
  igual(actosDeIssue(i, 9), { enviar: false, empezar: true, corregir: true, disputar: true, reafirmar: false, anular: false });
  igual(actosDeIssue(i, 7), { enviar: false, empezar: false, corregir: false, disputar: false, reafirmar: false, anular: true });
  igual(actosDeIssue({ ...i, estado: 'En disputa' }, 9).corregir, false);           // primero decide quien la levantó
  igual(actosDeIssue({ ...i, estado: 'En disputa' }, 11, { esAdmin: true }).reafirmar, true);
  igual(actosDeIssue({ ...i, estado: 'Borrador' }, 7).enviar, true);
  igual(actosDeIssue({ ...i, estado: 'Borrador' }, 9).corregir, false);
  igual(actosDeIssue({ ...i, estado: 'Corregido' }, 9).corregir, false);
});

test('verificar: el designado; el responsable solo con autoverificación', () => {
  const i = { estado: 'Corregido', responsable_id: 9, verificador_id: 7 };
  igual([puedeVerificar(i, 7), puedeVerificar(i, 9), puedeVerificar({ ...i, autoverificacion: true }, 9)], [true, false, true]);
  igual(puedeVerificar({ ...i, verificador_id: null }, 11, true), true);
  igual(puedeVerificar({ ...i, estado: 'Abierto' }, 7), false);
});

test('a quién le toca y el historial, en palabras', () => {
  igual(aQuienLeTocaIssue({ estado: 'En curso', responsable: 'Luis' }), 'Corrigiendo: Luis');
  igual(aQuienLeTocaIssue({ estado: 'Borrador' }), 'Sin enviar');
  igual(aQuienLeTocaIssue({ estado: 'Verificado' }), 'Cerrada');
  for (const e of ['sent', 'started', 'disputed', 'reaffirmed']) if (!EVENTOS_DE_ISSUE[e]) throw new Error(e);
});

test('el informe: persona o empresa, vencida solo si sigue viva, y los campos propios al final', () => {
  const campos = [{ clave: 'partida', etiqueta: 'Partida', tipo: 'lista' }, { clave: 'inspeccion', etiqueta: 'Inspección', tipo: 'fecha' }];
  const { cabecera, filas } = filasDelInforme([
    { codigo: 'ISS-1', tipo_etiqueta: 'Punch', estado: 'Abierto', titulo: 'Junta', responsable_id: 9, vence_en: '2026-01-01',
      campos: { partida: '02', inspeccion: '2026-02-03' }, creado_en: '2025-12-20T10:00:00' },
    { codigo: 'ISS-2', estado: 'Verificado', titulo: 'Cota', responsable_empresa: 40, vence_en: '2026-01-01', causa_raiz: 'Diseño' },
  ], { nombres: { 9: 'Luis' }, empresas: { 40: 'Contratista SAC' }, campos, hoy: '2026-11-02' });
  igual(cabecera.slice(-2), ['Partida', 'Inspección']);
  igual([filas[0][4], filas[0][5], filas[0][7], filas[0][8], filas[0][11], filas[0][12], filas[0][13]],
    ['Abierta', 'Luis', '01/01/2026', 'Sí', '20/12/2025', '02', '03/02/2026']);
  igual([filas[1][4], filas[1][5], filas[1][8], filas[1][9]], ['Cerrada', 'Contratista SAC', '', 'Diseño']);
  igual(filas[1][1], 'Observación de documento');
});

console.log(JSON.stringify({ suite: 'estadosDeIssue', pass, fail }));
if (fail) process.exit(1);
