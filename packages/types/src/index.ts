export type Role = 'employee' | 'hr' | 'management';

export interface User {
  id: string;
  name: string;
  role: Role;
  email: string;
  phone?: string | null;
  passwordHash: string;
}

export type SkillType =
  | 'leave'
  | 'expense'
  | 'contact'
  | 'schedule'
  | 'doc_qa';

export interface SkillPayloadBase {
  title: string;
  summary?: string;
}

export interface LeavePayload extends SkillPayloadBase {
  type: 'annual' | 'sick' | 'other';
  from: string;
  to: string;
  days: number;
  reason?: string;
}

export interface ExpensePayload extends SkillPayloadBase {
  amount: number;
  currency: string;
  category: 'travel' | 'meal' | 'office' | 'other';
  date: string;
  memo?: string;
}

export interface ContactPayload extends SkillPayloadBase {
  employeeId: string;
}

export interface ScheduleItem {
  time: string;
  title: string;
  location?: string;
}

export type SkillPayload =
  | { skillType: 'leave'; payload: LeavePayload }
  | { skillType: 'expense'; payload: ExpensePayload }
  | { skillType: 'contact'; payload: ContactPayload }
  | { skillType: 'schedule'; payload: ScheduleItem[] }
  | { skillType: 'doc_qa'; payload: { answer: string; sources: string[] } };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export type SseEvent =
  | { event: 'text'; data: { delta: string } }
  | { event: 'skill'; data: SkillPayload }
  | { event: 'done'; data: { messageId: string; requiresDisclaimer?: boolean } }
  | { event: 'error'; data: { code: string; message: string } }
  | { event: 'warning'; data: { message: string } };

export interface ApiSuccess<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  error: { code: string; message: string };
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface KnowledgeDoc {
  id: string;
  userId: string;
  name: string;
  size: number;
  status: 'processing' | 'ready' | 'failed' | 'deleted';
  uploadedAt: string;
  failReason?: string;
}
