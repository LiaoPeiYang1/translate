import type { SkillPayload } from '@app/types';

export type MessageStatus = 'sending' | 'delivered' | 'failed';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: MessageStatus;
  skill?: SkillPayload;
  requiresDisclaimer?: boolean;
}

export interface ContextDocChip {
  id: string;
  name: string;
  bypassed: boolean;
}
