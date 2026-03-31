import React, { useState, useEffect, useRef } from 'react';
import './LoginScreen.css';
import { Capacitor } from '@capacitor/core';

const BACKEND_URL = Capacitor.isNativePlatform()
    ? 'https://visor-ecd-backend.onrender.com'
    : (import.meta.env.VITE_BACKEND_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://visor-ecd-backend.onrender.com'));

// ── VIDEO — Cambiar esta línea para usar tu propio video ─────────────────────
const HERO_VIDEO_URL = "https://s3.amazonaws.com/webflow-prod-assets/68dfb2221c50b9fb5b595fd7/695e368381db0cb279407245_Home%20page%20-%20hero%20video_15mb.mp4";
// Para video local: cópialo a public/ y pon "/mi_video.mp4"

// ── Translations ─────────────────────────────────────────────────────────────
const translations = {
    en: {
        btn_demo: "DEMO",
        hero_sub: "AECO Collaboration Software",
        hero_title: 'Your project.<br/>Made Right.',
        hero_desc: "The leading 2D/3D platform to deliver complex projects with greater confidence and control.",
        login_title: "Log in",
        login_new_user: "Are you a new user?",
        login_create_account: "Create an account",
        login_email_label: "Email address",
        login_continue: "Continue",
        login_or: "or",
        login_google: "Continue with Google",
        login_apple: "Continue with Apple",
        login_more_options: "More login options",
        login_help: "Get help signing in",
        login_back: "Back",
        login_pass_title: "Enter Password",
        login_btn: "Log In",
        welcome_back: "Welcome back!",
        redirecting: "Redirecting to your dashboard...",
        reg_title: "Sign Up",
        reg_already_user: "Already have an account?",
        reg_login_link: "Log in",
        reg_name_label: "Full Name",
        reg_email_label: "Email address",
        reg_pass_label: "Password",
        reg_confirm_label: "Confirm Password",
        reg_submit: "Sign Up",
        reg_back: "Back to login",
        reg_success_title: "Account created!",
        reg_success_msg: "Check your email to verify your account and get started."
    },
    es: {
        btn_demo: "DEMO",
        hero_sub: "Software de Colaboración AECO",
        hero_title: 'Su proyecto.<br/>Bien hecho.',
        hero_desc: "Plataforma 2D/3D para entregar proyectos complejos con mayor confianza y control.",
        login_title: "Inicio de sesión",
        login_new_user: "¿Eres un nuevo usuario?",
        login_create_account: "Crear una cuenta",
        login_email_label: "Correo electrónico",
        login_continue: "Continuar",
        login_or: "o",
        login_google: "Continuar con Google",
        login_apple: "Continuar con Apple",
        login_more_options: "Más opciones",
        login_help: "Ayuda para iniciar sesión",
        login_back: "Volver",
        login_pass_title: "Ingresar Contraseña",
        login_btn: "Iniciar Sesión",
        welcome_back: "¡Bienvenido de nuevo!",
        redirecting: "Redirigiendo a su panel...",
        reg_title: "Registrarse",
        reg_already_user: "¿Ya tienes una cuenta?",
        reg_login_link: "Iniciar sesión",
        reg_name_label: "Nombre completo",
        reg_email_label: "Correo electrónico",
        reg_pass_label: "Contraseña",
        reg_confirm_label: "Confirmar contraseña",
        reg_submit: "Registrarse",
        reg_back: "Volver al inicio",
        reg_success_title: "¡Cuenta creada!",
        reg_success_msg: "Revisa tu correo electrónico para verificar tu cuenta y comenzar."
    },
    zh: {
        btn_demo: "演示",
        hero_sub: "AECO 协作软件",
        hero_title: '您的项目，<br/>成就非凡。',
        hero_desc: "领先的 2D/3D 平台，助力更自信、更高效地交付复杂项目。",
        login_title: "登录",
        login_new_user: "是新用户吗？",
        login_create_account: "创建账户",
        login_email_label: "电子邮件地址",
        login_continue: "继续",
        login_or: "或",
        login_google: "通过 Google 继续",
        login_apple: "通过 Apple 继续",
        login_more_options: "更多登录选项",
        login_help: "获取登录帮助",
        login_back: "返回",
        login_pass_title: "输入密码",
        login_btn: "登录",
        welcome_back: "欢迎回来！",
        redirecting: "正在重定向到您的仪表板...",
        reg_title: "注册",
        reg_already_user: "已有账户？",
        reg_login_link: "登录",
        reg_name_label: "全名",
        reg_email_label: "电子邮件地址",
        reg_pass_label: "密码",
        reg_confirm_label: "确认密码",
        reg_submit: "注册",
        reg_back: "返回登录",
        reg_success_title: "账户已创建！",
        reg_success_msg: "请检查您的电子邮件以验证您的账户。"
    }
};

// ── SVG Icons ────────────────────────────────────────────────────────────────
const GoogleIcon = () => (
    <svg height="14" viewBox="0 0 18 18" width="14">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
        <path d="M3.964 10.706c-.18-.54-.282-1.117-.282-1.706s.102-1.166.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05" />
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.443 2.048.957 4.962l3.007 2.332c.708-2.127 2.692-3.711 5.036-3.711z" fill="#EA4335" />
    </svg>
);
const AppleIcon = () => (
    <svg fill="white" height="14" viewBox="0 0 18 18" width="14">
        <path d="M15.03 12.62c-.63 1.14-1.53 2.34-2.82 2.34-1.26 0-1.68-.81-3.21-.81-1.53 0-2.01.78-3.21.81-1.29.03-2.37-1.35-3-2.34-1.32-1.98-2.31-5.61-.96-7.83 1.23-2.01 3.24-2.16 4.32-2.16 1.05 0 2.04.66 2.67.66.63 0 1.86-.78 3.09-.66 1.26.12 2.31.6 3 1.5-2.58 1.47-2.16 4.86.51 5.82-.45 1.14-1.2 2.31-1.89 3.12zM11.16.27c0 1.29-.93 2.67-2.28 2.67-.18 0-.36-.03-.48-.06.06-1.53 1.17-2.88 2.31-2.88.15 0 .3.03.45.06v.21z" />
    </svg>
);

// ═════════════════════════════════════════════════════════════════════════════
const LoginScreen = ({ onLogin }) => {
    // Language
    const [lang, setLang] = useState('en');
    const [langMenuOpen, setLangMenuOpen] = useState(false);
    const t = translations[lang];

    // Left card: 'hero' | 'form' | 'success'
    const [leftCardState, setLeftCardState] = useState('hero');

    // Right card: 'login' | 'password' | 'access' | 'registration' | 'regSuccess'
    const [rightCardState, setRightCardState] = useState('login');

    // Form fields
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [regName, setRegName] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regPass, setRegPass] = useState('');
    const [regConfirm, setRegConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const langMenuRef = useRef(null);
    const passwordRef = useRef(null);

    // Close lang menu on outside click
    useEffect(() => {
        const handler = () => setLangMenuOpen(false);
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, []);

    // Focus password input
    useEffect(() => {
        if (rightCardState === 'password' && passwordRef.current) passwordRef.current.focus();
    }, [rightCardState]);

    // Google Identity Services
    useEffect(() => {
        const handleGoogleResponse = async (response) => {
            setLoading(true); setError('');
            try {
                const res = await fetch(`${BACKEND_URL}/api/auth/google`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: response.credential })
                });
                const data = await res.json();
                if (res.ok) { setRightCardState('access'); setTimeout(() => onLogin(data), 2000); }
                else setError(data.error || 'Error en autenticación con Google');
            } catch { setError('Error de conexión'); }
            finally { setLoading(false); }
        };
        if (window.google) {
            window.google.accounts.id.initialize({
                client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || "tu-cliente-id.apps.googleusercontent.com",
                callback: handleGoogleResponse
            });
        }
    }, [onLogin]);

    const handleGoogleClick = () => {
        if (window.google) window.google.accounts.id.prompt();
        else setError('Google Login no disponible');
    };

    // ── Left card: Demo triggers ─────────────────────────────────
    const showLeftState = (state) => setLeftCardState(state);

    // ── Right card: Login flow ───────────────────────────────────
    const handleContinue = () => { if (!email.trim()) return; setError(''); setRightCardState('password'); };

    const handleLogin = async () => {
        if (!password) return;
        setLoading(true); setError('');
        try {
            const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), password })
            });
            const data = await res.json();
            if (res.ok) { setRightCardState('access'); setTimeout(() => onLogin(data), 2000); }
            else setError(data.error || 'Credenciales incorrectas');
        } catch { setError(`Error de conexión (${BACKEND_URL})`); }
        finally { setLoading(false); }
    };

    const handleRegister = async () => {
        if (!regName.trim() || !regEmail.trim() || !regPass || !regConfirm) return;
        if (regPass !== regConfirm) { setError('Passwords do not match'); return; }
        setLoading(true); setError('');
        try {
            const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: regName.trim(), email: regEmail.trim(), password: regPass })
            });
            const data = await res.json();
            if (res.ok) {
                // Auto login after reg
                setRightCardState('access');
                setTimeout(() => onLogin(data), 2000);
            } else {
                setError(data.error || 'Error al registrar');
            }
        } catch (err) {
            setError('Error de conexión al registrar');
        } finally {
            setLoading(false);
        }
    };

    const handleDemoSubmit = (e) => { e.preventDefault(); showLeftState('success'); };
    const onKey = (e, fn) => { if (e.key === 'Enter') fn(); };

    const langLabels = [
        { code: 'en', name: 'English', label: 'EN' },
        { code: 'es', name: 'Español', label: 'ES' },
        { code: 'zh', name: '简体中文', label: 'ZH' },
    ];

    // Computed: is left card expanded?
    const isExpanded = leftCardState === 'form';
    // Computed: should right card be hidden (when demo form is open)?
    const rightCardStyle = isExpanded
        ? { opacity: 0, pointerEvents: 'none' }
        : { opacity: 1, pointerEvents: 'auto' };

    return (
        <div className="stitch-login">
            {/* ══ NAV ════════════════════════════════════════════════ */}
            <nav className="c-nav">
                <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                    <div className="c-lang-dropdown" ref={langMenuRef}>
                        <div className="c-lang-trigger" onClick={(e) => { e.stopPropagation(); setLangMenuOpen(!langMenuOpen); }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>language</span>
                            <span id="currentLang">{lang.toUpperCase()}</span>
                            <span className="material-symbols-outlined" style={{ fontSize: '1rem', opacity: 0.6 }}>keyboard_arrow_down</span>
                        </div>
                        <div className={`c-lang-menu ${langMenuOpen ? 'is-active' : ''}`}>
                            {langLabels.map(l => (
                                <div
                                    key={l.code}
                                    className={`c-lang-option ${lang === l.code ? 'is-selected' : ''}`}
                                    onClick={() => { setLang(l.code); setLangMenuOpen(false); }}
                                >
                                    <span>{l.name}</span>
                                    <span style={{ color: 'rgb(152, 187, 187)', fontSize: '0.7rem', fontWeight: 700 }}>{l.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <button className="c-btn" onClick={() => showLeftState('form')}>
                        <span>{t.btn_demo}</span>
                        <span className="material-symbols-outlined" style={{ fontSize: '1rem', border: '1.2px solid white', borderRadius: '50%', padding: '1px' }}>arrow_forward</span>
                    </button>
                </div>
            </nav>

            {/* ══ HERO ═══════════════════════════════════════════════ */}
            <header className="c-hero">
                <div className="c-hero_video">
                    <video autoPlay loop muted playsInline>
                        <source src={HERO_VIDEO_URL} type="video/mp4" />
                    </video>
                </div>
                <div className="c-hero_overlay" />
                <div className="c-hero_content">

                    {/* ── LEFT CARD (Hero / Form / Success) ─────── */}
                    <div className={`c-card c-hero_card ${isExpanded ? 'c-card--expanded' : ''}`}>

                        {/* Default Hero State */}
                        {leftCardState === 'hero' && (
                            <div className="u-scaling-content">
                                <span className="u-sub-small">{t.hero_sub}</span>
                                <h1 className="u-heading-2" dangerouslySetInnerHTML={{ __html: t.hero_title }} />
                                <p>{t.hero_desc}</p>
                                <button className="c-btn" style={{ width: 'fit-content' }} onClick={() => showLeftState('form')}>
                                    <span>{t.btn_demo}</span>
                                    <span className="material-symbols-outlined" style={{ fontSize: '1rem', border: '1.2px solid white', borderRadius: '50%', padding: '1px' }}>arrow_forward</span>
                                </button>
                            </div>
                        )}

                        {/* Form State */}
                        {leftCardState === 'form' && (
                            <div className="w-full">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-xl font-bold tracking-tight">Request a Demo</h2>
                                    <button className="opacity-50 hover:opacity-100" onClick={() => showLeftState('hero')}>
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>
                                <form className="space-y-4" onSubmit={handleDemoSubmit}>
                                    <div className="space-y-1">
                                        <label className="form-label">Request Information<span className="required-star">*</span></label>
                                        <select className="form-input bg-black/20 focus:outline-none focus:border-cyan-400">
                                            <option className="text-black">Request a Demo</option>
                                            <option className="text-black">Request a Free Trial</option>
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="form-label">First Name<span className="required-star">*</span></label>
                                            <input className="form-input bg-black/20 focus:outline-none" required type="text" />
                                        </div>
                                        <div>
                                            <label className="form-label">Last Name<span className="required-star">*</span></label>
                                            <input className="form-input bg-black/20 focus:outline-none" required type="text" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="form-label">Email<span className="required-star">*</span></label>
                                        <input className="form-input bg-black/20 focus:outline-none" placeholder="work@company.com" required type="email" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="form-label">Business Revenue<span className="required-star">*</span></label>
                                            <select className="form-input bg-black/20">
                                                <option className="text-black">100m - 500m</option>
                                                <option className="text-black">$500m+</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="form-label">Job Title<span className="required-star">*</span></label>
                                            <input className="form-input bg-black/20" required type="text" />
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2 pt-2">
                                        <input className="mt-1" id="marketing" required type="checkbox" />
                                        <label className="text-[0.65rem] opacity-70" htmlFor="marketing">I agree to receive marketing communications from Revizto.</label>
                                    </div>
                                    <div className="pt-4">
                                        <button className="c-btn w-full justify-center" type="submit">SUBMIT</button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* Success State */}
                        {leftCardState === 'success' && (
                            <div className="c-success-wrap">
                                <span className="u-sub-small text-red-500 font-bold mb-4 block">THANK YOU!</span>
                                <h2 className="text-3xl font-bold mb-4">Thank you for requesting a demo!</h2>
                                <p className="text-sm opacity-80 leading-relaxed mb-8">Our team will be in touch shortly to learn more about your needs and set up a time to share how <b>Revizto</b> can help address them.</p>
                                <button className="c-btn" onClick={() => showLeftState('hero')}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>home</span>
                                    <span>BACK TO HOME</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* ── RIGHT CARD (Login / Password / Register) ── */}
                    <div className="c-card c-login_card" style={{ ...rightCardStyle, transition: 'opacity 0.4s ease' }}>

                        {/* Login State (Step 1) */}
                        {rightCardState === 'login' && (
                            <div className="u-scaling-content">
                                <h2>{t.login_title}</h2>
                                <div className="subtitle">
                                    <span>{t.login_new_user} </span>
                                    <a onClick={() => { setRightCardState('registration'); setError(''); }}>{t.login_create_account}</a>
                                </div>
                                {error && <div className="c-error-msg">{error}</div>}
                                <div className="c-input_group">
                                    <label className="c-input_label">{t.login_email_label}</label>
                                    <input className="c-input_field" type="email" value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        onKeyDown={e => onKey(e, handleContinue)} />
                                </div>
                                <div className="c-btn-blue" onClick={handleContinue}>{t.login_continue}</div>
                                <div className="c-divider"><span>{t.login_or}</span></div>
                                <button className="c-social_btn" onClick={handleGoogleClick}>
                                    <GoogleIcon /><span>{t.login_google}</span>
                                </button>
                                <button className="c-social_btn">
                                    <AppleIcon /><span>{t.login_apple}</span>
                                </button>
                                <div className="c-login_links">
                                    <a href="#">{t.login_more_options}</a>
                                    <a href="#">{t.login_help}</a>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Password */}
                        {rightCardState === 'password' && (
                            <div className="u-scaling-content">
                                <div className="flex items-center gap-2 mb-4 cursor-pointer hover:opacity-70 transition-opacity"
                                    onClick={() => { setRightCardState('login'); setError(''); }}>
                                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                                    <span className="text-[0.65rem] font-bold uppercase tracking-wider">{t.login_back}</span>
                                </div>
                                <h2>{t.login_pass_title}</h2>
                                <div className="text-[0.75rem] opacity-60 mb-6 truncate">{email || 'user@example.com'}</div>
                                {error && <div className="c-error-msg">{error}</div>}
                                <div className="c-input_group">
                                    <label className="c-input_label">{t.reg_pass_label}</label>
                                    <input ref={passwordRef} className="c-input_field" type="password"
                                        value={password} onChange={e => setPassword(e.target.value)}
                                        onKeyDown={e => onKey(e, handleLogin)} />
                                </div>
                                <div className={`c-btn-blue mt-4 ${loading ? 'opacity-50' : ''}`}
                                    onClick={loading ? undefined : handleLogin}>{loading ? '...' : t.login_btn}</div>
                                <div className="c-login_links mt-4">
                                    <a href="#">{t.login_help}</a>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Access / Loading */}
                        {rightCardState === 'access' && (
                            <div className="u-scaling-content text-center">
                                <div className="py-8">
                                    <div className="spinner mb-6" />
                                    <h3 className="text-xl font-bold mb-2">{t.welcome_back}</h3>
                                    <p className="text-[0.7rem] opacity-70">{t.redirecting}</p>
                                </div>
                            </div>
                        )}

                        {/* Registration State */}
                        {rightCardState === 'registration' && (
                            <div className="u-scaling-content" id="registrationState">
                                <button className="c-close-btn" onClick={() => { setRightCardState('login'); setError(''); }}>
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                                <div className="w-full">
                                    <h2 className="mb-1">{t.reg_title}</h2>
                                    <div className="subtitle">
                                        <span>{t.reg_already_user} </span>
                                        <a onClick={() => { setRightCardState('login'); setError(''); }}>{t.reg_login_link}</a>
                                    </div>
                                    {error && <div className="c-error-msg">{error}</div>}
                                    <div className="c-input_group">
                                        <label className="c-input_label">{t.reg_name_label}</label>
                                        <input className="c-input_field" type="text" value={regName} onChange={e => setRegName(e.target.value)} />
                                    </div>
                                    <div className="c-input_group">
                                        <label className="c-input_label">{t.reg_email_label}</label>
                                        <input className="c-input_field" type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} />
                                    </div>
                                    <div className="c-input_group">
                                        <label className="c-input_label">{t.reg_pass_label}</label>
                                        <input className="c-input_field" type="password" value={regPass} onChange={e => setRegPass(e.target.value)} />
                                    </div>
                                    <div className="c-input_group">
                                        <label className="c-input_label">{t.reg_confirm_label}</label>
                                        <input className="c-input_field" type="password" value={regConfirm}
                                            onChange={e => setRegConfirm(e.target.value)}
                                            onKeyDown={e => onKey(e, handleRegister)} />
                                    </div>
                                    <div className={`c-btn-blue ${loading ? 'opacity-50' : ''}`}
                                        onClick={loading ? undefined : handleRegister}>{loading ? '...' : t.reg_submit}</div>
                                    <div className="c-login_links">
                                        <a onClick={() => { setRightCardState('login'); setError(''); }}>{t.reg_back}</a>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Registration Success */}
                        {rightCardState === 'regSuccess' && (
                            <div className="u-scaling-content">
                                <div className="text-center py-6">
                                    <span className="material-symbols-outlined text-green-400 mb-4" style={{ fontSize: '3rem' }}>check_circle</span>
                                    <h3 className="text-xl font-bold mb-2">{t.reg_success_title}</h3>
                                    <p className="text-xs opacity-80 mb-6">{t.reg_success_msg}</p>
                                    <div className="c-btn-blue" onClick={() => { setRightCardState('login'); setError(''); }}>{t.reg_back}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>
        </div>
    );
};

export default LoginScreen;
