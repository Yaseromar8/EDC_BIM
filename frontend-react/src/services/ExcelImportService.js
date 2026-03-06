
import * as XLSX from 'xlsx';

/**
 * Parses an Excel file and returns structured data.
 * Expected format: 
 * Columns: ID Elemento (optional), Item, Description, Weight (Incidencia), Progress (Avance), etc.
 * 
 * @param {File} file - The file object from input.
 * @returns {Promise<Object>} - Mapping of ElementID -> Array of Rows
 */
export const parseExcelProgress = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const workbook = XLSX.read(e.target.result, { type: 'binary' });
                // Assume first sheet is the relevant one
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet);

                // Process data into a map: ElementID -> Detailed Data
                // If the Excel doesn't have "Element ID", we might need a dialog or convention.
                // For now, let's assume a column "ID Elemento" or similar exists, or use a default key if missing.

                // Group by Element ID (if multiple rows belong to one element)
                // Or if each row is an element, just map.
                // Based on user description: One element has multiple "Partidas" (rows).
                // So we likely need a column "ID Elemento" acting as Grouper.

                const groupedData = {};

                jsonData.forEach(row => {
                    // Try to find the Key (ID of the 3D Element)
                    // Keys might be 'ID', 'Elemento', 'dbId', etc. Normalizing keys.
                    const keys = Object.keys(row);
                    const idKey = keys.find(k => k.toLowerCase().includes('id') || k.toLowerCase().includes('elemento'));

                    if (idKey && row[idKey]) {
                        const id = row[idKey].toString().trim();
                        if (!groupedData[id]) {
                            groupedData[id] = [];
                        }
                        groupedData[id].push(row);
                    }
                });

                resolve(groupedData);

            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = (error) => reject(error);
        reader.readAsBinaryString(file);
    });
};
