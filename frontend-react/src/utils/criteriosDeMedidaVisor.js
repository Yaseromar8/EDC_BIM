/**
 * La instancia ÚNICA de los criterios de medida de la obra en el visor (lib/criteriosDeMedida.js,
 * docs/visor/32), con la red real. App la carga al abrir la obra, junto con el itemizado.
 */
import { pedirPlanilla } from './planillaServidor';
import { crearAlmacenDeCriterios } from '../lib/criteriosDeMedida';

export const criteriosDeMedida = crearAlmacenDeCriterios({ pedir: pedirPlanilla });
