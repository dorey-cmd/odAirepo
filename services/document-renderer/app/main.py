from __future__ import annotations

import json

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app.renderer import render_document
from app.schemas import ContentTree, StyleCatalog
from app.style_extraction import extract_style_catalog

app = FastAPI(title="OdAI Document Rendering Service")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/extract-style-catalog", response_model=StyleCatalog)
async def extract_style_catalog_endpoint(template: UploadFile = File(...)) -> StyleCatalog:
    if not template.filename.lower().endswith(".docx"):
        raise HTTPException(400, "Expected a .docx file")
    data = await template.read()
    try:
        return extract_style_catalog(data)
    except Exception as exc:  # noqa: BLE001 - surface parse errors to the caller
        raise HTTPException(422, f"Could not parse template: {exc}") from exc


@app.post("/render")
async def render_endpoint(
    template: UploadFile = File(...),
    content_tree: str = Form(...),
) -> Response:
    if not template.filename.lower().endswith(".docx"):
        raise HTTPException(400, "Expected a .docx file")
    try:
        tree = ContentTree.model_validate(json.loads(content_tree))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(422, f"Invalid content_tree: {exc}") from exc

    template_bytes = await template.read()
    try:
        rendered = render_document(template_bytes, tree)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(422, f"Could not render document: {exc}") from exc

    return Response(
        content=rendered,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="rendered.docx"'},
    )
