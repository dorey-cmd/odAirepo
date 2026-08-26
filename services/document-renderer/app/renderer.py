"""
Renders a new .docx by starting from a copy of the original template (so
styles.xml, numbering.xml, theme, and section/page setup are preserved
byte-for-byte), wiping only the body content, and rebuilding it from an
AI-produced ContentTree that references style/numbering IDs from the
template's own StyleCatalog.
"""
from __future__ import annotations

from io import BytesIO

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

from app.schemas import ContentNode, ContentTree


def _clear_body_keep_section(document: Document) -> None:
    body = document.element.body
    section_pr = body.find(qn("w:sectPr"))
    for child in list(body):
        if child is not section_pr:
            body.remove(child)


def _set_num_pr(paragraph, num_id: int, ilvl: int) -> None:
    p_pr = paragraph._p.get_or_add_pPr()
    existing = p_pr.find(qn("w:numPr"))
    if existing is not None:
        p_pr.remove(existing)
    num_pr = OxmlElement("w:numPr")
    ilvl_el = OxmlElement("w:ilvl")
    ilvl_el.set(qn("w:val"), str(ilvl))
    num_id_el = OxmlElement("w:numId")
    num_id_el.set(qn("w:val"), str(num_id))
    num_pr.append(ilvl_el)
    num_pr.append(num_id_el)
    p_pr.insert(0, num_pr)


def _known_paragraph_style_names(document: Document) -> set[str]:
    return {s.name for s in document.styles if s.type is not None and s.name}


def _add_paragraph(document: Document, node: ContentNode, known_styles: set[str]):
    style_name = node.style_name if node.style_name in known_styles else None
    paragraph = document.add_paragraph(node.text or "", style=style_name)
    if node.numId is not None:
        _set_num_pr(paragraph, node.numId, node.ilvl or 0)
    return paragraph


def _add_table(document: Document, node: ContentNode, known_styles: set[str]):
    rows = node.rows or [[""]]
    n_cols = max(len(r) for r in rows)
    table = document.add_table(rows=len(rows), cols=n_cols)
    if node.style_name:
        try:
            table.style = node.style_name
        except KeyError:
            pass
    for r_idx, row in enumerate(rows):
        for c_idx in range(n_cols):
            table.rows[r_idx].cells[c_idx].text = row[c_idx] if c_idx < len(row) else ""
    return table


def render_document(template_bytes: bytes, content_tree: ContentTree) -> bytes:
    document = Document(BytesIO(template_bytes))
    known_styles = _known_paragraph_style_names(document)
    _clear_body_keep_section(document)

    for node in content_tree.nodes:
        if node.type == "table":
            _add_table(document, node, known_styles)
        else:
            _add_paragraph(document, node, known_styles)

    out = BytesIO()
    document.save(out)
    return out.getvalue()
