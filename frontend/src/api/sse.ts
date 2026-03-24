type EventHandler = (event: { event: string; data: any }) => void;

export function openEventStream(url: string, params: Record<string, any>, onEvent: EventHandler) {
  const token = localStorage.getItem('accessToken');
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (Array.isArray(v)) {
      query.set(k, v.join(','));
    } else if (v !== undefined && v !== null) {
      query.set(k, String(v));
    }
  });
  if (token) query.set('token', token);

  const es = new EventSource(`${url}?${query.toString()}`);

  const parse = (ev: MessageEvent) => {
    try {
      return JSON.parse(ev.data);
    } catch {
      return ev.data;
    }
  };

  es.addEventListener('text', ev => onEvent({ event: 'text', data: parse(ev as MessageEvent) }));
  es.addEventListener('skill', ev => onEvent({ event: 'skill', data: parse(ev as MessageEvent) }));
  es.addEventListener('done', ev => onEvent({ event: 'done', data: parse(ev as MessageEvent) }));
  es.addEventListener('error', ev => onEvent({ event: 'error', data: parse(ev as MessageEvent) }));
  es.addEventListener('warning', ev => onEvent({ event: 'warning', data: parse(ev as MessageEvent) }));

  es.onerror = () => {
    onEvent({ event: 'error', data: { message: '连接失败，请检查登录或网络' } });
    es.close();
  };

  return es;
}
