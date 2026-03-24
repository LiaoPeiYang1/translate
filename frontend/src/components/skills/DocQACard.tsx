import React from 'react';
import { SkillCard } from '../SkillCard';

export function DocQACard({ payload }: { payload: { answer: string; sources: string[] } }) {
  return (
    <SkillCard title="基于文档的回答" state="readonly">
      <div style={{ lineHeight: 1.6 }}>{payload.answer}</div>
      <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 13 }}>来源: {payload.sources.join(', ')}</div>
    </SkillCard>
  );
}
