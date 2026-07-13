import { PatientData, VitalSigns, TriageLevel, FINDINGS } from '../types';

export const getVitalsRange = (ageMonths: number, type: 'FR' | 'FC') => {
  if (type === 'FR') {
    if (ageMonths <= 6) return { normal: [30, 60], d1: [60, 70], d2: [70, 80] };
    if (ageMonths <= 12) return { normal: [25, 45], d1: [45, 55], d2: [55, 60] };
    if (ageMonths <= 36) return { normal: [20, 30], d1: [30, 35], d2: [35, 40] };
    if (ageMonths <= 72) return { normal: [16, 24], d1: [24, 28], d2: [28, 32] };
    return { normal: [14, 20], d1: [20, 24], d2: [24, 26] };
  } else {
    if (ageMonths <= 3) return { normal: [90, 180], d1: [180, 205], d2: [205, 230] };
    if (ageMonths <= 6) return { normal: [80, 160], d1: [160, 180], d2: [180, 210] };
    if (ageMonths <= 12) return { normal: [80, 140], d1: [140, 160], d2: [160, 180] };
    if (ageMonths <= 36) return { normal: [75, 130], d1: [130, 145], d2: [145, 165] };
    if (ageMonths <= 72) return { normal: [70, 110], d1: [110, 125], d2: [125, 140] };
    return { normal: [60, 90], d1: [90, 105], d2: [105, 120] };
  }
};

export const getVitalsDSLabel = (
  val: number | undefined,
  ageMonths: number,
  type: 'FR' | 'FC'
): { label: string; colorClass: string; key: string } => {
  if (val === undefined || val === null || isNaN(val) || val <= 0) {
    return { label: 'No calculado', colorClass: 'bg-slate-100 text-slate-500', key: 'no_calculado' };
  }
  const range = getVitalsRange(ageMonths, type);

  // Upper bounds
  if (val > range.d2[1]) {
    return { label: '> +2 DS (Crítico)', colorClass: 'bg-red-100 text-red-800 font-extrabold', key: 'mayor_mas_2_ds_fuera_tabla' };
  }
  if (val > range.d1[1]) {
    return { label: '+2 DS (Alto)', colorClass: 'bg-orange-100 text-orange-800 font-bold', key: 'mas_2_ds' };
  }
  if (val > range.normal[1]) {
    return { label: '+1 DS (Elevado)', colorClass: 'bg-yellow-100 text-yellow-800 font-bold', key: 'mas_1_ds' };
  }

  // Normal bound
  if (val >= range.normal[0]) {
    return { label: 'Normal', colorClass: 'bg-emerald-100 text-emerald-800 font-semibold', key: 'normal' };
  }

  // Lower bounds
  const low1 = range.normal[0] * 0.6;
  const low2 = range.normal[0] * 0.4;

  if (val >= low1) {
    return { label: '-1 DS (Bajo)', colorClass: 'bg-yellow-100 text-yellow-800 font-bold', key: 'menos_1_ds' };
  }
  if (val >= low2) {
    return { label: '-2 DS (Muy bajo)', colorClass: 'bg-orange-100 text-orange-800 font-bold', key: 'menos_2_ds' };
  }
  return { label: '< -2 DS (Crítico)', colorClass: 'bg-red-100 text-red-800 font-extrabold', key: 'menor_menos_2_ds_fuera_tabla' };
};

export const getTepLadosAlterados = (data: Partial<PatientData>) => {
  if (!data.tepStates) return 0;
  const { apariencia, respiracion, circulacion } = data.tepStates;
  let count = 0;
  if (apariencia === 'alterado') count++;
  if (respiracion === 'alterado') count++;
  if (circulacion === 'alterado') count++;
  return count;
};

export const getTepLadosList = (data: Partial<PatientData>) => {
  if (!data.tepStates) return [];
  const list = [];
  if (data.tepStates.apariencia === 'alterado') list.push('Apariencia');
  if (data.tepStates.respiracion === 'alterado') list.push('Respiración');
  if (data.tepStates.circulacion === 'alterado') list.push('Circulación');
  return list;
};

export const getVitalsRequirementsByLevel = (levelStr: TriageLevel) => {
  const levelNum = levelStr === 'I' ? 1 : levelStr === 'II' ? 2 : levelStr === 'III' ? 3 : levelStr === 'IV' ? 4 : 5;

  if ([1, 2, 3].includes(levelNum)) {
    return {
      heartRate: true,
      respiratoryRate: true,
      systolicBP: true,
      diastolicBP: true,
      oxygenSaturation: true,
      temperature: true,
      glasgow: false,
      glucose: true,
    };
  }
  return {
    heartRate: true,
    respiratoryRate: true,
    systolicBP: false,
    diastolicBP: false,
    oxygenSaturation: false,
    temperature: false,
    glasgow: false,
    glucose: false,
  };
};

export const calculateTriage = (
  data: Partial<PatientData>,
  isManualBypassActive: boolean = false
): { level: TriageLevel; priority: string; wait: string; destination: string } => {
  const v = data.vitals || {
    heartRate: undefined,
    respiratoryRate: undefined,
    systolicBP: undefined,
    diastolicBP: undefined,
    oxygenSaturation: undefined,
    temperature: undefined,
    glasgow: 15,
    glucose: undefined,
  };
  const ageMonths = (data.age || 0) * (data.ageUnit === 'años' ? 12 : 1);

  let suggestedLevelValue = 5;

  // --- 1. Bypass Crítico (Clinically Explicit or Manual Bypass) ---
  if (isManualBypassActive || data.estadoOperativo === 'preliminar_critico') {
    suggestedLevelValue = 1;
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

  // --- 4. Hemodynamics & Vital Signs Modifiers (Pediatric-Only) ---
  const frRange = getVitalsRange(ageMonths, 'FR');
  const fcRange = getVitalsRange(ageMonths, 'FC');

  // Respiratory Rate
  if (v.respiratoryRate !== undefined) {
    if (v.respiratoryRate > frRange.d2[1] * 1.2 || v.respiratoryRate < frRange.normal[0] * 0.4) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 1);
    } else if (v.respiratoryRate > frRange.d2[1] || v.respiratoryRate < frRange.normal[0] * 0.6) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 2);
    } else if (v.respiratoryRate > frRange.d1[1] || v.respiratoryRate < frRange.normal[0]) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 3);
    }
  }

  // Heart Rate
  if (v.heartRate !== undefined) {
    if (v.heartRate > fcRange.d2[1] * 1.3 || v.heartRate < fcRange.normal[0] * 0.4) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 1);
    } else if (v.heartRate > fcRange.d2[1] || v.heartRate < fcRange.normal[0] * 0.6) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 2);
    } else if (v.heartRate > fcRange.d1[1] || v.heartRate < fcRange.normal[0]) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 3);
    }
  }

  // --- 5. Temperature Modifiers (Pediatric) ---
  if (v.temperature !== undefined) {
    if (v.temperature < 32 || v.temperature >= 41) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 1);
    } else if (v.temperature < 35 || v.temperature >= 38.5) {
      const isFeverWithSirs = v.temperature >= 38.5 && (
        (v.heartRate && v.heartRate > fcRange.normal[1]) || 
        (v.respiratoryRate && v.respiratoryRate > frRange.normal[1])
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
