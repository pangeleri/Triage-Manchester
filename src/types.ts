export type TriageLevel = 'I' | 'II' | 'III' | 'IV' | 'V';

export interface VitalSigns {
  heartRate?: number;
  respiratoryRate?: number;
  systolicBP?: number;
  diastolicBP?: number;
  oxygenSaturation?: number;
  temperature?: number;
  glucose?: number;
  avpu?: string;
  condicionMedicionSpo2?: string;
  metodoTemperatura?: string;
}

export type PatientType = 'pediatric';

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

export type EstadoOperativo = 
  | 'preliminar_critico' 
  | 'en_espera' 
  | 'llamado' 
  | 'en_atencion' 
  | 'derivado' 
  | 'cancelado' 
  | 'finalizado';

export interface ReevaluacionData {
  id?: string;
  episodioId: string;
  nivelCtasPrevio: number;
  nivelCtasPosterior: number;
  motivoCambio: string;
  observaciones: string;
  proximaReevaluacion?: string;
  
  // Signos vitales de reevaluación
  frecuenciaCardiaca?: number;
  frecuenciaRespiratoria?: number;
  temperatura?: number;
  saturacionOxigeno?: number;
  glucemia?: number;
  tensionArterialSistolica?: number;
  tensionArterialDiastolica?: number;
  avpu?: string;
  motivoNoObtencion?: string;
  
  fechaCreacion?: string;
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
  tepStates?: {
    apariencia: 'no_evaluado' | 'normal' | 'alterado' | 'no_valorable';
    respiracion: 'no_evaluado' | 'normal' | 'alterado' | 'no_valorable';
    circulacion: 'no_evaluado' | 'normal' | 'alterado' | 'no_valorable';
  };
  vitals: VitalSigns;
  frecuenciaCardiacaDs?: string;
  frecuenciaRespiratoriaDs?: string;
  findings: string[];
  otherSymptoms: string;
  triageLevel: TriageLevel;
  originalPriority: string;
  waitTime: string;
  suggestedDestination: string;
  
  // Datos del acompañante
  nombreAcompanante?: string;
  telefonoAcompanante?: string;
  parentescoAcompanante?: string;
  
  // Tiempos objetivos y de reevaluación
  estadoOperativo: EstadoOperativo;
  nivelCtasSugerido: number;
  nivelCtasFinal: number;
  objetivoEvaluacionMinutos?: number;
  fechaObjetivoEvaluacion?: string;
  motivoNoObtencion?: string;
  
  // Auditoría y autoría
  creadoPor?: string;
  creadoPorNombre?: string;

  reevaluaciones?: ReevaluacionData[];
  correcciones?: CorreccionData[];
  /** true si el triaje quedó guardado solo en este equipo y falta enviarlo a la base */
  pendienteSync?: boolean;
  /** último error al intentar enviarlo */
  errorSync?: string;
}

export interface CorreccionData {
  id?: string;
  episodioId: string;
  nivelPrevio: number;
  nivelNuevo: number;
  motivo: string;
  datosPrevios: any;
  datosNuevos: any;
  corregidoPor?: string;
  corregidoPorNombre?: string;
  fecha: string;
}

export const ESTADOS_CORREGIBLES: EstadoOperativo[] = [
  'preliminar_critico',
  'en_espera',
  'llamado'
];

export interface ClinicalMatrixItem {
  I: string[];
  II: string[];
  III: string[];
  IV: string[];
  V: string[];
}

export interface ClinicalSystem {
  id: string;
  name: string;
  description: string;
  matrix: ClinicalMatrixItem;
}

export const CLINICAL_SYSTEMS: ClinicalSystem[] = [
  {
    id: 'abuso',
    name: 'Abuso',
    description: 'Abuso, Maltrato o Conflicto',
    matrix: {
      I: [
        'Situación o conflicto inespecífico'
      ],
      II: [
        'Riesgo actual'
      ],
      III: [
        'Agresión física',
        'Abuso sexual en últimas 72 horas'
      ],
      IV: [
        'Antecedentes o signos de abuso'
      ],
      V: []
    }
  },
  {
    id: 'cardiovascular',
    name: 'Cardiovascular / Circulación',
    description: 'Sistema Cardiovascular y Trastornos Circulatorios',
    matrix: {
      I: [
        'Paro cardíaco (o inminente)',
        'Hipotensión',
        'Shock',
        'Taquicardia (FC>2DS)',
        'Bradicardia (FC<-2DS)',
        'Hemorragia con shock'
      ],
      II: [
        'Taquicardia (FC en el rango de +2DS)',
        'Bradicardia (FC en el rango de -2DS)',
        'Deshidratación severa',
        'Hemorragia severa incontrolable'
      ],
      III: [
        'Taquicardia (FC en el rango de +1DS)',
        'Bradicardia (FC en el rango de -1DS)',
        'Deshidratación moderada',
        'Hemorragia menor'
      ],
      IV: [
        'Dolor torácico leve'
      ],
      V: []
    }
  },
  {
    id: 'dermatologico',
    name: 'Dermatológico',
    description: 'Piel, Quemaduras, Heridas y Tejido Subcutáneo',
    matrix: {
      I: [
        'Quemadura ≥ 25% de SC'
      ],
      II: [
        'Quemadura ≥ 10% de SC',
        'Quemadura de cara/manos',
        'Quemadura química/eléctrica',
        'Exantema purpúrico-petequial'
      ],
      III: [
        'Quemadura < 10% de SC',
        'Lesión por frío localizada',
        'Celulitis + fiebre',
        'Herida complicada (profunda)'
      ],
      IV: [
        'Quemadura leve',
        'Lesión por frío leve',
        'Celulitis localizada',
        'Herida simple (superficial)'
      ],
      V: [
        'Quemadura superficial',
        'Abrasión, laceración leve',
        'Contusión leve',
        'Exantema localizado',
        'Picadura'
      ]
    }
  },
  {
    id: 'dolor',
    name: 'Dolor',
    description: 'Evaluación y Manejo del Dolor',
    matrix: {
      I: [],
      II: [
        'Severo 8-10/10'
      ],
      III: [
        'Moderado 4-7/10'
      ],
      IV: [
        'Leve 1-3/10'
      ],
      V: []
    }
  },
  {
    id: 'endocrinologico',
    name: 'Endocrinológico',
    description: 'Sistema Endocrinológico y Metabólico',
    matrix: {
      I: [
        'Diabetes mellitus con alteración del sensorio'
      ],
      II: [
        'Diabetes mellitus con CAD'
      ],
      III: [
        'Diabetes mellitus con hipoglucemia'
      ],
      IV: [],
      V: []
    }
  },
  {
    id: 'gastroenterologico',
    name: 'Gastroenterológico / Abdominal',
    description: 'Aparato Digestivo, Abdomen y Vómitos / Diarrea',
    matrix: {
      I: [
        'Trauma penetrante / contuso + shock',
        'Disfagia + compromiso vía aérea'
      ],
      II: [
        'Hematemesis / enterorragia',
        'Dolor abdominal severo'
      ],
      III: [
        'Vómitos persistentes / biliosos',
        'Vómitos/diarrea < 2 años'
      ],
      IV: [
        'Constipación',
        'Dolor abdominal leve',
        'Vómitos/diarrea > 2 años'
      ],
      V: [
        'Vómitos/diarrea aislados'
      ]
    }
  },
  {
    id: 'hematologico',
    name: 'Hematológico / Inmunológico',
    description: 'Sistema Hematológico, Inmunológico y Alergias',
    matrix: {
      I: [
        'Anafilaxia + shock'
      ],
      II: [
        'Trastorno de hemostasia',
        'Neutropenia febril',
        'Inmunocompromiso con fiebre',
        'Anafilaxia sin shock'
      ],
      III: [
        'Reacción alérgica moderada'
      ],
      IV: [
        'Reacción alérgica localizada'
      ],
      V: []
    }
  },
  {
    id: 'infectologico',
    name: 'Infectológico',
    description: 'Infecciones, Sepsis y Síndromes Febriles',
    matrix: {
      I: [
        'Shock séptico'
      ],
      II: [
        'T° > 37,5 °C en menor de 1 mes, o T° > 38 °C en menor de 3 meses',
        'Hipotermia',
        'Aspecto séptico',
        'Neutropenia febril',
        'Inmunocompromiso con fiebre'
      ],
      III: [
        'Fiebre en niño de 3-36 meses'
      ],
      IV: [
        'Fiebre en niño > 36 meses'
      ],
      V: []
    }
  },
  {
    id: 'musculoesqueletico',
    name: 'Músculo-esquelético',
    description: 'Traumatismos, Fracturas y Lesiones Músculo-esqueléticas',
    matrix: {
      I: [
        'Trauma grave con ITP ≤ 5',
        'Amputación de extremidad'
      ],
      II: [
        'Trauma grave con ITP 6 a 8',
        'Amputación de dedo',
        'Fractura expuesta y/o con déficit neurovascular',
        'Dolor de espalda con síntomas neurológicos',
        'Avulsión de diente definitivo',
        'Injuria grave por frío, hipotermia'
      ],
      III: [
        'Trauma con ITP ≥ 9',
        'Fractura sin déficit neuro',
        'Yeso apretado',
        'Dolor articular y/o impotencia funcional + fiebre',
        'Trauma dental (fractura, luxación)'
      ],
      IV: [
        'Dolor localizado sin deformación',
        'Esguince, contusión',
        'Inflamación de extremidad'
      ],
      V: []
    }
  },
  {
    id: 'nefrologico',
    name: 'Nefro - Urológico / Ginecológico',
    description: 'Sistema Renal, Vías Urinarias y Ginecológico',
    matrix: {
      I: [
        'Metrorragia + shock'
      ],
      II: [
        'Dolor testicular severo',
        'Anuria > 24 horas',
        'Parafimosis',
        'Priapismo',
        'Dolor abdominopélvico',
        'Metrorragia severa'
      ],
      III: [
        'Dolor / inflamación testicular',
        'Masa inguinal con dolor',
        'Anuria > 8 horas',
        'Metrorragia moderada'
      ],
      IV: [
        'Trauma escrotal',
        'Sospecha de ITU'
      ],
      V: []
    }
  },
  {
    id: 'neurologico',
    name: 'Neurológico / Neuropsiquiátrico',
    description: 'Sistema Nervioso Central, Conciencia, Convulsiones y Salud Mental',
    matrix: {
      I: [
        'TEC grave (Glasgow < 10)',
        'Arreactivo',
        'Convulsivo (activa)'
      ],
      II: [
        'TEC moderado (Glasgow 10 a 13)',
        'Alteración de nivel de conciencia',
        'Cefalea severa',
        'Disfunción de DVP (Glasgow < 15, somnolencia/irritabilidad o cefalea severa)',
        'Trastorno agudo del sistema nervioso',
        'Letargia/mala actitud alimentaria en neonato',
        'Riesgo alto de auto/heteroagresión'
      ],
      III: [
        'TEC leve (Glasgow 14) y/o en menor de 2 años',
        'Antecedente de pérdida de conciencia',
        'Cefalea moderada',
        'Posible disfunción de DVP (portador de DVP con vómitos/cefalea leve y Glasgow 15)',
        'Convulsión (resuelta)',
        'Irritable e Inconsolable / Rechazo de alimento en lactante',
        'Riesgo moderado de auto/heteroagresión',
        'Excitado'
      ],
      IV: [
        'TEC leve',
        'Cefalea crónica',
        'Conducta anormal / Antecedente de trastorno en el comportamiento',
        'Irritable pero consolable',
        'Bajo riesgo de auto/heteroagresión',
        'Trastorno depresivo'
      ],
      V: []
    }
  },
  {
    id: 'oftalmologico',
    name: 'Oftalmológico',
    description: 'Ojos, Visión y Traumatismos Oculares',
    matrix: {
      I: [],
      II: [
        'Exposición química',
        'Herida penetrante',
        'Celulitis orbitaria'
      ],
      III: [
        'Alteración aguda de la vista',
        'Celulitis periorbitaria'
      ],
      IV: [
        'Lagrimeo / secreción ocular',
        'Cuerpo extraño corneal'
      ],
      V: [
        'Conjuntivitis'
      ]
    }
  },
  {
    id: 'otorrinolaringologico',
    name: 'Otorrinolaringológico',
    description: 'Oído, Nariz, Garganta y Vía Aérea Alta',
    matrix: {
      I: [
        'Compromiso de vía aérea'
      ],
      II: [
        'Amputación de oreja',
        'Epistaxis no controlada',
        'Hemorragia postquirúrgica',
        'Dolor de garganta con babeo/estridor',
        'Disfagia/dolor de garganta/ronquera posttrauma'
      ],
      III: [
        'Cuerpo extraño en fosas nasales/oídos',
        'Epistaxis controlada',
        'Exudados amigdalinos con disfagia',
        'Sordera aguda',
        'Antecedente de hemorragia postquirúrgica'
      ],
      IV: [
        'Otorrea',
        'Otalgia'
      ],
      V: [
        'Dolor de garganta',
        'Congestión nasal',
        'Tos ronca, afonía, sin estridor'
      ]
    }
  },
  {
    id: 'respiratorio',
    name: 'Respiratorio',
    description: 'Aparato Respiratorio y Dificultad Respiratoria',
    matrix: {
      I: [
        'Paro Respiratorio',
        'Compromiso de vía aérea',
        'DR severa',
        'Trauma torácico con DR/Shock'
      ],
      II: [
        'Estridor grave',
        'DR moderada',
        'Aspiración de CE con DR',
        'Disnea severa'
      ],
      III: [
        'Estridor leve',
        'DR leve',
        'Aspiración de CE sin DR',
        'Tos constante'
      ],
      IV: [
        'Tos persistente con antecedente de asma / BOR',
        'Posible aspiración de CE sin DR',
        'Traumatismo torácico menor sin DR',
        'Dolor torácico leve'
      ],
      V: []
    }
  },
  {
    id: 'toxicologico',
    name: 'Toxicológico',
    description: 'Toxicología y Contacto con Sustancias Tóxicas',
    matrix: {
      I: [],
      II: [
        'Contacto con tóxicos'
      ],
      III: [],
      IV: [],
      V: []
    }
  }
];

export const PAED_CTAS_ABBREVIATIONS: Record<string, string> = {
  BOR: 'Bronquitis obstructiva recurrente',
  CAD: 'Cetoacidosis diabética',
  CE: 'Cuerpo extraño',
  DR: 'Dificultad respiratoria',
  DS: 'Desvío estándar',
  DVP: 'Derivación ventrículo-peritoneal',
  FC: 'Frecuencia cardíaca',
  FR: 'Frecuencia respiratoria',
  ITP: 'Índice de Trauma Pediátrico',
  ITU: 'Infección del tracto urinario',
  SC: 'Superficie corporal',
  TEC: 'Traumatismo encefalocraneano'
};

export const FINDINGS = {
  LEVEL_I: CLINICAL_SYSTEMS.flatMap(sys => sys.matrix.I),
  LEVEL_II: CLINICAL_SYSTEMS.flatMap(sys => sys.matrix.II),
  LEVEL_III: CLINICAL_SYSTEMS.flatMap(sys => sys.matrix.III),
  LEVEL_IV: CLINICAL_SYSTEMS.flatMap(sys => sys.matrix.IV),
  LEVEL_V: CLINICAL_SYSTEMS.flatMap(sys => sys.matrix.V)
};

export function findFindingMeta(finding: string): { sistema: string; nivel: number } | null {
  for (const sys of CLINICAL_SYSTEMS) {
    if (sys.matrix.I.includes(finding)) return { sistema: sys.id, nivel: 1 };
    if (sys.matrix.II.includes(finding)) return { sistema: sys.id, nivel: 2 };
    if (sys.matrix.III.includes(finding)) return { sistema: sys.id, nivel: 3 };
    if (sys.matrix.IV.includes(finding)) return { sistema: sys.id, nivel: 4 };
    if (sys.matrix.V.includes(finding)) return { sistema: sys.id, nivel: 5 };
  }
  return null;
}
