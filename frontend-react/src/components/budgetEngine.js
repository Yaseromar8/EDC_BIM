/**
 * budgetEngine.js – Motor de Cálculo BIM 5D (PostgreSQL Optimized)
 * ================================================================
 * Extrae propiedades de medición usando la caché de PostgreSQL (window.postgresInventory)
 * o hace fallback a la API nativa de APS si no está disponible.
 */

const UNIT_PROPERTY_MAP = {
  // Longitud
  'm':     { natives: ['Length', 'Longitud', 'Curve Length'], fallbacks: ['02_02_DSI_Longitud1', '02_02_DSI_Longitud2', '02_02_DSI_Longitud3', '02_02_DSI_Longitud4'] },
  'ml':    { natives: ['Length', 'Longitud', 'Curve Length'], fallbacks: ['02_02_DSI_Longitud1', '02_02_DSI_Longitud2', '02_02_DSI_Longitud3', '02_02_DSI_Longitud4'] },
  // Área
  'm2':    { natives: ['Area', 'Área', 'Surface Area'], fallbacks: ['02_04_DSI_Area1', '02_04_DSI_Area2', '02_04_DSI_Area3', '02_04_DSI_Area4'] },
  // Volumen
  'm3':    { natives: ['Volume', 'Volumen'], fallbacks: ['02_05_DSI_Volumen1', '02_05_DSI_Volumen2', '02_05_DSI_Volumen3', '02_05_DSI_Volumen4'] },
  // Unidades (conteo o genérico)
  'und':   { natives: [], fallbacks: ['03_06_DSI_Metrado1', '03_06_DSI_Metrado2', '03_06_DSI_Metrado3', '03_06_DSI_Metrado4'], countMode: true },
  'pza':   { natives: [], fallbacks: ['03_06_DSI_Metrado1', '03_06_DSI_Metrado2', '03_06_DSI_Metrado3', '03_06_DSI_Metrado4'], countMode: true },
  // Global (siempre 1)
  'glb':   { natives: [], fallbacks: ['03_06_DSI_Metrado1', '03_06_DSI_Metrado2', '03_06_DSI_Metrado3', '03_06_DSI_Metrado4'], globalMode: true },
  // Peso
  'kg':    { natives: ['Weight', 'Mass', 'Peso'], fallbacks: ['02_06_DSI_Peso1', '02_06_DSI_Peso2', '02_06_DSI_Peso3', '02_06_DSI_Peso4', '03_06_DSI_Metrado1', '03_06_DSI_Metrado2', '03_06_DSI_Metrado3', '03_06_DSI_Metrado4'] },
  'tn':    { natives: ['Weight', 'Mass', 'Peso'], fallbacks: ['02_06_DSI_Peso1', '02_06_DSI_Peso2', '02_06_DSI_Peso3', '02_06_DSI_Peso4', '03_06_DSI_Metrado1', '03_06_DSI_Metrado2', '03_06_DSI_Metrado3', '03_06_DSI_Metrado4'] },
  // Transporte
  'm3-km': { natives: ['Volume', 'Volumen'], fallbacks: ['02_05_DSI_Volumen1', '02_05_DSI_Volumen2', '02_05_DSI_Volumen3', '02_05_DSI_Volumen4'] },
  // Tiempo
  'mes':   { natives: [], fallbacks: ['03_06_DSI_Metrado1', '03_06_DSI_Metrado2', '03_06_DSI_Metrado3', '03_06_DSI_Metrado4'] },
  'dia':   { natives: [], fallbacks: ['03_06_DSI_Metrado1', '03_06_DSI_Metrado2', '03_06_DSI_Metrado3', '03_06_DSI_Metrado4'] },
};

/**
 * Recorre la data de PostgreSQL en memoria para agrupar mediciones por CodigoDePartida.
 */
export function extractModelMeasurements() {
  return new Promise((resolve) => {
    if (window.postgresInventory && window.postgresInventory.length > 0) {
      console.log(`[BudgetEngine] Usando ${window.postgresInventory.length} elementos desde PostgreSQL (Strict Mode)`);
      const partidaData = {};
      const seenElements = new Set();

      for (let i = window.postgresInventory.length - 1; i >= 0; i--) {
        const row = window.postgresInventory[i];
        
        // --- CDE VERSIONING DEDUPLICATION ---
        // If a file was updated, older versions remain in DB. Keep only the newest.
        const baseUrn = (row.source_urn || row.model_urn || '').split('?')[0];
        const uniqueKey = baseUrn + '|' + row.dbId;
        
        if (seenElements.has(uniqueKey)) continue;
        seenElements.add(uniqueKey);
        // --- GHOST ELEMENT FILTER (Categorías de Sistema) ---
        // Estas categorías son lógicas analíticas de Revit, sin geometría propia.
        // Sus metrados duplicarían los de los elementos físicos reales.
        const BLACKLIST_CATEGORIES = [
          'Lines', 'Líneas',
          'Piping Systems', 'Sistemas de tuberías',
          'Duct Systems', 'Sistemas de conductos',
          'Analytical Models', 'Modelos analíticos',
          'Pipe Insulations', 'Aislamientos de tubería'
        ];
        
        const category = row['Revit Category'] || row['__category__'] || '';

        if (BLACKLIST_CATEGORIES.includes(category)) continue;

        // Fallback Dinámico para Acero (Si falta Peso1 pero existe Peso Específico + Longitud)
        if (!row['02_06_DSI_Peso1'] && !row['02_06_DSI_Peso2']) {
           const specificWeight = parseFloat(row['02_06_DSI_Peso']);
           const totalLength = parseFloat(row['Longitud total de barra'] || row['Total Bar Length'] || row['02_02_DSI_Longitud1']);
           if (!isNaN(specificWeight) && !isNaN(totalLength) && specificWeight > 0) {
              row['02_06_DSI_Peso1'] = specificWeight * totalLength;
           }
        }

        const SLOTS = [1, 2, 3, 4];
        SLOTS.forEach(slot => {
           let code = row[`03_05_DSI_CodigoDePartida${slot}`];
           if (!code) return;
           code = String(code).trim();
           if (!code) return;

           if (!partidaData[code]) {
              partidaData[code] = { count: 0, dbIds: [], elements: [] };
           }
           
           partidaData[code].count++;
           if (row.dbId) partidaData[code].dbIds.push({ id: row.dbId, modelUrn: row.source_urn || row.model_urn });

           const elData = { 
             dbId: row.dbId, 
             modelUrn: row.source_urn || row.model_urn,
             name: row.name || row.Name || `Elemento [${row.dbId}]`, 
             props: {},
             matchedSlot: slot
           };

           // Extraer únicamente los parámetros nativos y custom indicados (DSI)
           const propsToSum = [
             'Length', 'Longitud', 'Curve Length', 'Longitud total de barra', 'Total Bar Length',
             'Area', 'Área', 'Surface Area',
             'Volume', 'Volumen',
             'Weight', 'Mass', 'Peso',
             '02_02_DSI_Longitud1', '02_02_DSI_Longitud2', '02_02_DSI_Longitud3', '02_02_DSI_Longitud4',
             '02_04_DSI_Area1', '02_04_DSI_Area2', '02_04_DSI_Area3', '02_04_DSI_Area4',
             '02_05_DSI_Volumen1', '02_05_DSI_Volumen2', '02_05_DSI_Volumen3', '02_05_DSI_Volumen4',
             '02_06_DSI_Peso1', '02_06_DSI_Peso2', '02_06_DSI_Peso3', '02_06_DSI_Peso4',
             '03_06_DSI_Metrado1', '03_06_DSI_Metrado2', '03_06_DSI_Metrado3', '03_06_DSI_Metrado4'
           ];

           for (const pName of propsToSum) {
             const val = row[pName];
             if (val !== undefined && val !== null && val !== '') {
                const numVal = parseFloat(val);
                if (!isNaN(numVal) && numVal > 0) {
                   elData.props[pName] = numVal;
                }
             }
           }

           const metaProps = [
             '01_11_DSI_Ubicacion', '01_12_DSI_SubUbicacion', '01_13_DSI_Zona', '01_14_DSI_SubZona',
             '03_04_DSI_NombreDePartida1', '03_04_DSI_NombreDePartida2', '03_04_DSI_NombreDePartida3', '03_04_DSI_NombreDePartida4',
             '03_05_DSI_CodigoDePartida1', '03_05_DSI_CodigoDePartida2', '03_05_DSI_CodigoDePartida3', '03_05_DSI_CodigoDePartida4',
             '02_01_DSI_Unidad1', '02_01_DSI_Unidad2', '02_01_DSI_Unidad3', '02_01_DSI_Unidad4'
           ];
           for (const pName of metaProps) {
             if (row[pName] !== undefined && row[pName] !== null && row[pName] !== '') {
               elData.props[pName] = row[pName];
             }
           }

           partidaData[code].elements.push(elData);
        }); // End SLOTS
      } // End for loop
      return resolve(partidaData);
    }
    
    // Si no hay Postgres, fallamos de forma segura sin intentar PropertyDB
    console.warn('[BudgetEngine] postgresInventory vacío o indefinido. Extracción fallida.');
    return resolve({});
  });
}

/**
 * Calcula el METRADO REAL para cada partida.
 */
export function calculateMetradoReal(presupuestoRows, modelData) {
  const result = {};

  presupuestoRows.forEach((row) => {
    if (row.es_titulo) return;

    const item = row.item;
    const unidad = (row.unidad || '').toLowerCase().trim();
    const modelEntry = modelData[item];

    if (!modelEntry || modelEntry.count === 0) {
      result[item] = { metrado_real: null, status: 'no_link', dbIds: [] };
      return;
    }

    const unitConfig = UNIT_PROPERTY_MAP[unidad] || { natives: [], fallbacks: ['Metrado1', '03_06_DSI_Metrado1'] };
    
    let totalMetrado = 0;
    const detailedElements = [];

    modelEntry.elements.forEach(el => {
      const slot = el.matchedSlot; // 1, 2, or 3
      let val = null;
      let chosenProp = null;

      if (unitConfig.globalMode) {
         val = null; // We handle global outside the loop
      } else if (unitConfig.countMode) {
         // Buscar Metrado especifico del slot
         const slotProp = `03_06_DSI_Metrado${slot}`;
         if (el.props[slotProp]) { val = el.props[slotProp]; chosenProp = slotProp; }
         else { val = 1; chosenProp = 'count'; }
      } else {
         // Prioridad 1: Fallback especifico del Slot (Ej. Area2 para el Slot 2)
         let found = false;
         for (const fbProp of (unitConfig.fallbacks || [])) {
            if (fbProp.endsWith(String(slot)) && el.props[fbProp]) {
               val = el.props[fbProp]; chosenProp = fbProp; found = true; break;
            }
         }
         // Prioridad 2: Propiedades nativas (Length, Area, Volume)
         if (!found) {
            for (const natProp of (unitConfig.natives || [])) {
               if (el.props[natProp]) { val = el.props[natProp]; chosenProp = natProp; found = true; break; }
            }
         }
         // PROHIBIDO: Si no lo encuentra en su propio slot (ni en nativo), 
         // se reporta como 0 (No metrado). 
         // No se permite cruzar valores de otros slots (ej. usar Area1 para la Partida 2).
      }

      if (val !== null && val > 0) {
         if (!unitConfig.globalMode) totalMetrado += val;
         detailedElements.push({
           dbId: el.dbId,
           name: el.name,
           value: val,
           prop: chosenProp,
           matchedSlot: slot,
           rawProps: el.props
         });
      }
    });

    let metrado = unitConfig.globalMode ? 1.00 : totalMetrado;
    if (metrado === 0) metrado = null;

    if (metrado === null || metrado === 0) {
      result[item] = { metrado_real: 0, status: 'no_metrado', dbIds: modelEntry.dbIds, elements: [] };
    } else {
      result[item] = { metrado_real: metrado, status: 'complete', dbIds: modelEntry.dbIds, elements: detailedElements };
    }
  });

  return result;
}
