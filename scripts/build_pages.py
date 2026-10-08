"""Build the static research presentation for GitHub Pages in docs/."""

from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "app" / "static"
DESTINATION = ROOT / "docs"


def main() -> None:
    DESTINATION.mkdir(exist_ok=True)
    html = (SOURCE / "home.html").read_text(encoding="utf-8")
    for original, replacement in (
        ('href="/static/home.css?v=2"', 'href="./home.css?v=2"'),
        ('src="/static/home.js?v=1"', 'src="./home.js?v=1"'),
        ('src="/static/quiz.js?v=1"', 'src="./quiz.js?v=1"'),
        ('href="/leitor"', 'href="http://localhost:8000/leitor"'),
        ('href="/"', 'href="./"'),
        ('Abrir leitor', 'Abrir leitor local'),
        ('Conhecer o leitor ao vivo', 'Abrir leitor local'),
        ('Experimentar o projeto prático', 'Abrir leitor local'),
    ):
        html = html.replace(original, replacement)
    reader_link = '<a class="text-link light-link" href="http://localhost:8000/leitor">Abrir leitor local <span aria-hidden="true">↗</span></a>'
    html = html.replace(reader_link, reader_link + '<a class="text-link light-link" href="./como-usar.html">Como instalar <span aria-hidden="true">↗</span></a>')
    (DESTINATION / "index.html").write_text(html, encoding="utf-8")
    for filename in ("home.css", "home.js", "quiz.js"):
        (DESTINATION / filename).write_bytes((SOURCE / filename).read_bytes())
    (DESTINATION / ".nojekyll").touch()
    (DESTINATION / "como-usar.html").write_text(
        """<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#0d7347"><title>Abrir leitor — Lume</title><link rel="stylesheet" href="./home.css?v=2"><style>
body{background:#eef4eb}.instructions{max-width:760px;margin:0 auto;padding:clamp(36px,7vw,86px) 24px 110px}.instructions h1{font:800 clamp(42px,7vw,74px)/1.05 Manrope,sans-serif;letter-spacing:-.06em;color:#113d2e;margin:20px 0}.instructions p,.instructions li{font-size:16px;line-height:1.8;color:#536b5c}.instructions ol{padding-left:24px}.instructions li{margin:14px 0}.instructions a{color:#0d7347;font-weight:700}.instructions .launch-actions{display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin:26px 0 34px}.instructions .launch-actions .nav-cta{color:#fff}.instructions .notice{margin:30px 0}.instructions code{background:#dbe9d9;padding:3px 6px;border-radius:3px}
</style></head>
<body><header class="site-header"><a class="brand" href="./" aria-label="Lume, início">lume<span class="brand-point">.</span></a><a class="nav-cta" href="./">← Voltar à pesquisa</a></header>
<main class="instructions"><p class="eyebrow">PROJETO PRÁTICO</p><h1>Abra o leitor no seu computador.</h1><p>Se o Lume já estiver iniciado, o botão abaixo abre a câmera e as ferramentas de leitura diretamente.</p><div class="launch-actions"><a class="nav-cta" href="http://localhost:8000/leitor">Abrir leitor local ↗</a><a id="repository-link" href="https://github.com">Baixar projeto no GitHub ↗</a></div><p>Se o leitor ainda não abrir, prepare o projeto neste computador:</p><ol><li>Abra o repositório no GitHub e escolha <strong>Code → Download ZIP</strong>.</li><li>Extraia o ZIP. No Windows, execute <code>instalar.cmd</code> com internet.</li><li>Execute <code>iniciar.cmd</code> e volte a clicar em <strong>Abrir leitor local</strong>.</li></ol><p>Para usar um Echo, configure Home Assistant e Alexa Media Player conforme <code>GUIA_ALEXA.md</code> no repositório. A voz do computador funciona sem Echo.</p><p class="notice">A página publicada apresenta a pesquisa. A câmera, o reconhecimento e a voz funcionam no leitor iniciado neste computador.</p></main>
<script>const parts=location.pathname.split('/').filter(Boolean);if(location.hostname.endsWith('.github.io')&&parts[0]){document.getElementById('repository-link').href='https://github.com/'+location.hostname.split('.')[0]+'/'+parts[0]}</script></body></html>
""", encoding="utf-8")


if __name__ == "__main__":
    main()
