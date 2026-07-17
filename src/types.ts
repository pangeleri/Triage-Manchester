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
    description: 'Sistema Respiratorio / Compromiso de Vía Aérea',
    matrix: {
      I: [
        'Paro respiratorio inmediato u obstrucción total de la vía aérea',
        'Cianosis central de origen respiratorio con signos de shock'
      ],
      II: [
        'Estridor agudo o sibilancias graves con distrés severo',
        'Dificultad respiratoria severa (SpO2 < 90%)',
        'Asma aguda grave / Inminencia de fallo respiratorio'
      ],
      III: [
        'Dificultad respiratoria moderada / Asma persistente (SpO2 90-94%)',
        'Tos persistente o sibilancias con taquipnea leve'
      ],
      IV: [
        'Infección respiratoria alta con constantes estables (tos/resfrío)'
      ],
      V: [
        'Goteo nasal u odinofagia leve sin signos sistémicos ni dificultad'
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
        'Shock cardiogénico o inestabilidad hemodinámica profunda',
        'Arritmia maligna activa con colapso o dolor torácico severo'
      ],
      II: [
        'Síncope cardio-neurológico de instalación súbita y alteración hemodinámica',
        'Hemorragia mayor activa con inestabilidad potencial'
      ],
      III: [
        'Palpitaciones ocasionales sin compromiso hemodinámico',
        'Dolor torácico atípico no isquémico EVA < 5'
      ],
      IV: [],
      V: []
    }
  },
  {
    id: 'neurologico',
    name: 'Neurológico/Neuropsic.',
    description: 'Sistema Neurológico / Neuropsiquiátrico',
    matrix: {
      I: [
        'Inconsciencia profunda o coma (Escala de Glasgow GCS ≤ 9)',
        'Convulsión tónico-clónica generalizada activa (Estatus epiléptico)'
      ],
      II: [
        'Déficit neurológico focal agudo < 24h (sospecha de ACV o TIA)',
        'Glasgow GCS 10 a 13 o alteración aguda relevante del estado mental'
      ],
      III: [
        'Crisis convulsiva resuelta con retorno al estado basal normal',
        'Síncope vasovagal recuperado espontáneamente',
        'Cefalea de intensidad moderada sin focalidad neurológica (EVA 4-7)'
      ],
      IV: [
        'Mareo inespecífico sin signos de focalidad neurológica',
        'Parálisis facial periférica estable (Bell)'
      ],
      V: [
        'Cefalea tensional leve o dolor crónico estable'
      ]
    }
  },
  {
    id: 'musculoesqueletico',
    name: 'Músculo-esquelético',
    description: 'Sistema Músculo-esquelético',
    matrix: {
      I: [
        'Trauma musculoesquelético grave con ITP <= 5',
        'Amputación proximal de extremidad con sangrado activo masivo'
      ],
      II: [
        'Trauma grave con ITP >=5 y <8',
        'Amputación de dedo/mano con control hemostático',
        'Fractura abierta o con compromiso neurovascular distal',
        'Dolor de espalda severo con sospecha de compresión medular / signos alarma',
        'Avulsión dentaria',
        'Injuria grave por frío / congelamiento'
      ],
      III: [
        'Trauma de extremidad con sospecha de fractura alineada sin déficit neuro',
        'Dolor articular o muscular agudo de alta intensidad sin signos de alarma',
        'Yeso ortopédico demasiado ajustado con dolor',
        'Trauma dental (fractura coronaria o de raíz)'
      ],
      IV: [
        'Esguince o contusión menor sin deformidad',
        'Dolor localizado muscular sin impotencia funcional severa',
        'Inflamación o edema moderado de extremidad tras traumatismo menor'
      ],
      V: [
        'Retiro de puntos quirúrgicos o curación simple',
        'Consulta diferida por dolor crónico o de más de una semana de evolución'
      ]
    }
  },
  {
    id: 'gastrointestinal',
    name: 'Gastrointestinal',
    description: 'Aparato Gastrointestinal y Abdominal',
    matrix: {
      I: [
        'Obstrucción de vía aérea por vómito con asfixia',
        'Exanguinación por hemorragia digestiva masiva con shock'
      ],
      II: [
        'Dolor abdominal agudo grave de sospecha quirúrgica (EVA ≥ 8)',
        'Hemorragia digestiva alta activa (hematemesis/melena) con taquicardia',
        'Evisceración o hernia estrangulada irreductible'
      ],
      III: [
        'Vómitos o diarrea persistentes con signos de deshidratación moderada',
        'Dolor abdominal difuso de intensidad moderada sin signos de peritonitis',
        'Hemorragia digestiva baja inactiva sin repercusión hemodinámica'
      ],
      IV: [
        'Gastroenteritis aguda con buena tolerancia oral sin deshidratación',
        'Diarrea o estreñimiento de evolución reciente sin dolor agudo',
        'Regurgitación o reflujo gastroesofágico sintomático leve'
      ],
      V: [
        'Estreñimiento crónico sin dolor ni vómitos',
        'Dolor abdominal leve crónico preexistente sin cambios agudos'
      ]
    }
  },
  {
    id: 'trauma',
    name: 'Trauma / Quemaduras',
    description: 'Traumatismos Generales, Quemaduras, Heridas y Ojos',
    matrix: {
      I: [
        'Trauma craneoencefálico, facial o espinal grave inestable',
        'Quemadura extensa profunda superior al 20% SCT o sospecha de vía aérea afectada'
      ],
      II: [
        'Herida penetrante o cortante con sangrado arterial profuso',
        'Quemadura de espesor parcial avanzada del 10% al 20% o áreas especiales',
        'Traumatismo ocular grave con sospecha de pérdida visual'
      ],
      III: [
        'Quemadura superficial o de espesor parcial menor de 10% SCT',
        'Herida profunda simple que requiere sutura con hemostasia local',
        'Cuerpo extraño en conducto auditivo externo o nasal',
        'Epistaxis activa controlable con compresión local'
      ],
      IV: [
        'Quemadura leve superficial menor del 5% SCT (tipo eritema solar)',
        'Herida menor superficial, erosión o raspadura',
        'Trauma ocular menor con molestia leve sin déficit visual'
      ],
      V: [
        'Curación de herida menor estéril programada',
        'Cuerpo extraño residual no urgente o asintomático'
      ]
    }
  },
  {
    id: 'abuso',
    name: 'Abuso',
    description: 'Abuso Físico, Sexual o Maltrato Activo o Sospechoso',
    matrix: {
      I: [
        'Abuso físico o sexual de extrema violencia agudo con compromiso hemodinámico o de conciencia'
      ],
      II: [
        'Abuso sexual agudo (<72 horas) para profilaxis y resguardo de evidencia',
        'Maltrato físico severo agudo en niño o adulto con lesiones visibles'
      ],
      III: [
        'Denuncia de abuso sexual de más de 72 horas con distress significativo',
        'Maltrato psicológico agudo o sospecha de negligencia infantil activa'
      ],
      IV: [
        'Sospecha o antecedente de violencia intrafamiliar crónica sin lesiones agudas',
        'Abuso reportado histórico o de larga data sin descompensación actual'
      ],
      V: [
        'Solicitud de informe social por sospecha previa de maltrato sin sintomatología'
      ]
    }
  },
  {
    id: 'dermatologico',
    name: 'Dermatológico',
    description: 'Aparato Dermatológico / Piel y Tejido Subcutáneo',
    matrix: {
      I: [
        'Necrólisis epidérmica tóxica (NET) o Síndrome de Stevens-Johnson con compromiso sistémico y shock',
        'Anafilaxia con angioedema laríngeo severo y compromiso de vía aérea'
      ],
      II: [
        'Eritrodermia generalizada exfoliativa',
        'Urticaria generalizada/angioedema sin compromiso respiratorio activo',
        'Infección cutánea necrosante (Sospecha de fascitis)'
      ],
      III: [
        'Celulitis o erisipela febril de rápido avance',
        'Zóster oftálmico o dolor de alta intensidad',
        'Quemadura química o biológica limitada'
      ],
      IV: [
        'Celulitis localizada asintomática sistémica sin fiebre',
        'Urticaria localizada leve',
        'Absceso localizado fluctuante para drenaje'
      ],
      V: [
        'Prurito crónico o dermatofitosis (hongos) localizada',
        'Erupción cutánea crónica estable sin cambios agudos'
      ]
    }
  },
  {
    id: 'endocrinologico',
    name: 'Endocrinológico',
    description: 'Sistema Endocrino y Metabólico / Descompensaciones',
    matrix: {
      I: [
        'Crisis tirotóxica o tormenta tiroidea inestable',
        'Coma mixedematoso o descompensación diabética en coma profundo (Cetoacidosis/EHH severo)'
      ],
      II: [
        'Cetoacidosis diabética activa (CAD) o Estado Hiperosmolar sin coma',
        'Hipoglucemia sintomática grave con estupor o convulsión que rinde con glucosa parenteral'
      ],
      III: [
        'Hipoglucemia moderada refractaria a ingesta oral',
        'Insuficiencia adrenal aguda sospechada por estrés sin shock inmediato'
      ],
      IV: [
        'Hiperglucemia persistente aislada sintomática sin acidosis ni cetonuria'
      ],
      V: [
        'Control de glucemia de rutina'
      ]
    }
  },
  {
    id: 'dolor',
    name: 'Dolor',
    description: 'Manejo del Dolor Agudo y Crónico Reagudizado',
    matrix: {
      I: [
        'Dolor intratable asociado a shock neurogénico o politraumatismo severo'
      ],
      II: [
        'Dolor agudo extremo de cualquier origen EVA >= 8 de 10'
      ],
      III: [
        'Dolor agudo de intensidad moderada EVA 4 a 7 de 10',
        'Dolor crónico reagudizado de moderada intensidad'
      ],
      IV: [
        'Dolor localizado leve reproducible al tacto EVA 1 a 3 de 10',
        'Mialgia localizada menor'
      ],
      V: [
        'Dolor crónico de baja intensidad o controlado en tratamiento paliativo'
      ]
    }
  },
  {
    id: 'hematologico',
    name: 'Hematol./Inmunol.',
    description: 'Sistema Hematológico e Inmunológico / Reacciones',
    matrix: {
      I: [
        'Reacción transfusional hemolítica aguda con shock',
        'Neutropenia febril con signos de shock séptico'
      ],
      II: [
        'Neutropenia febril activa clínicamente estable',
        'Crisis vasooclusiva drepanocítica de alta intensidad',
        'Sangrado activo en paciente con coagulopatía conocida (hemofilia)'
      ],
      III: [
        'Anemia aguda sintomática (disnea o astenia moderada)',
        'Purpura trombocitopenica inmune con petequias activas sin sangrado mayor',
        'Reacción transfusional febril no hemolítica leve'
      ],
      IV: [
        'Adenopatías dolorosas de evolución subaguda sin compromiso de la consistencia',
        'Anemia crónica conocida asintomática'
      ],
      V: [
        'Adenopatías crónicas asintomáticas estables'
      ]
    }
  },
  {
    id: 'infectologico',
    name: 'Infectológico',
    description: 'Infección Sistémica / Bacteriemia / Sepsis',
    matrix: {
      I: [
        'Purpura fulminante o sospecha de meningococcemia con shock',
        'Shock séptico establecido con hipotensión refractaria'
      ],
      II: [
        'Sospecha de sepsis activa sin shock (Fiebre + Taquicardia + Taquipnea)',
        'Fiebre en lactante menor de 3 meses sin foco claro',
        'Meningitis aguda (fiebre, rigidez de nuca, fotofobia)'
      ],
      III: [
        'Síndrome febril agudo en paciente inmunocomprometido',
        'Fiebre alta persistente refractaria con sospecha de foco bacteriano (ITU, neumonía)',
        'Picadura infectada con signos de linfangitis'
      ],
      IV: [
        'Síndrome febril agudo simple sin factores de riesgo ni compromiso general',
        'Infección localizada menor (panadizo, forúnculo simple)'
      ],
      V: [
        'Sospecha de infestación parasitaria menor (oxiuros/sarna) sin infección secundaria'
      ]
    }
  },
  {
    id: 'nefrologico',
    name: 'Nefrol./Urol./Ginec.',
    description: 'Sistema Renal, Urológico y Ginecológico No-Obstétrico',
    matrix: {
      I: [
        'Hematuria masiva con obnubilación o shock obstructivo/hipovolémico'
      ],
      II: [
        'Retención aguda de orina dolorosa (globo vesical severo)',
        'Cólico renal severo EVA >= 8 con vómitos',
        'Torsión testicular o de ovario sospechada por dolor agudo unilateral violento',
        'Infección urinaria alta (Pielonefritis aguda) con fiebre y compromiso'
      ],
      III: [
        'Hematuria macroscópica franca sin compromiso hemodinámico',
        'Retención urinaria de inicio reciente sin globo doloroso extremo',
        'Dolor pélvico agudo de moderada intensidad (EVA 4-7)',
        'Infección urinaria baja sintomática con fiebre moderada'
      ],
      IV: [
        'Infección urinaria baja clásica (disuria, polaquiuria, tenesmo) afebril',
        'Flujo vaginal patológico con molestia pélvica leve'
      ],
      V: [
        'Cambio programado o control de sonda vesical permeable',
        'Incontinencia urinaria crónica sin cambios agudos'
      ]
    }
  },
  {
    id: 'oftalmologico',
    name: 'Oftalmológico',
    description: 'Insultos y Patologías Oculares / Oftalmología',
    matrix: {
      I: [
        'Trauma ocular con estallido de globo ocular o pérdida de sustancia orbitaria'
      ],
      II: [
        'Traumatismo ocular penetrante sospechado o quemadura ocular por agentes químicos activos',
        'Pérdida súbita unilateral de la visión (Sospecha desprendimiento retina, oclusión arterial)'
      ],
      III: [
        'Cuerpo extraño corneal o conjuntival retenido',
        'Uveítis o queratitis aguda con dolor moderado y fotofobia'
      ],
      IV: [
        'Ojo rojo unilateral leve con secreción sin dolor ni alteración de la agudeza visual (conjuntivitis)',
        'Orzuelo o chalación doloroso localizado'
      ],
      V: [
        'Hemorragia subconjuntival aislada unilateral asintomática (derrame ocular)',
        'Molestia ocular leve crónica sin cambios refractivos ni dolor'
      ]
    }
  },
  {
    id: 'otorrinolaringologico',
    name: 'Otorrinolaringol.',
    description: 'Oído, Nariz y Garganta / Otorrinolaringología (ORL)',
    matrix: {
      I: [
        'Epistaxis masiva posterior con asfixia y obstrucción de vía aérea'
      ],
      II: [
        'Cuerpo extraño en laringe/hipofaringe con estridor u obstrucción parcial de la vía aérea',
        'Otitis media aguda con sospecha de complicación intracraneal o mastoiditis'
      ],
      III: [
        'Epistaxis activa unilateral que cede parcialmente a la compresión',
        'Cuerpo extraño en conducto auditivo externo o fosas nasales con dolor',
        'Otitis media aguda con dolor severo y efusión timpánica'
      ],
      IV: [
        'Otitis externa aguda simple o faringoamigdalitis purulenta sin disfagia severa',
        'Hipoacusia súbita de inicio reciente de evolución unilateral'
      ],
      V: [
        'Hipoacusia crónica o tapón de cerumen asintomático',
        'Faringitis leve eritematosa estable'
      ]
    }
  },
  {
    id: 'toxicologico',
    name: 'Toxicol./Psiquiát.',
    description: 'Toxicología General, Sobredosis, Agitación o Salud Mental de Urgencia',
    matrix: {
      I: [
        'Coma o paro cardiorrespiratorio por sobredosis de opiáceos u otros tóxicos',
        'Comportamiento suicida violento inmediato o agitación psicomotriz extrema con riesgo físico eminente'
      ],
      II: [
        'Intoxicación aguda o ingesta de tóxicos dentro de las últimas 2 horas',
        'Ideación suicida estructurada con plan o intento de autoeliminación reciente',
        'Crisis de agitación psicomotriz activa o agresividad incontrolable'
      ],
      III: [
        'Descompensación psicótica sin agresividad inmediata ni ideación suicida activa',
        'Crisis de pánico o ansiedad generalizada severa'
      ],
      IV: [
        'Trastorno adaptativo agudo con irritabilidad o llanto inconsolable',
        'Crisis de ansiedad leve reactiva'
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
