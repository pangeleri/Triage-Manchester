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
  
  reevaluaciones?: ReevaluacionData[];
}

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
    id: 'respiratorio',
    name: 'Respiratorio',
    description: 'Sistema Respiratorio / Vía Aérea',
    matrix: {
      I: [
        'Paro respiratorio inminente u obstrucción total de la vía aérea',
        'Cianosis central de origen respiratorio con signos de shock'
      ],
      II: [
        'Estridor agudo o dificultad respiratoria severa con tirajes y agotamiento',
        'Dificultad respiratoria severa con incapacidad para hablar',
        'Broncoespasmo severo con agotamiento respiratorio'
      ],
      III: [
        'Dificultad respiratoria moderada persistente',
        'Broncoespasmo moderado con sibilancias y taquipnea'
      ],
      IV: [
        'Infección respiratoria alta con estado general conservado'
      ],
      V: [
        'Congestión nasal o molestia faríngea leve sin dificultad respiratoria'
      ]
    }
  },
  {
    id: 'cardiovascular',
    name: 'Cardiovascular',
    description: 'Sistema Cardiovascular / Shock / Dolor Torácico',
    matrix: {
      I: [
        'Paro cardiorrespiratorio presenciado',
        'Shock o inestabilidad hemodinámica profunda',
        'Arritmia activa con descompensación hemodinámica o síncope'
      ],
      II: [
        'Síncope de inicio súbito con alteración hemodinámica',
        'Hemorragia mayor activa con inestabilidad potencial'
      ],
      III: [
        'Palpitaciones aisladas sin compromiso hemodinámico',
        'Dolor torácico atípico sin signos de alarma'
      ],
      IV: [],
      V: []
    }
  },
  {
    id: 'neurologico',
    name: 'Neurológico',
    description: 'Sistema Neurológico y Conciencia',
    matrix: {
      I: [
        'Inconsciencia profunda o coma',
        'Convulsión activa continua o repetida'
      ],
      II: [
        'Déficit neurológico focal agudo o sospecha de evento vascular',
        'Alteración aguda del estado de conciencia o confusión mental'
      ],
      III: [
        'Crisis convulsiva resuelta con recuperación completa de conciencia',
        'Síncope o desmayo recuperado espontáneamente',
        'Cefalea de intensidad moderada sin signos de alarma'
      ],
      IV: [
        'Mareo inespecífico sin déficit neurológico',
        'Asimetría facial aguda de origen periférico'
      ],
      V: [
        'Cefalea leve o molestia craneal habitual'
      ]
    }
  },
  {
    id: 'musculoesqueletico',
    name: 'Músculo-esquelético',
    description: 'Sistema Músculo-esquelético y Articular',
    matrix: {
      I: [
        'Traumatismo musculoesquelético grave con inestabilidad o hemorragia masiva',
        'Amputación proximal de extremidad con sangrado activo severo'
      ],
      II: [
        'Traumatismo grave de extremidad con deformidad severa',
        'Amputación distal de dedo o mano',
        'Fractura expuesta o con compromiso circulatorio distal',
        'Dolor dorsal o lumbar severo con sospecha de compresión medular',
        'Avulsión dentaria traumática',
        'Lesión grave por congelamiento o frío extremo'
      ],
      III: [
        'Traumatismo de extremidad con sospecha de fractura cerrada alineada',
        'Dolor articular o muscular agudo moderado sin signos de alarma',
        'Yeso o vendaje ortopédico demasiado ajustado con dolor',
        'Traumatismo dental sin pérdida de pieza'
      ],
      IV: [
        'Esguince o contusión leve sin deformidad',
        'Dolor muscular o articular leve localizado',
        'Inflamación o edema leve tras traumatismo menor'
      ],
      V: [
        'Retiro de puntos o curación simple programada',
        'Consulta por dolor crónico muscular o articular de larga evolución'
      ]
    }
  },
  {
    id: 'gastrointestinal',
    name: 'Gastrointestinal',
    description: 'Aparato Digestivo y Abdominal',
    matrix: {
      I: [
        'Obstrucción de vía aérea por vómito con asfixia',
        'Hemorragia digestiva masiva con shock'
      ],
      II: [
        'Dolor abdominal agudo intenso con sospecha de abdomen quirúrgico',
        'Hemorragia digestiva alta activa con vómitos sanguinolentos',
        'Evisceración o hernia estrangulada irreductible'
      ],
      III: [
        'Vómitos o diarrea persistentes con deshidratación moderada',
        'Dolor abdominal moderado sin signos de peritonitis',
        'Sangrado digestivo bajo escaso sin alteración hemodinámica'
      ],
      IV: [
        'Gastroenteritis aguda con buena tolerancia oral',
        'Diarrea o estreñimiento reciente sin dolor intenso',
        'Reflujo gastroesofágico o acidez sintomática leve'
      ],
      V: [
        'Estreñimiento crónico sin dolor agudo ni vómitos',
        'Dolor abdominal leve crónico recurrente sin cambios agudos'
      ]
    }
  },
  {
    id: 'trauma',
    name: 'Trauma / Quemaduras',
    description: 'Traumatismos, Quemaduras y Heridas',
    matrix: {
      I: [
        'Traumatismo craneoencefálico o espinal grave inestable',
        'Quemadura extensa profunda o con sospecha de compromiso de vía aérea'
      ],
      II: [
        'Herida penetrante o cortante con sangrado arterial profuso',
        'Quemadura de extensión moderada o en áreas críticas',
        'Traumatismo ocular severo con compromiso visual agudo'
      ],
      III: [
        'Quemadura superficial o de extensión moderada localizada',
        'Herida que requiere sutura con sangrado controlado',
        'Cuerpo extraño en conducto auditivo o nariz con dolor',
        'Hemorragia nasal activa que cede con compresión local'
      ],
      IV: [
        'Quemadura superficial leve localizada',
        'Herida menor superficial, erosión o raspadura',
        'Traumatismo ocular leve con molestia sin pérdida de visión'
      ],
      V: [
        'Curación de herida menor programada',
        'Cuerpo extraño superficial no urgente y asintomático'
      ]
    }
  },
  {
    id: 'abuso',
    name: 'Abuso / Violencia',
    description: 'Violencia, Abuso o Maltrato',
    matrix: {
      I: [
        'Abuso físico o agresión violenta aguda con compromiso hemodinámico o de conciencia'
      ],
      II: [
        'Abuso sexual agudo reciente para profilaxis y resguardo',
        'Maltrato físico agudo en niño o adulto con lesiones evidentes'
      ],
      III: [
        'Sospecha de maltrato o violencia con afectación emocional aguda',
        'Negligencia activa o situación de vulnerabilidad aguda'
      ],
      IV: [
        'Sospecha o antecedente de violencia intrafamiliar sin lesiones agudas',
        'Situación de conflicto intrafamiliar sin descompensación actual'
      ],
      V: [
        'Solicitud de informe social u orientación por antecedentes de violencia'
      ]
    }
  },
  {
    id: 'dermatologico',
    name: 'Dermatológico',
    description: 'Piel y Tejido Subcutáneo',
    matrix: {
      I: [
        'Lesiones ampollares o descamativas agudas generalizadas con shock',
        'Reacción alérgica severa con hinchazón de labios, lengua y dificultad respiratoria'
      ],
      II: [
        'Enrojecimiento y descamación cutánea generalizada aguda',
        'Urticaria o hinchazón alérgica generalizada sin dificultad respiratoria',
        'Infección cutánea severa con sospecha de necrosis o dolor desproporcionado'
      ],
      III: [
        'Infección cutánea febril de avance rápido',
        'Erupción con ampollas o dolor localizado intenso',
        'Lesión dérmica por contacto con producto químico localizada'
      ],
      IV: [
        'Infección cutánea localizada sin fiebre',
        'Erupción alérgica o picaduras localizadas leves',
        'Absceso localizado para drenaje'
      ],
      V: [
        'Picazón cutánea crónica o micosis superficial habitual',
        'Erupción cutánea crónica estable sin cambios agudos'
      ]
    }
  },
  {
    id: 'endocrinologico',
    name: 'Endocrino / Metabólico',
    description: 'Sistema Metabólico y Endocrinológico',
    matrix: {
      I: [
        'Coma metabólico o descompensación diabética severa con pérdida de conciencia'
      ],
      II: [
        'Hipoglucemia confirmada con síntomas',
        'Descompensación diabética aguda con deshidratación severa o vómitos'
      ],
      III: [
        'Hiperglucemia sintomática con malestar general sin alteración de conciencia',
        'Sospecha de insuficiencia suprarrenal aguda'
      ],
      IV: [
        'Hiperglucemia leve o alteración aislada en control sin síntomas de alarma'
      ],
      V: [
        'Control o medición de rutina de glucemia'
      ]
    }
  },
  {
    id: 'dolor',
    name: 'Dolor',
    description: 'Manejo del Dolor Agudo y Crónico Reagudizado',
    matrix: {
      I: [
        'Dolor extremo intratable asociado a shock o traumatismo severo'
      ],
      II: [
        'Dolor agudo severo de máxima intensidad'
      ],
      III: [
        'Dolor agudo de intensidad moderada',
        'Dolor crónico reagudizado de moderada intensidad'
      ],
      IV: [
        'Dolor localizado leve',
        'Molestia o dolor muscular leve'
      ],
      V: [
        'Dolor crónico de baja intensidad habitual en tratamiento'
      ]
    }
  },
  {
    id: 'hematologico',
    name: 'Hematológico',
    description: 'Sistema Hematológico e Inmunológico',
    matrix: {
      I: [
        'Reacción transfusional aguda con shock',
        'Fiebre en paciente con defensas bajas con signos de shock'
      ],
      II: [
        'Fiebre en paciente con defensas bajas o tratamiento oncológico',
        'Crisis de dolor óseo agudo severo en enfermedad hematológica conocida',
        'Sangrado activo en paciente con trastorno de coagulación conocido'
      ],
      III: [
        'Palidez y cansancio agudo con sospecha de anemia sintomática',
        'Aparición aguda de petequias o hematomas múltiples sin sangrado activo',
        'Reacción transfusional febril leve'
      ],
      IV: [
        'Ganglios aumentados de tamaño o dolorosos de evolución reciente',
        'Anemia crónica conocida sin síntomas agudos'
      ],
      V: [
        'Ganglios crónicos estables sin dolor'
      ]
    }
  },
  {
    id: 'infectologico',
    name: 'Infectológico',
    description: 'Infección Sistémica y Fiebre',
    matrix: {
      I: [
        'Manchas violáceas de aparición fulminante con shock',
        'Infección generalizada grave con hipotensión y shock'
      ],
      II: [
        'Sospecha de infección sistémica con taquicardia y taquipnea',
        'Fiebre en lactante menor de tres meses',
        'Fiebre con rigidez de nuca y decaimiento marcado'
      ],
      III: [
        'Síndrome febril en paciente inmunocomprometido',
        'Fiebre alta persistente con sospecha de foco infeccioso profundo',
        'Picadura de insecto infectada con inflamación progresiva'
      ],
      IV: [
        'Síndrome febril simple sin signos de alarma ni compromiso general',
        'Infección localizada leve de piel o tejido celular'
      ],
      V: [
        'Consulta por sospecha de parásitos sin complicaciones'
      ]
    }
  },
  {
    id: 'nefrologico',
    name: 'Urológico / Renal',
    description: 'Sistema Renal, Urológico y Ginecológico',
    matrix: {
      I: [
        'Sangrado urinario masivo con descompensación o shock'
      ],
      II: [
        'Retención aguda de orina dolorosa con distensión vesical severa',
        'Cólico renal severo con dolor intenso y vómitos',
        'Dolor testicular o pélvico agudo unilateral severo de inicio súbito',
        'Infección urinaria con fiebre alta y decaimiento marcado'
      ],
      III: [
        'Sangrado en orina visible sin mareos ni descompensación',
        'Dificultad o retención urinaria reciente sin distensión extrema',
        'Dolor pélvico agudo de intensidad moderada',
        'Infección urinaria con fiebre moderada'
      ],
      IV: [
        'Ardor o molestias urinarias sin fiebre',
        'Flujo o molestia pélvica leve'
      ],
      V: [
        'Recambio o control programado de sonda vesical permeable',
        'Incontinencia urinaria crónica sin cambios agudos'
      ]
    }
  },
  {
    id: 'oftalmologico',
    name: 'Oftalmológico',
    description: 'Ojos y Visión',
    matrix: {
      I: [
        'Traumatismo ocular grave con herida abierta del globo ocular'
      ],
      II: [
        'Herida penetrante ocular o quemadura por químicos en ojos',
        'Pérdida súbita de la visión en un ojo'
      ],
      III: [
        'Cuerpo extraño en ojo con dolor o molestia moderada',
        'Inflamación ocular aguda con dolor moderado y molestia a la luz'
      ],
      IV: [
        'Ojo rojo con secreción sin dolor ni pérdida visual',
        'Inflamación dolorosa localizada en párpado'
      ],
      V: [
        'Derrame o mancha roja en ojo sin dolor ni pérdida de visión',
        'Molestia ocular leve habitual sin dolor'
      ]
    }
  },
  {
    id: 'otorrinolaringologico',
    name: 'Oído, Nariz y Garganta',
    description: 'Otorrinolaringología',
    matrix: {
      I: [
        'Sangrado nasal masivo con compromiso de la vía aérea'
      ],
      II: [
        'Cuerpo extraño en vía aérea alta con dificultad o estridor',
        'Dolor de oído intenso con inflamación retroauricular o supuración'
      ],
      III: [
        'Sangrado nasal activo que disminuye con compresión local',
        'Cuerpo extraño en oído o nariz con molestia',
        'Dolor de oído agudo moderado'
      ],
      IV: [
        'Dolor de oído leve o dolor de garganta sin dificultad para tragar',
        'Disminución auditiva de inicio reciente en un oído'
      ],
      V: [
        'Tapón de cerumen o molestia auditiva crónica sin dolor',
        'Molestia faríngea leve o irritación habitual'
      ]
    }
  },
  {
    id: 'toxicologico',
    name: 'Toxicológico / Salud Mental',
    description: 'Toxicología y Urgencias de Salud Mental',
    matrix: {
      I: [
        'Coma o paro respiratorio por intoxicación o sobredosis',
        'Conducta violenta inmediata o agitación extrema con riesgo físico inminente'
      ],
      II: [
        'Ingesta de tóxico o sobredosis de medicamentos reciente',
        'Ideación de autoagresión estructurada o intento reciente',
        'Crisis de agitación psicomotriz o agresividad aguda'
      ],
      III: [
        'Descompensación emocional o psíquica sin conducta violenta ni riesgo inminente',
        'Crisis de angustia o pánico intensa'
      ],
      IV: [
        'Crisis de angustia leve reactiva o llanto persistente',
        'Situación de estrés reactivo sin riesgo de agresión'
      ],
      V: []
    }
  }
];

export const FINDINGS = {
  LEVEL_I: CLINICAL_SYSTEMS.flatMap(sys => sys.matrix.I),
  LEVEL_II: CLINICAL_SYSTEMS.flatMap(sys => sys.matrix.II),
  LEVEL_III: CLINICAL_SYSTEMS.flatMap(sys => sys.matrix.III),
  LEVEL_IV: CLINICAL_SYSTEMS.flatMap(sys => sys.matrix.IV),
  LEVEL_V: CLINICAL_SYSTEMS.flatMap(sys => sys.matrix.V)
};
