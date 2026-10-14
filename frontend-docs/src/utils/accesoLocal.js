const LOOPBACK = new Set(['localhost', '127.0.0.1']);

export function esSesionDeEnsayoEnBackendReal(backendReal, token) {
  return backendReal && token === 'DEMO_TOKEN';
}

export function permiteAccesoLocal({ desarrollo, nativo, hostname, backendUrl, backendReal,
  invitacion, reset, ticket, forzarLogin }) {
  if (!desarrollo || nativo || backendReal || invitacion || reset || ticket || forzarLogin
      || !LOOPBACK.has(hostname)) return false;

  // Sin URL explícita, Vite sirve /api por su proxy local. Una URL absoluta
  // sólo puede usar la identidad de ensayo si TAMBIÉN termina en loopback.
  if (!backendUrl) return true;
  try {
    const backend = new URL(backendUrl);
    return ['http:', 'https:'].includes(backend.protocol)
      && LOOPBACK.has(backend.hostname);
  } catch {
    return false;
  }
}
