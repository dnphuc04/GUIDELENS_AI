from pydantic import BaseModel

from ai_services.schemas import UIStep


class AnalyzeResponse(BaseModel):
    source_filename: str | None = None
    image_width: int
    image_height: int
    image_mime_type: str
    model_used: str
    summary: str = ""
    steps: list[UIStep]
    suggested_next_steps: list[str]
    warnings: list[str] = []
    original_image_data_url: str | None
    annotated_image_data_url: str
