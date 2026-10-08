"""Build the static research presentation for GitHub Pages in docs/."""

from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "app" / "static"
DESTINATION = ROOT / "docs"


def main() -> None:
    DESTINATION.mkdir(exist_ok=True)
    html = (SOURCE / "home.html").read_text(encoding="utf-8")
    for original, replacement in (
        ('href="/static/home.css?v=1"', 'href="./home.css?v=1"'),
        ('src="/static/home.js?v=1"', 'src="./home.js?v=1"'),
        ('href="/leitor"', 'href="./como-usar.html"'),
        ('href="/"', 'href="./"'),
        ('Abrir leitor', 'Como testar o leitor'),
        ('Conhecer o leitor ao vivo', 'Conhecer o leitor'),
        ('Experimentar o projeto prático', 'Saiba como testar o leitor'),
    ):
        html = html.replace(original, replacement)
    (DESTINATION / "index.html").write_text(html, encoding="utf-8")
    for filename in ("home.css", "home.js"):
        (DESTINATION / filename).write_bytes((SOURCE / filename).read_bytes())
    (DESTINATION / ".nojekyll").touch()
    (DESTINATION / "como-usar.html").write_text(
        """<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#0d7347"><title>Testar o leitor — Lume</title><link rel="stylesheet" href="./home.css?v=1"><style>body{background:#eef4eb}.instructions{max-width:760px;margin:0 auto;padding:clamp(36px,7vw,86px) 24px 110px}.instructions h1{font:800 clamp(42px,7vw,74px)/1.05 Manrope,sans-serif;letter-spacing:-.06em;color:#113d2e;margin:20px 0}.instructions p,.instructions li{font-size:16px;line-height:1.8;color:#536b5c}.instructions ol{padding-left:24px}.instructions li{margin:14px 0}.instructions a{color:#0d7347;font-weight:700}.instructions .notice{margin:30px 0}.instructions code{background:#dbe9d9;padding:3px 6px;border-radius:3px}</style></head><body><header class="site-header"><a class="brand" href="./" aria-label="Lume, início">lume<span class="brand-point">.</span></a><a class="nav-cta" href="./">← Voltar à pesquisa</a></header><main class="instructions"><p class="eyebrow">PROJETO PRÁTICO</p><h1>Teste o leitor no seu computador.</h1><p>O leitor usa Python, YOLO e Tesseract para reconhecer texto da câmera. O GitHub Pages apresenta a pesquisa; a leitura ao vivo é executada no computador de quem testa.</p><ol><li>Abra o repositório do projeto no GitHub e escolha <strong>Code → Download ZIP</strong>.</li><li>Extraia o ZIP em uma pasta no computador. No Windows, execute <code>instalar.cmd</code> com internet.</li><li>Depois execute <code>iniciar.cmd</code> e abra <code>http://localhost:8000/leitor</code> no navegador.</li></ol><p>Para usar um Echo, configure o Home Assistant e o Alexa Media Player conforme <code>GUIA_ALEXA.md</code> no repositório. A voz do computador funciona sem Echo.</p><p class="notice">A apresentação publicada não processa imagens nem recebe acesso à câmera. As capturas são processadas pelo servidor local quando você inicia o leitor no seu computador.</p><p><a id="repository-link" href="https://github.com">Abrir repositório no GitHub ↗</a></p></main><script>const parts=location.pathname.split('/').filter(Boolean);if(location.hostname.endsWith('.github.io')&&parts[0]){document.getElementById('repository-link').href='https://github.com/'+location.hostname.split('.')[0]+'/'+parts[0]}</script></body></html>
""",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
