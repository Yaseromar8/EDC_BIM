import os
import json
from db import get_db_connection
from gcs_manager import GCSManager  # Reusing your existing GCS logic
import google.generativeai as genai

# Setup AI (using the GOOGLE_API_KEY from your .env)
# The user already has this in their .env
genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))

class BIMAIProcessor:
    def __init__(self):
        self.gcs = GCSManager()
        self.model = genai.GenerativeModel('gemini-1.5-pro-002')

    def get_project_documents(self, model_urn, category_tag=None):
        """
        List PDFs from the existing file_nodes table for a specific project.
        """
        docs = []
        with get_db_connection() as conn:
            cursor = conn.cursor()
            query = """
                SELECT id, name, gcs_urn, metadata 
                FROM file_nodes 
                WHERE model_urn = %s 
                AND mime_type = 'application/pdf' 
                AND is_deleted = FALSE
            """
            params = [model_urn]
            
            if category_tag:
                query += " AND %s = ANY(tags)"
                params.append(category_tag)
                
            cursor.execute(query, tuple(params))
            rows = cursor.fetchall()
            for row in rows:
                docs.append({
                    "id": row[0],
                    "name": row[1],
                    "gcs_urn": row[2],
                    "metadata": row[3]
                })
        return docs

    def process_pdf_for_rag(self, gcs_urn):
        """
        Download PDF from GCS and prepare it for the AI brain.
        Reuses your gcs_manager to maintain consistency.
        """
        # Note: We'll need a way to read the blob. 
        # Assuming gcs_manager has a way to get bytes or we use its logic.
        print(f"DEBUG: Processing document from {gcs_urn}...")
        # To be implemented: extraction and chunking logic
        pass

    def ask_ai_with_hitl(self, model_urn, question):
        """
        Main entry point for queries. 
        Will eventually incorporate the HITL Feedback Buffer logic.
        """
        # 1. Look for human-overridden rewards in the (to-be-created) feedback table
        # 2. Retrieve relevant chunks from RAG
        # 3. Generate response
        pass

if __name__ == "__main__":
    # Test: List docs from a sample project
    processor = BIMAIProcessor()
    # Replace with a real URN from your DB to test
    # sample_urn = "..."
    # print(processor.get_project_documents(sample_urn))
