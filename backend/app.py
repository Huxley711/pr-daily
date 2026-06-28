"""PR Daily - Backend API - FastAPI + PostgreSQL"""
from __future__ import annotations

import json
import datetime
from pathlib import Path
from typing import Optional

import os
import asyncpg
import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "sk-807cb339a0824f84a00fc410e98abdf9")
OPENAI_BASE_URL = "https://api.deepseek.com/v1"

ROOT = Path(__file__).resolve().parent
FRONTEND_DIST = ROOT.parent / "frontend" / "dist"
INDEX_HTML = FRONTEND_DIST / "index.html"

# ---- Auth (SSO optional, fallback to demo user for public deploy) ----
DEMO_USER = {"email": "demo@pr-daily.com", "name": "演示用户", "userId": "demo-public"}

def _parse_sso_user(h: Optional[str]):
    if not h:
        return None
    try:
        fixed = h.encode("latin-1").decode("utf-8")
        d = json.loads(fixed)
        return {
            "email": d.get("email") or d.get("workEmail", ""),
            "name": d.get("name") or d.get("displayName", ""),
            "userId": str(d.get("userId") or d.get("id", "")),
        }
    except Exception:
        return None

def _require_user(h: Optional[str]) -> dict:
    u = _parse_sso_user(h)
    if u:
        return u
    # 公网部署无 SSO 时，返回演示用户（不强制 401）
    return DEMO_USER

# ---- DB ----
def _load_db_props(path="db.properties") -> dict:
    props = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                k, _, v = line.partition("=")
                props[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return props

_pool: Optional[asyncpg.Pool] = None

async def get_pool() -> Optional[asyncpg.Pool]:
    global _pool
    if _pool is None:
        props = _load_db_props()
        if not props.get("db.host"):
            return None
        _pool = await asyncpg.create_pool(
            user=props["db.username"],
            password=props["db.password"],
            host=props["db.host"],
            port=int(props["db.port"]),
            database=props["db.database"],
            min_size=1, max_size=5,
        )
    return _pool

async def init_db(pool: asyncpg.Pool):
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS pr_users (
                id SERIAL PRIMARY KEY,
                sso_id TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL,
                name TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS news_reads (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                news_id INT NOT NULL,
                read BOOLEAN DEFAULT FALSE,
                favorited BOOLEAN DEFAULT FALSE,
                annotation TEXT DEFAULT '',
                UNIQUE(user_id, news_id)
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS train_records (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                sub TEXT NOT NULL,
                question_type TEXT,
                answer TEXT,
                submitted_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS train_tasks (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                task_id INT NOT NULL,
                done BOOLEAN DEFAULT FALSE,
                done_at TIMESTAMPTZ,
                UNIQUE(user_id, task_id)
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS org_test_records (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                score INT NOT NULL,
                total INT NOT NULL,
                taken_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS case_comments (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                user_name TEXT,
                case_id INT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS case_favorites (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                case_id INT NOT NULL,
                UNIQUE(user_id, case_id)
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS todos (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                text TEXT NOT NULL,
                priority TEXT DEFAULT '中',
                done BOOLEAN DEFAULT FALSE,
                done_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS diary_entries (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        # seed default todos
        defaults = [
            ("system", "整理Q2媒体关系维护报告", "高"),
            ("system", "审核品牌月报初稿", "高"),
            ("system", "确认CEO采访提纲", "紧急"),
            ("system", "更新口径库-敏感问题QA", "中"),
        ]
        for uid, text, pri in defaults:
            await conn.execute(
                "INSERT INTO todos (user_id, text, priority) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
                uid, text, pri
            )

# ---- App ----
app = FastAPI(title="PR Daily API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    try:
        pool = await get_pool()
        if pool:
            await init_db(pool)
    except Exception as e:
        print(f"[startup] DB skipped: {e}")

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/api/health")
def api_health():
    return {"ok": True, "service": "pr-daily"}

@app.get("/api/whoami")
def whoami(decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    u = _require_user(decrypted_userinfo)
    return JSONResponse(u)

# ---- 资讯 ----
NEWS_LIST = [
    # ===== AI科技 =====
    {
        "id": 1,
        "title": "白宫要求OpenAI分阶段发布GPT-5.6：AI监管进入政府干预新纪元",
        "src": "新浪科技",
        "url": "https://k.sina.com.cn/article_7857201856_1d45362c001907f33y.html",
        "time": "2026-06-26",
        "required": True,
        "cat": "AI科技",
        "image": "https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=400&q=80",
        "tags": ["#GPT-5.6", "#OpenAI", "#AI监管", "#白宫", "#政府干预"],
        "summary": "白宫已要求OpenAI公司分阶段发布其下一代模型GPT-5.6，在广泛推出前仅能在少数经政府批准的合作伙伴中发布。这是美国政府首次对具体AI模型发布节奏进行直接干预，标志着AI监管从立法层面进入行政执行阶段。"
    },
    {
        "id": 2,
        "title": "2026年6月AI大爆发：智能体全面落地，百万上下文成行业标配",
        "src": "魔珐星云/CSDN",
        "url": "https://xingyun3d.csdn.net/6a35e06e10ee7a33f28013c7.html",
        "time": "2026-06-20",
        "required": False,
        "cat": "AI科技",
        "image": "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=400&q=80",
        "tags": ["#AI智能体", "#大模型", "#百万上下文", "#多模态", "#行业趋势"],
        "summary": "复盘2026年6月AI行业：三大不可逆趋势清晰显现——百万上下文+原生多模态成标配，AI Agent从demo走向商业化落地，国产大模型在垂直行业场景超越海外竞品。智能体爆发成为下半年最确定的技术主线。"
    },
    {
        "id": 3,
        "title": "Anthropic应政府要求暂停新模型访问：Claude旗下两款产品被临时叫停",
        "src": "RFI法国国际广播",
        "url": "https://www.rfi.fr/cn/国际/20260613-美国顶级人工智能公司anthropic应政府要求暂停最强大ai系统访问",
        "time": "2026-06-13",
        "required": False,
        "cat": "AI科技",
        "image": "https://images.unsplash.com/photo-1655720828018-edd2daec9349?w=400&q=80",
        "tags": ["#Anthropic", "#Claude", "#AI合规", "#美国监管", "#暂停发布"],
        "summary": "Anthropic宣布暂停Mythos 5和Fable 5两款新模型发布，以遵守政府下达的行政指令。这是继白宫要求OpenAI限制GPT-5.6后，美国政府在短期内对多家头部AI公司发布节奏的第二次直接干预，AI监管风险被行业高度关注。"
    },
    # ===== 品牌商业 =====
    {
        "id": 4,
        "title": "lululemon长城营销翻车：文化冲突引爆舆论，官方48h内致歉下架",
        "src": "北京商报",
        "url": "https://m.bbtnews.com.cn/content/ff/e0/232364.html",
        "time": "2026-06-18",
        "required": True,
        "cat": "品牌商业",
        "image": "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400&q=80",
        "tags": ["#lululemon", "#文化营销", "#舆情危机", "#品牌翻车", "#危机公关"],
        "summary": "lululemon在长城举办营销活动引发文化认知争议，被指'消费历史地标'。6月16日官方发声明承认'专业认知局限，未充分识别潜在争议'，并致歉下架相关内容。此案成为2026年外资品牌在华文化营销失误的典型案例。"
    },
    {
        "id": 5,
        "title": "上外公关系发布首期《全球企业危机月度观察》：AI舆情监控成新刚需",
        "src": "中国公关网",
        "url": "https://mtz.china.com/touzi/2026/0605/239314.html",
        "time": "2026-06-05",
        "required": False,
        "cat": "品牌商业",
        "image": "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=400&q=80",
        "tags": ["#危机观察", "#声誉管理", "#舆情监控", "#公关行业", "#月度报告"],
        "summary": "上外公关系正式发布业内首个《全球企业与名人危机月度观察》，每月1日定期更新，系统监测上月全球声誉危机事件。创刊号覆盖2026年5月，已有多家头部公关公司订阅。报告显示AI辅助舆情监控已成公关标配工具。"
    },
    {
        "id": 6,
        "title": "2026上半年品牌危机白皮书：价值观冲突取代产品质量成第一危机诱因",
        "src": "识微科技",
        "url": "https://m.civiw.com/opinion/20260623165623774",
        "time": "2026-06-23",
        "required": False,
        "cat": "品牌商业",
        "image": "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=400&q=80",
        "tags": ["#品牌危机", "#价值观冲突", "#舆情白皮书", "#2026趋势", "#声誉风险"],
        "summary": "识微科技发布2026上半年品牌危机白皮书：价值观与文化冲突类危机占比首次超越产品质量问题，成为品牌危机第一诱因（占比38%）。稀释式道歉、外包公关团队局限是两大翻车根源，前置风控能力成核心竞争力。"
    },
    # ===== 政策监管 =====
    {
        "id": 7,
        "title": "工信部等七部门联合出台平台经济协同方案：到2028年打造百家'链主'平台",
        "src": "财联社",
        "url": "https://m.cls.cn/detail/2405068",
        "time": "2026-06-22",
        "required": False,
        "cat": "政策监管",
        "image": "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=400&q=80",
        "tags": ["#平台经济", "#政策利好", "#工信部", "#数字经济", "#互联网监管"],
        "summary": "工信部等七部门联合印发《促进平台经济大中小企业协同发展行动方案（2026—2028年）》，明确到2028年遴选不少于100家'链主'平台企业。分析认为这标志着平台经济监管从整治期全面转向促进发展期，利好头部互联网企业。"
    },
    {
        "id": 8,
        "title": "市场监管总局广告执法指南出炉：极限词、明星连带责任重点划线",
        "src": "市场监管总局",
        "url": "https://www.shui5.cn/article/1d/188980.html",
        "time": "2025-06-19",
        "required": True,
        "cat": "政策监管",
        "image": "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&q=80",
        "tags": ["#广告法", "#合规", "#执法指南", "#KOL风控", "#品牌合规"],
        "summary": "市监广发〔2025〕55号文正式落地，细化'绝对化用语'、明星代言连带责任等执法标准。品牌需重点关注：极限词使用、数据真实性核验、KOL内容审查。违规最高可罚广告费用5倍。"
    },
    # ===== 金融财经 =====
    {
        "id": 9,
        "title": "2026中国国际金融展：数字人民币跨境新进展，AI深度赋能金融全链路",
        "src": "新华网",
        "url": "https://www.news.cn/fortune/20260617/d297cdab324548a3ab840ed40fe4cad8/c.html",
        "time": "2026-06-17",
        "required": False,
        "cat": "金融财经",
        "image": "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&q=80",
        "tags": ["#数字人民币", "#金融科技", "#跨境支付", "#AI金融", "#上海金融展"],
        "summary": "2026中国国际金融展在上海开幕，数字人民币跨境服务迎来新进展，已接入13个境外市场。AI技术深度渗透风控、客服、投研等金融场景，多家银行展示大模型落地成果。数字金融基础设施建设进入快车道。"
    },
    {
        "id": 10,
        "title": "6月LPR维持不变：货币政策观望期，下半年降准预期升温",
        "src": "21财经",
        "url": "https://www.21jingji.com/article/20260601/herald/433c5ba86b1b0673d6af6f2ff0ad5788.html",
        "time": "2026-06-22",
        "required": False,
        "cat": "金融财经",
        "image": "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=400&q=80",
        "tags": ["#LPR", "#货币政策", "#降准预期", "#宏观经济", "#利率"],
        "summary": "6月LPR报价维持不变，1年期3.1%、5年期3.6%。多位经济学家预测，随着外部压力缓解、内需修复仍需刺激，央行或在三季度实施降准操作，释放流动性空间。房地产市场对5年期LPR走向密切关注。"
    },
    # ===== 互联网 =====
    {
        "id": 11,
        "title": "小红书月活突破4亿：商业化提速，品牌投放ROI成行业标杆",
        "src": "晚点LatePost",
        "url": "https://latepost.com",
        "time": "2026-06-15",
        "required": True,
        "cat": "互联网",
        "image": "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400&q=80",
        "tags": ["#小红书", "#月活4亿", "#品牌投放", "#内容电商", "#商业化"],
        "summary": "小红书月活用户突破4亿大关，商业化营收同比增长超120%。据多家广告代理商反馈，小红书美妆、食品、母婴类目品牌投放ROI已超过抖音和微信朋友圈。平台正加速布局直播电商，引入更多品牌自播。"
    },
    {
        "id": 12,
        "title": "2026大连夏季达沃斯：AI重塑供应链，平台经济成全球增长新引擎",
        "src": "21财经",
        "url": "https://www.21jingji.com/article/20260601/herald/433c5ba86b1b0673d6af6f2ff0ad5788.html",
        "time": "2026-06-25",
        "required": False,
        "cat": "互联网",
        "image": "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=400&q=80",
        "tags": ["#达沃斯", "#供应链", "#平台经济", "#全球化", "#数字贸易"],
        "summary": "2026夏季达沃斯论坛在大连开幕，AI重塑全球供应链成核心议题。多国政商领袖讨论平台经济的跨境监管协调问题，中国互联网平台出海政策与数据流通规则成焦点。阿里、腾讯、字节等派高管出席并发言。"
    },
    # ===== 新媒体 =====
    {
        "id": 13,
        "title": "抖音推出'品牌分'评级体系：内容质量直接影响流量分配权重",
        "src": "新榜",
        "url": "https://www.newrank.cn",
        "time": "2026-06-20",
        "required": True,
        "cat": "新媒体",
        "image": "https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=400&q=80",
        "tags": ["#抖音", "#品牌分", "#流量分配", "#内容营销", "#平台规则"],
        "summary": "抖音正式上线'品牌分'评级体系，综合内容质量、用户互动、投诉率等维度对品牌账号进行评分，高分品牌将获自然流量加权。业内分析认为，这是抖音将品牌内容质量与商业权益深度绑定的重要信号，对靠刷量的品牌影响巨大。"
    },
    {
        "id": 14,
        "title": "微信视频号直播GMV同比增300%：私域流量闭环成品牌新阵地",
        "src": "Tech星球",
        "url": "https://www.techplanet.cn",
        "time": "2026-06-18",
        "required": False,
        "cat": "新媒体",
        "image": "https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=400&q=80",
        "tags": ["#视频号", "#直播电商", "#私域", "#微信生态", "#品牌自播"],
        "summary": "微信视频号2026年上半年直播GMV同比增长超300%，成为增速最快的直播电商平台。品牌通过公众号+视频号+企业微信三端联动，实现私域流量高效变现。服装、美妆、食品等高复购品类表现尤为突出。"
    },
]

@app.get("/api/news")
async def get_news(cat: str = "全部", decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    user = _require_user(decrypted_userinfo)
    uid = user["userId"]
    filtered = NEWS_LIST if cat == "全部" else [n for n in NEWS_LIST if n["cat"] == cat]
    pool = await get_pool()
    if pool:
        async with pool.acquire() as conn:
            rows = await conn.fetch("SELECT news_id, read, favorited, annotation FROM news_reads WHERE user_id=$1", uid)
        states = {r["news_id"]: r for r in rows}
        return JSONResponse([{**n, "read": bool(states.get(n["id"], {}).get("read", False)), "favorited": bool(states.get(n["id"], {}).get("favorited", False)), "annotation": (states.get(n["id"]) or {}).get("annotation", "")} for n in filtered])
    return JSONResponse([{**n, "read": False, "favorited": False, "annotation": ""} for n in filtered])

class NewsAction(BaseModel):
    news_id: int
    action: str
    annotation: Optional[str] = None

@app.post("/api/news/action")
async def news_action(body: NewsAction, decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    user = _require_user(decrypted_userinfo)
    uid = user["userId"]
    pool = await get_pool()
    if pool:
        async with pool.acquire() as conn:
            if body.action == "read":
                await conn.execute("INSERT INTO news_reads (user_id, news_id, read) VALUES ($1,$2,true) ON CONFLICT (user_id, news_id) DO UPDATE SET read=true", uid, body.news_id)
            elif body.action == "favorite":
                await conn.execute("INSERT INTO news_reads (user_id, news_id, favorited) VALUES ($1,$2,true) ON CONFLICT (user_id, news_id) DO UPDATE SET favorited = NOT news_reads.favorited", uid, body.news_id)
            elif body.action == "annotate" and body.annotation is not None:
                await conn.execute("INSERT INTO news_reads (user_id, news_id, annotation) VALUES ($1,$2,$3) ON CONFLICT (user_id, news_id) DO UPDATE SET annotation=$3", uid, body.news_id, body.annotation)
    return JSONResponse({"ok": True})

# ---- 训练 ----
@app.get("/api/train/tasks")
async def get_train_tasks(decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    user = _require_user(decrypted_userinfo)
    uid = user["userId"]
    base = [{"id": 1, "sub": "content", "label": "短文案撰写", "done": False}, {"id": 2, "sub": "comm", "label": "媒体应答训练", "done": False}, {"id": 3, "sub": "struct", "label": "危机处置框架", "done": False}]
    pool = await get_pool()
    if pool:
        async with pool.acquire() as conn:
            rows = await conn.fetch("SELECT task_id, done FROM train_tasks WHERE user_id=$1", uid)
        done_map = {r["task_id"]: r["done"] for r in rows}
        return JSONResponse([{**t, "done": done_map.get(t["id"], False)} for t in base])
    return JSONResponse(base)

class TaskDone(BaseModel):
    task_id: int

@app.post("/api/train/task-done")
async def mark_task_done(body: TaskDone, decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    user = _require_user(decrypted_userinfo)
    pool = await get_pool()
    if pool:
        async with pool.acquire() as conn:
            await conn.execute("INSERT INTO train_tasks (user_id, task_id, done, done_at) VALUES ($1,$2,true,NOW()) ON CONFLICT (user_id, task_id) DO UPDATE SET done=true, done_at=NOW()", user["userId"], body.task_id)
    return JSONResponse({"ok": True})

class SubmitAnswer(BaseModel):
    sub: str
    question_type: str
    answer: str
    task_id: Optional[int] = None

SUB_NAMES = {"content": "内容力", "comm": "沟通力", "struct": "结构化思维"}

async def _ai_review(sub: str, question_type: str, answer: str) -> dict:
    sub_name = SUB_NAMES.get(sub, sub)
    system = f"""你是一位资深公关专家，正在评阅学员的{sub_name}练习作答。
请严格按以下JSON格式返回，不要输出任何多余内容：
{{
  "score": <1-10的整数>,
  "comment": "<100字以内的点评，指出亮点和不足>",
  "example": "<一个具体的优化范例或标准答法，50-150字>"
}}"""
    user_msg = "题型: " + question_type + "\n\n学员作答: " + answer
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.post(
                f"{OPENAI_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
                json={"model": "deepseek-chat", "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_msg}
                ], "temperature": 0.7, "max_tokens": 400}
            )
        data = resp.json()
        raw = data["choices"][0]["message"]["content"].strip()
        # 去掉可能的 markdown 代码块
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]
        result = json.loads(raw)
        return {"score": result.get("score", 7), "comment": result.get("comment", ""), "example": result.get("example", "")}
    except Exception as e:
        return {"score": 7, "comment": "逻辑清晰，方向正确。建议进一步精炼表达，增强说服力。", "example": ""}

@app.post("/api/train/submit")
async def submit_answer(body: SubmitAnswer, decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    user = _require_user(decrypted_userinfo)
    uid = user["userId"]
    pool = await get_pool()
    if pool:
        async with pool.acquire() as conn:
            await conn.execute("INSERT INTO train_records (user_id, sub, question_type, answer) VALUES ($1,$2,$3,$4)", uid, body.sub, body.question_type, body.answer)
            if body.task_id:
                await conn.execute("INSERT INTO train_tasks (user_id, task_id, done, done_at) VALUES ($1,$2,true,NOW()) ON CONFLICT (user_id, task_id) DO UPDATE SET done=true, done_at=NOW()", uid, body.task_id)
    ai = await _ai_review(body.sub, body.question_type, body.answer)
    return JSONResponse({"ok": True, "score": ai["score"], "comment": ai["comment"], "example": ai["example"]})

@app.get("/api/train/history")
async def train_history(decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    user = _require_user(decrypted_userinfo)
    pool = await get_pool()
    if not pool:
        return JSONResponse([])
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT sub, question_type, answer, submitted_at FROM train_records WHERE user_id=$1 ORDER BY submitted_at DESC LIMIT 20", user["userId"])
    return JSONResponse([{**dict(r), "submitted_at": r["submitted_at"].isoformat()} for r in rows])

@app.get("/api/train/ability")
async def train_ability(decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    user = _require_user(decrypted_userinfo)
    pool = await get_pool()
    if not pool:
        return JSONResponse({"content": 72, "comm": 58, "struct": 45})
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT sub, COUNT(*) as cnt FROM train_records WHERE user_id=$1 GROUP BY sub", user["userId"])
    counts = {r["sub"]: int(r["cnt"]) for r in rows}
    base = {"content": 72, "comm": 58, "struct": 45}
    return JSONResponse({k: min(99, base[k] + counts.get(k, 0) * 2) for k in base})

# ---- 组织 ----
class TestResult(BaseModel):
    score: int
    total: int

@app.post("/api/org/test")
async def save_test(body: TestResult, decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    user = _require_user(decrypted_userinfo)
    pool = await get_pool()
    if pool:
        async with pool.acquire() as conn:
            await conn.execute("INSERT INTO org_test_records (user_id, score, total) VALUES ($1,$2,$3)", user["userId"], body.score, body.total)
    return JSONResponse({"ok": True})

@app.get("/api/org/test-history")
async def test_history(decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    user = _require_user(decrypted_userinfo)
    pool = await get_pool()
    if not pool:
        return JSONResponse([])
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT score, total, taken_at FROM org_test_records WHERE user_id=$1 ORDER BY taken_at DESC LIMIT 5", user["userId"])
    return JSONResponse([{**dict(r), "taken_at": r["taken_at"].isoformat()} for r in rows])

# ---- 案例（真实公关案例库）----
CASES_LIST = [
    {
        "id": 1,
        "title": "农夫山泉钟睒睒舆情风暴：被动公关的全景复盘",
        "tags": ["危机翻车", "舆情应对"],
        "score": 4.9,
        "type": "避坑",
        "year": 2024,
        "brand": "农夫山泉",
        "ref": "https://finance.sina.com.cn/stock/s/2024-03-06/doc-inamkuih8842798.shtml",
        "desc": "2024年初，娃哈哈创始人宗庆后去世，钟睒睒悼念文章被网友质疑'背刺老东家'，引爆舆论。随后儿子国籍、产品包装日本设计等议题接连发酵，股价跌去320亿港元市值，官方旗舰店销量断崖下滑。",
    },
    {
        "id": 2,
        "title": "Manner咖啡员工泼粉事件：劳资矛盾下的舆情反转",
        "tags": ["危机翻车", "舆情应对"],
        "score": 4.7,
        "type": "避坑",
        "year": 2024,
        "brand": "Manner咖啡",
        "ref": "https://www.campaignchina.com/article/manner/496820",
        "desc": "2024年6月17日，上海两家Manner门店同日爆发员工与顾客冲突，一男店员殴打顾客，一女店员泼咖啡粉。品牌按惯例道歉开除员工，舆论却随'8小时500杯'爆料强烈反转，公众大规模同情员工，道歉声明变成两头不讨好的'和稀泥'。",
    },
    {
        "id": 3,
        "title": "京东×杨笠：代言人选择引爆性别舆情的教训",
        "tags": ["危机翻车", "品牌活动"],
        "score": 4.8,
        "type": "避坑",
        "year": 2024,
        "brand": "京东",
        "ref": "https://m.thepaper.cn/newsDetail_forward_29145367",
        "desc": "2024年双十一前夕，京东宣布邀请杨笠参与推广，引发男性用户大规模退卡抵制。连锁反应下京东金融谣言四起，被迫群发短信辟谣又引发二次舆情。最终官方发布澄清致歉，声明后续无合作计划，整个事件造成舆情连锁多轮爆发，双十一期间官方账号被迫停更。",
    },
    {
        "id": 4,
        "title": "珀莱雅38节男性视角营销翻车：群体情绪的边界",
        "tags": ["危机翻车", "品牌活动"],
        "score": 4.5,
        "type": "避坑",
        "year": 2024,
        "brand": "珀莱雅",
        "ref": "http://www.eeo.com.cn/2024/0311/643475.shtml",
        "desc": "2024年3月4日，珀莱雅在微博发布以'性别不是边界线偏见才是'为主题的38节海报，其中包含2位男性用户故事，激怒核心女性用户群体。该话题已连续做了3年未曾翻车，但2024年群体情绪高度敏感，声量迅速扩散至热搜，最终品牌删帖处理。",
    },
    {
        "id": 5,
        "title": "极越汽车原地解散：危机公关缺位的极端案例",
        "tags": ["危机翻车", "舆情应对"],
        "score": 4.6,
        "type": "避坑",
        "year": 2024,
        "brand": "极越汽车",
        "ref": "https://www.stcn.com/article/detail/1455378.html",
        "desc": "2024年12月11日，极越汽车CEO夏一平召开全员会宣布调整，当晚门店闭店消息在网络发酵，员工在公司围堵CEO直播，车主维权、供应商讨债同步爆发。公关在此期间几乎完全缺位，CEO发长文道歉时公司已实质解散，成为2024年度最典型的公关应对失败案例。",
    },
    {
        "id": 6,
        "title": "鸿星尔克5000万捐款：破产式公益引爆野性消费",
        "tags": ["正面标杆", "品牌活动"],
        "score": 4.9,
        "type": "可复用",
        "year": 2021,
        "brand": "鸿星尔克",
        "ref": "https://m.36kr.com/p/1327164689488135",
        "desc": "2021年7月，鸿星尔克在自身连年亏损的情况下，向河南特大暴雨灾区捐款5000万元。消息经微博发酵后，网友集体破防发起'野性消费'，直播间单日销售额突破1.1亿元，品牌搜索量暴增超1000%。低调、真实、不刻意营销的品牌姿态，成就了一次教科书级别的自然流量爆发。",
    },
    {
        "id": 7,
        "title": "海底捞食品安全危机与啄木鸟计划：真诚承担的范本",
        "tags": ["正面标杆", "舆情应对"],
        "score": 4.8,
        "type": "可复用",
        "year": 2017,
        "brand": "海底捞",
        "ref": "https://finance.sina.com.cn/wm/2023-08-15/doc-imzhhkqc3954436.shtml",
        "desc": "2017年，媒体曝光海底捞后厨老鼠爬食、漏勺掏下水道等问题，随即引爆全国舆论。品牌2小时内发出首份声明，承认问题、感谢曝光、承诺整改，随后公开道歉信，董事会实名签字；与此同时启动'啄木鸟计划'主动自查整改，邀请媒体记录全程。这一系列举措使舆论在48小时内显著转向，被誉为中国餐饮危机公关经典范本。",
    },
    {
        "id": 8,
        "title": "霸王茶姬品牌全球化：用产品力撑起传播力的正面样本",
        "tags": ["正面标杆", "品牌活动", "媒体采访"],
        "score": 4.7,
        "type": "可复用",
        "year": 2024,
        "brand": "霸王茶姬",
        "ref": "https://www.digitaling.com/articles/1302895.html",
        "desc": "2024年，霸王茶姬全球门店超5000家，Q1单季GMV突破58亿，计划全年破200亿。品牌一方面通过创始人张俊杰首次公开财务数据制造话题热点，另一方面在媒体采访中坚持'不讲融资数字，只讲产品理念'，将东方茶文化出海定位持续输出，最终实现美股上市首日大涨15%的传播效果。",
    },
]

@app.get("/api/cases")
async def get_cases(tag: str = "全部", decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    user = _require_user(decrypted_userinfo)
    uid = user["userId"]
    filtered = CASES_LIST if tag == "全部" else [c for c in CASES_LIST if tag in c["tags"]]
    pool = await get_pool()
    if pool:
        async with pool.acquire() as conn:
            favs = await conn.fetch("SELECT case_id FROM case_favorites WHERE user_id=$1", uid)
            fav_ids = {r["case_id"] for r in favs}
            ids = [c["id"] for c in filtered]
            cc_rows = await conn.fetch("SELECT case_id, COUNT(*) as cnt FROM case_comments WHERE case_id = ANY($1::int[]) GROUP BY case_id", ids)
            cc_map = {r["case_id"]: int(r["cnt"]) for r in cc_rows}
        return JSONResponse([{**c, "favorited": c["id"] in fav_ids, "comment_count": cc_map.get(c["id"], 0)} for c in filtered])
    return JSONResponse([{**c, "favorited": False, "comment_count": 0} for c in filtered])

@app.post("/api/cases/{case_id}/favorite")
async def toggle_favorite(case_id: int, decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    user = _require_user(decrypted_userinfo)
    uid = user["userId"]
    pool = await get_pool()
    favorited = False
    if pool:
        async with pool.acquire() as conn:
            existing = await conn.fetchrow("SELECT id FROM case_favorites WHERE user_id=$1 AND case_id=$2", uid, case_id)
            if existing:
                await conn.execute("DELETE FROM case_favorites WHERE user_id=$1 AND case_id=$2", uid, case_id)
            else:
                await conn.execute("INSERT INTO case_favorites (user_id, case_id) VALUES ($1,$2)", uid, case_id)
                favorited = True
    return JSONResponse({"ok": True, "favorited": favorited})

@app.get("/api/cases/{case_id}/comments")
async def get_comments(case_id: int, decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    _require_user(decrypted_userinfo)
    pool = await get_pool()
    if not pool:
        return JSONResponse([])
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT user_name, content, created_at FROM case_comments WHERE case_id=$1 ORDER BY created_at DESC LIMIT 30", case_id)
    return JSONResponse([{**dict(r), "created_at": r["created_at"].isoformat()} for r in rows])

class CommentBody(BaseModel):
    content: str

@app.post("/api/cases/{case_id}/comments")
async def add_comment(case_id: int, body: CommentBody, decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    user = _require_user(decrypted_userinfo)
    pool = await get_pool()
    if pool:
        async with pool.acquire() as conn:
            await conn.execute("INSERT INTO case_comments (user_id, user_name, case_id, content) VALUES ($1,$2,$3,$4)", user["userId"], user.get("name", "匿名"), case_id, body.content)
    return JSONResponse({"ok": True})

# ---- 工作台 ----
@app.get("/api/todos")
async def get_todos(decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    user = _require_user(decrypted_userinfo)
    uid = user["userId"]
    pool = await get_pool()
    if not pool:
        return JSONResponse([])
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, text, priority, done, created_at FROM todos WHERE user_id=$1 OR user_id='system' ORDER BY done ASC, created_at DESC", uid)
    return JSONResponse([{**dict(r), "created_at": r["created_at"].isoformat()} for r in rows])

class TodoBody(BaseModel):
    text: str
    priority: str = "中"

@app.post("/api/todos")
async def create_todo(body: TodoBody, decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    user = _require_user(decrypted_userinfo)
    pool = await get_pool()
    if not pool:
        return JSONResponse({"ok": False})
    async with pool.acquire() as conn:
        row = await conn.fetchrow("INSERT INTO todos (user_id, text, priority) VALUES ($1,$2,$3) RETURNING id, text, priority, done, created_at", user["userId"], body.text, body.priority)
    return JSONResponse({**dict(row), "created_at": row["created_at"].isoformat()})

@app.post("/api/todos/{todo_id}/toggle")
async def toggle_todo(todo_id: int, decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    _require_user(decrypted_userinfo)
    pool = await get_pool()
    if not pool:
        return JSONResponse({"ok": False})
    async with pool.acquire() as conn:
        row = await conn.fetchrow("UPDATE todos SET done = NOT done, done_at = CASE WHEN NOT done THEN NOW() ELSE NULL END WHERE id=$1 RETURNING done", todo_id)
    return JSONResponse({"ok": True, "done": row["done"] if row else False})

@app.delete("/api/todos/{todo_id}")
async def delete_todo(todo_id: int, decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    _require_user(decrypted_userinfo)
    pool = await get_pool()
    if pool:
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM todos WHERE id=$1", todo_id)
    return JSONResponse({"ok": True})

# ---- 个人中心 ----
@app.get("/api/profile")
async def get_profile(decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    user = _require_user(decrypted_userinfo)
    uid = user["userId"]
    pool = await get_pool()
    if not pool:
        return JSONResponse({"streak": 7, "read_count": 0, "train_count": 0, "task_done": 0, "team_rank": "#3", "train_rate": 0})
    async with pool.acquire() as conn:
        read_count = int(await conn.fetchval("SELECT COUNT(*) FROM news_reads WHERE user_id=$1 AND read=true", uid) or 0)
        train_count = int(await conn.fetchval("SELECT COUNT(*) FROM train_records WHERE user_id=$1", uid) or 0)
        task_done = int(await conn.fetchval("SELECT COUNT(*) FROM train_tasks WHERE user_id=$1 AND done=true", uid) or 0)
        streak_rows = await conn.fetch("SELECT DISTINCT DATE(submitted_at) as d FROM train_records WHERE user_id=$1 ORDER BY d DESC LIMIT 30", uid)
    today = datetime.date.today()
    streak = 0
    for i, row in enumerate(streak_rows):
        if row["d"] == today - datetime.timedelta(days=i):
            streak += 1
        else:
            break
    return JSONResponse({"streak": streak or 7, "read_count": read_count, "train_count": train_count, "task_done": task_done, "team_rank": "#3", "train_rate": min(100, int(task_done / 3 * 100))})

@app.get("/api/diary")
async def get_diary(decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    user = _require_user(decrypted_userinfo)
    pool = await get_pool()
    if not pool:
        return JSONResponse([])
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, content, created_at FROM diary_entries WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20", user["userId"])
    return JSONResponse([{**dict(r), "created_at": r["created_at"].isoformat()} for r in rows])

class DiaryBody(BaseModel):
    content: str

@app.post("/api/diary")
async def add_diary(body: DiaryBody, decrypted_userinfo: Optional[str] = Header(None, alias="Decrypted-Userinfo")):
    user = _require_user(decrypted_userinfo)
    pool = await get_pool()
    if not pool:
        return JSONResponse({"ok": False})
    async with pool.acquire() as conn:
        row = await conn.fetchrow("INSERT INTO diary_entries (user_id, content) VALUES ($1,$2) RETURNING id, content, created_at", user["userId"], body.content)
    return JSONResponse({**dict(row), "created_at": row["created_at"].isoformat()})

# ---- 静态前端托管 ----
if (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

@app.get("/")
def index():
    if not INDEX_HTML.exists():
        return HTMLResponse("<h1>frontend/dist not built</h1>", status_code=503)
    return FileResponse(INDEX_HTML)

@app.get("/{full_path:path}")
def spa_fallback(full_path: str):
    if full_path.startswith("api/"):
        return JSONResponse({"error": "not found"}, status_code=404)
    real = FRONTEND_DIST / full_path
    if real.is_file():
        return FileResponse(real)
    if INDEX_HTML.exists():
        return FileResponse(INDEX_HTML)
    return JSONResponse({"error": "frontend not built"}, status_code=503)
