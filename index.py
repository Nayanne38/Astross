"""Vercel entrypoint: exposes the FastAPI app (api/main.py) as a serverless function."""
from api.main import app  # noqa: F401
