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
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import { format, differenceInMinutes, differenceInHours } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from './lib/utils';
import { FINDINGS, TriageLevel, PatientData, VitalSigns, PatientType, PediatricTriangle, CLINICAL_SYSTEMS, ClinicalSystem, ReevaluacionData, EstadoOperativo } from './types';
import { isSupabaseConfigured, saveTriageRecord, fetchTriageRecords, saveReevaluation, updateOperationalState, supabase } from './lib/supabase';
import { getVitalsRange, getVitalsDSLabel, getTepLadosAlterados, getTepLadosList, getVitalsRequirementsByLevel, calculateTriage } from './lib/clinicalUtils';

// --- Constants & Helpers ---

const INITIAL_VITALS: VitalSigns = {
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
};

const INITIAL_TEP: PediatricTriangle = {
  appearance: {
    normal: false,
    abnormalActivity: false,
    unresponsive: false,
    abnormalVisualContact: false,
    irritableInconsolable: false,
    abnormalCry: false,
    abnormalTone: false,
  },
  respiration: {
    normal: false,
    agitation: false,
    apnea: false,
    abnormalPosition: false,
    abnormalSounds: false,
    retractions: false,
  },
  circulation: {
    normal: false,
    cyanosis: false,
    mottled: false,
    pallor: false,
    flushing: false,
  },
};

const INITIAL_PATIENT: Partial<PatientData> = {
  name: '',
  age: undefined,
  ageUnit: 'años',
  gender: 'M',
  documentId: '',
  type: 'pediatric',
  tep: INITIAL_TEP,
  tepStates: {
    apariencia: 'normal',
    respiracion: 'normal',
    circulacion: 'normal',
  },
  vitals: INITIAL_VITALS,
  findings: [],
  otherSymptoms: '',
  estadoOperativo: 'en_espera',
  nivelCtasSugerido: 5,
  nivelCtasFinal: 5,
  nombreAcompanante: '',
  telefonoAcompanante: '',
  parentescoAcompanante: '',
};

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
  return (
    <div
      onClick={onToggle}
      className={cn(
        "w-full self-start rounded-xl border p-3 text-left shadow-[0_3px_10px_rgba(15,23,42,0.05)] cursor-pointer select-none transition-all active:scale-[0.98]",
        selected
          ? "bg-blue-50 border-blue-600 text-blue-900 ring-1 ring-blue-600 shadow-blue-50/50 scale-[1.01]"
          : "bg-white border-slate-200/80 text-slate-700 hover:border-slate-350 hover:bg-slate-50/50"
      )}
    >
      <div className="flex w-full items-start gap-3 text-left">
        <p className="min-w-0 flex-1 text-left text-sm font-medium leading-snug text-slate-800 break-words">
          {criterion.label}
        </p>
        <input 
          type="radio" 
          checked={selected} 
          readOnly 
          className="mt-1 shrink-0 h-4 w-4 text-blue-600 border-slate-300 rounded-full focus:ring-blue-500 accent-blue-600 cursor-pointer" 
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
                  {criteriaByLevel[column.level].map((criterion) => (
                    <ClinicalCriterionCard
                      key={criterion.id}
                      criterion={criterion}
                      selected={selectedCriterionIds.includes(criterion.id)}
                      onToggle={() => onToggleCriterion(criterion.id)}
                    />
                  ))}
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
  const [step, setStep] = useState(1);
  const [patient, setPatient] = useState<Partial<PatientData>>(INITIAL_PATIENT);
  const [history, setHistory] = useState<PatientData[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [showAlertModal, setShowAlertModal] = useState(false);
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
    const sorted = [...CLINICAL_SYSTEMS].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    return sorted[0]?.id || 'respiratorio';
  });

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
    if (alteredTepCount >= 2) {
      if (!tepAlertDismissed && !showAlertModal) {
        setShowAlertModal(true);
      }
    } else {
      setTepAlertDismissed(false);
    }
  }, [alteredTepCount, tepAlertDismissed, showAlertModal]);

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

  const handleNext = () => {
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
    setStep(s => Math.max(1, s - 1));
  };

  const finalizeTriage = async () => {
    if (patient.estadoOperativo !== 'preliminar_critico') {
      if (!patient.findings || patient.findings.length !== 1) {
        setValidationError("Debe seleccionar un problema principal / discriminador clínico antes de cerrar el triaje.");
        return;
      }
    }

    setValidationError(null);
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
      id: Math.random().toString(36).substr(2, 9).toUpperCase(),
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

    setPatient(INITIAL_PATIENT);
    setStep(1);
    setTepAlertDismissed(false);
    setShowAlertModal(false);
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
    return (
      <div className="flex items-center justify-center space-x-4 mb-8">
        {[1, 2, 3, 4, 5].map((i) => {
          if (i === 2 && patient.type === 'adult') return null; // Hide TEP step for adults
          const isGoable = i < step;
          return (
            <div key={i} className="flex items-center">
              <button
                type="button"
                disabled={!isGoable}
                onClick={() => isGoable && setStep(i)}
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2",
                  step === i ? "bg-blue-600 text-white scale-110 shadow-lg" : 
                  step > i ? "bg-green-500 text-white hover:bg-green-600 cursor-pointer" : "bg-slate-200 text-slate-500 cursor-not-allowed"
                )}
                title={isGoable ? `Volver al Paso ${i}` : `Paso ${i}`}
              >
                {step > i ? <CheckCircle2 size={20} /> : i}
              </button>
              {i < totalSteps && <div className={cn("w-8 h-1 mx-2 rounded", step > i ? "bg-green-500" : "bg-slate-200")} />}
            </div>
          );
        })}
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
        <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-full border border-slate-200/70">
          <Clock className="text-blue-600" size={20} />
          <span className="font-mono font-bold text-slate-700">
            {format(currentTime, 'HH:mm:ss')}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,0.88fr)_minmax(500px,0.32fr)] w-full">
        {/* Main Form Area */}
        <main className="w-full min-w-0 max-w-none">
          <div className="bg-white rounded-[24px] border border-slate-200/70 shadow-[0_10px_28px_rgba(15,23,42,0.10)]">
            <div className="w-full flex justify-center pt-8">
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
                                <span className={cn(
                                  "text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider font-mono border",
                                  isAlterado ? "bg-rose-100 text-rose-800 border-rose-200" : "bg-emerald-100 text-emerald-800 border-emerald-200"
                                )}>
                                  {isAlterado ? 'Alterado' : 'Normal'}
                                </span>
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
                    // Exclusive single selection: if already selected, clear it.
                    // If a different one is selected, replace it. Max array size is 1.
                    const next = isSelected ? [] : [criterionId];
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

                      {/* Selector de Sistemas Clínicos para el Problema Principal - LISTA DESPLEGABLE */}
                      <div className="space-y-2 max-w-sm">
                        <div className="relative">
                          <select
                            id="clinical-system-select"
                            value={selectedSystemId}
                            onChange={(e) => {
                              setSelectedSystemId(e.target.value);
                              // Clear active discriminator on category change
                              setPatient({ ...patient, findings: [] });
                            }}
                            className="w-full bg-white text-slate-850 border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 text-base font-black shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer pr-10"
                          >
                            {[...CLINICAL_SYSTEMS].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })).map(sys => (
                              <option key={sys.id} value={sys.id}>
                                {sys.name}
                              </option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                            <ChevronDown size={18} />
                          </div>
                        </div>
                      </div>

                      {/* Matriz Completa y Ajustada a la Pantalla */}
                      <div className="space-y-3">
                        <span className="text-xs font-black uppercase tracking-widest text-slate-500 block">
                          Matriz de Discriminación de Motivos de Consulta:
                        </span>
                        
                        <CTASMatrix
                          criteria={criteria}
                          selectedCriterionIds={patient.findings || []}
                          onToggleCriterion={onToggleCriterion}
                        />
                      </div>

                      {/* Observaciones adicionales */}
                      <div className="space-y-2 pt-4 border-t border-slate-100">
                        <label className="text-base font-black text-slate-800 flex items-center gap-2">
                          <Plus size={18} className="text-blue-600" />
                          Otros Síntomas / Observaciones Opcionales
                        </label>
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
                      <span className="text-xs font-black bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 shrink-0 self-start sm:self-auto">
                        Campos con <span className="text-red-500 font-bold">*</span> son obligatorios
                      </span>
                    </div>

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
                            return getVitalsDSLabel(val, ageMonths, key === 'heartRate' ? 'FC' : 'FR');
                          }
                          if (key === 'oxygenSaturation') {
                            if (val < 90) return { label: 'Crítico (<90%)', colorClass: 'bg-red-100 text-red-800 border-red-200 font-extrabold', key: 'critico' };
                            if (val <= 92) return { label: 'Emergencia (90-92%)', colorClass: 'bg-orange-100 text-orange-800 border-orange-200 font-bold', key: 'alto' };
                            if (val <= 94) return { label: 'Bajo (93-94%)', colorClass: 'bg-yellow-100 text-yellow-800 border-yellow-200 font-bold', key: 'elevado' };
                            return { label: 'Normal', colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200 font-semibold', key: 'normal' };
                          }
                          if (key === 'temperature') {
                            if (val < 32 || val >= 41) return { label: 'Crítica', colorClass: 'bg-red-100 text-red-800 border-red-200 font-extrabold', key: 'critico' };
                            if (val < 35 || val >= 38.5) return { label: 'Fiebre / Hipotermia', colorClass: 'bg-orange-100 text-orange-800 border-orange-200 font-bold', key: 'alto' };
                            if (val >= 37.5) return { label: 'Febrícula', colorClass: 'bg-yellow-100 text-yellow-800 border-yellow-200 font-bold', key: 'elevado' };
                            return { label: 'Normal', colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200 font-semibold', key: 'normal' };
                          }
                          if (key === 'glucose') {
                            if (val < 40 || val > 500) return { label: 'Crítica', colorClass: 'bg-red-100 text-red-800 border-red-200 font-extrabold', key: 'critico' };
                            if (val < 65 || val > 250) return { label: 'Alterada', colorClass: 'bg-orange-100 text-orange-800 border-orange-200 font-bold', key: 'alto' };
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
                                <input 
                                  type="number" 
                                  step={v.key === 'temperature' ? 0.1 : 1}
                                  className={cn("w-full p-3 rounded-xl border outline-none text-base font-black text-slate-800 shadow-sm placeholder:text-slate-400 bg-white transition-all duration-300", inputBorderClass)}
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
                        <span className="text-[10px] font-black text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-100 uppercase font-mono">
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
              <div className="flex justify-between mt-12 pt-8 border-t border-slate-150">
                {step > 1 && step < 5 && (
                  <button 
                    onClick={handleBack}
                    className="flex items-center gap-2 px-7 py-3.5 rounded-xl font-black text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-all text-base border-2 border-transparent active:border-slate-250 cursor-pointer"
                  >
                    <ChevronLeft size={22} /> Atrás
                  </button>
                )}
                <div className="flex-1" />
                {step < 5 ? (
                  <button 
                    onClick={handleNext}
                    disabled={!isStepValid()}
                    className="flex items-center gap-2 bg-blue-600 text-white px-10 py-3.5 rounded-xl font-black text-base shadow-xl shadow-blue-200/70 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed select-none cursor-pointer"
                  >
                    Siguiente <ChevronRight size={22} />
                  </button>
                ) : (
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setStep(1)}
                      className="px-7 py-3.5 rounded-xl font-black text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-all text-base cursor-pointer"
                    >
                      Editar Formularios
                    </button>
                    <button 
                      onClick={finalizeTriage}
                      className="flex items-center gap-2 bg-green-600 text-white px-10 py-3.5 rounded-xl font-black text-base shadow-xl shadow-green-200 hover:bg-green-700 transition-all cursor-pointer"
                    >
                      Finalizar Registro <CheckCircle2 size={22} />
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
                <h3 className="font-sans font-black text-slate-900 text-sm md:text-base flex items-center gap-1.5">
                  <Activity size={18} className="text-blue-600 animate-pulse" />
                  Paciente en Evaluación
                </h3>
                <p className="text-[10px] font-bold text-slate-400 font-mono uppercase">Monitoreo Clínico de Sesión</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={cn(
                  "w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] transition-all duration-500",
                  isOnline && supabaseConnected 
                    ? "bg-emerald-500 text-emerald-500 animate-pulse" 
                    : "bg-rose-500 text-rose-500"
                )} />
                <span className={cn(
                  "text-[9px] font-black uppercase tracking-wider font-sans",
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
                      <div className="space-y-1">
                        <span className="text-[9px] font-black tracking-widest uppercase text-slate-500 block">NIVEL</span>
                        <div className="flex items-center gap-2">
                          <span className="w-10 h-10 rounded-xl bg-white border border-black/10 flex items-center justify-center font-black text-xl font-mono shadow-sm">
                            {currentLevel}
                          </span>
                          <span className="font-extrabold text-xs leading-tight text-slate-900 line-clamp-2">
                            {active.name.split(' · ')[1]}
                          </span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-black/5 mt-2">
                        <p className="text-[10px] font-black text-slate-500 uppercase">TIEMPO OBJETIVO</p>
                        <p className="text-xs font-black text-slate-800 leading-none mt-1">{active.wait}</p>
                      </div>
                    </div>

                    {/* Column 2: Elapsed Time Clock */}
                    <div className={cn(
                      "p-4 rounded-2xl border flex flex-col justify-between transition-all duration-300 min-h-[145px]",
                      isTimeExceeded 
                        ? "bg-rose-50 border-rose-300 shadow-md shadow-rose-100" 
                        : "bg-slate-50 border-slate-200"
                    )}>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black tracking-widest uppercase text-slate-500">TRANSCURRIDO</span>
                          <Clock size={12} className={cn(isTimeExceeded ? "text-rose-600 animate-spin" : "text-slate-400")} />
                        </div>
                        <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-slate-900">
                          {elapsedStr}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200 mt-2">
                        {isTimeExceeded ? (
                          <div className="flex items-center gap-1 text-[9px] font-black uppercase text-red-700 animate-pulse bg-red-100 p-1.5 rounded-lg border border-red-200">
                            <ShieldAlert size={12} className="shrink-0" />
                            <span>¡ALERTA: TIEMPO EXCEDIDO!</span>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[9px] font-black text-slate-500">
                              <span>PROGRESO</span>
                              <span>{elapsedMin} / {active.targetMin || '∞'} MIN</span>
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
                  <div className="space-y-3 pt-1">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Progreso / Escala de Gravedad CTAS:</div>
                    <div className="relative">
                      {/* Bar back */}
                      <div className="absolute top-[14px] left-3 right-3 h-0.5 bg-slate-100 -z-10" />
                      <div className="grid grid-cols-5 gap-1.5 z-10 relative">
                        {(['I', 'II', 'III', 'IV', 'V'] as const).map((lvl) => {
                          const isActive = lvl === currentLevel;
                          const dotColor = lvl === 'I' ? 'bg-red-500 text-white animate-pulse' : lvl === 'II' ? 'bg-orange-500 text-white animate-pulse' : lvl === 'III' ? 'bg-yellow-500 text-slate-900' : lvl === 'IV' ? 'bg-green-500 text-white' : 'bg-blue-500 text-white';
                          return (
                            <div key={lvl} className="flex flex-col items-center">
                              <div className={cn(
                                "w-7 h-7 rounded-full flex items-center justify-center font-black text-xs font-mono transition-all",
                                isActive 
                                  ? `${dotColor} scale-110 shadow-lg ring-4 ring-slate-150`
                                  : "bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
                              )}>
                                {lvl}
                              </div>
                              <span className={cn("text-[9px] sm:text-[10px] mt-1.5 font-black leading-tight", isActive ? "text-slate-800" : "text-slate-400")}>
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
                setPatient(INITIAL_PATIENT);
                setStep(1);
                setTepAlertDismissed(false);
                setShowAlertModal(false);
                setShowFindingsAlert(false);
                setFindingsAlertDismissed(false);
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
                          </div>

                          {/* Nombre */}
                          <p className="text-base font-semibold leading-tight text-slate-900 truncate" title={p.name}>
                            {p.name}
                          </p>
                        </div>

                        {/* Identificador / ID */}
                        <div className="shrink-0 text-right">
                          <span className="text-xs font-medium text-slate-400 font-mono">{p.id}</span>
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
              {/* Encabezado: Color de fondo Rojo Vivo (bg-red-600), Icono de Alerta de Peligro (AlertCircle) y texto */}
              <div className="bg-red-600 p-6 text-white flex items-center gap-3">
                <div className="p-2 bg-white/25 rounded-2xl">
                  <AlertCircle size={28} className="text-white animate-pulse" />
                </div>
                <div>
                  <span className="text-[10px] font-black tracking-widest uppercase text-white/80 block">Seguridad del Paciente</span>
                  <h3 className="text-base font-black tracking-tight uppercase">
                    ¡ALERTA: SITUACIÓN DE RIESGO!
                  </h3>
                </div>
              </div>

              {/* Mensaje Central */}
              <div className="p-6 space-y-4">
                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl">
                  <p className="text-sm font-bold text-red-900 leading-relaxed">
                    Se ha identificado una situación de riesgo. El Triángulo de Evaluación Pediátrico (TEP) presenta alteración en 2 o más lados. El paciente requiere atención inmediata.
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Lados alterados identificados:</span>
                  <div className="flex flex-wrap gap-2">
                    {getTepLadosList(patient).map((lado, idx) => (
                      <span key={idx} className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl border border-slate-200 flex items-center gap-1.5 justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" /> {lado}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Acciones */}
              <div className="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowAlertModal(false);
                    setTepAlertDismissed(true);
                  }}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl text-white bg-red-600 hover:bg-red-700 font-bold text-sm tracking-wide transition-all shadow-lg shadow-red-200 active:scale-95 cursor-pointer"
                >
                  Aceptar / Continuar evaluación
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
                    setShowFindingsAlert(false);
                  }}
                  className="order-2 sm:order-1 px-5 py-2.5 rounded-xl text-slate-600 bg-white hover:bg-slate-150 font-bold text-sm transition-all border border-slate-200 active:scale-95 cursor-pointer"
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
                  className="order-1 sm:order-2 px-5 py-2.5 rounded-xl text-white bg-blue-600 hover:bg-blue-700 font-bold text-sm tracking-wide transition-all shadow-lg shadow-blue-200 active:scale-95 cursor-pointer"
                >
                  Confirmar y Avanzar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

