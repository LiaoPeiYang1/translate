import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';
import { openEventStream } from '../api/sse';

export function InputArea() {
  const [content, setContent] = useState('');
  const [connecting, setConnecting] = useState(false);
  const controllerRef = useRef<EventSource | null>(null);
  const { addUserMessage, appendAssistant, attachSkill, markDone, failLast, contextDocs, toggleDoc } = useChatStore();

  useEffect(() => {
    const handler = (evt: any) => setContent(evt.detail as string);
    const retryHandler = (evt: any) => {
      const text = evt.detail as string;
      setContent(text);
      setTimeout(() => send(text), 0);
    };
    window.addEventListener('quick-command', handler);
    window.addEventListener('retry-message', retryHandler);
    return () => {
      window.removeEventListener('quick-command', handler);
      window.removeEventListener('retry-message', retryHandler);
    };
  }, []);

  const send = async (override?: string) => {
    const text = override ?? content;
    if (!text.trim()) return;
    const token = localStorage.getItem('accessToken');
    if (!token) {
      alert('请先登录后再发送消息');
      return;
    }
    addUserMessage(text);
    setConnecting(true);
    const docIds = contextDocs.filter(d => !d.bypassed).map(d => d.id);
    const es = openEventStream('/api/chat/stream', { content: text, contextDocIds: docIds }, event => {
      switch (event.event) {
        case 'text':
          appendAssistant(event.data.delta);
          break;
        case 'skill':
          attachSkill(event.data);
          break;
        case 'done':
          markDone(event.data.requiresDisclaimer);
          setConnecting(false);
          es.close();
          break;
        case 'error':
          failLast();
          setConnecting(false);
          es.close();
          break;
        case 'warning':
          appendAssistant(`\n[提示] ${event.data.message}`);
          break;
      }
    });
    controllerRef.current = es as any;
    setConnecting(false);
    setContent('');
  };

  return (
    <div className="input-panel">
      <div>
        <div className="chip-row">
          {contextDocs.map(doc => (
            <span key={doc.id} className={`chip ${doc.bypassed ? 'bypassed' : ''}`} onClick={() => toggleDoc(doc.id)}>
              {doc.name}
            </span>
          ))}
        </div>
        <textarea
          className="input-area"
          placeholder="和超级员工助手聊聊，支持报销、请假、通讯录查询…"
          value={content}
          onChange={e => setContent(e.target.value)}
        />
      </div>
      <button className="send-btn" onClick={() => send()}>{connecting ? '连接中…' : '发送'}</button>
    </div>
  );
}
