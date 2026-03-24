import React from 'react';
import { SkillCard } from '../SkillCard';
import type { ScheduleItem } from '@app/types';

export function ScheduleCard({ payload }: { payload: ScheduleItem[] }) {
  return (
    <SkillCard title="今日日程" state="readonly">
      <div style={{ display: 'grid', gap: 8 }}>
        {payload.map(item => (
          <div key={item.time} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#0b1222', borderRadius: 12 }}>
            <span style={{ color: '#5dd8ff', fontWeight: 600 }}>{item.time}</span>
            <div style={{ textAlign: 'right' }}>
              <div>{item.title}</div>
              {item.location && <div style={{ color: '#94a3b8', fontSize: 12 }}>{item.location}</div>}
            </div>
          </div>
        ))}
      </div>
    </SkillCard>
  );
}
