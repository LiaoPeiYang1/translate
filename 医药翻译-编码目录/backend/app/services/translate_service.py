from .translate_file_service import FileTranslateService
from .translate_text_service import TextTranslateService


class TranslateService(TextTranslateService, FileTranslateService):
    pass


translate_service = TranslateService()
