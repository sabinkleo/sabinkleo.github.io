# Mensuração opcional no verticelabs.me

O código usa o contêiner Web `GTM-MPTCNSL9` nas rotas `/`, `/solucoes/`, `/raio-x-vendas/` e `/tuning/`. O modo básico bloqueia o download do GTM até haver autorização aplicável à página. Não há iframe sem JavaScript. As preferências de estatísticas e publicidade são independentes. A página `/privacy/`, a família `/n1/` e o aviso de privacidade ficam fora da integração.

Por segurança, URLs com parâmetros ou fragmentos ficam fora da mensuração, inclusive visitas com UTMs. A única exceção é o parâmetro numérico de depuração do Tag Assistant. O Meta é limitado à página inicial e a Soluções, sem referência de entrada detalhada.

## Configurar o contêiner antes de publicar

1. Revise as tags da versão publicada e do workspace do contêiner **GTM-MPTCNSL9**. Confira destinos e gatilhos e remova duplicações na configuração proposta. Não use gatilhos automáticos de cliques, formulários, histórico ou All Pages para estas tags.
2. No GA4, obtenha o ID real `G-…` do fluxo Web. No GTM, crie uma única **Google tag** com esse ID. Use o evento personalizado `vl_page_view` como gatilho e exija `analytics_storage` em **Verificações adicionais de consentimento**. Defina `page_location` a partir da variável de camada de dados de mesmo nome e `page_referrer` vazio. Deixe a própria Google tag enviar um `page_view` na inicialização, com disparo uma vez por página. Não crie uma segunda tag para esse evento.
3. Para os demais eventos GA4, use os gatilhos personalizados da tabela e a mesma exigência de consentimento. Defina `page_location` com o valor canônico que permanece na camada de dados. No fluxo GA4, desative a medição otimizada automática e recursos de dados fornecidos pelo usuário. Deixe desativados Google Signals, personalização de anúncios, vinculação entre domínios e envio de dados a destinos publicitários.
4. No Gerenciador de Eventos da Meta, copie o ID real do Pixel. Configure uma tag independente no GTM com o gatilho **somente** `vl_ads_page_view` e a verificação adicional obrigatória de `ad_storage`. Limite a um `PageView` por página. Desative correspondência avançada, eventos automáticos e captura de campos. Não mapeie cliques, conteúdo de formulários ou mensagens para o Pixel. A integração mantém `ad_user_data` e `ad_personalization` do Google negados.
5. Use **Preview** no GTM com uma cópia de teste do código. Teste rejeição, estatísticas isoladas, publicidade isolada, as duas categorias e revogação. Inspecione os pedidos de rede e os payloads usando apenas dados fictícios. Confirme os recebimentos no **DebugView** do GA4 e em **Test Events** da Meta. Valide também as rotas excluídas, URLs com parâmetros e o funcionamento do WhatsApp e das ferramentas.
6. Solicite aprovação para publicar a versão do GTM e para o merge que publica via GitHub Pages. Aceite a categoria correspondente ao testar o domínio depois da publicação. O aviso **No Recent Data** pode continuar enquanto o contêiner não estiver acessível no site, antes do primeiro aceite ou antes que os dados apareçam no painel.

## Eventos do site

| Evento | Campos definidos pelo site além de `event` | Finalidade |
| --- | --- | --- |
| `vl_page_view` | `route`, `page_location` | Uma visualização para GA4 |
| `vl_funnel_navigation` | `route`, `destination` | Navegação para Soluções ou Raio-X |
| `vl_tool_interaction` | `route`, `tool`, `action` | Solicitação de análise ou cópia |
| `vl_contact_intent` | `route`, `channel`, `cta` | Clique de intenção de contato pelo WhatsApp |
| `vl_ads_page_view` | `route` | Gatilho reservado ao Meta Pixel |

Mapeie apenas os campos listados. A intenção de contato é registrada no clique, antes de eventual envio de mensagem.

[Consent Mode básico](https://developers.google.com/tag-platform/security/guides/consent?consentmode=basic) · [Validação no Tag Assistant](https://developers.google.com/tag-platform/security/guides/consent-debugging)
