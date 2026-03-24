import React, { useMemo, useState } from 'react';
import { SkillCard } from '../SkillCard';
import type { ExpensePayload } from '@app/types';
import { api } from '../../api/client';
import { nanoid } from 'nanoid';

interface Props {
  payload: ExpensePayload;
}

export function ExpenseCard({ payload }: Props) {
  const [form, setForm] = useState(payload);
  const [state, setState] = useState<'filling' | 'confirming' | 'submitting' | 'submitted' | 'failed'>('filling');
  const [error, setError] = useState<string>();
  const idempotencyKey = useMemo(() => nanoid(), []);

  const submit = async () => {
    setState('submitting');
    try {
      await api.post('/api/skills/expense/submit', form, { headers: { 'Idempotency-Key': idempotencyKey } });
      setState('submitted');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || '提交失败');
      setState('failed');
    }
  };

  return (
    <SkillCard
      title="报销申请"
      state={state}
      onConfirm={submit}
      onCancel={() => setState('filling')}
      badge={`${form.category} · ${form.amount}${form.currency}`}
      footer={error && <div style={{ color: '#f87171', marginTop: 8 }}>{error}</div>}
    >
      <div className="field">
        <label>金额</label>
        <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} />
      </div>
      <div className="field">
        <label>类别</label>
        <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as ExpensePayload['category'] })}>
          <option value="travel">差旅</option>
          <option value="meal">餐饮</option>
          <option value="office">办公</option>
          <option value="other">其他</option>
        </select>
      </div>
      <div className="field">
        <label>日期</label>
        <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
      </div>
      <div className="field">
        <label>备注</label>
        <textarea value={form.memo || ''} onChange={e => setForm({ ...form, memo: e.target.value })} />
      </div>
      {state === 'filling' && (
        <div className="confirm-bar">
          <button className="btn primary" onClick={() => setState('confirming')}>确认信息</button>
        </div>
      )}
    </SkillCard>
  );
}
