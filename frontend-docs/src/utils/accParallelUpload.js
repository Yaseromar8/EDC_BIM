const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 2000;

/** Sólo PUT a URLs S3 temporales; nunca recibe ni muestra un token APS. */
export async function uploadAccParts(file, plan, signal) {
  if (!plan || !Array.isArray(plan.urls) || !plan.urls.length ||
      !Number.isInteger(plan.partSize) || plan.partSize < 5 * 1024 * 1024 ||
      plan.urls.length !== Math.ceil(file.size / plan.partSize)) {
    throw new Error('Plan de subida ACC inválido');
  }
  for (let index = 0; index < plan.urls.length; index++) {
    const part = file.slice(index * plan.partSize,
      Math.min(file.size, (index + 1) * plan.partSize));
    let accepted = false;
    for (let attempt = 0; attempt < MAX_RETRIES && !accepted; attempt++) {
      if (signal.aborted) throw new DOMException('Carga cancelada', 'AbortError');
      try {
        // Blob sin Content-Type evita firmar cabeceras adicionales.
        const response = await fetch(plan.urls[index], { method: 'PUT', body: part, signal });
        accepted = response.ok;
      } catch {
        // Una falla de red o CORS activa la copia GCS→ACC probada.
        if (signal.aborted) throw new DOMException('Carga cancelada', 'AbortError');
      }
      if (!accepted && attempt + 1 < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, BASE_RETRY_DELAY * (attempt + 1)));
      }
    }
    if (!accepted) throw new Error('ACC no aceptó una parte; se usará la copia de respaldo');
  }
}
