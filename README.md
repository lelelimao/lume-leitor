# Lume — leitor visual com YOLO, Tesseract e voz

Projeto Python com interface web em português para ler texto impresso pela webcam, mostrar a transcrição e falar o resultado. Também aceita imagens JPEG, PNG, WebP e BMP.

**YOLO11n localiza regiões de texto; Tesseract reconhece letras, palavras e números em português/inglês.** O detector incluído é especializado em texto. Pesos YOLO genéricos de objetos (COCO) não substituem esse modelo. Há um modo Tesseract para comparar resultados e reduzir o tempo de processamento.

## Executar neste computador

Na primeira instalação, dê dois cliques em **`instalar.cmd`**. Ele detecta o Python existente ou baixa a distribuição portátil oficial CPython 3.13.15 do NuGet, prepara o ambiente, instala as dependências e valida YOLO + Tesseract. Precisa de internet; os downloads de componentes são verificados. O script mantém ferramentas na pasta `tools/`, sem exigir instalação global do Python. O `.env` existente é preservado.

Com as dependências instaladas, dê dois cliques em **`iniciar.cmd`**, mantenha o terminal aberto e acesse **http://localhost:8000** no Chrome ou Edge. A página inicial apresenta a pesquisa **Os limites das máquinas**; o leitor prático está em **http://localhost:8000/leitor**.

## Publicar no GitHub

O código do leitor pode ficar em um repositório GitHub. A apresentação está preparada em `docs/` para publicação em **Settings → Pages → Deploy from a branch → main → /docs**. Ao alterar `app/static/home.html`, `home.css` ou `home.js`, execute `python scripts/build_pages.py` e publique o `docs/` atualizado.

O GitHub Pages hospeda apenas a apresentação estática. A câmera, YOLO, Tesseract e a integração Alexa exigem o servidor Python iniciado em um computador ou hospedagem própria para Python. A página publicada aponta para instruções de download e execução local do leitor. Não publique `.env`, ambientes virtuais nem tokens.

Ou, no PowerShell dentro da pasta do projeto:

```powershell
.\.venv\Scripts\python.exe run.py
```

1. **Voz natural · Microsoft** já vem selecionada, com Francisca ou Antônio. Clique em **Ativar câmera** e permita o acesso à webcam. Também é possível escolher Voz do sistema, Google ou Alexa configurada.
2. Aponte para texto bem iluminado, reto e nítido.
3. Leitura contínua e fala automática já começam marcadas. O primeiro texto reconhecido aparece e inicia a fala; perdas breves não apagam a leitura. Uma frase já falada não é repetida durante a sessão. Se o navegador bloquear reprodução, clique uma vez em Ouvir texto para habilitar o áudio.
4. Use captura manual ou envie `examples/teste-leitura.png` para testar sem câmera.
5. Você pode corrigir a transcrição e usar o botão de leitura para falar novamente.

O processamento é contínuo por capturas, não 30 reconhecimentos por segundo. O intervalo é de aproximadamente 1,2 segundo **mais** o tempo da análise. Uma requisição termina antes da próxima. A primeira inicialização do YOLO é mais lenta. Imagens com muitas palavras podem exigir vários segundos. A interface informa o tempo de cada análise.

## Instalação em outro computador

O instalador Windows prepara os componentes automaticamente. Para instalação manual, use **Python 3.12 ou 3.13 de 64 bits**. O primeiro download das dependências inclui PyTorch e pode ocupar centenas de MB. Não é necessária chave OpenAI ou serviço de OCR pago. Home Assistant e o login na Amazon não são instalados automaticamente.

Se o projeto foi enviado em um arquivo compactado (inclusive dividido em partes como `.rar.001`, `.rar.002`), mantenha todas as partes juntas e extraia a partir da primeira para uma pasta comum no computador antes de executar `instalar.cmd`. Na pasta extraída devem estar `instalar.cmd` e `scripts/instalar.ps1`. Executar o `.cmd` dentro da visualização do arquivo compactado abre uma cópia temporária incompleta.

Ao copiar o projeto para outro computador, execute `instalar.cmd` novamente. O instalador procura Python 3.12/3.13 x64, inclusive pelo launcher `py`, ou baixa o Python portátil. Se a pasta `.venv` veio de outro computador e não funciona, ele a guarda como `.venv-anterior-...` e cria um ambiente novo. Mantenha a janela do instalador aberta; se houver erro, copie as últimas linhas para identificar a etapa que falhou.

Se a etapa 2 terminar com várias linhas `is not supported on this platform`, a `.venv` contém pacotes instalados para outra versão de Python ou arquitetura. A versão atual do instalador detecta esse caso e cria uma `.venv` limpa. Em uma cópia antiga do projeto, feche a janela, renomeie apenas a pasta `.venv` para `.venv-antiga` e execute `instalar.cmd` novamente; os pacotes serão baixados de novo.

### Windows

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
powershell -NoProfile -File scripts/setup_tesseract.ps1
.\.venv\Scripts\python.exe scripts/download_models.py
Copy-Item .env.example .env
.\.venv\Scripts\python.exe run.py
```

Copie `.env.example` somente se ainda não existir `.env`. O script do Tesseract baixa também o extrator 7-Zip, mantém a instalação em `tools/tesseract`, verifica SHA-256 e instala os idiomas `por` e `eng`. Se já tiver Tesseract instalado, pule esse script e informe `TESSERACT_CMD` no `.env`, por exemplo:

```dotenv
TESSERACT_CMD=C:/Program Files/Tesseract-OCR/tesseract.exe
OCR_LANGUAGES=por+eng
```

O mecanismo Tesseract é um programa separado: instalar somente `pytesseract` com pip não instala esse executável. Uma alternativa de instalação do Windows é o instalador [UB Mannheim indicado pelo projeto Tesseract](https://tesseract-ocr.github.io/tessdoc/Installation.html#windows), incluindo os idiomas português e inglês.

### Linux / macOS

```bash
# Ubuntu/Debian
sudo apt install tesseract-ocr tesseract-ocr-por tesseract-ocr-eng
# macOS, no lugar do comando acima:
# brew install tesseract tesseract-lang

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/download_models.py
cp .env.example .env
python run.py
```

## Alexa: o que é necessário

**Configuração pela interface:** clique em **Conectar Alexa** no menu lateral, informe o endereço/token do Home Assistant, busque os dispositivos, escolha o Echo, salve e teste a fala. Não é necessário editar `.env` manualmente nem reiniciar o Lume. Há um passo a passo nessa tela e um [guia completo](GUIA_ALEXA.md).

**A voz do navegador funciona sem Alexa.** Ter apenas o aplicativo Alexa no celular não configura uma saída de voz remota para este projeto. A integração implementada envia TTS para um dispositivo Echo através de **Home Assistant + Alexa Media Player**, uma integração comunitária que usa a API não oficial da Alexa. Não faz login na Amazon pelo projeto.

Se você tiver um Echo:

1. Instale e configure [Home Assistant](https://www.home-assistant.io/installation/).
2. Configure [Alexa Media Player](https://github.com/alandtse/alexa_media_player/wiki) no Home Assistant e conecte sua conta Amazon por essa integração.
3. Identifique a entidade do Echo, como `media_player.echo_da_sala`.
4. Teste no Home Assistant a ação `notify.alexa_media`, com `message`, `target` e `data.type: tts`, conforme a [documentação da integração](https://github.com/alandtse/alexa_media_player/wiki/Configuration:-Notification-Component).
5. Crie um token de longa duração no perfil do Home Assistant e preencha **localmente** seu `.env`:

```dotenv
HOME_ASSISTANT_URL=http://homeassistant.local:8123
HOME_ASSISTANT_TOKEN=seu_token_local
ALEXA_ENTITY_ID=media_player.echo_da_sala
```

6. Reinicie o servidor e escolha **Alexa** na interface. O indicador de configuração confirma apenas que os campos foram preenchidos; a conectividade é verificada ao enviar uma fala.

O token permanece no servidor e não é enviado ao navegador. Não compartilhe `.env`. O projeto usa a [API REST do Home Assistant](https://developers.home-assistant.io/docs/api/rest/). Mensagens longas são divididas e enviadas com espaçamento estimado para reduzir interrupções. A resposta “enviado” confirma aceitação pelo Home Assistant, não comprova que houve áudio no Echo. Compatibilidade depende da integração, da conta Amazon e do aparelho. Parar a leitura local não desfaz uma fala já enviada ao Echo.

Sem Echo/Home Assistant, use **Voz natural · Microsoft** ou **Voz do sistema**. Essas opções falam no computador, não no aplicativo Alexa do celular.

## Voz natural ao vivo e expressões

A voz natural acompanha a leitura contínua: o primeiro texto reconhecido aparece e inicia a geração do áudio. Perdas breves da câmera não apagam a frase; leituras já faladas não se repetem na mesma sessão. O primeiro trecho enviado ao serviço de voz é curto para começar mais cedo. Se a voz online falhar antes de começar, o leitor tenta a voz do sistema. Há atraso de reconhecimento e geração de áudio pela internet. A fala não bloqueia a transcrição, e uma leitura em andamento termina antes de iniciar outra automática.

**Sem chave:** Francisca e Antônio, em português brasileiro, usando [edge-tts](https://github.com/rany2/edge-tts). Escolha o ritmo Tranquilo, Normal ou Ágil. São vozes neurais sintetizadas, com entonação natural; não são gravações humanas. A integração comunitária depende do serviço online Microsoft e não oferece seleção de emoções via SSML.

**Expressões específicas:** abra **Vozes e expressões → Quero escolher expressões de voz**. Crie um recurso Speech no [portal Azure](https://portal.azure.com/), copie a região e uma chave de **Chaves e ponto de extremidade**, conecte no formulário e selecione **Azure · expressões de voz**. A lista de vozes brasileiras e estilos vem da sua região; apenas estilos anunciados por cada voz são aceitos. Algumas vozes só têm a expressão Natural. O uso segue a cota e os custos da sua conta. Para vozes HD que não aceitem controle de ritmo, use Normal. Consulte a [API oficial Azure Speech](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech).

A chave é salva em `.env`, nunca devolvida pela API nem guardada no navegador. Você também pode definir `AZURE_SPEECH_REGION` e `AZURE_SPEECH_KEY` manualmente e reiniciar o servidor. Os testes Azure usam respostas simuladas; uma conta real é necessária para validar sua combinação de região, voz e estilo.

**Nilo:** o gato leitor fica no canto inferior direito. Clique nele para abrir/recolher o balão. Ele observa durante OCR e movimenta a boca conforme a amplitude do áudio real na voz natural/Google/Azure. Na voz do sistema, a animação acompanha os eventos de palavras quando o navegador os fornece. Para Alexa, o balão indica envio; não há acesso ao áudio do Echo para sincronizar sua boca.

## Voz Google

Selecione **Google · online**. O Python gera áudio MP3 em memória usando [gTTS](https://gtts.readthedocs.io/en/latest/module.html), e o navegador reproduz e anima o mascote automaticamente. Essa opção usa o serviço de voz do Google Translate, precisa de internet e envia o texto ao Google; não controla dispositivos Google Home/Nest. Não há cache de texto/áudio persistente no app. O áudio é dividido em trechos e não bloqueia novas transcrições. Se o serviço estiver indisponível, a interface informa o erro e permite escolher Voz do sistema.

## Estrutura

```text
app/
  main.py           API FastAPI e arquivos da interface
  vision.py         YOLO, Tesseract, ordenação das palavras
  alexa.py          Integração TTS, divisão e controle de repetição
  natural_voice.py  Vozes Edge e Azure, catálogo de expressões e SSML
  config.py         Configurações .env
  static/           Home da pesquisa, leitor e JavaScript sem etapa de build
scripts/
  download_models.py    Modelo YOLO com revisão/hash fixos
  setup_tesseract.ps1   Tesseract portátil no Windows
  smoke_ocr.py          Teste real de reconhecimento
tests/                 Testes automatizados da API e processamento
models/                Pesos baixados
tools/tesseract/        Executável e idiomas locais
run.py                 Servidor em 127.0.0.1:8000
iniciar.cmd            Atalho Windows
```

## API e testes

- `GET /api/status`: disponibilidade de modelos e configuração da Alexa.
- `POST /api/recognize`: formulário multipart com `file` e `mode=yolo_ocr` ou `ocr`. Retorna texto, caixas das palavras, confiança, dimensões, avisos e duração.
- `POST /api/speak`: JSON `{"text":"Olá mundo","force":false}` para o Echo configurado. A voz do navegador é executada pelo frontend.
- `POST /api/voice/google`: JSON `{"text":"Olá mundo"}`, até 600 caracteres por trecho; retorna áudio MPEG sem cache.
- `POST /api/voice/natural`: JSON com `text` (até 600 caracteres), `provider=edge|azure`, `voice`, `style=neutral` e `rate` (-30 a 30); retorna MP3 sem cache.
- `GET /api/voice/catalog?provider=edge|azure`: vozes brasileiras e estilos compatíveis.
- `GET/POST /api/voice/config`: configuração Azure sem expor a chave / valida e salva região e chave.
- `GET/POST /api/alexa/config`: lê a configuração sem token / valida e salva configurações locais.
- `POST /api/alexa/discover`: verifica autenticação, integração Alexa e lista os players.
- `GET /docs`: documentação interativa FastAPI.

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe scripts/smoke_ocr.py
```

Os testes automatizados de Alexa usam um servidor simulado e **não enviam falas reais**. O smoke test usa os modelos reais, gera uma imagem com letras/números e valida o resultado nos dois modos.

`requirements-lock.txt` registra as versões exatas verificadas neste computador (Windows, Python 3.12), incluindo as dependências de desenvolvimento. Para reproduzir esse ambiente, use `pip install -r requirements-lock.txt`.

## Limites e solução de problemas

- **Webcam:** abra `http://localhost:8000/leitor`, não o HTML diretamente. Verifique permissões e se outro aplicativo está usando a câmera. Este servidor é local e não está configurado para acesso pelo celular/rede externa.
- **Nenhum texto:** melhore foco/iluminação e aproxime a câmera. Compare com o modo Tesseract. Escrita cursiva, texto inclinado, reflexos e letras muito pequenas podem falhar; o projeto não promete reconhecimento perfeito.
- **Português ausente:** execute `tools/tesseract/tesseract.exe --list-langs`. Instale `por.traineddata` se necessário. A aplicação mostra aviso se usar apenas os idiomas disponíveis.
- **YOLO ausente/corrompido:** execute novamente `scripts/download_models.py`. O hash do modelo padrão é verificado antes de carregá-lo.
- **Limites:** arquivos de até 8 MB e 24 megapixels, redimensionados para até 1600 px; até 40 regiões por captura no YOLO e limite de tempo de OCR. Os avisos indicam leituras parciais. Fala da Alexa limitada a 4000 caracteres por envio, sem truncamento silencioso.
- **Privacidade:** capturas são processadas em memória pelo servidor Python local; não há armazenamento de fotos ou histórico em disco. Imagens não são enviadas a provedores de voz. O texto vai à Microsoft na Voz natural/Azure, ao Google Translate na saída Google, ou ao Home Assistant e integração Amazon na saída Alexa. A voz do sistema pode usar o serviço do provedor conforme a voz escolhida. As fontes visuais são carregadas do Google Fonts, com alternativa local se indisponíveis. O `.env` guarda o token Home Assistant e a chave Azure: mantenha-o privado.

## Modelos e licenças

O checkpoint é [RoyRud1902/yolo11n-text](https://huggingface.co/RoyRud1902/yolo11n-text), revisão `8fc8436770be72178cf788983b73bf6a75c967e3`, SHA-256 `ce26dca363a67fe96c09cc51bed5d09de887239ad5f8a1bd71ee216c2f602a20`. O publicador declara Apache-2.0 para os pesos. O runtime [Ultralytics](https://www.ultralytics.com/license) tem termos próprios AGPL-3.0/Enterprise. [Tesseract](https://github.com/tesseract-ocr/tesseract) é Apache-2.0. Confira as licenças das dependências antes de redistribuir ou usar em um produto comercial.

