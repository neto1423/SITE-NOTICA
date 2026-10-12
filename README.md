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

## Cards para Instagram

Na navegação **Criar card**, pesquise e selecione uma notícia para compor uma arte PNG no formato Feed (1080 × 1350) ou Stories (1080 × 1920). O modelo editorial padrão usa foto em tela cheia, degradê escuro, título em fonte Manrope com destaque colorido e resumo em DM Sans; é possível mudar a cor de destaque. Cada notícia tem a ação **Criar card**, e a matéria aberta oferece **Criar card com esta notícia**; ambas abrem o estúdio com a notícia selecionada e o layout salvo. Ao tocar em uma notificação, o service worker abre o Giro com a notícia selecionada no leitor interno, sem navegar para o portal externo. A Action prepara cópias locais de até 30 fotos recentes para que possam ser incluídas no PNG sem as restrições CORS de alguns portais; as outras imagens também podem ser substituídas por uma foto enviada pelo usuário. Envie a logo e até oito elementos decorativos (PNG, JPEG ou WebP); arraste as camadas na prévia e use as setas ou os botões de ordem para escolher o que aparece por cima ou por baixo. Título, resumo, foto, selo do portal, logo, assinatura e elementos enviados podem ser reposicionados. Use **Salvar meu layout** para guardar no navegador/aparelho o modelo, os elementos e sua ordem, e **Baixar imagem PNG** para salvar e publicar manualmente no Instagram. A foto personalizada substitui a imagem apenas no card atual. Layout e imagens são armazenados localmente, não sincronizados entre aparelhos. O site não publica automaticamente nem acessa a conta do Instagram.

## Portais acompanhados

O coletor combina RSS direto de TNH1, **Gazetaweb (Alagoas)**, 7Segundos, G1, CNN Brasil, Folha, BBC News Brasil, Agência Brasil, Poder360, UOL, O Globo, Estadão, Metrópoles, InfoMoney e Terra com buscas do Google Notícias em veículos de Alagoas e do Brasil. As buscas estaduais incluem CadaMinuto, Alagoas 24 Horas, Tribuna Hoje, Já é Notícia, Aqui Acontece, AlagoasWeb, Correio dos Municípios, Minuto Arapiraca e outros; as buscas nacionais incluem R7, Valor Econômico, Jovem Pan, SBT News, Nexo, Brasil de Fato e Agência Pública. Assim, o Giro cobre os principais portais que disponibilizam feeds ou são indexados pela busca, sem depender de um feed RSS próprio de cada site. Cada notícia mantém atribuição e link para a fonte; fotos e vídeos aparecem quando fornecidos.

Os botões de compartilhamento preparam no WhatsApp o título, o resumo disponível, o link da publicação e o endereço da imagem, quando fornecidos pela fonte. O usuário confirma o envio no WhatsApp; o Giro não envia mensagens automaticamente nem copia o texto integral protegido do portal. A coleta tenta recuperar descrição e imagem dos metadados públicos das páginas dos principais portais, dentro dos limites da atualização.
