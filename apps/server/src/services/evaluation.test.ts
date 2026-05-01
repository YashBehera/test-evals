import { expect, test, describe } from "bun:test";
import { 
  evaluateCase, 
  precisionRecallF1, 
  evaluateHallucinations 
} from "./evaluate.service";

describe("Evaluation Service", () => {
  
  test("precisionRecallF1 correctness on a tiny synthetic case", () => {
    // 2 matches out of 3 predicted, 2 matches out of 2 gold
    const { precision, recall, f1 } = precisionRecallF1(2, 3, 2);
    
    expect(precision).toBeCloseTo(0.666, 2);
    expect(recall).toBe(1.0);
    expect(f1).toBeCloseTo(0.8, 2);
  });

  test("hallucination detector positive + negative", () => {
    const transcript = "Patient is taking Tylenol for pain.";
    
    // Negative (grounded)
    const extractionGrounded = {
      chief_complaint: "Pain",
      vitals: { bp: null, hr: null, temp_f: null, spo2: null },
      medications: [{ name: "Tylenol", dose: null, frequency: null, route: null }],
      diagnoses: [],
      plan: [],
      follow_up: { interval_days: null, reason: null }
    };
    const resGrounded = evaluateHallucinations(extractionGrounded as any, transcript);
    expect(resGrounded.hallucinationCount).toBe(0);

    // Positive (hallucinated)
    const extractionHallucinated = {
      ...extractionGrounded,
      medications: [{ name: "Amoxicillin", dose: null, frequency: null, route: null }]
    };
    const resHallucinated = evaluateHallucinations(extractionHallucinated as any, transcript);
    expect(resHallucinated.hallucinationCount).toBeGreaterThan(0);
    expect(resHallucinated.hallucinatedValues).toContain("Amoxicillin");
  });

  test("fuzzy med matching", () => {
    // This tests if the fuzzy logic in matchMed (indirectly via evaluateCase or similar) would work.
    // Since evaluateCase uses scoreMedications which uses matchSet, we check fuzzyScore directly.
    // Note: evaluate.service.ts has fuzzyScore but it's not exported. 
    // We'll test it through evaluateCase.
    
    const gold = {
      chief_complaint: "Cough",
      vitals: { bp: "120/80", hr: 70, temp_f: 98.6, spo2: 98 },
      medications: [{ name: "Lisinopril", dose: "10mg", frequency: "daily", route: "PO" }],
      diagnoses: [],
      plan: [],
      follow_up: { interval_days: null, reason: null }
    };

    const input = {
      id: "test",
      transcript: "Taking Lisinopril 10mg daily for BP.",
      gold,
      prediction: {
        ...gold,
        medications: [{ name: "Lisinopril", dose: "10 mg", frequency: "once daily", route: "oral" }]
      }
    };

    const res = evaluateCase(input as any);
    // Even with slightly different phrasing, it should match
    expect(res.scores.medications.f1).toBeGreaterThan(0.8);
  });

  test("vitals numeric tolerance", () => {
    const gold = {
      chief_complaint: "Cough",
      vitals: { bp: "120/80", hr: 70, temp_f: 98.6, spo2: 98 },
      medications: [],
      diagnoses: [],
      plan: [],
      follow_up: { interval_days: null, reason: null }
    };

    const input = {
      id: "test",
      transcript: "HR 71, Temp 98.7",
      gold,
      prediction: {
        ...gold,
        vitals: { bp: "120/80", hr: 71, temp_f: 98.7, spo2: 98 }
      }
    };

    const res = evaluateCase(input as any);
    // Vitals should score highly despite slight numeric differences
    expect(res.scores.vitals).toBeGreaterThan(0.9);
  });
});
