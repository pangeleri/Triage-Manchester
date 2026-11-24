import { createClient } from '@supabase/supabase-js';
import { PatientData, ReevaluacionData, CorreccionData, findFindingMeta } from '../types';

const rawUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
const rawAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

// Clean trailing /rest/v1/ or /rest/v1 if included by mistake
let cleanedUrl = rawUrl.trim();
if (cleanedUrl.endsWith('/rest/v1/')) {
  cleanedUrl = cleanedUrl.slice(0, -9);
} else if (cleanedUrl.endsWith('/rest/v1')) {
  cleanedUrl = cleanedUrl.slice(0, -8);
}

const supabaseUrl = cleanedUrl;
const supabaseAnonKey = rawAnonKey.trim();

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const supabase = (() => {
  if (!isSupabaseConfigured) return null;
  try {
    return createClient(supabaseUrl, supabaseAnonKey);
  } catch (e) {
    console.warn('Error inicializando el cliente de Supabase:', e);
    return null;
  }
})();

/** Traduce los errores habituales de Supabase a un mensaje claro y accionable. */
export function explicarErrorSupabase(msg: string | undefined, code?: string): string {
  const m = (msg || '').toLowerCase();
  if (code === '42P01' || m.includes('does not exist') || m.includes('could not find the table') || m.includes('schema cache'))
    return 'Faltan las tablas en la base de datos: hay que ejecutar supabase_schema.sql en Supabase (SQL Editor). Detalle: ' + msg;
  if (code === '42501' || m.includes('row-level security') || m.includes('permission denied'))
    return 'La base rechazó el registro por permisos: el usuario no tiene rol clínico asignado o las reglas de acceso (RLS) no coinciden con supabase_schema.sql. Detalle: ' + msg;
  if (code === 'PGRST204' || (m.includes('column') && (m.includes('does not exist') || m.includes('could not find'))))
    return 'La estructura de la base no coincide con la de la app (falta una columna): hay que actualizar las tablas con los scripts .sql del proyecto. Detalle: ' + msg;
  if (code === '23514' || m.includes('check constraint'))
    return 'La base rechazó un valor que no está permitido en sus reglas (restricción CHECK). Detalle: ' + msg;
  if (m.includes('jwt') || m.includes('expired'))
    return 'La sesión venció. Cerrá sesión y volvé a ingresar. Detalle: ' + msg;
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'Sin conexión con el servidor. El registro quedó guardado en este equipo y se enviará al reconectar.';
  return msg || 'Error desconocido';
}

/**
 * Verifica la conexión contra la tabla REAL donde se guardan los triajes.
 * (La versión anterior consultaba "triage_records", una tabla de prueba: podía mostrar
 * "En línea" aunque las tablas de triaje no existieran o no se pudiera escribir en ellas.)
 */
export async function verificarConexion(): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase no está configurado.' };
  try {
    const { error } = await supabase
      .from('episodios_triaje_pediatrico')
      .select('id', { count: 'exact', head: true });
    if (error) return { ok: false, error: explicarErrorSupabase(error.message, (error as any).code) };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: explicarErrorSupabase(e?.message) };
  }
}

/**
 * Saves a pediatric triage record to the 5-table schema in Supabase.
 */
export async function saveTriageRecord(record: PatientData): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase no está configurado. Se guardó localmente.' };
  }

  try {
    // El usuario se toma de la sesión activa: la base exige que creado_por sea quien está conectado.
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess.session?.user?.id;
    if (!userId) {
      return { success: false, error: 'La sesión venció. Cerrá sesión y volvé a ingresar; el triaje quedó guardado en este equipo y se enviará después.' };
    }

    // 1. Insert into episodios_triaje_pediatrico
    const { error: epError } = await supabase
      .from('episodios_triaje_pediatrico')
      .insert([
        {
          id: record.id,
          nombre: record.name || null,
          fecha_nacimiento: null,
          edad_meses: record.ageUnit === 'meses' ? record.age : (record.age ? record.age * 12 : null),
          sexo: record.gender || null,
          documento_identidad: record.documentId || null,
          nombre_acompanante: record.nombreAcompanante || null,
          telefono_acompanante: record.telefonoAcompanante || null,
          parentesco_acompanante: record.parentescoAcompanante || null,
          motivo_consulta_cedis: record.otherSymptoms || null,
          estado_operativo: record.estadoOperativo || 'en_espera',
          nivel_ctas_sugerido: record.nivelCtasSugerido,
          nivel_ctas_final: record.nivelCtasFinal,
          objetivo_evaluacion_minutos: record.objetivoEvaluacionMinutos || null,
          fecha_objetivo_evaluacion: record.fechaObjetivoEvaluacion || null,
          arrival_date: record.arrivalDate,
          motivo_no_obtencion: record.motivoNoObtencion || null,
          creado_por: userId
        }
      ]);

    if (epError) {
      // Reintento de un registro que ya había llegado a la base: no es un error.
      if ((epError as any).code === '23505') return { success: true };
      console.warn('Error al guardar episodio en Supabase:', epError.message);
      return { success: false, error: explicarErrorSupabase(epError.message, (epError as any).code) };
    }

    // 2. Insert into signos_vitales_triaje_pediatrico
    const { error: svError } = await supabase
      .from('signos_vitales_triaje_pediatrico')
      .insert([
        {
          episodio_id: record.id,
          frecuencia_cardiaca: record.vitals.heartRate !== undefined ? record.vitals.heartRate : null,
          frecuencia_cardiaca_ds: record.frecuenciaCardiacaDs || 'no_calculado',
          frecuencia_respiratoria: record.vitals.respiratoryRate !== undefined ? record.vitals.respiratoryRate : null,
          frecuencia_respiratoria_ds: record.frecuenciaRespiratoriaDs || 'no_calculado',
          temperatura: record.vitals.temperature !== undefined ? record.vitals.temperature : null,
          saturacion_oxigeno: record.vitals.oxygenSaturation !== undefined ? record.vitals.oxygenSaturation : null,
          glucemia: record.vitals.glucose !== undefined ? record.vitals.glucose : null,
          tension_arterial_sistolica: record.vitals.systolicBP !== undefined ? record.vitals.systolicBP : null,
          tension_arterial_diastolica: record.vitals.diastolicBP !== undefined ? record.vitals.diastolicBP : null,
          escala_dolor: null,
          puntaje_dolor: null,
          avdi: record.vitals.avpu || null,
          motivo_no_obtencion: record.motivoNoObtencion || null,
          creado_por: userId
        }
      ]);

    if (svError) {
      console.warn('Error al guardar signos vitales en Supabase:', svError.message);
      // Clean up episodic record on failure
      await supabase.from('episodios_triaje_pediatrico').delete().eq('id', record.id);
      return { success: false, error: 'Signos vitales: ' + explicarErrorSupabase(svError.message, (svError as any).code) };
    }

    // 3. Insert into tep_triaje_pediatrico
    const { error: tepError } = await supabase
      .from('tep_triaje_pediatrico')
      .insert([
        {
          episodio_id: record.id,
          apariencia: record.tepStates?.apariencia || 'no_evaluado',
          respiracion: record.tepStates?.respiracion || 'no_evaluado',
          circulacion: record.tepStates?.circulacion || 'no_evaluado'
        }
      ]);

    if (tepError) {
      console.warn('Error al guardar TEP en Supabase:', tepError.message);
      await supabase.from('episodios_triaje_pediatrico').delete().eq('id', record.id);
      return { success: false, error: 'TEP: ' + explicarErrorSupabase(tepError.message, (tepError as any).code) };
    }

    // 4. Insert into discriminadores_triaje_pediatrico for each finding
    if (record.findings && record.findings.length > 0) {
      const findingsRows = record.findings.map(finding => {
        const meta = findFindingMeta(finding);
        return {
          episodio_id: record.id,
          codigo_discriminador: null,
          sistema: meta?.sistema || 'general',
          etiqueta: finding,
          nivel_ctas_asociado: meta?.nivel || record.nivelCtasFinal,
          estado_validacion: 'validado',
          registrado_por: userId,
          vigente: true
        };
      });

      const { error: discError } = await supabase
        .from('discriminadores_triaje_pediatrico')
        .insert(findingsRows);

      if (discError) {
        console.warn('Error al guardar discriminadores en Supabase:', discError.message);
        // Soft error, do not fail transaction as findings are non-blocking
      }
    }

    return { success: true };
  } catch (err: any) {
    console.warn('Excepción de Supabase durante inserción:', err);
    return { success: false, error: explicarErrorSupabase(err?.message || 'Error desconocido al guardar') };
  }
}

/**
 * Saves a new clinical reevaluation to the database.
 */
export async function saveReevaluation(reev: ReevaluacionData): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  try {
    const { error } = await supabase
      .from('reevaluaciones_triaje_pediatrico')
      .insert([
        {
          episodio_id: reev.episodioId,
          nivel_ctas_previo: reev.nivelCtasPrevio,
          nivel_ctas_posterior: reev.nivelCtasPosterior,
          motivo_cambio: reev.motivoCambio,
          observaciones: reev.observaciones,
          proxima_reevaluacion: reev.proximaReevaluacion || null,
          frecuencia_cardiaca: reev.frecuenciaCardiaca !== undefined ? reev.frecuenciaCardiaca : null,
          frecuencia_respiratoria: reev.frecuenciaRespiratoria !== undefined ? reev.frecuenciaRespiratoria : null,
          temperatura: reev.temperatura !== undefined ? reev.temperatura : null,
          saturacion_oxigeno: reev.saturacionOxigeno !== undefined ? reev.saturacionOxigeno : null,
          glucemia: reev.glucemia !== undefined ? reev.glucemia : null,
          tension_arterial_sistolica: reev.tensionArterialSistolica !== undefined ? reev.tensionArterialSistolica : null,
          tension_arterial_diastolica: reev.tensionArterialDiastolica !== undefined ? reev.tensionArterialDiastolica : null,
          avdi: reev.avpu || null,
          puntaje_dolor: null,
          motivo_no_obtencion: reev.motivoNoObtencion || null
        }
      ]);

    if (error) {
      console.warn('Error al registrar reevaluación:', error.message);
      return { success: false, error: error.message };
    }

    // Update the parent's current final CTAS and date of update
    await supabase
      .from('episodios_triaje_pediatrico')
      .update({ 
        nivel_ctas_final: reev.nivelCtasPosterior,
        fecha_actualizacion: new Date().toISOString()
      })
      .eq('id', reev.episodioId);

    return { success: true };
  } catch (err: any) {
    console.warn('Excepción de Supabase durante registro de reevaluación:', err);
    return { success: false, error: err?.message || 'Error de red en reevaluación' };
  }
}

/**
 * Updates the operational state of a triage episode in Supabase.
 */
export async function updateOperationalState(id: string, state: string): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase no está configurado.' };
  try {
    const { error } = await supabase
      .from('episodios_triaje_pediatrico')
      .update({ 
        estado_operativo: state,
        fecha_actualizacion: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error de red' };
  }
}

/**
 * Saves a clinical correction to Supabase, logging prior and new states.
 */
export async function saveCorrection(
  record: PatientData,
  correccion: CorreccionData
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase no está configurado.' };

  try {
    const ageMonths = record.ageUnit === 'meses' ? record.age : (record.age ? record.age * 12 : null);

    const discriminadoresPayload = (record.findings || []).map(finding => {
      const meta = findFindingMeta(finding);
      return {
        sistema: meta?.sistema || 'general',
        etiqueta: finding,
        nivel: meta?.nivel || record.nivelCtasFinal
      };
    });

    const payload = {
      nivel_previo: correccion.nivelPrevio,
      nivel_nuevo: correccion.nivelNuevo,
      motivo: correccion.motivo,
      datos_previos: correccion.datosPrevios,
      datos_nuevos: correccion.datosNuevos,
      corregido_por_nombre: correccion.corregidoPorNombre || null,
      episodio: {
        nombre: record.name || null,
        edad_meses: ageMonths !== undefined ? ageMonths : null,
        sexo: record.gender || null,
        documento_identidad: record.documentId || null,
        motivo_consulta_cedis: record.otherSymptoms || null,
        objetivo_evaluacion_minutos: record.objetivoEvaluacionMinutos || null,
        fecha_objetivo_evaluacion: record.fechaObjetivoEvaluacion || null
      },
      signos: {
        frecuencia_cardiaca: record.vitals.heartRate !== undefined ? record.vitals.heartRate : null,
        frecuencia_respiratoria: record.vitals.respiratoryRate !== undefined ? record.vitals.respiratoryRate : null,
        frecuencia_respiratoria_ds: record.frecuenciaRespiratoriaDs || 'no_calculado',
        temperatura: record.vitals.temperature !== undefined ? record.vitals.temperature : null,
        saturacion_oxigeno: record.vitals.oxygenSaturation !== undefined ? record.vitals.oxygenSaturation : null,
        glucemia: record.vitals.glucose !== undefined ? record.vitals.glucose : null,
        tension_arterial_sistolica: record.vitals.systolicBP !== undefined ? record.vitals.systolicBP : null,
        tension_arterial_diastolica: record.vitals.diastolicBP !== undefined ? record.vitals.diastolicBP : null,
        avdi: record.vitals.avpu || null
      },
      tep: {
        apariencia: record.tepStates?.apariencia || 'no_evaluado',
        respiracion: record.tepStates?.respiracion || 'no_evaluado',
        circulacion: record.tepStates?.circulacion || 'no_evaluado'
      },
      discriminadores: discriminadoresPayload
    };

    // Try RPC first (function from supabase_correcciones.sql)
    const { error: rpcError } = await supabase.rpc('corregir_triaje', {
      p_episodio_id: record.id,
      p: payload
    });

    if (rpcError) {
      console.warn('RPC corregir_triaje:', rpcError.message);
      // Fallback: direct table operations
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData?.user?.id || correccion.corregidoPor;

      const { error: corError } = await supabase.from('correcciones_triaje_pediatrico').insert([{
        episodio_id: record.id,
        nivel_ctas_previo: correccion.nivelPrevio,
        nivel_ctas_nuevo: correccion.nivelNuevo,
        motivo: correccion.motivo,
        datos_previos: correccion.datosPrevios,
        datos_nuevos: correccion.datosNuevos,
        corregido_por: currentUserId,
        corregido_por_nombre: correccion.corregidoPorNombre || null
      }]);

      if (corError) {
        return { success: false, error: corError.message };
      }

      await supabase.from('episodios_triaje_pediatrico').update({
        nombre: record.name || null,
        edad_meses: ageMonths !== undefined ? ageMonths : null,
        sexo: record.gender || null,
        documento_identidad: record.documentId || null,
        motivo_consulta_cedis: record.otherSymptoms || null,
        nivel_ctas_final: record.nivelCtasFinal,
        objetivo_evaluacion_minutos: record.objetivoEvaluacionMinutos || null,
        fecha_objetivo_evaluacion: record.fechaObjetivoEvaluacion || null,
        fecha_actualizacion: new Date().toISOString(),
        actualizado_por: currentUserId
      }).eq('id', record.id);

      await supabase.from('signos_vitales_triaje_pediatrico').update({
        frecuencia_cardiaca: record.vitals.heartRate !== undefined ? record.vitals.heartRate : null,
        frecuencia_respiratoria: record.vitals.respiratoryRate !== undefined ? record.vitals.respiratoryRate : null,
        frecuencia_respiratoria_ds: record.frecuenciaRespiratoriaDs || 'no_calculado',
        temperatura: record.vitals.temperature !== undefined ? record.vitals.temperature : null,
        saturacion_oxigeno: record.vitals.oxygenSaturation !== undefined ? record.vitals.oxygenSaturation : null,
        glucemia: record.vitals.glucose !== undefined ? record.vitals.glucose : null,
        tension_arterial_sistolica: record.vitals.systolicBP !== undefined ? record.vitals.systolicBP : null,
        tension_arterial_diastolica: record.vitals.diastolicBP !== undefined ? record.vitals.diastolicBP : null,
        avdi: record.vitals.avpu || null
      }).eq('episodio_id', record.id);

      await supabase.from('tep_triaje_pediatrico').update({
        apariencia: record.tepStates?.apariencia || 'no_evaluado',
        respiracion: record.tepStates?.respiracion || 'no_evaluado',
        circulacion: record.tepStates?.circulacion || 'no_evaluado'
      }).eq('episodio_id', record.id);
    }

    return { success: true };
  } catch (err: any) {
    console.warn('Excepción guardando corrección:', err);
    return { success: false, error: err?.message || 'Error al guardar corrección' };
  }
}

/**
 * Fetches the latest pediatric triage records with all associated details.
 */
export async function fetchTriageRecords(): Promise<PatientData[]> {
  if (!supabase) {
    throw new Error('Supabase no está configurado.');
  }

  try {
    let data: any[] | null = null;
    const { data: fullData, error: fullError } = await supabase
      .from('episodios_triaje_pediatrico')
      .select(`
        *,
        signos:signos_vitales_triaje_pediatrico(*),
        tep:tep_triaje_pediatrico(*),
        discriminadores:discriminadores_triaje_pediatrico(*),
        reevaluaciones:reevaluaciones_triaje_pediatrico(*),
        correcciones:correcciones_triaje_pediatrico(*)
      `)
      .order('arrival_date', { ascending: false });

    if (fullError) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('episodios_triaje_pediatrico')
        .select(`
          *,
          signos:signos_vitales_triaje_pediatrico(*),
          tep:tep_triaje_pediatrico(*),
          discriminadores:discriminadores_triaje_pediatrico(*),
          reevaluaciones:reevaluaciones_triaje_pediatrico(*)
        `)
        .order('arrival_date', { ascending: false });

      if (fallbackError) {
        console.warn('Error al obtener datos de Supabase:', fallbackError.message);
        throw new Error(fallbackError.message || 'Error de red al obtener datos');
      }
      data = fallbackData;
    } else {
      data = fullData;
    }

    return (data || []).map((row: any) => {
      const signosRow = row.signos && row.signos[0] ? row.signos[0] : {};
      const tepRow = row.tep && row.tep[0] ? row.tep[0] : {};
      const discList = row.discriminadores || [];
      const reevList = row.reevaluaciones || [];
      const corrList = row.correcciones || [];

      // Reconstruct original age representation
      const isMonths = row.edad_meses !== null && row.edad_meses < 12;
      const ageVal = isMonths ? row.edad_meses : (row.edad_meses !== null ? Math.round(row.edad_meses / 12) : undefined);

      // Reconstruct Triage Roman Numerals
      const romanLevels: Record<number, 'I' | 'II' | 'III' | 'IV' | 'V'> = {
        1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V'
      };

      const triageLevel = romanLevels[row.nivel_ctas_final] || 'V';
      const originalPriority = romanLevels[row.nivel_ctas_sugerido] 
        ? `Nivel ${romanLevels[row.nivel_ctas_sugerido]}` 
        : 'Nivel V';

      const waitTimes: Record<string, string> = {
        'I': 'Inmediata (0 min)',
        'II': '≤ 15 min',
        'III': '≤ 30 min',
        'IV': '≤ 60 min',
        'V': '≤ 120 min'
      };

      return {
        id: row.id,
        name: row.nombre || 'PACIENTE CRÍTICO PRELIMINAR',
        age: ageVal,
        ageUnit: isMonths ? 'meses' : 'años',
        gender: row.sexo || 'M',
        documentId: row.documento_identidad || '',
        arrivalDate: row.arrival_date,
        type: 'pediatric',
        
        tepStates: {
          apariencia: tepRow.apariencia || 'no_evaluado',
          respiracion: tepRow.respiracion || 'no_evaluado',
          circulacion: tepRow.circulacion || 'no_evaluado'
        },

        // Map back to legacy UI structures for backward compatibility where needed
        tep: {
          appearance: {
            normal: tepRow.apariencia === 'normal',
            abnormalActivity: false,
            unresponsive: tepRow.apariencia === 'alterado',
            abnormalVisualContact: false,
            irritableInconsolable: false,
            abnormalCry: false,
            abnormalTone: false
          },
          respiration: {
            normal: tepRow.respiracion === 'normal',
            agitation: false,
            apnea: false,
            abnormalPosition: false,
            abnormalSounds: false,
            retractions: tepRow.respiracion === 'alterado'
          },
          circulation: {
            normal: tepRow.circulacion === 'normal',
            cyanosis: tepRow.circulacion === 'alterado',
            mottled: false,
            pallor: false,
            flushing: false
          }
        },

        vitals: {
          heartRate: signosRow.frecuencia_cardiaca !== null ? signosRow.frecuencia_cardiaca : undefined,
          respiratoryRate: signosRow.frecuencia_respiratoria !== null ? signosRow.frecuencia_respiratoria : undefined,
          temperature: signosRow.temperatura !== null ? parseFloat(signosRow.temperatura) : undefined,
          oxygenSaturation: signosRow.saturacion_oxigeno !== null ? signosRow.saturacion_oxigeno : undefined,
          glucose: signosRow.glucemia !== null ? signosRow.glucemia : undefined,
          systolicBP: signosRow.tension_arterial_sistolica !== null ? signosRow.tension_arterial_sistolica : undefined,
          diastolicBP: signosRow.tension_arterial_diastolica !== null ? signosRow.tension_arterial_diastolica : undefined,
          avpu: signosRow.avdi || undefined
        },

        frecuenciaCardiacaDs: signosRow.frecuencia_cardiaca_ds || 'no_calculado',
        frecuenciaRespiratoriaDs: signosRow.frecuencia_respiratoria_ds || 'no_calculado',
        
        findings: discList.map((d: any) => d.etiqueta),
        otherSymptoms: row.motivo_consulta_cedis || '',
        triageLevel: triageLevel,
        originalPriority: originalPriority,
        waitTime: waitTimes[triageLevel] || '≤ 120 min',
        suggestedDestination: triageLevel === 'I' ? 'Shock Room' : (triageLevel === 'II' ? 'Box de Emergencias' : 'Consultorio de Urgencias'),

        // Companion info
        nombreAcompanante: row.nombre_acompanante || '',
        telefonoAcompanante: row.telefono_acompanante || '',
        parentescoAcompanante: row.parentesco_acompanante || '',

        // Clinical states & objectives
        estadoOperativo: row.estado_operativo,
        nivelCtasSugerido: row.nivel_ctas_sugerido,
        nivelCtasFinal: row.nivel_ctas_final,
        objetivoEvaluacionMinutos: row.objetivo_evaluacion_minutos || undefined,
        fechaObjetivoEvaluacion: row.fecha_objetivo_evaluacion || undefined,
        motivoNoObtencion: row.motivo_no_obtencion || '',

        // Audit fields
        creadoPor: row.creado_por || undefined,
        creadoPorNombre: row.creado_por_nombre || undefined,

        reevaluaciones: reevList.map((rv: any) => ({
          id: rv.id,
          episodioId: rv.episodio_id,
          nivelCtasPrevio: rv.nivel_ctas_previo,
          nivelCtasPosterior: rv.nivel_ctas_posterior,
          motivoChange: rv.motivo_cambio,
          observaciones: rv.observaciones,
          proximaReevaluacion: rv.proxima_reevaluacion,
          frecuenciaCardiaca: rv.frecuencia_cardiaca || undefined,
          frecuenciaRespiratoria: rv.frecuencia_respiratoria || undefined,
          temperatura: rv.temperatura ? parseFloat(rv.temperatura) : undefined,
          saturacionOxigeno: rv.saturacion_oxigeno || undefined,
          glucemia: rv.glucemia || undefined,
          tensionArterialSistolica: rv.tension_arterial_sistolica || undefined,
          tensionArterialDiastolica: rv.tension_arterial_diastolica || undefined,
          avpu: rv.avdi || undefined,
          motivoNoObtencion: rv.motivo_no_obtencion || undefined,
          fechaCreacion: rv.fecha_creacion
        })),

        correcciones: corrList.map((c: any) => ({
          id: c.id,
          episodioId: c.episodio_id,
          nivelPrevio: c.nivel_ctas_previo,
          nivelNuevo: c.nivel_ctas_nuevo,
          motivo: c.motivo,
          datosPrevios: c.datos_previos,
          datosNuevos: c.datos_nuevos,
          corregidoPor: c.corregido_por,
          corregidoPorNombre: c.corregido_por_nombre,
          fecha: c.fecha_correccion
        }))
      };
    });
  } catch (err: any) {
    console.warn('Excepción de Supabase durante la obtención de datos:', err?.message || err);
    throw err;
  }
}
