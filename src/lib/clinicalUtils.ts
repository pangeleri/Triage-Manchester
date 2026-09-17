import { PatientData, VitalSigns, TriageLevel, FINDINGS } from '../types';

export const getVitalsRange = (ageMonths: number, type: 'FR' | 'FC') => {
  if (type === 'FR') {
    if (ageMonths <= 3) return { normal: [30, 50], d1: [50, 60], d2: [60, 70] };
    if (ageMonths <= 12) return { normal: [25, 45], d1: [45, 55], d2: [55, 65] };
    if (ageMonths <= 36) return { normal: [20, 30], d1: [30, 40], d2: [40, 50] };
    if (ageMonths <= 72) return { normal: [18, 24], d1: [24, 30], d2: [30, 38] };
    if (ageMonths <= 144) return { normal: [14, 20], d1: [20, 25], d2: [25, 30] };
    if (ageMonths <= 216) return { normal: [12, 20], d1: [20, 25], d2: [25, 30] };
    return { normal: [12, 20], d1: [20, 24], d2: [24, 30] };
  } else {
    if (ageMonths <= 3) return { normal: [100, 160], d1: [160, 180], d2: [180, 200] };
    if (ageMonths <= 12) return { normal: [90, 150], d1: [150, 170], d2: [170, 190] };
    if (ageMonths <= 36) return { normal: [80, 130], d1: [130, 150], d2: [150, 170] };
    if (ageMonths <= 72) return { normal: [70, 110], d1: [110, 130], d2: [130, 150] };
    if (ageMonths <= 144) return { normal: [65, 105], d1: [105, 120], d2: [120, 135] };
    if (ageMonths <= 216) return { normal: [60, 100], d1: [100, 115], d2: [115, 130] };
    return { normal: [60, 100], d1: [100, 120], d2: [120, 140] };
  }
};

export const getVitalsDSLabel = (
  val: number | undefined,
  ageMonths: number | undefined,
  type: 'FR' | 'FC'
): { label: string; colorClass: string; key: string } => {
  if (val === undefined || val === null || isNaN(val) || val <= 0) {
    return { label: 'No calculado', colorClass: 'bg-slate-100 text-slate-500', key: 'no_calculado' };
  }
  const effectiveAge = (ageMonths !== undefined && ageMonths !== null && !isNaN(ageMonths)) ? ageMonths : 216;
  const range = getVitalsRange(effectiveAge, type);

  // Upper bounds
  if (val > range.d2[1]) {
    return { label: '> +2 DS (Crítico)', colorClass: 'bg-red-100 text-red-800 font-extrabold border-red-200', key: 'mayor_mas_2_ds_fuera_tabla' };
  }
  if (val > range.d1[1]) {
    return { label: '+2 DS (Alto)', colorClass: 'bg-orange-100 text-orange-800 font-bold border-orange-200', key: 'mas_2_ds' };
  }
  if (val > range.normal[1]) {
    return { label: '+1 DS (Elevado)', colorClass: 'bg-yellow-100 text-yellow-800 font-bold border-yellow-200', key: 'mas_1_ds' };
  }

  // Normal bound
  if (val >= range.normal[0]) {
    return { label: 'Normal', colorClass: 'bg-emerald-100 text-emerald-800 font-semibold border-emerald-200', key: 'normal' };
  }

  // Lower bounds
  const low1 = range.normal[0] * 0.75;
  const low2 = range.normal[0] * 0.5;

  if (val >= low1) {
    return { label: '-1 DS (Bajo)', colorClass: 'bg-yellow-100 text-yellow-800 font-bold border-yellow-200', key: 'menos_1_ds' };
  }
  if (val >= low2) {
    return { label: '-2 DS (Muy bajo)', colorClass: 'bg-orange-100 text-orange-800 font-bold border-orange-200', key: 'menos_2_ds' };
  }
  return { label: '< -2 DS (Crítico)', colorClass: 'bg-red-100 text-red-800 font-extrabold border-red-200', key: 'menor_menos_2_ds_fuera_tabla' };
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
      glucose: false,
    };
  }
  return {
    heartRate: true,
    respiratoryRate: true,
    systolicBP: false,
    diastolicBP: false,
    oxygenSaturation: false,
    temperature: false,
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
    glucose: undefined,
    avpu: 'A',
  };
  const ageMonths = data.age !== undefined ? data.age * (data.ageUnit === 'años' ? 12 : 1) : undefined;

  let suggestedLevelValue = 5;

  // --- 1. Bypass Crítico (Clinically Explicit or Manual Bypass) ---
  if (isManualBypassActive || data.estadoOperativo === 'preliminar_critico') {
    suggestedLevelValue = 1;
  }

  // --- 2. Triángulo de Evaluación Pediátrica (TEP) ---
  // 3 lados afectados -> Nivel I (Rojo)
  // 2 lados afectados -> Nivel II (Naranja)
  // 1 lado afectado -> Nivel III (Amarillo)
  if (data.type === 'pediatric' && data.tepStates) {
    const lados = getTepLadosAlterados(data);
    if (lados === 3) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 1);
    } else if (lados === 2) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 2);
    } else if (lados === 1) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 3);
    }
  }

  // --- 3. AVPU Neurological Modifier ---
  if (v.avpu !== undefined) {
    if (v.avpu === 'U') {
      suggestedLevelValue = Math.min(suggestedLevelValue, 1);
    } else if (v.avpu === 'P') {
      suggestedLevelValue = Math.min(suggestedLevelValue, 2);
    } else if (v.avpu === 'V') {
      suggestedLevelValue = Math.min(suggestedLevelValue, 3);
    }
  }

  // --- 4. Hemodynamics & Vital Signs Modifiers (SOLO FC, FR, TA) ---
  // NOTA CLÍNICA: La Temperatura, SpO2 y Glucemia NO modifican directamente la gravedad
  // del paciente; emiten alerta informativa para que el enfermero clasifique el problema en el paso 3.
  const effectiveAge = ageMonths !== undefined ? ageMonths : 216;
  const frRange = getVitalsRange(effectiveAge, 'FR');
  const fcRange = getVitalsRange(effectiveAge, 'FC');

  // Respiratory Rate (FR)
  if (v.respiratoryRate !== undefined) {
    if (v.respiratoryRate > frRange.d2[1] || v.respiratoryRate < frRange.normal[0] * 0.4) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 1);
    } else if (v.respiratoryRate > frRange.d1[1] || v.respiratoryRate < frRange.normal[0] * 0.6) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 2);
    } else if (v.respiratoryRate > frRange.normal[1] || v.respiratoryRate < frRange.normal[0]) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 3);
    }
  }

  // Heart Rate (FC)
  if (v.heartRate !== undefined) {
    if (v.heartRate > fcRange.d2[1] || v.heartRate < fcRange.normal[0] * 0.4) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 1);
    } else if (v.heartRate > fcRange.d1[1] || v.heartRate < fcRange.normal[0] * 0.6) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 2);
    } else if (v.heartRate > fcRange.normal[1] || v.heartRate < fcRange.normal[0]) {
      suggestedLevelValue = Math.min(suggestedLevelValue, 3);
    }
  }

  // Blood Pressure (Systolic - PAS)
  if (v.systolicBP !== undefined) {
    if (effectiveAge >= 216) {
      if (v.systolicBP < 80 || v.systolicBP >= 180) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 1);
      } else if (v.systolicBP < 90 || v.systolicBP >= 140) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 2);
      } else if (v.systolicBP >= 121 && v.systolicBP <= 139) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 3);
      }
    } else {
      const minPAS = effectiveAge <= 1 ? 60 : effectiveAge <= 12 ? 70 : effectiveAge <= 120 ? 70 + 2 * Math.floor(effectiveAge / 12) : 90;
      const maxPAS = effectiveAge <= 1 ? 90 : effectiveAge <= 12 ? 100 : effectiveAge <= 60 ? 110 : effectiveAge <= 144 ? 120 : 130;
      if (v.systolicBP < minPAS - 10 || v.systolicBP > maxPAS + 30) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 1);
      } else if (v.systolicBP < minPAS || v.systolicBP > maxPAS + 15) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 2);
      } else if (v.systolicBP > maxPAS) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 3);
      }
    }
  }

  // Blood Pressure (Diastolic - PAD)
  if (v.diastolicBP !== undefined) {
    if (effectiveAge >= 216) {
      if (v.diastolicBP < 40 || v.diastolicBP >= 110) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 1);
      } else if (v.diastolicBP < 50 || v.diastolicBP >= 90) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 2);
      } else if (v.diastolicBP < 60 || (v.diastolicBP >= 80 && v.diastolicBP <= 89)) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 3);
      }
    } else {
      const minPAD = effectiveAge <= 12 ? 40 : effectiveAge <= 60 ? 45 : effectiveAge <= 144 ? 55 : 60;
      const maxPAD = effectiveAge <= 12 ? 60 : effectiveAge <= 60 ? 65 : effectiveAge <= 144 ? 75 : 80;
      if (v.diastolicBP < minPAD - 10 || v.diastolicBP > maxPAD + 25) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 1);
      } else if (v.diastolicBP < minPAD - 5 || v.diastolicBP > maxPAD + 10) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 2);
      } else if (v.diastolicBP < minPAD || v.diastolicBP > maxPAD) {
        suggestedLevelValue = Math.min(suggestedLevelValue, 3);
      }
    }
  }

  // --- 5. Clinical Findings / Discriminators Modifiers ---
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
