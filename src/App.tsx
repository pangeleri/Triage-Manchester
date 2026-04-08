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
  Timer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { format, differenceInMinutes, differenceInHours } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from './lib/utils';
import { FINDINGS, TriageLevel, PatientData, VitalSigns } from './types';

// --- Constants & Helpers ---

const INITIAL_VITALS: VitalSigns = {
  heartRate: undefined,
  respiratoryRate: undefined,
  systolicBP: undefined,
  diastolicBP: undefined,
  oxygenSaturation: undefined,
  temperature: undefined,
  glasgow: undefined,
};

const INITIAL_PATIENT: Partial<PatientData> = {
  name: '',
  age: undefined,
  ageUnit: 'años',
  gender: 'M',
  documentId: '',
  abcCheck: {
    airway: true,
    breathing: true,
    circulation: true,
  },
  vitals: INITIAL_VITALS,
  findings: [],
  otherSymptoms: '',
};

// --- Main Component ---

export default function App() {
  const [step, setStep] = useState(1);
  const [patient, setPatient] = useState<Partial<PatientData>>(INITIAL_PATIENT);
  const [history, setHistory] = useState<PatientData[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time for timers
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // --- Logic Functions ---

  const calculateTriage = (data: Partial<PatientData>): { level: TriageLevel; priority: string; wait: string; destination: string } => {
    // Step 1: ABC Check
    if (!data.abcCheck?.airway || !data.abcCheck?.breathing || !data.abcCheck?.circulation) {
      return { 
        level: 'ROJO', 
        priority: 'Prioridad I (Emergencia)', 
        wait: 'Inmediata (0 min)', 
        destination: 'Sala de Reanimación' 
      };
    }

    const v = data.vitals || INITIAL_VITALS;
    const age = data.age || 0;
    const isInfant = data.ageUnit === 'meses' && age <= 12;
    const isPreSchool = data.ageUnit === 'años' && age <= 5;

    // Step 2: Vital Signs Ranges
    let autoRed = false;
    
    // Helper to check if value exists and is in range
    const check = (val: number | undefined, min?: number, max?: number) => {
      if (val === undefined) return false;
      if (min !== undefined && val < min) return true;
      if (max !== undefined && val > max) return true;
      return false;
    };

    if (!isInfant && !isPreSchool) { // Adult
      if (check(v.respiratoryRate, 10, 35)) autoRed = true;
      if (check(v.heartRate, 50, 150)) autoRed = true;
      if (check(v.systolicBP, 90, 220)) autoRed = true;
      if (v.diastolicBP !== undefined && v.diastolicBP > 110) autoRed = true;
    } else if (isInfant) {
      if (check(v.heartRate, 61, 199)) autoRed = true; // FC <=60 or >=200
      if (age <= 2 && v.respiratoryRate !== undefined && v.respiratoryRate >= 60) autoRed = true;
      if (age > 2 && v.respiratoryRate !== undefined && v.respiratoryRate >= 50) autoRed = true;
      if (v.oxygenSaturation !== undefined && v.oxygenSaturation <= 85) autoRed = true;
    } else if (isPreSchool) {
      if (check(v.heartRate, 61, 179)) autoRed = true; // FC <=60 or >=180
      if (v.systolicBP !== undefined && v.systolicBP < 80) autoRed = true;
      if (v.respiratoryRate !== undefined && v.respiratoryRate > 40 && v.temperature !== undefined && v.temperature < 38) autoRed = true; 
      if (v.oxygenSaturation !== undefined && v.oxygenSaturation <= 85) autoRed = true;
    }

    if (autoRed || (v.glasgow !== undefined && v.glasgow < 9)) {
      return { 
        level: 'ROJO', 
        priority: 'Prioridad II (Muy Urgente)', 
        wait: '0-10 min', 
        destination: 'Sala de Observación Crítica' 
      };
    }

    // Step 3: Clinical Findings (Checkboxes)
    const selectedFindings = data.findings || [];
    
    const hasRojo = selectedFindings.some(f => FINDINGS.ROJO.includes(f));
    if (hasRojo) {
      return { 
        level: 'ROJO', 
        priority: 'Prioridad II (Muy Urgente)', 
        wait: '0-10 min', 
        destination: 'Sala de Emergencias' 
      };
    }

    const hasAmarillo = selectedFindings.some(f => FINDINGS.AMARILLO.includes(f));
    if (hasAmarillo) {
      return { 
        level: 'AMARILLO', 
        priority: 'Prioridad III (Urgente)', 
        wait: 'Máximo 60 min', 
        destination: 'Consultorio de Urgencias' 
      };
    }

    // Default to Green
    return { 
      level: 'VERDE', 
      priority: 'Prioridad IV/V (Estándar/No Urgente)', 
      wait: '120 min o Derivación', 
      destination: 'Consulta Externa / Sala de Espera' 
    };
  };

  const currentTriage = useMemo(() => calculateTriage(patient), [patient]);

  const isStepValid = () => {
    if (step === 1) {
      return patient.name && patient.age !== undefined && patient.documentId;
    }
    if (step === 2) {
      const v = patient.vitals;
      return v?.heartRate !== undefined && 
             v?.respiratoryRate !== undefined && 
             v?.systolicBP !== undefined && 
             v?.diastolicBP !== undefined && 
             v?.oxygenSaturation !== undefined && 
             v?.temperature !== undefined && 
             v?.glasgow !== undefined;
    }
    if (step === 3) {
      return (patient.findings && patient.findings.length > 0) || patient.otherSymptoms;
    }
    return true;
  };

  const handleNext = () => {
    if (isStepValid()) {
      setStep(s => s + 1);
    }
  };
  const handleBack = () => setStep(s => s - 1);

  const finalizeTriage = () => {
    const finalPatient: PatientData = {
      ...patient as PatientData,
      id: Math.random().toString(36).substr(2, 9).toUpperCase(),
      arrivalDate: new Date().toISOString(),
      triageLevel: currentTriage.level,
      originalPriority: currentTriage.priority,
      waitTime: currentTriage.wait,
      suggestedDestination: currentTriage.destination,
    };
    setHistory([finalPatient, ...history]);
    setPatient(INITIAL_PATIENT);
    setStep(1);
  };

  const generatePDF = (p: PatientData) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.text('HOSPITAL GRAL. DE AGUDOS "DRA. CECILIA GRIERSON"', 105, 20, { align: 'center' });
    doc.setFontSize(14);
    doc.text('FORMULARIO HCU-F053: REGISTRO DE TRIAJE MANCHESTER', 105, 30, { align: 'center' });
    
    // Patient Info
    doc.setFontSize(12);
    doc.text(`ID: ${p.id}`, 20, 45);
    doc.text(`Paciente: ${p.name}`, 20, 55);
    doc.text(`Documento: ${p.documentId}`, 120, 55);
    doc.text(`Edad: ${p.age} ${p.ageUnit}`, 20, 65);
    doc.text(`Género: ${p.gender}`, 120, 65);
    doc.text(`Fecha/Hora: ${format(new Date(p.arrivalDate), 'dd/MM/yyyy HH:mm')}`, 20, 75);

    // Triage Result
    doc.setFillColor(p.triageLevel === 'ROJO' ? 220 : p.triageLevel === 'AMARILLO' ? 255 : 34, 
                     p.triageLevel === 'ROJO' ? 38 : p.triageLevel === 'AMARILLO' ? 200 : 197, 
                     p.triageLevel === 'ROJO' ? 38 : p.triageLevel === 'AMARILLO' ? 0 : 94);
    doc.rect(20, 85, 170, 15, 'F');
    doc.setTextColor(p.triageLevel === 'AMARILLO' ? 0 : 255);
    doc.text(`CLASIFICACIÓN: ${p.triageLevel} - ${p.originalPriority}`, 105, 95, { align: 'center' });
    doc.setTextColor(0);

    // Vitals Table
    (doc as any).autoTable({
      startY: 110,
      head: [['Signo Vital', 'Valor']],
      body: [
        ['Frecuencia Cardíaca', `${p.vitals.heartRate ?? 'N/A'} lpm`],
        ['Frecuencia Respiratoria', `${p.vitals.respiratoryRate ?? 'N/A'} rpm`],
        ['Presión Arterial', `${p.vitals.systolicBP ?? 'N/A'}/${p.vitals.diastolicBP ?? 'N/A'} mmHg`],
        ['Saturación O2', `${p.vitals.oxygenSaturation ?? 'N/A'}%`],
        ['Temperatura', `${p.vitals.temperature ?? 'N/A'}°C`],
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

    return `
PRIORIDAD: ${triage.level} (${triage.priority})
DOCUMENTO: ${p.documentId || '---'}
SIGNOS VITALES: FC: ${p.vitals?.heartRate ?? '---'} lpm, FR: ${p.vitals?.respiratoryRate ?? '---'} rpm, PA: ${p.vitals?.systolicBP ?? '---'}/${p.vitals?.diastolicBP ?? '---'} mmHg, SatO2: ${p.vitals?.oxygenSaturation ?? '---'}%, T°: ${p.vitals?.temperature ?? '---'}°C
HALLAZGO PRINCIPAL: ${p.findings?.join(', ') || 'Ninguno'}${p.otherSymptoms ? ` (${p.otherSymptoms})` : ''}
ESCALA DE GLASGOW: ${p.vitals?.glasgow ?? '---'}/15
DESTINO SUGERIDO: ${triage.destination}
    `.trim();
  };

  // --- Render Helpers ---

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center space-x-4 mb-8">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all",
            step === i ? "bg-blue-600 text-white scale-110 shadow-lg" : 
            step > i ? "bg-green-500 text-white" : "bg-slate-200 text-slate-500"
          )}>
            {step > i ? <CheckCircle2 size={20} /> : i}
          </div>
          {i < 4 && <div className={cn("w-8 h-1 mx-2 rounded", step > i ? "bg-green-500" : "bg-slate-200")} />}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-600 rounded-xl text-white">
            <Activity size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Manchester Triage System</h1>
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
          <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
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
                      <h2 className="text-xl font-bold">Datos del Paciente <span className="text-red-500">*</span></h2>
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
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-slate-700">Edad <span className="text-red-500">*</span></label>
                          <input 
                            type="number" 
                            className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="---"
                            value={patient.age ?? ''}
                            onChange={e => setPatient({...patient, age: e.target.value ? parseInt(e.target.value) : undefined})}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-slate-700">Unidad</label>
                          <select 
                            className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            value={patient.ageUnit}
                            onChange={e => setPatient({...patient, ageUnit: e.target.value as any})}
                          >
                            <option value="años">Años</option>
                            <option value="meses">Meses</option>
                          </select>
                        </div>
                      </div>
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
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">Documento (DNI/CI) <span className="text-red-500">*</span></label>
                        <input 
                          type="text" 
                          className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          placeholder="Ej. 12345678"
                          value={patient.documentId}
                          onChange={e => setPatient({...patient, documentId: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="pt-6 border-t border-slate-100">
                      <div className="flex items-center gap-2 text-red-600 mb-4">
                        <AlertCircle size={24} />
                        <h2 className="text-xl font-bold">Evaluación Inicial ABC</h2>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                          { key: 'airway', label: 'Vía Aérea Permeable?' },
                          { key: 'breathing', label: 'Ventilación Adecuada?' },
                          { key: 'circulation', label: 'Circulación Estable?' },
                        ].map(check => (
                          <button
                            key={check.key}
                            onClick={() => setPatient({
                              ...patient, 
                              abcCheck: { ...patient.abcCheck!, [check.key]: !patient.abcCheck![check.key as keyof typeof patient.abcCheck] }
                            })}
                            className={cn(
                              "p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all",
                              patient.abcCheck![check.key as keyof typeof patient.abcCheck] 
                                ? "bg-green-50 border-green-200 text-green-700" 
                                : "bg-red-50 border-red-200 text-red-700 shadow-inner"
                            )}
                          >
                            <span className="text-xs font-bold uppercase tracking-wider">{check.label}</span>
                            <span className="text-lg font-black">{patient.abcCheck![check.key as keyof typeof patient.abcCheck] ? 'SÍ' : 'NO'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="flex items-center gap-2 text-blue-600 mb-4">
                      <Heart size={24} />
                      <h2 className="text-xl font-bold">Signos Vitales <span className="text-red-500">*</span></h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                      {[
                        { key: 'heartRate', label: 'FC (lpm)', icon: <Activity size={16} /> },
                        { key: 'respiratoryRate', label: 'FR (rpm)', icon: <Timer size={16} /> },
                        { key: 'systolicBP', label: 'PAS (mmHg)', icon: <Activity size={16} /> },
                        { key: 'diastolicBP', label: 'PAD (mmHg)', icon: <Activity size={16} /> },
                        { key: 'oxygenSaturation', label: 'SatO2 (%)', icon: <Info size={16} /> },
                        { key: 'temperature', label: 'T° (°C)', icon: <Stethoscope size={16} /> },
                        { key: 'glasgow', label: 'Glasgow', icon: <FileText size={16} /> },
                      ].map(v => (
                        <div key={v.key} className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 flex items-center gap-1 uppercase">
                            {v.icon} {v.label} <span className="text-red-500">*</span>
                          </label>
                          <input 
                            type="number" 
                            step={v.key === 'temperature' ? 0.1 : 1}
                            className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="---"
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
                      ))}
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
                      <Stethoscope size={24} />
                      <h2 className="text-xl font-bold">Motivos de Consulta <span className="text-red-500">*</span></h2>
                    </div>
                    
                    <div className="space-y-6">
                      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                        <label className="text-sm font-bold text-slate-700 block mb-4">
                          Seleccione los hallazgos clínicos (Manual Manchester):
                        </label>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {(['ROJO', 'AMARILLO', 'VERDE'] as const).map(level => (
                            <React.Fragment key={level}>
                              <div className="col-span-full mt-4 first:mt-0">
                                <h3 className={cn(
                                  "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full inline-block",
                                  level === 'ROJO' ? "bg-red-100 text-red-700" : 
                                  level === 'AMARILLO' ? "bg-yellow-100 text-yellow-700" :
                                  "bg-green-100 text-green-700"
                                )}>
                                  Prioridad {level}
                                </h3>
                              </div>
                              {FINDINGS[level].map(f => {
                                const isSelected = patient.findings?.includes(f);
                                return (
                                  <label
                                    key={f}
                                    className={cn(
                                      "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                                      isSelected 
                                        ? "bg-white border-blue-500 ring-1 ring-blue-500 text-blue-800 shadow-sm" 
                                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                                    )}
                                  >
                                    <input 
                                      type="checkbox"
                                      className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                      checked={isSelected}
                                      onChange={() => {
                                        const current = patient.findings || [];
                                        const next = isSelected 
                                          ? current.filter(item => item !== f)
                                          : [...current, f];
                                        setPatient({...patient, findings: next});
                                      }}
                                    />
                                    <span className="text-sm font-medium leading-tight">{f}</span>
                                  </label>
                                );
                              })}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 pt-4 border-t border-slate-100">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <Plus size={16} className="text-blue-600" />
                          Otros Síntomas / Observaciones
                        </label>
                        <textarea 
                          className="w-full p-4 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[100px]"
                          placeholder="Escriba aquí otros síntomas o detalles relevantes..."
                          value={patient.otherSymptoms}
                          onChange={e => setPatient({...patient, otherSymptoms: e.target.value})}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === 4 && (
                  <motion.div
                    key="step4"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-8 text-center"
                  >
                    <div className="inline-flex flex-col items-center">
                      <div className={cn(
                        "w-24 h-24 rounded-full flex items-center justify-center mb-4 shadow-2xl animate-pulse",
                        currentTriage.level === 'ROJO' ? "bg-red-600" :
                        currentTriage.level === 'AMARILLO' ? "bg-yellow-400" :
                        "bg-green-600"
                      )}>
                        <Activity size={48} className={currentTriage.level === 'AMARILLO' ? 'text-slate-900' : 'text-white'} />
                      </div>
                      <h2 className={cn(
                        "text-4xl font-black mb-2",
                        currentTriage.level === 'ROJO' ? "text-red-600" :
                        currentTriage.level === 'AMARILLO' ? "text-yellow-600" :
                        "text-green-600"
                      )}>
                        {currentTriage.level}
                      </h2>
                      <p className="text-xl font-bold text-slate-700">{currentTriage.priority}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md mx-auto">
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Tiempo de Espera</p>
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
                      <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                        {getSummaryText(patient as PatientData)}
                      </pre>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Navigation Buttons */}
              <div className="flex justify-between mt-12 pt-8 border-t border-slate-100">
                {step > 1 && step < 4 && (
                  <button 
                    onClick={handleBack}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    <ChevronLeft size={20} /> Atrás
                  </button>
                )}
                <div className="flex-1" />
                {step < 4 ? (
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

        {/* Sidebar: History & Timers */}
        <aside className="space-y-8">
          <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Timer size={20} className="text-blue-600" />
              Pacientes en Espera
            </h2>
            <div className="space-y-3">
              {history.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <p className="text-sm italic">No hay pacientes registrados</p>
                </div>
              ) : (
                history.map(p => {
                  const minutesIn = differenceInMinutes(currentTime, new Date(p.arrivalDate));
                  const hoursIn = differenceInHours(currentTime, new Date(p.arrivalDate));
                  
                  // Alert logic: 4h for Red/Orange, 12h for Yellow
                  const isAlert = (p.triageLevel === 'ROJO' && hoursIn >= 4) || 
                                  (p.triageLevel === 'AMARILLO' && hoursIn >= 12);

                  return (
                    <div key={p.id} className={cn(
                      "p-4 rounded-2xl border transition-all",
                      isAlert ? "bg-red-50 border-red-200 animate-pulse" : "bg-slate-50 border-slate-100"
                    )}>
                      <div className="flex justify-between items-start mb-2">
                        <span className={cn(
                          "text-[10px] font-black px-2 py-0.5 rounded-full",
                          p.triageLevel === 'ROJO' ? "bg-red-600 text-white" :
                          p.triageLevel === 'AMARILLO' ? "bg-yellow-400 text-slate-900" :
                          "bg-green-600 text-white"
                        )}>
                          {p.triageLevel}
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
                            className="p-2 bg-white rounded-lg border border-slate-200 text-slate-600 hover:text-blue-600 transition-colors"
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

          <div className="bg-blue-600 p-6 rounded-3xl text-white shadow-xl shadow-blue-200/50">
            <h3 className="font-bold mb-2 flex items-center gap-2">
              <Info size={18} />
              Manual Cecilia Grierson
            </h3>
            <p className="text-xs text-blue-100 leading-relaxed">
              Este sistema implementa la jerarquía de Manchester:
              1. ABC Checklist (Vital)
              2. Rangos de Signos Vitales (Crítico)
              3. Hallazgos Clínicos (Específico)
            </p>
            <button 
              onClick={() => {
                setPatient(INITIAL_PATIENT);
                setStep(1);
              }}
              className="w-full mt-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
            >
              <Plus size={16} /> Nuevo Triaje
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
