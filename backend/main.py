from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .services.ai_pipeline import ImaginePipeline


app = FastAPI(title="IMAGINEv1 AI Backend")

# Frontend and backend run on separate local ports during development.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

pipeline = ImaginePipeline()


class GenerateRequest(BaseModel):
    teacherSpeech: str = Field(..., min_length=1, max_length=4000)


class GenerateResponse(BaseModel):
    text: str
    imageUrl: str
    imagePrompt: str
    mode: str
    textMode: str


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/generate", response_model=GenerateResponse)
async def generate_frame(request: GenerateRequest) -> GenerateResponse:
    """Process one teacher input chunk into one classroom output frame."""
    clean_input = request.teacherSpeech.strip()

    if not clean_input:
        raise HTTPException(status_code=400, detail="teacherSpeech is required.")

    try:
        result = await pipeline.generate(clean_input)
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return GenerateResponse(**result)
