# Evidencia — segundo factor activo en la cuenta de administración · 20-ago-2026

Cierra la acción 8 del OWNER ACTION PACK.

---

## El orden importó

Se hizo en esta secuencia, y no es casual:

1. **Primero se desplegó el cifrado** del secreto TOTP (`c1d5574`, en producción
   desde las 17:44 UTC, confirmado por `/api/health` → `version: 18caf8e`).
2. **Después se activó el 2FA.**

Al revés habría sido protegerse con una cerradura cuya llave viaja dentro de cada
copia de seguridad: hasta ese despliegue, `users.totp_secreto` se guardaba en
claro y la copia lo llevaba. El secreto de esta cuenta **nació ya cifrado**.

## Lo verificado

| | |
|---|---|
| Segundo factor activado en la cuenta de administración | sí |
| 8 códigos de recuperación guardados en papel | sí, por el propietario |
| **Probado en ventana de incógnito** | **sí — el login pide el código de 6 cifras y entra** |

La tercera fila es la que cuenta. «Activado» y «funciona» no son lo mismo, y esta
semana la diferencia apareció tres veces.

La prueba se hizo **sin cerrar la sesión existente**, para que un fallo fuese
reversible desde el panel de Seguridad. No hizo falta.

## Lo que este control protege, y lo que no

Protege el **login**. No protege la puerta de la base de datos: quien tenga la
credencial de PostgreSQL sigue entrando por debajo de la aplicación sin pasar por
aquí. Eso es la separación de identidades, y va aparte.

---

## Apuntado, no arreglado: el botón está escondido

El acceso al segundo factor vive **solo** en la pantalla de bienvenida
(`HubPage.jsx`), y esa pantalla únicamente se ve **antes** de entrar en
Documentos. Una vez dentro (`SecureProjectsPage`, `FilesPage`), no hay ninguna
entrada al panel: el avatar de la cabecera no abre menú, solo cierra sesión.

Se vuelve pulsando el logo **ECD-VISIION**, que sí llama a `onBackToHub` — pero
nada en pantalla dice que ese logo sea un botón.

Para quien conoce la casa es un rodeo. **Para el administrador de una
municipalidad que entra por primera vez y quiere protegerse la cuenta, es un
botón que probablemente no encuentre** — y entonces el 2FA existe y nadie lo usa,
que es la peor forma de tener un control.

**El sitio natural es el menú de la cuenta**, junto a «Cerrar sesión». No se toca
ahora por instrucción expresa de no abrir funcionalidades; va a la lista de
después del piloto, y a la guía de despliegue como paso explícito para que no se
quede sin hacer.
