import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';

export const downloadFolderAsZip = async (folderId, modelUrn, API_BASE_URL, folderName = "Descarga_Carpeta") => {
    const toastId = toast.loading(`Obteniendo hipervínculos para "${folderName}"...`);
    
    try {
        const url = new URL(`${API_BASE_URL}/api/docs/download_folder_urls`);
        url.searchParams.append("folder_id", folderId);
        url.searchParams.append("model_urn", modelUrn);

        const token = localStorage.getItem('visor_session_token') || sessionStorage.getItem('visor_session_token');
        const fetchOptions = token ? { headers: { 'Authorization': `Bearer ${token}` } } : {};
        
        const manifestResponse = await fetch(url, fetchOptions);
        const mData = await manifestResponse.json();
        
        if (!manifestResponse.ok || !mData.success) {
            throw new Error(mData.error || "Fallo al obtener el manifiesto");
        }

        const manifest = mData.manifest;
        if (!manifest || manifest.length === 0) {
            toast.success("La carpeta está vacía.", { id: toastId });
            return;
        }

        const zip = new JSZip();
        toast.loading(`Descargando ${manifest.length} archivos en paralelo...`, { id: toastId });

        const downloadPromises = manifest.map(async (fileNode) => {
            try {
                const response = await fetch(fileNode.url);
                if (!response.ok) return null;
                const blob = await response.blob();
                zip.file(fileNode.path, blob);
            } catch (err) {
                console.error(`[Fetch Download Error] ${fileNode.path}:`, err);
            }
        });

        await Promise.all(downloadPromises);
        toast.loading("Zipeando bloque completado, preparando archivo...", { id: toastId });
        
        const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
        saveAs(zipBlob, `${folderName}.zip`);
        toast.success(`Descarga de "${folderName}" exitosa.`, { id: toastId });

    } catch (err) {
        console.error("Error en downloadFolderAsZip:", err);
        toast.error(`Error de descarga: ${err.message}`, { id: toastId });
    }
};
