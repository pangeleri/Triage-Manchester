-- ====================================================================
-- CORRECCIÓN DE TRIAJES CON REGISTRO · Herramienta de Triaje Grierson
-- Ejecutar en Supabase (SQL Editor) DESPUÉS de supabase_schema.sql.
-- ====================================================================
-- Reglas:
--   * Solo puede corregir quien hizo el triaje (creado_por = usuario actual).
--   * Solo mientras el paciente no fue atendido: estado 'preliminar_critico', 'en_espera' o 'llamado'.
--   * Cada corrección guarda la versión anterior y la nueva, quién y cuándo. No se puede editar ni borrar.
--   * Los discriminadores reemplazados no se borran: quedan marcados como no vigentes.
-- ====================================================================

-- 1. Tabla de correcciones
CREATE TABLE IF NOT EXISTS correcciones_triaje_pediatrico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episodio_id UUID NOT NULL REFERENCES episodios_triaje_pediatrico(id) ON DELETE RESTRICT,
    nivel_ctas_previo INTEGER CHECK (nivel_ctas_previo BETWEEN 1 AND 5),
    nivel_ctas_nuevo  INTEGER CHECK (nivel_ctas_nuevo  BETWEEN 1 AND 5),
    motivo TEXT NOT NULL CHECK (length(trim(motivo)) >= 5),
    datos_previos JSONB NOT NULL,
    datos_nuevos  JSONB NOT NULL,
    corregido_por UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    corregido_por_nombre TEXT,
    fecha_correccion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_correcciones_episodio ON correcciones_triaje_pediatrico(episodio_id);

-- 2. Discriminadores: marca de vigencia (los reemplazados quedan en false)
ALTER TABLE discriminadores_triaje_pediatrico
    ADD COLUMN IF NOT EXISTS vigente BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. Función auxiliar: ¿el usuario actual hizo este triaje y todavía es corregible?
CREATE OR REPLACE FUNCTION puede_corregir_episodio(ep_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM episodios_triaje_pediatrico e
        WHERE e.id = ep_id
          AND e.creado_por = auth.uid()
          AND e.estado_operativo IN ('preliminar_critico', 'en_espera', 'llamado')
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 4. Políticas de la tabla de correcciones (solo leer e insertar; nunca actualizar ni borrar)
ALTER TABLE correcciones_triaje_pediatrico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS correcciones_select_policy ON correcciones_triaje_pediatrico;
CREATE POLICY correcciones_select_policy ON correcciones_triaje_pediatrico
    FOR SELECT TO authenticated
    USING (check_user_clinical_role(ARRAY['asistente', 'enfermero', 'medico', 'administrador']));

DROP POLICY IF EXISTS correcciones_insert_policy ON correcciones_triaje_pediatrico;
CREATE POLICY correcciones_insert_policy ON correcciones_triaje_pediatrico
    FOR INSERT TO authenticated
    WITH CHECK (
        check_user_clinical_role(ARRAY['asistente', 'enfermero', 'medico', 'administrador'])
        AND corregido_por = auth.uid()
        AND puede_corregir_episodio(episodio_id)
    );

-- 5. Permitir que quien hizo el triaje actualice signos vitales y TEP mientras sea corregible
DROP POLICY IF EXISTS signos_update_correccion_policy ON signos_vitales_triaje_pediatrico;
CREATE POLICY signos_update_correccion_policy ON signos_vitales_triaje_pediatrico
    FOR UPDATE TO authenticated
    USING (puede_corregir_episodio(episodio_id))
    WITH CHECK (puede_corregir_episodio(episodio_id));

DROP POLICY IF EXISTS tep_update_correccion_policy ON tep_triaje_pediatrico;
CREATE POLICY tep_update_correccion_policy ON tep_triaje_pediatrico
    FOR UPDATE TO authenticated
    USING (puede_corregir_episodio(episodio_id))
    WITH CHECK (puede_corregir_episodio(episodio_id));

-- 6. Permitir marcar discriminadores como no vigentes (solo quien hizo el triaje, mientras sea corregible)
DROP POLICY IF EXISTS discriminadores_update_correccion_policy ON discriminadores_triaje_pediatrico;
CREATE POLICY discriminadores_update_correccion_policy ON discriminadores_triaje_pediatrico
    FOR UPDATE TO authenticated
    USING (puede_corregir_episodio(episodio_id))
    WITH CHECK (puede_corregir_episodio(episodio_id) AND vigente = FALSE);

-- Nota: la política existente episodios_update_policy ya permite actualizar el episodio
-- (nivel final, motivo, etc.) registrando actualizado_por = auth.uid().

-- 7. Función que aplica la corrección completa en una sola transacción
--    (si cualquier paso falla, no se guarda nada). Respeta las políticas de acceso (SECURITY INVOKER).
CREATE OR REPLACE FUNCTION corregir_triaje(p_episodio_id UUID, p JSONB)
RETURNS VOID AS $$
BEGIN
    IF NOT puede_corregir_episodio(p_episodio_id) THEN
        RAISE EXCEPTION 'Solo quien hizo el triaje puede corregirlo, y solo mientras el paciente no fue atendido.';
    END IF;

    INSERT INTO correcciones_triaje_pediatrico
        (episodio_id, nivel_ctas_previo, nivel_ctas_nuevo, motivo, datos_previos, datos_nuevos, corregido_por, corregido_por_nombre)
    VALUES
        (p_episodio_id, (p->>'nivel_previo')::INT, (p->>'nivel_nuevo')::INT, p->>'motivo',
         p->'datos_previos', p->'datos_nuevos', auth.uid(), p->>'corregido_por_nombre');

    UPDATE episodios_triaje_pediatrico SET
        nombre                      = p->'episodio'->>'nombre',
        edad_meses                  = NULLIF(p->'episodio'->>'edad_meses','')::INT,
        sexo                        = p->'episodio'->>'sexo',
        documento_identidad         = p->'episodio'->>'documento_identidad',
        motivo_consulta_cedis       = p->'episodio'->>'motivo_consulta_cedis',
        nivel_ctas_final            = (p->>'nivel_nuevo')::INT,
        objetivo_evaluacion_minutos = NULLIF(p->'episodio'->>'objetivo_evaluacion_minutos','')::INT,
        fecha_objetivo_evaluacion   = NULLIF(p->'episodio'->>'fecha_objetivo_evaluacion','')::TIMESTAMPTZ,
        fecha_actualizacion         = NOW(),
        actualizado_por             = auth.uid()
    WHERE id = p_episodio_id;

    UPDATE signos_vitales_triaje_pediatrico SET
        frecuencia_cardiaca         = NULLIF(p->'signos'->>'frecuencia_cardiaca','')::INT,
        frecuencia_respiratoria     = NULLIF(p->'signos'->>'frecuencia_respiratoria','')::INT,
        frecuencia_respiratoria_ds  = p->'signos'->>'frecuencia_respiratoria_ds',
        temperatura                 = NULLIF(p->'signos'->>'temperatura','')::NUMERIC,
        saturacion_oxigeno          = NULLIF(p->'signos'->>'saturacion_oxigeno','')::INT,
        glucemia                    = NULLIF(p->'signos'->>'glucemia','')::INT,
        tension_arterial_sistolica  = NULLIF(p->'signos'->>'tension_arterial_sistolica','')::INT,
        tension_arterial_diastolica = NULLIF(p->'signos'->>'tension_arterial_diastolica','')::INT,
        avdi                        = p->'signos'->>'avdi'
    WHERE episodio_id = p_episodio_id;

    UPDATE tep_triaje_pediatrico SET
        apariencia  = p->'tep'->>'apariencia',
        respiracion = p->'tep'->>'respiracion',
        circulacion = p->'tep'->>'circulacion'
    WHERE episodio_id = p_episodio_id;

    UPDATE discriminadores_triaje_pediatrico SET vigente = FALSE
    WHERE episodio_id = p_episodio_id AND vigente = TRUE;

    INSERT INTO discriminadores_triaje_pediatrico
        (episodio_id, sistema, etiqueta, nivel_ctas_asociado, estado_validacion, registrado_por, vigente)
    SELECT p_episodio_id, d->>'sistema', d->>'etiqueta', (d->>'nivel')::INT, 'validado', auth.uid(), TRUE
    FROM jsonb_array_elements(COALESCE(p->'discriminadores', '[]'::jsonb)) AS d;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION corregir_triaje(UUID, JSONB) TO authenticated;
