import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';

export type RolClinico = 'asistente' | 'enfermero' | 'medico' | 'administrador';

export const ROLES_VALIDOS: RolClinico[] = ['asistente', 'enfermero', 'medico', 'administrador'];

export const ROL_ETIQUETA: Record<RolClinico, string> = {
  asistente: 'Asistente',
  enfermero: 'Enfermería',
  medico: 'Médico/a',
  administrador: 'Administrador/a',
};

/**
 * Dominio interno para usuarios sin correo electrónico.
 * Supabase identifica a cada usuario por un email: si la persona escribe
 * solo su nombre de usuario (sin "@"), se completa con este dominio.
 * Ej.: "jperez" -> "jperez@triage.grierson.local"
 */
export const USER_DOMAIN =
  ((import.meta as any).env.VITE_AUTH_USER_DOMAIN as string | undefined)?.trim() || 'triage.grierson.local';

export const esEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export const usuarioAEmail = (usuario: string) => {
  const u = usuario.trim().toLowerCase();
  return u.includes('@') ? u : `${u}@${USER_DOMAIN}`;
};

export interface UsuarioActual {
  id: string;
  email: string;
  usuario: string;
  nombre: string;
  rol: RolClinico | null;
}

interface AuthContextValue {
  session: Session | null;
  usuario: UsuarioActual | null;
  cargando: boolean;
  ingresar: (usuario: string, contrasena: string) => Promise<{ error?: string }>;
  recuperarContrasena: (usuario: string) => Promise<{ error?: string; mensaje?: string }>;
  /** true cuando la persona llegó desde el enlace de "olvidé mi contraseña" */
  modoNuevaContrasena: boolean;
  cambiarContrasena: (nueva: string) => Promise<{ error?: string }>;
  salir: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const sessionAUsuario = (session: Session | null): UsuarioActual | null => {
  if (!session?.user) return null;
  const u = session.user;
  const email = u.email || '';
  const rol = (u.app_metadata?.rol_clinico as RolClinico | undefined) || null;
  const nombre =
    (u.user_metadata?.nombre as string | undefined) ||
    (u.user_metadata?.full_name as string | undefined) ||
    email.split('@')[0];
  return {
    id: u.id,
    email,
    usuario: email.endsWith(`@${USER_DOMAIN}`) ? email.split('@')[0] : email,
    nombre,
    rol: rol && ROLES_VALIDOS.includes(rol) ? rol : null,
  };
};

const traducirError = (msg: string) => {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'El usuario todavía no fue confirmado. Consultá con el administrador.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'No hay conexión con el servidor. Verificá la red e intentá de nuevo.';
  if (m.includes('rate limit')) return 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.';
  return msg;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);
  const [modoNuevaContrasena, setModoNuevaContrasena] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setCargando(false);
      return;
    }
    // La sesión queda guardada en el navegador: si se corta la conexión,
    // quien ya ingresó puede seguir trabajando (los datos se sincronizan luego).
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCargando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      if (evt === 'PASSWORD_RECOVERY') setModoNuevaContrasena(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const ingresar: AuthContextValue['ingresar'] = async (usuario, contrasena) => {
    if (!supabase) return { error: 'El servidor de datos no está configurado.' };
    if (!usuario.trim() || !contrasena) return { error: 'Completá tu correo institucional y tu contraseña.' };
    if (!esEmail(usuario)) return { error: 'Ingresá tu correo institucional completo (ej.: nombre@buenosaires.gob.ar).' };
    const { error } = await supabase.auth.signInWithPassword({
      email: usuarioAEmail(usuario),
      password: contrasena,
    });
    return error ? { error: traducirError(error.message) } : {};
  };

  const recuperarContrasena: AuthContextValue['recuperarContrasena'] = async (usuario) => {
    const u = usuario.trim().toLowerCase();
    if (!esEmail(u)) {
      return { error: 'Escribí tu correo institucional en el campo de arriba y volvé a tocar "¿Olvidaste tu contraseña?".' };
    }
    if (!supabase) return { error: 'El servidor de datos no está configurado.' };
    const { error } = await supabase.auth.resetPasswordForEmail(u, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (error) return { error: traducirError(error.message) };
    return { mensaje: `Si ${u} está registrado, vas a recibir un correo con el enlace para crear una nueva contraseña.` };
  };

  const cambiarContrasena: AuthContextValue['cambiarContrasena'] = async (nueva) => {
    if (!supabase) return { error: 'El servidor de datos no está configurado.' };
    if (nueva.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres.' };
    const { error } = await supabase.auth.updateUser({ password: nueva });
    if (error) return { error: traducirError(error.message) };
    setModoNuevaContrasena(false);
    return {};
  };

  const salir = async () => {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{ session, usuario: sessionAUsuario(session), cargando, ingresar, recuperarContrasena, modoNuevaContrasena, cambiarContrasena, salir }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
};

/** Id del usuario logueado, para completar creado_por / registrado_por / actualizado_por. */
export const getCurrentUserId = async (): Promise<string | null> => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
};

export { isSupabaseConfigured };
