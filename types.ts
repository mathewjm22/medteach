
export type StudentLevel = 'MS-1' | 'MS-2' | 'MS-3' | 'MS-4' | 'Intern (PGY-1)';

export interface CaseEntry {
  id: string;
  text: string;
  relevanceScore?: number;
}

export interface TeachingPoint {
  title: string;
  description: string;
  level: string;
  imageUrl?: string;
}

export enum TabType {
  LABS = 'Labs',
  DIAGNOSTICS = 'Diagnostics',
  TREATMENT = 'Treatment'
}
