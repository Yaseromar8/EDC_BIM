import os
import json
from google.cloud import billing
from google.oauth2 import service_account

def check_billing():
    creds_path = os.path.join(os.path.dirname(__file__), "gcp_sa.json")
    if not os.path.exists(creds_path):
        print("❌ No se encontró el archivo de credenciales gcp_sa.json")
        return

    try:
        credentials = service_account.Credentials.from_service_account_file(creds_path)
        client = billing.CloudBillingClient(credentials=credentials)
        
        print("🔎 Buscando cuentas de facturación asociadas...")
        billing_accounts = client.list_billing_accounts()
        
        found = False
        for account in billing_accounts:
            print(f"✅ Cuenta: {account.display_name}")
            print(f"   ID: {account.name}")
            print(f"   Estado: {'Abierta' if account.open_ else 'Cerrada'}")
            found = True
        
        if not found:
            print("ℹ️ No se encontraron cuentas de facturación visibles para esta credencial.")
            
    except Exception as e:
        if "403" in str(e):
            print("🔒 Acceso Denegado: La cuenta de servicio no tiene permisos de 'Billing Viewer'.")
        else:
            print(f"❌ Error al consultar facturación: {e}")

if __name__ == "__main__":
    check_billing()
