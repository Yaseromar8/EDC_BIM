// El estado de la tira de documentos del lector, con una distinción fina que
// el propietario pidió en dos pasos y que conviene dejar escrita:
//
//   · SALTAR entre planos (flechas o miniaturas) NO la cierra — cerrarla en
//     cada salto obligaba a reabrirla para cada plano y mataba la fluidez.
//   · ABRIR un PDF desde el explorador la empieza CERRADA — «si abro el pdf
//     no debe iniciarse hasta que yo diga». Que una pantalla se despliegue
//     sola porque una vez la abriste es decidir por el usuario.
//
// Por eso la memoria vive en el módulo (sobrevive al remontaje del lector,
// que es lo que ocurre al saltar) y NO en el navegador: cada vez que se abre
// un documento desde el explorador, se reinicia.

let abierta = false;

export function tiraEstaAbierta() {
  return abierta;
}

export function recordarTira(valor) {
  abierta = !!valor;
}

export function reiniciarTira() {
  abierta = false;
}
