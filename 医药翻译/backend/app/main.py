import json
import os
import secrets
import time
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Literal, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen
from uuid import uuid4
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import FastAPI, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel, Field


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent


def load_env_file() -> None:
    for candidate in (BACKEND_DIR / ".env", PROJECT_DIR / ".env"):
        if not candidate.exists():
            continue
        for line in candidate.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            normalized_value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key.strip(), normalized_value)


def parse_allowed_origins(value: str) -> list[str]:
    return [origin.strip() for origin in value.split(",") if origin.strip()]


load_env_file()


SUPPORTED_LANGUAGES = {
    "zh": "中文",
    "en": "英文",
    "ja": "日文",
    "ko": "韩文",
    "de": "德文",
    "fr": "法文",
}
SUPPORTED_FILE_EXTENSIONS = (".docx", ".pdf")
DOWNLOAD_LANGUAGE_LABELS = {
    "zh": "Chinese",
    "en": "English",
    "ja": "Japanese",
    "ko": "Korean",
    "de": "German",
    "fr": "French",
}
DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PDF_MIME_TYPE = "application/pdf"
DEFAULT_ALLOWED_ORIGINS = "http://127.0.0.1:5173,http://localhost:5173"
ALLOWED_ORIGINS = parse_allowed_origins(os.getenv("ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS))
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", ALLOWED_ORIGINS[0] if ALLOWED_ORIGINS else "http://127.0.0.1:5173")
FEISHU_APP_ID = os.getenv("FEISHU_APP_ID", "").strip()
FEISHU_APP_SECRET = os.getenv("FEISHU_APP_SECRET", "").strip()
FEISHU_SCOPE = os.getenv(
    "FEISHU_SCOPE",
    "contact:user.base:readonly contact:user.email:readonly",
).strip()
FEISHU_AUTH_URL = os.getenv(
    "FEISHU_AUTH_URL",
    "https://accounts.feishu.cn/open-apis/authen/v1/authorize",
).strip()
FEISHU_TOKEN_URL = os.getenv(
    "FEISHU_TOKEN_URL",
    "https://open.feishu.cn/open-apis/authen/v2/oauth/token",
).strip()
FEISHU_USER_INFO_URL = os.getenv(
    "FEISHU_USER_INFO_URL",
    "https://open.feishu.cn/open-apis/authen/v1/user_info",
).strip()
FEISHU_REDIRECT_URI = os.getenv(
    "FEISHU_REDIRECT_URI",
    "http://127.0.0.1:8000/api/auth/feishu/callback",
).strip()
FEISHU_LOGIN_STATE_TTL_SECONDS = 600


class LoginRequest(BaseModel):
    email: str
    password: str


class TextTranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    source_lang: str
    target_lang: str
    history_id: Optional[str] = None


class DetectRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class FileCheckRequest(BaseModel):
    file_hash: str
    filename: str
    file_size: int
    total_chunks: int


class FileMergeRequest(BaseModel):
    file_hash: str
    filename: str
    total_chunks: int
    mime_type: str


class FileTranslateRequest(BaseModel):
    file_id: str
    source_lang: str
    target_lang: str
    history_id: Optional[str] = None


class HistoryItem(BaseModel):
    id: str
    task_type: Literal["text", "file"]
    title: str
    status: str
    source_lang: str
    target_lang: str
    updated_at: str
    result_preview: Optional[str] = None
    file_id: Optional[str] = None
    task_id: Optional[str] = None


app = FastAPI(title="医药翻译", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


history_store: list[HistoryItem] = []
uploaded_files: dict[str, dict] = {}
generated_files: dict[str, dict] = {}
file_tasks: dict[str, dict] = {}
feishu_login_states: dict[str, dict[str, object]] = {}


def now_label() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def detect_language(text: str) -> str:
    return "zh" if any("\u4e00" <= char <= "\u9fff" for char in text) else "en"


def require_supported_language(language: str) -> None:
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail="暂不支持该语种翻译")


def build_text_translation(text: str, source_lang: str, target_lang: str) -> str:
    return (
        f"【{SUPPORTED_LANGUAGES[source_lang]} -> {SUPPORTED_LANGUAGES[target_lang]}】\n"
        f"{text}\n\n"
        "这是项目初始化阶段的占位译文，后续可替换为真实术语库和模型调用。"
    )


def infer_file_mime_type(filename: str) -> str:
    return DOCX_MIME_TYPE if Path(filename).suffix.lower() == ".docx" else PDF_MIME_TYPE


def build_translated_filename(filename: str, target_lang: str) -> str:
    path = Path(filename)
    suffix = "english" if target_lang == "en" else target_lang
    return f"{path.stem}_{suffix}{path.suffix.lower()}"


def build_preview_filename(filename: str) -> str:
    path = Path(filename)
    return f"{path.stem}_preview{path.suffix.lower()}"


def build_download_lines(file_meta: dict) -> list[str]:
    source_label = DOWNLOAD_LANGUAGE_LABELS.get(file_meta.get("source_lang", "zh"), "Chinese")
    target_label = DOWNLOAD_LANGUAGE_LABELS.get(file_meta.get("target_lang", "en"), "English")
    return [
        f"Document: {file_meta['filename']}",
        f"Source language: {source_label}",
        f"Target language: {target_label}",
        "Original formatting is preserved in this scaffold output.",
        "All recognized text is translated into the target language.",
    ]


def build_pdf_bytes(lines: list[str]) -> bytes:
    escaped_lines = [
        line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        for line in lines
    ]
    commands = ["BT", "/F1 12 Tf", "50 760 Td", "16 TL"]
    for index, line in enumerate(escaped_lines):
        if index > 0:
            commands.append("T*")
        commands.append(f"({line}) Tj")
    commands.append("ET")
    content_stream = "\n".join(commands)
    content_bytes = content_stream.encode("utf-8")
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(content_bytes)} >>\nstream\n{content_stream}\nendstream",
    ]
    chunks = ["%PDF-1.4\n"]
    offsets = [0]
    running_size = len(chunks[0].encode("utf-8"))
    for index, obj in enumerate(objects, start=1):
        offsets.append(running_size)
        chunk = f"{index} 0 obj\n{obj}\nendobj\n"
        chunks.append(chunk)
        running_size += len(chunk.encode("utf-8"))
    startxref = running_size
    chunks.append(f"xref\n0 {len(objects) + 1}\n")
    chunks.append("0000000000 65535 f \n")
    for offset in offsets[1:]:
        chunks.append(f"{offset:010d} 00000 n \n")
    chunks.append(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{startxref}\n%%EOF")
    return "".join(chunks).encode("utf-8")


def build_docx_bytes(lines: list[str]) -> bytes:
    body = []
    for line in lines:
        body.append(
            "<w:p><w:r><w:t xml:space=\"preserve\">"
            f"{escape(line)}"
            "</w:t></w:r></w:p>"
        )
    document_xml = (
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
        "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">"
        "<w:body>"
        + "".join(body)
        + (
            "<w:sectPr>"
            "<w:pgSz w:w=\"11906\" w:h=\"16838\"/>"
            "<w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\" "
            "w:header=\"720\" w:footer=\"720\" w:gutter=\"0\"/>"
            "</w:sectPr>"
        )
        + "</w:body></w:document>"
    )

    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            (
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
                "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
                "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
                "<Override PartName=\"/word/document.xml\" "
                "ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>"
                "<Override PartName=\"/docProps/core.xml\" "
                "ContentType=\"application/vnd.openxmlformats-package.core-properties+xml\"/>"
                "<Override PartName=\"/docProps/app.xml\" "
                "ContentType=\"application/vnd.openxmlformats-officedocument.extended-properties+xml\"/>"
                "</Types>"
            ),
        )
        archive.writestr(
            "_rels/.rels",
            (
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" "
                "Target=\"word/document.xml\"/>"
                "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties\" "
                "Target=\"docProps/core.xml\"/>"
                "<Relationship Id=\"rId3\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties\" "
                "Target=\"docProps/app.xml\"/>"
                "</Relationships>"
            ),
        )
        archive.writestr(
            "docProps/core.xml",
            (
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                "<cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" "
                "xmlns:dc=\"http://purl.org/dc/elements/1.1/\">"
                "<dc:title>Medical Translate Output</dc:title>"
                "<dc:creator>medical-translate</dc:creator>"
                "</cp:coreProperties>"
            ),
        )
        archive.writestr(
            "docProps/app.xml",
            (
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                "<Properties xmlns=\"http://schemas.openxmlformats.org/officeDocument/2006/extended-properties\" "
                "xmlns:vt=\"http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes\">"
                "<Application>medical-translate</Application>"
                "</Properties>"
            ),
        )
        archive.writestr("word/document.xml", document_xml)
    return buffer.getvalue()


def build_download_content(file_meta: dict) -> bytes:
    lines = build_download_lines(file_meta)
    extension = Path(file_meta["filename"]).suffix.lower()
    if extension == ".docx":
        return build_docx_bytes(lines)
    return build_pdf_bytes(lines)


def require_feishu_config() -> None:
    if FEISHU_APP_ID and FEISHU_APP_SECRET:
        return
    raise HTTPException(
        status_code=503,
        detail="未配置飞书 SSO，请在 backend/.env 中设置 FEISHU_APP_ID 和 FEISHU_APP_SECRET。",
    )


def prune_feishu_login_states() -> None:
    now = time.time()
    expired_states = [
        state
        for state, state_data in feishu_login_states.items()
        if float(state_data.get("expires_at", 0)) <= now
    ]
    for state in expired_states:
        feishu_login_states.pop(state, None)


def sanitize_frontend_redirect_path(redirect_path: Optional[str]) -> str:
    if not redirect_path:
        return "/"
    parsed = urlsplit(redirect_path)
    if parsed.scheme or parsed.netloc:
        return "/"
    safe_path = parsed.path or "/"
    if not safe_path.startswith("/") or safe_path.startswith("//"):
        return "/"
    return urlunsplit(("", "", safe_path, parsed.query, parsed.fragment))


def resolve_frontend_base_url(frontend_base_url: Optional[str]) -> str:
    default_base_url = FRONTEND_BASE_URL.rstrip("/")
    if not frontend_base_url:
        return default_base_url
    normalized_candidate = frontend_base_url.rstrip("/")
    allowed_base_urls = {origin.rstrip("/") for origin in ALLOWED_ORIGINS}
    return normalized_candidate if normalized_candidate in allowed_base_urls else default_base_url


def build_frontend_redirect_url(
    params: dict[str, str],
    redirect_path: Optional[str] = None,
    frontend_base_url: Optional[str] = None,
) -> str:
    sanitized = {key: value for key, value in params.items() if value}
    safe_redirect = sanitize_frontend_redirect_path(redirect_path)
    parsed_redirect = urlsplit(safe_redirect)
    merged_query = dict(parse_qsl(parsed_redirect.query, keep_blank_values=True))
    merged_query.update(sanitized)
    query = urlencode(merged_query)
    base_url_parts = urlsplit(resolve_frontend_base_url(frontend_base_url))
    return urlunsplit(
        (
            base_url_parts.scheme,
            base_url_parts.netloc,
            parsed_redirect.path or "/",
            query,
            parsed_redirect.fragment,
        )
    )


def request_json(url: str, method: str = "GET", payload: Optional[dict] = None, headers: Optional[dict] = None) -> dict:
    encoded_body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request_headers = {"Accept": "application/json"}
    if encoded_body is not None:
        request_headers["Content-Type"] = "application/json"
    if headers:
        request_headers.update(headers)
    request = Request(url, data=encoded_body, headers=request_headers, method=method)

    try:
        with urlopen(request, timeout=15) as response:
            body = response.read().decode("utf-8")
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", "ignore")
        raise HTTPException(status_code=502, detail=f"飞书登录请求失败：{error_body or exc.reason}") from exc
    except URLError as exc:
        raise HTTPException(status_code=502, detail=f"无法连接飞书开放平台：{exc.reason}") from exc

    if not body:
        return {}

    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="飞书返回了无法识别的响应。") from exc


def unwrap_feishu_payload(payload: dict) -> dict:
    code = payload.get("code")
    if code not in (None, 0):
        message = payload.get("msg") or payload.get("message") or "飞书接口调用失败。"
        raise HTTPException(status_code=502, detail=f"飞书登录失败：{message}")
    data = payload.get("data")
    return data if isinstance(data, dict) else payload


def exchange_feishu_code(code: str) -> dict:
    token_payload = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": FEISHU_REDIRECT_URI,
        "app_id": FEISHU_APP_ID,
        "app_secret": FEISHU_APP_SECRET,
        "client_id": FEISHU_APP_ID,
        "client_secret": FEISHU_APP_SECRET,
    }
    response = request_json(FEISHU_TOKEN_URL, method="POST", payload=token_payload)
    return unwrap_feishu_payload(response)


def fetch_feishu_user_info(access_token: str) -> dict:
    response = request_json(
        FEISHU_USER_INFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
    )
    return unwrap_feishu_payload(response)


def upsert_history(item: HistoryItem) -> HistoryItem:
    for index, current in enumerate(history_store):
        if current.id == item.id:
            history_store[index] = item
            return item
    history_store.insert(0, item)
    return item


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/login")
def login(payload: LoginRequest) -> dict:
    if not payload.email or not payload.password:
        raise HTTPException(status_code=400, detail="邮箱和密码不能为空")
    return {
        "data": {
            "user": {
                "id": "demo-user",
                "name": "演示用户",
                "email": payload.email,
            },
            "tokens": {
                "access_token": f"access-{uuid4()}",
                "refresh_token": f"refresh-{uuid4()}",
                "expires_at": int(datetime.now().timestamp()) + 3600,
            },
        }
    }


@app.post("/api/auth/refresh")
def refresh() -> dict:
    return {
        "data": {
            "access_token": f"access-{uuid4()}",
            "refresh_token": f"refresh-{uuid4()}",
            "expires_at": int(datetime.now().timestamp()) + 3600,
        }
    }


@app.post("/api/auth/logout")
def logout() -> Response:
    return Response(status_code=204)


@app.get("/api/auth/feishu/status")
def feishu_status() -> dict:
    enabled = bool(FEISHU_APP_ID and FEISHU_APP_SECRET)
    return {
        "data": {
            "enabled": enabled,
            "redirect_uri": FEISHU_REDIRECT_URI,
            "scope": FEISHU_SCOPE,
        }
    }


@app.get("/api/auth/feishu/login")
def feishu_login(
    redirect: Optional[str] = Query(default="/"),
    origin: Optional[str] = Query(default=None),
) -> RedirectResponse:
    redirect_path = sanitize_frontend_redirect_path(redirect)
    frontend_base_url = resolve_frontend_base_url(origin)
    try:
        require_feishu_config()
    except HTTPException as exc:
        return RedirectResponse(
            url=build_frontend_redirect_url(
                {
                    "login": "error",
                    "provider": "feishu",
                    "message": str(exc.detail),
                },
                redirect_path,
                frontend_base_url,
            ),
            status_code=302,
        )
    prune_feishu_login_states()
    state = secrets.token_urlsafe(24)
    feishu_login_states[state] = {
        "expires_at": time.time() + FEISHU_LOGIN_STATE_TTL_SECONDS,
        "redirect_path": redirect_path,
        "frontend_base_url": frontend_base_url,
    }
    query = {
        "response_type": "code",
        "redirect_uri": FEISHU_REDIRECT_URI,
        "state": state,
        "app_id": FEISHU_APP_ID,
        "client_id": FEISHU_APP_ID,
    }
    if FEISHU_SCOPE:
        query["scope"] = FEISHU_SCOPE
    return RedirectResponse(url=f"{FEISHU_AUTH_URL}?{urlencode(query)}", status_code=302)


@app.get("/api/auth/feishu/callback")
def feishu_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
) -> RedirectResponse:
    redirect_path = "/"
    frontend_base_url = FRONTEND_BASE_URL
    if state:
        prune_feishu_login_states()
        state_data = feishu_login_states.get(state)
        if state_data:
            redirect_path = str(state_data.get("redirect_path") or "/")
            frontend_base_url = resolve_frontend_base_url(str(state_data.get("frontend_base_url") or ""))

    if error:
        if state:
            feishu_login_states.pop(state, None)
        return RedirectResponse(
            url=build_frontend_redirect_url(
                {
                    "login": "error",
                    "provider": "feishu",
                    "message": error_description or error,
                },
                redirect_path,
                frontend_base_url,
            ),
            status_code=302,
        )

    try:
        require_feishu_config()
        prune_feishu_login_states()
        if not code or not state:
            raise HTTPException(status_code=400, detail="飞书回调缺少必要参数。")

        state_data = feishu_login_states.pop(state, None)
        if state_data:
            redirect_path = str(state_data.get("redirect_path") or redirect_path)
            frontend_base_url = resolve_frontend_base_url(str(state_data.get("frontend_base_url") or ""))
        expires_at = float(state_data.get("expires_at", 0)) if state_data else 0
        if not state_data or expires_at <= time.time():
            raise HTTPException(status_code=400, detail="飞书登录状态已失效，请重新发起登录。")

        token_data = exchange_feishu_code(code)
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=502, detail="未获取到飞书访问令牌。")

        user_data = fetch_feishu_user_info(access_token)
    except HTTPException as exc:
        return RedirectResponse(
            url=build_frontend_redirect_url(
                {
                    "login": "error",
                    "provider": "feishu",
                    "message": str(exc.detail),
                },
                redirect_path,
                frontend_base_url,
            ),
            status_code=302,
        )

    redirect_params = {
        "login": "success",
        "provider": "feishu",
        "id": str(user_data.get("open_id") or user_data.get("user_id") or user_data.get("union_id") or "feishu-user"),
        "name": str(user_data.get("name") or user_data.get("en_name") or "飞书用户"),
        "email": str(user_data.get("email") or user_data.get("enterprise_email") or ""),
        "avatar_url": str(user_data.get("avatar_url") or user_data.get("avatar_thumb") or ""),
        "open_id": str(user_data.get("open_id") or ""),
        "union_id": str(user_data.get("union_id") or ""),
        "user_id": str(user_data.get("user_id") or ""),
    }
    return RedirectResponse(
        url=build_frontend_redirect_url(redirect_params, redirect_path, frontend_base_url),
        status_code=302,
    )


@app.post("/api/detect")
def detect(payload: DetectRequest) -> dict:
    language = detect_language(payload.text)
    require_supported_language(language)
    return {
        "data": {
            "lang": language,
            "confidence": 0.92,
        }
    }


@app.post("/api/translate/text")
def translate_text(payload: TextTranslateRequest) -> dict:
    source_lang = detect_language(payload.text) if payload.source_lang == "auto" else payload.source_lang
    require_supported_language(source_lang)
    require_supported_language(payload.target_lang)
    if source_lang == payload.target_lang:
        raise HTTPException(status_code=400, detail="源语言与目标语言不能相同")

    translated_text = build_text_translation(payload.text, source_lang, payload.target_lang)
    history_id = payload.history_id or f"text-{uuid4()}"
    history = HistoryItem(
        id=history_id,
        task_type="text",
        title=payload.text[:50],
        status="success",
        source_lang=SUPPORTED_LANGUAGES[source_lang],
        target_lang=SUPPORTED_LANGUAGES[payload.target_lang],
        updated_at=now_label(),
        result_preview=translated_text,
    )
    upsert_history(history)
    return {
        "data": {
            "task_id": f"text-task-{uuid4()}",
            "translated_text": translated_text,
            "source_lang": source_lang,
            "terminology_count": 0,
            "history_id": history.id,
        }
    }


@app.post("/api/file/check")
def file_check(payload: FileCheckRequest) -> dict:
    return {
        "data": {
            "exists": False,
            "file_id": None,
        }
    }


@app.post("/api/file/chunk")
async def file_chunk(
    file_hash: str,
    chunk_index: int,
    total_chunks: int,
    chunk: UploadFile,
) -> dict:
    if not chunk.filename:
        raise HTTPException(status_code=400, detail="缺少分片文件")
    return {
        "data": {
            "file_hash": file_hash,
            "chunk_index": chunk_index,
            "total_chunks": total_chunks,
            "success": True,
        }
    }


@app.post("/api/file/merge")
def file_merge(payload: FileMergeRequest) -> dict:
    if not payload.filename.lower().endswith(SUPPORTED_FILE_EXTENSIONS):
        raise HTTPException(status_code=400, detail="仅支持 .docx 和 .pdf")
    file_id = f"file-{uuid4()}"
    uploaded_files[file_id] = {
        "filename": payload.filename,
        "mime_type": infer_file_mime_type(payload.filename),
        "source_lang": "zh",
        "target_lang": "en",
    }
    return {"data": {"file_id": file_id}}


@app.post("/api/translate/file")
def translate_file(payload: FileTranslateRequest) -> dict:
    require_supported_language(payload.target_lang)
    source_lang = payload.source_lang if payload.source_lang != "auto" else "zh"
    require_supported_language(source_lang)
    if source_lang == payload.target_lang:
        raise HTTPException(status_code=400, detail="源语言与目标语言不能相同")

    if payload.file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="文件不存在")

    source_file = uploaded_files[payload.file_id]
    result_file_id = f"result-{uuid4()}"
    bilingual_file_id = f"preview-{uuid4()}"
    generated_files[result_file_id] = {
        "filename": build_translated_filename(source_file["filename"], payload.target_lang),
        "mime_type": source_file["mime_type"],
        "source_lang": source_lang,
        "target_lang": payload.target_lang,
        "preserve_format": True,
        "translated_scope": "all_text",
    }
    generated_files[bilingual_file_id] = {
        "filename": build_preview_filename(source_file["filename"]),
        "mime_type": source_file["mime_type"],
        "source_lang": source_lang,
        "target_lang": payload.target_lang,
        "preserve_format": True,
        "translated_scope": "all_text",
    }
    task_id = f"file-task-{uuid4()}"
    file_tasks[task_id] = {
        "status": "queued",
        "poll_count": 0,
        "result_file_id": result_file_id,
        "bilingual_file_id": bilingual_file_id,
        "preserve_format": True,
        "translated_scope": "all_text",
    }
    history_id = payload.history_id or f"file-history-{uuid4()}"
    history = HistoryItem(
        id=history_id,
        task_type="file",
        title=source_file["filename"],
        status="queued",
        source_lang=SUPPORTED_LANGUAGES[source_lang],
        target_lang=SUPPORTED_LANGUAGES[payload.target_lang],
        updated_at=now_label(),
        file_id=payload.file_id,
        task_id=task_id,
    )
    upsert_history(history)
    return {
        "data": {
            "task_id": task_id,
            "status": "queued",
            "history_id": history.id,
            "result_file_id": result_file_id,
            "result_filename": generated_files[result_file_id]["filename"],
            "preserve_format": True,
            "translated_scope": "all_text",
        }
    }


@app.get("/api/translate/status/{task_id}")
def translate_status(task_id: str) -> dict:
    task = file_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    task["poll_count"] += 1
    if task["status"] == "queued":
        task["status"] = "translating"
    elif task["status"] == "translating" and task["poll_count"] >= 2:
        task["status"] = "done"

    for index, item in enumerate(history_store):
        if item.task_id == task_id:
            history_store[index] = item.model_copy(update={"status": task["status"], "updated_at": now_label()})

    return {
        "data": {
            "task_id": task_id,
            "status": task["status"],
            "result_file_id": task["result_file_id"],
            "bilingual_file_id": task["bilingual_file_id"],
            "result_filename": generated_files[task["result_file_id"]]["filename"],
            "preserve_format": task["preserve_format"],
            "translated_scope": task["translated_scope"],
            "updated_at": now_label(),
        }
    }


@app.post("/api/translate/cancel/{task_id}")
def cancel_translate(task_id: str) -> dict:
    task = file_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    task["status"] = "cancelled"
    for index, item in enumerate(history_store):
        if item.task_id == task_id:
            history_store[index] = item.model_copy(update={"status": "cancelled", "updated_at": now_label()})
    return {"data": {"task_id": task_id, "status": "cancelled"}}


@app.get("/api/history")
def list_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    task_type: Optional[str] = None,
    keyword: Optional[str] = None,
) -> dict:
    items = history_store[:]
    if task_type:
        items = [item for item in items if item.task_type == task_type]
    if keyword:
        items = [item for item in items if keyword.lower() in item.title.lower()]
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "data": {
            "items": [item.model_dump() for item in items[start:end]],
            "total": len(items),
            "page": page,
            "page_size": page_size,
        }
    }


@app.get("/api/history/{history_id}")
def get_history(history_id: str) -> dict:
    for item in history_store:
        if item.id == history_id:
            return {"data": item.model_dump()}
    raise HTTPException(status_code=404, detail="历史不存在")


@app.delete("/api/history/{history_id}")
def delete_history(history_id: str) -> Response:
    global history_store
    history_store = [item for item in history_store if item.id != history_id]
    return Response(status_code=204)


@app.get("/api/translate/download/{file_id}")
def download_translation(file_id: str) -> Response:
    file_meta = generated_files.get(file_id) or uploaded_files.get(file_id)
    if not file_meta:
        raise HTTPException(status_code=404, detail="文件不存在")
    content = build_download_content(file_meta)
    filename = file_meta["filename"]
    return Response(
        content=content,
        media_type=file_meta["mime_type"],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
