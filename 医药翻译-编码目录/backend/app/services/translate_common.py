from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import storage
from app.models.history import History
from app.models.translate_task import TranslateTask
from app.schemas.translate import FileTaskStatusResponse
from app.services.document_service import document_service
from app.services.provider_service import SUPPORTED_LANGUAGES, provider_service
from app.services.terminology_service import terminology_service


ACTIVE_FILE_STATUSES = {'pending', 'hashing', 'uploading', 'queued', 'translating'}
REUSABLE_FILE_STATUSES = {'failed', 'cancelled'}


class TranslateCommonService:
    async def detect_language(self, text: str) -> tuple[str, float]:
        lang, confidence = await provider_service.detect_language(text)
        self.ensure_supported_language(lang)
        return lang, confidence

    def ensure_supported_language(self, language: str) -> None:
        if language not in SUPPORTED_LANGUAGES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='暂不支持该语种翻译')

    async def _load_history_and_task(
        self,
        session: AsyncSession,
        user_id: str,
        history_id: str,
        task_type: str,
    ) -> tuple[History | None, TranslateTask | None]:
        history = await session.scalar(
            select(History).where(
                History.id == history_id,
                History.user_id == user_id,
                History.task_type == task_type,
            )
        )
        if not history:
            return None, None

        task = await session.scalar(
            select(TranslateTask).where(
                TranslateTask.id == history.task_id,
                TranslateTask.user_id == user_id,
                TranslateTask.task_type == task_type,
            )
        )
        return history, task

    async def _get_user_file_task(
        self,
        session: AsyncSession,
        user_id: str,
        task_id: str,
    ) -> TranslateTask:
        task = await session.scalar(
            select(TranslateTask).where(
                TranslateTask.id == task_id,
                TranslateTask.user_id == user_id,
                TranslateTask.task_type == 'file',
            )
        )
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='任务不存在')
        return task

    async def _ensure_no_active_file_task(self, session: AsyncSession, user_id: str) -> None:
        task = await session.scalar(
            select(TranslateTask).where(
                TranslateTask.user_id == user_id,
                TranslateTask.task_type == 'file',
                TranslateTask.status.in_(ACTIVE_FILE_STATUSES),
            )
        )
        if task:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='当前已有文件在处理中，请先完成或删除当前任务')

    def _build_file_status_response(self, task: TranslateTask) -> FileTaskStatusResponse:
        updated_at = task.updated_at or datetime.now(timezone.utc)
        return FileTaskStatusResponse(
            task_id=task.id,
            status=task.status,
            result_file_id=task.result_file_id,
            bilingual_file_id=task.bilingual_file_id,
            updated_at=updated_at.astimezone(timezone.utc).strftime('%Y-%m-%d %H:%M:%S'),
            error=task.error_msg,
        )

    async def _translate_sections(
        self,
        sections: list[str],
        source_lang: str,
        target_lang: str,
        session: AsyncSession,
    ) -> list[str]:
        translated_sections: list[str] = []
        for section in sections:
            protected_text = section
            term_matches = await terminology_service.extract_terms(session, section, source_lang, target_lang)
            for item in term_matches:
                protected_text = protected_text.replace(item['original'], item['placeholder'])

            translated_chunks: list[str] = []
            for chunk in document_service.split_for_translation(protected_text):
                translated_chunks.append(await provider_service.translate(chunk, source_lang, target_lang))

            translated_text = '\n'.join(part.strip() for part in translated_chunks if part.strip())
            for item in term_matches:
                translated_text = translated_text.replace(item['placeholder'], item['translation'])
            translated_sections.append(translated_text or '（未生成译文）')
        return translated_sections

    def _resolve_storage_path(self, file_key: str | None) -> Path:
        if not file_key:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='原始文件不存在')
        full_path = storage.root / file_key
        if not full_path.exists():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='原始文件不存在')
        return full_path
