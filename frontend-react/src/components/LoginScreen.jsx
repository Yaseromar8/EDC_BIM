import React, { useState, useEffect } from 'react';
import './LoginScreen.css';
import { Capacitor } from '@capacitor/core';

const BACKEND_URL = Capacitor.isNativePlatform()
    ? 'https://visor-ecd-backend.onrender.com'
    : (import.meta.env.VITE_BACKEND_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://visor-ecd-backend.onrender.com'));

const LoginScreen = ({ onLogin }) => {
    const [darkMode, setDarkMode] = useState(true);
    const [mode, setMode] = useState('login'); // 'login' | 'register'
    const [showPassword, setShowPassword] = useState(false);

    // Form fields
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [companyId, setCompanyId] = useState('');
    const [jobTitleId, setJobTitleId] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Dropdown data
    const [companies, setCompanies] = useState([]);
    const [jobTitles, setJobTitles] = useState([]);

    useEffect(() => {
        if (mode === 'register') {
            fetch(`${BACKEND_URL}/api/companies`).then(r => r.json()).then(setCompanies).catch(console.error);
            fetch(`${BACKEND_URL}/api/job_titles`).then(r => r.json()).then(setJobTitles).catch(console.error);
        }

        // ── Google Identity Services Initialization ──
        const handleGoogleResponse = async (response) => {
            setLoading(true);
            try {
                const res = await fetch(`${BACKEND_URL}/api/auth/google`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: response.credential })
                });
                const data = await res.json();
                if (res.ok) {
                    onLogin(data);
                } else {
                    setError(data.error || 'Error en autenticación con Google');
                }
            } catch (err) {
                setError('Error de conexión al autenticar con Google');
            } finally {
                setLoading(false);
            }
        };

        if (window.google) {
            window.google.accounts.id.initialize({
                client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || "tu-cliente-id.apps.googleusercontent.com",
                callback: handleGoogleResponse
            });
        }
    }, [mode]);

    const handleGoogleClick = () => {
        if (window.google) {
            window.google.accounts.id.prompt(); // Muestra el One Tap si es posible
            // O podemos usar el selector de cuentas directamente
        } else {
            setError('Google Login no está disponible en este momento');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (mode === 'login' && !showPassword) {
            if (!email.trim()) return;
            setShowPassword(true);
            return;
        }

        setLoading(true);
        try {
            const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
            const body = mode === 'login'
                ? { email: email.trim(), password }
                : { name, email: email.trim(), password, company_id: parseInt(companyId), job_title_id: parseInt(jobTitleId) };

            const res = await fetch(`${BACKEND_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (res.ok) {
                onLogin(data);
            } else {
                setError(data.error || 'Ocurrió un error inesperado');
            }
        } catch (err) {
            console.error('[Login] Connection error:', err);
            setError(`Error de conexión al servidor (${BACKEND_URL}). Verifique que el backend esté corriendo.`);
        } finally {
            setLoading(false);
        }
    };

    const toggleMode = () => {
        setMode(mode === 'login' ? 'register' : 'login');
        setError('');
        setShowPassword(false);
    };

    return (
        <div className={`h-full bg-background-light dark:bg-background-dark text-gray-900 dark:text-gray-100 transition-colors duration-200 ${darkMode ? 'dark' : ''}`} style={{ height: '100vh', width: '100vw' }}>
            <div className="flex flex-col md:flex-row h-full">
                {/* ── LEFT SIDE (Banner) ── */}
                <div className="relative w-full md:w-1/2 lg:w-3/5 h-64 md:h-full overflow-hidden">
                    <img
                        alt="Futuristic Digital Twin Concept"
                        className="absolute inset-0 w-full h-full object-cover"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuCk4kHAxsMTZAW7WGXRd71hrzxhCktCoyWXYRRrWfpvnnsNJCkRp9kQAD_hjOpPbFImuJ9pb1cQjag2PKxxNcFODcek02vEvT7asBFgwWuvA9phoqCwXE7YnWs_WT7qLFgGfhiuYvLByUyZJF71JtkeZmgumtMnXXdhsrqBMqcwRn5alsnRBqMBihgxro8TTjfC8EHsCv9uC3zrJAYwaKqILYfg6t9kI893sSQ6LhRx_OuQtuQlxCij5l0feFJZ-0Co_l-Jbzbw0-E"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40 dark:from-black/90 dark:via-black/40"></div>
                    <div className="absolute inset-0 flex flex-col items-start justify-between p-12 lg:p-24 text-white">
                        <div className="flex items-center space-x-3">
                            <div className="bg-primary/20 p-2 rounded-lg backdrop-blur-md border border-white/10">
                                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor"></path>
                                    <path d="M2 17L12 22L22 17M2 12L12 17L22 12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                                </svg>
                            </div>
                            <span className="text-3xl font-bold tracking-tight">Digital Twin</span>
                        </div>
                        <div className="max-w-md">
                            <h2 className="text-3xl lg:text-4xl font-light mb-4 leading-tight">Building Intelligence</h2>
                            <p className="text-lg lg:text-xl font-light opacity-80 border-l-2 border-primary pl-4">Inicia sesión o crea una cuenta para gestionar tus activos digitales.</p>
                        </div>
                    </div>
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-50"></div>
                </div>

                {/* ── RIGHT SIDE (Form) ── */}
                <div className="w-full md:w-1/2 lg:w-2/5 flex flex-col justify-center items-center px-6 py-12 md:px-12 lg:px-20 bg-background-light dark:bg-background-dark overflow-y-auto">
                    <div className="w-full max-w-sm">
                        <div className="mb-8">
                            <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white">
                                {mode === 'login' ? 'Inicio de sesión' : 'Crear una cuenta'}
                            </h1>
                            <p className="text-[15px] text-gray-600 dark:text-gray-400">
                                {mode === 'login' ? '¿Eres un nuevo usuario?' : '¿Ya tienes una cuenta?'}
                                <button
                                    onClick={toggleMode}
                                    className="text-primary hover:underline font-medium ml-1 bg-transparent border-none p-0 cursor-pointer"
                                >
                                    {mode === 'login' ? 'Crear una cuenta' : 'Iniciar sesión'}
                                </button>
                            </p>
                        </div>

                        <form className="space-y-6" onSubmit={handleSubmit}>
                            {error && (
                                <div className="p-3 bg-red-100 border border-red-200 text-red-700 text-sm rounded">
                                    {error}
                                </div>
                            )}

                            {mode === 'register' && (
                                <div>
                                    <label className="block text-sm font-normal text-gray-600 dark:text-gray-400 mb-1">
                                        Nombre completo
                                    </label>
                                    <input
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-zinc-800 dark:text-white rounded focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                                        type="text"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        required
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-normal text-gray-600 dark:text-gray-400 mb-1" htmlFor="email">
                                    Dirección de correo electrónico
                                </label>
                                <input
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-zinc-800 dark:text-white rounded focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                                    id="email"
                                    name="email"
                                    required
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    disabled={showPassword && mode === 'login'}
                                />
                            </div>

                            {mode === 'register' && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-normal text-gray-600 dark:text-gray-400 mb-1">Empresa</label>
                                        <select
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-zinc-800 dark:text-white rounded focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                                            value={companyId}
                                            onChange={e => setCompanyId(e.target.value)}
                                            required
                                        >
                                            <option value="">...</option>
                                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-normal text-gray-600 dark:text-gray-400 mb-1">Cargo</label>
                                        <select
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-zinc-800 dark:text-white rounded focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                                            value={jobTitleId}
                                            onChange={e => setJobTitleId(e.target.value)}
                                            required
                                        >
                                            <option value="">...</option>
                                            {jobTitles.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {(showPassword || mode === 'register') && (
                                <div style={{ animation: 'fadeIn 0.3s' }}>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-sm font-normal text-gray-600 dark:text-gray-400" htmlFor="password">
                                            Contraseña
                                        </label>
                                        {mode === 'login' && (
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(false)}
                                                className="text-xs text-primary bg-transparent border-none p-0 cursor-pointer"
                                            >
                                                Cambiar correo
                                            </button>
                                        )}
                                    </div>
                                    <input
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-zinc-800 dark:text-white rounded focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                                        id="password"
                                        name="password"
                                        required
                                        type="password"
                                        autoFocus
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                    />
                                </div>
                            )}

                            <div className="flex justify-end">
                                <button
                                    className="bg-primary hover:bg-blue-700 text-white font-bold py-2 px-8 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                                    type="submit"
                                    disabled={loading}
                                >
                                    {loading ? '...' : (mode === 'login' ? (showPassword ? 'Entrar' : 'Continuar') : 'Registrarse')}
                                </button>
                            </div>
                        </form>

                        <div className="relative my-8">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-3 bg-background-light dark:bg-background-dark text-gray-500 dark:text-gray-400">o</span>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <button type="button" className="social-btn" onClick={handleGoogleClick}>
                                <svg className="w-5 h-5" viewBox="0 0 48 48">
                                    <path d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" fill="#EA4335"></path>
                                    <path d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" fill="#4285F4"></path>
                                    <path d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z" fill="#FBBC05"></path>
                                    <path d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" fill="#34A853"></path>
                                </svg>
                                <span className="ml-3">Continuar con Google</span>
                            </button>
                            <button type="button" className="social-btn">
                                <svg className="w-5 h-5 fill-current" viewBox="0 0 384 512">
                                    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"></path>
                                </svg>
                                <span className="ml-3">Continuar con Apple</span>
                            </button>
                        </div>

                        <div className="mt-8 text-center space-y-4">
                            <a className="block text-sm text-primary hover:underline font-medium" href="#">Más opciones de inicio de sesión</a>
                            <a className="block text-sm text-primary hover:underline font-medium" href="#">Obtener ayuda sobre cómo iniciar sesión</a>
                        </div>
                    </div>
                </div>
            </div>

            {/* Floating Buttons */}
            <div className="fixed bottom-6 right-6">
                <button className="flex items-center justify-center w-14 h-14 bg-white dark:bg-zinc-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow group cursor-pointer">
                    <span className="material-symbols-outlined text-gray-600 dark:text-gray-300 group-hover:text-primary transition-colors">chat_bubble</span>
                </button>
            </div>
            <button
                className="fixed bottom-6 left-6 p-2 bg-gray-200 dark:bg-zinc-700 rounded-full flex items-center justify-center border-none cursor-pointer"
                onClick={() => setDarkMode(!darkMode)}
            >
                {darkMode ? (
                    <span className="material-symbols-outlined text-yellow-400">light_mode</span>
                ) : (
                    <span className="material-symbols-outlined text-gray-600">dark_mode</span>
                )}
            </button>
        </div>
    );
};

export default LoginScreen;
