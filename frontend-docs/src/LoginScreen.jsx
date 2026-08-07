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
        volver: 'Volver al acceso',
        idioma: 'English',
    },
    en: {
        titulo: 'Sign in',
        sub: 'Use the email you were invited with.',
        correo: 'Email',
        password: 'Password',
        ver: 'Show password',
        ocultar: 'Hide password',
        entrar: 'Sign in',
        entrando: 'Checking…',
        despertando: 'The server was asleep and is starting up. This can take up to a minute.',
        sinAcceso: 'No access? Ask the site administrator to invite you.',
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

    const invitacion = typeof window !== 'undefined'
        ? (new URLSearchParams(window.location.search).get('invite') || '')
        : '';
    const modoRegistro = Boolean(invitacion);

    const [correo, setCorreo] = useState(() => (invitacion ? correoDeInvitacion(invitacion) : ''));
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
        if (estado === 0) return t.errRed;
        if (estado === 429) return t.errLimite;
        if (estado === 401) return t.errCreds;
        return datos.error || t.errCreds;
    };

    const acceder = async (e) => {
        e.preventDefault();
        if (enviando || !correo.trim() || !clave) return;
        const { ok, estado, datos } = await pedir('/api/auth/login', { email: correo.trim(), password: clave });
        if (ok) {
            setEntrado(true);      // sin espera artificial: se entra al terminar
            onLogin(datos);
        } else {
            setError(mensajeDeError(estado, datos));
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

    const enviarTexto = modoRegistro
        ? (enviando ? t.creando : t.crear)
        : (enviando ? t.entrando : t.entrar);

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

                    <h1 className="cta-titulo">{modoRegistro ? t.regTitulo : t.titulo}</h1>
                    <p className="cta-sub">{modoRegistro ? t.regSub : t.sub}</p>

                    <form onSubmit={modoRegistro ? registrar : acceder} noValidate>
                        {modoRegistro && (
                            <div className="cta-campo">
                                <label htmlFor="nombre">{t.nombre}</label>
                                <input
                                    id="nombre" name="name" type="text" autoComplete="name"
                                    value={nombre} onChange={(e) => setNombre(e.target.value)}
                                    disabled={enviando} required autoFocus
                                />
                            </div>
                        )}

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
                                readOnly={modoRegistro}
                                required autoFocus={!modoRegistro}
                            />
                        </div>

                        <div className="cta-campo">
                            <label htmlFor="clave">{t.password}</label>
                            <div className="cta-campo__conBoton">
                                <input
                                    id="clave" name="password"
                                    type={verClave ? 'text' : 'password'}
                                    autoComplete={modoRegistro ? 'new-password' : 'current-password'}
                                    value={clave} onChange={(e) => setClave(e.target.value)}
                                    disabled={enviando} required
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

                        {modoRegistro && (
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
                    </form>

                    {!modoRegistro && hayGoogle && (
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

                    <p className="cta-nota">{modoRegistro ? '' : t.sinAcceso}</p>
                </div>
            </section>
        </div>
    );
};

export default LoginScreen;
