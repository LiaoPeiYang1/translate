import React from 'react';
import { SkillCard } from '../SkillCard';
import type { ContactPayload } from '@app/types';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { ApiSuccess } from '@app/types';

interface Props {
  payload: ContactPayload;
}

export function ContactCard({ payload }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['contact', payload.employeeId],
    queryFn: async () => {
      const { data } = await api.get(`/api/skills/contact/${payload.employeeId}`);
      return (data as ApiSuccess<any>).data;
    }
  });

  return (
    <SkillCard title="通讯录" state="readonly" badge={payload.summary}>
      {isLoading && <div>加载中...</div>}
      {data && (
        <div style={{ display: 'grid', gap: 6 }}>
          <Row label="姓名" value={data.name} />
          <Row label="职位" value={data.title} />
          <Row label="部门" value={data.department} />
          <Row label="手机号" value={data.phone ?? '无权查看'} muted={!data.phone} />
          <Row label="邮箱" value={data.email ?? '无权查看'} muted={!data.email} />
          <Row label="工位" value={data.seat ?? '—'} />
          <Row label="薪资" value={data.salary ? `${data.salary} 元` : 'HR 可见'} muted={!data.salary} />
        </div>
      )}
    </SkillCard>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', color: muted ? '#94a3b8' : 'inherit' }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
