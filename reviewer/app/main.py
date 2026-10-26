from fastapi import FastAPI

app = FastAPI(title="ToolLock reviewer")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# POST /review is implemented in build step 8.
