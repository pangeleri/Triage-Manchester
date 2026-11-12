-- ====================================================================
-- ALTA DE USUARIOS Y ROLES · Herramienta de Triaje Grierson
-- ====================================================================
-- Paso 1 (en el panel de Supabase, una sola vez):
--   Authentication > Sign In / Providers > Email:
--     * Desactivar "Allow new users to sign up" (solo el administrador crea usuarios).
--   Authentication > URL Configuration:
--     * Site URL y Redirect URLs: la dirección pública de la herramienta (ej.: https://<dominio>/),
--       para que el enlace de "¿Olvidaste tu contraseña?" vuelva a la app.
--   Authentication > Emails > SMTP Settings:
--     * Configurar un servidor de correo propio (SMTP). El correo incluido en Supabase tiene un
--       límite muy bajo de envíos por hora y solo está pensado para pruebas.
--
-- Paso 2 · Crear cada usuario con su CORREO INSTITUCIONAL:
--   Authentication > Users > "Add user" > "Create new user"
--     * Email: correo institucional de la persona.
--     * Password: contraseña inicial (la persona puede cambiarla con "¿Olvidaste tu contraseña?").
--     * Marcar "Auto Confirm User".
--
-- Paso 3 · Asignar nombre y rol clínico (SQL Editor). Roles válidos:
--   'asistente' | 'enfermero' | 'medico' | 'administrador'
--   (las reevaluaciones solo las pueden registrar enfermero, medico o administrador)
-- ====================================================================

UPDATE auth.users
SET raw_app_meta_data  = COALESCE(raw_app_meta_data, '{}'::jsonb)  || '{"rol_clinico": "medico"}'::jsonb,
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"nombre": "Juan Pérez"}'::jsonb
WHERE email = 'jperez@buenosaires.gob.ar';

-- Ver usuarios y sus roles:
SELECT email,
       raw_user_meta_data ->> 'nombre'     AS nombre,
       raw_app_meta_data  ->> 'rol_clinico' AS rol,
       last_sign_in_at
FROM auth.users
ORDER BY email;

-- Quitar el acceso a alguien (sin borrar lo que registró):
-- UPDATE auth.users
-- SET raw_app_meta_data = raw_app_meta_data - 'rol_clinico'
-- WHERE email = 'jperez@buenosaires.gob.ar';

-- Nota: el rol viaja dentro de la sesión. Si se cambia el rol de alguien,
-- el cambio rige cuando esa persona vuelve a ingresar.
