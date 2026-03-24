import React, { useEffect, useMemo, useState } from 'react';
import { useChatStore } from './stores/chatStore';
import { MessageBubble } from './components/MessageBubble';
import { InputArea } from './components/InputArea';
import { useLogin, useMe, useKnowledge } from './api/hooks';
import { nanoid } from 'nanoid';

const quickCommands = [
  '帮我提交一笔差旅报销，金额 500 元，事由客户拜访',
  '我要请假一天，周五',
  '查一下陈敏的联系方式',
  '今天的日程安排是什么'
];

export default function App() {
  const { messages, setDocs } = useChatStore();
  const login = useLogin();
  const me = useMe();
  const [email, setEmail] = useState('lihua@example.com');
  const [password, setPassword] = useState('Passw0rd!');

  const onLogin = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">The Cognitive Editorial</div>
        <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
          Phase 1 MVP · 聊天 / 请假 / 报销 / 通讯录 / 知识库
        </div>
        <button className="nav-button" onClick={() => {
          setDocs([]);
          window.location.reload();
        }}>
          新建对话
        </button>
        <div style={{ marginTop: 20, color: '#94a3b8', fontSize: 13 }}>快捷指令</div>
        {quickCommands.map(q => (
          <button key={q} className="nav-button" onClick={() => {
            const evt = new Event('quick-command');
            (evt as any).detail = q;
            window.dispatchEvent(evt);
          }}>
            {q}
          </button>
        ))}
        <div style={{ marginTop: 20 }}>
          <div style={{ color: '#94a3b8', marginBottom: 6 }}>登录</div>
          <form onSubmit={onLogin} style={{ display: 'grid', gap: 8 }}>
            <input className="input-area" style={{ minHeight: 36 }} value={email} onChange={e => setEmail(e.target.value)} />
            <input className="input-area" style={{ minHeight: 36 }} type="password" value={password} onChange={e => setPassword(e.target.value)} />
            <button className="send-btn" type="submit" disabled={login.isPending}>{login.isPending ? '登录中…' : '登录'}</button>
            {me.data && <div style={{ color: '#4ade80', fontSize: 13 }}>已登录：{me.data.name} ({me.data.role})</div>}
          </form>
        </div>
      </aside>
      <main className="main">
        <section className="chat-feed">
          {messages.length === 0 && <EmptyState />}
          {messages.map(m => (
            <MessageBubble key={m.id} message={m} />
          ))}
        </section>
        <InputWithQuickCommands />
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ alignSelf: 'center', color: '#94a3b8' }}>
      发送一句话开始：例如 “我想请年假 1 天” 或 “帮我报销打车费 200 元”
    </div>
  );
}

function InputWithQuickCommands() {
  return <InputArea />;
}
