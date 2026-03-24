import React from 'react';
import { Message } from '../types';
import { renderSkillCard } from './SkillCard';

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`bubble ${isUser ? 'user' : 'ai'}`}>
      {!isUser && message.requiresDisclaimer && (
        <div style={{ background: '#0b1222', padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 8 }}>
          本回答涉及规章制度，供内部参考，请以公司最新政策为准。
        </div>
      )}
      {message.content && <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{message.content}</div>}
      {message.skill && renderSkillCard(message.skill)}
      {isUser && message.status === 'failed' && (
        <div style={{ color: '#f87171', marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>发送失败</span>
          <button
            className="btn"
            style={{ padding: '6px 10px' }}
            onClick={() => {
              const evt = new Event('retry-message');
              (evt as any).detail = message.content;
              window.dispatchEvent(evt);
            }}
          >
            重试
          </button>
        </div>
      )}
    </div>
  );
}
