#!/usr/bin/env python3
"""SoundPath Studio v2: static local website plus optional Audiveris OMR bridge.
Standard Python library only; actual PDF/photo recognition requires an Audiveris executable.
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote
from threading import BoundedSemaphore, Timer
import io
import json
import os
import shutil
import subprocess
import tempfile
import webbrowser
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent
HOST = os.getenv('SOUNDPATH_HOST', '0.0.0.0')
PORT = int(os.getenv('SOUNDPATH_PORT', '5188'))
MAX_UPLOAD = 20 * 1024 * 1024
MAX_XML = 12 * 1024 * 1024
OMR_CONCURRENCY = BoundedSemaphore(value=1)


def audiveris_command():
    """One executable path; no shell processing, so user paths with spaces work."""
    custom = os.getenv('AUDIVERIS_BIN')
    if custom and Path(custom).is_file():
        return str(Path(custom).resolve())
    return shutil.which('audiveris')


def to_musicxml(data, extension):
    if extension in ('.musicxml', '.xml'):
        if len(data) > MAX_XML:
            raise ValueError('MusicXML 檔案超過 12 MB')
        if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
            raise ValueError('不接受含有 DTD 或外部實體的 XML')
        root = ET.fromstring(data)
        if root.tag.rsplit('}', 1)[-1] not in ('score-partwise', 'score-timewise'):
            raise ValueError('不是 MusicXML 樂譜')
        return data.decode('utf-8-sig', errors='replace')
    if extension != '.mxl':
        raise ValueError('檔案不是 MusicXML/MXL')
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = set(z.namelist())
        if 'META-INF/container.xml' in names:
            if z.getinfo('META-INF/container.xml').file_size > 100 * 1024:
                raise ValueError('MXL 索引過大')
            container = ET.fromstring(z.read('META-INF/container.xml'))
            elem = next((e for e in container.iter() if e.tag.rsplit('}',1)[-1] == 'rootfile'), None)
            first = elem.get('full-path') if elem is not None else None
        else:
            first = next((n for n in names if n.lower().endswith(('.xml', '.musicxml')) and not n.startswith('META-INF/')), None)
        if not first or first not in names or z.getinfo(first).file_size > MAX_XML:
            raise ValueError('MXL 沒有可讀取的 MusicXML')
        return to_musicxml(z.read(first), '.musicxml')


def recognize_pdf_image(data, extension):
    engine = audiveris_command()
    if not engine:
        raise FileNotFoundError('找不到 Audiveris 辨識引擎。請先安裝 Audiveris 5.11+，並把 audiveris 指令加入 PATH，或設定 AUDIVERIS_BIN 為啟動程式完整路徑。')
    with tempfile.TemporaryDirectory(prefix='soundpath-omr-') as tmp:
        folder = Path(tmp)
        input_file = folder / ('upload' + extension)
        output_folder = folder / 'results'
        output_folder.mkdir()
        input_file.write_bytes(data)
        cmd = [engine, '-batch', '-export', '-output', str(output_folder), str(input_file)]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=240, check=False,
                                    cwd=tmp, errors='replace')
        except subprocess.TimeoutExpired:
            raise RuntimeError('樂譜辨識超時（4 分鐘），請改用較小或較清楚的檔案')
        results = [p for p in output_folder.rglob('*') if p.is_file() and p.suffix.lower() in ('.mxl', '.musicxml', '.xml')]
        results.sort(key=lambda p: (p.suffix.lower() != '.mxl', str(p)))
        errors = []
        for candidate in results:
            if candidate.stat().st_size > MAX_UPLOAD:
                continue
            try:
                return to_musicxml(candidate.read_bytes(), candidate.suffix.lower())
            except Exception as exc:
                errors.append(str(exc))
        detail = (result.stderr or result.stdout or '').strip()[-500:]
        if result.returncode != 0:
            raise RuntimeError(f'Audiveris 無法完成辨識（代碼 {result.returncode}）：{detail or "請檢查掃描品質"}')
        raise RuntimeError('Audiveris 沒有產生 MusicXML；可能無法辨識此譜面。' + (' '.join(errors[:2]) if errors else detail))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, code, payload):
        blob = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(blob)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(blob)

    def do_GET(self):
        if self.path == '/api/omr-status':
            self.send_json(200, {'ready': bool(audiveris_command()), 'engine': 'Audiveris',
                                 'help': 'https://github.com/Audiveris/audiveris/releases'})
        elif self.path.startswith('/api/'):
            self.send_json(404, {'error': '沒有這個 API'})
        else:
            super().do_GET()

    def do_POST(self):
        if self.path != '/api/recognize':
            self.send_json(404, {'error': '沒有這個 API'})
            return
        origin = self.headers.get('Origin')
        host = self.headers.get('Host', '')
        if origin and origin not in (f'http://{host}', f'https://{host}'):
            self.send_json(403, {'error': '不接受跨網站上傳'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            size = 0
        if not 0 < size <= MAX_UPLOAD:
            self.send_json(413, {'error': '單檔必須小於 20 MB'})
            return
        filename = unquote(self.headers.get('X-Filename', 'score.pdf'))
        extension = Path(filename).suffix.lower()
        if extension not in ('.png', '.jpg', '.jpeg', '.pdf', '.bmp', '.tif', '.tiff', '.musicxml', '.xml', '.mxl'):
            self.send_json(415, {'error': '僅接受 PDF、圖片、MusicXML 或 MXL'})
            return
        if not OMR_CONCURRENCY.acquire(blocking=False):
            self.send_json(429, {'error': '已有一份譜面正在辨識，請完成後再試'})
            return
        try:
            data = self.rfile.read(size)
            if len(data) != size:
                raise ValueError('檔案傳輸不完整')
            if extension == '.pdf' and not data.startswith(b'%PDF-'):
                raise ValueError('不是有效 PDF 檔案')
            if extension == '.png' and not data.startswith(b'\x89PNG'):
                raise ValueError('不是有效 PNG 檔案')
            if extension in ('.jpg', '.jpeg') and not data.startswith(b'\xff\xd8'):
                raise ValueError('不是有效 JPEG 檔案')
            if extension in ('.xml', '.musicxml', '.mxl'):
                xml = to_musicxml(data, extension)
                engine = 'MusicXML 直接匯入'
            else:
                xml = recognize_pdf_image(data, extension)
                engine = 'Audiveris (本機)'
            self.send_json(200, {'musicxml': xml, 'engine': engine, 'warning': '請核對原譜和辨識結果；OMR 可能誤判音符、拍值、調號或連音線。'})
        except FileNotFoundError as exc:
            self.send_json(503, {'error': str(exc), 'needs_setup': True})
        except (ValueError, ET.ParseError, zipfile.BadZipFile) as exc:
            self.send_json(422, {'error': str(exc)})
        except Exception as exc:
            self.send_json(500, {'error': str(exc)})
        finally:
            OMR_CONCURRENCY.release()


if __name__ == '__main__':
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as exc:
        raise SystemExit(f'無法使用埠 {PORT}: {exc}')
    print(f'聲徑 Studio v2  http://127.0.0.1:{PORT}/')
    print('區網存取: http://<本機 IP>:' + str(PORT) + '/')
    print('Audiveris OMR:', audiveris_command() or '尚未安裝（MusicXML 可直接匯入）')
    print('按 Ctrl+C 結束。請勿把無認證的上傳服務開放至網際網路。')
    if os.getenv('SOUNDPATH_NO_BROWSER') != '1':
        Timer(0.5, lambda: webbrowser.open(f'http://127.0.0.1:{PORT}/')).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
