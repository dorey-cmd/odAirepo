"""
Phase 0 de-risking spike (see plan §Document Rendering Service):

1. Build a synthetic template with a custom font/style, a numbered clause
   list (direct numPr, the common real-world case), and a signature table.
2. Extract its StyleCatalog.
3. Hand-craft a ContentTree that reuses ONLY the styles/numbering found in
   that catalog, with genuinely different clause text/count than the
   template (simulating what Claude's submit_draft tool would send).
4. Render it back into a .docx starting from the template.
5. Save both files under fixtures/ for manual visual inspection in Word.

Run from services/document-renderer with:
    .venv/Scripts/python -m tests.run_phase0_prototype
"""
from __future__ import annotations

import json
from pathlib import Path

from app.renderer import render_document
from app.schemas import ContentNode, ContentTree
from app.style_extraction import extract_style_catalog
from tests.create_sample_template import build_sample_template

FIXTURES = Path(__file__).parent / "fixtures"


def main() -> None:
    template_path = FIXTURES / "sample_template.docx"
    build_sample_template(template_path)
    template_bytes = template_path.read_bytes()

    catalog = extract_style_catalog(template_bytes)
    print("=== Extracted StyleCatalog ===")
    print(json.dumps(catalog.model_dump(), indent=2, ensure_ascii=False))

    numbered_style = next(
        s for s in catalog.paragraph_styles if s.numbering is not None
    )
    body_style = next(
        s for s in catalog.paragraph_styles if s.style_name == "Contract Body"
    )
    heading_style = next(
        s for s in catalog.paragraph_styles if s.style_name == "Heading 1"
    )
    title_style = next(
        s for s in catalog.paragraph_styles if s.style_name == "Title"
    )

    # Simulate an AI-authored draft: different content, same style/numbering IDs,
    # MORE clauses than the template had (proves structural flexibility, not
    # just placeholder substitution).
    content_tree = ContentTree(
        nodes=[
            ContentNode(type="heading", style_name=title_style.style_name,
                        text="Consulting Services Agreement"),
            ContentNode(type="paragraph", style_name=body_style.style_name,
                        text="This Agreement is entered into between Acme Ltd. and Beta Consulting Inc."),
            ContentNode(type="heading", style_name=heading_style.style_name, text="Definitions"),
            ContentNode(type="numbered_clause", style_name=numbered_style.style_name,
                        text="\"Services\" means the consulting services described in Exhibit A.",
                        numId=numbered_style.numbering.numId, ilvl=0),
            ContentNode(type="numbered_clause", style_name=numbered_style.style_name,
                        text="\"Fees\" means the amounts payable under Section 3.",
                        numId=numbered_style.numbering.numId, ilvl=0),
            ContentNode(type="heading", style_name=heading_style.style_name, text="Fees and Payment"),
            ContentNode(type="numbered_clause", style_name=numbered_style.style_name,
                        text="Client shall pay Consultant a monthly retainer of $5,000.",
                        numId=numbered_style.numbering.numId, ilvl=0),
            ContentNode(type="heading", style_name=heading_style.style_name, text="Signatures"),
            ContentNode(type="table", style_name="Table Grid", rows=[
                ["Acme Ltd.", "Beta Consulting Inc."],
                ["Signature: ____________", "Signature: ____________"],
            ]),
        ]
    )

    rendered_bytes = render_document(template_bytes, content_tree)
    output_path = FIXTURES / "rendered_output.docx"
    output_path.write_bytes(rendered_bytes)
    print(f"\nWrote {output_path} — open it in Word and compare fonts/numbering/heading style against {template_path}")


if __name__ == "__main__":
    main()
