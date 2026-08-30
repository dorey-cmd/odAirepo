from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class NumberingInfo(BaseModel):
    numId: int
    ilvl: int
    format: Optional[str] = None  # e.g. "decimal", "lowerLetter", "bullet"
    example_text: Optional[str] = None


class FontInfo(BaseModel):
    name: Optional[str] = None
    size_pt: Optional[float] = None
    bold: Optional[bool] = None
    italic: Optional[bool] = None


class StyleCatalogEntry(BaseModel):
    style_name: str
    style_id: str
    usage_count: int
    example_text: str
    numbering: Optional[NumberingInfo] = None
    font: Optional[FontInfo] = None


class TableCatalogEntry(BaseModel):
    style_name: Optional[str] = None
    row_count: int
    col_count: int
    example_row_texts: list[str] = Field(default_factory=list)


class StyleCatalog(BaseModel):
    paragraph_styles: list[StyleCatalogEntry]
    tables: list[TableCatalogEntry]
    section_notes: str = (
        "Reuse only the style_name values listed above. Do not invent new style "
        "names — the renderer will fall back to 'Normal' for anything unrecognized."
    )


# ---- Content tree (what Claude's submit_draft tool must produce) ----

class ContentNode(BaseModel):
    type: Literal["paragraph", "heading", "numbered_clause", "table"]
    style_name: Optional[str] = None
    text: Optional[str] = None
    numId: Optional[int] = None
    ilvl: Optional[int] = None
    alignment: Optional[Literal["left", "center", "right", "justify"]] = None
    rows: Optional[list[list[str]]] = None  # only for type == "table"


class ContentTree(BaseModel):
    nodes: list[ContentNode]
