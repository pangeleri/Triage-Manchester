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
  RefreshCw, 
  Stethoscope, 
  User, 
  ChevronRight,
  ChevronLeft,
  Timer,
  Database,
  Github,
  Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { format, differenceInMinutes, differenceInHours } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from './lib/utils';
import { FINDINGS, TriageLevel, PatientData, VitalSigns, PatientType, PediatricTriangle } from './types';
import { isSupabaseConfigured, saveTriageRecord, fetchTriageRecords } from './lib/supabase';

// --- Constants & Helpers ---

const GCS_OPTIONS = {
  eye: [
    { value: 4, label: 'Espontánea' },
    { value: 3, label: 'Al estímulo verbal' },
    { value: 2, label: 'Al dolor' },
    { value: 1, label: 'Sin respuesta' },
  ],
  verbal: [
    { value: 5, label: 'Orientado' },
    { value: 4, label: 'Confuso' },
    { value: 3, label: 'Palabras inapropiadas' },
    { value: 2, label: 'Sonidos incomprensibles' },
    { value: 1, label: 'Sin respuesta' },
  ],
  motor: [
    { value: 6, label: 'Obedece órdenes' },
    { value: 5, label: 'Localiza el dolor' },
    { value: 4, label: 'Retirada al dolor' },
    { value: 3, label: 'Flexión anormal (decorticación)' },
    { value: 2, label: 'Extensión anormal (descerebración)' },
    { value: 1, label: 'Sin respuesta' },
  ],
};

const INITIAL_VITALS: VitalSigns = {
  heartRate: undefined,
  respiratoryRate: undefined,
  systolicBP: undefined,
  diastolicBP: undefined,
  oxygenSaturation: undefined,
  temperature: undefined,
  glasgow: undefined,
  glucose: undefined,
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
  type: 'adult',
  tep: INITIAL_TEP,
  vitals: INITIAL_VITALS,
  findings: [],
  otherSymptoms: '',
};

// Simplified Physiological Constants for Pediatric (Based on screenshots)
// Range logic: normal, +/- 1DS, +/- 2DS
const getVitalsRange = (ageMonths: number, type: 'FR' | 'FC') => {
  // Simplified ranges based on provided table
  if (type === 'FR') {
    if (ageMonths <= 3) return { normal: [30, 60], d1: [60, 70], d2: [70, 80] };
    if (ageMonths <= 6) return { normal: [30, 60], d1: [60, 70], d2: [70, 80] };
    if (ageMonths <= 12) return { normal: [25, 45], d1: [45, 55], d2: [55, 60] };
    if (ageMonths <= 36) return { normal: [20, 30], d1: [30, 35], d2: [35, 40] };
    if (ageMonths <= 72) return { normal: [16, 24], d1: [24, 28], d2: [28, 32] };
    if (ageMonths <= 120) return { normal: [14, 20], d1: [20, 24], d2: [24, 26] };
    return { normal: [14, 20], d1: [20, 24], d2: [24, 26] };
  } else {
    if (ageMonths <= 3) return { normal: [90, 180], d1: [180, 205], d2: [205, 230] };
    if (ageMonths <= 6) return { normal: [80, 160], d1: [160, 180], d2: [180, 210] };
    if (ageMonths <= 12) return { normal: [80, 140], d1: [140, 160], d2: [160, 180] };
    if (ageMonths <= 36) return { normal: [75, 130], d1: [130, 145], d2: [145, 165] };
    if (ageMonths <= 72) return { normal: [70, 110], d1: [110, 125], d2: [125, 140] };
    if (ageMonths <= 120) return { normal: [60, 90], d1: [90, 105], d2: [105, 120] };
    return { normal: [60, 90], d1: [90, 105], d2: [105, 120] };
  }
};

// --- Main Component ---

export default function App() {
  const [step, setStep] = useState(1);
  const [patient, setPatient] = useState<Partial<PatientData>>(INITIAL_PATIENT);
  const [history, setHistory] = useState<PatientData[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [showGlasgowCalc, setShowGlasgowCalc] = useState(false);
  const [gcsComponents, setGcsComponents] = useState({ eye: 4, verbal: 5, motor: 6 });
  const [gcsTouched, setGcsTouched] = useState({ eye: false, verbal: false, motor: false });

  // Sidebar Tabs & Supabase Sync states
  const [sidebarTab, setSidebarTab] = useState<'pacientes' | 'database' | 'despliegue'>('pacientes');
  const [dbSaving, setDbSaving] = useState(false);
  const [dbSuccessMessage, setDbSuccessMessage] = useState<string | null>(null);
  const [dbErrorMessage, setDbErrorMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Update current time for timers
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load history from localStorage and download from Supabase if configured
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
          const remoteRecords = await fetchTriageRecords();
          if (remoteRecords && remoteRecords.length > 0) {
            setHistory(remoteRecords);
            localStorage.setItem('triage_history', JSON.stringify(remoteRecords));
            setDbSuccessMessage('Conexión con Supabase establecida. Datos sincronizados.');
            setTimeout(() => setDbSuccessMessage(null), 5000);
          }
        } catch (e: any) {
          setDbErrorMessage('Error al sincronizar con Supabase: ' + (e?.message || e));
          setTimeout(() => setDbErrorMessage(null), 5000);
        } finally {
          setIsSyncing(false);
        }
      };
      syncSupabase();
    }
  }, []);

  const triggerManualSync = async () => {
    if (!isSupabaseConfigured) {
      setDbErrorMessage('Supabase no está configurado. Revisa la pestaña de Base de Datos para configurarlo.');
      setTimeout(() => setDbErrorMessage(null), 5000);
      return;
    }
    setIsSyncing(true);
    setDbSuccessMessage(null);
    setDbErrorMessage(null);
    try {
      const remoteRecords = await fetchTriageRecords();
      setHistory(remoteRecords);
      localStorage.setItem('triage_history', JSON.stringify(remoteRecords));
      setDbSuccessMessage('Base de datos sincronizada con éxito.');
      setTimeout(() => setDbSuccessMessage(null), 4000);
    } catch (e: any) {
      setDbErrorMessage('Error de sincronización: ' + (e?.message || e));
      setTimeout(() => setDbErrorMessage(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  // --- Logic Functions ---

  const calculateTriage = (data: Partial<PatientData>): { level: TriageLevel; priority: string; wait: string; destination: string } => {
    const v = data.vitals || INITIAL_VITALS;
    const ageMonths = (data.age || 0) * (data.ageUnit === 'años' ? 12 : 1);
    
    // Evaluate potential acuity levels (1 to 5) and choose the most acute one (lowest index, i.e., I).
    let suggestedLevelValue = 5;

    // --- 1. TEP (Triángulo de Evaluación Pediátrica) Modifier ---
    if (data.type === 'pediatric' && data.tep) {
      const { appearance, respiration, circulation } = data.tep;
      const appValues = Object.values(appearance);
      const respValues = Object.values(respiration);
      const circValues = Object.values(circulation);
      
      const appAltered = appValues.filter(v => v).length;
      const respAltered = respValues.filter(v => v).length;
      const circAltered = circValues.filter(v => v).length;
      
      if (appearance.unresponsive || (appAltered && respAltered && circAltered)) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 1);
      } else if ((appAltered && respAltered) || (appAltered && circAltered) || (respAltered && circAltered)) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 2);
      } else if (appAltered || respAltered || circAltered) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 3);
      }
    }

    // --- 2. Glasgow Coma Scale (GCS) Modifier ---
    if (v.glasgow !== undefined) {
      if (v.glasgow <= 9) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 1);
      } else if (v.glasgow >= 10 && v.glasgow <= 13) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 2);
      } else if (v.glasgow === 14) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 3);
      }
    }

    // --- 3. Oxygen Saturation Modifier ---
    if (v.oxygenSaturation !== undefined) {
      if (v.oxygenSaturation < 90) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 1);
      } else if (v.oxygenSaturation >= 90 && v.oxygenSaturation <= 92) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 2);
      } else if (v.oxygenSaturation >= 93 && v.oxygenSaturation <= 94) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 3);
      }
    }

    // --- 4. Hemodynamics & Vital Signs Modifiers by age ---
    if (data.type === 'pediatric') {
      const frRange = getVitalsRange(ageMonths, 'FR');
      const fcRange = getVitalsRange(ageMonths, 'FC');

      // Respiratory Rate (Pediatric)
      if (v.respiratoryRate !== undefined) {
        if (v.respiratoryRate > frRange.d2[1] * 1.2 || v.respiratoryRate < frRange.normal[0] * 0.4) {
          suggestedLevelValue = Math.min(suggestedLevelValue, 1);
        } else if (v.respiratoryRate > frRange.d2[1] || v.respiratoryRate < frRange.normal[0] * 0.6) {
          suggestedLevelValue = Math.min(suggestedLevelValue, 2);
        } else if (v.respiratoryRate > frRange.d1[1] || v.respiratoryRate < frRange.normal[0]) {
          suggestedLevelValue = Math.min(suggestedLevelValue, 3);
        }
      }

      // Heart Rate (Pediatric)
      if (v.heartRate !== undefined) {
        if (v.heartRate > fcRange.d2[1] * 1.3 || v.heartRate < fcRange.normal[0] * 0.4) {
          suggestedLevelValue = Math.min(suggestedLevelValue, 1);
        } else if (v.heartRate > fcRange.d2[1] || v.heartRate < fcRange.normal[0] * 0.6) {
          suggestedLevelValue = Math.min(suggestedLevelValue, 2);
        } else if (v.heartRate > fcRange.d1[1] || v.heartRate < fcRange.normal[0]) {
          suggestedLevelValue = Math.min(suggestedLevelValue, 3);
        }
      }
    } else {
      // Adult Vital Signs
      if (v.respiratoryRate !== undefined) {
        if (v.respiratoryRate >= 35 || v.respiratoryRate < 8) {
          suggestedLevelValue = Math.min(suggestedLevelValue, 1);
        } else if (v.respiratoryRate >= 30 || v.respiratoryRate < 10) {
          suggestedLevelValue = Math.min(suggestedLevelValue, 2);
        } else if (v.respiratoryRate >= 24) {
          suggestedLevelValue = Math.min(suggestedLevelValue, 3);
        }
      }

      if (v.heartRate !== undefined) {
        if (v.heartRate >= 140 || v.heartRate < 40) {
          suggestedLevelValue = Math.min(suggestedLevelValue, 1);
        } else if (v.heartRate >= 120 || v.heartRate < 50) {
          suggestedLevelValue = Math.min(suggestedLevelValue, 2);
        } else if (v.heartRate >= 100 || v.heartRate < 60) {
          suggestedLevelValue = Math.min(suggestedLevelValue, 3);
        }
      }

      if (v.systolicBP !== undefined) {
        if (v.systolicBP < 80) {
          suggestedLevelValue = Math.min(suggestedLevelValue, 1);
        } else if (v.systolicBP < 90 || v.systolicBP > 220) {
          suggestedLevelValue = Math.min(suggestedLevelValue, 2);
        } else if (v.systolicBP > 200) {
          suggestedLevelValue = Math.min(suggestedLevelValue, 3);
        }
      }
      if (v.diastolicBP !== undefined) {
        if (v.diastolicBP > 130) {
          suggestedLevelValue = Math.min(suggestedLevelValue, 1);
        } else if (v.diastolicBP > 110) {
          suggestedLevelValue = Math.min(suggestedLevelValue, 2);
        }
      }
    }

    // --- 5. Temperature Modifiers (Both adult & pediatric) ---
    if (v.temperature !== undefined) {
      if (v.temperature < 32 || v.temperature >= 41) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 1);
      } else if (v.temperature < 35 || v.temperature >= 38.5) {
        const isFeverWithSirs = v.temperature >= 38.5 && (
          (v.heartRate && v.heartRate > 100) || 
          (v.respiratoryRate && v.respiratoryRate > 22)
        );
        if (isFeverWithSirs) {
          suggestedLevelValue = Math.min(suggestedLevelValue, 2);
        } else {
          suggestedLevelValue = Math.min(suggestedLevelValue, 3);
        }
      }
    }

    // --- 6. Glucose Modifier ---
    if (v.glucose !== undefined) {
      if (v.glucose < 40 || v.glucose > 500) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 2);
      } else if (v.glucose < 65 || v.glucose > 250) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 3);
      }
    }

    // --- 7. Clinical Findings / Discriminators Modifiers ---
    if (data.findings?.some(f => FINDINGS.LEVEL_I.includes(f))) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 1);
    }
    if (data.findings?.some(f => FINDINGS.LEVEL_II.includes(f))) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 2);
    }
    if (data.findings?.some(f => FINDINGS.LEVEL_III.includes(f))) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 3);
    }
    if (data.findings?.some(f => FINDINGS.LEVEL_IV.includes(f))) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 4);
    }
    if (data.findings?.some(f => FINDINGS.LEVEL_V.includes(f))) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 5);
    }

    // Map level number to Roman numeral and label
    const levelMap: Record<number, { level: TriageLevel; priority: string; wait: string; destination: string }> = {
      1: { level: 'I', priority: 'Nivel I - Resucitación', wait: 'Inmediata (0 min)', destination: 'Shock Room' },
      2: { level: 'II', priority: 'Nivel II - Emergencia', wait: '≤ 15 min', destination: 'Box de Emergencias' },
      3: { level: 'III', priority: 'Nivel III - Urgente', wait: '≤ 30 min', destination: 'Consultorio de Urgencias' },
      4: { level: 'IV', priority: 'Nivel IV - Menos Urgente', wait: '≤ 60 min', destination: 'Consultorio General' },
      5: { level: 'V', priority: 'Nivel V - No Urgente', wait: '≤ 120 min', destination: 'Consulta Externa / Admisión' },
    };

    return levelMap[suggestedLevelValue] || levelMap[5];
  };

  const currentTriage = useMemo(() => calculateTriage(patient), [patient]);

  const isStepValid = () => {
    if (step === 1) {
      return patient.name && patient.age !== undefined && patient.documentId && patient.type;
    }
    if (step === 2 && patient.type === 'pediatric') {
       const tep = patient.tep;
       if (!tep) return false;
       const hasAppearance = Object.values(tep.appearance).some(v => v);
       const hasRespiration = Object.values(tep.respiration).some(v => v);
       const hasCirculation = Object.values(tep.circulation).some(v => v);
       return !!(hasAppearance && hasRespiration && hasCirculation);
    }
    if (step === 3) {
      const v = patient.vitals;
      return v?.heartRate !== undefined && 
             v?.respiratoryRate !== undefined && 
             v?.systolicBP !== undefined && 
             v?.diastolicBP !== undefined && 
             v?.oxygenSaturation !== undefined && 
             v?.temperature !== undefined && 
             v?.glasgow !== undefined;
    }
    if (step === 4) {
      return (patient.findings && patient.findings.length > 0) || patient.otherSymptoms;
    }
    return true;
  };

  const handleNext = () => {
    if (isStepValid()) {
      if (step === 1 && patient.type === 'adult') {
        setStep(3); // Skip TEP for adults
      } else {
        setStep(s => s + 1);
      }
    }
  };

  const handleBack = () => {
    if (step === 3 && patient.type === 'adult') {
      setStep(1);
    } else {
      setStep(s => s - 1);
    }
  };

  const finalizeTriage = async () => {
    const finalPatient: PatientData = {
      ...patient as PatientData,
      id: Math.random().toString(36).substr(2, 9).toUpperCase(),
      arrivalDate: new Date().toISOString(),
      triageLevel: currentTriage.level,
      originalPriority: currentTriage.priority,
      waitTime: currentTriage.wait,
      suggestedDestination: currentTriage.destination,
    };

    // Save locally immediately
    const updatedHistory = [finalPatient, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('triage_history', JSON.stringify(updatedHistory));

    setPatient(INITIAL_PATIENT);
    setStep(1);

    // Save to Supabase in background if configured
    if (isSupabaseConfigured) {
      setDbSaving(true);
      setDbSuccessMessage(null);
      setDbErrorMessage(null);
      try {
        const res = await saveTriageRecord(finalPatient);
        if (res.success) {
          setDbSuccessMessage('Registro guardado en Supabase con éxito.');
          // Refresh list to ensure we have structural sync
          const remoteRecords = await fetchTriageRecords();
          setHistory(remoteRecords);
          localStorage.setItem('triage_history', JSON.stringify(remoteRecords));
          setTimeout(() => setDbSuccessMessage(null), 3000);
        } else {
          setDbErrorMessage('No se pudo guardar en Supabase: ' + res.error);
          setTimeout(() => setDbErrorMessage(null), 6000);
        }
      } catch (err: any) {
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
        ['Glucosa', `${p.vitals.glucose ?? 'N/A'} mg/dl`],
        ['Escala de Glasgow', `${p.vitals.glasgow ?? 'N/A'}/15`],
      ],
    });

    // Findings & Destination
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.text(`Hallazgos: ${p.findings.join(', ') || 'Ninguno'}`, 20, finalY);
    if (p.otherSymptoms) {
      doc.text(`Otros Síntomas: ${p.otherSymptoms}`, 20, finalY + 10);
    }
    doc.text(`Tiempo de Espera: ${p.waitTime}`, 20, finalY + 20);
    doc.text(`Destino Sugerido: ${p.suggestedDestination}`, 20, finalY + 30);

    doc.save(`Triaje_${p.id}.pdf`);
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
SIGNOS VITALES: FC: ${p.vitals?.heartRate ?? '---'} lpm, FR: ${p.vitals?.respiratoryRate ?? '---'} rpm, PA: ${p.vitals?.systolicBP ?? '---'}/${p.vitals?.diastolicBP ?? '---'} mmHg, SpO2: ${p.vitals?.oxygenSaturation ?? '---'}%, T°: ${p.vitals?.temperature ?? '---'}°C, GLUCOSA: ${p.vitals?.glucose ?? '---'} mg/dl${tepDetails}
PROBLEMA PRINCIPAL: ${p.findings?.join(', ') || 'Sin hallazgos específicos'}${p.otherSymptoms ? ` (${p.otherSymptoms})` : ''}
ESCALA DE GLASGOW: ${p.vitals?.glasgow ?? '---'}/15
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
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-600 rounded-xl text-white">
            <Activity size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Herramienta para el triaje Grierson</h1>
            <p className="text-slate-500 font-medium">Hospital Gral. de Agudos "Dra. Cecilia Grierson"</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-full border border-slate-200">
          <Clock className="text-blue-600" size={20} />
          <span className="font-mono font-bold text-slate-700">
            {format(currentTime, 'HH:mm:ss')}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form Area */}
        <main className="lg:col-span-2">
          <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
            {renderStepIndicator()}

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
                    <div className="flex items-center gap-2 text-blue-600 mb-4">
                      <User size={24} />
                      <h2 className="text-xl font-bold">Identificación del Paciente <span className="text-red-500">*</span></h2>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">Tipo de Paciente <span className="text-red-500">*</span></label>
                        <div className="flex gap-4">
                          {[
                            { value: 'adult', label: 'Adulto', icon: <User size={18} /> },
                            { value: 'pediatric', label: 'Pediátrico', icon: <User size={18} /> }
                          ].map(t => (
                            <button
                              key={t.value}
                              type="button"
                              onClick={() => setPatient({...patient, type: t.value as any})}
                              className={cn(
                                "flex-1 py-4 rounded-xl border font-bold transition-all flex flex-col items-center gap-2 cursor-pointer",
                                patient.type === t.value 
                                  ? "bg-blue-600 border-blue-600 text-white shadow-md opacity-100" 
                                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 opacity-80"
                              )}
                            >
                              {t.icon}
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">Nombre Completo <span className="text-red-500">*</span></label>
                        <input 
                          type="text" 
                          className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          placeholder="Ej. Juan Pérez"
                          value={patient.name}
                          onChange={e => setPatient({...patient, name: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">Documento (DNI/CI) <span className="text-red-500">*</span></label>
                        <input 
                          type="text" 
                          className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          placeholder="Ej. 12345678"
                          value={patient.documentId}
                          onChange={e => {
                            const val = e.target.value.replace(/\D/g, '');
                            setPatient({...patient, documentId: val});
                          }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-slate-700">Edad <span className="text-red-500">*</span></label>
                          <input 
                            type="number" 
                            className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="---"
                            value={patient.age ?? ''}
                            onChange={e => {
                              const val = e.target.value ? parseInt(e.target.value) : undefined;
                              let newType = patient.type;
                              if (val !== undefined) {
                                if (patient.ageUnit === 'años') {
                                  newType = val >= 18 ? 'adult' : 'pediatric';
                                } else {
                                  newType = 'pediatric';
                                }
                              }
                              setPatient({...patient, age: val, type: newType as any});
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-slate-700">Unidad</label>
                          <select 
                            className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            value={patient.ageUnit}
                            onChange={e => {
                              const unit = e.target.value as any;
                              let newType = patient.type;
                              if (patient.age !== undefined) {
                                if (unit === 'años') {
                                  newType = patient.age >= 18 ? 'adult' : 'pediatric';
                                } else {
                                  newType = 'pediatric';
                                }
                              }
                              setPatient({...patient, ageUnit: unit, type: newType});
                            }}
                          >
                            <option value="años">Años</option>
                            <option value="meses">Meses</option>
                          </select>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        * El tipo de paciente se selecciona automáticamente según la edad (18+ años = Adulto).
                      </p>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">Género</label>
                        <div className="flex gap-4">
                          {['M', 'F'].map(g => (
                            <button
                              key={g}
                              onClick={() => setPatient({...patient, gender: g as any})}
                              className={cn(
                                "flex-1 py-3 rounded-xl border font-bold transition-all",
                                patient.gender === g ? "bg-blue-600 border-blue-600 text-white shadow-md" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
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
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <div className="flex items-center gap-2 text-blue-600">
                        <Stethoscope size={24} />
                        <h2 className="text-xl font-bold">Triángulo de Evaluación Pediátrico (TEP)</h2>
                      </div>
                      <span className="text-[10px] bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-bold">
                        Obligatorio para pediatría
                      </span>
                    </div>

                    <p className="text-sm text-slate-500">
                      Por favor, evalúe las 3 componentes del triángulo. Seleccione si está <b>estable</b> o marque los síntomas <b>anormales</b> correspondientes:
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {[
                        { title: 'Apariencia', key: 'appearance', options: [
                          { k: 'normal', l: 'Estable / Sin alteración' },
                          { k: 'abnormalActivity', l: 'Actividad anormal' },
                          { k: 'unresponsive', l: 'Arreactivo' },
                          { k: 'abnormalVisualContact', l: 'Contacto visual anormal' },
                          { k: 'irritableInconsolable', l: 'Irritable, no consolable' },
                          { k: 'abnormalCry', l: 'Llanto anormal' },
                          { k: 'abnormalTone', l: 'Tono anormal' },
                        ]},
                        { title: 'Respiración', key: 'respiration', options: [
                          { k: 'normal', l: 'Estable / Sin alteración' },
                          { k: 'agitation', l: 'Agitación' },
                          { k: 'apnea', l: 'Apnea' },
                          { k: 'abnormalPosition', l: 'Posición anormal' },
                          { k: 'abnormalSounds', l: 'Ruidos anormales' },
                          { k: 'retractions', l: 'Tirajes' },
                        ]},
                        { title: 'Circulación', key: 'circulation', options: [
                          { k: 'normal', l: 'Estable / Sin alteración' },
                          { k: 'cyanosis', l: 'Cianosis' },
                          { k: 'mottled', l: 'Moteado-reticulado' },
                          { k: 'pallor', l: 'Palidez' },
                          { k: 'flushing', l: 'Rubicundez' },
                        ]}
                      ].map(section => {
                        const hasSelected = Object.values((patient.tep as any)[section.key]).some(v => v);
                        return (
                          <div key={section.title} className={cn(
                            "p-4 rounded-2xl border transition-all",
                            hasSelected ? "bg-slate-50 border-blue-200" : "bg-white border-dashed border-slate-300"
                          )}>
                            <div className="flex justify-between items-center mb-3 border-b border-slate-300 pb-2">
                              <h3 className="font-bold text-slate-800">{section.title}</h3>
                              {hasSelected ? (
                                <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-bold">Evaluado</span>
                              ) : (
                                <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-bold">Pendiente *</span>
                              )}
                            </div>
                            <div className="space-y-2">
                              {section.options.map(opt => {
                                const isChecked = !!(patient.tep as any)[section.key][opt.k];
                                return (
                                  <label key={opt.k} className={cn(
                                    "flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg transition-colors hover:bg-slate-100",
                                    opt.k === 'normal' && isChecked && "bg-green-50 text-green-800 font-medium hover:bg-green-100",
                                    opt.k !== 'normal' && isChecked && "bg-red-50 text-red-800 font-medium hover:bg-red-100"
                                  )}>
                                    <input 
                                      type="checkbox" 
                                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                      checked={isChecked}
                                      onChange={() => {
                                        const nextTep = { ...patient.tep! };
                                        const sectionObj = { ...(nextTep as any)[section.key] };
                                        
                                        if (opt.k === 'normal') {
                                          const isCheckingNow = !sectionObj.normal;
                                          if (isCheckingNow) {
                                            // turn off everything, set normal to true
                                            Object.keys(sectionObj).forEach(key => {
                                              sectionObj[key] = false;
                                            });
                                            sectionObj.normal = true;
                                          } else {
                                            sectionObj.normal = false;
                                          }
                                        } else {
                                          // toggle key, set normal to false
                                          sectionObj[opt.k] = !sectionObj[opt.k];
                                          sectionObj.normal = false;
                                        }
                                        
                                        (nextTep as any)[section.key] = sectionObj;
                                        setPatient({ ...patient, tep: nextTep });
                                      }}
                                    />
                                    {opt.l}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="flex items-center gap-2 text-blue-600 mb-4">
                      <Heart size={24} />
                      <h2 className="text-xl font-bold">Signos Vitales / Constantes <span className="text-red-500">*</span></h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { key: 'heartRate', label: 'FC (lpm)', icon: <Activity size={16} /> },
                        { key: 'respiratoryRate', label: 'FR (rpm)', icon: <Timer size={16} /> },
                        { key: 'systolicBP', label: 'PAS (mmHg)', icon: <Activity size={16} /> },
                        { key: 'diastolicBP', label: 'PAD (mmHg)', icon: <Activity size={16} /> },
                        { key: 'oxygenSaturation', label: 'SpO2 (%)', icon: <Info size={16} /> },
                        { key: 'temperature', label: 'T° (°C)', icon: <Stethoscope size={16} /> },
                        { key: 'glucose', label: 'Glucosa (mg/dl)', icon: <Activity size={16} /> },
                        { key: 'glasgow', label: 'Glasgow', icon: <FileText size={16} /> },
                      ].map(v => (
                        <div key={v.key} className="space-y-2 relative">
                          <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-slate-500 flex items-center gap-1 uppercase">
                              {v.icon} {v.label} {v.key !== 'glucose' ? <span className="text-red-500">*</span> : <span className="text-slate-400 font-normal lowercase">(opcional)</span>}
                            </label>
                            {v.key === 'glasgow' && (
                              <button 
                                onClick={() => {
                                  const newState = !showGlasgowCalc;
                                  setShowGlasgowCalc(newState);
                                  if (newState) setGcsTouched({ eye: false, verbal: false, motor: false });
                                }}
                                className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold hover:bg-blue-100 transition-colors"
                              >
                                {showGlasgowCalc ? 'Cerrar' : 'Calcular GCS'}
                              </button>
                            )}
                          </div>
                          
                          {v.key === 'glasgow' && showGlasgowCalc ? (
                            <div className="bg-slate-50 p-3 rounded-xl border border-blue-100 space-y-3 mt-1">
                              <div className="flex gap-2 justify-end mb-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setGcsComponents({ eye: 4, verbal: 5, motor: 6 });
                                    setPatient({ ...patient, vitals: { ...patient.vitals!, glasgow: 15 }});
                                    setShowGlasgowCalc(false);
                                  }}
                                  className="text-[10px] bg-green-100 hover:bg-green-200 text-green-800 px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer"
                                >
                                  Asignar 15/15
                                </button>
                              </div>
                              <div className="grid grid-cols-1 gap-2">
                                <div>
                                  <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block">Ocular</label>
                                  <select 
                                    className="w-full text-xs p-1.5 rounded-lg border border-slate-200 bg-white"
                                    value={gcsComponents.eye}
                                    onChange={e => {
                                      const val = parseInt(e.target.value);
                                      const next = { ...gcsComponents, eye: val };
                                      const nextTouched = { ...gcsTouched, eye: true };
                                      setGcsComponents(next);
                                      setGcsTouched(nextTouched);
                                      setPatient({ ...patient, vitals: { ...patient.vitals!, glasgow: next.eye + next.verbal + next.motor }});
                                      if (nextTouched.eye && nextTouched.verbal && nextTouched.motor) {
                                        setTimeout(() => setShowGlasgowCalc(false), 500);
                                      }
                                    }}
                                  >
                                    {GCS_OPTIONS.eye.map(o => <option key={o.value} value={o.value}>{o.value} - {o.label}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block">Verbal</label>
                                  <select 
                                    className="w-full text-xs p-1.5 rounded-lg border border-slate-200 bg-white"
                                    value={gcsComponents.verbal}
                                    onChange={e => {
                                      const val = parseInt(e.target.value);
                                      const next = { ...gcsComponents, verbal: val };
                                      const nextTouched = { ...gcsTouched, verbal: true };
                                      setGcsComponents(next);
                                      setGcsTouched(nextTouched);
                                      setPatient({ ...patient, vitals: { ...patient.vitals!, glasgow: next.eye + next.verbal + next.motor }});
                                      if (nextTouched.eye && nextTouched.verbal && nextTouched.motor) {
                                        setTimeout(() => setShowGlasgowCalc(false), 500);
                                      }
                                    }}
                                  >
                                    {GCS_OPTIONS.verbal.map(o => <option key={o.value} value={o.value}>{o.value} - {o.label}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block">Motor</label>
                                  <select 
                                    className="w-full text-xs p-1.5 rounded-lg border border-slate-200 bg-white"
                                    value={gcsComponents.motor}
                                    onChange={e => {
                                      const val = parseInt(e.target.value);
                                      const next = { ...gcsComponents, motor: val };
                                      const nextTouched = { ...gcsTouched, motor: true };
                                      setGcsComponents(next);
                                      setGcsTouched(nextTouched);
                                      setPatient({ ...patient, vitals: { ...patient.vitals!, glasgow: next.eye + next.verbal + next.motor }});
                                      if (nextTouched.eye && nextTouched.verbal && nextTouched.motor) {
                                        setTimeout(() => setShowGlasgowCalc(false), 500);
                                      }
                                    }}
                                  >
                                    {GCS_OPTIONS.motor.map(o => <option key={o.value} value={o.value}>{o.value} - {o.label}</option>)}
                                  </select>
                                </div>
                              </div>
                              <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                                <span className="text-xs font-bold text-slate-700">Total:</span>
                                <span className="text-sm font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                                  {gcsComponents.eye + gcsComponents.verbal + gcsComponents.motor}/15
                                </span>
                              </div>
                            </div>
                          ) : (
                            <input 
                              type="number" 
                              step={v.key === 'temperature' ? 0.1 : 1}
                              className="w-full p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                              placeholder="---"
                              max={v.key === 'glasgow' ? 15 : undefined}
                              min={v.key === 'glasgow' ? 3 : undefined}
                              value={patient.vitals![v.key as keyof VitalSigns] ?? ''}
                              onChange={e => {
                                let val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                                if (v.key === 'glasgow' && val !== undefined) {
                                  val = Math.min(15, Math.max(3, val));
                                }
                                setPatient({
                                  ...patient, 
                                  vitals: { ...patient.vitals!, [v.key]: val }
                                });
                              }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {step === 4 && (
                  <motion.div
                    key="step4"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="flex items-center gap-2 text-blue-600 mb-4">
                      <Stethoscope size={24} />
                      <h2 className="text-xl font-bold">Problema Principal <span className="text-red-500">*</span></h2>
                    </div>
                    
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200">
                      {(['LEVEL_I', 'LEVEL_II', 'LEVEL_III', 'LEVEL_IV', 'LEVEL_V'] as const).map(levelKey => {
                        const levelDisplay = levelKey.split('_')[1];
                        return (
                          <div key={levelKey} className="space-y-2">
                            <h3 className={cn(
                              "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full inline-block",
                              levelDisplay === 'I' ? "bg-red-600 text-white" : 
                              levelDisplay === 'II' ? "bg-orange-500 text-white" :
                              levelDisplay === 'III' ? "bg-yellow-500 text-white" :
                              levelDisplay === 'IV' ? "bg-green-500 text-white" :
                              "bg-blue-500 text-white"
                            )}>
                              Nivel {levelDisplay}
                            </h3>
                            <div className="grid grid-cols-1 gap-2">
                              {FINDINGS[levelKey].map(f => {
                                const isSelected = patient.findings?.includes(f);
                                return (
                                  <label
                                    key={f}
                                    className={cn(
                                      "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                                      isSelected 
                                        ? "bg-blue-50 border-blue-500 ring-1 ring-blue-500 text-blue-800 shadow-sm" 
                                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                                    )}
                                  >
                                    <input 
                                      type="checkbox"
                                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                      checked={isSelected}
                                      onChange={() => {
                                        const current = patient.findings || [];
                                        const next = isSelected 
                                          ? current.filter(item => item !== f)
                                          : [...current, f];
                                        setPatient({...patient, findings: next});
                                      }}
                                    />
                                    <span className="text-xs font-semibold leading-tight">{f}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                      <div className="space-y-2 pt-4 border-t border-slate-100">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <Plus size={16} className="text-blue-600" />
                          Otros Síntomas / Observaciones
                        </label>
                        <textarea 
                          className="w-full p-4 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[80px] text-sm"
                          placeholder="Escriba aquí otros síntomas o detalles relevantes..."
                          value={patient.otherSymptoms}
                          onChange={e => setPatient({...patient, otherSymptoms: e.target.value})}
                        />
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
                        "w-32 h-32 rounded-full flex items-center justify-center mb-4 shadow-2xl animate-pulse",
                        currentTriage.level === 'I' ? "bg-red-600" :
                        currentTriage.level === 'II' ? "bg-orange-500" :
                        currentTriage.level === 'III' ? "bg-yellow-400 text-slate-900" :
                        currentTriage.level === 'IV' ? "bg-green-500" :
                        "bg-blue-500"
                      )}>
                        <span className="text-6xl font-black">{currentTriage.level}</span>
                      </div>
                      <h2 className={cn(
                        "text-3xl font-black mb-2",
                        currentTriage.level === 'I' ? "text-red-600" :
                        currentTriage.level === 'II' ? "text-orange-600" :
                        currentTriage.level === 'III' ? "text-yellow-600" :
                        currentTriage.level === 'IV' ? "text-green-600" :
                        "text-blue-600"
                      )}>
                        {currentTriage.priority}
                      </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md mx-auto">
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Tiempo de Atención</p>
                        <p className="text-lg font-black text-slate-800">{currentTriage.wait}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Destino Sugerido</p>
                        <p className="text-lg font-black text-slate-800">{currentTriage.destination}</p>
                      </div>
                    </div>

                    <div className="bg-slate-900 text-white p-6 rounded-3xl text-left space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold flex items-center gap-2">
                          <FileText size={18} className="text-blue-400" />
                          Resumen para HC Electrónica
                        </h3>
                        <button 
                          onClick={() => navigator.clipboard.writeText(getSummaryText(patient as PatientData))}
                          className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded-full transition-colors"
                        >
                          Copiar Texto
                        </button>
                      </div>
                      <pre className="text-[10px] font-mono text-slate-300 whitespace-pre-wrap bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                        {getSummaryText(patient as PatientData)}
                      </pre>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Navigation Buttons */}
              <div className="flex justify-between mt-12 pt-8 border-t border-slate-100">
                {step > 1 && step < 5 && (
                  <button 
                    onClick={handleBack}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    <ChevronLeft size={20} /> Atrás
                  </button>
                )}
                <div className="flex-1" />
                {step < 5 ? (
                  <button 
                    onClick={handleNext}
                    disabled={!isStepValid()}
                    className="flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Siguiente <ChevronRight size={20} />
                  </button>
                ) : (
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setStep(1)}
                      className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all"
                    >
                      Editar
                    </button>
                    <button 
                      onClick={finalizeTriage}
                      className="flex items-center gap-2 bg-green-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-green-200 hover:bg-green-700 transition-all"
                    >
                      Finalizar Registro <CheckCircle2 size={20} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* Sidebar: History & Timers & Integrations */}
        <aside className="space-y-6 w-full lg:max-w-[340px]">
          {/* Navigation Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <button
              onClick={() => setSidebarTab('pacientes')}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                sidebarTab === 'pacientes'
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              <User size={14} className={sidebarTab === 'pacientes' ? 'text-blue-600' : ''} />
              Pacientes
            </button>
            <button
              onClick={() => setSidebarTab('database')}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                sidebarTab === 'database'
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              <Database size={14} className={sidebarTab === 'database' ? 'text-blue-600' : ''} />
              Supabase
            </button>
            <button
              onClick={() => setSidebarTab('despliegue')}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                sidebarTab === 'despliegue'
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              <Globe size={14} className={sidebarTab === 'despliegue' ? 'text-blue-600' : ''} />
              Hostinger / Git
            </button>
          </div>

          {/* Sync Status Notifications inside Sidebar */}
          {dbSuccessMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-green-50 border border-green-200 text-green-800 text-[11px] rounded-xl font-bold flex items-center gap-2"
            >
              <CheckCircle2 size={14} className="text-green-600 shrink-0" />
              <span>{dbSuccessMessage}</span>
            </motion.div>
          )}

          {dbErrorMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-red-50 border border-red-200 text-red-800 text-[11px] rounded-xl font-bold flex items-center gap-2"
            >
              <AlertCircle size={14} className="text-red-600 shrink-0" />
              <span>{dbErrorMessage}</span>
            </motion.div>
          )}

          {/* Tab 1: Pacientes en Espera */}
          {sidebarTab === 'pacientes' && (
            <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
                  <Timer size={20} className="text-blue-600" />
                  Pacientes en Espera
                </h2>
                
                {isSupabaseConfigured && (
                  <button
                    onClick={triggerManualSync}
                    disabled={isSyncing}
                    title="Sincronizar base de datos remota"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw size={14} className={cn(isSyncing && "animate-spin")} />
                  </button>
                )}
              </div>

              {isSupabaseConfigured && (
                <div className="text-[10px] bg-green-50 text-green-800 px-3 py-2 rounded-xl border border-green-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span>Conectado a Base de Datos Supabase</span>
                  </div>
                </div>
              )}

              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {history.length === 0 ? (
                  <div className="text-center py-10 text-slate-400">
                    <p className="text-sm italic">No hay pacientes registrados</p>
                  </div>
                ) : (
                  history.map(p => {
                    const minutesIn = differenceInMinutes(currentTime, new Date(p.arrivalDate));
                    const hoursIn = differenceInHours(currentTime, new Date(p.arrivalDate));
                    
                    // Alert logic: 4h for Level I/II (Resuscitation/Emergency), 12h for Level III (Urgent)
                    const isAlert = ((p.triageLevel === 'I' || p.triageLevel === 'II') && hoursIn >= 4) || 
                                    (p.triageLevel === 'III' && hoursIn >= 12);

                    return (
                      <div key={p.id} className={cn(
                        "p-4 rounded-2xl border transition-all",
                        isAlert ? "bg-red-50 border-red-200 animate-pulse" : "bg-slate-50 border-slate-100"
                      )}>
                        <div className="flex justify-between items-start mb-2">
                          <span className={cn(
                            "text-[10px] font-black px-2 py-0.5 rounded-full text-white",
                            p.triageLevel === 'I' ? "bg-red-600" :
                            p.triageLevel === 'II' ? "bg-orange-500" :
                            p.triageLevel === 'III' ? "bg-yellow-500 text-slate-900" :
                            p.triageLevel === 'IV' ? "bg-green-600" :
                            "bg-blue-600"
                          )}>
                            NIVEL {p.triageLevel}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">{p.id}</span>
                        </div>
                        <p className="font-bold text-slate-800 truncate">{p.name}</p>
                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center gap-1 text-slate-500">
                            <Clock size={12} />
                            <span className="text-xs font-bold">
                              {hoursIn}h {minutesIn % 60}m
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => generatePDF(p)}
                              className="p-2 bg-white rounded-lg border border-slate-200 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
                              title="Descargar PDF"
                            >
                              <Download size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Supabase database guide & status */}
          {sidebarTab === 'database' && (
            <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 space-y-4 text-left">
              <h2 className="text-base font-bold flex items-center gap-2 text-slate-800">
                <Database size={18} className="text-blue-600 animate-pulse" />
                Configuración Supabase
              </h2>

              <div className={cn(
                "p-3 rounded-2xl border text-xs font-bold flex items-center justify-between",
                isSupabaseConfigured 
                  ? "bg-green-50 border-green-200 text-green-800" 
                  : "bg-amber-50 border-amber-200 text-amber-800"
              )}>
                <span>Estado: {isSupabaseConfigured ? 'Conectado / Activo' : 'Pendiente o Local'}</span>
                <span className={cn("w-2 h-2 rounded-full", isSupabaseConfigured ? "bg-green-500" : "bg-amber-500")} />
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Este sistema guarda los registros en <code className="bg-slate-100 px-1 rounded text-red-600 font-bold">localStorage</code> por defecto de manera local offline. Para activarle persistencia centralizada en Supabase:
              </p>

              <div className="space-y-2 text-xs text-slate-600">
                <p className="font-bold text-slate-800">1. Define los accesos en tu host o archivo .env:</p>
                <pre className="p-2.5 bg-slate-900 text-slate-300 rounded-xl font-mono text-[9px] block whitespace-pre overflow-x-auto border border-slate-800">
{`VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_clave_aqui`}
                </pre>

                <p className="font-bold text-slate-800 mt-3">2. Ejecuta esta tabla SQL en Supabase:</p>
                <div className="relative group">
                  <pre className="p-2.5 bg-slate-900 text-slate-300 rounded-xl font-mono text-[9px] block whitespace-pre max-h-[160px] overflow-y-auto overflow-x-auto border border-slate-800 select-all">
{`create table triage_records (
  id text primary key,
  name text not null,
  age numeric,
  age_unit text not null,
  gender text not null,
  document_id text not null,
  arrival_date timestamp with time zone not null,
  type text not null,
  tep jsonb,
  vitals jsonb not null,
  findings text[] default '{}',
  other_symptoms text,
  triage_level text not null,
  original_priority text not null,
  wait_time text not null,
  suggested_destination text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Políticas RLS libres de lectura/escritura pública
alter table triage_records enable row level security;
create policy "Allow insert" on triage_records for insert with check (true);
create policy "Allow select" on triage_records for select using (true);`}
                  </pre>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`create table triage_records (
  id text primary key,
  name text not null,
  age numeric,
  age_unit text not null,
  gender text not null,
  document_id text not null,
  arrival_date timestamp with time zone not null,
  type text not null,
  tep jsonb,
  vitals jsonb not null,
  findings text[] default '{}',
  other_symptoms text,
  triage_level text not null,
  original_priority text not null,
  wait_time text not null,
  suggested_destination text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table triage_records enable row level security;
create policy "Allow insert" on triage_records for insert with check (true);
create policy "Allow select" on triage_records for select using (true);`);
                      alert('Código SQL copiado al portapapeles!');
                    }}
                    className="absolute right-2 top-2 bg-slate-800 hover:bg-slate-700 text-[10px] text-white px-2 py-1 rounded font-bold cursor-pointer"
                  >
                    Copiar SQL
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Hostinger and GitHub instructions */}
          {sidebarTab === 'despliegue' && (
            <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 space-y-4 text-left text-xs leading-relaxed text-slate-600">
              <h2 className="text-base font-bold flex items-center gap-2 text-slate-800">
                <Github size={18} className="text-blue-600" />
                Despliegue GitHub / Hostinger
              </h2>

              <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl text-[11px] text-blue-800 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <Globe size={13} className="text-blue-600" />
                  Dominio Destino:
                </p>
                <a 
                  href="https://triagegrierson.app.koradigital.net" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] break-all text-blue-700 underline hover:text-blue-950 font-bold block"
                >
                  triagegrierson.app.koradigital.net
                </a>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-1">
                    <span className="bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded-full text-[10px]">1</span>
                    Exportar a su GitHub
                  </h3>
                  <p className="mt-1 text-slate-500 text-[11px]">
                    Abra el menú <b>Settings (⚙️)</b> o el botón de exportar de la esquina superior derecha en Google AI Studio Build. Elija la opción de exportar directamente al repositorio GitHub que desee.
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-1">
                    <span className="bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded-full text-[10px]">2</span>
                    Compilar local o CI
                  </h3>
                  <p className="mt-1 text-slate-500 text-[11px]">
                    Este proyecto usa Vite. Ejecute en su terminal <code className="bg-slate-100 text-red-650 px-1 font-mono rounded">npm run build</code>. Esto producirá todos los archivos estáticos listos (HTML, JS, CSS) en la carpeta <code className="bg-slate-100 px-1 font-bold rounded">/dist</code>.
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-1">
                    <span className="bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded-full text-[10px]">3</span>
                    Subir a Hostinger
                  </h3>
                  <p className="mt-1 text-slate-500 text-[11px]">
                    <b>Opción Git (Recomendada):</b> En su panel hPanel de Hostinger, configure la sección de <b>Git</b>. Conéctelo a su repositorio de GitHub y asigne la sincronización para que al realizar commits en su rama principal se actualice automáticamente su sitio.
                  </p>
                  <p className="mt-1.5 text-slate-550 text-[11px]">
                    <b>Opción FTP / Administrador:</b> Abra el Administrador de Archivos de Hostinger o FTP para su dominio <code className="font-bold text-slate-700">triagegrierson.app.koradigital.net</code>, y arrastre/copie directamente todo el contenido compilado en <code className="bg-slate-100 px-1 font-bold rounded">/dist</code> adentro de la carpeta <code className="bg-slate-100 font-mono text-rose-500 px-0.5 rounded">public_html</code> de su subdominio o carpeta correspondiente.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Quick manual / info block */}
          <div className="bg-slate-900 p-6 rounded-3xl text-white shadow-xl shadow-slate-200/50">
            <h3 className="font-bold mb-2 flex items-center gap-2">
              <Info size={18} className="text-blue-400" />
              Manual CTAS / Canadiense
            </h3>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Este sistema implementa la escala CTAS de 5 niveles:
              1. Nivel I (Resucitación) - Crítico
              2. Nivel II (Emergencia) - 15 min
              3. Nivel III (Urgente) - 30 min
              4. Nivel IV/V (Observación)
            </p>
            <button 
              onClick={() => {
                setPatient(INITIAL_PATIENT);
                setStep(1);
              }}
              className="w-full mt-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus size={16} /> Nuevo Triaje
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

