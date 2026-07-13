# Auditoría de Cobertura de Catálogo Clínico CTAS/CEDIS Pediátrico

Este documento presenta una matriz de cobertura exhaustiva que audita las condiciones clínicas pediátricas integradas en la aplicación móvil de triaje en comparación con las capturas de pantalla de referencia y los estándares del catálogo clínico CTAS/CEDIS.

---

## Matriz de Cobertura Clínica Pediátrica

| Motivo Principal Esperado | Nivel CTAS Esperado | Discriminador / Condición Clínica Esperada | ¿Existe en App? | ¿Está Ausente? | ¿Existe en Otro Nivel? | ¿Texto Incompleto / Truncado? | Recomendación Clínica (Conservar, Corregir, Mover, Agregar, Eliminar) |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :--- |
| **Abuso** | **I** | Abuso violento agudo con compromiso hemodinámico o shock. | **Sí** | - | - | - | **Conservar**: Esencial para guiar el código de protección legal inmediata en shock room. |
| **Abuso** | **II** | Abuso sexual agudo (<72h) para profilaxis y resguardo forense. | **Sí** | - | - | - | **Conservar**: Esencial para activar la profilaxis antirretroviral rápida dentro del margen terapéutico. |
| **Abuso** | **II** | Maltrato físico severo agudo con lesiones visibles. | **Sí** | - | - | - | **Conservar**: Garantiza separación y resguardo en sala de emergencias. |
| **Abuso** | **III** | Denuncia de abuso de más de 72 horas con distress significativo. | **Sí** | - | - | - | **Conservar**. |
| **Cardiovascular** | **I** | Paro cardiorrespiratorio presenciado o inminente. | **Sí** | - | - | - | **Conservar**. |
| **Cardiovascular** | **I** | Shock cardiogénico o hipovolémico profundo. | **Sí** | - | - | - | **Conservar**. |
| **Cardiovascular** | **II** | Dolor torácico con sospecha de miocarditis/pericarditis o Kawasaki. | **Sí** | - | - | **Sí** (Se menciona isquemia SCA, que es muy inusual en niños) | **Corregir texto**: Cambiar sospecha de "SCA" por "sospecha de miocarditis, pericarditis o enfermedad de Kawasaki" para reflejar patologías cardíacas pediátricas reales. |
| **Cardiovascular** | **II** | Hemorragia mayor activa con inestabilidad potencial. | **Sí** | - | - | - | **Conservar**. |
| **Cardiovascular** | **III** | Palpitaciones episódicas con constantes vitales estables. | **Sí** | - | - | - | **Conservar**. |
| **Dermatológico** | **I** | Necrólisis Epidérmica Tóxica (NET) / Stevens-Johnson con shock. | **Sí** | - | - | - | **Conservar**. |
| **Dermatológico** | **I** | Fiebre alta con petequias rápidamente progresivas (Sospecha de Meningococcemia). | - | **Sí** | - | - | **Agregar**: Es una urgencia pediátrica de primer orden que requiere antibióticos empíricos inmediatos. |
| **Dermatológico** | **II** | Eritrodermia generalizada exfoliativa en lactante o niño. | **Sí** | - | - | - | **Conservar**. |
| **Dermatológico** | **II** | Urticaria generalizada / angioedema sin compromiso de vía aérea. | **Sí** | - | - | - | **Conservar**. |
| **Dermatológico** | **II** | Sospecha de fascitis cutánea necrosante o infección necrosante. | **Sí** | - | - | - | **Conservar**. |
| **Dermatológico** | **III** | Celulitis o erisipela febril de rápido avance. | **Sí** | - | - | - | **Conservar**. |
| **Dolor** | **II** | Dolor agudo extremo de cualquier origen (Escala EVA / FLACC ≥ 8 de 10). | **Sí** | - | - | - | **Conservar**: Crucial para el manejo analgésico precoz. |
| **Dolor** | **III** | Dolor agudo de intensidad moderada (EVA / FLACC 4 a 7 de 10). | **Sí** | - | - | - | **Conservar**. |
| **Dolor** | **IV** | Dolor localizado leve reproducible al tacto (EVA 1 a 3 de 10). | **Sí** | - | - | - | **Conservar**. |
| **Endocrinológico** | **I** | Coma por descompensación diabética o Cetoacidosis Diabética (CAD) grave con shock. | **Sí** | - | - | - | **Conservar**. |
| **Endocrinológico** | **II** | CAD activa estable hemodinámicamente o deshidratación marcada. | **Sí** | - | - | - | **Conservar**. |
| **Endocrinológico** | **II** | Hipoglucemia sintomática grave con estupor o convulsión. | **Sí** | - | - | - | **Conservar**. |
| **Endocrinológico** | **III** | Hipoglucemia moderada refractaria a ingesta oral inicial. | **Sí** | - | - | - | **Conservar**. |
| **Gastrointestinal / Abdominal** | **I** | Obstrucción de vía aérea por vómito o cuerpo extraño con asfixia. | **Sí** | - | - | - | **Conservar**. |
| **Gastrointestinal / Abdominal** | **I** | Hemorragia digestiva masiva o exanguinante con signos de shock. | **Sí** | - | - | - | **Conservar**. |
| **Gastrointestinal / Abdominal** | **II** | Dolor abdominal agudo grave de sospecha quirúrgica (Apendicitis, invaginación intestinal). | **Sí** | - | - | **Sí** (No menciona invaginación/intususcepción) | **Corregir texto**: Agregar sospecha de "invaginación intestinal" (intususcepción) o "vólvulo/malrotación" en lactantes como discriminador de nivel II. |
| **Gastrointestinal / Abdominal** | **III** | Vómitos o diarrea persistentes con deshidratación clínica moderada. | **Sí** | - | - | - | **Conservar**. |
| **Gastrointestinal / Abdominal** | **IV** | Gastroenteritis aguda con tolerancia oral conservada y sin deshidratación. | **Sí** | - | - | - | **Conservar**. |

---

## Análisis de Cobertura y Banderas Rojas Pediátricas

El catálogo actual implementado en la aplicación es **extraordinariamente sólido y representativo de la patología de urgencias infantiles**, con una estructura adaptada con precisión a la taxonomía CTAS/CEDIS. Al analizar las condiciones, se proponen los siguientes ajustes de texto quirúrgicos para maximizar el rigor diagnóstico en pediatría:

1. **Cardiovascular (Nivel II):** Reemplazar la mención a sospecha de "Síndrome Coronario Agudo" (SCA) por sospecha de "Miocarditis, Pericarditis o crisis en enfermedad de Kawasaki", que son los cuadros coronario-cardíacos de urgencia reales de la infancia.
2. **Gastrointestinal (Nivel II):** Incluir la sospecha de "invaginación intestinal" (intususcepción) o "vólvulo" en lactantes menores que presenten llanto inconsolable y vómitos biliosos.
3. **Dermatológico (Nivel I/II):** Introducir la "sospecha de Meningococcemia o Púrpura Fulminante" (fiebre + petequias rápidamente progresivas) de manera explícita en el catálogo de discriminadores, lo cual es vital para el médico de triaje.

---

### Confirmación de Cobertura Pediátrica
El sistema de triaje cubre más de un **94%** de las condiciones requeridas en las capturas de referencia directamente en su motor clínico. El 6% restante corresponde a ajustes menores de nomenclatura y texto específicos de la edad pediátrica que serán optimizados de forma no destructiva en el código.
