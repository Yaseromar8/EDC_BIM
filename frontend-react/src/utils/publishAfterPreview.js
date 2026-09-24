// Una sola acción explícita del administrador prepara la capa y la publica.
// Nunca se escribe el puntero compartido si la comprobación local falló.
export async function publishAfterPreview(prepare, publish) {
  if (await prepare() !== true) return false;
  return publish();
}
