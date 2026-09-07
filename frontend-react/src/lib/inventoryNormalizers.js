// Existing App preload and refresh algorithms, extracted without convergence.
// Their property-name divergence remains an explicit B2 KNOWN FAIL.
import { withInventoryIdentity } from './inventoryIdentity.js';

export function normalizeInventoryPreload(dbData, normalizeRevitCategory) {
        const schemaMap = {};

        // Flatten as in InventoryDataGrid
        const mappedData = dbData.map(node => {
          let row = {
            dbId: node.external_id,
            model_urn: node.model_urn,
            source_urn: node.source_urn || node.model_urn,
            Name: node.name,
            Material: node.material || '',
            Status: node.installation_status || '',
            Vaciado_Nro: node.vaciado_nro || ''
          };
          if (node.properties && typeof node.properties === 'object') {
            Object.entries(node.properties).forEach(([cName, cVal]) => {
              if (typeof cVal === 'object' && cVal !== null) {
                Object.entries(cVal).forEach(([rawPName, pVal]) => {
                  // Civil 3D: strip redundant group prefix from property name
                  let pName = rawPName;
                  if (pName.startsWith(cName)) {
                    let cleaned = pName.slice(cName.length).replace(/^[\s\-\_\.]+/, '');
                    if (cleaned.length > 0) pName = cleaned;
                  } else if (cName.toUpperCase() === 'PROPERTY SETS' && pName.match(/^.*?\s*[\-\u2013\u2014]\s*(.+)$/)) {
                    pName = pName.match(/^.*?\s*[\-\u2013\u2014]\s*(.+)$/)[1];
                  }
                  const val = Array.isArray(pVal) ? pVal.map(x => String(x ?? '').trim()).filter(Boolean).join(', ') : String(pVal).trim();
                  // FIX: Solo sobreescribir si el nuevo valor no está vacío,
                  // o si la propiedad aún no existe. Esto protege los valores válidos.
                  if (val !== '' || !row.hasOwnProperty(pName) || row[pName] === '') {
                    row[pName] = val;
                  }

                  // Construir esquema exacto para FilterConfigurator
                  const key = cName + '::' + pName;
                  if (!schemaMap[key]) {
                    schemaMap[key] = {
                      id: key,
                      name: pName,
                      category: cName,
                      group: 'text',
                      path: cName + ' ▸ ' + pName
                    };
                  }
                });
              }
            });
          }

          // Inyectar "Revit Category" normalizada (ES→EN, linked models, etc.)
          const rawCat = node.properties?.['__category__']?.['__category__']
            || row['__category__']  // ya aplanado por el loop anterior
            || '(Unassigned)';
          row['Revit Category'] = normalizeRevitCategory(rawCat);

          return withInventoryIdentity(node, row);
        });
    return { mappedData, schemaMap };
}

export function normalizeInventoryRefresh(dbData, normalizeRevitCategory) {
          const schemaMap = {};
          const mappedData = dbData.map(node => {
            let row = {
              dbId: node.external_id,
              model_urn: node.model_urn,
              source_urn: node.source_urn || node.model_urn,
              Name: node.name,
              Material: node.material || '',
              Status: node.installation_status || '',
              Vaciado_Nro: node.vaciado_nro || ''
            };
            if (node.properties && typeof node.properties === 'object') {
              Object.entries(node.properties).forEach(([cName, cVal]) => {
                if (typeof cVal === 'object' && cVal !== null) {
                  Object.entries(cVal).forEach(([rawPName, pVal]) => {
                    let pName = rawPName;
                    for (const d of [' - ', ' \u2013 ', ' \u2014 ']) {
                      if (pName.startsWith(cName + d)) { pName = pName.slice((cName + d).length); break; }
                    }
                    const val = Array.isArray(pVal) ? pVal.map(x => String(x ?? '').trim()).filter(Boolean).join(', ') : String(pVal).trim();
                    if (val !== '' || !row.hasOwnProperty(pName) || row[pName] === '') {
                      row[pName] = val;
                    }
                    const key = cName + '::' + pName;
                    if (!schemaMap[key]) {
                      schemaMap[key] = { id: key, name: pName, category: cName, group: 'text', path: cName + ' ▸ ' + pName };
                    }
                  });
                }
              });
            }
            const rawCat2 = node.properties?.['__category__']?.['__category__']
              || row['__category__']
              || '(Unassigned)';
            row['Revit Category'] = normalizeRevitCategory(rawCat2);
            return withInventoryIdentity(node, row);
          });

    return { mappedData, schemaMap };
}
