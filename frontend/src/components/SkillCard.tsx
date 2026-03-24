import React from 'react';
import clsx from 'clsx';
import type { SkillPayload } from '@app/types';

type SkillCardState = 'filling' | 'confirming' | 'submitting' | 'submitted' | 'failed' | 'readonly';

interface SkillCardProps {
  title: string;
  state: SkillCardState;
  onConfirm?: () => Promise<void> | void;
  onCancel?: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  badge?: string;
}

export function SkillCard({ title, state, onConfirm, onCancel, children, footer, badge }: SkillCardProps) {
  return (
    <div className="card">
      <div className="card-head">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>{title}</span>
          {badge && <span className="pill">{badge}</span>}
          {state === 'submitted' && <span className="pill" style={{ background: '#4ade80' }}>已提交</span>}
          {state === 'failed' && <span className="pill" style={{ background: '#f87171' }}>失败</span>}
        </div>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>{state}</span>
      </div>
      {children}
      {footer}
      {state === 'confirming' && (
        <div className="confirm-bar">
          <button className="btn" onClick={onCancel}>取消</button>
          <button className="btn primary" onClick={onConfirm}>确认提交</button>
        </div>
      )}
    </div>
  );
}

export function StatusTag({ status }: { status: string }) {
  const cls = clsx('status-tag', {
    'status-pending': status === 'pending',
    'status-approved': status === 'approved',
    'status-rejected': status === 'rejected',
    'status-cancelled': status === 'cancelled'
  });
  return <span className={cls}>{status}</span>;
}

export function renderSkillCard(skill: SkillPayload) {
  switch (skill.skillType) {
    case 'leave':
      return <LeaveCard payload={skill.payload} />;
    case 'expense':
      return <ExpenseCard payload={skill.payload} />;
    case 'contact':
      return <ContactCard payload={skill.payload} />;
    case 'schedule':
      return <ScheduleCard payload={skill.payload} />;
    case 'doc_qa':
      return <DocQACard payload={skill.payload} />;
    default:
      return null;
  }
}

// lazy imports to avoid circular warnings
import { LeaveCard } from './skills/LeaveCard';
import { ExpenseCard } from './skills/ExpenseCard';
import { ContactCard } from './skills/ContactCard';
import { ScheduleCard } from './skills/ScheduleCard';
import { DocQACard } from './skills/DocQACard';
