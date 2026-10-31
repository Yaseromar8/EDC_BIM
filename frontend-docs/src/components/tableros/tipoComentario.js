/**
 * El registro del comentario para el Lienzo (design/lienzo/Lienzo.jsx, `tipos`; docs/visor/64). Protegido (no se borra
 * ni se corta desde el lienzo: el hilo se elimina desde el propio hilo, y solo quien lo abrió o un administrador) y no
 * copiable (no se pegan ni se duplican mensajes de otros). Elegido, sin marco ni barra: un clic abre su hilo.
 */
import PinComentario from './PinComentario';
import { textoDe } from './comentarios';

export function tipoComentario({ abrir }) {
  return {
    Pieza: PinComentario,
    redimensionable: false,
    sinMarco: true,
    etiqueta: 'Comentario',
    texto: textoDe,
    alDobleClic: (el) => abrir(el.id),
    protegido: () => true,
    copiable: false,
    limpiar: () => null,
  };
}
