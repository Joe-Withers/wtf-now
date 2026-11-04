from fastapi import FastAPI

app = FastAPI(title="wtf-now")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
