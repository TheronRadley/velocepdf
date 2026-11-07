import sys
sys.path.insert(0, 'app')
from main import sanitize_filename, is_allowed_url

def test_traversal():
    assert sanitize_filename('../../etc/passwd') == 'passwd'
    assert sanitize_filename('/absolute/path/file.pdf') == 'file.pdf'
    assert sanitize_filename('a/b\\c/d.pdf') == 'd.pdf'

def test_control_and_dots():
    assert sanitize_filename('...hidden') == 'hidden'
    assert sanitize_filename('\x00bad\x1Fname') == '_bad_name'
    assert sanitize_filename('') == 'attachment'

def test_length():
    long = 'a'*300 + '.pdf'
    out = sanitize_filename(long)
    assert len(out) <= 200
    assert out.endswith('.pdf')

def test_reserved():
    assert sanitize_filename('CON') == '_CON'
    assert sanitize_filename('CON.txt') == '_CON.txt'

def test_allowed_url():
    assert is_allowed_url('https://example.com') == True
    assert is_allowed_url('http://example.com') == True
    assert is_allowed_url('mailto:test@example.com') == True
    assert is_allowed_url('javascript:alert(1)') == False
    assert is_allowed_url('file:///etc/passwd') == False

