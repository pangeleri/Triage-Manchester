export type TriageLevel = 'I' | 'II' | 'III' | 'IV' | 'V';

export interface VitalSigns {
  heartRate?: number;
  respiratoryRate?: number;
  systolicBP?: number;
  diastolicBP?: number;
  oxygenSaturation?: number;
  temperature?: number;
  glasgow?: number;
  glucose?: number;
}

export type PatientType = 'adult' | 'pediatric';

export interface PediatricTriangle {
  appearance: {
    normal?: boolean;
    abnormalActivity: boolean;
    unresponsive: boolean;
    abnormalVisualContact: boolean;
    irritableInconsolable: boolean;
    abnormalCry: boolean;
    abnormalTone: boolean;
  };
  respiration: {
    normal?: boolean;
    agitation: boolean;
    apnea: boolean;
    abnormalPosition: boolean;
    abnormalSounds: boolean;
    retractions: boolean;
  };
  circulation: {
    normal?: boolean;
    cyanosis: boolean;
    mottled: boolean;
    pallor: boolean;
    flushing: boolean;
  };
}

export interface PatientData {
  id: string;
  name: string;
  age?: number;
  ageUnit: 'años' | 'meses';
  gender: 'M' | 'F';
  documentId: string;
  arrivalDate: string;
  type: PatientType;
  tep?: PediatricTriangle;
  vitals: VitalSigns;
  findings: string[];
  otherSymptoms: string;
  triageLevel: TriageLevel;
  originalPriority: string;
  waitTime: string;
  suggestedDestination: string;
}

export const FINDINGS = {
  LEVEL_I: [
    'Paro cardiorrespiratorio clínico u obstrucción total de la vía aérea',
    'Shock severo / Inestabilidad hemodinámica profunda',
    'Insuficiencia respiratoria severa (Apnea o distrés respiratorio severo)',
    'Inconsciencia profunda o coma (Escala de Glasgow GCS ≤ 9)',
    'Trauma penetrante grave de cabeza, cuello o torso con signos de shock',
    'Convulsión activa (Estado epiléptico o estatus convulsivo)'
  ],
  LEVEL_II: [
    'Compromiso ventilatorio moderado (Estridor agudo o sibilancias graves)',
    'Déficit neurológico agudo sospechado (ACV, TIA o parálisis súbita)',
    'Dolor torácico opresivo de sospecha isquémica (SCA)',
    'Trauma mayor de alto impacto hemodinámicamente estable',
    'Glasgow GCS 10 a 13 o alteración aguda del estado mental',
    'Hemorragia mayor activa sin shock establecido',
    'Fiebre alta (>38.5°C) o menor de 3 meses con sospecha de Sepsis',
    'Signos de sobredosis / Intoxicación con alteración de constantes',
    'Dolor severo intolerable (Escala EVA ≥ 8 de 10)',
    'Cefalea severa de inicio súbito / hiperaguda'
  ],
  LEVEL_III: [
    'Dificultad respiratoria leve (Asma estable, SpO2 93-94%)',
    'Alteración del comportamiento moderada (Agitación o confusión leve GCS 14-15)',
    'Deshidratación clínica moderada (Vómitos persistentes o diarrea abundante)',
    'Dolor agudo moderado (Escala EVA 4 a 7 de 10)',
    'Sospecha de fractura de extremidad con deformidad visible o luxación',
    'Hemorragia menor activa controlable localmente',
    'Retención urinaria aguda de evolución reciente',
    'Cefalea de intensidad moderada con antecedentes similares',
    'Abuso de sustancias con signos vitales dentro de parámetros normales'
  ],
  LEVEL_IV: [
    'Síntomas de infección respiratoria alta con constantes normales (Tos, resfriado)',
    'Traumatismo menor sin deformidad (Esguince, contusión, laceración menor)',
    'Dolor leve manejable (Escala EVA 1 a 3 de 10)',
    'Dolor abdominal leve persistente sin signos de irritación peritoneal',
    'Gastroenteritis con tolerancia oral (Diarrea/vómito leve > 2 años sin deshidratación)',
    'Cefalea crónica o recurrente estable sin signos de alarma',
    'Disuria o síntomas urinarios bajos sin fiebre (ITU estable)'
  ],
  LEVEL_V: [
    'Resfrío común o congestión nasal leve',
    'Diarrea crónica o estreñimiento prolongado sin dolor agudo',
    'Atención administrativa (Curaciones, retiro de puntos, cambio de sondas estables)',
    'Solicitud de recetas médicas o exámenes de control',
    'Problemas psiquiátricos crónicos estables sin riesgo para sí o terceros',
    'Lesiones cutáneas crónicas o menores (Erupción menor, picadura leve)'
  ]
};
