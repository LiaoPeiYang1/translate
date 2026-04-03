from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.schemas.auth import AuthResponse, LoginRequest, RefreshRequest, SSOCallbackRequest
from app.schemas.common import ApiResponse
from app.services.auth_service import auth_service


router = APIRouter(prefix='/auth', tags=['auth'])


@router.post('/login', response_model=ApiResponse[AuthResponse])
async def login(payload: LoginRequest, session: AsyncSession = Depends(get_db_session)) -> ApiResponse[AuthResponse]:
    return ApiResponse(data=await auth_service.login(session, payload.email, payload.password))


@router.post('/refresh', response_model=ApiResponse)
async def refresh(payload: RefreshRequest, session: AsyncSession = Depends(get_db_session)) -> ApiResponse[dict]:
    tokens = await auth_service.refresh(session, payload.refresh_token)
    return ApiResponse(data=tokens.model_dump())


@router.post('/sso/callback', response_model=ApiResponse[AuthResponse])
async def sso_callback(payload: SSOCallbackRequest, session: AsyncSession = Depends(get_db_session)) -> ApiResponse[AuthResponse]:
    return ApiResponse(data=await auth_service.handle_feishu_callback(session, payload.code))


@router.post('/logout', status_code=204)
async def logout() -> Response:
    return Response(status_code=204)
