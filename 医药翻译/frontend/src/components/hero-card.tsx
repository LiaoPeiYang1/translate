export function HeroCard() {
  return (
    <section className="hero-card">
      <div>
        <span className="eyebrow">Project Scaffold</span>
        <h2>已按医药翻译功能说明初始化项目骨架</h2>
        <p>
          当前页面用于承接后续的真实 API、术语库接入、文件处理和任务队列能力。
        </p>
      </div>
      <div className="hero-grid">
        <div className="metric-card">
          <strong>支持语种</strong>
          <span>中 / 英 / 日 / 韩 / 德 / 法</span>
        </div>
        <div className="metric-card">
          <strong>文件规则</strong>
          <span>单文件，100MB 以内</span>
        </div>
        <div className="metric-card">
          <strong>结果展示</strong>
          <span>保留原格式 + 同格式英文文档</span>
        </div>
      </div>
    </section>
  );
}
