import React, { useState, useEffect, useRef, useCallback } from 'react';
import './LoginScreen.css';
import { Capacitor } from '@capacitor/core';

const BACKEND_URL = Capacitor.isNativePlatform()
    ? 'https://visor-ecd-backend.onrender.com'
    : (import.meta.env.VITE_BACKEND_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://visor-ecd-backend.onrender.com'));

// ── IDENTIDAD ────────────────────────────────────────────────────────────────
// El producto necesita nombre propio: la pantalla anterior mostraba literalmente
// la marca de Revizto. Cambia estas dos líneas y cambia toda la identidad.
const MARCA = 'COTA';
const MARCA_BAJADA = 'Plataforma de obra';

// Vídeo de la obra real (dron, SEM 30), servido desde public/ y no desde un CDN
// ajeno. Solo se carga en pantalla ancha: en la tablet de campo son 6,5 MB de
// decodificación en cada arranque para algo que nadie mira.
const VIDEO_OBRA = '/login-obra.mp4';
const PIE_OBRA = 'Drenaje pluvial · Talara, Piura';

// El backend en plan gratuito de Render se duerme: el primer arranque tarda
// ~50 s. Pasado este umbral se explica en vez de dejar unos puntos suspensivos.
const MS_AVISO_DESPERTANDO = 8000;

const T = {
    es: {
        titulo: 'Acceso a la plataforma',
        sub: 'Ingresa con el correo con el que te invitaron a la obra.',
        correo: 'Correo',
        password: 'Contraseña',
        ver: 'Mostrar contraseña',
        ocultar: 'Ocultar contraseña',
        entrar: 'Ingresar',
        entrando: 'Verificando…',
        despertando: 'El servidor estaba en reposo y está arrancando. Puede tardar hasta un minuto.',
        sinAcceso: '¿No tienes acceso? Pide al administrador de la obra que te invite.',
        olvide: '¿Olvidaste tu contraseña?',
        recTitulo: 'Recuperar el acceso',
        recSub: 'Te enviaremos un enlace para elegir una contraseña nueva.',
        recEnviar: 'Enviar enlace',
        recEnviando: 'Enviando…',
        recHecho: 'Si ese correo tiene una cuenta, te llegará un enlace en unos minutos. Revisa también la carpeta de no deseados.',
        nuevaTitulo: 'Elige tu contraseña',
        nuevaSub: 'Al cambiarla se cerrarán las demás sesiones abiertas.',
        nuevaGuardar: 'Guardar y entrar',
        volver: 'Volver al acceso',
        errRed: 'No se pudo conectar con el servidor. Revisa tu conexión.',
        errCreds: 'Correo o contraseña incorrectos.',
        errLimite: 'Demasiados intentos. Espera un momento antes de volver a probar.',
        google: 'Continuar con Google',
        // Registro por invitación
        regTitulo: 'Crea tu cuenta',
        regSub: 'Te invitaron a la obra. Elige tu contraseña para entrar.',
        nombre: 'Nombre y apellido',
        repetir: 'Repite la contraseña',
        crear: 'Crear cuenta',
        creando: 'Creando…',
        errDistintas: 'Las contraseñas no coinciden.',
        errCorta: 'La contraseña debe tener al menos 8 caracteres.',
        // Segundo factor
        dfaTitulo: 'Verificación en dos pasos',
        dfaSub: 'Escribe el código de 6 cifras de tu aplicación de autenticación.',
        dfaCodigo: 'Código',
        dfaEntrar: 'Verificar',
        dfaVerificando: 'Verificando…',
        dfaAyuda: 'Si perdiste el teléfono, usa uno de tus códigos de recuperación.',
        dfaErr: 'El código no es válido o ha caducado. Vuelve a intentarlo.',
        dfaObligatorio: 'Esta cuenta necesita verificación en dos pasos para entrar. Pide al administrador que la active.',
        volver: 'Volver al acceso',
        idioma: 'English',
    },
    en: {
        titulo: 'Sign in',
        dfaTitulo: 'Two-step verification',
        dfaSub: 'Enter the 6-digit code from your authenticator app.',
        dfaCodigo: 'Code',
        dfaEntrar: 'Verify',
        dfaVerificando: 'Checking…',
        dfaAyuda: 'Lost your phone? Use one of your recovery codes.',
        dfaErr: 'That code is not valid or has expired. Try again.',
        dfaObligatorio: 'This account needs two-step verification to sign in. Ask the administrator to enable it.',
        sub: 'Use the email you were invited with.',
        correo: 'Email',
        password: 'Password',
        ver: 'Show password',
        ocultar: 'Hide password',
        entrar: 'Sign in',
        entrando: 'Checking…',
        despertando: 'The server was asleep and is starting up. This can take up to a minute.',
        sinAcceso: 'No access? Ask the site administrator to invite you.',
        olvide: 'Forgot your password?',
        recTitulo: 'Recover access',
        recSub: "We'll email you a link to choose a new password.",
        recEnviar: 'Send link',
        recEnviando: 'Sending…',
        recHecho: 'If that email has an account, a link is on its way. Check your spam folder too.',
        nuevaTitulo: 'Choose your password',
        nuevaSub: 'Changing it will sign out your other sessions.',
        nuevaGuardar: 'Save and sign in',
        volver: 'Back to sign in',
        errRed: 'Could not reach the server. Check your connection.',
        errCreds: 'Wrong email or password.',
        errLimite: 'Too many attempts. Please wait a moment before trying again.',
        google: 'Continue with Google',
        regTitulo: 'Create your account',
        regSub: 'You were invited. Choose a password to get in.',
        nombre: 'Full name',
        repetir: 'Repeat password',
        crear: 'Create account',
        creando: 'Creating…',
        errDistintas: 'Passwords do not match.',
        errCorta: 'Password must be at least 8 characters.',
        volver: 'Back to sign in',
        idioma: 'Español',
    },
};

/** Lee el correo del token de invitación para no obligar a teclearlo.
 *  El token va FIRMADO, no cifrado: su contenido es público (y el correo ya lo
 *  conoce quien recibió el enlace). La firma la valida el backend. */
function correoDeInvitacion(token) {
    try {
        const payload = token.split('.')[0];
        const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((payload.length + 3) % 4));
        return JSON.parse(json)?.email || '';
    } catch { return ''; }
}

const IconoOjo = ({ abierto }) => (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {abierto
            ? <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
            : <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>}
    </svg>
);

const Marca = () => (
    <div className="cta-marca">
        {/* Mira topográfica: la identidad es tipográfica, el glifo solo acompaña. */}
        <svg className="cta-marca__glifo" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" /><line x1="12" y1="1.5" x2="12" y2="7" />
            <line x1="12" y1="17" x2="12" y2="22.5" /><line x1="1.5" y1="12" x2="7" y2="12" />
            <line x1="17" y1="12" x2="22.5" y2="12" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        </svg>
        <span className="cta-marca__texto">{MARCA}</span>
    </div>
);

const LoginScreen = ({ onLogin }) => {
    const [lang, setLang] = useState('es');
    const t = T[lang];

    const params = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const invitacion = params.get('invite') || '';
    const tokenReset = params.get('reset') || '';

    // 4 modos excluyentes: acceso · alta por invitación · pedir enlace ·
    // elegir contraseña nueva. Los dos últimos existen porque hasta ahora, si
    // alguien olvidaba su contraseña, no había NINGUNA forma de recuperarla.
    const [pidiendoEnlace, setPidiendoEnlace] = useState(false);
    const [enlaceEnviado, setEnlaceEnviado] = useState(false);
    // Segundo factor: la contraseña correcta ya no entra sola. El servidor
    // devuelve un desafío firmado y de vida corta que se canjea con el código.
    const [desafio2fa, setDesafio2fa] = useState('');
    const [codigo2fa, setCodigo2fa] = useState('');
    const modo2fa = Boolean(desafio2fa);
    const modoRegistro = Boolean(invitacion);
    const modoNuevaClave = Boolean(tokenReset);
    const modoRecuperar = pidiendoEnlace && !modoRegistro && !modoNuevaClave;

    // El correo sale del token (firmado, no cifrado) para no obligar a teclearlo
    // y para poder entrar solo tras restablecer la contraseña.
    const [correo, setCorreo] = useState(() => correoDeInvitacion(invitacion || tokenReset));
    const [clave, setClave] = useState('');
    const [verClave, setVerClave] = useState(false);
    const [nombre, setNombre] = useState('');
    const [clave2, setClave2] = useState('');

    const [enviando, setEnviando] = useState(false);
    const [despertando, setDespertando] = useState(false);
    const [error, setError] = useState('');
    const [entrado, setEntrado] = useState(false);

    const temporizador = useRef(null);
    const vivo = useRef(true);
    useEffect(() => {
        // Reafirmar en el montaje, no solo limpiar al desmontar: con StrictMode
        // React monta, limpia y vuelve a montar, y sin esta línea `vivo` quedaba
        // en false para siempre — el formulario se colgaba en "Verificando…"
        // tras el primer error, sin volver a habilitarse nunca.
        vivo.current = true;
        return () => { vivo.current = false; clearTimeout(temporizador.current); };
    }, []);

    // El <html lang> tiene que seguir al idioma o el lector de pantalla
    // pronuncia el español con fonética inglesa.
    useEffect(() => { document.documentElement.lang = lang; }, [lang]);

    const pedir = useCallback(async (ruta, cuerpo) => {
        setEnviando(true);
        setError('');
        setDespertando(false);
        clearTimeout(temporizador.current);
        temporizador.current = setTimeout(() => { if (vivo.current) setDespertando(true); }, MS_AVISO_DESPERTANDO);
        try {
            const res = await fetch(`${BACKEND_URL}${ruta}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cuerpo),
            });
            const datos = await res.json().catch(() => ({}));
            return { ok: res.ok, estado: res.status, datos };
        } catch {
            return { ok: false, estado: 0, datos: {} };
        } finally {
            clearTimeout(temporizador.current);
            if (vivo.current) { setEnviando(false); setDespertando(false); }
        }
    }, []);

    const mensajeDeError = (estado, datos) => {
        if (estado === 0) {
            // "Revisa tu conexión" es inútil cuando lo que pasa es que el
            // backend local no está arrancado. En desarrollo se dice la verdad,
            // con la dirección concreta; en producción no se enseñan URLs.
            const esLocal = /localhost|127\.0\.0\.1|^http:\/\/\d+\.\d+\.\d+\.\d+/.test(BACKEND_URL);
            return esLocal
                ? `No hay respuesta en ${BACKEND_URL}. ¿Está arrancado el backend?`
                : t.errRed;
        }
        if (estado === 429) return t.errLimite;
        if (estado === 401) return t.errCreds;
        return datos.error || t.errCreds;
    };

    const acceder = async (e) => {
        e.preventDefault();
        if (enviando || !correo.trim() || !clave) return;
        const { ok, estado, datos } = await pedir('/api/auth/login', { email: correo.trim(), password: clave });
        if (ok && datos.requiere_2fa) {
            // NO se entra: la contraseña solo ha ganado el derecho a que le
            // pidan el código. Se limpia la clave para no dejarla en memoria
            // más de lo necesario.
            setClave('');
            setError('');
            setDesafio2fa(datos.desafio);
        } else if (ok) {
            setEntrado(true);      // sin espera artificial: se entra al terminar
            onLogin(datos);
        } else if (estado === 403 && datos?.code === 'SEGUNDO_FACTOR_OBLIGATORIO') {
            setError(t.dfaObligatorio);
        } else {
            setError(mensajeDeError(estado, datos));
        }
    };

    const verificarCodigo = async (e) => {
        e.preventDefault();
        if (enviando || !codigo2fa.trim()) return;
        const { ok, estado, datos } = await pedir('/api/auth/2fa/verify', {
            desafio: desafio2fa, codigo: codigo2fa.trim(),
        });
        if (ok) {
            setEntrado(true);
            onLogin(datos);
        } else if (estado === 0) {
            setError(t.errRed);
        } else {
            // Si el desafío caducó hay que volver a empezar por la contraseña:
            // dejar el formulario del código sería pedir algo que ya no sirve.
            setCodigo2fa('');
            if (datos?.code === 'el enlace ha caducado') setDesafio2fa('');
            setError(t.dfaErr);
        }
    };

    const registrar = async (e) => {
        e.preventDefault();
        if (enviando || !nombre.trim() || !correo.trim() || !clave) return;
        if (clave.length < 8) { setError(t.errCorta); return; }
        if (clave !== clave2) { setError(t.errDistintas); return; }
        const { ok, estado, datos } = await pedir('/api/auth/register', {
            name: nombre.trim(), email: correo.trim(), password: clave, invite_token: invitacion,
        });
        if (ok) {
            setEntrado(true);
            onLogin(datos);
        } else {
            setError(estado === 0 ? t.errRed : (datos.error || t.errCreds));
        }
    };

    const pedirEnlace = async (e) => {
        e.preventDefault();
        if (enviando || !correo.trim()) return;
        // La respuesta del servidor es CONSTANTE exista o no la cuenta, así que
        // aquí tampoco se distingue: decirlo sería un buscador de correos. Pero
        // un ERROR del servidor sí se distingue: antes se enseñaba "te llegará
        // un enlace" incluso cuando la petición había fallado, y el usuario se
        // quedaba esperando un correo que nunca se intentó mandar.
        const { ok, estado, datos } = await pedir('/api/auth/forgot-password', { email: correo.trim() });
        if (ok) { setEnlaceEnviado(true); return; }
        setError(estado === 0 ? t.errRed : (datos.error || t.errCreds));
    };

    const guardarNuevaClave = async (e) => {
        e.preventDefault();
        if (enviando || !clave) return;
        if (clave !== clave2) { setError(t.errDistintas); return; }
        const { ok, estado, datos } = await pedir('/api/auth/reset-password', {
            token: tokenReset, password: clave,
        });
        if (ok) {
            // La contraseña ya cambió; se entra con ella para no pedirla dos veces.
            const acceso = await pedir('/api/auth/login', { email: correo.trim(), password: clave });
            if (acceso.ok) { setEntrado(true); onLogin(acceso.datos); }
            else { window.history.replaceState({}, '', window.location.pathname); setPidiendoEnlace(false); }
        } else {
            setError(estado === 0 ? t.errRed : (datos.error || t.errCreds));
        }
    };

    // Google solo si de verdad está cargado. Sin red (APK en obra) el script no
    // existe y el botón no debe aparecer prometiendo algo que no funciona.
    const [hayGoogle, setHayGoogle] = useState(false);
    useEffect(() => {
        const idCliente = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        if (!idCliente || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
            client_id: idCliente,
            callback: async (respuesta) => {
                const { ok, estado, datos } = await pedir('/api/auth/google', { token: respuesta.credential });
                if (ok) { setEntrado(true); onLogin(datos); }
                else setError(estado === 0 ? t.errRed : (datos.error || t.errCreds));
            },
        });
        setHayGoogle(true);
    }, [pedir, onLogin, t]);

    const enviarTexto = modo2fa ? (enviando ? t.dfaVerificando : t.dfaEntrar)
        : modoRegistro ? (enviando ? t.creando : t.crear)
        : modoRecuperar ? (enviando ? t.recEnviando : t.recEnviar)
        : modoNuevaClave ? (enviando ? t.creando : t.nuevaGuardar)
        : (enviando ? t.entrando : t.entrar);

    const alEnviar = modo2fa ? verificarCodigo
        : modoRegistro ? registrar
        : modoRecuperar ? pedirEnlace
        : modoNuevaClave ? guardarNuevaClave
        : acceder;

    const titulo = modo2fa ? t.dfaTitulo
        : modoRegistro ? t.regTitulo
        : modoRecuperar ? t.recTitulo
        : modoNuevaClave ? t.nuevaTitulo
        : t.titulo;

    const subtitulo = modo2fa ? t.dfaSub
        : modoRegistro ? t.regSub
        : modoRecuperar ? t.recSub
        : modoNuevaClave ? t.nuevaSub
        : t.sub;

    // Campos visibles por modo
    const pideNombre = modoRegistro;
    const pideClave = !modoRecuperar && !modo2fa;
    const pideRepetir = modoRegistro || modoNuevaClave;
    const correoBloqueado = modoRegistro || modoNuevaClave;

    return (
        <div className="cta-login">
            <section className="cta-obra" aria-hidden="true">
                <video className="cta-obra__video" autoPlay muted loop playsInline preload="none">
                    <source src={VIDEO_OBRA} type="video/mp4" />
                </video>
                <div className="cta-obra__velo" />
                <div className="cta-obra__pie">
                    <Marca />
                    <p className="cta-obra__ficha">{PIE_OBRA}</p>
                </div>
            </section>

            <section className="cta-panel">
                <button
                    type="button"
                    className="cta-idioma"
                    onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
                >{t.idioma}</button>

                <div className="cta-panel__caja">
                    <div className="cta-panel__marca"><Marca /><span className="cta-bajada">{MARCA_BAJADA}</span></div>

                    <h1 className="cta-titulo">{titulo}</h1>
                    <p className="cta-sub">{subtitulo}</p>

                    {enlaceEnviado ? (
                        <>
                            <p className="cta-espera" role="status">{t.recHecho}</p>
                            <button
                                type="button" className="cta-google"
                                onClick={() => { setEnlaceEnviado(false); setPidiendoEnlace(false); }}
                            >{t.volver}</button>
                        </>
                    ) : (
                    <form onSubmit={alEnviar} noValidate>
                        {pideNombre && (
                            <div className="cta-campo">
                                <label htmlFor="nombre">{t.nombre}</label>
                                <input
                                    id="nombre" name="name" type="text" autoComplete="name"
                                    value={nombre} onChange={(e) => setNombre(e.target.value)}
                                    disabled={enviando} required autoFocus
                                />
                            </div>
                        )}

                        {!modo2fa && (
                        <div className="cta-campo">
                            <label htmlFor="correo">{t.correo}</label>
                            <input
                                id="correo" name="username" type="email"
                                autoComplete="username" inputMode="email"
                                autoCapitalize="off" autoCorrect="off" spellCheck="false"
                                value={correo} onChange={(e) => setCorreo(e.target.value)}
                                disabled={enviando}
                                /* readOnly y no disabled: el correo de la invitación no
                                   se teclea (evita erratas) pero el campo sigue contando
                                   para que el gestor de contraseñas ofrezca guardarlo. */
                                readOnly={correoBloqueado}
                                required autoFocus={!correoBloqueado}
                            />
                        </div>
                        )}

                        {modo2fa && (
                        <div className="cta-campo">
                            <label htmlFor="codigo2fa">{t.dfaCodigo}</label>
                            <input
                                id="codigo2fa" name="one-time-code"
                                type="text" inputMode="numeric"
                                /* autoComplete one-time-code: el teclado del móvil
                                   ofrece pegar el código sin salir de la pantalla. */
                                autoComplete="one-time-code"
                                autoCapitalize="off" autoCorrect="off" spellCheck="false"
                                value={codigo2fa} onChange={(e) => setCodigo2fa(e.target.value)}
                                disabled={enviando} required autoFocus
                            />
                            <p className="cta-pista">{t.dfaAyuda}</p>
                        </div>
                        )}

                        {pideClave && (
                        <div className="cta-campo">
                            <label htmlFor="clave">{t.password}</label>
                            <div className="cta-campo__conBoton">
                                <input
                                    id="clave" name="password"
                                    type={verClave ? 'text' : 'password'}
                                    autoComplete={pideRepetir ? 'new-password' : 'current-password'}
                                    value={clave} onChange={(e) => setClave(e.target.value)}
                                    disabled={enviando} required
                                    autoFocus={modoNuevaClave}
                                />
                                <button
                                    type="button" className="cta-ojo"
                                    onClick={() => setVerClave(!verClave)}
                                    aria-label={verClave ? t.ocultar : t.ver}
                                    aria-pressed={verClave}
                                    tabIndex={0}
                                >
                                    <IconoOjo abierto={verClave} />
                                </button>
                            </div>
                        </div>
                        )}

                        {pideRepetir && (
                            <div className="cta-campo">
                                <label htmlFor="clave2">{t.repetir}</label>
                                <input
                                    id="clave2" name="password_confirm" type={verClave ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    value={clave2} onChange={(e) => setClave2(e.target.value)}
                                    disabled={enviando} required
                                />
                            </div>
                        )}

                        {/* aria-live: el lector anuncia el error sin mover el foco */}
                        <div className="cta-avisos" role="status" aria-live="polite">
                            {error && <p className="cta-error">{error}</p>}
                            {despertando && <p className="cta-espera">{t.despertando}</p>}
                        </div>

                        <button type="submit" className="cta-enviar" disabled={enviando || entrado}>
                            {enviando && <span className="cta-giro" aria-hidden="true" />}
                            {enviarTexto}
                        </button>

                        {/* Recuperar la contraseña: hasta ahora no existía
                            ninguna vía y cada olvido acababa en la base de datos. */}
                        {modo2fa ? (
                            <button
                                type="button" className="cta-enlace"
                                onClick={() => { setError(''); setCodigo2fa(''); setDesafio2fa(''); }}
                            >{t.volver}</button>
                        ) : !modoRegistro && !modoNuevaClave && (
                            <button
                                type="button" className="cta-enlace"
                                onClick={() => { setError(''); setPidiendoEnlace(!pidiendoEnlace); }}
                            >{modoRecuperar ? t.volver : t.olvide}</button>
                        )}
                    </form>
                    )}

                    {!modo2fa && !modoRegistro && !modoRecuperar && !modoNuevaClave && !enlaceEnviado && hayGoogle && (
                        <>
                            <div className="cta-separador"><span>o</span></div>
                            <button
                                type="button" className="cta-google"
                                onClick={() => window.google.accounts.id.prompt()}
                                disabled={enviando}
                            >
                                <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
                                    <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12.1c-.2 2-1.6 5-4.5 7l6.9 5.4c4.1-3.8 6.6-9.4 6.6-15.7z" />
                                    <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C8.1 41.1 15.4 46 24 46z" />
                                    <path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4l-7.1-5.5C2.9 17 2 20.4 2 24s.9 7 2.4 9.9l7.1-5.5z" />
                                    <path fill="#EA4335" d="M24 10.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4.4 29.9 2 24 2 15.4 2 8.1 6.9 4.4 14.1l7.1 5.5c1.8-5.3 6.7-9.1 12.5-9.1z" />
                                </svg>
                                {t.google}
                            </button>
                        </>
                    )}

                    <p className="cta-nota">
                        {modoRegistro || modoNuevaClave || enlaceEnviado ? '' : t.sinAcceso}
                    </p>
                </div>
            </section>
        </div>
    );
};

export default LoginScreen;
