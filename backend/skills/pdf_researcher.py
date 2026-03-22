import fitz  # PyMuPDF
import pdfplumber
import os
import re
import time

class PDFResearcher:
    def __init__(self, base_dir):
        self.base_dir = base_dir

    def search_keyword(self, keyword, file_limit=10, max_pages_per_file=2000):
        """
        Busca una palabra clave usando métodos nativos de PyMuPDF para máxima velocidad.
        """
        results = []
        pdf_files = []
        for root, dirs, files in os.walk(self.base_dir):
            for file in files:
                if file.lower().endswith('.pdf'):
                    pdf_files.append(os.path.join(root, file))
        
        # Priorizar por nombre y tamaño (los más grandes suelen ser las memorias descriptivas)
        pdf_files.sort(key=lambda x: (
            ("RP-HD" in x or "HI" in x or "MEM" in x), 
            os.path.getsize(x)
        ), reverse=True)

        count = 0
        for file_path in pdf_files:
            if count >= file_limit: break
            start_time = time.time()
            print(f"[Researcher] Analizando {os.path.basename(file_path)}...")
            
            try:
                doc = fitz.open(file_path)
                num_pages = len(doc)
                
                # Para archivos masivos, usamos búsqueda nativa que es 10x más rápida
                for page_num in range(num_pages):
                    if page_num > max_pages_per_file: break # Safety limit
                    
                    page = doc[page_num]
                    # search_for es mucho más rápido que get_text() + 'in' text
                    matches = page.search_for(keyword)
                    
                    if matches:
                        # Solo extraemos texto si hay match
                        text = page.get_text().replace('\n', ' ')
                        snippet = f"...{text[max(0, text.lower().find(keyword.lower())-50):text.lower().find(keyword.lower())+len(keyword)+50]}..."
                        
                        results.append({
                            "file": os.path.basename(file_path),
                            "full_path": file_path,
                            "page": page_num + 1,
                            "snippet": snippet
                        })
                        # Si ya encontramos en este archivo, pasamos al siguiente para diversidad
                        # a menos que queramos exhaustivo. Para el Agente, diversidad es mejor.
                        if len(results) >= 5: break 
                
                doc.close()
                count += 1
                print(f"[Researcher] Finalizado {os.path.basename(file_path)} en {time.time()-start_time:.2f}s")
            except Exception as e:
                print(f"[Researcher] Error en {file_path}: {e}")
        
        return results

    def extract_page(self, file_path, page_num):
        """
        Extrae el texto de una página específica intentando preservar tablas si es posible.
        """
        try:
            # Intentar primero con pdfplumber para tablas (muy superior para layouts)
            with pdfplumber.open(file_path) as pdf:
                if page_num <= 0 or page_num > len(pdf.pages):
                    return "Página fuera de rango"
                
                page = pdf.pages[page_num - 1]
                
                # Extraer tablas
                tables = page.extract_tables()
                if tables:
                    table_str = ""
                    for table in tables:
                        # Convertir tabla a Markdown simple
                        for row in table:
                            # Filtrar celdas None y limpiar texto
                            clean_row = [str(cell).replace('\n', ' ').strip() if cell else "" for cell in row]
                            table_str += "| " + " | ".join(clean_row) + " |\n"
                        table_str += "\n"
                    
                    # También extraemos el texto normal (sin las tablas si es posible, o todo junto)
                    # Para simplicidad y contexto completo, devolvemos tablas formateadas + texto
                    text = page.extract_text() or ""
                    return f"--- TABLAS ENCONTRADAS ---\n{table_str}\n--- TEXTO COMPLETO ---\n{text}"
                
                # Si no hay tablas detectadas, usamos texto plano de pdfplumber
                return page.extract_text() or "No se pudo extraer texto de la página."
                
        except Exception as e:
            # Fallback a fitz si pdfplumber falla
            try:
                doc = fitz.open(file_path)
                page = doc[page_num - 1]
                text = page.get_text("text")
                doc.close()
                return text
            except:
                return f"Error al extraer página: {e}"

if __name__ == "__main__":
    # Test simple
    researcher = PDFResearcher("D:/VISOR_APS_TL/backend/uploads/documents")
    print(researcher.search_keyword("CP-APN-7"))
