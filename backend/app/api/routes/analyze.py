import base64
import json
from io import BytesIO
from time import perf_counter

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from PIL import Image, UnidentifiedImageError

from ai_services.openai_vision import analyze_ui_image
from app.core.config import get_settings
from app.schemas.analysis import AnalyzeResponse
from app.services.image_renderer import render_steps_overlay_data_url

router = APIRouter(prefix="/api", tags=["analysis"])

MAX_IMAGE_BYTES = 10 * 1024 * 1024


def _image_to_data_url(image_bytes: bytes, mime_type: str) -> str:
    encoded = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


@router.get("/health")
def api_health() -> dict[str, str]:
    settings = get_settings()
    return {"status": "ok", "model": settings.openai_model}


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_image(
    response: Response,
    file: UploadFile = File(...),
    include_original: bool = Form(True),
    stream_guide: bool = Form(False),
    user_goal: str = Form("Analyze the screenshot and guide the next UI actions."),
) -> AnalyzeResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Upload must be an image.")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 10 MB or smaller.")

    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image_width, image_height = image.size
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="Invalid image file.") from exc

    settings = get_settings()

    started = perf_counter()
    try:
        analysis = await run_in_threadpool(
            analyze_ui_image,
            image_bytes=image_bytes,
            mime_type=file.content_type,
            user_goal=user_goal,
            image_size=(image_width, image_height),
            model=settings.openai_model,
            api_key=settings.openai_api_key,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {exc}") from exc

    model_done = perf_counter()
    guide = dict(
        source_filename=file.filename,
        image_width=image_width,
        image_height=image_height,
        image_mime_type=file.content_type,
        model_used=settings.openai_model,
        summary=analysis.summary,
        steps=[step.model_dump() for step in analysis.steps],
        suggested_next_steps=analysis.suggested_next_steps,
        warnings=analysis.warnings,
        original_image_data_url=_image_to_data_url(image_bytes, file.content_type) if include_original else None,
    )

    async def render_overlay():
        return await run_in_threadpool(render_steps_overlay_data_url, image_bytes, analysis.steps)

    if stream_guide:
        async def events():
            yield json.dumps({"guide": guide}) + "\n"
            yield json.dumps({"overlay": await render_overlay()}) + "\n"

        return StreamingResponse(events(), media_type="application/x-ndjson",
                                 headers={"Server-Timing": f"model;dur={(model_done - started) * 1000:.0f}"})

    overlay = await render_overlay()
    response.headers["Server-Timing"] = (
        f"model;dur={(model_done - started) * 1000:.0f}, "
        f"overlay;dur={(perf_counter() - model_done) * 1000:.0f}"
    )
    return AnalyzeResponse(**guide, annotated_image_data_url=overlay)
