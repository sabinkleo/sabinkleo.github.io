# Vértice Labs — mensuração de campanhas (configuração pendente)

Status: **código preparado em branch; nenhuma tag de marketing ativada**. Há um ID existente informado pelo proprietário. A versão publicada do contêiner, seus destinos e seus dados precisam de verificação no painel antes de usar esse ID.
Não inserir IDs fictícios. Não fazer merge como "instalado" até testar o contêiner real.

## Arquitetura

- Código: `assets/measurement.js`. Único ponto de entrada para o contêiner Web do Google Tag Manager.
- Escopo: `/`, `/solucoes/`, `/raio-x-vendas/`, `/tuning/`.
- Exclusões: `/privacy/` (compromisso de ausência de scripts externos); N1, módulos de estudos e demais ferramentas também não foram instrumentados.
- Modo de consentimento: **básico**. GTM não é baixado antes do aceite explícito.
- Consent Mode v2: `ad_storage`, `ad_user_data`, `ad_personalization` e `analytics_storage` iniciam negados, passam a concedidos somente após autorização. Rejeitar não carrega scripts. Retirada provoca recarregamento quando necessário.
- Nenhum campo livre, valores de diagnóstico, mensagem, telefone, parâmetros de URL ou identificadores pessoais são passados pelo nosso `dataLayer`.
- A página `/politica-de-privacidade/` descreve a integração. Revisar o aviso e a configuração efetiva das plataformas antes do lançamento.

## Ativar as contas e as tags

1. Em <https://tagmanager.google.com/>, crie contêiner do tipo **Web**, selecione o domínio `verticelabs.me` e copie o ID `GTM-...`.
2. No arquivo `assets/measurement.js`, preencha **apenas** `GTM_ID` com o ID real. Não incluir scripts de GA4, Ads ou Meta diretamente nos HTMLs: todas essas tags ficam no contêiner, para evitar duplicação.
3. Configure uma única Google tag de GA4. Se usar o evento explícito `vl_page_view`, desative o envio automático de `page_view` para evitar duplicação e confirme um evento por visita consentida.
4. No Google Ads, crie conta e ação de conversão apropriada em **Metas > Conversões** (menus podem variar). Implemente pelo GTM o **Vinculador de conversões** e, se for usar envio direto do Google Ads, a tag de conversão com o ID `AW-...` e rótulo obtidos do painel. Não configure como conversões primárias tanto o evento importado do GA4 quanto a mesma conversão via tag direta.
5. No Gerenciador de Eventos da Meta, crie/seleciona um **conjunto de dados/Pixel** e obtenha o ID real. Configure a tag base de Pixel no GTM (script oficial) e eventos de clique mapeados; a tag deve exigir consentimento e **não** disparar antes do aceite. Na Meta, `PageView` e `Contact` podem ser eventos úteis, mas `Contact` é apenas intenção de contato aqui.
6. No GTM, crie gatilhos de **Evento personalizado** conforme a tabela abaixo e tags do GA4 (com os mesmos nomes). Ative Google Ads e Meta somente após verificar que seus eventos não duplicam.
7. Publique a versão revisada do GTM e faça deploy do código apenas quando todos os testes abaixo estiverem aprovados. Não é necessário Google Ads pago para começar a medir com GA4.

## Eventos já emitidos pelo site

| Evento dataLayer | Origem | Interpretação |
| --- | --- | --- |
| `vl_page_view` | Primeira visualização consentida por carregamento de página | Visita, sem qualificação |
| `vl_funnel_navigation` | Links internos para /solucoes/ ou /raio-x-vendas/ | Interesse em oferta |
| `vl_tool_interaction` | Análise manual/cópia nas ferramentas | Engajamento; não é lead |
| `vl_contact_intent` | Clique para abrir WhatsApp | Tentativa de contato; **não** é mensagem enviada, lead qualificado ou venda |

Parâmetros categóricos: `route`, `destination`, `channel`, `cta`, `tool`, `action`. Não mapear número de leads simulados, ticket, margem ou texto livre. Mapeie `vl_page_view` para `page_view` uma só vez no GTM.

**Conversões reais** devem ser registradas após confirmação de mensagem, qualificação e eventual venda em CRM/planilha. Antes de fazer upload de conversões offline ou ativar conversões otimizadas, validar identificadores, consentimento e regras do serviço.

## Matriz de verificação

1. Sem ID GTM: site funciona normalmente; nenhum request para `googletagmanager.com/gtm.js` ou Pixel deve surgir por este módulo.
2. Com ID e consentimento **não decidido**: aparece banner; ainda não há download de GTM/GA4/Meta.
3. Rejeitar: navegar entre páginas; não há download das tags por este módulo. O botão **Privacidade** permite rever.
4. Aceitar: GTM carrega **uma vez**. No <https://tagassistant.google.com/> e no Preview do GTM, conferir consentimento concedido antes das tags e um `page_view` por visita.
5. Clicar em WhatsApp: verificar no Preview `vl_contact_intent` com somente `route`, `channel` e `cta`. Não chamar esse evento de `purchase` ou `generate_lead`.
6. Usar botão Analisar em /tuning/: verificar `vl_tool_interaction`. Digitar ou executar rotina automática não deve emitir evento de lead.
7. Reabrir Privacidade e rejeitar: recarregamento e ausência de novos downloads de tags na visita seguinte.
8. Abrir /privacy/: nenhuma tag do novo módulo, nenhum popup de consentimento. Inspecionar rede no DevTools.
9. GA4: confirmar eventos no **DebugView** e em **Tempo real**. Meta: testar em **Test Events** e **Meta Pixel Helper**. Google Ads: verificar diagnóstico da ação de conversão (propagação pode não ser imediata).
10. Repetir teste em janela privada, mobile e com consentimento persistido.

## Mensuração de resultado e mídia

Antes de R$ 1 em anúncios: página de oferta com `page_view`, evento `vl_contact_intent`, UTMs coerentes, sistema de registro do contato efetivo e teste de atribuição. Uma boa primeira meta é conseguir reconciliar manualmente 100% dos contatos de teste, sem contar cliques como vendas. Caso a Meta ou Google usem `vl_contact_intent` como conversão, configurá-la inicialmente como microconversão/indicador secundário, não como venda.

Google Search Console é separado do GA4 e Google Ads: verificar o domínio em <https://search.google.com/search-console> para monitorar indexação e pesquisa orgânica.

## Referências oficiais

- <https://developers.google.com/tag-platform/security/concepts/consent-mode>
- <https://developers.google.com/tag-platform/security/guides/consent>
- <https://developers.google.com/tag-platform/security/guides/consent-debugging>
- <https://developers.google.com/google-ads/api/docs/conversions/getting-started>

**Pendências que não podem ser resolvidas apenas editando GitHub:** posse das contas GTM, GA4, Google Ads e Meta; IDs oficiais; publicação do contêiner; consentimento/revisão de políticas e testes nos painéis reais.
