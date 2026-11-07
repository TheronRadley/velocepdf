import sys, os
sys.path.insert(0, 'app')
import main
main.app.config['TESTING'] = True
client = main.app.test_client()

def test_info():
    res = client.get('/api/info')
    assert res.status_code == 200
    j = res.get_json()
    assert 'engine' in j
    assert 'MuPDF' in j['engine']

def test_open_minimal():
    with open('tests/fixtures/minimal.pdf', 'rb') as f:
        res = client.post('/api/open', data={'file': (f, 'minimal.pdf')})
    assert res.status_code == 200
    j = res.get_json()
    assert j['metadata']['pageCount'] == 1
    assert j['name'] == 'minimal.pdf'

def test_search():
    with open('tests/fixtures/minimal.pdf', 'rb') as f:
        res = client.post('/api/open', data={'file': (f, 'minimal.pdf')})
    j = res.get_json()
    doc_id = j['id']
    res = client.post('/api/search', json={'id': doc_id, 'query': 'VelocePDF'})
    assert res.status_code == 200
    j2 = res.get_json()
    assert j2['count'] >= 1

