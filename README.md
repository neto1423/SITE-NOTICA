# GIRO 360

PWA de notícias com feeds RSS dos portais TNH1, GazetaWeb, Alagoas 24 Horas,
7Segundos e CadaMinuto (Alagoas), g1, CNN Brasil, Agência Brasil, UOL,
Folha de S.Paulo, BBC News Brasil e Poder360. O servidor consulta as fontes a cada minuto;
o aplicativo também atualiza a lista nesse intervalo enquanto está aberto.
Na aba Todas, as notícias são ordenadas pela data real de publicação (até 600
itens mais recentes dos feeds); publicações sem data válida não recebem um
horário artificial e não são apresentadas como notícias recém-publicadas.
Os portais aparecem como perfis. Os cartões mostram imagem, título, portal e
horário; ao tocar, o leitor exibe o conteúdo textual fornecido pelo RSS, quando
disponível, e ações para guardar ou compartilhar.
Para as imagens, o app prioriza a foto incorporada no conteúdo da matéria do
RSS e usa a miniatura genérica do feed apenas como alternativa.

O app não extrai nem republica matérias completas dos sites. Ele apresenta o
conteúdo disponibilizado no RSS (priorizando o campo de conteúdo integral quando
a própria fonte o publica) e mantém o link da fonte para quem quiser ler a
matéria integral. Se o RSS não tiver texto, ao abrir a notícia o servidor
consulta somente a descrição pública (Open Graph/Twitter/meta description) da
página do portal, limitada a 600 caracteres; não copia o corpo da matéria. O app
não republica matérias completas protegidas;
sites sem um RSS/Atom público ou API licenciada não podem ser monitorados
automaticamente. Atualizações dependem da frequência de consulta e da publicação
da própria fonte, portanto não há garantia de tempo real. Quando o RSS contém
apenas título e imagem, o leitor informa essa limitação. Para vídeos, o servidor
verifica até três matérias de cada portal por minuto e extrai players e vídeos
listados em metadados públicos estruturados, além de players oficiais publicados
nas páginas. A aba Vídeos reúne os vídeos descobertos em uma playlist de player
único, que se adapta à orientação vertical ou horizontal e permite avançar ou
voltar pelas setas ou por gesto na lateral do player. Os controles de reprodução
são os do player oficial incorporado. Vídeos do g1 não são listados porque o
player oficial bloqueia a incorporação no GIRO 360; eles podem ser assistidos na
página original do portal.
Feeds RSS públicos de canais do YouTube, incluindo Shorts quando publicados pelo
canal, podem ser adicionados com o formato
`https://www.youtube.com/feeds/videos.xml?channel_id=ID_DO_CANAL`; o app usa o
player oficial incorporado do YouTube. Páginas sem vídeo são verificadas
novamente após seis horas. O app não usa serviços de download, não baixa vídeos
e não contorna bloqueios; a reprodução depende das regras do portal e do
dispositivo.
O GIRO 360 inclui atalhos do Instagram e TikTok vinculados pelos próprios sites
de TNH1, GazetaWeb, Alagoas 24 Horas, CadaMinuto, CNN Brasil, Folha de S.Paulo e
Poder360. Esses perfis são links locais; não ativam monitoramento nem
notificações dessas redes. Coleta automatizada exige integração oficial e
autorização compatível com as plataformas.
Na tela Portais, sites e endereços RSS podem ser cadastrados em lote, separando
os valores por vírgula, ponto e vírgula ou quebra de linha. O cadastro fica no
servidor, que consulta os feeds RSS a cada minuto e envia notificações para
novas notícias quando o Web Push está ativado. Ao receber o endereço de um site,
o servidor procura links RSS/Atom na página e testa caminhos RSS comuns; se não
encontrar um feed acessível, informa o erro em vez de marcar a fonte como ativa.
Perfis do Instagram e TikTok ficam como atalhos locais e não são monitorados:
isso exige integração oficial e autorização compatível com as plataformas.
Use sites com HTTPS e feeds RSS públicos.

## Executar

Instale o Node.js e execute:

```sh
npm install
npm start
```

No Windows PowerShell, se a política bloquear `npm.ps1`, inicie com `node server.js`.
Abra `http://localhost:8000`; não abra `index.html` diretamente como arquivo,
pois a interface precisa da API do servidor para carregar as notícias reais.
A primeira inicialização gera e guarda as chaves
VAPID e as assinaturas Web Push na pasta `data/`, que não deve ser publicada ou
versionada.

## Publicar no GitHub Pages

O GitHub Pages não executa Node.js. O workflow
`.github/workflows/deploy-pages.yml` contorna essa limitação: em cada envio para
`main`/`master` e a cada 15 minutos, o GitHub Actions instala as dependências,
consulta os feeds públicos usando o servidor Node durante a compilação, gera
`news-data.json` e publica a interface e as notícias como arquivos estáticos.
O navegador carrega esse snapshot quando a API Node não está disponível.

Para ativar:

1. Envie estes arquivos para o repositório GitHub, incluindo o workflow.
2. No GitHub, abra **Settings → Pages** e selecione **GitHub Actions** como
   origem de publicação.
3. Abra **Actions**, execute **Atualizar notícias e publicar no GitHub Pages**
   manualmente uma vez e aguarde o workflow terminar.
4. Acesse o endereço publicado em **Settings → Pages**. O workflow também será
   executado automaticamente em atualizações do código e, normalmente, a cada
   15 minutos. O GitHub pode atrasar execuções agendadas.

No modo GitHub Pages as notícias são um snapshot periódico, não uma transmissão
em tempo real. Cadastro de feeds personalizados no servidor, prévias obtidas
diretamente nas páginas dos portais, varredura de vídeos em segundo plano e
notificações Web Push exigem um serviço Node permanentemente ativo; esses
recursos não são fornecidos pelo Pages. Links e fontes sociais salvos
localmente continuam no navegador. Para esses recursos avançados, o projeto
mantém `render.yaml` como uma opção de hospedagem Node. Nunca publique segredos
nem a pasta `data/` no GitHub.

## Instalar e ativar alertas no iPhone

1. Publique o app em uma hospedagem HTTPS com Node.js, mantendo a pasta `data/`
   em armazenamento persistente. Notificações push não funcionam em HTTP comum.
2. No iPhone (iOS/iPadOS 16.4 ou posterior), abra o endereço no Safari, toque em
   **Compartilhar → Adicionar à Tela de Início** e abra o ícone instalado.
3. Toque no sino do GIRO 360 e depois em **Ativar notificações**. O mesmo botão
   desativa os alertas e remove a assinatura do servidor.

O servidor precisa permanecer em execução para consultar os RSS e enviar
notificações push. Fontes RSS podem atrasar ou não publicar imagens/vídeos; o
aplicativo mostra somente a mídia entregue pela própria fonte. A aba Zona da Mata
seleciona notícias cujo título ou resumo menciona municípios da região.
