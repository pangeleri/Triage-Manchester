import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Download, 
  FileText, 
  Heart, 
  Info, 
  Plus, 
  Stethoscope, 
  User, 
  ChevronRight, 
  ChevronLeft, 
  ChevronDown, 
  Timer, 
  RefreshCw, 
  Database, 
  Github, 
  Globe, 
  FileSpreadsheet,
  ShieldAlert,
  Edit3,
  Trash2,
  Check,
  AlertTriangle,
  ShieldCheck,
  Zap,
  LogOut,
  UserCircle2,
  RotateCcw,
  X,
  Search,
  BookOpen,
  HelpCircle
} from 'lucide-react';
import { useAuth, ROL_ETIQUETA } from './lib/auth';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import { format, differenceInMinutes, differenceInHours } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from './lib/utils';
import { FINDINGS, TriageLevel, PatientData, VitalSigns, PatientType, PediatricTriangle, CLINICAL_SYSTEMS, ClinicalSystem, ReevaluacionData, EstadoOperativo, CorreccionData, ESTADOS_CORREGIBLES, findFindingMeta, PAED_CTAS_ABBREVIATIONS } from './types';
import { isSupabaseConfigured, saveTriageRecord, fetchTriageRecords, saveReevaluation, updateOperationalState, saveCorrection, supabase } from './lib/supabase';
import { getVitalsRange, getVitalsDSLabel, getTepLadosAlterados, getTepLadosList, getVitalsRequirementsByLevel, calculateTriage } from './lib/clinicalUtils';

// --- Constants & Helpers ---

export const createCleanVitals = (): VitalSigns => ({
  heartRate: undefined,
  respiratoryRate: undefined,
  systolicBP: undefined,
  diastolicBP: undefined,
  oxygenSaturation: undefined,
  temperature: undefined,
  glucose: undefined,
  avpu: 'A',
  condicionMedicionSpo2: 'aire_ambiente',
  metodoTemperatura: 'axilar',
});

export const createCleanTep = (): PediatricTriangle => ({
  appearance: {
    normal: true,
    abnormalActivity: false,
    unresponsive: false,
    abnormalVisualContact: false,
    irritableInconsolable: false,
    abnormalCry: false,
    abnormalTone: false,
  },
  respiration: {
    normal: true,
    agitation: false,
    apnea: false,
    abnormalPosition: false,
    abnormalSounds: false,
    retractions: false,
  },
  circulation: {
    normal: true,
    cyanosis: false,
    mottled: false,
    pallor: false,
    flushing: false,
  },
});

export const createCleanPatient = (): Partial<PatientData> => ({
  name: '',
  age: undefined,
  ageUnit: 'años',
  gender: 'M',
  documentId: '',
  type: 'pediatric',
  tep: createCleanTep(),
  tepStates: {
    apariencia: 'normal',
    respiracion: 'normal',
    circulacion: 'normal',
  },
  vitals: createCleanVitals(),
  findings: [],
  otherSymptoms: '',
  estadoOperativo: 'en_espera',
  nivelCtasSugerido: 5,
  nivelCtasFinal: 5,
  nombreAcompanante: '',
  telefonoAcompanante: '',
  parentescoAcompanante: '',
});

const INITIAL_VITALS: VitalSigns = createCleanVitals();
const INITIAL_TEP: PediatricTriangle = createCleanTep();
const INITIAL_PATIENT: Partial<PatientData> = createCleanPatient();

// --- CTASMatrix Components and Types ---
export type CTASLevel = 1 | 2 | 3 | 4 | 5;

export interface ClinicalCriterion {
  id: string;
  label: string;
  level: CTASLevel;
  selected?: boolean;
  disabled?: boolean;
}

export interface CTASMatrixProps {
  criteria: ClinicalCriterion[];
  selectedCriterionIds: string[];
  onToggleCriterion: (criterionId: string) => void;
}

export const CTASColumnHeader: React.FC<{ level: number; title: string; tone: string }> = ({ level, title, tone }) => {
  const toneClasses = {
    resuscitation: "bg-red-100 text-red-900 border border-red-300 shadow-sm",
    emergent: "bg-orange-100 text-orange-900 border border-orange-300 shadow-sm",
    urgent: "bg-yellow-100 text-yellow-900 border border-yellow-300 shadow-sm",
    lessUrgent: "bg-green-100 text-green-900 border border-green-300 shadow-sm",
    nonUrgent: "bg-blue-100 text-blue-900 border border-blue-300 shadow-sm",
  }[tone as 'resuscitation' | 'emergent' | 'urgent' | 'lessUrgent' | 'nonUrgent'] || "bg-slate-100 text-slate-800 border border-slate-300 shadow-sm";

  const dotBg = {
    resuscitation: "bg-red-600 animate-pulse",
    emergent: "bg-orange-600 animate-pulse",
    urgent: "bg-yellow-500 animate-pulse",
    lessUrgent: "bg-green-600 animate-pulse",
    nonUrgent: "bg-blue-600 animate-pulse",
  }[tone as 'resuscitation' | 'emergent' | 'urgent' | 'lessUrgent' | 'nonUrgent'] || "bg-slate-500";


  return (
    <div className={cn(
      "flex h-8 w-full items-center justify-center rounded-lg px-3 text-center text-xs font-semibold uppercase tracking-wider gap-1.5 shrink-0 select-none shadow-sm",
      toneClasses
    )}>
      <span className={cn("w-2 h-2 rounded-full", dotBg)} />
      {title}
    </div>
  );
};

export const ClinicalCriterionCard: React.FC<{
  criterion: ClinicalCriterion;
  selected: boolean;
  onToggle: () => void;
}> = ({
  criterion,
  selected,
  onToggle
}) => {
  const levelSelectionStyles: Record<CTASLevel, string> = {
    1: "bg-red-50 border-red-600 text-red-950 ring-2 ring-red-500 shadow-md",
    2: "bg-orange-50 border-orange-600 text-orange-950 ring-2 ring-orange-500 shadow-md",
    3: "bg-amber-50 border-amber-500 text-amber-950 ring-2 ring-amber-400 shadow-md",
    4: "bg-emerald-50 border-emerald-600 text-emerald-950 ring-2 ring-emerald-500 shadow-md",
    5: "bg-blue-50 border-blue-600 text-blue-950 ring-2 ring-blue-500 shadow-md",
  };

  return (
    <div
      onClick={onToggle}
      className={cn(
        "w-full self-start rounded-xl border p-3 text-left shadow-[0_3px_10px_rgba(15,23,42,0.05)] cursor-pointer select-none transition-all active:scale-[0.98]",
        selected
          ? levelSelectionStyles[criterion.level] || "bg-blue-50 border-blue-600 text-blue-900 ring-1 ring-blue-600"
          : "bg-white border-slate-200/80 text-slate-700 hover:border-slate-350 hover:bg-slate-50/50"
      )}
    >
      <div className="flex w-full items-start gap-3 text-left">
        <p className="min-w-0 flex-1 text-left text-sm font-semibold leading-snug break-words">
          {criterion.label}
        </p>
        <input 
          type="checkbox" 
          checked={selected} 
          readOnly 
          className="mt-1 shrink-0 h-4 w-4 border-slate-300 rounded cursor-pointer accent-blue-600" 
        />
      </div>
    </div>
  );
};

export const CTASMatrix = ({
  criteria,
  selectedCriterionIds,
  onToggleCriterion
}: CTASMatrixProps) => {
  const validCriteria = criteria.filter(
    (item) =>
      item &&
      typeof item.label === "string" &&
      item.label.trim().length > 0 &&
      item.label.trim() !== "0" &&
      item.label.trim() !== "null" &&
      item.label.trim() !== "undefined" &&
      [1, 2, 3, 4, 5].includes(item.level)
  );

  const criteriaByLevel: Record<CTASLevel, ClinicalCriterion[]> = {
    1: validCriteria.filter((item) => item.level === 1).sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' })),
    2: validCriteria.filter((item) => item.level === 2).sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' })),
    3: validCriteria.filter((item) => item.level === 3).sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' })),
    4: validCriteria.filter((item) => item.level === 4).sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' })),
    5: validCriteria.filter((item) => item.level === 5).sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' })),
  };

  const ctasColumns = [
    { level: 1 as CTASLevel, title: "I - RESUCITACIÓN", tone: "resuscitation" },
    { level: 2 as CTASLevel, title: "II - EMERGENCIA", tone: "emergent" },
    { level: 3 as CTASLevel, title: "III - URGENTE", tone: "urgent" },
    { level: 4 as CTASLevel, title: "IV - POCO URGENTE", tone: "lessUrgent" },
    { level: 5 as CTASLevel, title: "V - NO URGENTE", tone: "nonUrgent" },
  ] as const;

  return (
    <section className="w-full">
      <div className="w-full overflow-x-auto pb-2">
        <div className="min-w-[1120px]">
          <div className="grid grid-cols-5 items-start gap-3">
            {ctasColumns.map((column) => (
              <div
                key={column.level}
                className="flex min-w-0 flex-col items-stretch justify-start gap-3"
              >
                <CTASColumnHeader
                  level={column.level}
                  title={column.title}
                  tone={column.tone}
                />

                <div className="flex flex-col items-stretch justify-start gap-3">
                  {criteriaByLevel[column.level].length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center text-xs text-slate-400 italic select-none">
                      Sin discriminadores en este nivel
                    </div>
                  ) : (
                    criteriaByLevel[column.level].map((criterion) => (
                      <ClinicalCriterionCard
                        key={criterion.id}
                        criterion={criterion}
                        selected={selectedCriterionIds.includes(criterion.id)}
                        onToggle={() => onToggleCriterion(criterion.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

// --- Main Component ---

export default function App() {
  const { usuario: usuarioActual, salir } = useAuth();
  const [step, setStep] = useState(1);
  const [maxStepReached, setMaxStepReached] = useState(1);
  const [showResetModal, setShowResetModal] = useState(false);
  const [patient, setPatient] = useState<Partial<PatientData>>(createCleanPatient);
  const [history, setHistory] = useState<PatientData[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    setMaxStepReached(prev => Math.max(prev, step));
  }, [step]);
  
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [tepAlertLevelShown, setTepAlertLevelShown] = useState<number>(0);
  const [tepModalLevel, setTepModalLevel] = useState<number>(2);
  const [showAbnormalVitalModal, setShowAbnormalVitalModal] = useState(false);
  const [showAgeWarningModal, setShowAgeWarningModal] = useState(false);
  const [showFindingsAlert, setShowFindingsAlert] = useState(false);
  const [findingsAlertDismissed, setFindingsAlertDismissed] = useState(false);
  const [showSpecifics, setShowSpecifics] = useState<Record<string, boolean>>({
    apariencia: false,
    respiracion: false,
    circulacion: false
  });
  const [tepAlertDismissed, setTepAlertDismissed] = useState(false);
  const [selectedSystemId, setSelectedSystemId] = useState(() => {
    return 'respiratorio';
  });
  const [findingSearchQuery, setFindingSearchQuery] = useState('');
  const [showAbbreviations, setShowAbbreviations] = useState(false);

  // Corrección de un triaje ya finalizado (solo quien lo hizo, mientras el paciente no fue atendido)
  const [editingRecord, setEditingRecord] = useState<PatientData | null>(null);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  // Supabase Sync states
  const [dbSaving, setDbSaving] = useState(false);
  const [dbSuccessMessage, setDbSuccessMessage] = useState<string | null>(null);
  const [dbErrorMessage, setDbErrorMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [supabaseConnected, setSupabaseConnected] = useState(false);

  // Helper to count altered sides in TEP
  const getTepLadosAlterados = (data: Partial<PatientData>) => {
    if (data.type !== 'pediatric' || !data.tep) return 0;
    const { appearance, respiration, circulation } = data.tep;
    const hasAppearanceAlterada = Object.entries(appearance).some(([k, v]) => k !== 'normal' && v);
    const hasRespirationAlterada = Object.entries(respiration).some(([k, v]) => k !== 'normal' && v);
    const hasCirculationAlterada = Object.entries(circulation).some(([k, v]) => k !== 'normal' && v);
    return [hasAppearanceAlterada, hasRespirationAlterada, hasCirculationAlterada].filter(Boolean).length;
  };

  const getTepLadosList = (data: Partial<PatientData>) => {
    if (data.type !== 'pediatric' || !data.tep) return [];
    const { appearance, respiration, circulation } = data.tep;
    const list = [];
    if (Object.entries(appearance).some(([k, v]) => k !== 'normal' && v)) list.push('Apariencia');
    if (Object.entries(respiration).some(([k, v]) => k !== 'normal' && v)) list.push('Respiración');
    if (Object.entries(circulation).some(([k, v]) => k !== 'normal' && v)) list.push('Circulación');
    return list;
  };

  const getSelectedHighAcuityFindings = () => {
    const list: { finding: string; level: 'I' | 'II' | 'III'; color: string; label: string }[] = [];
    if (!patient.findings) return list;
    
    patient.findings.forEach(f => {
      if (FINDINGS.LEVEL_I.includes(f)) {
        list.push({ finding: f, level: 'I', color: 'bg-red-600 text-white', label: 'Nivel I - Resucitación' });
      } else if (FINDINGS.LEVEL_II.includes(f)) {
        list.push({ finding: f, level: 'II', color: 'bg-orange-500 text-white', label: 'Nivel II - Emergencia' });
      } else if (FINDINGS.LEVEL_III.includes(f)) {
        list.push({ finding: f, level: 'III', color: 'bg-yellow-500 text-slate-900', label: 'Nivel III - Urgente' });
      }
    });
    return list;
  };

  // Update current time for timers
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load history from localStorage and sync with Supabase if configured
  useEffect(() => {
    const localData = localStorage.getItem('triage_history');
    if (localData) {
      try {
        setHistory(JSON.parse(localData));
      } catch (e) {
        console.error('Error reading offline history:', e);
      }
    }

    if (isSupabaseConfigured) {
      const syncSupabase = async () => {
        setIsSyncing(true);
        try {
          if (supabase) {
            const { error: testErr } = await supabase.from('triage_records').select('id').limit(1);
            if (testErr) {
              setSupabaseConnected(false);
              throw new Error(testErr.message || 'Error de conexión');
            }
            setSupabaseConnected(true);
          } else {
            setSupabaseConnected(false);
            throw new Error('Supabase no está instanciado.');
          }
          const remoteRecords = await fetchTriageRecords();
          if (remoteRecords && remoteRecords.length > 0) {
            setHistory(remoteRecords);
            localStorage.setItem('triage_history', JSON.stringify(remoteRecords));
            setDbSuccessMessage('Conexión con Supabase establecida. Datos sincronizados.');
            setTimeout(() => setDbSuccessMessage(null), 5000);
          }
        } catch (e: any) {
          setSupabaseConnected(false);
          console.warn('Error al sincronizar con Supabase:', e?.message || e);
          setDbErrorMessage('Error al sincronizar con Supabase: ' + (e?.message || e));
          setTimeout(() => setDbErrorMessage(null), 5000);
        } finally {
          setIsSyncing(false);
        }
      };
      syncSupabase();
    } else {
      setSupabaseConnected(false);
    }
  }, []);

  // Monitor network online status and periodic checks for Supabase connection
  useEffect(() => {
    const checkSupabase = async () => {
      if (isSupabaseConfigured && supabase && navigator.onLine) {
        try {
          const { error } = await supabase.from('triage_records').select('id').limit(1);
          setSupabaseConnected(!error);
        } catch {
          setSupabaseConnected(false);
        }
      } else {
        setSupabaseConnected(false);
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      checkSupabase();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSupabaseConnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check on load
    checkSupabase();

    const interval = setInterval(() => {
      if (typeof navigator !== 'undefined') {
        setIsOnline(navigator.onLine);
      }
      checkSupabase();
    }, 20000); // Check every 20 seconds for precise status

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const triggerManualSync = async () => {
    if (!isSupabaseConfigured) {
      setDbErrorMessage('Supabase no está configurado. Revisa la pestaña de Base de Datos para configurarlo.');
      setTimeout(() => setDbErrorMessage(null), 5000);
      setSupabaseConnected(false);
      return;
    }
    setIsSyncing(true);
    setDbSuccessMessage(null);
    setDbErrorMessage(null);
    try {
      if (supabase) {
        const { error: testErr } = await supabase.from('triage_records').select('id').limit(1);
        if (testErr) {
          setSupabaseConnected(false);
          throw new Error(testErr.message || 'Error de conexión');
        }
        setSupabaseConnected(true);
      } else {
        throw new Error('Supabase no está instanciado.');
      }
      const remoteRecords = await fetchTriageRecords();
      if (remoteRecords && remoteRecords.length > 0) {
        setHistory(remoteRecords);
        localStorage.setItem('triage_history', JSON.stringify(remoteRecords));
      }
      setDbSuccessMessage('Base de datos sincronizada con éxito.');
      setTimeout(() => setDbSuccessMessage(null), 4000);
    } catch (e: any) {
      setSupabaseConnected(false);
      console.warn('Error de sincronización manual con Supabase:', e?.message || e);
      setDbErrorMessage('Error de sincronización: ' + (e?.message || e));
      setTimeout(() => setDbErrorMessage(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  // --- Logic Functions ---

  const currentTriage = useMemo(() => calculateTriage(patient), [patient]);

  // Synchronize showSpecifics with patient.tepStates
  useEffect(() => {
    if (patient.tepStates) {
      const isAp = patient.tepStates.apariencia === 'alterado';
      const isRe = patient.tepStates.respiracion === 'alterado';
      const isCi = patient.tepStates.circulacion === 'alterado';
      setShowSpecifics(prev => {
        if (prev.apariencia === isAp && prev.respiracion === isRe && prev.circulacion === isCi) {
          return prev;
        }
        return { apariencia: isAp, respiracion: isRe, circulacion: isCi };
      });
    }
  }, [patient.tepStates?.apariencia, patient.tepStates?.respiracion, patient.tepStates?.circulacion]);

  // Trigger TEP alert modal when 2 or 3 components are altered
  const alteredTepCount = useMemo(() => {
    if (!patient.tepStates) return 0;
    const { apariencia, respiracion, circulacion } = patient.tepStates;
    let count = 0;
    if (apariencia === 'alterado') count++;
    if (respiracion === 'alterado') count++;
    if (circulacion === 'alterado') count++;
    return count;
  }, [patient.tepStates]);

  useEffect(() => {
    if (alteredTepCount === 3) {
      if (tepAlertLevelShown < 3 && !showAlertModal) {
        setTepModalLevel(3);
        setShowAlertModal(true);
      }
    } else if (alteredTepCount === 2) {
      if (tepAlertLevelShown < 2 && !showAlertModal) {
        setTepModalLevel(2);
        setShowAlertModal(true);
      }
    } else if (alteredTepCount < 2) {
      setTepAlertLevelShown(0);
    }
  }, [alteredTepCount, tepAlertLevelShown, showAlertModal]);

  // Abnormal vitals detection for SpO2, Temperature and Glucose
  const abnormalVitalsList = useMemo(() => {
    const v = patient.vitals;
    if (!v) return [];
    const list: { type: 'temp' | 'spo2' | 'glucose'; title: string; valStr: string; text: string; suggestionSystem: string; suggestionDesc: string }[] = [];

    if (v.temperature !== undefined && v.temperature !== null && !isNaN(v.temperature)) {
      if (v.temperature >= 38.5) {
        list.push({
          type: 'temp',
          title: 'Fiebre Elevada',
          valStr: `${v.temperature} °C`,
          text: `Fiebre significativa (${v.temperature} °C ≥ 38.5 °C).`,
          suggestionSystem: 'infectologico',
          suggestionDesc: 'Considere discriminadores en Infectológico (ej: "Fiebre en niño de 3-36 meses", "T° > 38 °C en menor de 3 meses", "Neutropenia febril" o "Aspecto séptico").'
        });
      } else if (v.temperature < 35.5) {
        list.push({
          type: 'temp',
          title: 'Hipotermia',
          valStr: `${v.temperature} °C`,
          text: `Hipotermia detectada (${v.temperature} °C < 35.5 °C).`,
          suggestionSystem: 'infectologico',
          suggestionDesc: 'Considere el discriminador "Hipotermia" en Infectológico o "Injuria grave por frío, hipotermia" en Músculo-esquelético.'
        });
      }
    }

    if (v.oxygenSaturation !== undefined && v.oxygenSaturation !== null && !isNaN(v.oxygenSaturation)) {
      if (v.oxygenSaturation < 94) {
        list.push({
          type: 'spo2',
          title: 'Desaturación de Oxígeno',
          valStr: `${v.oxygenSaturation} %`,
          text: `SpO2 alterada (${v.oxygenSaturation} % < 94%).`,
          suggestionSystem: 'respiratorio',
          suggestionDesc: 'Considere discriminadores en Respiratorio (ej: "DR severa", "DR moderada", "DR leve" o "Disnea severa").'
        });
      }
    }

    if (v.glucose !== undefined && v.glucose !== null && !isNaN(v.glucose)) {
      if (v.glucose < 60) {
        list.push({
          type: 'glucose',
          title: 'Hipoglucemia Aguda',
          valStr: `${v.glucose} mg/dL`,
          text: `Glucemia baja crítica (${v.glucose} mg/dL < 60 mg/dL).`,
          suggestionSystem: 'endocrinologico',
          suggestionDesc: 'Considere "Diabetes mellitus con hipoglucemia" (Nivel III) en el Problema Endocrinológico.'
        });
      } else if (v.glucose > 250) {
        list.push({
          type: 'glucose',
          title: 'Hiperglucemia Marcada',
          valStr: `${v.glucose} mg/dL`,
          text: `Glucemia elevada (${v.glucose} mg/dL > 250 mg/dL).`,
          suggestionSystem: 'endocrinologico',
          suggestionDesc: 'Considere "Diabetes mellitus con CAD" (Nivel II) o "Diabetes mellitus con alteración del sensorio" (Nivel I) en Endocrinológico.'
        });
      }
    }

    return list;
  }, [patient.vitals]);

  const getVitalsRequirements = () => {
    return getVitalsRequirementsByLevel(currentTriage.level);
  };

  const isStepValid = () => {
    if (step === 1) {
      if (patient.estadoOperativo === 'preliminar_critico') {
        return !!patient.name;
      }
      if (patient.age !== undefined && patient.age >= 19 && patient.ageUnit === 'años') {
        return false;
      }
      return !!(patient.name && patient.age !== undefined && patient.documentId);
    }
    if (step === 2) {
      const ts = patient.tepStates;
      if (!ts) return false;
      return ts.apariencia !== 'no_evaluado' && ts.respiracion !== 'no_evaluado' && ts.circulacion !== 'no_evaluado';
    }
    if (step === 3) {
      return (patient.findings && patient.findings.length > 0) || patient.otherSymptoms;
    }
    if (step === 4) {
      const v = patient.vitals;
      if (!v) return false;
      const reqs = getVitalsRequirements();
      
      const hasValue = (val: number | undefined) => val !== undefined && val !== null && !isNaN(val);

      if (reqs.heartRate && !hasValue(v.heartRate)) return false;
      if (reqs.respiratoryRate && !hasValue(v.respiratoryRate)) return false;
      if (reqs.systolicBP && !hasValue(v.systolicBP)) return false;
      if (reqs.diastolicBP && !hasValue(v.diastolicBP)) return false;
      if (reqs.oxygenSaturation && !hasValue(v.oxygenSaturation)) return false;
      if (reqs.temperature && !hasValue(v.temperature)) return false;
      if (reqs.glucose && !hasValue(v.glucose)) return false;
      
      return true;
    }
    return true;
  };

  const handleImmediateShockRoom = () => {
    setValidationError(null);
    setStep(5);
  };

  const handleUndoCurrentStep = () => {
    setValidationError(null);
    if (step === 1) {
      setPatient(p => ({
        ...p,
        name: '',
        age: undefined,
        ageUnit: 'años',
        gender: 'M',
        documentId: '',
        nombreAcompanante: '',
        telefonoAcompanante: '',
        parentescoAcompanante: ''
      }));
      setShowAgeWarningModal(false);
    } else if (step === 2) {
      setPatient(p => ({
        ...p,
        tep: createCleanTep(),
        tepStates: {
          apariencia: 'normal',
          respiracion: 'normal',
          circulacion: 'normal'
        }
      }));
      setShowSpecifics({
        apariencia: false,
        respiracion: false,
        circulacion: false
      });
      setTepAlertDismissed(false);
      setTepAlertLevelShown(0);
      setShowAlertModal(false);
    } else if (step === 3) {
      setPatient(p => ({
        ...p,
        findings: [],
        otherSymptoms: ''
      }));
      setFindingSearchQuery('');
      setShowFindingsAlert(false);
      setFindingsAlertDismissed(false);
    } else if (step === 4) {
      setPatient(p => ({
        ...p,
        vitals: createCleanVitals()
      }));
      setShowAbnormalVitalModal(false);
    } else if (step === 5) {
      setStep(4);
    }
  };

  const resetEntireTriage = () => {
    setPatient(createCleanPatient());
    setStep(1);
    setMaxStepReached(1);
    setTepAlertDismissed(false);
    setTepAlertLevelShown(0);
    setShowAlertModal(false);
    setShowAbnormalVitalModal(false);
    setShowFindingsAlert(false);
    setFindingsAlertDismissed(false);
    setShowAgeWarningModal(false);
    setShowSpecifics({ apariencia: false, respiracion: false, circulacion: false });
    setFindingSearchQuery('');
    setValidationError(null);
    setEditingRecord(null);
    setShowResetModal(false);
  };

  const handleNext = () => {
    setValidationError(null);
    if (isStepValid()) {
      if (step === 3 && !findingsAlertDismissed) {
        const hasHighAcuityFinding = patient.findings?.some(f => 
          FINDINGS.LEVEL_I.includes(f) || 
          FINDINGS.LEVEL_II.includes(f) || 
          FINDINGS.LEVEL_III.includes(f)
        );
        if (hasHighAcuityFinding) {
          setShowFindingsAlert(true);
          return;
        }
      }
      setStep(s => s + 1);
    }
  };

  const handleBack = () => {
    setValidationError(null);
    setStep(s => Math.max(1, s - 1));
  };

  const levelToNum = (l?: string) => ({ I: 1, II: 2, III: 3, IV: 4, V: 5 } as Record<string, number>)[l || 'V'] ?? 5;

  /** Resumen clínico que se guarda como "antes" y "después" en cada corrección. */
  const resumenClinico = (p: Partial<PatientData>) => ({
    nivel: p.triageLevel,
    nombre: p.name,
    documento: p.documentId,
    edad: p.age, unidadEdad: p.ageUnit,
    tep: p.tepStates,
    discriminadores: p.findings || [],
    signos: p.vitals,
    observaciones: p.otherSymptoms || ''
  });

  const puedeCorregir = (p: PatientData) =>
    !!usuarioActual && !!p.creadoPor && p.creadoPor === usuarioActual.id &&
    ESTADOS_CORREGIBLES.includes(p.estadoOperativo || 'en_espera');

  const startCorrection = (p: PatientData) => {
    setEditingRecord(p);
    setPatient(JSON.parse(JSON.stringify(p)));
    const primer = p.findings && p.findings[0] ? findFindingMeta(p.findings[0]) : null;
    if (primer) setSelectedSystemId(primer.sistema);
    setTepAlertDismissed(true);
    setTepAlertLevelShown(3);
    setFindingsAlertDismissed(true);
    setValidationError(null);
    setCorrectionReason('');
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelCorrection = () => {
    setEditingRecord(null);
    setShowCorrectionModal(false);
    setCorrectionReason('');
    setPatient(createCleanPatient());
    setTepAlertDismissed(false);
    setTepAlertLevelShown(0);
    setFindingsAlertDismissed(false);
    setValidationError(null);
    setStep(1);
  };

  const applyCorrection = async () => {
    if (!editingRecord) return;
    const motivo = correctionReason.trim();
    if (motivo.length < 5) {
      setCorrectionError('Escribí el motivo de la corrección (al menos 5 caracteres).');
      return;
    }
    const ageMonths = patient.age !== undefined ? patient.age * (patient.ageUnit === 'años' ? 12 : 1) : undefined;
    const levelMapMin: Record<string, number> = { 'I': 0, 'II': 15, 'III': 30, 'IV': 60, 'V': 120 };
    const targetMin = levelMapMin[currentTriage.level] ?? 120;
    const llegada = new Date(editingRecord.arrivalDate);
    const corregido: PatientData = {
      ...(patient as PatientData),
      id: editingRecord.id,
      arrivalDate: editingRecord.arrivalDate,
      creadoPor: editingRecord.creadoPor,
      creadoPorNombre: editingRecord.creadoPorNombre,
      estadoOperativo: editingRecord.estadoOperativo,
      nivelCtasSugerido: editingRecord.nivelCtasSugerido,
      nivelCtasFinal: levelToNum(currentTriage.level),
      triageLevel: currentTriage.level,
      originalPriority: currentTriage.priority,
      waitTime: currentTriage.wait,
      suggestedDestination: currentTriage.destination,
      objetivoEvaluacionMinutos: targetMin,
      fechaObjetivoEvaluacion: new Date(llegada.getTime() + targetMin * 60000).toISOString(),
      frecuenciaCardiacaDs: getVitalsDSLabel(patient.vitals?.heartRate, ageMonths, 'FC').key,
      frecuenciaRespiratoriaDs: getVitalsDSLabel(patient.vitals?.respiratoryRate, ageMonths, 'FR').key,
      reevaluaciones: editingRecord.reevaluaciones,
    };
    const correccion: CorreccionData = {
      episodioId: editingRecord.id,
      nivelPrevio: levelToNum(editingRecord.triageLevel),
      nivelNuevo: levelToNum(currentTriage.level),
      motivo,
      datosPrevios: resumenClinico(editingRecord),
      datosNuevos: resumenClinico(corregido),
      corregidoPor: usuarioActual?.id,
      corregidoPorNombre: usuarioActual?.nombre,
      fecha: new Date().toISOString(),
    };
    corregido.correcciones = [...(editingRecord.correcciones || []), correccion];

    if (isSupabaseConfigured) {
      setDbSaving(true);
      const res = await saveCorrection(corregido, correccion);
      setDbSaving(false);
      if (!res.success) {
        // No se aplica localmente si la base la rechazó: el registro oficial queda intacto.
        setCorrectionError('No se pudo guardar la corrección: ' + res.error);
        return;
      }
    }

    const updatedHistory = history.map(h => (h.id === corregido.id ? corregido : h));
    setHistory(updatedHistory);
    localStorage.setItem('triage_history', JSON.stringify(updatedHistory));
    setDbSuccessMessage(`Corrección registrada: Nivel ${editingRecord.triageLevel} → Nivel ${currentTriage.level}.`);
    setTimeout(() => setDbSuccessMessage(null), 4000);
    cancelCorrection();
  };

  const finalizeTriage = async () => {
    if (currentTriage.level !== 'I' && patient.estadoOperativo !== 'preliminar_critico') {
      if (!patient.findings || patient.findings.length === 0) {
        setValidationError("Debe seleccionar al menos un discriminador del problema principal antes de cerrar el triaje.");
        return;
      }
    }

    setValidationError(null);
    if (editingRecord) {
      setCorrectionError(null);
      setShowCorrectionModal(true);
      return;
    }
    const ageMonths = patient.age !== undefined
      ? patient.age * (patient.ageUnit === 'años' ? 12 : 1)
      : undefined;
    
    // Set clinical target goals in minutes and timestamps
    const levelMapMin: Record<string, number> = { 'I': 0, 'II': 15, 'III': 30, 'IV': 60, 'V': 120 };
    const targetMin = levelMapMin[currentTriage.level] ?? 120;
    const now = new Date();
    const targetTime = new Date(now.getTime() + targetMin * 60 * 1000);

    const finalPatient: PatientData = {
      ...patient as PatientData,
      id: (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }),
      creadoPor: usuarioActual?.id,
      creadoPorNombre: usuarioActual?.nombre,
      arrivalDate: now.toISOString(),
      triageLevel: currentTriage.level,
      originalPriority: currentTriage.priority,
      waitTime: currentTriage.wait,
      suggestedDestination: currentTriage.destination,
      objetivoEvaluacionMinutos: targetMin,
      fechaObjetivoEvaluacion: targetTime.toISOString(),
      frecuenciaCardiacaDs: getVitalsDSLabel(patient.vitals?.heartRate, ageMonths, 'FC').key,
      frecuenciaRespiratoriaDs: getVitalsDSLabel(patient.vitals?.respiratoryRate, ageMonths, 'FR').key,
      estadoOperativo: patient.estadoOperativo || 'en_espera'
    };

    // Save locally immediately
    const updatedHistory = [finalPatient, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('triage_history', JSON.stringify(updatedHistory));

    setPatient(createCleanPatient());
    setStep(1);
    setTepAlertDismissed(false);
    setTepAlertLevelShown(0);
    setShowAlertModal(false);
    setShowAbnormalVitalModal(false);
    setShowFindingsAlert(false);
    setFindingsAlertDismissed(false);
    setValidationError(null);

    // Save to Supabase in background if configured
    if (isSupabaseConfigured) {
      setDbSaving(true);
      setDbSuccessMessage(null);
      setDbErrorMessage(null);
      try {
        const res = await saveTriageRecord(finalPatient);
        if (res.success) {
          setSupabaseConnected(true);
          setDbSuccessMessage('Registro guardado en Supabase con éxito.');
          // Refresh list to ensure we have structural sync
          try {
            const remoteRecords = await fetchTriageRecords();
            if (remoteRecords && remoteRecords.length > 0) {
              setHistory(remoteRecords);
              localStorage.setItem('triage_history', JSON.stringify(remoteRecords));
            }
          } catch (fetchErr: any) {
            console.warn('No se pudieron recuperar los registros remotos después de guardar:', fetchErr?.message || fetchErr);
          }
          setTimeout(() => setDbSuccessMessage(null), 3000);
        } else {
          setSupabaseConnected(false);
          setDbErrorMessage('No se pudo guardar en Supabase: ' + res.error);
          setTimeout(() => setDbErrorMessage(null), 6000);
        }
      } catch (err: any) {
        setSupabaseConnected(false);
        setDbErrorMessage('Excepción de Supabase: ' + (err?.message || err));
        setTimeout(() => setDbErrorMessage(null), 6000);
      } finally {
        setDbSaving(false);
      }
    }
  };

  const generatePDF = (p: PatientData) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.text('HOSPITAL GRAL. DE AGUDOS "DRA. CECILIA GRIERSON"', 105, 20, { align: 'center' });
    doc.setFontSize(14);
    doc.text('FORMULARIO HCU-F053: REGISTRO DE TRIAJE CTAS / CANADIENSE', 105, 30, { align: 'center' });
    
    // Patient Info
    doc.setFontSize(12);
    doc.text(`ID: ${p.id}`, 20, 45);
    doc.text(`Paciente: ${p.name}`, 20, 55);
    doc.text(`Documento: ${p.documentId}`, 120, 55);
    doc.text(`Edad: ${p.age} ${p.ageUnit}`, 20, 65);
    doc.text(`Género: ${p.gender}`, 120, 65);
    doc.text(`Fecha/Hora: ${format(new Date(p.arrivalDate), 'dd/MM/yyyy HH:mm')}`, 20, 75);

    // Triage Result
    const levelColors: Record<string, [number, number, number]> = {
      'I': [220, 38, 38],
      'II': [249, 115, 22],
      'III': [234, 179, 8],
      'IV': [34, 197, 94],
      'V': [59, 130, 246]
    };
    const [r, g, b] = levelColors[p.triageLevel] || [100, 100, 100];
    doc.setFillColor(r, g, b);
    doc.rect(20, 85, 170, 15, 'F');
    doc.setTextColor(p.triageLevel === 'III' ? 0 : 255);
    doc.text(`CLASIFICACIÓN: NIVEL ${p.triageLevel} - ${p.originalPriority}`, 105, 95, { align: 'center' });
    doc.setTextColor(0);

    // Vitals Table
    (doc as any).autoTable({
      startY: 110,
      head: [['Signo Vital', 'Valor']],
      body: [
        ['Tipo de Paciente', p.type.toUpperCase()],
        ['Frecuencia Cardíaca', `${p.vitals.heartRate ?? 'N/A'} lpm`],
        ['Frecuencia Respiratoria', `${p.vitals.respiratoryRate ?? 'N/A'} rpm`],
        ['Presión Arterial', `${p.vitals.systolicBP ?? 'N/A'}/${p.vitals.diastolicBP ?? 'N/A'} mmHg`],
        ['Saturación O2', `${p.vitals.oxygenSaturation ?? 'N/A'}%`],
        ['Temperatura', `${p.vitals.temperature ?? 'N/A'}°C`],
        ['Clasificación AVPU', p.vitals.avpu ?? 'N/A'],
      ],
    });

    // Findings & Destination
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const findingsStr = Array.isArray(p.findings)
      ? p.findings.join(', ')
      : (typeof p.findings === 'string' ? p.findings : 'Ninguno');
    doc.text(`Hallazgos: ${findingsStr || 'Ninguno'}`, 20, finalY);
    if (p.otherSymptoms) {
      doc.text(`Otros Síntomas: ${p.otherSymptoms}`, 20, finalY + 10);
    }
    doc.text(`Tiempo de Espera: ${p.waitTime}`, 20, finalY + 20);
    doc.text(`Destino Sugerido: ${p.suggestedDestination}`, 20, finalY + 30);

    if (p.correcciones && p.correcciones.length > 0) {
      const rom = ['', 'I', 'II', 'III', 'IV', 'V'];
      (doc as any).autoTable({
        startY: finalY + 40,
        head: [['Corrección', 'Usuario', 'Nivel', 'Motivo']],
        body: p.correcciones.map(c => [
          format(new Date(c.fecha), 'dd/MM/yyyy HH:mm'),
          c.corregidoPorNombre || '',
          `${rom[c.nivelPrevio] || '?'} → ${rom[c.nivelNuevo] || '?'}`,
          c.motivo,
        ]),
        styles: { fontSize: 8 },
      });
    }

    doc.save(`Triaje_${p.id}.pdf`);
  };

  const exportToCSV = () => {
    if (history.length === 0) return;
    
    const escapeCSVCell = (val: any) => {
      if (val === undefined || val === null) return '';
      let str = String(val);
      // Replace double quotes with two double quotes
      str = str.replace(/"/g, '""');
      // Wrap in double quotes if there are semicolons, double quotes, or newlines
      if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str}"`;
      }
      return str;
    };

    const headers = [
      'ID',
      'Paciente',
      'Documento',
      'Edad',
      'Género',
      'Tipo de Paciente',
      'Nivel',
      'Clasificación',
      'FC (lpm)',
      'FR (rpm)',
      'PA (mmHg)',
      'Saturación O2 (%)',
      'Temperatura (°C)',
      'Neurológico AVPU',
      'Hallazgos',
      'Otros Síntomas',
      'Destino Sugerido',
      'Fecha de Registro'
    ];
    
    const rows = history.map(p => {
      const ageStr = `${p.age ?? ''} ${p.ageUnit ?? ''}`;
      const typeStr = p.type === 'pediatric' ? 'Pediátrico' : 'Adulto';
      const paStr = p.vitals.systolicBP !== undefined && p.vitals.diastolicBP !== undefined 
        ? `${p.vitals.systolicBP}/${p.vitals.diastolicBP}`
        : '';
      const dateStr = format(new Date(p.arrivalDate), 'dd/MM/yyyy HH:mm:ss');
      const findingsStr = Array.isArray(p.findings)
        ? p.findings.join(', ')
        : (typeof p.findings === 'string' ? p.findings : '');

      return [
        p.id,
        p.name,
        p.documentId,
        ageStr,
        p.gender,
        typeStr,
        `Nivel ${p.triageLevel}`,
        p.originalPriority,
        p.vitals.heartRate ?? '',
        p.vitals.respiratoryRate ?? '',
        paStr,
        p.vitals.oxygenSaturation ?? '',
        p.vitals.temperature ?? '',
        p.vitals.avpu ?? '',
        findingsStr,
        p.otherSymptoms ?? '',
        p.suggestedDestination ?? '',
        dateStr
      ];
    });
    
    const csvContent = [
      headers.map(escapeCSVCell).join(';'),
      ...rows.map(row => row.map(escapeCSVCell).join(';'))
    ].join('\r\n');
    
    // Create Blob with BOM for Excel compatibility with Spanish characters
    const bom = "\uFEFF";
    const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Historial_Triaje_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getSummaryText = (p: Partial<PatientData>) => {
    const triage = p.triageLevel ? {
      level: p.triageLevel,
      priority: p.originalPriority,
      destination: p.suggestedDestination,
    } : currentTriage;

    const tepDetails = p.type === 'pediatric' && p.tep ? `
TEP (Triángulo Evaluación Pediátrico):
- Apariencia: ${Object.entries(p.tep.appearance).filter(([_, v]) => v).map(([k]) => k).join(', ') || 'Normal'}
- Respiración: ${Object.entries(p.tep.respiration).filter(([_, v]) => v).map(([k]) => k).join(', ') || 'Normal'}
- Circulación: ${Object.entries(p.tep.circulation).filter(([_, v]) => v).map(([k]) => k).join(', ') || 'Normal'}` : '';

    return `
TIPO DE PACIENTE: ${p.type === 'pediatric' ? 'PEDIÁTRICO' : 'ADULTO'}
NIVEL DE GRAVEDAD: ${triage.level} (${triage.priority})
DOCUMENTO: ${p.documentId || '---'}
SIGNOS VITALES: FC: ${p.vitals?.heartRate ?? '---'} lpm, FR: ${p.vitals?.respiratoryRate ?? '---'} rpm, PA: ${p.vitals?.systolicBP ?? '---'}/${p.vitals?.diastolicBP ?? '---'} mmHg, SpO2: ${p.vitals?.oxygenSaturation ?? '---'}%, T°: ${p.vitals?.temperature ?? '---'}°C${tepDetails}
PROBLEMA PRINCIPAL: ${(Array.isArray(p.findings) ? p.findings.join(', ') : (typeof p.findings === 'string' ? p.findings : '')) || 'Sin hallazgos específicos'}${p.otherSymptoms ? ` (${p.otherSymptoms})` : ''}
CLASIFICACIÓN NEUROLÓGICA AVPU: ${p.vitals?.avpu ?? '---'}
DESTINO SUGERIDO: ${triage.destination}
    `.trim();
  };

  // --- Render Helpers ---

  const renderStepIndicator = () => {
    const totalSteps = 5;
    const stepNames = [
      '1. Filiación',
      '2. TEP',
      '3. Motivo Clínico',
      '4. Signos Vitales',
      '5. Confirmación'
    ];
    return (
      <div className="flex flex-col items-center mb-8 w-full">
        <div className="flex items-center justify-center space-x-2 sm:space-x-4">
          {[1, 2, 3, 4, 5].map((i) => {
            if (i === 2 && patient.type === 'adult') return null; // Hide TEP step for adults
            const isGoable = i <= maxStepReached || i <= step;
            return (
              <div key={i} className="flex items-center">
                <button
                  type="button"
                  disabled={!isGoable}
                  onClick={() => isGoable && setStep(i)}
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2",
                    step === i ? "bg-blue-600 text-white scale-110 shadow-lg ring-2 ring-blue-300" : 
                    isGoable ? "bg-green-500 text-white hover:bg-green-600 cursor-pointer shadow-sm hover:scale-105" : "bg-slate-200 text-slate-500 cursor-not-allowed"
                  )}
                  title={isGoable ? `Ir al ${stepNames[i - 1]} (deshacer o modificar datos)` : stepNames[i - 1]}
                >
                  {step > i ? <CheckCircle2 size={20} /> : i}
                </button>
                {i < totalSteps && (
                  <div className={cn("w-6 sm:w-8 h-1 mx-1 sm:mx-2 rounded", step > i ? "bg-green-500" : (isGoable ? "bg-green-300" : "bg-slate-200"))} />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-xs font-bold text-slate-500 flex flex-wrap items-center justify-center gap-2">
          <span>Paso {step} de {totalSteps}: {stepNames[step - 1]}</span>
          {maxStepReached > 1 && (
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
              Podés hacer clic en los números para volver a cualquier paso y deshacer cambios
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full max-w-none m-0 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white px-6 py-4 rounded-2xl border border-slate-200/60 shadow-[0_18px_40px_rgba(15,23,42,0.14),0_6px_14px_rgba(15,23,42,0.06)]">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-600 rounded-xl text-white">
            <Activity size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Herramienta para el triaje Grierson</h1>
            <p className="text-slate-500 font-medium">Hospital Gral. de Agudos "Dra. Cecilia Grierson"</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-full border border-slate-200/70">
            <Clock className="text-blue-600" size={20} />
            <span className="font-bold tabular-nums text-slate-700">
              {format(currentTime, 'HH:mm:ss')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold text-slate-700 bg-slate-50 hover:bg-rose-50 hover:text-rose-700 border border-slate-200 hover:border-rose-300 transition-all cursor-pointer shadow-xs"
            title="Reiniciar y borrar todos los datos del paciente actual"
          >
            <RotateCcw size={14} className="text-rose-600" />
            <span>Reiniciar triaje</span>
          </button>
          {usuarioActual && (
            <div className="flex items-center gap-2 bg-slate-50 pl-3 pr-1.5 py-1.5 rounded-full border border-slate-200/70">
              <UserCircle2 className="text-blue-600" size={22} />
              <div className="leading-tight">
                <div className="text-sm font-bold text-slate-800">{usuarioActual.nombre}</div>
                <div className="text-[11px] font-semibold text-slate-500">{usuarioActual.rol ? ROL_ETIQUETA[usuarioActual.rol] : ''}</div>
              </div>
              <button
                type="button"
                onClick={() => { if (window.confirm('¿Cerrar sesión?')) salir(); }}
                className="ml-1 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 hover:text-slate-900 cursor-pointer"
                title="Cerrar sesión"
              >
                <LogOut size={14} /> Salir
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,0.88fr)_minmax(500px,0.32fr)] w-full">
        {/* Main Form Area */}
        <main className="w-full min-w-0 max-w-none">
          <div className="bg-white rounded-[24px] border border-slate-200/70 shadow-[0_10px_28px_rgba(15,23,42,0.10)]">
            <div className="w-full flex justify-center pt-8">
              {editingRecord && (
                <div className="mb-6 p-4 rounded-2xl border-2 border-violet-300 bg-violet-50 text-violet-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Edit3 size={22} className="text-violet-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="block text-sm font-black uppercase tracking-wide">Corrigiendo triaje · {editingRecord.name}</span>
                      <span className="block text-xs font-semibold mt-0.5">
                        Clasificación original: Nivel {editingRecord.triageLevel}. Modificá lo que haga falta; al guardar se pide el motivo y queda registrado el cambio.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={cancelCorrection}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-violet-800 border border-violet-300 bg-white hover:bg-violet-100 cursor-pointer shrink-0"
                  >
                    Cancelar corrección
                  </button>
                </div>
              )}
              {renderStepIndicator()}
            </div>

            <div className="p-8 pt-0">
              <AnimatePresence mode="wait">
                {step === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 font-sans">
                      <div className="flex items-center gap-2.5 text-blue-600">
                        <User size={28} />
                        <h2 className="text-2xl font-black tracking-tight">Identificación del Paciente Pediátrico <span className="text-red-500">*</span></h2>
                      </div>
                      {!!(patient.name || patient.documentId || patient.age !== undefined || patient.nombreAcompanante || patient.telefonoAcompanante || patient.parentescoAcompanante) && (
                        <button
                          type="button"
                          onClick={() => {
                            setPatient(p => ({
                              ...p,
                              name: '',
                              documentId: '',
                              age: undefined,
                              ageUnit: 'años',
                              gender: 'M',
                              nombreAcompanante: '',
                              telefonoAcompanante: '',
                              parentescoAcompanante: ''
                            }));
                            setShowAgeWarningModal(false);
                          }}
                          className="text-xs font-bold text-slate-600 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-rose-300 transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto shadow-2xs"
                          title="Borrar datos escritos en este paso"
                        >
                          <RotateCcw size={13} className="text-rose-600" /> Deshacer datos escritos
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-base font-black text-slate-800">Nombre Completo <span className="text-red-500 font-extrabold">*</span></label>
                        <input 
                          type="text" 
                          disabled={patient.estadoOperativo === 'preliminar_critico'}
                          className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-base font-semibold text-slate-800 shadow-sm placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500"
                          placeholder="Ej. Juan Pérez"
                          value={patient.name}
                          onChange={e => setPatient({...patient, name: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-base font-black text-slate-800">
                          Documento (DNI/CI) {patient.estadoOperativo !== 'preliminar_critico' && <span className="text-red-500 font-extrabold">*</span>}
                        </label>
                        <input 
                          type="text" 
                          disabled={patient.estadoOperativo === 'preliminar_critico'}
                          className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-base font-semibold text-slate-800 shadow-sm placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500"
                          placeholder={patient.estadoOperativo === 'preliminar_critico' ? "No requerido en modo crítico" : "Ej. 12345678"}
                          value={patient.documentId}
                          onChange={e => {
                            const val = e.target.value.replace(/\D/g, '');
                            setPatient({...patient, documentId: val});
                          }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-base font-black text-slate-800">
                            Edad {patient.estadoOperativo !== 'preliminar_critico' && <span className="text-red-500 font-extrabold">*</span>}
                          </label>
                          <input 
                            type="number" 
                            disabled={patient.estadoOperativo === 'preliminar_critico'}
                            className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-base font-semibold text-slate-800 shadow-sm placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500"
                            placeholder={patient.estadoOperativo === 'preliminar_critico' ? "N/A" : "Ej. 5"}
                            value={patient.age ?? ''}
                            onChange={e => {
                              const inputVal = e.target.value;
                              if (inputVal === '') {
                                setPatient({...patient, age: undefined});
                                return;
                              }
                              let val = parseInt(inputVal);
                              if (isNaN(val)) return;
                              if (val < 0) val = 0;

                              if (val >= 19 && patient.ageUnit === 'años') {
                                setShowAgeWarningModal(true);
                              }
                              setPatient({...patient, age: val});
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-base font-black text-slate-800">Unidad</label>
                          <select 
                            disabled={patient.estadoOperativo === 'preliminar_critico'}
                            className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-base font-bold text-slate-800 bg-white shadow-sm cursor-pointer disabled:bg-slate-100"
                            value={patient.ageUnit}
                            onChange={e => {
                              const unit = e.target.value as any;
                              if (patient.age !== undefined && patient.age >= 19 && unit === 'años') {
                                setShowAgeWarningModal(true);
                              }
                              setPatient({...patient, ageUnit: unit});
                            }}
                          >
                            <option value="años">Años</option>
                            <option value="meses">Meses</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-base font-black text-slate-800">Género</label>
                        <div className="flex gap-4">
                          {['M', 'F'].map(g => (
                            <button
                              key={g}
                              type="button"
                              disabled={patient.estadoOperativo === 'preliminar_critico'}
                              onClick={() => setPatient({...patient, gender: g as any})}
                              className={cn(
                                "flex-1 py-4 rounded-xl border-2 font-black text-base transition-all cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed",
                                patient.gender === g ? "bg-blue-600 border-blue-600 text-white shadow-md scale-[1.01]" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                              )}
                            >
                              {g === 'M' ? 'Masculino' : 'Femenino'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                  </motion.div>
                )}

                {step === 2 && patient.type === 'pediatric' && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                      <div className="flex items-center gap-2.5 text-blue-600">
                        <Stethoscope size={28} />
                        <h2 className="text-2xl font-black tracking-tight">Triángulo de Evaluación Pediátrico (TEP)</h2>
                      </div>
                    </div>

                    <p className="text-base text-slate-600 font-medium leading-relaxed">
                      Evalúe cada lado del triángulo de forma independiente seleccionando los hallazgos clínicos observados:
                    </p>

                    {/* Banner de Estado Visual TEP y Jerarquía */}
                    <div className={cn(
                      "p-4 rounded-2xl border-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all",
                      alteredTepCount === 3 ? "bg-red-50 border-red-400 text-red-950 shadow-md ring-2 ring-red-300" :
                      alteredTepCount === 2 ? "bg-orange-50 border-orange-400 text-orange-950 shadow-md ring-2 ring-orange-300" :
                      alteredTepCount === 1 ? "bg-amber-50 border-amber-300 text-amber-950" :
                      "bg-emerald-50 border-emerald-300 text-emerald-950"
                    )}>
                      <div className="flex items-center gap-3.5">
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex flex-col items-center justify-center font-black text-white shrink-0 shadow-sm",
                          alteredTepCount === 3 ? "bg-red-600 animate-pulse" :
                          alteredTepCount === 2 ? "bg-orange-500 animate-pulse" :
                          alteredTepCount === 1 ? "bg-amber-500" :
                          "bg-emerald-600"
                        )}>
                          <span className="text-[10px] uppercase font-bold tracking-tighter leading-none opacity-80">TEP</span>
                          <span className="text-lg leading-tight">{alteredTepCount === 3 ? 'I' : alteredTepCount === 2 ? 'II' : alteredTepCount === 1 ? 'III' : 'OK'}</span>
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black uppercase tracking-wide">
                              {alteredTepCount === 0 ? 'Triángulo Normal / Estable' :
                               alteredTepCount === 1 ? '1 Lado Alterado' :
                               alteredTepCount === 2 ? '2 Lados Alterados' :
                               '3 Lados Alterados'}
                            </span>
                            <span className={cn(
                              "text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border",
                              alteredTepCount === 3 ? "bg-red-100 text-red-900 border-red-300" :
                              alteredTepCount === 2 ? "bg-orange-100 text-orange-900 border-orange-300" :
                              alteredTepCount === 1 ? "bg-amber-100 text-amber-900 border-amber-300" :
                              "bg-emerald-100 text-emerald-900 border-emerald-300"
                            )}>
                              {alteredTepCount === 3 ? 'Nivel I · Rojo (Resucitación Inmediata)' :
                               alteredTepCount === 2 ? 'Nivel II · Naranja (Emergencia)' :
                               alteredTepCount === 1 ? 'Nivel III · Amarillo (Urgente)' :
                               'Verde · Sin Compromiso'}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-700 mt-1 leading-relaxed">
                            {alteredTepCount === 3 ? '🚨 Los 3 lados están afectados. Nivel I (Rojo). Requiere pase directo a Shock Room.' :
                             alteredTepCount === 2 ? '⚠️ 2 lados afectados. Nivel II (Naranja). Requiere atención de emergencia en ≤ 15 min.' :
                             alteredTepCount === 1 ? '1 lado afectado. Nivel III (Amarillo). Requiere atención urgente en ≤ 30 min.' :
                             'Apariencia, respiración y circulación estables.'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {(alteredTepCount > 0 || 
                          patient.tepStates?.apariencia !== 'normal' || 
                          patient.tepStates?.respiracion !== 'normal' || 
                          patient.tepStates?.circulacion !== 'normal' ||
                          Object.entries(patient.tep?.appearance || {}).some(([k, v]) => k !== 'normal' && v) ||
                          Object.entries(patient.tep?.respiration || {}).some(([k, v]) => k !== 'normal' && v) ||
                          Object.entries(patient.tep?.circulation || {}).some(([k, v]) => k !== 'normal' && v)
                        ) && (
                          <button
                            type="button"
                            onClick={() => {
                              setPatient(p => ({
                                ...p,
                                tep: createCleanTep(),
                                tepStates: { apariencia: 'normal', respiracion: 'normal', circulacion: 'normal' }
                              }));
                              setShowSpecifics({ apariencia: false, respiracion: false, circulacion: false });
                              setTepAlertDismissed(false);
                              setTepAlertLevelShown(0);
                              setShowAlertModal(false);
                            }}
                            className="px-3 py-1.5 rounded-xl text-xs font-black text-slate-700 hover:text-rose-700 bg-white hover:bg-rose-50 border border-slate-300 hover:border-rose-300 shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                            title="Deshacer todas las selecciones y restablecer el TEP a Normal"
                          >
                            <RotateCcw size={13} className="text-rose-600" /> Deshacer TEP
                          </button>
                        )}
                        {alteredTepCount >= 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              setTepModalLevel(alteredTepCount === 3 ? 3 : 2);
                              setShowAlertModal(true);
                            }}
                            className={cn(
                              "px-3.5 py-2 text-white rounded-xl text-xs font-black shrink-0 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95",
                              alteredTepCount === 3 ? "bg-red-600 hover:bg-red-700 shadow-red-200" : "bg-orange-500 hover:bg-orange-600 shadow-orange-200"
                            )}
                          >
                            <AlertTriangle size={14} />
                            Ver Alerta ({alteredTepCount === 3 ? 'Rojo' : 'Naranja'})
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {[
                        { 
                          title: 'Apariencia', 
                          key: 'apariencia', 
                          tepKey: 'appearance',
                          options: [
                            { k: 'abnormalActivity', l: 'Actividad anormal' },
                            { k: 'unresponsive', l: 'Arreactivo / Inconsciente' },
                            { k: 'abnormalVisualContact', l: 'Contacto visual anormal' },
                            { k: 'irritableInconsolable', l: 'Irritable, no consolable' },
                            { k: 'abnormalCry', l: 'Llanto anormal' },
                            { k: 'abnormalTone', l: 'Tono anormal / Hipotonía' },
                          ]
                        },
                        { 
                          title: 'Respiración', 
                          key: 'respiracion', 
                          tepKey: 'respiration',
                          options: [
                            { k: 'agitation', l: 'Agitación o taquipnea' },
                            { k: 'apnea', l: 'Apnea' },
                            { k: 'abnormalPosition', l: 'Posición anormal (Trípode)' },
                            { k: 'abnormalSounds', l: 'Ruidos anormales (Estridor/Quejido)' },
                            { k: 'retractions', l: 'Tirajes o retracción' },
                          ]
                        },
                        { 
                          title: 'Circulación', 
                          key: 'circulacion', 
                          tepKey: 'circulation',
                          options: [
                            { k: 'cyanosis', l: 'Cianosis' },
                            { k: 'mottled', l: 'Moteado o piel reticulada' },
                            { k: 'pallor', l: 'Palidez' },
                            { k: 'flushing', l: 'Rubicundez' },
                          ]
                        }
                      ].map(section => {
                        const currentStatus = patient.tepStates?.[section.key as keyof typeof patient.tepStates] || 'normal';
                        const isAlterado = currentStatus === 'alterado';
                        
                        return (
                          <div key={section.title} className={cn(
                            "p-5 rounded-2xl border-2 transition-all shadow-sm flex flex-col justify-between",
                            isAlterado ? "bg-rose-50 border-rose-300 shadow-md" : "bg-emerald-50 border-emerald-200 shadow-sm"
                          )}>
                            <div>
                              <div className="flex justify-between items-center mb-4 border-b border-slate-200 pb-2.5">
                                <h3 className="font-sans font-black text-slate-950 text-lg tracking-tight">{section.title}</h3>
                                <div className="flex items-center gap-1.5">
                                  {isAlterado && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextTep = { ...patient.tep! };
                                        const secKey = section.tepKey;
                                        (nextTep as any)[secKey] = {
                                          normal: true,
                                          ...(section.tepKey === 'appearance' ? {
                                            abnormalActivity: false, unresponsive: false, abnormalVisualContact: false, irritableInconsolable: false, abnormalCry: false, abnormalTone: false
                                          } : section.tepKey === 'respiration' ? {
                                            agitation: false, apnea: false, abnormalPosition: false, abnormalSounds: false, retractions: false
                                          } : {
                                            cyanosis: false, mottled: false, pallor: false, flushing: false
                                          })
                                        };
                                        const nextStates = {
                                          ...patient.tepStates!,
                                          [section.key]: 'normal' as const
                                        };
                                        setPatient(p => ({ ...p, tep: nextTep, tepStates: nextStates }));
                                      }}
                                      className="text-[10px] font-bold text-rose-700 hover:text-rose-900 bg-white hover:bg-rose-100 px-2 py-0.5 rounded-lg border border-rose-300 shadow-2xs flex items-center gap-1 transition-all cursor-pointer"
                                      title={`Desmarcar todas las opciones de ${section.title}`}
                                    >
                                      <RotateCcw size={10} /> Desmarcar
                                    </button>
                                  )}
                                  <span className={cn(
                                    "text-[11px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider border",
                                    isAlterado ? "bg-rose-100 text-rose-800 border-rose-200" : "bg-emerald-100 text-emerald-800 border-emerald-200"
                                  )}>
                                    {isAlterado ? 'Alterado' : 'Normal'}
                                  </span>
                                </div>
                              </div>

                              <div className="space-y-1.5 mt-2">
                                <div className="space-y-1.5 bg-white/65 p-3 rounded-xl border border-slate-200/60 shadow-inner">
                                  {section.options.map(opt => {
                                    const isChecked = !!(patient.tep as any)[section.tepKey][opt.k];
                                    return (
                                      <label key={opt.k} className={cn(
                                        "flex items-center gap-2.5 text-xs cursor-pointer p-2 rounded-lg transition-all border border-transparent select-none",
                                        isChecked ? "bg-rose-100 text-rose-950 border-rose-200 font-bold" : "hover:bg-slate-100 text-slate-700"
                                      )}>
                                        <input 
                                          type="checkbox" 
                                          className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                                          checked={isChecked}
                                          onChange={() => {
                                            const nextTep = { ...patient.tep! };
                                            const secKey = section.tepKey;
                                            const secObj = { ...(nextTep as any)[secKey] };
                                            secObj[opt.k] = !secObj[opt.k];
                                            secObj.normal = false;
                                            (nextTep as any)[secKey] = secObj;
                                            
                                            // Determine if any option is true
                                            const isAnyChecked = Object.keys(secObj).some(k => k !== 'normal' && secObj[k]);
                                            const nextStates = { 
                                              ...patient.tepStates!, 
                                              [section.key]: isAnyChecked ? 'alterado' : 'normal' 
                                            };
                                            setPatient(p => ({ ...p, tep: nextTep, tepStates: nextStates }));
                                          }}
                                        />
                                        <span className="leading-snug">{opt.l}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {step === 3 && (() => {
                  const currentSystem = CLINICAL_SYSTEMS.find(sys => sys.id === selectedSystemId) || CLINICAL_SYSTEMS[0];
                  
                  const criteria: ClinicalCriterion[] = [
                    ...currentSystem.matrix.I.map(label => ({ id: label, label, level: 1 as CTASLevel })),
                    ...currentSystem.matrix.II.map(label => ({ id: label, label, level: 2 as CTASLevel })),
                    ...currentSystem.matrix.III.map(label => ({ id: label, label, level: 3 as CTASLevel })),
                    ...currentSystem.matrix.IV.map(label => ({ id: label, label, level: 4 as CTASLevel })),
                    ...currentSystem.matrix.V.map(label => ({ id: label, label, level: 5 as CTASLevel })),
                  ];

                  const onToggleCriterion = (criterionId: string) => {
                    const current = patient.findings || [];
                    const isSelected = current.includes(criterionId);
                    // Selección múltiple (también entre distintos problemas principales):
                    // el discriminador más grave determina el nivel.
                    const next = isSelected ? current.filter(f => f !== criterionId) : [...current, criterionId];
                    setPatient({ ...patient, findings: next });
                  };

                  return (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                        <div className="flex items-center gap-2 text-blue-600">
                          <Stethoscope size={28} />
                          <h2 className="text-2xl font-black tracking-tight">Motivo de Consulta / Problema Principal <span className="text-red-500">*</span></h2>
                        </div>
                        <span className="text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 shrink-0 self-start md:self-auto">
                          Matriz CTAS/CEDIS Interactiva
                        </span>
                      </div>

                      {/* Banner de Gravedad Protegida si TEP o Signos ya determinaron un nivel alto */}
                      {(() => {
                        const tepLados = getTepLadosAlterados(patient);
                        if (tepLados >= 2) {
                          const levelName = tepLados === 3 ? 'Nivel I · Resucitación (Rojo)' : 'Nivel II · Emergencia (Naranja)';
                          return (
                            <div className={cn(
                              "p-4 rounded-2xl border-2 flex items-start gap-3 text-xs",
                              tepLados === 3 ? "bg-red-50 border-red-300 text-red-950" : "bg-orange-50 border-orange-300 text-orange-950"
                            )}>
                              <ShieldAlert size={22} className={cn("shrink-0 mt-0.5", tepLados === 3 ? "text-red-600" : "text-orange-600")} />
                              <div>
                                <span className="font-black uppercase tracking-wide block text-sm">
                                  🛡️ Gravedad Clínica Protegida: {levelName}
                                </span>
                                <p className="font-semibold mt-0.5 leading-relaxed">
                                  El paciente tiene {tepLados} lados del TEP alterados. La selección de un motivo de consulta leve (Nivel IV Verde o Nivel V Azul) <strong>no rebajará</strong> la prioridad global del paciente. El triaje mantendrá el nivel más severo por seguridad clínica.
                                </p>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* Barra de herramientas: Selector de Problema, Búsqueda Global y Glosario */}
                      <div className="space-y-3">
                        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                          {/* Selector de Problema Principal */}
                          <div className="flex-1 max-w-md">
                            <label htmlFor="clinical-system-select" className="text-xs font-black uppercase tracking-wider text-slate-600 block mb-1">
                              Problema Principal (15 Problemas PaedCTAS):
                            </label>
                            <div className="relative">
                              <select
                                id="clinical-system-select"
                                value={selectedSystemId}
                                onChange={(e) => {
                                  setSelectedSystemId(e.target.value);
                                  setFindingSearchQuery('');
                                }}
                                className="w-full bg-white text-slate-850 border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 text-base font-black shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer pr-10"
                              >
                                {[...CLINICAL_SYSTEMS].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })).map(sys => {
                                  const selectedCount = (patient.findings || []).filter(f => findFindingMeta(f)?.sistema === sys.id).length;
                                  return (
                                    <option key={sys.id} value={sys.id}>
                                      {sys.name} {selectedCount > 0 ? `(✓ ${selectedCount} selecc.)` : ''}
                                    </option>
                                  );
                                })}
                              </select>
                              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                                <ChevronDown size={18} />
                              </div>
                            </div>
                          </div>

                          {/* Buscador Rápido de Discriminadores en todos los problemas */}
                          <div className="flex-1">
                            <label htmlFor="finding-search-input" className="text-xs font-black uppercase tracking-wider text-slate-600 block mb-1">
                              Búsqueda rápida en todo el catálogo:
                            </label>
                            <div className="relative">
                              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                              <input
                                id="finding-search-input"
                                type="text"
                                value={findingSearchQuery}
                                onChange={(e) => setFindingSearchQuery(e.target.value)}
                                placeholder="Buscar signo/síntoma (ej: fiebre, convulsión, TEC, DR, quemadura...)"
                                className="w-full bg-white text-slate-800 border border-slate-200 hover:border-slate-300 rounded-xl pl-10 pr-10 py-3 text-sm font-semibold shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                              />
                              {findingSearchQuery && (
                                <button
                                  type="button"
                                  onClick={() => setFindingSearchQuery('')}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                                  title="Limpiar búsqueda"
                                >
                                  <X size={16} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Botón Glosario de Abreviaturas */}
                          <div className="lg:self-end">
                            <button
                              type="button"
                              onClick={() => setShowAbbreviations(s => !s)}
                              className={cn(
                                "h-[46px] px-3.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs whitespace-nowrap",
                                showAbbreviations 
                                  ? "bg-blue-50 border-blue-300 text-blue-700" 
                                  : "bg-white border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50"
                              )}
                            >
                              <BookOpen size={16} className={showAbbreviations ? "text-blue-600" : "text-slate-500"} />
                              <span>{showAbbreviations ? 'Ocultar Glosario' : 'Glosario PaedCTAS'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Glosario Desplegable de Abreviaturas Institucionales */}
                        {showAbbreviations && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="p-4 bg-slate-900 text-white rounded-2xl border border-slate-800 shadow-md space-y-2.5 text-xs"
                          >
                            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                              <span className="font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                                <BookOpen size={14} className="text-blue-400" />
                                Glosario de Abreviaturas Oficiales · PaedCTAS Hospital Grierson
                              </span>
                              <span className="text-[11px] text-slate-400">Versión 12/11/2026</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 pt-1">
                              {Object.entries(PAED_CTAS_ABBREVIATIONS).map(([abbr, significado]) => (
                                <div key={abbr} className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/60">
                                  <span className="font-black text-amber-400 block">{abbr}</span>
                                  <span className="text-[11px] text-slate-300 leading-tight block">{significado}</span>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </div>

                      {/* Matriz Completa y Ajustada a la Pantalla */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black uppercase tracking-widest text-slate-500 block">
                            {findingSearchQuery.trim() 
                              ? `Resultados de búsqueda para "${findingSearchQuery.trim()}":` 
                              : `Matriz de Discriminación: ${currentSystem.name}`}
                          </span>
                          {!findingSearchQuery.trim() && (
                            <span className="text-xs font-semibold text-slate-500 italic">
                              {currentSystem.description}
                            </span>
                          )}
                        </div>

                        {((patient.findings || []).length > 0 || !!patient.otherSymptoms || !!findingSearchQuery) && (
                          <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                            <span className="text-xs font-black text-slate-600 uppercase tracking-wide">
                              Seleccionados ({(patient.findings || []).length}) · define el nivel el más grave:
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setPatient(p => ({ ...p, findings: [], otherSymptoms: '' }));
                                setFindingSearchQuery('');
                                setShowFindingsAlert(false);
                                setFindingsAlertDismissed(false);
                              }}
                              className="ml-auto text-xs font-black text-rose-700 bg-white hover:bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-300 shadow-2xs flex items-center gap-1 transition-all cursor-pointer"
                              title="Deshacer y quitar todos los hallazgos seleccionados"
                            >
                              <RotateCcw size={12} className="text-rose-600" /> Deshacer selecciones
                            </button>
                            <div className="flex flex-wrap items-center gap-2 w-full pt-1">
                              {[...(patient.findings || [])]
                                .map(f => ({ f, meta: findFindingMeta(f) }))
                                .sort((a, b) => (a.meta?.nivel ?? 9) - (b.meta?.nivel ?? 9))
                                .map(({ f, meta }) => {
                                  const romano = ['', 'I', 'II', 'III', 'IV', 'V'][meta?.nivel ?? 0] || '?';
                                  const color = meta?.nivel === 1 ? 'bg-red-100 text-red-900 border-red-300'
                                    : meta?.nivel === 2 ? 'bg-orange-100 text-orange-900 border-orange-300'
                                    : meta?.nivel === 3 ? 'bg-yellow-100 text-yellow-900 border-yellow-300'
                                    : meta?.nivel === 4 ? 'bg-green-100 text-green-900 border-green-300'
                                    : 'bg-blue-100 text-blue-900 border-blue-300';
                                  const sistema = CLINICAL_SYSTEMS.find(sy => sy.id === meta?.sistema)?.name;
                                  return (
                                    <button
                                      key={f}
                                      type="button"
                                      onClick={() => onToggleCriterion(f)}
                                      title={`${sistema ?? ''} · Quitar`}
                                      className={cn('flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border cursor-pointer hover:opacity-80 shadow-2xs', color)}
                                    >
                                      <span className="font-black">{romano}</span> {f} <X size={12} className="opacity-70 hover:opacity-100" />
                                    </button>
                                  );
                                })}
                            </div>
                          </div>
                        )}

                        {/* Vista de Resultados de Búsqueda Global */}
                        {findingSearchQuery.trim() ? (
                          <div className="space-y-3 p-4 bg-slate-50/80 rounded-2xl border border-slate-200">
                            {(() => {
                              const q = findingSearchQuery.trim().toLowerCase();
                              const searchResults: { finding: string; sys: ClinicalSystem; level: CTASLevel }[] = [];
                              CLINICAL_SYSTEMS.forEach(sys => {
                                sys.matrix.I.forEach(label => {
                                  if (label.toLowerCase().includes(q)) searchResults.push({ finding: label, sys, level: 1 });
                                });
                                sys.matrix.II.forEach(label => {
                                  if (label.toLowerCase().includes(q)) searchResults.push({ finding: label, sys, level: 2 });
                                });
                                sys.matrix.III.forEach(label => {
                                  if (label.toLowerCase().includes(q)) searchResults.push({ finding: label, sys, level: 3 });
                                });
                                sys.matrix.IV.forEach(label => {
                                  if (label.toLowerCase().includes(q)) searchResults.push({ finding: label, sys, level: 4 });
                                });
                                sys.matrix.V.forEach(label => {
                                  if (label.toLowerCase().includes(q)) searchResults.push({ finding: label, sys, level: 5 });
                                });
                              });

                              if (searchResults.length === 0) {
                                return (
                                  <div className="py-8 text-center text-slate-500">
                                    <p className="font-bold">No se encontraron discriminadores para "{findingSearchQuery.trim()}".</p>
                                    <p className="text-xs text-slate-400 mt-1">Pruebe con otros términos o revise las 15 categorías en el selector.</p>
                                    <button
                                      type="button"
                                      onClick={() => setFindingSearchQuery('')}
                                      className="mt-3 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                                    >
                                      Volver a la matriz
                                    </button>
                                  </div>
                                );
                              }

                              return (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-xs font-bold text-slate-600 px-1">
                                    <span>{searchResults.length} discriminador(es) coincidente(s):</span>
                                    <button
                                      type="button"
                                      onClick={() => setFindingSearchQuery('')}
                                      className="text-blue-600 hover:underline cursor-pointer"
                                    >
                                      Cerrar búsqueda
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                    {searchResults.map(({ finding, sys, level }) => {
                                      const isSelected = (patient.findings || []).includes(finding);
                                      const levelTag = level === 1 ? 'Nivel I · Resucitación'
                                        : level === 2 ? 'Nivel II · Emergencia'
                                        : level === 3 ? 'Nivel III · Urgente'
                                        : level === 4 ? 'Nivel IV · Poco urgente'
                                        : 'Nivel V · No urgente';
                                      const tagColor = level === 1 ? 'bg-red-100 text-red-900 border-red-300'
                                        : level === 2 ? 'bg-orange-100 text-orange-900 border-orange-300'
                                        : level === 3 ? 'bg-yellow-100 text-yellow-900 border-yellow-300'
                                        : level === 4 ? 'bg-green-100 text-green-900 border-green-300'
                                        : 'bg-blue-100 text-blue-900 border-blue-300';

                                      return (
                                        <div
                                          key={finding}
                                          onClick={() => onToggleCriterion(finding)}
                                          className={cn(
                                            "p-3 rounded-xl border text-left shadow-2xs cursor-pointer select-none transition-all flex flex-col justify-between gap-2",
                                            isSelected 
                                              ? "bg-blue-50/80 border-blue-500 ring-2 ring-blue-400"
                                              : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                                          )}
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <span className={cn("text-[10px] font-black uppercase px-2 py-0.5 rounded-full border", tagColor)}>
                                                {levelTag}
                                              </span>
                                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                                {sys.name}
                                              </span>
                                            </div>
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              readOnly
                                              className="mt-0.5 h-4 w-4 border-slate-300 rounded accent-blue-600"
                                            />
                                          </div>
                                          <p className="text-sm font-semibold text-slate-800 leading-snug">
                                            {finding}
                                          </p>
                                          <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[11px]">
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedSystemId(sys.id);
                                                setFindingSearchQuery('');
                                              }}
                                              className="text-blue-600 hover:underline font-bold"
                                            >
                                              Abrir problema {sys.name} →
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <CTASMatrix
                            criteria={criteria}
                            selectedCriterionIds={patient.findings || []}
                            onToggleCriterion={onToggleCriterion}
                          />
                        )}
                      </div>

                      {/* Observaciones adicionales */}
                      <div className="space-y-2 pt-4 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                          <label className="text-base font-black text-slate-800 flex items-center gap-2">
                            <Plus size={18} className="text-blue-600" />
                            Otros Síntomas / Observaciones Opcionales
                          </label>
                          {!!patient.otherSymptoms && (
                            <button
                              type="button"
                              onClick={() => setPatient(p => ({ ...p, otherSymptoms: '' }))}
                              className="text-xs font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1 transition-all cursor-pointer"
                              title="Borrar texto de observaciones"
                            >
                              <RotateCcw size={12} /> Borrar texto
                            </button>
                          )}
                        </div>
                        <textarea 
                          className="w-full p-4 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[90px] text-base font-semibold text-slate-800 placeholder:text-slate-400 shadow-sm"
                          placeholder="Escriba aquí otros síntomas o detalles opcionales..."
                          value={patient.otherSymptoms || ''}
                          onChange={e => setPatient({...patient, otherSymptoms: e.target.value})}
                        />
                      </div>
                    </motion.div>
                  );
                })()}

                {step === 4 && (
                  <motion.div
                    key="step4"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                      <div className="flex items-center gap-2.5 text-blue-600">
                        <Heart size={28} />
                        <h2 className="text-2xl font-black tracking-tight">Signos Vitales / Constantes</h2>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {(Object.entries(patient.vitals || {}).some(([k, v]) => 
                            k !== 'avpu' && k !== 'condicionMedicionSpo2' && k !== 'metodoTemperatura' && v !== undefined && v !== null && v !== ''
                          ) || 
                          (patient.vitals?.avpu && patient.vitals.avpu !== 'A') ||
                          (patient.vitals?.condicionMedicionSpo2 && patient.vitals.condicionMedicionSpo2 !== 'aire_ambiente') ||
                          (patient.vitals?.metodoTemperatura && patient.vitals.metodoTemperatura !== 'axilar')
                        ) && (
                          <button
                            type="button"
                            onClick={() => {
                              setPatient(p => ({ ...p, vitals: createCleanVitals() }));
                              setShowAbnormalVitalModal(false);
                            }}
                            className="text-xs font-black text-slate-700 hover:text-rose-700 bg-white hover:bg-rose-50 px-3 py-1.5 rounded-xl border border-slate-300 hover:border-rose-300 shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                            title="Restablecer todos los signos vitales y neurológico a valores normales/vacíos"
                          >
                            <RotateCcw size={13} className="text-rose-600" /> Deshacer / Limpiar signos
                          </button>
                        )}
                        {currentTriage.level === 'IV' || currentTriage.level === 'V' ? (
                          <span className="text-xs font-bold bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-lg border border-emerald-200 shrink-0 self-start sm:self-auto flex items-center gap-1.5 shadow-2xs">
                            <CheckCircle2 size={14} className="text-emerald-600" />
                            Nivel {currentTriage.level} · Signos vitales optativos
                          </span>
                        ) : (
                          <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 shrink-0 self-start sm:self-auto">
                            Campos con <span className="text-red-500 font-bold">*</span> son obligatorios
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Banner Informativo para Niveles IV y V con signos optativos */}
                    {(currentTriage.level === 'IV' || currentTriage.level === 'V') && (
                      <div className="p-4 rounded-2xl bg-emerald-50/90 border border-emerald-200 text-emerald-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-emerald-200 text-emerald-800 rounded-xl shrink-0">
                            <CheckCircle2 size={18} />
                          </div>
                          <div>
                            <span className="font-bold text-sm block">
                              Prioridad {currentTriage.priority}: Los signos vitales son completamente optativos.
                            </span>
                            <p className="text-xs text-emerald-800 mt-0.5 font-medium leading-relaxed">
                              Puede continuar directamente a la confirmación sin cargar valores o ingresar únicamente las constantes que considere pertinentes.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setStep(5)}
                          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shrink-0 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                        >
                          Continuar sin signos <ChevronRight size={16} />
                        </button>
                      </div>
                    )}

                    {/* Banner Informativo de Ayuda Clínica para Signos Anormales (Temp, SpO2, Glucemia) */}
                    {abnormalVitalsList.length > 0 && (
                      <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-amber-200 text-amber-900 rounded-xl shrink-0 mt-0.5 md:mt-0">
                            <AlertTriangle size={22} className="animate-pulse" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black uppercase tracking-wider text-amber-900">
                                Signos de Alerta Fisiológica Detectados
                              </span>
                              <span className="text-[10px] font-black bg-amber-200 text-amber-950 px-2 py-0.5 rounded-full">
                                {abnormalVitalsList.length} parámetro(s)
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-amber-900 mt-1 leading-relaxed">
                              {abnormalVitalsList.map(a => `${a.title}: ${a.valStr}`).join(' · ')}. 
                              Estos valores no asignan gravedad automáticamente (excepto SpO2 &lt; 92%, que fuerza al menos Nivel II): asisten al criterio de enfermería para definir el motivo clínico.
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowAbnormalVitalModal(true)}
                          className="w-full md:w-auto px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shrink-0 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-amber-200 active:scale-95"
                        >
                          <AlertTriangle size={15} />
                          ⚠️ Signo Anormal Detectado: Opciones
                        </button>
                      </div>
                    )}

                    {/* Grid de Signos Vitales Físicos */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {(() => {
                        const reqs = getVitalsRequirements();
                        const ageMonths = patient.age !== undefined
                          ? (patient.ageUnit === 'meses' ? patient.age : patient.age * 12)
                          : undefined;

                        const getVitalsAlertInfo = (key: string, val: number | undefined) => {
                          if (val === undefined || val === null || isNaN(val)) return null;
                          
                          if (key === 'heartRate' || key === 'respiratoryRate') {
                            // Los desvíos estándar (DS) de FC y FR se calculan internamente
                            // para asignar el nivel, pero no se muestran en pantalla.
                            return null;
                          }
                          
                          if (key === 'systolicBP') {
                            const effectiveAge = ageMonths !== undefined ? ageMonths : 216;
                            if (effectiveAge >= 216) {
                              if (val < 80 || val >= 180) return { label: 'Crítica (<80 o ≥180)', colorClass: 'bg-red-100 text-red-800 border-red-200 font-extrabold', key: 'critico' };
                              if (val < 90 || val >= 140) return { label: val < 90 ? 'Hipotensión' : 'Hipertensión', colorClass: 'bg-orange-100 text-orange-800 border-orange-200 font-bold', key: 'alto' };
                              if (val >= 121 && val <= 139) return { label: 'Prehipertensión', colorClass: 'bg-yellow-100 text-yellow-800 border-yellow-200 font-bold', key: 'elevado' };
                              return { label: 'Normal', colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200 font-semibold', key: 'normal' };
                            } else {
                              const minPAS = effectiveAge <= 1 ? 60 : effectiveAge <= 12 ? 70 : effectiveAge <= 120 ? 70 + 2 * Math.floor(effectiveAge / 12) : 90;
                              const maxPAS = effectiveAge <= 1 ? 90 : effectiveAge <= 12 ? 100 : effectiveAge <= 60 ? 110 : effectiveAge <= 144 ? 120 : 130;
                              if (val < minPAS - 10 || val > maxPAS + 30) return { label: val < minPAS - 10 ? 'PAS Crítica' : 'PAS Crítica', colorClass: 'bg-red-100 text-red-800 border-red-200 font-extrabold', key: 'critico' };
                              if (val < minPAS || val > maxPAS + 15) return { label: val < minPAS ? 'Hipotensión' : 'PAS Alta', colorClass: 'bg-orange-100 text-orange-800 border-orange-200 font-bold', key: 'alto' };
                              if (val > maxPAS) return { label: 'PAS Elevada', colorClass: 'bg-yellow-100 text-yellow-800 border-yellow-200 font-bold', key: 'elevado' };
                              return { label: 'Normal', colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200 font-semibold', key: 'normal' };
                            }
                          }

                          if (key === 'diastolicBP') {
                            const effectiveAge = ageMonths !== undefined ? ageMonths : 216;
                            if (effectiveAge >= 216) {
                              if (val < 40 || val >= 110) return { label: val < 40 ? 'PAD Crítica (<40)' : 'PAD Crítica (≥110)', colorClass: 'bg-red-100 text-red-800 border-red-200 font-extrabold', key: 'critico' };
                              if (val < 50 || val >= 90) return { label: val < 50 ? 'Hipotensión (<50)' : 'Hipertensión (≥90)', colorClass: 'bg-orange-100 text-orange-800 border-orange-200 font-bold', key: 'alto' };
                              if (val < 60 || (val >= 80 && val <= 89)) return { label: val < 60 ? 'PAD Baja (50-59)' : 'Prehipertensión (80-89)', colorClass: 'bg-yellow-100 text-yellow-800 border-yellow-200 font-bold', key: 'elevado' };
                              return { label: 'Normal (60-79)', colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200 font-semibold', key: 'normal' };
                            } else {
                              const minPAD = effectiveAge <= 12 ? 40 : effectiveAge <= 60 ? 45 : effectiveAge <= 144 ? 55 : 60;
                              const maxPAD = effectiveAge <= 12 ? 60 : effectiveAge <= 60 ? 65 : effectiveAge <= 144 ? 75 : 80;
                              if (val < minPAD - 10 || val > maxPAD + 25) return { label: 'PAD Crítica', colorClass: 'bg-red-100 text-red-800 border-red-200 font-extrabold', key: 'critico' };
                              if (val < minPAD - 5 || val > maxPAD + 10) return { label: val < minPAD - 5 ? 'PAD Muy Baja' : 'PAD Alta', colorClass: 'bg-orange-100 text-orange-800 border-orange-200 font-bold', key: 'alto' };
                              if (val < minPAD || val > maxPAD) return { label: val < minPAD ? 'PAD Baja' : 'PAD Elevada', colorClass: 'bg-yellow-100 text-yellow-800 border-yellow-200 font-bold', key: 'elevado' };
                              return { label: 'Normal', colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200 font-semibold', key: 'normal' };
                            }
                          }

                          if (key === 'oxygenSaturation') {
                            if (val < 92) return { label: 'Crítico (<92%)', colorClass: 'bg-red-100 text-red-800 border-red-200 font-extrabold', key: 'critico' };
                            if (val <= 94) return { label: 'Bajo (92-94%)', colorClass: 'bg-orange-100 text-orange-800 border-orange-200 font-bold', key: 'alto' };
                            if (val === 95) return { label: 'Límite (95%)', colorClass: 'bg-yellow-100 text-yellow-800 border-yellow-200 font-bold', key: 'elevado' };
                            return { label: 'Normal', colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200 font-semibold', key: 'normal' };
                          }

                          if (key === 'temperature') {
                            if (val < 32 || val >= 41) return { label: 'Crítica (<32° o ≥41°)', colorClass: 'bg-red-100 text-red-800 border-red-200 font-extrabold', key: 'critico' };
                            if (val < 35.5 || val >= 38.5) return { label: val < 35.5 ? 'Hipotermia (<35.5°)' : 'Fiebre (≥38.5°)', colorClass: 'bg-orange-100 text-orange-800 border-orange-200 font-bold', key: 'alto' };
                            if (val >= 37.5) return { label: 'Febrícula (37.5-38.4°)', colorClass: 'bg-yellow-100 text-yellow-800 border-yellow-200 font-bold', key: 'elevado' };
                            return { label: 'Normal', colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200 font-semibold', key: 'normal' };
                          }

                          if (key === 'glucose') {
                            if (val < 40 || val > 500) return { label: 'Crítica (<40 o >500)', colorClass: 'bg-red-100 text-red-800 border-red-200 font-extrabold', key: 'critico' };
                            if (val < 60 || val > 250) return { label: val < 60 ? 'Hipoglucemia' : 'Hiperglucemia', colorClass: 'bg-orange-100 text-orange-800 border-orange-200 font-bold', key: 'alto' };
                            if (val < 70 || val > 180) return { label: 'Alterada', colorClass: 'bg-yellow-100 text-yellow-800 border-yellow-200 font-bold', key: 'elevado' };
                            return { label: 'Normal', colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200 font-semibold', key: 'normal' };
                          }

                          return null;
                        };

                        return [
                          { key: 'heartRate', label: 'FC (lpm)', icon: <Activity size={18} /> },
                          { key: 'respiratoryRate', label: 'FR (rpm)', icon: <Timer size={18} /> },
                          { key: 'systolicBP', label: 'PAS (mmHg)', icon: <Activity size={18} /> },
                          { key: 'diastolicBP', label: 'PAD (mmHg)', icon: <Activity size={18} /> },
                          { key: 'oxygenSaturation', label: 'SpO2 (%)', icon: <Info size={18} /> },
                          { key: 'temperature', label: 'T° (°C)', icon: <Stethoscope size={18} /> },
                          { key: 'glucose', label: 'Glucemia (mg/dL)', icon: <Activity size={18} /> },
                        ].map(v => {
                          const isRequired = reqs[v.key as keyof typeof reqs];
                          const val = patient.vitals?.[v.key as keyof VitalSigns] as number | undefined;
                          const dsInfo = getVitalsAlertInfo(v.key, val);

                          const isCritico = dsInfo && (
                            dsInfo.key === 'critico' ||
                            dsInfo.key === 'mayor_mas_2_ds_fuera_tabla' ||
                            dsInfo.key === 'menor_menos_2_ds_fuera_tabla'
                          );
                          const isAlto = dsInfo && (
                            dsInfo.key === 'alto' ||
                            dsInfo.key === 'mas_2_ds' ||
                            dsInfo.key === 'menos_2_ds'
                          );
                          const isElevado = dsInfo && (
                            dsInfo.key === 'elevado' ||
                            dsInfo.key === 'mas_1_ds' ||
                            dsInfo.key === 'menos_1_ds'
                          );
                          const isSinEdad = dsInfo && dsInfo.key === 'sin_edad';

                          const cardBgClass = isCritico ? "bg-rose-50/80 border-rose-300 shadow-md ring-1 ring-rose-300/40" :
                                              isAlto ? "bg-orange-50/80 border-orange-300 shadow-xs ring-1 ring-orange-300/30" :
                                              isElevado ? "bg-yellow-50/80 border-yellow-300 shadow-xs" :
                                              isSinEdad ? "bg-amber-50/40 border-amber-200" :
                                              "bg-slate-50 border-slate-200 shadow-sm";

                          const inputBorderClass = isCritico ? "border-rose-300 focus:ring-rose-400 focus:border-rose-400" :
                                                   isAlto ? "border-orange-300 focus:ring-orange-400 focus:border-orange-400" :
                                                   isElevado ? "border-yellow-300 focus:ring-yellow-400 focus:border-yellow-400" :
                                                   "border-slate-300 focus:ring-blue-500 focus:border-blue-500";

                          return (
                            <div key={v.key} className={cn("space-y-2 relative flex flex-col justify-between p-3.5 rounded-2xl transition-all duration-300 border", cardBgClass)}>
                              <div className="space-y-2">
                                <label className="text-[11px] md:text-xs font-black text-slate-650 flex items-center justify-between gap-1.5 uppercase tracking-wide">
                                  <span className="flex items-center gap-1.5">{v.icon} {v.label} {isRequired ? <span className="text-red-500 font-black">*</span> : <span className="text-slate-400 font-medium text-[10px] lowercase">(opcional)</span>}</span>
                                  {dsInfo && val !== undefined && (
                                    <span className={cn("text-[11px] font-black uppercase px-2.5 py-1 rounded-full border shadow-xs animate-pulse", dsInfo.colorClass)}>
                                      {dsInfo.label}
                                    </span>
                                  )}
                                </label>
                                <div className="relative flex items-center">
                                  <input 
                                    type="number" 
                                    step={v.key === 'temperature' ? 0.1 : 1}
                                    className={cn(
                                      "w-full p-3 rounded-xl border outline-none text-base font-black text-slate-800 shadow-sm placeholder:text-slate-400 bg-white transition-all duration-300", 
                                      inputBorderClass,
                                      val !== undefined && "pr-9"
                                    )}
                                    placeholder={isRequired ? "---" : "--- (opcional)"}
                                    value={patient.vitals![v.key as keyof VitalSigns] ?? ''}
                                    onChange={e => {
                                      const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                                      setPatient({
                                        ...patient, 
                                        vitals: { ...patient.vitals!, [v.key]: val }
                                      });
                                    }}
                                  />
                                  {val !== undefined && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPatient({
                                          ...patient,
                                          vitals: { ...patient.vitals!, [v.key]: undefined }
                                        });
                                      }}
                                      className="absolute right-2.5 p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition-all cursor-pointer"
                                      title={`Borrar valor de ${v.label}`}
                                    >
                                      <X size={15} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>

                    {/* Clasificación neurológica AVPU */}
                    <div className="p-6 border border-slate-200 rounded-3xl bg-white space-y-6 shadow-sm mt-6">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <div className="flex items-center gap-2.5">
                          <ShieldAlert size={20} className="text-purple-600" />
                          <h3 className="font-extrabold text-slate-900 text-base md:text-lg">Clasificación neurológica AVPU</h3>
                        </div>
                        <span className="text-xs font-bold text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-200 uppercase tracking-wide">
                          {patient.vitals?.avpu === 'A' ? 'Alerta' :
                           patient.vitals?.avpu === 'V' ? 'Verbal' :
                           patient.vitals?.avpu === 'P' ? 'Dolor' :
                           patient.vitals?.avpu === 'U' ? 'Inconsciente' : 'Sin evaluar'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                          {
                            value: 'A',
                            letter: 'A',
                            name: 'Alerta',
                            desc: 'El paciente está despierto, consciente del entorno, responde espontáneamente y mantiene una conversación.'
                          },
                          {
                            value: 'V',
                            letter: 'V',
                            name: 'Verbal',
                            desc: 'El paciente no está completamente despierto, pero abre los ojos, habla o se mueve al hablarle o pedirle que lo haga.'
                          },
                          {
                            value: 'P',
                            letter: 'P',
                            name: 'Dolor',
                            desc: 'No responde a estímulos verbales, pero reacciona —gime, se mueve o retira— ante un estímulo doloroso, como un pellizco.'
                          },
                          {
                            value: 'U',
                            letter: 'U',
                            name: 'Inconsciente',
                            desc: 'No muestra ningún tipo de respuesta, ni verbal ni motora, ante ningún estímulo.'
                          }
                        ].map(opt => {
                          const isSelected = patient.vitals?.avpu === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setPatient({
                                ...patient,
                                vitals: { ...patient.vitals!, avpu: opt.value }
                              })}
                              className={cn(
                                "p-4 rounded-2xl border text-left transition-all cursor-pointer shadow-sm flex flex-col justify-between space-y-3 relative overflow-hidden group select-none hover:border-purple-300",
                                isSelected
                                  ? "bg-purple-50 border-purple-400 ring-2 ring-purple-600/20"
                                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50/50"
                              )}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className={cn(
                                  "w-9 h-9 rounded-xl flex items-center justify-center font-black text-base transition-all",
                                  isSelected ? "bg-purple-600 text-white shadow-sm shadow-purple-500/20" : "bg-purple-50 text-purple-600"
                                )}>
                                  {opt.letter}
                                </span>
                                <span className={cn(
                                  "text-xs font-black uppercase tracking-wider",
                                  isSelected ? "text-purple-700" : "text-slate-400"
                                )}>
                                  {opt.name}
                                </span>
                              </div>
                              <p className={cn(
                                "text-xs leading-relaxed font-medium",
                                isSelected ? "text-purple-950 font-semibold" : "text-slate-500"
                              )}>
                                {opt.desc}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === 5 && (
                  <motion.div
                    key="step5"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-8 text-center"
                  >
                    <div className="inline-flex flex-col items-center">
                      <div className={cn(
                        "w-36 h-36 rounded-full flex items-center justify-center mb-4 shadow-2xl animate-pulse border-4 border-white",
                        currentTriage.level === 'I' ? "bg-red-600 text-white" :
                        currentTriage.level === 'II' ? "bg-orange-500 text-white" :
                        currentTriage.level === 'III' ? "bg-yellow-400 text-slate-900" :
                        currentTriage.level === 'IV' ? "bg-green-500 text-white" :
                        "bg-blue-500 text-white"
                      )}>
                        <span className="text-7xl font-black">{currentTriage.level}</span>
                      </div>
                      <h2 className={cn(
                        "text-4xl font-black mb-3 tracking-tight",
                        currentTriage.level === 'I' ? "text-red-600" :
                        currentTriage.level === 'II' ? "text-orange-600" :
                        currentTriage.level === 'III' ? "text-yellow-600" :
                        currentTriage.level === 'IV' ? "text-green-600" :
                        "text-blue-600"
                      )}>
                        {currentTriage.priority}
                      </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl mx-auto">
                      <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200/70 shadow-sm">
                        <p className="text-sm font-black text-slate-500 uppercase mb-1.5 tracking-wider">Tiempo de Atención</p>
                        <p className="text-xl font-black text-slate-800">{currentTriage.wait}</p>
                      </div>
                      <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200/70 shadow-sm">
                        <p className="text-sm font-black text-slate-500 uppercase mb-1.5 tracking-wider">Destino Sugerido</p>
                        <p className="text-xl font-black text-slate-800">{currentTriage.destination}</p>
                      </div>
                    </div>

                    <div className="bg-slate-900 text-white p-6 rounded-[24px] border border-slate-800 text-left space-y-4 shadow-xl">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <h3 className="font-extrabold text-base flex items-center gap-2 text-white">
                          <FileText size={20} className="text-blue-400" />
                          Resumen para HC Electrónica
                        </h3>
                        <button 
                          onClick={() => navigator.clipboard.writeText(getSummaryText(patient as PatientData))}
                          className="text-xs md:text-sm bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl transition-all font-bold tracking-wide cursor-pointer text-slate-100 uppercase border border-slate-700"
                        >
                          Copiar Texto
                        </button>
                      </div>
                      <pre className="text-xs md:text-sm font-mono text-slate-900 whitespace-pre-wrap bg-white p-5 rounded-2xl border border-slate-700 leading-relaxed max-h-[300px] overflow-y-auto shadow-inner">
                        {getSummaryText(patient as PatientData)}
                      </pre>
                    </div>
                    {/* Panel de Modificación Directa para Deshacer / Corregir */}
                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-left shadow-2xs">
                      <div>
                        <span className="text-xs font-black uppercase text-slate-700 tracking-wider block">
                          ¿Querés revisar, modificar o deshacer algo antes de guardar?
                        </span>
                        <span className="text-xs text-slate-500 font-medium mt-0.5 block">
                          Podés volver directamente a cualquier sección haciendo clic en su botón:
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setStep(1)}
                          className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <User size={13} className="text-blue-600" /> 1. Filiación
                        </button>
                        <button
                          type="button"
                          onClick={() => setStep(2)}
                          className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Stethoscope size={13} className="text-blue-600" /> 2. TEP
                        </button>
                        <button
                          type="button"
                          onClick={() => setStep(3)}
                          className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Activity size={13} className="text-blue-600" /> 3. Motivo
                        </button>
                        <button
                          type="button"
                          onClick={() => setStep(4)}
                          className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Heart size={13} className="text-blue-600" /> 4. Signos
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {validationError && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl font-bold flex items-center gap-3">
                  <AlertCircle size={22} className="text-red-600 shrink-0" />
                  <span className="text-sm font-semibold">{validationError}</span>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-4 mt-12 pt-8 border-t border-slate-150">
                {step > 1 && (
                  <button 
                    onClick={handleBack}
                    className="flex items-center gap-2 px-6 py-3.5 rounded-xl font-black text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-all text-base border border-slate-200 active:border-slate-300 cursor-pointer shadow-2xs"
                  >
                    <ChevronLeft size={22} /> Atrás
                  </button>
                )}
                <div className="flex-1" />
                {currentTriage.level === 'I' && step < 5 ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleUndoCurrentStep}
                      className="flex items-center gap-1.5 px-4 py-3.5 rounded-xl font-bold text-slate-700 bg-white hover:bg-slate-100 text-sm transition-all cursor-pointer border border-slate-200 shadow-2xs"
                      title="Deshacer selecciones o campos de este paso"
                    >
                      <RotateCcw size={16} className="text-rose-600" />
                      Deshacer este paso
                    </button>
                    {isStepValid() && (
                      <button
                        type="button"
                        onClick={handleNext}
                        className="flex items-center gap-1.5 px-5 py-3.5 rounded-xl font-bold text-slate-700 hover:bg-slate-100 text-sm transition-all cursor-pointer border border-slate-300"
                        title="Continuar documentando signos o problemas"
                      >
                        Continuar evaluación <ChevronRight size={18} />
                      </button>
                    )}
                    <button 
                      onClick={handleImmediateShockRoom}
                      className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-7 py-3.5 rounded-xl font-black text-base shadow-xl shadow-red-200 animate-pulse transition-all cursor-pointer select-none active:scale-95"
                    >
                      <Zap size={20} />
                      🚨 Ingresar a Shock Room (Nivel I)
                    </button>
                  </div>
                ) : step < 5 ? (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleUndoCurrentStep}
                      className="flex items-center gap-1.5 px-4 py-3.5 rounded-xl font-bold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 text-sm transition-all cursor-pointer border border-slate-200 shadow-2xs"
                      title="Deshacer selecciones o valores ingresados en este paso"
                    >
                      <RotateCcw size={15} />
                      Deshacer paso
                    </button>
                    <button 
                      onClick={handleNext}
                      disabled={!isStepValid()}
                      className="flex items-center gap-2 bg-blue-600 text-white px-10 py-3.5 rounded-xl font-black text-base shadow-xl shadow-blue-200/70 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed select-none cursor-pointer"
                    >
                      Siguiente <ChevronRight size={22} />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleUndoCurrentStep}
                      className="flex items-center gap-1.5 px-4 py-3.5 rounded-xl font-bold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 text-sm transition-all cursor-pointer border border-slate-200 shadow-2xs"
                      title="Volver al paso de signos vitales para modificar o deshacer datos"
                    >
                      <RotateCcw size={15} />
                      Deshacer / Volver a Signos
                    </button>
                    <button 
                      onClick={() => setStep(1)}
                      className="px-6 py-3.5 rounded-xl font-black text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-all text-base cursor-pointer border border-slate-200"
                    >
                      Editar Formularios
                    </button>
                    <button 
                      onClick={finalizeTriage}
                      className="flex items-center gap-2 bg-green-600 text-white px-10 py-3.5 rounded-xl font-black text-base shadow-xl shadow-green-200 hover:bg-green-700 transition-all cursor-pointer"
                    >
                      {editingRecord ? 'Guardar corrección' : 'Finalizar Registro'} <CheckCircle2 size={22} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* Sidebar: History & Timers */}
        <aside className="space-y-6 w-full lg:sticky lg:top-[24px] lg:self-start">
          {/* Sync Status Notifications inside Sidebar */}
          {dbSuccessMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-green-50 border border-green-200 text-green-800 text-[10px] rounded-xl font-bold flex items-center gap-2"
            >
              <CheckCircle2 size={13} className="text-green-600 shrink-0" />
              <span>{dbSuccessMessage}</span>
            </motion.div>
          )}

          {dbErrorMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-red-50 border border-red-200 text-red-800 text-[10px] rounded-xl font-bold flex items-center gap-2"
            >
              <AlertCircle size={13} className="text-red-600 shrink-0" />
              <span>{dbErrorMessage}</span>
            </motion.div>
          )}

          {/* Real-time Triage Gravity Level & Live Timer Monitor */}
          <div className="bg-white p-6 sm:p-7 rounded-[24px] border border-slate-200/85 shadow-[0_12px_32px_rgba(15,23,42,0.08)] space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="space-y-0.5">
                <h3 className="font-bold text-slate-900 text-sm md:text-base flex items-center gap-2">
                  <Activity size={18} className="text-blue-600 animate-pulse" />
                  Paciente en Evaluación
                </h3>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Monitoreo Clínico de Sesión
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={cn(
                  "w-2 h-2 rounded-full transition-all duration-500",
                  isOnline && supabaseConnected 
                    ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" 
                    : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                )} />
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-wider",
                  isOnline && supabaseConnected ? "text-emerald-600" : "text-rose-500"
                )}>
                  {isOnline && supabaseConnected ? 'En Línea' : 'Local'}
                </span>
              </div>
            </div>

            {(() => {
              const currentLevel = currentTriage.level; // I, II, III, IV, V
              const levelsInfo: Record<TriageLevel, { bg: string; border: string; text: string; name: string; targetMin: number; wait: string; complement: string; desc: string }> = {
                'I': { 
                  bg: 'bg-red-50 text-red-600', 
                  border: 'border-red-200',
                  text: 'text-red-700', 
                  name: 'CTAS I · Resucitación', 
                  targetMin: 0,
                  wait: 'Atención Inmediata',
                  complement: 'Reevaluación continua',
                  desc: 'Riesgo vital inminente. Requiere abordaje inmediato en Shock Room.'
                },
                'II': { 
                  bg: 'bg-orange-50 text-orange-600', 
                  border: 'border-orange-200',
                  text: 'text-orange-750', 
                  name: 'CTAS II · Emergencia', 
                  targetMin: 15,
                  wait: 'Espera Máxima: 15 min',
                  complement: 'Reevaluación cada 15 min',
                  desc: 'Inestabilidad hemodinámica sospechada o potencial. Box de Emergencias.'
                },
                'III': { 
                  bg: 'bg-yellow-50 text-yellow-850', 
                  border: 'border-yellow-200',
                  text: 'text-yellow-800', 
                  name: 'CTAS III · Urgente', 
                  targetMin: 30,
                  wait: 'Espera Máxima: 30 min',
                  complement: 'Reevaluación cada 30 min',
                  desc: 'Condición aguda estable con riesgo potencial. Consultorio de Urgencias.'
                },
                'IV': { 
                  bg: 'bg-green-50 text-green-750', 
                  border: 'border-green-200',
                  text: 'text-green-700', 
                  name: 'CTAS IV · Menos Urgente', 
                  targetMin: 60,
                  wait: 'Espera Máxima: 60 min',
                  complement: 'Reevaluación cada 60 min',
                  desc: 'Condiciones médicas generales estables. Consultorio General.'
                },
                'V': { 
                  bg: 'bg-blue-50 text-blue-700', 
                  border: 'border-blue-200',
                  text: 'text-blue-600', 
                  name: 'CTAS V · No Urgente', 
                  targetMin: 120,
                  wait: 'Espera Máxima: 120 min',
                  complement: 'Reevaluación cada 120 min',
                  desc: 'Consulta ambulatoria de baja complejidad. Consulta Externa.'
                }
              };

              const active = levelsInfo[currentLevel] || levelsInfo['V'];
              const urgencyAnimation = currentLevel === 'I' ? 'animate-ctas-critical' : currentLevel === 'II' ? 'animate-ctas-emergent' : '';
              
              // Calculate dynamic elapsed time in seconds/minutes
              const arrivalTime = patient.arrivalDate ? new Date(patient.arrivalDate) : new Date();
              const diffMs = Math.max(0, currentTime.getTime() - arrivalTime.getTime());
              const diffSec = Math.floor(diffMs / 1000);
              const elapsedMin = Math.floor(diffSec / 60);
              const elapsedSecStr = String(diffSec % 60).padStart(2, '0');
              const elapsedStr = `${elapsedMin}:${elapsedSecStr}`;
              
              // Determine if objective exceeded
              const isTimeExceeded = active.targetMin > 0 && elapsedMin >= active.targetMin;

              return (
                <div className="space-y-5">
                  {/* Two-Column Grid: Gravity vs Elapsed Time */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Column 1: Gravity Indicator */}
                    <div className={cn(
                      "p-4 rounded-2xl border flex flex-col justify-between transition-all duration-300 min-h-[145px]",
                      active.bg,
                      active.border,
                      urgencyAnimation
                    )}>
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold tracking-wider uppercase text-slate-500 block">NIVEL</span>
                        <div className="flex items-center gap-2.5">
                          <span className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-bold text-2xl text-slate-900 shadow-xs tracking-tight">
                            {currentLevel}
                          </span>
                          <span className="font-bold text-sm leading-tight text-slate-900 line-clamp-2">
                            {active.name.split(' · ')[1]}
                          </span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-black/5 mt-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">TIEMPO OBJETIVO</p>
                        <p className="text-xs font-bold text-slate-800 leading-none mt-1">{active.wait}</p>
                      </div>
                    </div>

                    {/* Column 2: Elapsed Time Clock */}
                    <div className={cn(
                      "p-4 rounded-2xl border flex flex-col justify-between transition-all duration-300 min-h-[145px]",
                      isTimeExceeded 
                        ? "bg-rose-50 border-rose-300 shadow-md shadow-rose-100" 
                        : "bg-slate-50 border-slate-200"
                    )}>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold tracking-wider uppercase text-slate-500">TRANSCURRIDO</span>
                          <Clock size={13} className={cn(isTimeExceeded ? "text-rose-600 animate-spin" : "text-slate-400")} />
                        </div>
                        <div className="text-3xl font-bold tabular-nums tracking-tight text-slate-900">
                          {elapsedStr}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200 mt-2">
                        {isTimeExceeded ? (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-red-700 animate-pulse bg-red-100 p-1.5 rounded-lg border border-red-200">
                            <ShieldAlert size={12} className="shrink-0" />
                            <span>¡ALERTA: TIEMPO EXCEDIDO!</span>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              <span>PROGRESO</span>
                              <span className="tabular-nums font-semibold">{elapsedMin} / {active.targetMin || '∞'} MIN</span>
                            </div>
                            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" 
                                style={{ width: active.targetMin > 0 ? `${Math.min(100, (elapsedMin / active.targetMin) * 100)}%` : '100%' }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Level dots representing the scale of gravity CTAS */}
                  <div className="space-y-2.5 pt-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Progreso / Escala de Gravedad CTAS:</div>
                    <div className="relative">
                      {/* Bar back */}
                      <div className="absolute top-[16px] left-3 right-3 h-0.5 bg-slate-200/80 -z-10" />
                      <div className="grid grid-cols-5 gap-1.5 z-10 relative">
                        {(['I', 'II', 'III', 'IV', 'V'] as const).map((lvl) => {
                          const isActive = lvl === currentLevel;
                          const dotColor = lvl === 'I' ? 'bg-red-500 text-white animate-pulse ring-4 ring-red-100' 
                            : lvl === 'II' ? 'bg-orange-500 text-white animate-pulse ring-4 ring-orange-100' 
                            : lvl === 'III' ? 'bg-amber-400 text-slate-900 ring-4 ring-amber-100' 
                            : lvl === 'IV' ? 'bg-emerald-500 text-white ring-4 ring-emerald-100' 
                            : 'bg-blue-500 text-white ring-4 ring-blue-100';
                          return (
                            <div key={lvl} className="flex flex-col items-center">
                              <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs tracking-tight transition-all shadow-xs",
                                isActive 
                                  ? `${dotColor} scale-110 shadow-md`
                                  : "bg-slate-100 text-slate-500 hover:text-slate-700 hover:bg-slate-200/80 cursor-pointer"
                              )}>
                                {lvl}
                              </div>
                              <span className={cn(
                                "text-[10px] mt-1.5 font-semibold tracking-normal leading-tight", 
                                isActive ? "text-slate-900 font-bold" : "text-slate-400"
                              )}>
                                {lvl === 'I' ? 'Resuc.' : lvl === 'II' ? 'Emerg.' : lvl === 'III' ? 'Urgent.' : lvl === 'IV' ? 'P.Urg.' : 'No Urg.'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Description Box */}
                  <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs sm:text-sm text-slate-600 leading-relaxed font-semibold">
                    {active.desc}
                  </div>
                </div>
              );
            })()}

            <button 
              onClick={() => {
                setEditingRecord(null);
                setShowCorrectionModal(false);
                setPatient(createCleanPatient());
                setStep(1);
                setMaxStepReached(1);
                setTepAlertDismissed(false);
                setTepAlertLevelShown(0);
                setShowAlertModal(false);
                setShowAbnormalVitalModal(false);
                setShowFindingsAlert(false);
                setFindingsAlertDismissed(false);
                setShowAgeWarningModal(false);
                setShowSpecifics({ apariencia: false, respiracion: false, circulacion: false });
                setFindingSearchQuery('');
                setValidationError(null);
              }}
              className="w-full mt-4 py-3 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-base font-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95"
            >
              <Plus size={18} /> Nuevo Triaje
            </button>
          </div>

          {/* Pacientes en Espera */}
          <div className="w-full min-w-0 bg-white p-5 rounded-2xl border border-slate-200/70 shadow-[0_10px_28px_rgba(15,23,42,0.10)] space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2 text-slate-950">
                <Timer size={20} className="text-blue-600" />
                <span>Pacientes en Espera</span>
                {isSupabaseConfigured && (
                  <span className={cn(
                    "w-2 h-2 rounded-full ml-1 transition-colors duration-500",
                    isOnline && supabaseConnected ? "bg-emerald-500 animate-pulse text-emerald-500" : "bg-rose-500 text-rose-500"
                  )} title={isOnline && supabaseConnected ? "Conectado a Supabase" : "Desconectado de Supabase"} />
                )}
              </h2>
              <div className="flex items-center gap-1.5">
                {history.length > 0 && (
                  <button
                    onClick={exportToCSV}
                    title="Exportar historial a Excel (CSV)"
                    className="flex items-center gap-1 p-1 px-2.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border border-emerald-200/60 bg-white shadow-xs transition-colors text-xs font-bold cursor-pointer"
                  >
                    <FileSpreadsheet size={14} className="text-emerald-600 shrink-0" />
                    <span className="hidden sm:inline">Exportar Excel</span>
                  </button>
                )}
                {isSupabaseConfigured && (
                  <button
                    onClick={triggerManualSync}
                    disabled={isSyncing}
                    title="Sincronizar base de datos remota"
                    className="p-1 px-2 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw size={14} className={cn(isSyncing && "animate-spin")} />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 max-h-[520px] xl:max-h-[560px] overflow-y-auto pr-1 flex flex-col gap-2">
              {history.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <p className="text-sm italic font-medium">No hay pacientes registrados</p>
                </div>
              ) : (
                history.map(p => {
                  const minutesIn = differenceInMinutes(currentTime, new Date(p.arrivalDate));
                  const hoursIn = differenceInHours(currentTime, new Date(p.arrivalDate));
                  
                  // Alert logic: 4h for Level I/II (Resuscitation/Emergency), 12h for Level III (Urgent)
                  const isAlert = ((p.triageLevel === 'I' || p.triageLevel === 'II') && hoursIn >= 4) || 
                                  (p.triageLevel === 'III' && hoursIn >= 12);

                  return (
                    <div 
                      key={p.id} 
                      className={cn(
                        "w-full rounded-xl border px-3 py-2.5 shadow-[0_3px_10px_rgba(15,23,42,0.05)] transition-all",
                        isAlert 
                          ? "bg-red-50 border-red-300 animate-pulse text-red-950" 
                          : "bg-slate-50/80 border-slate-200/70 hover:border-slate-350"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1.5 text-left">
                          {/* Badge CTAS */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={cn(
                              "text-[10px] font-semibold px-2 py-0.5 rounded-full text-white shadow-xs uppercase tracking-wide shrink-0",
                              p.triageLevel === 'I' ? "bg-red-650" :
                              p.triageLevel === 'II' ? "bg-orange-500" :
                              p.triageLevel === 'III' ? "bg-yellow-500 text-slate-900" :
                              p.triageLevel === 'IV' ? "bg-green-600" :
                              "bg-blue-600"
                            )}>
                              NIVEL {p.triageLevel}
                            </span>
                            {(p.correcciones?.length ?? 0) > 0 && (
                              <span
                                className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-200 uppercase tracking-wide"
                                title={(p.correcciones || []).map(c =>
                                  `${format(new Date(c.fecha), 'dd/MM HH:mm')} · ${c.corregidoPorNombre || 'Usuario'} · Nivel ${['','I','II','III','IV','V'][c.nivelPrevio]} → ${['','I','II','III','IV','V'][c.nivelNuevo]} · ${c.motivo}`
                                ).join('\n')}
                              >
                                Corregido ({p.correcciones!.length})
                              </span>
                            )}
                          </div>

                          {/* Nombre */}
                          <p className="text-base font-semibold leading-tight text-slate-900 truncate" title={p.name}>
                            {p.name}
                          </p>
                        </div>

                        {/* Identificador / ID */}
                        <div className="shrink-0 text-right">
                          <span className="text-xs font-medium text-slate-400 font-mono" title={p.id}>{p.id.slice(0, 8).toUpperCase()}</span>
                        </div>
                      </div>

                      {/* Bottom Row: tiempo y boton descarga */}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className={cn(
                          "flex items-center gap-1 text-sm leading-none font-medium", 
                          isAlert ? "text-red-750 animate-pulse font-semibold" : "text-slate-550"
                        )}>
                          <Clock size={13} className={isAlert ? "text-red-600 shrink-0" : "text-slate-440 shrink-0"} />
                          <span className="leading-none">
                            {hoursIn}h {minutesIn % 60}m
                          </span>
                        </div>

                        <div className="flex gap-1 shrink-0">
                          {puedeCorregir(p) && !editingRecord && (
                            <button
                              onClick={() => startCorrection(p)}
                              className="flex items-center gap-1 p-1 px-2 bg-white hover:bg-violet-50 rounded-lg border border-slate-200 text-slate-600 hover:text-violet-700 hover:border-violet-300 transition-all cursor-pointer text-xs font-bold"
                              title="Corregir clasificación (queda registrado)"
                            >
                              <Edit3 size={13} /> Corregir
                            </button>
                          )}
                          <button 
                            onClick={() => generatePDF(p)}
                            className="p-1 px-1.5 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-300 transition-all cursor-pointer"
                            title="Descargar PDF"
                          >
                            <Download size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {showAlertModal && (
          <motion.div
            key="pediatric-tep-alert-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl overflow-hidden shadow-2xl max-w-lg w-full border border-slate-100"
            >
              {/* Encabezado: Rojo para 3 lados (Nivel I), Naranja para 2 lados (Nivel II) */}
              <div className={cn(
                "p-6 text-white flex items-center gap-3",
                tepModalLevel === 3 ? "bg-red-600" : "bg-orange-500"
              )}>
                <div className="p-2 bg-white/25 rounded-2xl">
                  <AlertCircle size={28} className="text-white animate-pulse" />
                </div>
                <div>
                  <span className="text-[10px] font-black tracking-widest uppercase text-white/80 block">
                    {tepModalLevel === 3 ? '🚨 ALERTA CRÍTICA · NIVEL I' : '⚠️ ALERTA DE EMERGENCIA · NIVEL II'}
                  </span>
                  <h3 className="text-base font-black tracking-tight uppercase">
                    {tepModalLevel === 3 ? 'TEP: 3 LADOS ALTERADOS (RESUCITACIÓN)' : 'TEP: 2 LADOS ALTERADOS (EMERGENCIA)'}
                  </h3>
                </div>
              </div>

              {/* Mensaje Central */}
              <div className="p-6 space-y-4">
                <div className={cn(
                  "p-4 border rounded-2xl",
                  tepModalLevel === 3 ? "bg-red-50 border-red-200 text-red-950" : "bg-orange-50 border-orange-200 text-orange-950"
                )}>
                  <p className="text-sm font-bold leading-relaxed">
                    {tepModalLevel === 3
                      ? 'Se alteraron los 3 lados del TEP. El paciente se clasifica en Nivel I (Rojo). Requiere pase prioritario directo a Shock Room.'
                      : 'Se alteraron 2 lados del TEP. El paciente se clasifica en Nivel II (Naranja · Emergencia, atención en ≤ 15 min).'}
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Lados alterados identificados ({tepModalLevel}):</span>
                  <div className="flex flex-wrap gap-2">
                    {getTepLadosList(patient).map((lado, idx) => (
                      <span key={idx} className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl border border-slate-200 flex items-center gap-1.5 justify-center">
                        <span className={cn("w-2 h-2 rounded-full animate-ping", tepModalLevel === 3 ? "bg-red-500" : "bg-orange-500")} /> {lado}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Acciones */}
              <div className="bg-slate-50 px-6 py-4 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setPatient(p => ({
                      ...p,
                      tep: createCleanTep(),
                      tepStates: { apariencia: 'normal', respiracion: 'normal', circulacion: 'normal' }
                    }));
                    setShowSpecifics({ apariencia: false, respiracion: false, circulacion: false });
                    setTepAlertDismissed(false);
                    setTepAlertLevelShown(0);
                    setShowAlertModal(false);
                  }}
                  className="px-4 py-3 rounded-xl text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 font-bold text-xs tracking-wide transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RotateCcw size={15} className="text-rose-600" />
                  Deshacer TEP (Volver a Normal)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAlertModal(false);
                    setTepAlertLevelShown(tepModalLevel);
                  }}
                  className="px-5 py-3 rounded-xl text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 font-bold text-xs tracking-wide transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  Revisar / Modificar selecciones
                </button>
                {tepModalLevel === 3 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAlertModal(false);
                      setTepAlertLevelShown(3);
                      setStep(5);
                    }}
                    className="px-6 py-3 rounded-xl text-white bg-red-600 hover:bg-red-700 font-black text-sm tracking-wide transition-all shadow-lg shadow-red-200 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Zap size={16} />
                    Ingresar a Shock Room Ahora
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAlertModal(false);
                      setTepAlertLevelShown(2);
                    }}
                    className="px-6 py-3 rounded-xl text-white bg-orange-500 hover:bg-orange-600 font-black text-sm tracking-wide transition-all shadow-lg shadow-orange-200 active:scale-95 cursor-pointer"
                  >
                    Aceptar / Continuar evaluación
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Modal de Signos Anormales Detectados (Temp, SpO2, Glucemia) */}
        {showAbnormalVitalModal && (
          <motion.div
            key="abnormal-vitals-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl overflow-hidden shadow-2xl max-w-xl w-full border border-slate-100"
            >
              {/* Header */}
              <div className="bg-amber-500 p-6 text-white flex items-center gap-3">
                <div className="p-2 bg-white/25 rounded-2xl">
                  <AlertTriangle size={28} className="text-white animate-pulse" />
                </div>
                <div>
                  <span className="text-[10px] font-black tracking-widest uppercase text-white/90 block">
                    Ayuda Clínica al Profesional
                  </span>
                  <h3 className="text-base font-black tracking-tight uppercase">
                    ⚠️ Signos Anormales Detectados
                  </h3>
                </div>
              </div>

              {/* Contenido */}
              <div className="p-6 space-y-4">
                <p className="text-sm font-medium text-slate-700 leading-relaxed">
                  Se han registrado constantes fisiológicas fuera de rango estándar. Conforme a las directrices clínicas, la <strong>Temperatura, SpO2 y Glucemia no asignan gravedad automáticamente</strong>: es el problema clínico seleccionado por enfermería el que define el nivel de triaje.
                </p>

                <div className="space-y-2.5">
                  {abnormalVitalsList.map((item, idx) => (
                    <div key={idx} className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-amber-900 uppercase tracking-wide">
                          {item.title}
                        </span>
                        <span className="text-xs font-bold tabular-nums bg-amber-200 text-amber-950 px-2.5 py-0.5 rounded-lg">
                          {item.valStr}
                        </span>
                      </div>
                      <p className="text-xs text-amber-900 font-medium">
                        {item.text}
                      </p>
                      <p className="text-xs text-slate-600 font-semibold bg-white p-2 rounded-xl border border-amber-100 mt-1">
                        💡 <strong>Sugerencia clínica:</strong> {item.suggestionDesc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Acciones */}
              <div className="bg-slate-50 p-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPatient(p => ({
                      ...p,
                      vitals: {
                        ...p.vitals!,
                        temperature: undefined,
                        oxygenSaturation: undefined,
                        glucose: undefined
                      }
                    }));
                    setShowAbnormalVitalModal(false);
                  }}
                  className="w-full sm:w-auto px-4 py-3 rounded-xl border border-rose-300 text-rose-700 hover:bg-rose-50 font-bold text-xs tracking-wide transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <RotateCcw size={14} />
                  Deshacer valores anormales
                </button>
                <button
                  type="button"
                  onClick={() => setShowAbnormalVitalModal(false)}
                  className="w-full sm:w-auto px-5 py-3 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs tracking-wide transition-all cursor-pointer text-center"
                >
                  Continuar con el mismo motivo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAbnormalVitalModal(false);
                    const firstSuggestion = abnormalVitalsList[0]?.suggestionSystem;
                    if (firstSuggestion) {
                      setSelectedSystemId(firstSuggestion);
                    }
                    setStep(3);
                  }}
                  className="w-full sm:w-auto px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs tracking-wide transition-all shadow-md shadow-blue-200 flex items-center justify-center gap-1.5 cursor-pointer text-center active:scale-95"
                >
                  <Stethoscope size={16} />
                  Revisar / Cambiar Motivo Clínico (Paso 3)
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showAgeWarningModal && (
          <motion.div
            key="pediatric-age-warning-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl overflow-hidden shadow-2xl max-w-md w-full border border-slate-100"
            >
              {/* Encabezado: Color de fondo Ámbar/Naranja, Icono de Alerta de Escudo (ShieldAlert) y texto */}
              <div className="bg-amber-500 p-6 text-slate-950 flex items-center gap-3">
                <div className="p-2 bg-white/25 rounded-2xl">
                  <ShieldAlert size={28} className="text-slate-950 animate-bounce" />
                </div>
                <div>
                  <span className="text-[10px] font-black tracking-widest uppercase text-slate-900/80 block">Límite de Edad Pediátrico</span>
                  <h3 className="text-base font-black tracking-tight uppercase">
                    Advertencia de Edad
                  </h3>
                </div>
              </div>

              {/* Mensaje Central */}
              <div className="p-6 space-y-4 text-left">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
                  <p className="text-sm font-bold text-amber-950 leading-relaxed">
                    Edad fuera del rango pediátrico. Esta herramienta está configurada para triaje pediátrico. Verifique la edad ingresada.
                  </p>
                </div>
              </div>

              {/* Acciones */}
              <div className="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAgeWarningModal(false)}
                  className="px-5 py-2.5 rounded-xl text-white bg-amber-500 hover:bg-amber-600 font-bold text-sm tracking-wide transition-all shadow-lg shadow-amber-200 active:scale-95 cursor-pointer"
                >
                  Entendido
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showCorrectionModal && editingRecord && (
          <motion.div
            key="correction-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-3xl overflow-hidden shadow-2xl max-w-lg w-full border border-slate-100"
            >
              <div className="p-6 bg-violet-600 text-white flex items-center gap-3">
                <div className="p-2 bg-white/25 rounded-2xl"><Edit3 size={24} /></div>
                <div>
                  <span className="text-[10px] font-black tracking-widest uppercase text-white/80 block">Corrección de triaje</span>
                  <h3 className="text-base font-black tracking-tight">{editingRecord.name}</h3>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-center gap-4 text-sm font-black">
                  <span className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200">Nivel {editingRecord.triageLevel}</span>
                  <ChevronRight size={20} className="text-slate-400" />
                  <span className="px-3 py-1.5 rounded-xl bg-violet-100 text-violet-900 border border-violet-300">Nivel {currentTriage.level}</span>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="motivo-correccion" className="text-sm font-black text-slate-800">
                    Motivo de la corrección <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="motivo-correccion"
                    autoFocus
                    className="w-full p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-violet-500 outline-none min-h-[90px] text-sm font-semibold text-slate-800"
                    placeholder="Ej.: se marcó por error un lado del TEP; se corrige el discriminador."
                    value={correctionReason}
                    onChange={e => setCorrectionReason(e.target.value)}
                  />
                  <p className="text-xs text-slate-500 font-medium">
                    Queda registrado quién corrigió, cuándo, la clasificación anterior y la nueva. El registro original no se borra.
                  </p>
                </div>
                {correctionError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold">{correctionError}</div>
                )}
              </div>
              <div className="bg-slate-50 px-6 py-4 flex flex-col sm:flex-row gap-2 sm:justify-end border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCorrectionModal(false)}
                  className="px-5 py-2.5 rounded-xl text-slate-700 hover:bg-slate-200 font-bold text-sm cursor-pointer"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={applyCorrection}
                  disabled={dbSaving}
                  className="px-5 py-2.5 rounded-xl text-white bg-violet-600 hover:bg-violet-700 font-bold text-sm shadow-lg shadow-violet-200 cursor-pointer disabled:opacity-60"
                >
                  {dbSaving ? 'Guardando…' : 'Guardar corrección'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showFindingsAlert && (
          <motion.div
            key="high-acuity-findings-alert-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl overflow-hidden shadow-2xl max-w-lg w-full border border-slate-100"
            >
              {/* Encabezado dinámico según máxima gravedad */}
              {(() => {
                const list = getSelectedHighAcuityFindings();
                const hasLevelI = list.some(item => item.level === 'I');
                const hasLevelII = list.some(item => item.level === 'II');
                
                let headerBg = "bg-amber-500 text-slate-950";
                let badgeText = "Prioridad 3 - Urgente";
                let titleText = "¡ADVERTENCIA: MOTIVO URGENTE!";
                let iconColor = "text-slate-950";

                if (hasLevelI) {
                  headerBg = "bg-red-600 text-white";
                  badgeText = "Prioridad 1 - Resucitación";
                  titleText = "¡ALERTA CRÍTICA: RIESGO VITAL!";
                  iconColor = "text-white";
                } else if (hasLevelII) {
                  headerBg = "bg-orange-500 text-white";
                  badgeText = "Prioridad 2 - Emergencia";
                  titleText = "¡ALERTA DE EMERGENCIA!";
                  iconColor = "text-white";
                }

                return (
                  <div className={cn("p-6 flex items-center gap-3", headerBg)}>
                    <div className="p-2 bg-white/20 rounded-2xl">
                      <AlertCircle size={28} className={cn(iconColor, "animate-pulse")} />
                    </div>
                    <div>
                      <span className="text-[10px] font-black tracking-widest uppercase opacity-80 block">{badgeText}</span>
                      <h3 className="text-base font-black tracking-tight uppercase">
                        {titleText}
                      </h3>
                    </div>
                  </div>
                );
              })()}

              {/* Mensaje Central */}
              <div className="p-6 space-y-4">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <p className="text-sm font-bold text-slate-800 leading-relaxed">
                    Se han identificado motivos de consulta de alta prioridad (Nivel I, II o III).
                  </p>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    De acuerdo con el protocolo de triaje CTAS, estos pacientes deben ser priorizados para la toma de constantes vitales y la asignación final de destino de forma urgente.
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Motivos de alta prioridad seleccionados:</span>
                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    {getSelectedHighAcuityFindings().map((item, idx) => (
                      <div key={idx} className="text-xs font-semibold bg-white p-2.5 rounded-xl border border-slate-100 flex items-start gap-2.5">
                        <span className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0 animate-pulse", 
                          item.level === 'I' ? "bg-red-500" :
                          item.level === 'II' ? "bg-orange-500" : "bg-amber-500"
                        )} />
                        <div>
                          <span className={cn("text-[9px] font-black tracking-wider uppercase px-1.5 py-0.5 rounded-md",
                            item.level === 'I' ? "bg-red-50 text-red-700" :
                            item.level === 'II' ? "bg-orange-50 text-orange-700" : "bg-amber-50 text-amber-700"
                          )}>
                            {item.label}
                          </span>
                          <p className="text-slate-700 mt-1 leading-relaxed">{item.finding}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Acciones */}
              <div className="bg-slate-50 px-6 py-4 flex flex-col sm:flex-row gap-2 sm:justify-end border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setPatient(p => ({ ...p, findings: [], otherSymptoms: '' }));
                    setFindingSearchQuery('');
                    setShowFindingsAlert(false);
                    setFindingsAlertDismissed(false);
                  }}
                  className="order-3 sm:order-1 px-4 py-2.5 rounded-xl text-rose-700 bg-rose-50 hover:bg-rose-100 font-bold text-xs transition-all border border-rose-200 active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RotateCcw size={14} className="text-rose-600" />
                  Deshacer selecciones
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowFindingsAlert(false);
                  }}
                  className="order-2 sm:order-2 px-5 py-2.5 rounded-xl text-slate-600 bg-white hover:bg-slate-150 font-bold text-sm transition-all border border-slate-200 active:scale-95 cursor-pointer"
                >
                  Reevaluar Motivos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFindingsAlertDismissed(true);
                    setShowFindingsAlert(false);
                    setStep(4);
                  }}
                  className="order-1 sm:order-3 px-5 py-2.5 rounded-xl text-white bg-blue-600 hover:bg-blue-700 font-bold text-sm tracking-wide transition-all shadow-lg shadow-blue-200 active:scale-95 cursor-pointer"
                >
                  Confirmar y Avanzar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showResetModal && (
          <motion.div
            key="reset-triage-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl overflow-hidden shadow-2xl max-w-md w-full border border-slate-100"
            >
              <div className="bg-rose-600 p-6 text-white flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-2xl">
                  <RotateCcw size={28} className="text-white" />
                </div>
                <div>
                  <span className="text-[10px] font-black tracking-widest uppercase text-white/90 block">
                    Acción de Deshacer
                  </span>
                  <h3 className="text-base font-black tracking-tight uppercase">
                    ¿Reiniciar formulario de triaje?
                  </h3>
                </div>
              </div>
              <div className="p-6 space-y-3">
                <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                  Se descartarán todas las selecciones y datos cargados en esta evaluación actual (datos del paciente, TEP, problemas seleccionados y signos vitales).
                </p>
                <p className="text-xs font-medium text-slate-500">
                  Esta acción no afecta a los pacientes ya guardados en el historial ni a la base de datos remota.
                </p>
              </div>
              <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs tracking-wide transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={resetEntireTriage}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs tracking-wide transition-all shadow-md shadow-rose-200 flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Trash2 size={15} />
                  Sí, reiniciar y borrar todo
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
