export type TriageLevel = 'ROJO' | 'AMARILLO' | 'VERDE';

export interface VitalSigns {
  heartRate?: number;
  respiratoryRate?: number;
  systolicBP?: number;
  diastolicBP?: number;
  oxygenSaturation?: number;
  temperature?: number;
  glasgow?: number;
}

export interface PatientData {
  id: string;
  name: string;
  age: number;
  ageUnit: 'años' | 'meses';
  gender: 'M' | 'F';
  documentId: string;
  arrivalDate: string;
  abcCheck: {
    airway: boolean;
    breathing: boolean;
    circulation: boolean;
  };
  vitals: VitalSigns;
  findings: string[];
  otherSymptoms: string;
  triageLevel: TriageLevel;
  originalPriority: string;
  waitTime: string;
  suggestedDestination: string;
}

export const FINDINGS = {
  ROJO: [
    'Paro PCR',
    'Shock',
    'Inconsciencia',
    'Trauma severo (balas, armas blancas)',
    'Quemaduras >20%',
    'Dolor torácico cardiogénico',
    'Abdomen agudo',
    'Hemorragia en el embarazo',
    'Fiebre en niños <3 meses (T° ≥38°C)',
    'Bradicardia fetal'
  ],
  AMARILLO: [
    'Dolor abdominal leve con náuseas/vómitos',
    'Fiebre >39°C (aislada)',
    'Deshidratación leve',
    'Otitis media',
    'Sinusitis',
    'Lumbalgia aguda',
    'Infección urinaria alta',
    'Crisis de ansiedad'
  ],
  VERDE: [
    'Faringitis/Amigdalitis',
    'Resfrío común',
    'Diarrea sin deshidratación',
    'Abscesos sin fiebre',
    'Dolor de oído leve',
    'Dolor de garganta sin dificultad para tragar'
  ]
};
