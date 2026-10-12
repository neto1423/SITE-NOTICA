# Giro 360

Central de notícias estática e instalável, com editorias para Alagoas, Zona da Mata e Brasil. Toque numa matéria para abrir no Giro seu título, mídia e resumo disponível nos feeds ou metadados públicos. O link para a publicação original é opcional; o Giro não republica o texto integral dos portais.

## Hospedagem no GitHub Pages

Em **Settings → Pages**, escolha **GitHub Actions** como fonte de publicação. Além da publicação normal do Pages, este repositório precisa conter `.github/workflows/pages.yml` e `scripts/refresh-news.mjs`: esse workflow coleta os feeds, gera e valida `data/latest-news.json` e publica o site com o JSON. Ele é executado ao enviar alterações à branch padrão, a cada 5 minutos e manualmente em **Actions → Atualizar notícias e publicar → Run workflow**.

**Diagnóstico importante:** se a aba Actions mostrar somente `pages-build-deployment`, o Pages está publicando os arquivos do site, mas o workflow que coleta as notícias ainda não foi enviado ao repositório. `pages-build-deployment` não gera o feed. Confirme que `.github/workflows/pages.yml` e `scripts/refresh-news.mjs` aparecem na branch padrão e que a execução **Atualizar notícias e publicar** termina com sucesso. Depois, `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/data/latest-news.json` deve exibir o JSON de notícias, não retornar 404. HTTPS é obrigatório para instalar o PWA e usar o service worker e as notificações.

O endereço dos dados é resolvido a partir do caminho de `app.js`, para funcionar tanto em domínios próprios quanto em repositórios publicados em subdiretórios do GitHub Pages.

No iPhone, abra o endereço no Safari, toque em **Compartilhar → Adicionar à Tela de Início** e abra o ícone instalado. A opção **Ativar** pede a permissão de notificações. O suporte a notificações web no iPhone requer iOS 16.4 ou posterior e o site instalado na Tela de Início.

## Atualização e notificações

O app verifica se há notícias novas a cada minuto enquanto está aberto. Uma GitHub Action busca os feeds do Google Notícias e publica um snapshot atualizado. O agendamento do GitHub Actions tem intervalo mínimo de 5 minutos e pode sofrer atrasos, então os portais não são consultados pelo GitHub exatamente a cada minuto.

Notificações web não permitem que um site estático faça uma busca confiável a cada minuto com o app fechado. No iPhone, para alertas mesmo com o app fechado, é necessário adicionar um servidor que consulte as notícias, mantenha assinaturas Push e envie Web Push. Esta versão avisa sobre novas notícias durante a execução do app.

## Portais acompanhados

Feeds RSS incluem TNH1, Gazetaweb, 7Segundos, G1 Alagoas e G1 Brasil, CNN Brasil, Folha, BBC News Brasil, Agência Brasil, Poder360 e UOL, complementados por buscas do Google Notícias. Cada notícia mantém a atribuição e o link para o portal original; quando o feed da fonte fornece uma imagem, ela aparece no cartão. Vídeos recentes já descobertos também são integrados e podem ser reproduzidos no feed.

Os botões de compartilhamento preparam no WhatsApp o título, o resumo disponível, o link da publicação e o endereço da imagem, quando fornecidos pela fonte. O usuário confirma o envio no WhatsApp; o Giro não envia mensagens automaticamente nem copia o texto integral protegido do portal. A coleta tenta recuperar descrição e imagem dos metadados públicos das páginas dos principais portais, dentro dos limites da atualização.
