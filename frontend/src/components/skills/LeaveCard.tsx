import React, { useState, useMemo } from 'react';
import { SkillCard } from '../SkillCard';
import { api } from '../../api/client';
import type { LeavePayload } from '@app/types';
import { nanoid } from 'nanoid';

interface Props {
  payload: LeavePayload;
}

export function LeaveCard({ payload }: Props) {
  const [form, setForm] = useState(payload);
  const [state, setState] = useState<'filling' | 'confirming' | 'submitting' | 'submitted' | 'failed'>('filling');
  const [error, setError] = useState<string>();
  const idempotencyKey = useMemo(() => nanoid(), []);

  const submit = async () => {
    setState('submitting');
    try {
      await api.post('/api/skills/leave/submit', form, { headers: { 'Idempotency-Key': idempotencyKey } });
      setState('submitted');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || '提交失败');
      setState('failed');
    }
  };

  return (
    <SkillCard
      title="请假申请"
      state={state}
      onConfirm={submit}
      onCancel={() => setState('filling')}
      badge={`${form.type} · ${form.days} 天`}
      footer={error && <div style={{ color: '#f87171', marginTop: 8 }}>{error}</div>}
    >
      <div className="field">
        <label>起止日期</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="date" value={form.from} onChange={e => setForm({ ...form, from: e.target.value })} />
          <input type="date" value={form.to} onChange={e => setForm({ ...form, to: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label>天数</label>
        <input type="number" value={form.days} onChange={e => setForm({ ...form, days: Number(e.target.value) })} />
      </div>
      <div className="field">
        <label>事由</label>
        <textarea value={form.reason || ''} onChange={e => setForm({ ...form, reason: e.target.value })} />
      </div>
      {state === 'filling' && (
        <div className="confirm-bar">
          <button className="btn primary" onClick={() => setState('confirming')}>确认信息</button>
        </div>
      )}
    </SkillCard>
  );
}
