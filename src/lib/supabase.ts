import { createClient } from '@supabase/supabase-js';
import { PatientData } from '../types';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * Saves a triage record to Supabase.
 * If Supabase is not configured, logs a message.
 */
export async function saveTriageRecord(record: PatientData): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase no está configurado. Se guardó localmente.' };
  }

  try {
    // Structure data matching potential postgres table columns or JSON
    const { error } = await supabase
      .from('triage_records')
      .insert([
        {
          id: record.id,
          name: record.name,
          age: record.age,
          age_unit: record.ageUnit,
          gender: record.gender,
          document_id: record.documentId,
          arrival_date: record.arrivalDate,
          type: record.type,
          tep: record.tep ? JSON.stringify(record.tep) : null,
          vitals: JSON.stringify(record.vitals),
          findings: record.findings,
          other_symptoms: record.otherSymptoms,
          triage_level: record.triageLevel,
          original_priority: record.originalPriority,
          wait_time: record.waitTime,
          suggested_destination: record.suggestedDestination,
        }
      ]);

    if (error) {
      console.error('Error saving to Supabase:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Supabase exception:', err);
    return { success: false, error: err?.message || 'Error desconocido al guardar en Supabase' };
  }
}

/**
 * Fetches the latest triage records from Supabase.
 */
export async function fetchTriageRecords(): Promise<PatientData[]> {
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('triage_records')
      .select('*')
      .order('arrival_date', { ascending: false });

    if (error) {
      console.error('Error fetching from Supabase:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      age: row.age,
      ageUnit: row.age_unit,
      gender: row.gender,
      documentId: row.document_id,
      arrivalDate: row.arrival_date,
      type: row.type,
      tep: row.tep ? JSON.parse(row.tep) : undefined,
      vitals: typeof row.vitals === 'string' ? JSON.parse(row.vitals) : row.vitals,
      findings: row.findings || [],
      otherSymptoms: row.other_symptoms || '',
      triageLevel: row.triage_level,
      originalPriority: row.original_priority,
      waitTime: row.wait_time,
      suggestedDestination: row.suggested_destination,
    }));
  } catch (err) {
    console.error('Supabase exception during fetch:', err);
    return [];
  }
}
