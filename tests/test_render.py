import sys
sys.path.insert(0, 'app')
import fitz

def test_mupdf_render():
    doc = fitz.open()
    page = doc.new_page(width=600, height=800)
    page.insert_text((50,700), "Hello VelocePDF — MuPDF C/ASM")
    pix = page.get_pixmap(dpi=72)
    assert pix.w == 595 or pix.w == 600
    assert pix.h > 0
    # Test search via page text
    text = page.get_text("text")
    assert "VelocePDF" in text

def test_outline():
    doc = fitz.open()
    page = doc.new_page()
    doc.set_toc([[1, "Chapter 1", 1], [1, "Chapter 2", 1]])
    toc = doc.get_toc()
    assert len(toc) == 2
    assert toc[0][1] == "Chapter 1"

