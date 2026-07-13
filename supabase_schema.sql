-- ====================================================================
-- SCRIPT DE MIGRACIÓN Y CREACIÓN DE TABLAS - TRIAJE PEDIÁTRICO (ETAPA 1)
-- ====================================================================

-- 1. Respaldar y eliminar tabla de prueba previa
DROP TABLE IF EXISTS triage_records CASCADE;

-- 2. Crear tabla principal de episodios de triaje pediátrico
CREATE TABLE episodios_triaje_pediatrico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Datos filiatorios (opcionales solo en preliminar_critico)
    nombre TEXT,
    fecha_nacimiento DATE NULL,
    edad_meses INTEGER,
    edad_estimada BOOLEAN DEFAULT false,
    sexo TEXT,
    documento_identidad TEXT,
    
    -- Datos del acompañante
    nombre_acompanante TEXT,
    telefono_acompanante TEXT,
    parentesco_acompanante TEXT,
    
    -- Motivo de consulta
    motivo_consulta_cedis TEXT,
    
    -- Estados operativos y de triaje
    estado_operativo VARCHAR(50) NOT NULL CHECK (
        estado_operativo IN ('preliminar_critico', 'en_espera', 'llamado', 'en_atencion', 'derivado', 'cancelado', 'finalizado')
    ),
    nivel_ctas_sugerido INTEGER CHECK (nivel_ctas_sugerido BETWEEN 1 AND 5),
    nivel_ctas_final INTEGER CHECK (nivel_ctas_final BETWEEN 1 AND 5),
    
    -- Tiempos objetivos y vencimientos
    objetivo_evaluacion_minutos INTEGER CHECK (objetivo_evaluacion_minutos IN (0, 15, 30, 60, 120)),
    fecha_objetivo_evaluacion TIMESTAMP WITH TIME ZONE,
    arrival_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Justificación de no obtención
    motivo_no_obtencion TEXT,
    
    -- Auditoría
    creado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actualizado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Restricciones de integridad clínica
    CONSTRAINT chk_edad_meses_critico CHECK (
        estado_operativo = 'preliminar_critico' OR edad_meses IS NOT NULL
    ),
    CONSTRAINT chk_objetivo_evaluacion_critico CHECK (
        estado_operativo = 'preliminar_critico' OR objetivo_evaluacion_minutos IS NOT NULL
    )
);

-- Índices para optimizar velocidad del panel de control
CREATE INDEX idx_episodios_estado ON episodios_triaje_pediatrico(estado_operativo);
CREATE INDEX idx_episodios_ctas ON episodios_triaje_pediatrico(nivel_ctas_final);
CREATE INDEX idx_episodios_llegada ON episodios_triaje_pediatrico(arrival_date);

-- 3. Crear tabla de signos vitales (Relación 1:1 con restricción UNIQUE)
CREATE TABLE signos_vitales_triaje_pediatrico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episodio_id UUID NOT NULL UNIQUE REFERENCES episodios_triaje_pediatrico(id) ON DELETE RESTRICT,
    
    frecuencia_cardiaca INTEGER,
    frecuencia_cardiaca_ds TEXT CHECK (
        frecuencia_cardiaca_ds IN (
            'menos_2_ds', 'menos_1_ds', 'normal', 'mas_1_ds', 'mas_2_ds',
            'menor_menos_2_ds_fuera_tabla', 'mayor_mas_2_ds_fuera_tabla', 'no_calculado'
        )
    ),
    frecuencia_respiratoria INTEGER,
    frecuencia_respiratoria_ds TEXT CHECK (
        frecuencia_respiratoria_ds IN (
            'menos_2_ds', 'menos_1_ds', 'normal', 'mas_1_ds', 'mas_2_ds',
            'menor_menos_2_ds_fuera_tabla', 'mayor_mas_2_ds_fuera_tabla', 'no_calculado'
        )
    ),
    temperatura NUMERIC(4,2),
    metodo_temperatura TEXT,
    saturacion_oxigeno INTEGER,
    condicion_medicion_spo2 TEXT,
    glucemia INTEGER,
    tension_arterial_sistolica INTEGER,
    tension_arterial_diastolica INTEGER,
    escala_dolor TEXT,
    puntaje_dolor INTEGER,
    avdi VARCHAR(50),
    motivo_no_obtencion TEXT,
    
    creado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Crear tabla de Triángulo de Evaluación Pediátrica (TEP) - Relación 1:1
CREATE TABLE tep_triaje_pediatrico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episodio_id UUID NOT NULL UNIQUE REFERENCES episodios_triaje_pediatrico(id) ON DELETE RESTRICT,
    
    apariencia VARCHAR(20) DEFAULT 'no_evaluado' CHECK (apariencia IN ('no_evaluado', 'normal', 'alterado', 'no_valorable')),
    respiracion VARCHAR(20) DEFAULT 'no_evaluado' CHECK (respiracion IN ('no_evaluado', 'normal', 'alterado', 'no_valorable')),
    circulacion VARCHAR(20) DEFAULT 'no_evaluado' CHECK (circulacion IN ('no_evaluado', 'normal', 'alterado', 'no_valorable')),
    
    creado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Crear tabla de discriminadores del catálogo
CREATE TABLE discriminadores_triaje_pediatrico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episodio_id UUID NOT NULL REFERENCES episodios_triaje_pediatrico(id) ON DELETE RESTRICT,
    
    codigo_discriminador TEXT,
    sistema TEXT,
    etiqueta TEXT,
    nivel_ctas_asociado INTEGER CHECK (nivel_ctas_asociado BETWEEN 1 AND 5),
    version_catalogo TEXT DEFAULT '1.0',
    estado_validacion TEXT DEFAULT 'pendiente_de_validacion_clinica' CHECK (
        estado_validacion IN ('pendiente_de_validacion_clinica', 'validado', 'requiere_confirmacion_manual')
    ),
    
    registrado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    registrado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 6. Crear tabla de reevaluaciones periódicas clínicas
CREATE TABLE reevaluaciones_triaje_pediatrico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episodio_id UUID NOT NULL REFERENCES episodios_triaje_pediatrico(id) ON DELETE RESTRICT,
    
    nivel_ctas_previo INTEGER CHECK (nivel_ctas_previo BETWEEN 1 AND 5),
    nivel_ctas_posterior INTEGER CHECK (nivel_ctas_posterior BETWEEN 1 AND 5),
    motivo_cambio TEXT,
    observaciones TEXT,
    proxima_reevaluacion TIMESTAMP WITH TIME ZONE,
    
    -- Signos vitales clínicos de reevaluación
    frecuencia_cardiaca INTEGER,
    frecuencia_respiratoria INTEGER,
    temperatura NUMERIC(4,2),
    saturacion_oxigeno INTEGER,
    glucemia INTEGER,
    tension_arterial_sistolica INTEGER,
    tension_arterial_diastolica INTEGER,
    avdi VARCHAR(50),
    puntaje_dolor INTEGER,
    motivo_no_obtencion TEXT,
    
    registrado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================
-- CONFIGURACIÓN DE SEGURIDAD RLS (Row Level Security) Y ROLES ASISTENCIALES
-- ====================================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE episodios_triaje_pediatrico ENABLE ROW LEVEL SECURITY;
ALTER TABLE signos_vitales_triaje_pediatrico ENABLE ROW LEVEL SECURITY;
ALTER TABLE tep_triaje_pediatrico ENABLE ROW LEVEL SECURITY;
ALTER TABLE discriminadores_triaje_pediatrico ENABLE ROW LEVEL SECURITY;
ALTER TABLE reevaluaciones_triaje_pediatrico ENABLE ROW LEVEL SECURITY;

-- Función auxiliar para verificar si el usuario tiene rol clínico válido en app_metadata
CREATE OR REPLACE FUNCTION check_user_clinical_role(allowed_roles TEXT[])
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    user_role := auth.jwt() -> 'app_metadata' ->> 'rol_clinico';
    RETURN (user_role IS NOT NULL AND user_role = ANY(allowed_roles));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================================================
-- POLÍTICAS DE ACCESO PARA: episodios_triaje_pediatrico
-- ====================================================================

CREATE POLICY episodios_select_policy ON episodios_triaje_pediatrico
    FOR SELECT TO authenticated
    USING (check_user_clinical_role(ARRAY['asistente', 'enfermero', 'medico', 'administrador']));

CREATE POLICY episodios_insert_policy ON episodios_triaje_pediatrico
    FOR INSERT TO authenticated
    WITH CHECK (
        check_user_clinical_role(ARRAY['asistente', 'enfermero', 'medico', 'administrador'])
        AND creado_por = auth.uid()
    );

CREATE POLICY episodios_update_policy ON episodios_triaje_pediatrico
    FOR UPDATE TO authenticated
    USING (
        check_user_clinical_role(ARRAY['asistente', 'enfermero', 'medico', 'administrador'])
    )
    WITH CHECK (
        actualizado_por = auth.uid()
    );

-- ====================================================================
-- POLÍTICAS DE ACCESO PARA: signos_vitales_triaje_pediatrico
-- ====================================================================

CREATE POLICY signos_select_policy ON signos_vitales_triaje_pediatrico
    FOR SELECT TO authenticated
    USING (check_user_clinical_role(ARRAY['asistente', 'enfermero', 'medico', 'administrador']));

CREATE POLICY signos_insert_policy ON signos_vitales_triaje_pediatrico
    FOR INSERT TO authenticated
    WITH CHECK (
        check_user_clinical_role(ARRAY['asistente', 'enfermero', 'medico', 'administrador'])
        AND creado_por = auth.uid()
    );

-- ====================================================================
-- POLÍTICAS DE ACCESO PARA: tep_triaje_pediatrico
-- ====================================================================

CREATE POLICY tep_select_policy ON tep_triaje_pediatrico
    FOR SELECT TO authenticated
    USING (check_user_clinical_role(ARRAY['asistente', 'enfermero', 'medico', 'administrador']));

CREATE POLICY tep_insert_policy ON tep_triaje_pediatrico
    FOR INSERT TO authenticated
    WITH CHECK (
        check_user_clinical_role(ARRAY['asistente', 'enfermero', 'medico', 'administrador'])
        AND creado_por = auth.uid()
    );

-- ====================================================================
-- POLÍTICAS DE ACCESO PARA: discriminadores_triaje_pediatrico
-- ====================================================================

CREATE POLICY discriminadores_select_policy ON discriminadores_triaje_pediatrico
    FOR SELECT TO authenticated
    USING (check_user_clinical_role(ARRAY['asistente', 'enfermero', 'medico', 'administrador']));

CREATE POLICY discriminadores_insert_policy ON discriminadores_triaje_pediatrico
    FOR INSERT TO authenticated
    WITH CHECK (
        check_user_clinical_role(ARRAY['asistente', 'enfermero', 'medico', 'administrador'])
        AND registrado_por = auth.uid()
    );

-- ====================================================================
-- POLÍTICAS DE ACCESO PARA: reevaluaciones_triaje_pediatrico
-- ====================================================================

CREATE POLICY reevaluaciones_select_policy ON reevaluaciones_triaje_pediatrico
    FOR SELECT TO authenticated
    USING (check_user_clinical_role(ARRAY['asistente', 'enfermero', 'medico', 'administrador']));

CREATE POLICY reevaluaciones_insert_policy ON reevaluaciones_triaje_pediatrico
    FOR INSERT TO authenticated
    WITH CHECK (
        check_user_clinical_role(ARRAY['enfermero', 'medico', 'administrador'])
        AND registrado_por = auth.uid()
    );
