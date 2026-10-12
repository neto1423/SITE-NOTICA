# Giro 360

Central de notícias estática e instalável, com editorias para Alagoas, Zona da Mata e Brasil. Toque numa matéria para abrir no Giro seu título, mídia e resumo disponível nos feeds ou metadados públicos. O link para a publicação original é opcional; o Giro não republica o texto integral dos portais.

## Hospedagem no GitHub Pages

Envie esta pasta para a branch `main` de um repositório no GitHub. Em **Settings → Pages**, escolha **GitHub Actions** como fonte de publicação. O fluxo em `.github/workflows/pages.yml` busca as notícias e publica o site; após a primeira execução, o endereço GitHub Pages pode ser aberto no celular. HTTPS é obrigatório para instalar o PWA e usar o service worker e as notificações.

No iPhone, abra o endereço no Safari, toque em **Compartilhar → Adicionar à Tela de Início** e abra o ícone instalado. A opção **Ativar** pede a permissão de notificações. O suporte a notificações web no iPhone requer iOS 16.4 ou posterior e o site instalado na Tela de Início.

## Atualização e notificações

O app verifica se há notícias novas a cada minuto enquanto está aberto. Uma GitHub Action busca os feeds do Google Notícias e publica um snapshot atualizado. O agendamento do GitHub Actions tem intervalo mínimo de 5 minutos e pode sofrer atrasos, então os portais não são consultados pelo GitHub exatamente a cada minuto.

Notificações web não permitem que um site estático faça uma busca confiável a cada minuto com o app fechado. No iPhone, para alertas mesmo com o app fechado, é necessário adicionar um servidor que consulte as notícias, mantenha assinaturas Push e envie Web Push. Esta versão avisa sobre novas notícias durante a execução do app.

## Portais acompanhados

Feeds RSS incluem TNH1, Gazetaweb, 7Segundos, G1 Alagoas e G1 Brasil, CNN Brasil, Folha, BBC News Brasil, Agência Brasil, Poder360 e UOL, complementados por buscas do Google Notícias. Cada notícia mantém a atribuição e o link para o portal original; quando o feed da fonte fornece uma imagem, ela aparece no cartão. Vídeos recentes já descobertos também são integrados e podem ser reproduzidos no feed.

Os botões de compartilhamento preparam no WhatsApp o título, o resumo disponível, o link da publicação e o endereço da imagem, quando fornecidos pela fonte. O usuário confirma o envio no WhatsApp; o Giro não envia mensagens automaticamente nem copia o texto integral protegido do portal. A coleta tenta recuperar descrição e imagem dos metadados públicos das páginas dos principais portais, dentro dos limites da atualização.
