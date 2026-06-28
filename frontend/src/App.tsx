import { useEffect, useState, useCallback, useRef } from 'react'
import './App.css'

// ===================== Design Tokens =====================
const FONT_CN = "'FZVDLJian', 'PingFang SC', 'Hiragino Sans GB', sans-serif"
const FONT_EN = "'OpticianSans', 'FZVDLJian', sans-serif"

const C = {
  bg: '#FFFFFF', bgSub: '#F8F8F6', line: '#E8E8E4', lineLight: '#F0F0EC',
  text: '#1A1A1A', textSub: '#6B6B5A', textMuted: '#BCBCB0',
  accent: '#38b6ff', blue: '#38b6ff', green: '#059669', red: '#DC2626', amber: '#D97706',
}

type Tab = 'train' | 'news' | 'org' | 'cases' | 'workbench'
type TrainSub = 'content' | 'comm' | 'struct'
interface User { email: string; name: string; userId: string }

// ===================== API Helper =====================
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')
async function api(path: string, opts?: RequestInit) {
  const res = await fetch(API_BASE + path, { headers: { 'Content-Type': 'application/json' }, ...opts })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}
const get = (p: string) => api(p)
const post = (p: string, body?: any) => api(p, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
const del_ = (p: string) => api(p, { method: 'DELETE' })

// ===================== Micro UI =====================
function Tag({ text, v = 'd', xs }: { text: string; v?: 'd' | 'b' | 'g' | 'r' | 'a' | 'k'; xs?: boolean }) {
  const m: Record<string, [string, string, string]> = {
    d: [C.bgSub, C.textSub, C.line],
    b: ['#EFF6FF', C.blue, '#BFDBFE'],
    g: ['#ECFDF5', C.green, '#A7F3D0'],
    r: ['#FEF2F2', C.red, '#FECACA'],
    a: ['#FFFBEB', C.amber, '#FDE68A'],
    k: [C.accent, '#fff', C.accent],
  }
  const [bg, color, border] = m[v]
  return <span style={{ display:'inline-flex', alignItems:'center', padding: xs ? '2px 7px' : '3px 10px', borderRadius: 20, fontSize: xs ? 10 : 11, fontWeight: 500, background: bg, color, border: `1px solid ${border}` }}>{text}</span>
}

function Divider() { return <div style={{ height: 1, background: C.line }} /> }

function Bar({ value, color = C.accent }: { value: number; color?: string }) {
  return (
    <div style={{ background: C.lineLight, borderRadius: 99, height: 3, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.8s ease' }} />
    </div>
  )
}

function Spinner() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
    <div style={{ width: 20, height: 20, border: `2px solid ${C.line}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
  </div>
}

function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t) }, [])
  return (
    <div style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: C.accent, color: '#fff', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 500, zIndex: 999, whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
      {msg}
    </div>
  )
}

// ===================== Splash =====================
function Splash({ onEnter }: { onEnter: () => void }) {
  const [vis, setVis] = useState(false)
  useEffect(() => { setTimeout(() => setVis(true), 60) }, [])
  return (
    <div
      onClick={onEnter}
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: '#38b6ff',
        opacity: vis ? 1 : 0,
        transition: 'opacity 0.5s ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      {/* SVG 贴底展示，宽度 100%，高度自动，不超过 90vh */}
      <img
        src="/splash.svg"
        alt="PR Daily"
        style={{
          width: '100%',
          maxHeight: '90vh',
          objectFit: 'contain',
          objectPosition: 'bottom',
          display: 'block',
          flexShrink: 0,
        }}
      />
      {/* 小提示文字 */}
      <div style={{
        position: 'absolute',
        bottom: 28,
        fontSize: 12,
        color: 'rgba(255,255,255,0.7)',
        letterSpacing: 1,
        pointerEvents: 'none',
      }}>点击屏幕任意位置进入</div>
    </div>
  )
}

// ===================== 训练 Tab =====================
const QUESTIONS: Record<TrainSub, Array<{ q: string; type: string; taskId?: number }>> = {
  content: [
    { q: '请为某国产手机品牌新旗舰（超薄5.8mm · 满血AI · 24h续航）撰写一条微博官宣，100字以内，需有互动感和话题标签。', type: '短文案撰写', taskId: 1 },
    { q: '领导明日参加行业峰会演讲，请将以下要点改写为3分钟开场白：\n① 行业进入AI重构期  ② 公司战略升级  ③ 感谢行业伙伴', type: '发言稿改写' },
    { q: '品牌微博被曝出疑似歧视性文案（已删除），请起草一份危机声明，不超过200字。', type: '危机声明' },
  ],
  comm: [
    { q: '记者提问（路透社）：\n\n"您好，贵公司近期多名中高层相继离职，有报道称与内部管理问题有关，官方如何回应？"', type: '媒体问答模拟', taskId: 2 },
    { q: '用户在小红书投诉：\n\n"你们产品质量太差了！用了不到一个月就坏了，客服态度极差，完全不解决问题，我要曝光！"', type: '用户投诉回复' },
    { q: '法务部突然要求暂停已定稿的品牌发布会稿件，距发布还有2小时，你如何推进跨部门协调？', type: '跨部门协作' },
  ],
  struct: [
    { q: '某奶茶品牌员工在社交媒体曝光不规范食品操作，视频迅速扩散，品牌陷入食品安全危机。\n\n请搭建完整的48h危机处置逻辑树（事实核查→内部决策→对外回应→后续管控）。', type: '危机逻辑树', taskId: 3 },
    { q: '公司计划Q3发起全国品牌焕新Campaign，预算充足但方向模糊。\n\n请搭建完整的公关方案框架（只需结构，不需填内容）。', type: '方案框架搭建' },
    { q: '媒体采访前，请针对"产品扩张进入新赛道"这一话题，梳理采访提纲（预设问题 + 建议回答方向）。', type: '采访提纲梳理' },
  ],
}
const SUBS: { key: TrainSub; label: string; icon: string; color: string }[] = [
  { key: 'content', label: '内容力', icon: '✦', color: C.blue },
  { key: 'comm', label: '沟通力', icon: '◎', color: C.green },
  { key: 'struct', label: '结构化思维', icon: '▦', color: C.amber },
]

function TrainTab({ toast }: { toast: (m: string) => void }) {
  const [sub, setSub] = useState<TrainSub>('content')
  const [qIdx, setQIdx] = useState(0)
  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{score:number,comment:string,example:string}|null>(null)
  const [tasks, setTasks] = useState<any[]>([])
  const [ability, setAbility] = useState({ content: 72, comm: 58, struct: 45 })
  const [history, setHistory] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, a] = await Promise.all([get('/api/train/tasks'), get('/api/train/ability')])
      setTasks(t); setAbility(a)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [])

  const curQ = QUESTIONS[sub][qIdx % QUESTIONS[sub].length]

  const handleSubmit = async () => {
    if (!answer.trim() || submitting) return
    setSubmitting(true)
    try {
      const res = await post('/api/train/submit', { sub, question_type: curQ.type, answer, task_id: curQ.taskId })
      if (res.score !== undefined) { setFeedback({ score: res.score, comment: res.comment || '', example: res.example || '' }) } else { setFeedback({ score: 7, comment: res.feedback || '已提交', example: '' }) }
      toast('✓ 提交成功，已记入训练档案')
      load()
    } catch { toast('提交失败，请重试') }
    setSubmitting(false)
  }

  const loadHistory = async () => {
    try { const h = await get('/api/train/history'); setHistory(h); setShowHistory(true) } catch {}
  }

  if (loading) return <Spinner />

  return (
    <div style={{ padding: '0 0 100px' }}>
      <div style={{ padding: '20px 20px 0' }}>
        {/* 能力进度 */}
        <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Today's Progress</div>
        {/* 三栏能力区 — 新8.svg(1568x500)，三格 y=147,h=238 */}
        <div style={{ position: 'relative', marginBottom: 24 }}>
          <img src="/icons/8.svg" alt="" style={{ width: '100%', height: 'auto', display: 'block' }} />
          {SUBS.map((s, idx) => (
            <div key={s.key} style={{
              position: 'absolute',
              top: '29.4%', bottom: '23%',
              left: idx === 0 ? '8.4%' : idx === 1 ? '36.9%' : '65.4%',
              width: '27.4%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#38b6ff', letterSpacing: -1, lineHeight: 1, fontFamily: FONT_EN }}>{(ability as any)[s.key]}</div>
              <div style={{ fontSize: 9, color: '#888', fontWeight: 600 }}>{s.label}</div>
              <div style={{ width: '65%' }}><Bar value={(ability as any)[s.key]} color='#38b6ff' /></div>
            </div>
          ))}
        </div>

        {/* 今日任务 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 1 }}>今日任务</div>
          <button onClick={loadHistory} style={{ fontSize: 11, color: C.blue, background: 'none', border: 'none', cursor: 'pointer' }}>查看历史 →</button>
        </div>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
          {tasks.map((t, i) => (
            <div key={t.id}>
              {i > 0 && <Divider />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${t.done ? C.accent : C.line}`, background: t.done ? C.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {t.done && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
                </div>
                <span style={{ flex: 1, fontSize: 13, color: t.done ? C.textMuted : C.text, textDecoration: t.done ? 'line-through' : 'none' }}>{t.label}</span>
                <Tag text={SUBS.find(s => s.key === t.sub)!.label} v={t.done ? 'd' : 'k'} xs />
              </div>
            </div>
          ))}
        </div>

        {/* 赛道切换 */}
        <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 1, marginBottom: 12 }}>训练赛道</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {SUBS.map(s => (
            <button key={s.key} onClick={() => { setSub(s.key); setQIdx(0); setAnswer(''); setFeedback(null) }}
              style={{ flex: 1, padding: '10px 6px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 600, border: `1px solid ${sub === s.key ? C.accent : C.line}`, background: sub === s.key ? C.accent : C.bg, color: sub === s.key ? '#fff' : C.textSub, transition: 'all 0.15s' }}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        {/* 练习卡片 */}
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${C.lineLight}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Tag text={curQ.type} xs />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: C.textMuted }}>难度 ●●●○○</span>
              <button onClick={() => { setQIdx(q => q + 1); setAnswer(''); setFeedback(null) }}
                style={{ fontSize: 11, color: C.blue, background: 'none', border: 'none', cursor: 'pointer' }}>换题</button>
            </div>
          </div>
          <div style={{ padding: '16px' }}>
            <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.9, whiteSpace: 'pre-line', marginBottom: 16 }}>{curQ.q}</div>
            {!feedback ? (
              <>
                <textarea value={answer} onChange={e => setAnswer(e.target.value)}
                  placeholder="在此作答..."
                  style={{ width: '100%', boxSizing: 'border-box', minHeight: 110, border: `1px solid ${C.line}`, borderRadius: 8, padding: '12px', fontSize: 13, color: C.text, background: C.bgSub, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7, outline: 'none' }} />
                <button onClick={handleSubmit} disabled={!answer.trim() || submitting}
                  style={{ width: '100%', marginTop: 10, padding: '11px', borderRadius: 8, border: 'none', cursor: answer.trim() ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13, background: answer.trim() ? C.accent : C.lineLight, color: answer.trim() ? '#fff' : C.textMuted, transition: 'all 0.15s' }}>
                  {submitting ? '提交中...' : '提交作答'}
                </button>
              </>
            ) : (
              <div>
                {/* 打分 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color: C.accent, fontFamily: FONT_EN, lineHeight: 1 }}>{feedback!.score}</div>
                  <div>
                    <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 1 }}>AI 评分 / 10</div>
                    <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
                      {Array.from({length: 10}).map((_,i) => (
                        <div key={i} style={{ width: 14, height: 4, borderRadius: 2, background: i < feedback!.score ? C.accent : C.line }} />
                      ))}
                    </div>
                  </div>
                </div>
                {/* 点评 */}
                <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: 1, marginBottom: 6 }}>◎ 点评</div>
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.8 }}>{feedback!.comment}</div>
                </div>
                {/* 范例 */}
                {feedback!.example && (
                  <div style={{ border: `1px solid rgba(56,182,255,0.3)`, borderRadius: 8, padding: '10px 14px', marginBottom: 12, background: 'rgba(56,182,255,0.04)' }}>
                    <div style={{ fontSize: 10, color: C.blue, letterSpacing: 1, marginBottom: 6 }}>✦ 参考范例</div>
                    <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.8 }}>{feedback!.example}</div>
                  </div>
                )}
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10 }}>已存入训练档案</div>
                <button onClick={() => { setFeedback(null); setAnswer(''); setQIdx(q => q + 1) }}
                  style={{ width: '100%', padding: '11px', borderRadius: 8, border: `1px solid ${C.accent}`, background: C.bg, color: C.accent, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  下一题 →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 历史记录 */}
        {showHistory && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 1 }}>练习历史（最近20条）</div>
              <button onClick={() => setShowHistory(false)} style={{ fontSize: 11, color: C.textSub, background: 'none', border: 'none', cursor: 'pointer' }}>收起</button>
            </div>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, padding: '20px 0' }}>暂无记录</div>
            ) : (
              <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
                {history.map((h, i) => (
                  <div key={i}>
                    {i > 0 && <Divider />}
                    <div style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                        <Tag text={SUBS.find(s => s.key === h.sub)?.label || h.sub} xs />
                        <Tag text={h.question_type} xs />
                        <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 'auto' }}>{new Date(h.submitted_at).toLocaleDateString('zh-CN')}</span>
                      </div>
                      <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{h.answer}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ===================== 资讯 Tab =====================
const CATS = ['全部', 'AI科技', '品牌商业', '政策监管', '金融财经', '互联网', '新媒体']

function NewsTab({ toast }: { toast: (m: string) => void }) {
  const [cat, setCat] = useState('全部')
  const [news, setNews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [annotating, setAnnotating] = useState<number | null>(null)
  const [noteText, setNoteText] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setNews(await get(`/api/news?cat=${encodeURIComponent(cat)}`)) } catch {}
    setLoading(false)
  }, [cat])

  useEffect(() => { load() }, [cat])

  const handleRead = async (id: number) => {
    await post('/api/news/action', { news_id: id, action: 'read' })
    setNews(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    toast('✓ 已标记已读')
  }

  const handleFavorite = async (id: number) => {
    await post('/api/news/action', { news_id: id, action: 'favorite' })
    setNews(prev => prev.map(n => n.id === id ? { ...n, favorited: !n.favorited } : n))
    const cur = news.find(n => n.id === id)
    toast(cur?.favorited ? '已取消收藏' : '★ 已收藏')
  }

  const handleAnnotate = async (id: number) => {
    if (!noteText.trim()) return
    await post('/api/news/action', { news_id: id, action: 'annotate', annotation: noteText })
    setNews(prev => prev.map(n => n.id === id ? { ...n, annotation: noteText } : n))
    setAnnotating(null); setNoteText('')
    toast('✓ 批注已保存')
  }

  const unreadReq = news.filter(n => n.required && !n.read).length

  return (
    <div style={{ padding: '0 0 100px' }}>
      {unreadReq > 0 && (
        <div style={{ margin: '14px 20px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <img src="/icons/11.svg" alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: C.textSub }}>今日必读 <strong style={{ color: C.text }}>{unreadReq} 篇</strong>未完成</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, padding: '14px 20px', overflowX: 'auto' }}>
        {CATS.map(c => (
          <button key={c} onClick={() => { setCat(c); setExpanded(null) }}
            style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 20, border: `1px solid ${cat === c ? C.accent : C.line}`, background: cat === c ? C.accent : C.bg, color: cat === c ? '#fff' : C.textSub, fontSize: 12, fontWeight: cat === c ? 600 : 400, cursor: 'pointer', transition: 'all 0.15s' }}>{c}</button>
        ))}
      </div>

      <div style={{ padding: '0 20px' }}>
        {loading ? <Spinner /> : (
          <div style={{ position: 'relative' }}>
            {/* 纯CSS气泡标题 — 蓝色圆角+金星+左下对话尖角 */}
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginBottom: 0 }}>
              <div style={{
                background: '#38b6ff',
                borderRadius: '10px 10px 10px 2px',
                padding: '7px 14px 7px 12px',
                display: 'flex', alignItems: 'center', gap: 5,
                boxShadow: '0 2px 8px rgba(56,182,255,0.25)',
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>最新资讯</span>
              </div>
            </div>
            <div style={{
              border: '2px solid #38b6ff',
              borderRadius: '0 20px 20px 20px',
              overflow: 'hidden',
              background: C.bg,
              boxShadow: '0 4px 16px rgba(56,182,255,0.10)',
              position: 'relative',
            }}>
            {news.map((n, i) => (
              <div key={n.id}>
                {i > 0 && <Divider />}
                <div style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={() => setExpanded(expanded === n.id ? null : n.id)}>
                  {/* 标签行 */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                    {!n.read && <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.blue, flexShrink: 0 }} />}
                    {n.required && <Tag text="必读" v="b" xs />}
                    <Tag text={n.cat} xs />
                    <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 'auto' }}>{n.src} · {n.time}</span>
                  </div>
                  {/* 配图 + 标题 左右布局 */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: n.read ? 400 : 600, color: n.read ? C.textSub : C.text, lineHeight: 1.5, marginBottom: 6 }}>{n.title}</div>
                      {/* # tags */}
                      {n.tags && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {(n.tags as string[]).map((tag: string) => (
                            <span key={tag} style={{ fontSize: 10, color: C.blue, background: 'rgba(56,182,255,0.08)', borderRadius: 4, padding: '1px 6px', fontWeight: 500 }}>{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {n.image && (
                      <img src={n.image} alt="" style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 8, flexShrink: 0, marginTop: 2 }}
                        onError={(e: any) => { e.target.style.display = 'none' }} />
                    )}
                  </div>

                  {expanded === n.id && (
                    <div onClick={e => e.stopPropagation()}>
                      <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7, marginTop: 10 }}>{n.summary}</div>
                      {n.url && (
                        <a href={n.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8, fontSize: 11, color: C.blue }}>查看原文 →</a>
                      )}
                      {n.annotation && (
                        <div style={{ marginTop: 10, padding: '10px 12px', background: C.bgSub, borderRadius: 8, fontSize: 12, color: C.textSub, borderLeft: `3px solid ${C.blue}` }}>
                          <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>我的批注</div>
                          {n.annotation}
                        </div>
                      )}
                      {annotating === n.id ? (
                        <div style={{ marginTop: 10 }}>
                          <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                            placeholder="写下批注..."
                            style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 8, padding: '10px', fontSize: 13, color: C.text, background: C.bgSub, resize: 'none', height: 72, fontFamily: 'inherit', outline: 'none' }} />
                          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            <button onClick={() => handleAnnotate(n.id)}
                              style={{ flex: 1, padding: '8px', borderRadius: 7, border: 'none', background: C.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>保存</button>
                            <button onClick={() => { setAnnotating(null); setNoteText('') }}
                              style={{ padding: '8px 14px', borderRadius: 7, border: `1px solid ${C.line}`, background: C.bg, color: C.textSub, fontSize: 12, cursor: 'pointer' }}>取消</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                          <button onClick={() => { setAnnotating(n.id); setNoteText(n.annotation || '') }}
                            style={{ padding: '7px 12px', borderRadius: 7, border: `1px solid ${C.line}`, background: C.bg, color: C.textSub, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <img src="/icons/3.svg" alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />批注
                          </button>
                          <button onClick={() => handleFavorite(n.id)}
                            style={{ padding: '7px 12px', borderRadius: 7, border: `1px solid ${n.favorited ? '#38b6ff' : C.line}`, background: n.favorited ? 'rgba(56,182,255,0.1)' : C.bg, color: n.favorited ? '#38b6ff' : C.textSub, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <img src="/icons/5.svg" alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />
                            {n.favorited ? '已收藏' : '收藏'}
                          </button>
                          {!n.read && (
                            <button onClick={() => handleRead(n.id)}
                              style={{ padding: '7px 12px', borderRadius: 7, border: `1px solid ${C.accent}`, background: C.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>
                              已读 ✓
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
              {/* 右下角卷角装饰 */}
              <div style={{
                position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, zIndex: 2,
                background: 'linear-gradient(135deg, transparent 50%, #38b6ff 50%)',
                borderRadius: '0 0 24px 0',
                opacity: 0.7,
              }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ===================== 组织 Tab =====================
const QS = [
  { q: '以下哪个部门负责品牌形象统一管理和对外传播策略？', opts: ['公关部', '运营部', '品牌部', '法务部'], ans: 2 },
  { q: '公司官方对外口径中，"小红书"品牌定位的核心表述是？', opts: ['内容社区', '生活方式平台', '电商平台', '兴趣社区'], ans: 1 },
  { q: '发生危机事件时，第一时间应联系哪个部门进行确认？', opts: ['法务部', '公关部', 'CEO办公室', '内容安全部'], ans: 1 },
]
const DEPTS = [
  { name: '公关部', head: '张总监', count: 12, resp: '品牌形象统一管理、对外传播策略、危机公关、媒体关系维护', tags: ['品牌升级', '危机预案'] },
  { name: '品牌部', head: '李总监', count: 8, resp: '视觉体系设计、品牌IP孵化、内容创作规范制定', tags: ['视觉体系', 'IP孵化'] },
  { name: '市场部', head: '王总监', count: 20, resp: '用户增长、渠道拓展、数据分析与市场策略', tags: ['用户增长', '渠道拓展'] },
]
const KALEIDOSCOPE = [
  { label: '品牌定位标准话术', content: '小红书是以生活方式为核心的内容平台，连接有真实消费需求的用户与优质创作者，倡导真实、正向的生活方式分享。' },
  { label: '高频问题统一回答', content: '关于"内容是否真实"：小红书通过社区公约、内容审核、创作者评级等多维度机制保障内容真实性，不真实内容将被处理。' },
  { label: '敏感话题应对红线', content: '以下话题须升级至公关部总监审批：政治敏感、法律诉讼相关、重大数据安全、竞品直接对比等。' },
  { label: '对外宣传禁忌表述', content: '禁止使用：①绝对化用语（最大/第一/唯一）②未经授权的数据 ③竞品贬低性表述 ④承诺性回报措辞。' },
]

function OrgTab({ toast }: { toast: (m: string) => void }) {
  const [view, setView] = useState<'arch' | 'dynamics'>('arch')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [kalei, setKalei] = useState<number | null>(null)
  const [testMode, setTestMode] = useState(false)
  const [tq, setTq] = useState(0)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [history, setHistory] = useState<any[]>([])

  const loadHistory = async () => {
    try { setHistory(await get('/api/org/test-history')) } catch {}
  }

  const handleAnswer = async (i: number) => {
    const correct = i === QS[tq].ans
    const next = tq + 1
    const newScore = score + (correct ? 1 : 0)
    if (next === QS.length) {
      setScore(newScore); setDone(true)
      try { await post('/api/org/test', { score: newScore, total: QS.length }); toast(`测试完成！得分 ${newScore}/${QS.length}，已记入档案`) } catch {}
      loadHistory()
    } else {
      setScore(newScore); setTq(next)
    }
  }

  return (
    <div style={{ padding: '0 0 100px' }}>
      <div style={{ padding: '16px 20px 0', display: 'flex' }}>
        <div style={{ display: 'flex', background: C.bgSub, borderRadius: 10, padding: 3, gap: 2, marginBottom: 20 }}>
          {[{ k: 'arch', l: '组织架构' }, { k: 'dynamics', l: '内部动态' }].map(({ k, l }) => (
            <button key={k} onClick={() => setView(k as any)}
              style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s', background: view === k ? C.bg : 'transparent', color: view === k ? C.text : C.textSub, boxShadow: view === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 20px' }}>
        {view === 'arch' ? (
          <>
            {/* 部门 */}
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
              {DEPTS.map((dept, i) => (
                <div key={dept.name}>
                  {i > 0 && <Divider />}
                  <div onClick={() => setExpanded(expanded === i ? null : i)} style={{ padding: '15px 16px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: expanded === i ? 8 : 4 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{dept.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: C.textMuted }}>{dept.head} · {dept.count}人</span>
                        <span style={{ fontSize: 12, color: C.textMuted }}>{expanded === i ? '▲' : '▽'}</span>
                      </div>
                    </div>
                    {expanded !== i ? (
                      <div style={{ display: 'flex', gap: 4 }}>{dept.tags.map(t => <Tag key={t} text={t} xs />)}</div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7, marginBottom: 10 }}>{dept.resp}</div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{dept.tags.map(t => <Tag key={t} text={t} xs />)}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 口径库 */}
            <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 1, marginBottom: 10 }}>官方口径库</div>
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
              {KALEIDOSCOPE.map((item, i) => (
                <div key={i}>
                  {i > 0 && <Divider />}
                  <div onClick={() => setKalei(kalei === i ? null : i)} style={{ padding: '13px 16px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: C.text }}>{item.label}</span>
                      <span style={{ fontSize: 12, color: C.textMuted }}>{kalei === i ? '▲' : '→'}</span>
                    </div>
                    {kalei === i && <div style={{ marginTop: 10, fontSize: 13, color: C.textSub, lineHeight: 1.7, paddingTop: 10, borderTop: `1px solid ${C.lineLight}` }}>{item.content}</div>}
                  </div>
                </div>
              ))}
            </div>

            {/* 业务测试 */}
            <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 1, marginBottom: 10 }}>业务熟知测试</div>
            {!testMode ? (
              <div>
                <button onClick={() => setTestMode(true)} style={{ width: '100%', padding: '13px', borderRadius: 10, border: `1px dashed ${C.line}`, background: C.bg, color: C.textSub, fontSize: 13, cursor: 'pointer', marginBottom: 12 }}>
                  ○ 开始新一轮测试
                </button>
                {history.length > 0 && (
                  <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.lineLight}`, fontSize: 11, color: C.textMuted, letterSpacing: 1 }}>历史记录</div>
                    {history.slice(0, 3).map((h, i) => (
                      <div key={i}>
                        {i > 0 && <Divider />}
                        <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 13, color: C.text }}>{h.score} / {h.total} 分</span>
                          <span style={{ fontSize: 11, color: C.textMuted }}>{new Date(h.taken_at).toLocaleDateString('zh-CN')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : !done ? (
              <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.lineLight}`, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: C.textMuted }}>第 {tq + 1} 题 / 共 {QS.length} 题</span>
                  <span style={{ fontSize: 12, color: C.textMuted }}>当前得分：{score}</span>
                </div>
                <div style={{ padding: '16px' }}>
                  <div style={{ fontSize: 14, color: C.text, fontWeight: 600, lineHeight: 1.6, marginBottom: 14 }}>{QS[tq].q}</div>
                  {QS[tq].opts.map((opt, i) => (
                    <button key={i} onClick={() => handleAnswer(i)}
                      style={{ width: '100%', padding: '11px 14px', marginBottom: 8, borderRadius: 8, border: `1px solid ${C.line}`, background: C.bgSub, color: C.text, fontSize: 13, cursor: 'pointer', textAlign: 'left', transition: 'all 0.1s' }}>
                      {['A', 'B', 'C', 'D'][i]}. {opt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: '24px', textAlign: 'center' }}>
                <div style={{ fontSize: 40, fontWeight: 800, color: C.text, letterSpacing: -2, marginBottom: 6 }}>{score} / {QS.length}</div>
                <div style={{ fontSize: 13, color: C.textSub, marginBottom: 20 }}>已记入能力档案</div>
                <button onClick={() => { setTestMode(false); setTq(0); setScore(0); setDone(false) }}
                  style={{ padding: '10px 24px', borderRadius: 8, background: C.accent, border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  再测一次
                </button>
              </div>
            )}
          </>
        ) : (
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
            {[
              { dept: '公关部', title: '本周舆情监控周报已发布', time: '今天 10:00', type: '周报' },
              { dept: 'CEO办公室', title: '2025年战略升级全员信已发送', time: '昨天 09:30', type: '重大通知' },
              { dept: '品牌部', title: '新视觉体系VI规范文档更新', time: '2天前', type: '文件更新' },
              { dept: '市场部', title: 'Q2 GMV超额完成，增长+35%', time: '3天前', type: '业务节点' },
            ].map((item, i) => (
              <div key={i}>
                {i > 0 && <Divider />}
                <div style={{ padding: '15px 16px' }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <Tag text={item.dept} xs />
                    <Tag text={item.type} v={item.type === '重大通知' ? 'r' : 'd'} xs />
                  </div>
                  <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{item.time}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ===================== 案例 Tab =====================
const ALL_CASES = [
  {
    id: 1,
    title: '农夫山泉钟睒睒舆情风暴：被动公关的全景复盘',
    tags: ['危机翻车', '舆情应对'], score: 4.9, type: '避坑',
    year: 2024, brand: '农夫山泉',
    ref: 'https://finance.sina.com.cn/stock/s/2024-03-06/doc-inamkuih8842798.shtml',
    desc: '2024年初，娃哈哈创始人宗庆后去世，钟睒睒的悼念文章被质疑"背刺老东家"，随后儿子国籍、产品包装日式设计等议题接连发酵，股价蒸发320亿港元，旗舰店销量断崖下滑。',
    detail: {
      bg: '2024年2月，宗庆后逝世，农夫山泉创始人钟睒睒发布悼念文章，却被网友解读为"竞争对手的隔空讽刺"。随后网络开始翻旧账：钟睒睒儿子美国国籍、农夫山泉包装设计风格类似日系、"纯净水不如天然水"商战话术等。多个话题叠加，最终形成系统性舆情冲击。',
      timeline: '2月26日 宗庆后逝世，钟睒睒发文悼念\n3月初 网络开始质疑钟睒睒"背刺老东家"\n3月中旬 儿子国籍、包装设计议题爆发\n3月 股价最高跌超20%，市值蒸发320亿港元\n3月 官方宣布钟睒睒卸任，尝试切割舆情（效果有限）\n8月 钟睒睒接受央视财经专访集中回应争议\n2025年 农夫山泉开始漫长品牌重建之路',
      method: '延迟回应带来的教训：\n1. 创始人与品牌深度绑定时，创始人言行即品牌危机\n2. 多议题同时爆发时应设置回应优先级，逐一澄清\n3. 通过权威媒体（如央视）进行一次性集中回应，比多次碎片化发声更有效\n4. 品牌与创始人的"舆情切割"需谨慎，绑定过深时切割反引二次质疑',
      warn: '✕ 初期沉默超过2周，舆情持续发酵\n✕ 宣布卸任的切割举动被解读为"心虚"\n✕ 没有建立统一的口径管理体系，员工和经销商各说各话\n✕ 忽视了创始人个人IP与品牌的深度绑定风险',
    },
  },
  {
    id: 2,
    title: 'Manner咖啡员工泼粉事件：劳资矛盾引爆的舆情反转',
    tags: ['危机翻车', '舆情应对'], score: 4.7, type: '避坑',
    year: 2024, brand: 'Manner咖啡',
    ref: 'https://www.campaignchina.com/article/manner/496820',
    desc: '2024年6月，上海两家Manner门店同天爆发员工与顾客冲突，品牌按惯例道歉开除员工，但"8小时500杯"的员工吐槽随即逆转舆论——公众大规模同情员工，道歉声明成了"两头不讨好"的公关危机。',
    detail: {
      bg: '2024年6月17日，上海Manner咖啡两家门店同日发生冲突：一名男店员扇了顾客耳光，一名女店员将咖啡粉泼向顾客。事件在社交媒体快速扩散，品牌第一时间发声明并辞退涉事员工。然而随后小红书上大量Manner咖啡师的"牛马自述"被翻出——日处理500杯以上、一人开店、极度高压——舆论急剧反转，"资本剥削"叙事压过了"员工不当行为"叙事。',
      timeline: '6月17日 两起冲突视频同时在微博、小红书传播\n6月18日 Manner官方声明，辞退涉事员工，向顾客道歉\n6月20日 #manner有员工称8小时内要做500杯咖啡# 登热搜\n6月21日 大量咖啡师在社媒发布高强度工作实录，品牌形象持续受损\n6月24日 Manner再发声明，兼顾顾客与员工，舆论评价"和稀泥"\n后续 品牌深陷"高速扩张/员工高压"的标签，估值受影响',
      method: '危机反转应对的核心逻辑：\n1. 当"常识"被打破（顾客不再天然站在顾客一边），危机的应对主体也需要转变\n2. 真正的受害者认定应基于社会情绪而非单纯事实\n3. 在劳资矛盾高度敏感的舆论环境中，快速开除员工等"常规操作"可能加速危机\n4. 危机处置要留出"听社会呼声"的缓冲时间，不要急于发声',
      warn: '✕ 第一时间开除员工的处置方式激化矛盾\n✕ 没有提前建立员工关怀相关的预防性PR积累\n✕ 第二次声明两头讨好，立场模糊引发更多批评\n✕ 忽视了社会情绪对"劳资议题"的高度敏感性',
    },
  },
  {
    id: 3,
    title: '京东×杨笠：代言人选择引爆性别对立的教训',
    tags: ['危机翻车', '品牌活动'], score: 4.8, type: '避坑',
    year: 2024, brand: '京东',
    ref: 'https://m.thepaper.cn/newsDetail_forward_29145367',
    desc: '2024年双十一前夕，京东宣布与脱口秀演员杨笠合作推广，引发男性用户大规模退卡抵制。在老板娘胸针风波同步爆发的背景下，多轮舆情叠加，京东市值蒸发数百亿，公关部被迫发声明与杨笠"切割"。',
    detail: {
      bg: '2024年10月，京东在双十一前夕宣布邀请杨笠参与推广活动。杨笠因此前脱口秀中的"普信男"等表述，在男性用户中积累了大量反感。消息传开后，大量男性用户晒出退出京东会员卡、银行联名卡截图。与此同时，老板娘章泽天因胸针图案被网友质疑涉嫌"光明会"，两起舆情同步发酵，形成连锁危机。',
      timeline: '10月15日 章泽天胸针风波开始发酵\n10月18日 京东宣布杨笠参与推广，男性用户抵制潮爆发\n10月19日 #京东杨笠# 话题持续扩散，退卡截图刷屏\n10月下旬 京东金融遭遇谣言冲击，被迫群发短信辟谣\n10月底 京东官方发声明：后续没有与相关演员合作计划\n11月 双十一期间官方账号低调运营，评论区设精选限制\n整体 市值在事件高峰期蒸发数百亿元',
      method: '代言人选择的公关底线：\n1. 任何有明显性别对立争议标签的艺人，都应纳入品牌安全评估\n2. 面向全量用户（尤其是男性用户比例高的平台），需避免会直接激化特定群体的内容\n3. 多舆情叠加时，首要任务是切断事件之间的关联叙事\n4. 辟谣声明（如金融谣言短信）发出前须评估是否会引发"此地无银"效应',
      warn: '✕ 代言人选择时未做充分的社群情绪评估\n✕ 金融辟谣短信时机不当，放大恐慌情绪\n✕ 在多舆情叠加时没有形成统一的信息管理中枢\n✕ 平台双十一大促期间账号沉默，错失主动引导窗口',
    },
  },
  {
    id: 4,
    title: '珀莱雅38节男性视角营销翻车：群体情绪的边界',
    tags: ['危机翻车', '品牌活动'], score: 4.5, type: '避坑',
    year: 2024, brand: '珀莱雅',
    ref: 'http://www.eeo.com.cn/2024/0311/643475.shtml',
    desc: '2024年妇女节，珀莱雅在以女性用户为主的化妆品赛道，发布了包含男性故事的"性别偏见"主题内容，激怒核心用户群，迅速被推上热搜。该话题已做三年从未翻车，却因2024年社会情绪高度敏感化而栽跟头。',
    detail: {
      bg: '珀莱雅自2021年起每年38妇女节发起"性别不是边界线 偏见才是"话题，前两年均获好评。2024年3月，品牌在该主题下加入了两位男性用户的故事，讲述他们突破性别刻板印象的经历。这一内容在女性用户群体中激起强烈反弹："这是妇女节，不是让男性发声的舞台"，话题迅速扩散至热搜，品牌最终删除相关内容。',
      timeline: '3月4日 珀莱雅发布含男性故事的38节主题内容\n3月4日-5日 评论区出现大量负面声音\n3月7日-8日 话题登上微博热搜，媒体跟进报道\n3月8日 品牌删除相关内容，未发正式声明\n3月11日 多家媒体复盘：品牌在妇女节营销的边界与风险',
      method: '节点营销的安全操作原则：\n1. 妇女节、母亲节等女性节点，女性品牌的内容主角应聚焦女性\n2. 同一话题连续执行时，需每年评估社会情绪变化，不能依赖"去年没问题"的经验\n3. 在群体摩擦加剧的社会背景下，任何可能引发"边界争夺感"的内容都要提升审核级别\n4. 删帖处理应搭配简短声明，单纯删除容易被解读为承认错误却逃避责任',
      warn: '✕ 未充分评估2024年社会情绪与2021年的变化\n✕ 在女性品牌的核心节点加入非核心用户的声音\n✕ 没有建立内容发布前的"群体情绪压力测试"机制\n✕ 删帖不附声明，处置方式留下后续解读空间',
    },
  },
  {
    id: 5,
    title: '极越汽车原地解散：危机公关完全缺位的极端样本',
    tags: ['危机翻车', '舆情应对'], score: 4.6, type: '避坑',
    year: 2024, brand: '极越汽车',
    ref: 'https://www.stcn.com/article/detail/1455378.html',
    desc: '2024年12月，极越汽车CEO夏一平召开全员会宣布调整，当晚门店关闭消息在网络发酵，员工在公司现场围堵CEO直播，供应商、车主、员工维权同步爆发。公关在整个过程中几乎完全缺位，成为2024年度公关应对失败的极端案例。',
    detail: {
      bg: '2024年12月11日，极越汽车CEO夏一平召开内部全员会宣布公司进行调整，随即有员工在社交媒体直播，多家门店同日关闭。12月12日，"极越汽车原地解散"消息引发全网关注，员工聚集公司总部围堵CEO，要求解决社保、工资问题；同时供应商追款、车主维权、媒体蜂拥而至，多线程危机同步爆发。',
      timeline: '12月11日 CEO召开全员会，门店当晚关闭，消息在网络发酵\n12月12日 "极越解散"话题爆发，员工直播围堵CEO\n12月12日 夏一平现场发言："没有倒闭，整车质保和服务继续"\n12月16日 夏一平在社媒发长文道歉，公司已实质解散\n后续 进入善后阶段：社保补缴、供应商谈判、车主服务方案',
      method: '从极越的反面案例提炼的生存指南：\n1. 任何企业在遭遇经营危机时，应提前12-24小时制定公关应对方案\n2. 员工是第一优先级受众，内部信需先于外部声明发出\n3. 关键时刻CEO的公开表态内容和措辞需经法务+公关共同审核\n4. 多方利益受损时（员工/供应商/车主），需分别制定对应的安抚口径',
      warn: '✕ 全员会信息提前泄露，缺少保密管理\n✕ CEO在员工直播围堵中的现场发言未经审核\n✕ 没有提前准备任何对外声明模板\n✕ 公关完全缺位，整个危机由CEO一人即兴应对\n✕ 对车主、供应商的专项沟通方案严重滞后',
    },
  },
  {
    id: 6,
    title: '鸿星尔克5000万捐款：低调公益引爆的野性消费',
    tags: ['正面标杆', '品牌活动'], score: 4.9, type: '可复用',
    year: 2021, brand: '鸿星尔克',
    ref: 'https://m.36kr.com/p/1327164689488135',
    desc: '2021年7月，鸿星尔克在连年亏损的情况下向河南暴雨灾区捐款5000万元，消息传开后引发全网"野性消费"热潮，单日销售额突破1.1亿，品牌搜索量暴增1000%，成为近年来最经典的正面公关案例。',
    detail: {
      bg: '2021年7月，河南特大暴雨引发大范围灾害。鸿星尔克在自身连年亏损、濒临"退市"的情况下，通过微博宣布向灾区捐款5000万元。该消息因其鲜明的反差性（"穷人做富人的事"）迅速引爆全网，网友自发涌入直播间高喊"野性消费"，品牌从沉寂状态瞬间成为全民话题。',
      timeline: '7月21日 河南暴雨严重，全网关注\n7月22日 鸿星尔克微博宣布捐款5000万元\n7月22日晚 "野性消费"词条爆发，直播间涌入数十万人\n7月23日 单日销售额突破1.1亿，是平日的数百倍\n后续48小时 品牌搜索量暴增1000%，微博粉丝新增逾百万\n后续 直播间人气维持月余，品牌完成一次标志性的形象重建',
      method: '可复用的公益传播核心要素：\n1. 真实性：低调宣布、不刻意营销，反而放大了可信度\n2. 反差感：亏损中捐款的"壮举"本身即是最强传播素材\n3. 及时性：在全民关注灾情的窗口内行动，具有天然话题性\n4. 互动性：直播间成为情绪出口，鸿星尔克员工与网友真实互动放大了品牌温度\n5. 克制性：品牌没有过度消费捐款事件，保持了传播的真实感',
      warn: '✕ 单次捐款无法构建长期品牌竞争力，不可只靠公益打品牌\n✕ 后续路径依赖"再捐款"模式，边际效应递减\n✕ 短期流量激增需要供应链和客服能力同步跟上，否则引发负面口碑\n✕ 公益传播应与产品力提升并行，流量转化需要品质承接',
    },
  },
  {
    id: 7,
    title: '海底捞食品安全危机与啄木鸟计划：透明承担的典范',
    tags: ['正面标杆', '舆情应对'], score: 4.8, type: '可复用',
    year: 2017, brand: '海底捞',
    ref: 'https://finance.sina.com.cn/wm/2023-08-15/doc-imzhhkqc3954436.shtml',
    desc: '2017年，媒体曝光海底捞后厨出现老鼠爬食、漏勺掏下水道等卫生问题，引发全国舆论。品牌2小时内发出首份声明，核心一句话"责任在我们"赢得舆论，48小时内舆论反转，被誉为中国餐饮危机公关教科书。',
    detail: {
      bg: '2017年8月，媒体曝光海底捞北京多家门店存在食品卫生问题：后厨有老鼠爬行、员工用漏勺疏通下水道后继续使用等。事件在全国各大媒体转载，引发广泛关注。作为知名餐饮品牌，海底捞的应对方式成为舆论与行业的焦点。',
      timeline: '8月25日 媒体曝光卫生问题报道发出\n8月25日（2小时内） 海底捞官方微博发出第一份声明，承认问题、感谢曝光\n8月26日 海底捞发出正式道歉信，董事会全体成员签字\n8月26日 主动邀请媒体和监管部门进驻门店全程监督整改\n48小时内 舆论整体反转，"海底捞危机公关教科书"词条出现\n随后 海底捞推出后厨透明化改造，持续释放整改进展',
      method: '2小时响应的黄金法则：\n1. 速度原则：第一份声明的价值高于内容完美，先表态后调查\n2. 真诚原则：开篇即承认责任，不推责、不转移视线\n3. 感谢曝光：正面回应媒体监督功能，把"对立方"转为"推动改善的力量"\n4. 主动邀请监督：邀请媒体进驻，用透明替代猜疑\n5. 持续跟进：整改进展定期公布，危机转化为品牌信任资产',
      warn: '✕ 若等待内部调查完成再回应，黄金窗口已过\n✕ 若使用"供应商问题"类推责表述，将直接激化危机\n✕ 若承诺整改而没有后续跟进，诚意将大打折扣\n✕ 若拒绝媒体进驻监督，"遮掩"叙事将占领舆论场',
    },
  },
  {
    id: 8,
    title: '霸王茶姬2024品牌出海：用产品力驱动传播的样本',
    tags: ['正面标杆', '品牌活动', '媒体采访'], score: 4.7, type: '可复用',
    year: 2024, brand: '霸王茶姬',
    ref: 'https://www.digitaling.com/articles/1302895.html',
    desc: '2024年，霸王茶姬全球门店突破5000家，Q1单季GMV达58亿，创始人首次公开财务数据，计划全年破200亿。品牌在媒体采访中坚持"不讲融资，只讲产品理念"，最终成功赴美上市，首日大涨15%。',
    detail: {
      bg: '2024年是霸王茶姬的全球化关键年。品牌从2021年开始布局东南亚，凭借"东方茶文化"定位在海外快速扩张。与此同时，在国内茶饮市场卷价格的背景下，霸王茶姬选择坚持品质定位，通过产品力而非价格战维持品牌溢价。创始人张俊杰首次公开营收数据，引发行业高度关注，成为品牌传播的重要节点。',
      timeline: '2024年Q1 单季GMV达58亿，超越众多竞争对手\n5月 创始人公开宣布2023年全年营收108亿，Q1超58亿\n全年 全球门店突破5000家，海外156家\n全年 持续输出"东方茶文化出海"品牌叙事\n2025年4月 赴美IPO，首日上涨15%，成为中国新茶饮出海里程碑',
      method: '产品力驱动品牌传播的核心路径：\n1. 用财务数据制造新闻性：首次披露营收数据本身即是话题，无需额外营销预算\n2. 媒体采访策略：坚持"不谈融资只谈产品与理念"，维持品牌的调性一致性\n3. 出海叙事：用"东方茶文化"替代"国产平替"的定位，建立文化输出的传播框架\n4. IPO作为传播节点：上市即是品牌信任度的公开证明，与产品力形成互相背书',
      warn: '✕ 快速扩张过程中需持续关注单店质量与体验标准\n✕ 国内价格战压力下，维持溢价定位需要更强的产品创新支撑\n✕ 出海市场本土化运营是长期挑战，不可完全复制国内模型\n✕ 上市后处于更高的信息透明度要求下，需建立完善的IR公关体系',
    },
  },
]
const CASE_TAGS_ALL = ['全部', '危机翻车', '正面标杆', '舆情应对', '品牌活动', '媒体采访']

function CasesTab({ toast }: { toast: (m: string) => void }) {
  const [tag, setTag] = useState('全部')
  const [cases, setCases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<typeof ALL_CASES[0] | null>(null)
  const [comments, setComments] = useState<any[]>([])
  const [commentText, setCommentText] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setCases(await get(`/api/cases?tag=${encodeURIComponent(tag)}`)) } catch {
      setCases(ALL_CASES.filter(c => tag === '全部' || c.tags.includes(tag)).map(c => ({ ...c, favorited: false, comment_count: 0 })))
    }
    setLoading(false)
  }, [tag])

  useEffect(() => { load() }, [tag])

  const openDetail = async (c: typeof ALL_CASES[0]) => {
    setDetail(c)
    try { setComments(await get(`/api/cases/${c.id}/comments`)) } catch { setComments([]) }
  }

  const handleFav = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const res = await post(`/api/cases/${id}/favorite`)
      setCases(prev => prev.map(c => c.id === id ? { ...c, favorited: res.favorited } : c))
      toast(res.favorited ? '★ 已收藏案例' : '已取消收藏')
    } catch {}
  }

  const submitComment = async () => {
    if (!commentText.trim() || !detail || submittingComment) return
    setSubmittingComment(true)
    try {
      await post(`/api/cases/${detail.id}/comments`, { content: commentText })
      setComments(prev => [{ user_name: '我', content: commentText, created_at: new Date().toISOString() }, ...prev])
      setCommentText('')
      toast('✓ 评论已发布')
    } catch { toast('发送失败，请重试') }
    setSubmittingComment(false)
  }

  if (detail) {
    const fullCase = ALL_CASES.find(c => c.id === detail.id)!
    return (
      <div style={{ padding: '0 0 100px' }}>
        <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', color: C.textSub, cursor: 'pointer', padding: '14px 20px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>← 返回</button>
        <div style={{ padding: '0 20px' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {detail.tags.map(t => <Tag key={t} text={t} xs />)}
            <Tag text={detail.type === '可复用' ? '✓ 可复用' : '⚠ 避坑'} v={detail.type === '可复用' ? 'g' : 'a'} xs />
            <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 'auto' }}>★ {detail.score}</span>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1.4, letterSpacing: -0.5, marginBottom: 10 }}>{detail.title}</h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
            {(fullCase as any).brand && <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{(fullCase as any).brand}</span>}
            {(fullCase as any).year && <span style={{ fontSize: 11, color: C.textMuted }}>{(fullCase as any).year}年</span>}
            {(fullCase as any).ref && (
              <a href={(fullCase as any).ref} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, color: C.blue, textDecoration: 'none', marginLeft: 'auto' }}>
                来源参考 ↗
              </a>
            )}
          </div>
          {[
            { t: '事件背景', c: fullCase.detail.bg },
            { t: '时间线复盘', c: fullCase.detail.timeline },
            { t: '可复用方法论', c: fullCase.detail.method },
            { t: '禁止复刻的雷区', c: fullCase.detail.warn },
          ].map(sec => (
            <div key={sec.t} style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ padding: '9px 14px', borderBottom: `1px solid ${C.lineLight}`, fontSize: 11, color: C.textMuted, letterSpacing: 1 }}>{sec.t}</div>
              <div style={{ padding: '14px', fontSize: 13, color: C.text, lineHeight: 1.8, whiteSpace: 'pre-line' }}>{sec.c}</div>
            </div>
          ))}

          {/* 评论区 */}
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', marginTop: 16 }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.lineLight}`, fontSize: 11, color: C.textMuted, letterSpacing: 1 }}>团队讨论 ({comments.length})</div>
            {comments.map((c, i) => (
              <div key={i}>
                {i > 0 && <Divider />}
                <div style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 4 }}>{c.user_name}</div>
                  <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6 }}>{c.content}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{new Date(c.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            ))}
            {comments.length === 0 && <div style={{ padding: '16px', fontSize: 13, color: C.textMuted, textAlign: 'center' }}>暂无评论，第一个发言！</div>}
            <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.lineLight}` }}>
              <textarea value={commentText} onChange={e => setCommentText(e.target.value)}
                placeholder="写下你的见解..."
                style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 8, padding: '10px', fontSize: 13, color: C.text, background: C.bgSub, resize: 'none', height: 64, fontFamily: 'inherit', outline: 'none' }} />
              <button onClick={submitComment} disabled={!commentText.trim() || submittingComment}
                style={{ marginTop: 8, width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: commentText.trim() ? C.accent : C.lineLight, color: commentText.trim() ? '#fff' : C.textMuted, fontSize: 13, fontWeight: 600, cursor: commentText.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
                {submittingComment ? '发送中...' : '发表评论'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 0 100px' }}>
      <div style={{ display: 'flex', gap: 6, padding: '16px 20px', overflowX: 'auto' }}>
        {CASE_TAGS_ALL.map(t => (
          <button key={t} onClick={() => setTag(t)} style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 20, border: `1px solid ${tag === t ? C.accent : C.line}`, background: tag === t ? C.accent : C.bg, color: tag === t ? '#fff' : C.textSub, fontSize: 12, fontWeight: tag === t ? 600 : 400, cursor: 'pointer', transition: 'all 0.15s' }}>{t}</button>
        ))}
      </div>
      <div style={{ padding: '0 20px' }}>
        {loading ? <Spinner /> : (
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
            {cases.map((c, i) => (
              <div key={c.id}>
                {i > 0 && <Divider />}
                <div onClick={() => openDetail(ALL_CASES.find(a => a.id === c.id)!)} style={{ padding: '15px 16px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                    {c.tags.map((t: string) => <Tag key={t} text={t} xs />)}
                    <Tag text={c.type === '可复用' ? '✓ 可复用' : '⚠ 避坑'} v={c.type === '可复用' ? 'g' : 'a'} xs />
                    <button onClick={(e) => handleFav(c.id, e)}
                      style={{ marginLeft: 'auto', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', color: c.favorited ? C.amber : C.textMuted }}>
                      {c.favorited ? '★' : '☆'}
                    </button>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.5, marginBottom: 6 }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>{c.desc}</div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: C.textMuted }}>★ {c.score}</span>
                    <span style={{ fontSize: 11, color: C.textMuted }}>💬 {c.comment_count} 条讨论</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ===================== 工作台 Tab =====================
function WorkbenchTab({ toast }: { toast: (m: string) => void }) {
  const [todos, setTodos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newTodo, setNewTodo] = useState('')
  const [newPriority, setNewPriority] = useState('中')
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [kwQuery, setKwQuery] = useState('')
  const [mediaQuery, setMediaQuery] = useState('')
  const [approvals, setApprovals] = useState([
    { id: 1, title: '《中国互联网大会》平台崔位申请', type: '媒体崔位', status: '待审', urgent: true, time: '2026-06-28 10:30', submitter: '张明' },
    { id: 2, title: 'Q3品牌升级Campaign投放方案', type: '项目审批', status: '待审', urgent: false, time: '2026-06-27 16:00', submitter: '李娜' },
    { id: 3, title: '公关部二季度媒体招款计划', type: '预算审批', status: '已通过', urgent: false, time: '2026-06-25 14:20', submitter: '王芳' },
    { id: 4, title: '官方微博危机声明发布授权', type: '内容审批', status: '已通过', urgent: false, time: '2026-06-24 09:15', submitter: '张明' },
  ])
  const [reportType, setReportType] = useState('周报')
  const [reportGen, setReportGen] = useState(false)
  const [reportDone, setReportDone] = useState(false)

  const MEDIA_LIST = [
    { name: '李晨朗', outlet: '财新传媒', beat: '科技/互联网', tier: 'A', wechat: 'lichenglang_media', email: 'li@caixin.com' },
    { name: '王雪梅', outlet: '36氪', beat: '消费/品牌', tier: 'A', wechat: 'wxm_36kr', email: 'wang@36kr.com' },
    { name: '刘青云', outlet: '晚点LatePost', beat: '大厂/商业', tier: 'S', wechat: 'latepost_liu', email: 'liu@latepost.com' },
    { name: '陈宇', outlet: '中国媒体', beat: '政策/监管', tier: 'A', wechat: 'cheny_cmg', email: 'chen@cmg.cn' },
    { name: '张金鹏', outlet: 'Tech星球', beat: 'AI/创投', tier: 'B', wechat: 'techplanet_zhang', email: 'zhang@techplanet.cn' },
    { name: '吴悟清', outlet: '人民日报', beat: '社会/局势', tier: 'S', wechat: 'wu_rmrb', email: 'wu@people.cn' },
    { name: '郑明海', outlet: '上海证券报', beat: '金融/资本', tier: 'B', wechat: 'zhengmh_ssb', email: 'zheng@ssb.com' },
    { name: '赵晨曦', outlet: '第一财经', beat: '商业/策略', tier: 'A', wechat: 'zhao_yicai', email: 'zhao@yicai.com' },
  ]
  const filteredMedia = MEDIA_LIST.filter(m =>
    !mediaQuery || m.name.includes(mediaQuery) || m.outlet.includes(mediaQuery) || m.beat.includes(mediaQuery)
  )

  const KW_DATA = [
    { kw: '小红书定位', content: '小红书是以生活方式为核心的内容平台，连接有真实消费需求的用户与优质创作者，倡导真实、正向的生活方式分享。' },
    { kw: 'MAU/DAU', content: '小红书月活用户突破 4 亿（上年同期+35%），日活用户超 1.2 亿。注意：官方只公布 MAU，各方分析数据不得引用。' },
    { kw: '社区内容责任', content: '小红书通过社区公约、内容审核、创作者评级等多维度机制保障内容真实性，不真实内容将被处理。' },
    { kw: '集购/商业化', content: '小红书商业化路径包括品牌广告、达人合作、直播带货、集购等。全部商业行为均需遵守平台广告法规定。' },
    { kw: '负面舆情处置', content: '对于媒体小红书平台上出现的负面内容，小红书将遵守平台内容治理规则进行处理，不代表小红书公司立场。' },
    { kw: '资本运作信息', content: '小红书未上市，不就上市计划作出任何评论或确认。融资、估值等资本运作相关问题一律不作回应。' },
    { kw: '媒体采访拒达口径', content: '对于敏感话题如上市、即将发布的产品、竞品相关问题，一律回复：暂无可分享的信息。采访需预约并经公关部审批。' },
    { kw: '社区运营数据', content: '小红书内容数据属于商业机密，媒体采访时不得居壁生造或引用未经认证的第三方数据，需引用官方发布的公开数据。' },
  ]
  const filteredKw = KW_DATA.filter(k => !kwQuery || k.kw.includes(kwQuery) || k.content.includes(kwQuery))

  const SENTIMENT = [
    { platform: '微博', pos: 62, neg: 8, neu: 30, hot: ['#小红书月活4亿#', '#生活方式分享#'], risk: '低' },
    { platform: '微信', pos: 71, neg: 5, neu: 24, hot: ['#小红书商业化#'], risk: '低' },
    { platform: '小红书', pos: 78, neg: 3, neu: 19, hot: ['#内容创作#', '#种草#'], risk: '低' },
    { platform: '抖音', pos: 55, neg: 14, neu: 31, hot: ['#小红书PK抖音#'], risk: '中' },
    { platform: '知乎', pos: 48, neg: 22, neu: 30, hot: ['#内容平台竞争#'], risk: '中' },
  ]
  const riskColor = (r: string) => r === '低' ? C.green : r === '中' ? C.amber : '#ef4444'

  const EVENTS = [
    { date: '06-28', day: '周六', title: 'Q2公关复盘内部分享会', time: '14:00', loc: '中首公司大会议室', type: '内部', urgent: false },
    { date: '06-29', day: '周日', title: '大连夏季达沃斯媒体务要查', time: '09:30', loc: '大连世界博览中心', type: '媒体活动', urgent: true },
    { date: '07-01', day: '周二', title: 'Tech渠道咖啡座分享直播', time: '19:00', loc: 'Online', type: '内容营销', urgent: false },
    { date: '07-03', day: '周四', title: 'Q3媒体合作谈判启动会', time: '10:00', loc: '公关部会议室', type: '媒体活动', urgent: false },
    { date: '07-07', day: '周一', title: '品牌升级Campaign内容评审会', time: '15:30', loc: '创意中心', type: '项目推进', urgent: false },
  ]

  const load = async () => { setLoading(true); try { setTodos(await get('/api/todos')) } catch {}; setLoading(false) }
  useEffect(() => { load() }, [])

  const toggleTodo = async (id: number) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))
    try {
      const res = await post(`/api/todos/${id}/toggle`)
      if (res && typeof res.done === 'boolean') {
        setTodos(prev => prev.map(t => t.id === id ? { ...t, done: res.done } : t))
      }
    } catch {}
  }

  const deleteTodo = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try { await del_(`/api/todos/${id}`); setTodos(prev => prev.filter(t => t.id !== id)); toast('已删除') } catch {}
  }

  const addTodo = async () => {
    if (!newTodo.trim() || adding) return
    setAdding(true)
    const localRow = { id: Date.now(), text: newTodo.trim(), priority: newPriority, done: false, created_at: new Date().toISOString() }
    try {
      const row = await post('/api/todos', { text: newTodo.trim(), priority: newPriority })
      if (row && row.id) { setTodos(prev => [row, ...prev]) } else { setTodos(prev => [localRow, ...prev]) }
    } catch { setTodos(prev => [localRow, ...prev]) }
    setNewTodo(''); setShowForm(false); setAdding(false)
  }

  const tools = [
    { icon: '◉', label: '舆情监测', sub: '实时监控' },
    { icon: '◎', label: '媒体通讯录', sub: '8位记者' },
    { icon: '▦', label: '活动排期', sub: '本周5场' },
    { icon: '▷', label: '审批提报', sub: '2条待审' },
    { icon: '☰', label: '口径速查', sub: '快速检索' },
    { icon: '⊞', label: '数据报告', sub: '周报生成' },
  ]

  const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}>
      <div style={{ width: '100%', maxHeight: '85vh', background: C.bg, borderRadius: '20px 20px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: C.textMuted, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  )
  return (
    <div style={{ padding: '0 0 100px' }}>
      <div style={{ padding: '20px' }}>
        <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 1, marginBottom: 12 }}>快捷工具</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 28 }}>
          {tools.map(t => (
            <button key={t.label} onClick={() => setActiveTool(t.label)}
              style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: '16px 12px', textAlign: 'center', cursor: 'pointer', background: C.bg, transition: 'all 0.15s', position: 'relative' }}>
              <div style={{ fontSize: 22, color: C.accent, marginBottom: 6, fontFamily: 'monospace' }}>{t.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{t.label}</div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{t.sub}</div>
            </button>
          ))}
        </div>

        {/* 舟情监测 Modal */}
        {activeTool === '舟情监测' && (
          <Modal title="舟情监测 · 实时" onClose={() => setActiveTool(null)}>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f0fdf4', borderRadius: 10, marginBottom: 16, border: '1px solid #bbf7d0' }}>
                <span style={{ fontSize: 18 }}>✔️</span>
                <div><div style={{ fontSize: 12, fontWeight: 600, color: '#166534' }}>整体舟情健康</div><div style={{ fontSize: 11, color: '#15803d' }}>全网小红书相关话题均处于正常水平，无重大负面舱情</div></div>
              </div>
              {SENTIMENT.map(s => (
                <div key={s.platform} style={{ marginBottom: 14, padding: '14px', background: C.bgSub, borderRadius: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.platform}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: riskColor(s.risk), background: `${riskColor(s.risk)}18`, padding: '2px 8px', borderRadius: 20 }}>风险: {s.risk}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8, height: 8, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${s.pos}%`, background: C.green }} />
                    <div style={{ width: `${s.neu}%`, background: '#e5e7eb' }} />
                    <div style={{ width: `${s.neg}%`, background: '#ef4444' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 10, color: C.textMuted, marginBottom: 6 }}>
                    <span style={{ color: C.green }}>↑ 正面 {s.pos}%</span><span>中性 {s.neu}%</span><span style={{ color: '#ef4444' }}>↓ 负面 {s.neg}%</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {s.hot.map(h => <span key={h} style={{ fontSize: 10, color: C.blue, background: 'rgba(56,182,255,0.1)', padding: '2px 8px', borderRadius: 10 }}>{h}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </Modal>
        )}

        {/* 媒体通讯录 Modal */}
        {activeTool === '媒体通讯录' && (
          <Modal title="媒体通讯录" onClose={() => { setActiveTool(null); setMediaQuery('') }}>
            <div style={{ padding: '12px 20px' }}>
              <input value={mediaQuery} onChange={e => setMediaQuery(e.target.value)}
                placeholder="搜索姓名、媒体、条线..."
                style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: C.text, background: C.bgSub, outline: 'none', marginBottom: 12 }} />
              {filteredMedia.map((m, i) => (
                <div key={i} style={{ padding: '12px 0', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{m.name[0]}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{m.name}</span>
                      <span style={{ fontSize: 10, color: m.tier === 'S' ? '#f59e0b' : m.tier === 'A' ? C.blue : C.textMuted, fontWeight: 700, background: m.tier === 'S' ? '#fef3c7' : m.tier === 'A' ? 'rgba(56,182,255,0.1)' : C.bgSub, padding: '1px 6px', borderRadius: 4 }}>Tier {m.tier}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.textSub }}>{m.outlet} · {m.beat}</div>
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>WeChat: {m.wechat}</div>
                  </div>
                  <button onClick={() => { navigator.clipboard?.writeText(m.wechat); toast('已复制微信号') }}
                    style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.line}`, background: C.bg, color: C.textSub, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>复制</button>
                </div>
              ))}
            </div>
          </Modal>
        )}

        {/* 活动排期 Modal */}
        {activeTool === '活动排期' && (
          <Modal title="活动排期" onClose={() => setActiveTool(null)}>
            <div style={{ padding: '16px 20px' }}>
              {EVENTS.map((ev, i) => (
                <div key={i} style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
                  <div style={{ textAlign: 'center', flexShrink: 0, width: 44 }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: ev.urgent ? '#ef4444' : C.accent, lineHeight: 1 }}>{ev.date.split('-')[1]}</div>
                    <div style={{ fontSize: 9, color: C.textMuted, marginTop: 2 }}>{ev.day}</div>
                  </div>
                  <div style={{ flex: 1, padding: '12px 14px', borderRadius: 10, background: ev.urgent ? '#fff1f2' : C.bgSub, border: `1px solid ${ev.urgent ? '#fecdd3' : C.line}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: ev.urgent ? '#ef4444' : C.text, flex: 1 }}>{ev.title}</span>
                      {ev.urgent && <span style={{ fontSize: 9, color: '#ef4444', background: '#fee2e2', padding: '2px 6px', borderRadius: 4, flexShrink: 0, marginLeft: 6 }}>紧急</span>}
                    </div>
                    <div style={{ fontSize: 11, color: C.textMuted }}>{ev.time} · {ev.loc}</div>
                    <div style={{ marginTop: 6 }}><Tag text={ev.type} xs /></div>
                  </div>
                </div>
              ))}
            </div>
          </Modal>
        )}

        {/* 审批提报 Modal */}
        {activeTool === '审批提报' && (
          <Modal title="审批提报" onClose={() => setActiveTool(null)}>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {['待审', '已完成'].map(s => (
                  <div key={s} style={{ padding: '4px 14px', borderRadius: 20, background: s === '待审' ? C.accent : C.bgSub, color: s === '待审' ? '#fff' : C.textMuted, fontSize: 12, fontWeight: 600 }}>
                    {s}({approvals.filter(a => s === '待审' ? a.status === '待审' : a.status !== '待审').length})
                  </div>
                ))}
              </div>
              {approvals.map(a => (
                <div key={a.id} style={{ padding: '14px', marginBottom: 10, borderRadius: 10, background: C.bgSub, border: `1px solid ${a.urgent && a.status === '待审' ? '#fecdd3' : C.line}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1 }}>{a.title}</span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: a.status === '待审' ? '#fef9c3' : '#f0fdf4', color: a.status === '待审' ? '#ca8a04' : '#166534', fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>{a.status}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginBottom: a.status === '待审' ? 10 : 0 }}>{a.type} · {a.submitter} · {a.time}</div>
                  {a.status === '待审' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setApprovals(prev => prev.map(x => x.id === a.id ? { ...x, status: '已通过' } : x)); toast('✔ 审批已通过') }}
                        style={{ flex: 1, padding: '8px', borderRadius: 7, border: 'none', background: C.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>通过</button>
                      <button onClick={() => { setApprovals(prev => prev.map(x => x.id === a.id ? { ...x, status: '已驳回' } : x)); toast('驳回已发送') }}
                        style={{ flex: 1, padding: '8px', borderRadius: 7, border: `1px solid ${C.line}`, background: C.bg, color: C.textSub, fontSize: 12, cursor: 'pointer' }}>驳回</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Modal>
        )}

        {/* 口径速查 Modal */}
        {activeTool === '口径速查' && (
          <Modal title="口径速查" onClose={() => { setActiveTool(null); setKwQuery('') }}>
            <div style={{ padding: '12px 20px' }}>
              <input value={kwQuery} onChange={e => setKwQuery(e.target.value)}
                placeholder="搜索关键词，如：MAU、定位、媒体..."
                style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: C.text, background: C.bgSub, outline: 'none', marginBottom: 12 }} />
              {filteredKw.length === 0 && <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: '24px 0' }}>未找到相关口径</div>}
              {filteredKw.map((k, i) => (
                <div key={i} style={{ padding: '14px 0', borderBottom: `1px solid ${C.line}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>{k.kw}</div>
                  <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.7 }}>{k.content}</div>
                  <button onClick={() => { navigator.clipboard?.writeText(k.content); toast('口径已复制') }}
                    style={{ marginTop: 8, padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.line}`, background: C.bg, color: C.textMuted, fontSize: 11, cursor: 'pointer' }}>复制口径</button>
                </div>
              ))}
            </div>
          </Modal>
        )}

        {/* 数据报告 Modal */}
        {activeTool === '数据报告' && (
          <Modal title="数据报告" onClose={() => { setActiveTool(null); setReportDone(false); setReportGen(false) }}>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10 }}>选择报告类型</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                {['周报', '月报', '舟情专题', '媒体分析', '活动复盔'].map(t => (
                  <button key={t} onClick={() => { setReportType(t); setReportDone(false) }}
                    style={{ padding: '7px 16px', borderRadius: 20, border: `1px solid ${reportType === t ? C.accent : C.line}`, background: reportType === t ? C.accent : C.bg, color: reportType === t ? '#fff' : C.textSub, fontSize: 12, fontWeight: reportType === t ? 600 : 400, cursor: 'pointer' }}>{t}</button>
                ))}
              </div>
              <div style={{ padding: '16px', background: C.bgSub, borderRadius: 10, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>{reportType}内容预览</div>
                {reportType === '周报' && (
                  <div style={{ fontSize: 12, color: C.textSub, lineHeight: 2 }}>
                    • 本周舟情概况：全平台整体健康，无重大负面事件<br/>
                    • 媒体首曝光：共计 12 篇报道，其中主动报道 7 篇<br/>
                    • 社交超话题：#小红书月活4亿# 曝光 2.3 亿<br/>
                    • 本周活动：1 场媒体活动，到场记者 28 位<br/>
                    • 待跟进事项：达沃斯媒体加受名单确认
                  </div>
                )}
                {reportType === '舟情专题' && (
                  <div style={{ fontSize: 12, color: C.textSub, lineHeight: 2 }}>
                    • 监测平台：微博 / 微信 / 小红书 / 抖音 / 知乎<br/>
                    • 关键词覆盖：小红书 / XHS / 公关日课<br/>
                    • 全局词情：正面 65%，中性 28%，负面 7%<br/>
                    • 负面微博 TOP3：已标注闭中包含
                  </div>
                )}
                {!['周报', '舟情专题'].includes(reportType) && (
                  <div style={{ fontSize: 12, color: C.textMuted }}>{reportType}模板将包含本预览期的所有关键数据指标。</div>
                )}
              </div>
              {!reportDone ? (
                <button
                  onClick={() => { setReportGen(true); setTimeout(() => { setReportGen(false); setReportDone(true); toast('✅ 报告已生成') }, 2200) }}
                  disabled={reportGen}
                  style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', background: reportGen ? C.textMuted : C.accent, color: '#fff', fontSize: 14, fontWeight: 700, cursor: reportGen ? 'not-allowed' : 'pointer' }}>
                  {reportGen ? '生成中...' : `生成 ${reportType}`}
                </button>
              ) : (
                <div style={{ padding: '16px', background: '#f0fdf4', borderRadius: 10, textAlign: 'center', border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#166534', marginBottom: 4 }}>{reportType}已生成</div>
                  <div style={{ fontSize: 11, color: '#15803d' }}>已自动发送至公关部内部群组</div>
                </div>
              )}
            </div>
          </Modal>
        )}

        {/* 今日待办 — 新版SVG(1176x225)，蓝色大底板+左侧日历卡片 */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <img src="/icons/10.svg" alt="" style={{ width: '100%', height: 'auto', display: 'block' }} />
          {/* 蓝色主区域：left≈25.5%, top≈8%, 宽≈74.5%, 高≈84% — 放标题+新增 */}
          <div style={{
            position: 'absolute',
            top: '8%', left: '22%', right: '1%', bottom: '8%',
            display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingLeft: '4%', paddingRight: '4%',
          }}>
            <div style={{ pointerEvents: 'none' }}>
              <div style={{ fontSize: 14, color: '#fff', fontWeight: 900, lineHeight: 1.2 }}>今日待办</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', marginTop: 3 }}>{todos.filter(t => !t.done).length}项未完成</div>
            </div>
            <button onClick={() => setShowForm(!showForm)} style={{
              fontSize: 12, color: '#fff', background: 'none',
              border: 'none', borderRadius: 0,
              padding: '5px 14px', cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap',
            }}>+ 新增</button>
          </div>
        </div>

        {showForm && (
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
            <input value={newTodo} onChange={e => setNewTodo(e.target.value)}
              placeholder="输入待办内容..."
              onKeyDown={e => e.key === 'Enter' && addTodo()}
              style={{ width: '100%', border: `1px solid ${C.line}`, borderRadius: 7, padding: '9px 12px', fontSize: 13, color: C.text, background: C.bgSub, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {['低', '中', '高', '紧急'].map(p => (
                <button key={p} onClick={() => setNewPriority(p)}
                  style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${newPriority === p ? C.accent : C.line}`, background: newPriority === p ? C.accent : C.bg, color: newPriority === p ? '#fff' : C.textSub, fontSize: 11, cursor: 'pointer' }}>{p}</button>
              ))}
              <button onClick={addTodo} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 7, border: 'none', background: C.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {adding ? '...' : '确认'}
              </button>
            </div>
          </div>
        )}

        {loading ? <Spinner /> : (
          <div style={{ marginBottom: 24 }}>

            {todos.map((t, i) => (
              <div key={t.id} style={{ marginBottom: 4 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 16px', borderRadius: 10,
                  background: t.done ? 'transparent' : '#F7F7F5',
                  transition: 'background 0.25s ease, opacity 0.25s ease',
                  opacity: t.done ? 0.55 : 1,
                }}>
                  {/* 圆点按钮 — 点击触发完成 */}
                  <div
                    onClick={() => toggleTodo(t.id)}
                    style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${t.done ? C.accent : C.line}`,
                      background: t.done ? C.accent : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'background 0.2s ease, border-color 0.2s ease',
                    }}
                  >
                    {t.done && (
                      <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                        <path d="M1 4L4 7.5L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  {/* 任务文字 — 完成后中间划线 */}
                  <span style={{
                    flex: 1, fontSize: 13, color: t.done ? C.textMuted : C.text,
                    fontWeight: t.done ? 400 : 500,
                    textDecoration: t.done ? 'line-through' : 'none',
                    textDecorationColor: C.textMuted,
                    transition: 'color 0.25s ease',
                  }}>{t.text}</span>
                  <Tag text={t.priority} v={t.priority === '紧急' ? 'r' : t.priority === '高' ? 'a' : 'd'} xs />
                  <button onClick={(e) => deleteTodo(t.id, e)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}>×</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 1, marginBottom: 10 }}>本周活动</div>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
          {[
            { date: '周三 6/25', event: '品牌战略研讨会', type: '内部会议' },
            { date: '周四 6/26', event: 'CEO媒体采访（第一财经）', type: '媒体关系' },
            { date: '周五 6/27', event: 'Q2传播数据复盘会', type: '内部会议' },
          ].map((item, i) => (
            <div key={i}>
              {i > 0 && <Divider />}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{item.event}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{item.date}</div>
                </div>
                <Tag text={item.type} v={item.type === '媒体关系' ? 'b' : 'd'} xs />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ===================== Personal Center =====================
function PersonalCenter({ user, onClose, toast }: { user: User | null; onClose: () => void; toast: (m: string) => void }) {
  const [profile, setProfile] = useState<any>(null)
  const [ability, setAbility] = useState({ content: 72, comm: 58, struct: 45 })
  const [diary, setDiary] = useState<any[]>([])
  const [diaryText, setDiaryText] = useState('')
  const [submittingDiary, setSubmittingDiary] = useState(false)
  const [okrs, setOkrs] = useState([
    { t: '完成结构化思维课程全部30题', v: 0, total: 30 },
    { t: '每日资讯必读完成率≥90%', v: 0, total: 10 },
    { t: '上传3个内部案例至案例库', v: 0, total: 3 },
  ])

  useEffect(() => {
    Promise.all([get('/api/profile'), get('/api/train/ability'), get('/api/diary')]).then(([p, a, d]) => {
      setProfile(p); setAbility(a); setDiary(d)
      setOkrs(prev => [
        { ...prev[0], v: Math.min(30, (a.struct - 45) / 2) },
        { ...prev[1], v: Math.min(10, p.read_count) },
        { ...prev[2], v: 0 },
      ])
    }).catch(() => {})
  }, [])

  const addDiary = async () => {
    if (!diaryText.trim() || submittingDiary) return
    setSubmittingDiary(true)
    const localRow = { id: Date.now(), content: diaryText.trim(), created_at: new Date().toISOString() }
    try {
      const row = await post('/api/diary', { content: diaryText })
      if (row && row.id && row.created_at) {
        setDiary(prev => [row, ...prev])
      } else {
        setDiary(prev => [localRow, ...prev])
      }
    } catch {
      setDiary(prev => [localRow, ...prev])
    }
    setDiaryText(''); toast('✓ 日记已保存')
    setSubmittingDiary(false)
  }

  const abilities = [
    { label: '内容力', value: ability.content, color: C.blue },
    { label: '沟通力', value: ability.comm, color: C.green },
    { label: '结构化思维', value: ability.struct, color: C.amber },
    { label: '资讯掌握度', value: Math.min(99, (profile?.read_count || 0) * 5 + 50), color: C.accent },
    { label: '业务熟知度', value: 63, color: C.textSub },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg, zIndex: 200, overflowY: 'auto' }}>
      <div style={{ borderBottom: `1px solid ${C.line}`, padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: C.bg, zIndex: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>个人中心</span>
        <button onClick={onClose} style={{ background: 'none', border: `1px solid ${C.line}`, borderRadius: 20, padding: '4px 14px', fontSize: 12, color: C.textSub, cursor: 'pointer' }}>关闭</button>
      </div>
      <div style={{ padding: '20px' }}>
        {/* 用户 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, #38b6ff 0%, #1a9de0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 800, flexShrink: 0, boxShadow: '0 4px 14px rgba(56,182,255,0.35)' }}>
            {user?.name?.[0] || 'P'}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, letterSpacing: -0.5 }}>{user?.name || '公关人'}</div>
            <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{user?.email || ''}</div>
            <div style={{ marginTop: 4 }}><Tag text="公关部 · 高级公关经理" xs /></div>
          </div>
        </div>

        {/* 数据看板 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { l: '训练完成率', v: `${profile?.train_rate ?? 0}%` },
            { l: '连续打卡', v: `${profile?.streak ?? 7}天` },
            { l: '已读资讯', v: `${profile?.read_count ?? 0}篇` },
            { l: '团队排名', v: profile?.team_rank ?? '#-' },
          ].map(item => (
            <div key={item.l} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: -1 }}>{item.v}</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{item.l}</div>
            </div>
          ))}
        </div>

        {/* 能力 */}
        <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 1, marginBottom: 10 }}>能力概览（实时计算）</div>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: '16px', marginBottom: 20 }}>
          {abilities.map(a => (
            <div key={a.label} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: C.text }}>{a.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: a.color }}>{Math.round(a.value)}</span>
              </div>
              <Bar value={a.value} color={a.color} />
            </div>
          ))}
        </div>

        {/* OKR - with icon11 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <img src="/icons/11.svg" alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
          <span style={{ fontSize: 11, color: C.textMuted, letterSpacing: 1 }}>本月 OKR</span>
        </div>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
          {okrs.map((o, i) => (
            <div key={i}>
              {i > 0 && <Divider />}
              <div style={{ padding: '13px 16px' }}>
                <div style={{ fontSize: 13, color: C.text, marginBottom: 8 }}>{o.t}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}><Bar value={Math.max(0, (o.v / o.total) * 100)} /></div>
                  <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>{Math.max(0, Math.round(o.v))}/{o.total}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 思考日记 — diary.svg（旧版记事本底板），精确定位到白色记事本内容区（无额外横线） */}
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <img src="/icons/diary.svg" alt="" style={{ width: '100%', height: 'auto', display: 'block' }} />
          <div style={{
            position: 'absolute',
            top: '30%', left: '32%', right: '34%', bottom: '30%',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <textarea value={diaryText} onChange={e => setDiaryText(e.target.value)}
              placeholder="记下思考..."
              style={{ flex: 1, width: '100%', boxSizing: 'border-box', border: 'none', background: 'transparent', fontSize: 9, color: C.text, resize: 'none', fontFamily: 'inherit', lineHeight: '1.6', outline: 'none', position: 'relative', zIndex: 1, minHeight: 0, padding: '0 2px' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', position: 'relative', zIndex: 1, flexShrink: 0 }}>
              <button onClick={addDiary} disabled={!diaryText.trim() || submittingDiary}
                style={{ padding: '1px 6px', borderRadius: 8, border: 'none', background: diaryText.trim() ? '#38b6ff' : 'transparent', color: diaryText.trim() ? '#fff' : C.textMuted, fontSize: 8, fontWeight: 700, cursor: diaryText.trim() ? 'pointer' : 'default' }}>
                {submittingDiary ? '...' : '记下来✓'}
              </button>
            </div>
          </div>
        </div>
        {diary.length === 0 && (
          <div style={{ padding: '4px 14px 12px', fontSize: 12, color: C.textMuted }}>还没有日记，写下今天的思考吧 ✍</div>
        )}
        {diary.slice(0, 3).map((d, i) => (
          <div key={i} style={{ padding: '8px 14px', borderBottom: '1px solid rgba(56,182,255,0.08)' }}>
            <div style={{ fontSize: 10, color: '#38b6ff', fontWeight: 700, marginBottom: 2 }}>
              {d.created_at ? new Date(d.created_at).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }) : '今天'}
            </div>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>{d.content}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ===================== Main =====================
export default function App() {
  const [screen, setScreen] = useState<'splash' | 'app'>('splash')
  const [user, setUser] = useState<User | null>(null)
  const [tab, setTab] = useState<Tab>('train')
  const [showPersonal, setShowPersonal] = useState(false)
  const [appVis, setAppVis] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/whoami').then(r => r.ok ? r.json() : null).then(d => { if (d) setUser(d) }).catch(() => {})
  }, [])

  const toast = useCallback((m: string) => { setToastMsg(m); }, [])
  const handleEnter = () => { setScreen('app'); setTimeout(() => setAppVis(true), 60) }

  const TABS: { key: Tab; label: string; icon: string; badge?: number }[] = [
    { key: 'news', label: '资讯', icon: '◎', badge: 2 },
    { key: 'org', label: '组织', icon: '▦' },
    { key: 'cases', label: '案例', icon: '☰' },
    { key: 'train', label: '训练', icon: '✦', badge: 2 },
    { key: 'workbench', label: '工作台', icon: '▷' },
  ]
  const TAB_LABEL: Record<Tab, string> = { news: '资讯', org: '组织', cases: '案例', train: '训练', workbench: '工作台' }

  if (screen === 'splash') return <Splash onEnter={handleEnter} />

  return (
    <div style={{ background: '#f0f4f8', minHeight: '100vh', display: 'flex', justifyContent: 'center' }}>
    <div style={{ background: C.bg, minHeight: '100vh', width: '100%', maxWidth: 480, position: 'relative', opacity: appVis ? 1 : 0, transition: 'opacity 0.4s', boxShadow: '0 0 40px rgba(0,0,0,0.08)' }}>
      {toastMsg && <Toast msg={toastMsg} onDone={() => setToastMsg(null)} />}
      {showPersonal && <PersonalCenter user={user} onClose={() => setShowPersonal(false)} toast={toast} />}

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.line}`, padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: C.bg, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/icons/logo-pr.svg" alt="PR Daily" style={{ width: 30, height: 30, objectFit: 'contain' }} />
          <span style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: -0.5 }}>PR Daily</span>
          <span style={{ fontSize: 12, color: C.textMuted }}>· {TAB_LABEL[tab]}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <span style={{ fontSize: 18, color: C.textSub, cursor: 'pointer' }}>○</span>
            <div style={{ position: 'absolute', top: 0, right: 0, width: 6, height: 6, borderRadius: '50%', background: C.red, border: '1px solid #fff' }} />
          </div>
          <div onClick={() => setShowPersonal(true)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #38b6ff 0%, #1a9de0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(56,182,255,0.3)' }}>
            {user?.name?.[0] || 'P'}
          </div>
        </div>
      </div>

      {/* Content */}
      <div>
        {tab === 'train' && <TrainTab toast={toast} />}
        {tab === 'news' && <NewsTab toast={toast} />}
        {tab === 'org' && <OrgTab toast={toast} />}
        {tab === 'cases' && <CasesTab toast={toast} />}
        {tab === 'workbench' && <WorkbenchTab toast={toast} />}
      </div>

      {/* Bottom Nav */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: C.bg, borderTop: `1px solid ${C.line}`, display: 'flex', padding: '8px 0 12px', zIndex: 50 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', position: 'relative' }}>
            {t.badge && tab !== t.key && (
              <div style={{ position: 'absolute', top: 1, right: '28%', width: 14, height: 14, borderRadius: '50%', background: C.red, color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{t.badge}</div>
            )}
            <span style={{ fontSize: 18, color: tab === t.key ? C.accent : C.textMuted, fontFamily: 'monospace', fontWeight: tab === t.key ? 700 : 400 }}>{t.icon}</span>
            <span style={{ fontSize: 10, color: tab === t.key ? C.accent : C.textMuted, fontWeight: tab === t.key ? 700 : 400 }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
    </div>
  )
}
