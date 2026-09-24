// La UI solo puede retirar un modelo despues de confirmar el unlink servidor.
export async function removeLinkedModel(apiFetch, backendUrl, projectId, urn) {
  const res = await apiFetch(`${backendUrl}/api/config/project/remove`, {
    method: 'POST',
    body: JSON.stringify({ urn, project: projectId }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || `No se pudo desvincular el modelo (${res.status}).`);
  }
}
