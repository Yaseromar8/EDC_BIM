import assert from 'node:assert/strict';
import { permiteAccesoLocal, esSesionDeEnsayoEnBackendReal } from '../src/utils/accesoLocal.js';

const base = {
  desarrollo: true, nativo: false, hostname: 'localhost',
  backendUrl: 'http://127.0.0.1:3000', invitacion: '', reset: '',
  ticket: '', forzarLogin: false,
};

assert.equal(permiteAccesoLocal(base), true);
assert.equal(permiteAccesoLocal({ ...base, hostname: '127.0.0.1', backendUrl: '' }), true);
for (const variante of [
  { desarrollo: false },
  { nativo: true },
  { hostname: '192.168.1.20' },
  { backendUrl: 'https://visor-ecd-backend.onrender.com' },
  { backendUrl: 'javascript:alert(1)' },
  { backendReal: true, backendUrl: 'http://localhost:5174' },
  { invitacion: 'invitacion' },
  { reset: 'restablecer' },
  { ticket: 'ticket-ss0' },
  { forzarLogin: true },
]) {
  assert.equal(permiteAccesoLocal({ ...base, ...variante }), false,
    JSON.stringify(variante));
}

assert.equal(esSesionDeEnsayoEnBackendReal(true, 'DEMO_TOKEN'), true);
assert.equal(esSesionDeEnsayoEnBackendReal(false, 'DEMO_TOKEN'), false);
assert.equal(esSesionDeEnsayoEnBackendReal(true, 'token-real'), false);
console.log('accesoLocal: 15 casos correctos');
