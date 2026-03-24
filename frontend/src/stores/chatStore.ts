import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { nanoid } from 'nanoid';
import type { Message, ContextDocChip } from '../types';
import type { SkillPayload } from '@app/types';

interface ChatState {
  messages: Message[];
  contextDocs: ContextDocChip[];
  addUserMessage: (content: string) => Message;
  appendAssistant: (delta: string) => void;
  attachSkill: (skill: SkillPayload) => void;
  markDone: (requiresDisclaimer?: boolean) => void;
  failLast: () => void;
  findLastSendingUserIndex: () => number;
  toggleDoc: (id: string) => void;
  setDocs: (docs: ContextDocChip[]) => void;
}

export const useChatStore = create<ChatState>()(
  immer((set, get) => ({
    messages: [],
    contextDocs: [],
    addUserMessage: content => {
      const message: Message = {
        id: nanoid(),
        role: 'user',
        content,
        status: 'sending'
      };
      set(state => {
        state.messages.push(message);
      });
      return message;
    },
    appendAssistant: delta => {
      set(state => {
        const last = state.messages[state.messages.length - 1];
        if (!last || last.role === 'user') {
          state.messages.push({ id: nanoid(), role: 'assistant', content: delta, status: 'delivered' });
          return;
        }
        last.content += delta;
      });
    },
    attachSkill: skill => {
      set(state => {
        const last = state.messages[state.messages.length - 1];
        if (!last || last.role === 'user') {
          state.messages.push({ id: nanoid(), role: 'assistant', content: '', skill, status: 'delivered' });
        } else {
          last.skill = skill;
        }
      });
    },
    markDone: requiresDisclaimer => {
      set(state => {
        const last = state.messages[state.messages.length - 1];
        if (last && last.role === 'assistant') {
          last.requiresDisclaimer = requiresDisclaimer;
        }
        for (let i = state.messages.length - 1; i >= 0; i--) {
          const m = state.messages[i];
          if (m.role === 'user' && m.status === 'sending') {
            m.status = 'delivered';
            break;
          }
        }
      });
    },
    failLast: () => {
      set(state => {
        for (let i = state.messages.length - 1; i >= 0; i--) {
          const m = state.messages[i];
          if (m.role === 'user' && m.status === 'sending') {
            m.status = 'failed';
            break;
          }
        }
      });
    },
    findLastSendingUserIndex: () => {
      const msgs = get().messages;
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m.role === 'user' && m.status === 'failed') return i;
      }
      return -1;
    },
    toggleDoc: id => {
      set(state => {
        const doc = state.contextDocs.find(d => d.id === id);
        if (doc) doc.bypassed = !doc.bypassed;
      });
    },
    setDocs: docs => set({ contextDocs: docs })
  }))
);
