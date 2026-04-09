from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.history import History
from app.models.translate_task import TranslateTask
from app.models.user import User
from app.schemas.translate import TextTranslateRequest, TextTranslateResponse
from app.services.terminology_service import terminology_service

from .translate_common import TranslateCommonService


class TextTranslateService(TranslateCommonService):
    async def translate_text(
        self,
        session: AsyncSession,
        user: User,
        payload: TextTranslateRequest,
    ) -> TextTranslateResponse:
        source_lang = payload.source_lang
        if source_lang == 'auto':
            source_lang, _ = await self.detect_language(payload.text)
        self.ensure_supported_language(source_lang)
        self.ensure_supported_language(payload.target_lang)
        if source_lang == payload.target_lang:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='源语言与目标语言不能相同')

        try:
            term_matches = await terminology_service.extract_terms(
                session,
                payload.text,
                source_lang,
                payload.target_lang,
            )
            protected_text = payload.text
            for item in term_matches:
                protected_text = protected_text.replace(item['original'], item['placeholder'])

            translated = await self._translate_chunk(protected_text, source_lang, payload.target_lang)
            final_text = translated
            for item in term_matches:
                final_text = final_text.replace(item['placeholder'], item['translation'])
        except Exception as exc:
            task, history = await self._upsert_text_task(
                session=session,
                user=user,
                history_id=payload.history_id,
                source_text=payload.text,
                result_text=None,
                source_lang=source_lang,
                target_lang=payload.target_lang,
                terminology_version=await terminology_service.version_snapshot(session),
                status_value='failed',
                error_msg='翻译失败，请稍后重试',
            )
            await session.commit()
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail='翻译失败，请稍后重试') from exc

        task, history = await self._upsert_text_task(
            session=session,
            user=user,
            history_id=payload.history_id,
            source_text=payload.text,
            result_text=final_text,
            source_lang=source_lang,
            target_lang=payload.target_lang,
            terminology_version=await terminology_service.version_snapshot(session),
            status_value='success',
            error_msg=None,
        )
        await session.commit()

        return TextTranslateResponse(
            task_id=task.id,
            translated_text=final_text,
            source_lang=source_lang,
            terminology_count=len(term_matches),
            history_id=history.id,
        )

    async def _translate_chunk(self, text: str, source_lang: str, target_lang: str) -> str:
        from app.services.provider_service import provider_service

        return await provider_service.translate(text, source_lang, target_lang)

    async def _upsert_text_task(
        self,
        session: AsyncSession,
        user: User,
        history_id: str | None,
        source_text: str,
        result_text: str | None,
        source_lang: str,
        target_lang: str,
        terminology_version: str | None,
        status_value: str,
        error_msg: str | None,
    ) -> tuple[TranslateTask, History]:
        task: TranslateTask | None = None
        history: History | None = None
        create_history_id = history_id
        if history_id:
            history, task = await self._load_history_and_task(session, user.id, history_id, 'text')
        if task and (
            (source_lang != 'auto' and task.source_lang != source_lang) or task.target_lang != target_lang
        ):
            history = None
            task = None
            create_history_id = None

        if not task:
            task = TranslateTask(
                user_id=user.id,
                task_type='text',
                status=status_value,
                source_lang=source_lang,
                target_lang=target_lang,
                source_text=source_text,
                result_text=result_text,
                error_msg=error_msg,
                terminology_version=terminology_version,
                finished_at=datetime.now(timezone.utc),
            )
            session.add(task)
            await session.flush()
            history = History(id=create_history_id, user_id=user.id, task_id=task.id, task_type='text')
            session.add(history)

        now = datetime.now(timezone.utc)
        task.status = status_value
        task.source_lang = source_lang
        task.target_lang = target_lang
        task.source_text = source_text
        task.result_text = result_text
        task.error_msg = error_msg
        task.terminology_version = terminology_version
        task.finished_at = now
        task.updated_at = now
        history.title = source_text[:50]
        history.source_lang = source_lang
        history.target_lang = target_lang
        history.updated_at = now
        return task, history
