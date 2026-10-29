from functools import lru_cache

from fastapi import FastAPI

from .graph import build_graph, default_chat_model
from .models import ReviewRequest, ReviewResponse

app = FastAPI(title="ToolLock reviewer")


@lru_cache(maxsize=1)
def _graph():
    return build_graph(default_chat_model())


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/review", response_model=ReviewResponse)
def review(request: ReviewRequest) -> ReviewResponse:
    # Sync handler: FastAPI runs it in a worker thread, so a slow LLM call doesn't block the event loop.
    return _graph().invoke({"request": request})["result"]
