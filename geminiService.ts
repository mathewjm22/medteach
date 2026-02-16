import { GoogleGenAI, Type } from "@google/genai";
import { CaseEntry, StudentLevel, TeachingPoint } from "./types";

// Fallback to empty string if process.env.API_KEY is not defined via Vite's define
const API_KEY = process.env.API_KEY || '';

export const getTeachingPoints = async (diagnosis: string, level: StudentLevel): Promise<TeachingPoint[]> => {
  if (!API_KEY) {
    console.error("Gemini API Key is missing. Please check your environment variables.");
    return [];
  }
  
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `As a medical educator, generate 5-6 high-yield teaching points for the diagnosis: "${diagnosis}". 
    Tailor the complexity to a ${level} level. 
    Include one relevant visual description for each point that could be an image.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            level: { type: Type.STRING },
            imageUrl: { type: Type.STRING, description: "A high-quality Unsplash image keyword related to the medical concept" }
          },
          required: ["title", "description", "level"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse teaching points", e);
    return [];
  }
};

export const assessDifferentials = async (
  finalDiagnosis: string, 
  differentials: string[]
): Promise<number[]> => {
  if (!API_KEY) return differentials.map(() => 0);

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `The final diagnosis is "${finalDiagnosis}". 
    Rate how close each of the following differential diagnoses are to being correct or highly relevant in this clinical context. 
    Provide an array of integers representing percentages (0-100) in the exact same order.
    Differentials: ${differentials.join(', ')}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.NUMBER }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to assess differentials", e);
    return differentials.map(() => 0);
  }
};
