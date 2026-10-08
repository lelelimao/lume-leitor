# Como fazer a Alexa ler com o Lume

## Antes de começar

Você precisa de um **Echo**, configurado no aplicativo Alexa, e de um **Home Assistant** que fique ligado. O aplicativo Alexa sozinho no celular não é um alto-falante remoto compatível com esta integração.

Se não tiver esses componentes, selecione **Google** ou **Voz do navegador** no Lume. O texto será falado no computador. Google usa o serviço de voz do Google Translate pela biblioteca gTTS e precisa de internet; não significa controlar um Google Home/Nest.

## 1. Prepare o Home Assistant

Instale o Home Assistant seguindo a [documentação oficial para seu equipamento](https://www.home-assistant.io/installation/). No Windows, uma máquina virtual com Home Assistant OS é uma opção; também pode ficar em outro equipamento da mesma rede. Conclua a configuração e anote o endereço usado no navegador, por exemplo `http://homeassistant.local:8123` ou o IP/porta exibido na sua instalação.

O instalador `instalar.cmd` prepara o Lume, Python e OCR. A instalação do Home Assistant e o login Amazon são feitos separadamente, por você.

## 2. Conecte a Amazon pelo Alexa Media Player

1. Instale o [HACS conforme o tipo da sua instalação](https://www.hacs.xyz/docs/use/download/download/).
2. No HACS, procure **Alexa Media Player**, baixe a integração e reinicie o Home Assistant quando solicitado.
3. Abra **Configurações → Dispositivos e serviços → Adicionar integração** e procure **Alexa Media Player**.
4. Siga o login Amazon, a região e a autenticação de dois fatores solicitados pela integração. Use a mesma conta do Echo.
5. Confira se seu Echo aparece como entidade `media_player`, como `media_player.echo_da_sala`.

Siga o [guia mantido pelo Alexa Media Player](https://github.com/alandtse/alexa_media_player/wiki/Configuration) para detalhes que variam conforme a versão. É uma integração comunitária que usa uma API não oficial da Amazon; alterações do serviço podem exigir atualização ou nova autenticação.

Se quiser verificar a integração antes do Lume, abra **Ferramentas de desenvolvedor → Ações** no Home Assistant e execute:

```yaml
action: notify.alexa_media
data:
  target:
    - media_player.echo_da_sala
  message: "Olá! Sua Alexa está pronta para ler."
  data:
    type: tts
```

Troque a entidade pela do seu Echo. Veja a [documentação de notificações TTS](https://github.com/alandtse/alexa_media_player/wiki/Configuration:-Notification-Component).

## 3. Crie um token

No **perfil do usuário do Home Assistant**, abra **Segurança** e procure **Tokens de acesso de longa duração**. Crie um token com nome `Lume`. Copie o valor apresentado; não é a senha da Amazon. A posição dessas opções pode variar por versão. Referência: [autenticação da API REST do Home Assistant](https://developers.home-assistant.io/docs/api/rest/).

## 4. Configure pela tela do Lume

1. Abra `http://localhost:8000` e clique em **Conectar Alexa**.
2. Preencha o **endereço do Home Assistant** e cole o **token**.
3. Clique em **1. Conectar e buscar dispositivos**.
4. Escolha o Echo correto. A lista contém todos os `media_player`, incluindo TVs e outros aparelhos; selecione a entidade criada pelo Alexa Media Player.
5. Clique em **2. Salvar configuração**.
6. Clique em **3. Testar voz no Echo**. A Alexa deve receber uma frase de teste.

O Lume verifica a existência da ação `notify.alexa_media` antes de salvar. O token fica no `.env` do projeto e não é enviado de volta para a página. Não compartilhe esse arquivo. Para substituir o token depois, abra a mesma tela e cole o novo valor. Deixar o token vazio mantém o salvo apenas quando o endereço do servidor é o mesmo.

## 5. Leitura automática

Escolha **Alexa** no campo **Onde você quer ouvir?**. Deixe **Leitura contínua** e **Falar automaticamente ao reconhecer** ligadas, clique uma vez em **Ativar câmera** e permita o acesso.

Quando duas capturas consecutivas reconhecerem texto estável, o Lume enviará a fala. Ele evita repetir a mesma frase. A transcrição continua atualizando enquanto uma fala é enviada. Textos longos são divididos com pausas estimadas; a captura seguinte só será falada quando a saída puder recebê-la. Não existe confirmação de áudio terminado vinda do Echo.

Google e voz do navegador também funcionam automaticamente. Navegadores podem exigir um primeiro clique em **Ouvir texto** para liberar áudio. A fala automática não é iniciada em uma página recém-aberta sem interação.

## Se não falar

| Mensagem ou situação | O que verificar |
|---|---|
| Não foi possível conectar | Home Assistant ligado, endereço/porta e acesso pela rede do computador. |
| Token recusado | Crie outro token no perfil e salve no Lume. |
| `notify.alexa_media` não existe | Integração instalada, configurada e reiniciada; teste a ação no Home Assistant. |
| Enviado, mas Echo silencioso | Volume, entidade correta, conectividade, modo Não Perturbe, conta Amazon e logs do Alexa Media Player. “Enviado” confirma aceitação pelo Home Assistant, não que o Echo reproduziu áudio. |
| A fala anterior é interrompida | Leia trechos menores e espere a fala terminar; o tempo de espera é estimado. |
| Voz Google indisponível | Confira internet e use Voz do navegador como alternativa. |
| Texto não é falado de novo | É o controle de repetição. Clique em Ouvir texto para repetir manualmente. |

Parar a câmera interrompe novas capturas. Parar a fala no Lume interrompe áudio do computador; não desfaz texto já entregue ao Echo.

