import { createClient } from '@supabase/supabase-js';
import { PatientData, ReevaluacionData } from '../types';

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

/**
 * Saves a pediatric triage record to the 5-table schema in Supabase.
 */
export async function saveTriageRecord(record: PatientData): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase no está configurado. Se guardó localmente.' };
  }

  try {
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
          motivo_no_obtencion: record.motivoNoObtencion || null
        }
      ]);

    if (epError) {
      console.warn('Error al guardar episodio en Supabase:', epError.message);
      return { success: false, error: 'Episodio: ' + epError.message };
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
          motivo_no_obtencion: record.motivoNoObtencion || null
        }
      ]);

    if (svError) {
      console.warn('Error al guardar signos vitales en Supabase:', svError.message);
      // Clean up episodic record on failure
      await supabase.from('episodios_triaje_pediatrico').delete().eq('id', record.id);
      return { success: false, error: 'Signos Vitales: ' + svError.message };
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
      return { success: false, error: 'TEP: ' + tepError.message };
    }

    // 4. Insert into discriminadores_triaje_pediatrico for each finding
    if (record.findings && record.findings.length > 0) {
      const findingsRows = record.findings.map(finding => ({
        episodio_id: record.id,
        codigo_discriminador: null,
        sistema: 'general',
        etiqueta: finding,
        nivel_ctas_asociado: record.nivelCtasFinal,
        estado_validacion: 'validado'
      }));

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
    return { success: false, error: err?.message || 'Error desconocido al guardar' };
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
 * Fetches the latest pediatric triage records with all associated details.
 */
export async function fetchTriageRecords(): Promise<PatientData[]> {
  if (!supabase) {
    throw new Error('Supabase no está configurado.');
  }

  try {
    const { data, error } = await supabase
      .from('episodios_triaje_pediatrico')
      .select(`
        *,
        signos:signos_vitales_triaje_pediatrico(*),
        tep:tep_triaje_pediatrico(*),
        discriminadores:discriminadores_triaje_pediatrico(*),
        reevaluaciones:reevaluaciones_triaje_pediatrico(*)
      `)
      .order('arrival_date', { ascending: false });

    if (error) {
      console.warn('Error al obtener datos de Supabase:', error.message);
      throw new Error(error.message || 'Error de red al obtener datos');
    }

    return (data || []).map((row: any) => {
      const signosRow = row.signos && row.signos[0] ? row.signos[0] : {};
      const tepRow = row.tep && row.tep[0] ? row.tep[0] : {};
      const discList = row.discriminadores || [];
      const reevList = row.reevaluaciones || [];

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
        }))
      };
    });
  } catch (err: any) {
    console.warn('Excepción de Supabase durante la obtención de datos:', err?.message || err);
    throw err;
  }
}
