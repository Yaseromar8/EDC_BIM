/**
 * La instancia ÚNICA del itemizado de la obra en el visor (lib/itemizadoDeObra.js), con la red real.
 * App la carga al abrir la obra; la Planilla y los campos derivados la leen.
 */
import { pedirPlanilla } from './planillaServidor';
import { crearAlmacenDeItemizado } from '../lib/itemizadoDeObra';

export const itemizadoDeObra = crearAlmacenDeItemizado({ pedir: pedirPlanilla });
