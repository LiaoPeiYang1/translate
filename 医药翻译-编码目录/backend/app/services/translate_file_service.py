import asyncio
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import storage
from app.db.session import AsyncSessionLocal
from app.models.history import History
from app.models.translate_task import TranslateTask
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.schemas.translate import FileTaskStatusResponse, FileTranslateRequest, FileTranslateResponse
from app.services.document_service import document_service
from app.services.terminology_service import terminology_service

from .translate_common import ACTIVE_FILE_STATUSES, REUSABLE_FILE_STATUSES, TranslateCommonService


class FileTranslateService(TranslateCommonService):
    async def submit_file_translation(
        self,
        session: AsyncSession,
        user: User,
        payload: FileTranslateRequest,
    ) -> FileTranslateResponse:
        uploaded = await session.scalar(select(UploadedFile).where(UploadedFile.id == payload.file_id))
        if not uploaded:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='文件不存在')

        source_lang = payload.source_lang
        if source_lang != 'auto':
            self.ensure_supported_language(source_lang)
        self.ensure_supported_language(payload.target_lang)
        if source_lang != 'auto' and source_lang == payload.target_lang:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='源语言与目标语言不能相同')

        if not payload.history_id:
            await self._ensure_no_active_file_task(session, user.id)

        task, history = await self._upsert_file_task(
            session=session,
            user=user,
            history_id=payload.history_id,
            uploaded=uploaded,
            source_lang=source_lang,
            target_lang=payload.target_lang,
        )
        await session.commit()
        self.enqueue_file_translation(task.id)
        return FileTranslateResponse(task_id=task.id, status=task.status, history_id=history.id)

    async def get_file_status(
        self,
        session: AsyncSession,
        user: User,
        task_id: str,
    ) -> FileTaskStatusResponse:
        task = await self._get_user_file_task(session, user.id, task_id)
        return self._build_file_status_response(task)

    async def cancel_file_translation(
        self,
        session: AsyncSession,
        user: User,
        task_id: str,
    ) -> FileTaskStatusResponse:
        task = await self._get_user_file_task(session, user.id, task_id)
        if task.status in ACTIVE_FILE_STATUSES:
            now = datetime.now(timezone.utc)
            task.status = 'cancelled'
            task.error_msg = None
            task.updated_at = now
            task.finished_at = now
            history = await session.scalar(
                select(History).where(History.task_id == task.id, History.user_id == user.id)
            )
            if history:
                history.updated_at = now
            await session.commit()
        return self._build_file_status_response(task)

    def enqueue_file_translation(self, task_id: str) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(self._run_file_translation(task_id))

    async def _run_file_translation(self, task_id: str) -> None:
        async with AsyncSessionLocal() as session:
            task = await session.scalar(select(TranslateTask).where(TranslateTask.id == task_id))
            if not task or task.task_type != 'file' or task.status != 'queued':
                return

            now = datetime.now(timezone.utc)
            task.status = 'translating'
            task.started_at = now
            task.updated_at = now
            history = await session.scalar(select(History).where(History.task_id == task.id))
            if history:
                history.updated_at = now
            await session.commit()

        async with AsyncSessionLocal() as session:
            task = await session.scalar(select(TranslateTask).where(TranslateTask.id == task_id))
            if not task or task.task_type != 'file' or task.status != 'translating':
                return

            history = await session.scalar(select(History).where(History.task_id == task.id))
            now = datetime.now(timezone.utc)
            try:
                storage.delete(task.result_file_id)
                storage.delete(task.bilingual_file_id)

                source_path = self._resolve_storage_path(task.source_file_id)
                source_sections = document_service.extract_sections(source_path)
                actual_source_lang = task.source_lang
                if actual_source_lang == 'auto':
                    actual_source_lang, _ = await self.detect_language('\n'.join(source_sections)[:500])
                    if actual_source_lang == task.target_lang:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail='自动检测结果与目标语言相同，无需翻译',
                        )

                translated_sections = await self._translate_sections(
                    source_sections,
                    actual_source_lang,
                    task.target_lang,
                    session,
                )
                task.source_lang = actual_source_lang
                if history:
                    history.source_lang = actual_source_lang
                task.result_file_id = storage.save_pdf_bytes(
                    document_service.build_translation_pdf(
                        task.original_filename or 'translated',
                        translated_sections,
                    ),
                    category='results',
                )
                task.bilingual_file_id = storage.save_pdf_bytes(
                    document_service.build_bilingual_preview_pdf(
                        task.original_filename or 'preview',
                        source_sections,
                        translated_sections,
                    ),
                    category='previews',
                )
                task.status = 'done'
                task.error_msg = None
            except HTTPException as exc:
                task.status = 'failed'
                task.error_msg = exc.detail
            except Exception:
                task.status = 'failed'
                task.error_msg = '文件翻译失败，请稍后重试'

            task.finished_at = now
            task.updated_at = now
            if history:
                history.updated_at = now
            await session.commit()

    async def _upsert_file_task(
        self,
        session: AsyncSession,
        user: User,
        history_id: str | None,
        uploaded: UploadedFile,
        source_lang: str,
        target_lang: str,
    ) -> tuple[TranslateTask, History]:
        task: TranslateTask | None = None
        history: History | None = None
        create_history_id = history_id
        if history_id:
            history, task = await self._load_history_and_task(session, user.id, history_id, 'file')
            if task and task.status in ACTIVE_FILE_STATUSES:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='当前文件任务正在处理中')
            if task and task.status == 'done':
                if (source_lang != 'auto' and task.source_lang != source_lang) or task.target_lang != target_lang:
                    history = None
                    task = None
                    create_history_id = None
            elif task and task.status not in REUSABLE_FILE_STATUSES:
                await self._ensure_no_active_file_task(session, user.id)

        if not task:
            await self._ensure_no_active_file_task(session, user.id)
            task = TranslateTask(
                user_id=user.id,
                task_type='file',
                status='queued',
                source_lang=source_lang,
                target_lang=target_lang,
                source_file_id=uploaded.file_key,
                original_filename=uploaded.filename,
                file_size=uploaded.file_size,
                terminology_version=await terminology_service.version_snapshot(session),
            )
            session.add(task)
            await session.flush()
            history = History(id=create_history_id, user_id=user.id, task_id=task.id, task_type='file')
            session.add(history)

        storage.delete(task.result_file_id)
        storage.delete(task.bilingual_file_id)

        now = datetime.now(timezone.utc)
        task.status = 'queued'
        task.source_lang = source_lang
        task.target_lang = target_lang
        task.source_file_id = uploaded.file_key
        task.original_filename = uploaded.filename
        task.file_size = uploaded.file_size
        task.result_file_id = None
        task.bilingual_file_id = None
        task.error_msg = None
        task.terminology_version = await terminology_service.version_snapshot(session)
        task.started_at = None
        task.finished_at = None
        task.updated_at = now
        history.title = uploaded.filename
        history.source_lang = source_lang
        history.target_lang = target_lang
        history.updated_at = now
        return task, history
