import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, LogOut, ShieldAlert } from 'lucide-react';
import { useAuth, isSupabaseConfigured } from '../lib/auth';

const fondo = 'min-h-screen w-full flex items-center justify-center p-4 bg-[#121318]';
const tarjeta =
  'w-full max-w-[400px] rounded-2xl border border-white/10 bg-[#1b1d26] px-8 py-9 shadow-[0_24px_60px_rgba(0,0,0,0.45)]';
const etiqueta = 'block text-[0.8rem] font-semibold text-slate-300 mb-2';
const campo =
  'w-full rounded-lg border border-white/10 bg-[#232638] px-4 py-3 text-[0.95rem] text-slate-100 placeholder:text-slate-400 outline-none transition focus:border-[#5b7cfa] focus:ring-2 focus:ring-[#5b7cfa]/40';
const boton =
  'w-full rounded-lg bg-[#5b7cfa] py-3 text-[0.95rem] font-bold text-white transition hover:bg-[#4c6cf0] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2';

function Encabezado() {
  return (
    <div className="text-center mb-8">
      <h1 className="text-[1.75rem] font-extrabold tracking-tight text-white">Triage</h1>
      <p className="mt-1 text-[0.8rem] font-medium text-slate-400">Emergencias Pediátricas</p>
    </div>
  );
}

function Aviso({ tipo, children }: { tipo: 'error' | 'info'; children: React.ReactNode }) {
  return (
    <div
      role={tipo === 'error' ? 'alert' : 'status'}
      className={
        tipo === 'error'
          ? 'rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-[0.8rem] text-rose-200'
          : 'rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-2.5 text-[0.8rem] text-sky-100'
      }
    >
      {children}
    </div>
  );
}

function CampoContrasena(props: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete: string;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <input
        id={props.id}
        type={ver ? 'text' : 'password'}
        className={campo + ' pr-11'}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-200"
        aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        {ver ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export function LoginScreen() {
  const { ingresar, recuperarContrasena } = useAuth();
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setEnviando(true);
    const r = await ingresar(usuario, contrasena);
    setEnviando(false);
    if (r.error) setError(r.error);
  };

  const onOlvide = async () => {
    setError(null);
    setInfo(null);
    const r = await recuperarContrasena(usuario);
    if (r.error) setError(r.error);
    if (r.mensaje) setInfo(r.mensaje);
  };

  return (
    <div className={fondo}>
      <form className={tarjeta} onSubmit={onSubmit} noValidate>
        <Encabezado />

        {!isSupabaseConfigured && (
          <div className="mb-5">
            <Aviso tipo="error">
              El servidor de datos no está configurado (faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY). No es
              posible ingresar.
            </Aviso>
          </div>
        )}

        <div className="space-y-5">
          <div>
            <label htmlFor="usuario" className={etiqueta}>
              Correo institucional
            </label>
            <input
              id="usuario"
              type="email"
              inputMode="email"
              className={campo}
              placeholder="nombre@buenosaires.gob.ar"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="contrasena" className={etiqueta}>
              Contraseña
            </label>
            <CampoContrasena
              id="contrasena"
              value={contrasena}
              onChange={setContrasena}
              placeholder="Contraseña"
              autoComplete="current-password"
            />
          </div>

          {error && <Aviso tipo="error">{error}</Aviso>}
          {info && <Aviso tipo="info">{info}</Aviso>}

          <button type="submit" className={boton} disabled={enviando || !isSupabaseConfigured}>
            {enviando && <Loader2 size={18} className="animate-spin" />}
            Ingresar
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={onOlvide}
              className="text-[0.8rem] font-medium text-[#8fa6ff] hover:text-white hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function NuevaContrasenaScreen() {
  const { cambiarContrasena } = useAuth();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (a !== b) return setError('Las contraseñas no coinciden.');
    setEnviando(true);
    const r = await cambiarContrasena(a);
    setEnviando(false);
    if (r.error) setError(r.error);
  };

  return (
    <div className={fondo}>
      <form className={tarjeta} onSubmit={onSubmit} noValidate>
        <Encabezado />
        <p className="mb-5 text-[0.85rem] text-slate-300">Elegí una nueva contraseña (mínimo 8 caracteres).</p>
        <div className="space-y-5">
          <div>
            <label htmlFor="nueva" className={etiqueta}>
              Nueva contraseña
            </label>
            <CampoContrasena id="nueva" value={a} onChange={setA} placeholder="Nueva contraseña" autoComplete="new-password" />
          </div>
          <div>
            <label htmlFor="repetir" className={etiqueta}>
              Repetir contraseña
            </label>
            <CampoContrasena id="repetir" value={b} onChange={setB} placeholder="Repetir contraseña" autoComplete="new-password" />
          </div>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <button type="submit" className={boton} disabled={enviando}>
            {enviando && <Loader2 size={18} className="animate-spin" />}
            Guardar contraseña
          </button>
        </div>
      </form>
    </div>
  );
}

export function SinRolScreen() {
  const { usuario, salir } = useAuth();
  return (
    <div className={fondo}>
      <div className={tarjeta}>
        <Encabezado />
        <div className="flex flex-col items-center text-center gap-3">
          <ShieldAlert size={36} className="text-amber-400" />
          <p className="text-[0.9rem] text-slate-200">
            El usuario <strong>{usuario?.usuario}</strong> no tiene un rol clínico asignado.
          </p>
          <p className="text-[0.8rem] text-slate-400">
            Pedile al administrador que te asigne un rol (asistente, enfermería, médico/a o administrador/a) para poder
            usar la herramienta.
          </p>
          <button type="button" onClick={salir} className={boton + ' mt-4'}>
            <LogOut size={18} /> Salir
          </button>
        </div>
      </div>
    </div>
  );
}

/** Muestra el login hasta que haya una sesión válida con rol clínico; después, la app. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, usuario, cargando, modoNuevaContrasena } = useAuth();
  if (cargando) {
    return (
      <div className={fondo}>
        <Loader2 size={32} className="animate-spin text-slate-400" />
      </div>
    );
  }
  if (modoNuevaContrasena && session) return <NuevaContrasenaScreen />;
  if (!session) return <LoginScreen />;
  if (!usuario?.rol) return <SinRolScreen />;
  return <>{children}</>;
}
