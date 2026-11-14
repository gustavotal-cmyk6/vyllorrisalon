# UX_AUDIT_REPORT — Vyllorri Beauty

Auditoria de UX/UI, usabilidade e navegação. Data: 14/11/2026. A análise não alterou código.

> **Status (14/11/2026):** Etapa 1 implementada e publicada: A1 (abas, filtros e períodos sempre visíveis), B5 (contraste e texto mínimo de 12 px), B6 (alvos de toque), C8 (faixas finas), C9 (aviso de notificação em uma linha), C10 (foco visível) e parte de B9 (abas "Meu negócio" e "Formas de pagamento"). Medição depois: 0 textos abaixo de 12 px e 0 falhas de contraste nas 12 telas medidas (antes: 6–13 textos e até 7 falhas por tela). 
>
> **Etapa 2 implementada e publicada (14/11/2026):** B1 (card "Seu link" no Início com Copiar e WhatsApp; some após 3 pedidos online ou ao esconder; "Copiar meu link" no menu "+"; atalho ), B2 (barra inferior: Início · Agenda · **+** central · Clientes · Mais, igual para todos os perfis; o "+" saiu do topo), C2 ("Mais" agrupado em Dia a dia, Gestão e Conta) e C6 (cartão "Atalhos" removido do Início). O restante do plano segue pendente.

## 0. Como esta auditoria foi feita (e o que ela não cobre)

**Feito**
- Leitura do código das telas, do menu e das regras por perfil (`public/js/app.js`, `pages/*.js`, `core.js`, `server/routes/*`).
- App real rodando em `localhost` com o salão de demonstração "Studio Bella" (modo equipe, 3 profissionais, 10 clientes, 7 serviços) e uma conta "Trabalho sozinha".
- 22 telas capturadas no celular (375×812) e 4 no computador (1280×800).
- Medição automática em 14 telas: tamanho de alvos de toque, tamanho de texto, contraste, campos sem rótulo, controles sem nome, rolagem, estouro lateral.
- Percurso real do novo agendamento, cadastro, login, configurações, menu "Mais" e menu "+".

**Não coberto (precisa de teste humano)**
- iPhone/Android reais: comportamento do teclado, zoom, notificações, instalação como app.
- Perfis `manager`, `reception` e `pro` rodando: só foram avaliados pelo código.
- Site no ar com conta real (exige login).
- Velocidade real em 4G.
- Leitor de tela (VoiceOver/TalkBack): só análise de código e de rótulos.

**Limite dos dados**
- A demo tem pouco movimento. Telas cheias (agenda de sábado, 200 clientes) podem revelar outros problemas de lista e rolagem.
- A faixa laranja "Salão de DEMONSTRAÇÃO" (~50 px) aparece só na demo. A faixa "Teste grátis" (~60 px) aparece em contas em teste.

---

## 1. Mapa do aplicativo (Fase 1)

### 1.1 Telas e rotas (SPA com rotas por `#/`)

| Rota | Tela | Quem vê | Subtelas / abas |
|---|---|---|---|
| `#/` | Início | todos | hero, avisos, KPIs, próximos atendimentos, atenção, atalhos |
| `#/agenda` | Agenda | todos | Dia · Semana · Mês; filtros (status, profissional, serviço); bloquear horário |
| `#/clientes` | Clientes | todos | filtros (Todas, Sumidas +60 dias, Aniversariantes, Sem atendimento); ficha com abas Histórico, Serviços, Pagamentos, Agendamentos |
| `#/vendas` | Vendas | dono, gerente, recepção | Vendas · Resumo · A receber + período |
| `#/equipe` | Equipe | dono, gerente (não aparece em "sozinha") | cadastro, horários, comissão |
| `#/servicos` | Serviços | dono, gerente | categorias, preço, duração, disponível online |
| `#/estoque` | Estoque | dono, gerente, recepção (se vende produtos) | Vendidos às clientes · Uso interno · Movimentações |
| `#/financeiro` | Financeiro | dono, gerente | Resumo · Contas a pagar · A receber · Entradas e saídas · Fechar caixa + período |
| `#/comissoes` | Comissões | dono, gerente, profissional | Resumo · Regras · Histórico de pagamentos |
| `#/relatorios` | Relatórios | dono, gerente | Resumo · Vendas · Equipe · Clientes · Despesas + período |
| `#/config` | Configurações | todos (profissional vê só 2 abas) | 8 abas: Salão · Agendamento online · Sinal online (Pix) · Domicílio · Pagamentos no salão · Acessos da equipe · Minha conta · Segurança |
| `#/whatsapp` | WhatsApp automático (Pro) | só dono | conexão, plano |
| `#/assinatura` | Assinatura | só dono | plano, Pix, tabela de planos |
| `#/ajuda` | Ajuda e sugestões | todos | Enviar · Meus envios · Caixa de entrada (admin da plataforma) |
| `#/entrar`, `#/criar`, `#/recuperar`, `#/redefinir` | Acesso | visitante | cadastro em conversa |
| `#/comecar` | Primeiro acesso em conversa | conta nova | 7 perguntas + tela final |
| `/vendas/` | Página de vendas | público | |
| `/agendar/<slug>` | Página de agendamento da cliente | público | 4 etapas |

### 1.2 Menus
- **Celular, barra inferior:** 4 áreas + "Mais".
  - Dono com equipe: Início · Agenda · **Equipe** · Financeiro · Mais.
  - Dono sozinha: Início · Agenda · Clientes · Financeiro · Mais.
  - Recepção: Início · Agenda · Clientes · Vendas.
  - Profissional: Início · Agenda · Clientes · Comissões.
- **Celular, "Mais":** lista plana com até 11 itens (Clientes, Vendas, Serviços, Estoque, Comissões, Relatórios, Configurações, WhatsApp automático, Assinatura, Ajuda, Sair).
- **Celular, topo:** marca (leva ao Início), buscar, avisos, **+** (menu "O que você quer fazer?" com até 9 atalhos).
- **Computador:** barra lateral com 3 grupos (Dia a dia · Gestão · Conta), 14 itens para o dono, mais busca no topo e a etiqueta "Beta · Opinar".

### 1.3 Componentes repetidos
- Cabeçalho roxo de página (`page-head`), com 6 alturas diferentes (78, 98, 120, 134, 154, 189 px).
- Abas em pílula + segunda linha de chips de período (Hoje · Semana · Mês · Mês passado).
- Cartões com listas, modais em folha (bottom sheet), chips de filtro, KPIs.
- Quatro estilos de "botão primário" convivem: branco no cabeçalho roxo, roxo com gradiente, verde "Receber", rosa do "+".

### 1.4 Funções difíceis de descobrir
- **Link de agendamento online** (o maior ativo de captação): fica em Mais → Configurações → aba "Agendamento online". São 4 toques. Não aparece no Início.
- **Fechar caixa** e **Entradas e saídas** (Financeiro): ficam fora da tela, na rolagem lateral das abas.
- **Movimentações** (Estoque), **Histórico de pagamentos** (Comissões), **Despesas** (Relatórios), filtro **Aniversariantes** (Clientes): mesmo problema.
- **Confirmar agendamentos sozinho:** está em Configurações → Agendamento online, longe de onde a dona confirma.
- **Bloquear horário, Encaixe agora:** só pelo menu "+".
- **WhatsApp automático (Pro):** só no menu "Mais".
- **Sinal por Pix e Domicílio:** abas de Configurações, sem aviso no Início.

### 1.5 Redundâncias
- "Novo agendamento" tem 5 portas: hero do Início, menu "+", "Agendar" na Agenda, estado vazio do Início, ficha da cliente.
- "Lançar despesa", "Adicionar serviço" e "Cadastrar profissional" existem no menu "+" e na própria tela.
- O cartão **Atalhos** do Início (Encaixe, Venda, Cliente) repete o menu "+".
- Três abas de Configurações tratam do mesmo assunto, o agendamento online: "Agendamento online", "Sinal online (Pix)" e "Domicílio".
- O preço dos planos aparece dentro de Configurações ("Como você trabalha?") e de novo em Assinatura.
- `public/js/landing.js` (178 linhas) e ~280 linhas de CSS da landing antiga (`.ld*`, `.lx*`, `.au-*`) não são mais usados; a página de vendas real é `/vendas/`.

---

## 2. Auditoria de usabilidade (Fase 2)

| Pergunta | Resposta honesta |
|---|---|
| 1. Usuária nova entende sem treinamento? | O cadastro e o primeiro acesso em conversa guiam bem. Depois do primeiro acesso o app volta ao padrão de painel de gestão, com vocabulário próprio ("Encaixe", "A receber", "Fechar caixa"), e a guia some. |
| 2. O Início é claro? | Parcialmente. Para uma conta nova, o primeiro conteúdo útil (agenda de hoje) começa em ~420 px dos 812, depois de hero, aviso de notificação grande e KPIs. A ordem é "painel de números primeiro, trabalho do dia depois". |
| 3. Acha rápido o que precisa? | O que é diário sim. O que é periódico ou de crescimento (link, sinal, caixa, caixa por profissional) não. |
| 4. Há menus demais? | Sim: 14 destinos para o dono com equipe, mais 8 abas de Configurações e 5 abas no Financeiro. |
| 5. Opções duplicadas? | Sim (ver 1.5). |
| 6. Ações importantes escondidas? | Sim (ver 1.4). |
| 7. Cliques desnecessários? | Link de agendamento: 4. Fechar caixa: Financeiro → rolar as abas → "Fechar caixa": 3, mais a descoberta (a aba está fora da tela). Registrar venda avulsa: 2 toques só para abrir um formulário de ~9 campos. |
| 8. Fluxos mais longos que o necessário? | Novo agendamento: 8–9 toques (o formulário ficou mais claro, o número de toques é parecido). Venda avulsa e despesa: modal longo. |
| 9. Linguagem simples? | Mista. "Perfil do salão", "Pagamentos no salão", "Trabalho sozinha" assumem salão e mulher. O produto atende manicure, maquiadora, lash, estética. Termos como "Encaixe", "Comissão", "A receber", "Entradas e saídas" são de gestão, não de quem atende. |
| 10. Botões claros? | Em geral sim. Exceções: ícone "+" sem texto abre um menu de 9 itens; "Ver" truncado em alertas; abas cortadas. |
| 11. Hierarquia lógica? | Dentro de cada tela sim. Entre telas não: cada página tem altura de cabeçalho e controles diferentes. |
| 12. Carga cognitiva? | Alta no Financeiro, Vendas e Configurações (duas linhas de controles + KPIs + listas). Média no resto. |

---

## 3. Navegação e arquitetura de informação (Fase 3)

### 3.1 Achados
1. **Barra inferior do dono com equipe usa o espaço nobre para "Equipe"**, que é uma tela de cadastro (poucas visitas), e esconde "Clientes" em "Mais". A conta sozinha já tem a ordem certa; a conta com equipe não.
2. **"Mais" é uma grade plana** de 11 tiles sem os grupos que o menu do computador tem (Dia a dia, Gestão, Conta).
3. **Quatro áreas de dinheiro separadas** (Vendas, Financeiro, Comissões, Relatórios) mais "Assinatura": cinco destinos com sobreposição (período, "A receber", totais).
4. **Duas hierarquias de abas empilhadas** em quase toda tela de dinheiro: abas da tela + chips de período. Ocupam ~110 px.
5. **Abas com rolagem lateral sem pista visual** escondem destinos inteiros (ver 1.4).
6. **Configurações** mistura identidade do negócio, modo de trabalho, produtos, agendamento, pagamentos, equipe, conta e segurança em 8 abas. A tela "Salão" tem 2,9 telas de altura.
7. **Voltar:** a ficha da cliente tem link "‹ Clientes" no cabeçalho; as demais telas de detalhe e os modais dependem do botão do sistema ou do "x". Não há trilha de navegação. Não foram testados todos os fluxos.
8. **O "+" e a barra inferior** convivem: o "+" fica no topo, longe do polegar.

### 3.2 Arquitetura proposta (sem remover função)

**Menu principal (computador e celular)**

| Destino | Conteúdo | Origem hoje |
|---|---|---|
| Início | agenda do dia, próximo atendimento, dinheiro de hoje, link de agendamento | Início |
| Agenda | Dia · Semana · Mês, bloqueios | Agenda |
| Clientes | lista, ficha | Clientes |
| **Caixa** (novo agrupamento) | abas: Hoje · Vendas · Contas · Relatórios | Vendas + Financeiro + Relatórios |
| Catálogo | Serviços · Produtos (Estoque) | Serviços + Estoque |
| Equipe (só com equipe) | profissionais, horários, comissões | Equipe + Comissões |
| Configurações | seções (ver 3.3) | Configurações + WhatsApp + Assinatura |
| Ajuda | enviar, meus envios, tutorial | Ajuda |

De 14 destinos para 8. Nada é removido; Vendas, Financeiro, Comissões e Relatórios viram abas de dois grupos.

**Celular, barra inferior (5 posições)**
- Com equipe: Início · Agenda · **+** (centro, grande) · Clientes · Mais.
- Sozinha: Início · Agenda · **+** · Clientes · Caixa.
- Recepção: Início · Agenda · **+** · Clientes · Caixa (vendas).
- Profissional: Início · Agenda · **+** · Clientes · Comissões.
O "+" sai do topo e fica ao alcance do polegar. O topo fica só com marca, buscar e avisos.

**"Mais" agrupado:** Negócio (Catálogo, Equipe), Conta (Configurações, Plano e extras, Ajuda), Sair.

### 3.3 Configurações reorganizadas (seções, não 8 abas)
1. **Meu negócio:** nome, logo, capa, cor, textos, endereço, como trabalha, vende produtos.
2. **Agendamento online:** ligar, link, cancelamento, confirmar sozinho, sinal por Pix, domicílio.
3. **Pagamentos:** formas de pagamento no salão.
4. **Conta:** minha conta, segurança, acessos da equipe, plano, WhatsApp automático.

---

## 4. Experiência no celular (Fase 4)

### 4.1 Medições (14 telas, 375 px)

| Tela | Telas de rolagem | Alvos <40 px | Texto <12 px | Contraste baixo | Início do conteúdo (px) |
|---|---|---|---|---|---|
| Início | 1,9 | 5 | 10 | 0 | 419 |
| Agenda | 1,4 | 11 | 13 | 0 | 440 |
| Clientes | 1,6 | 25 | 6 | 0 | 317 |
| Vendas | 3,3 | 6 | 8 | 0 | 406 |
| Equipe | 1,2 | 1 | 9 | 3 | 260 |
| Serviços | 1,5 | 5 | 13 | 7 | n/d |
| Estoque | 1,2 | 7 | 6 | 0 | 515 |
| Financeiro | 1,3 | 8 | 6 | 1 | 386 |
| Comissões | 1,3 | 9 | 6 | 3 | 350 |
| Relatórios | 1,6 | 6 | 6 | 0 | n/d |
| Configurações | 2,9 | 5 | 10 | 0 | 409 |
| WhatsApp | 1,2 | 1 | 7 | 0 | n/d |
| Assinatura | 1,1 | 1 | 6 | 0 | n/d |
| Ajuda | 2,0 | 7 | 6 | 0 | 290 |

Valores incluem a faixa de demonstração (~50 px). A contagem de alvos pequenos inclui a marca do topo (217×38), presente em todas as telas.

### 4.2 Resultados
- **Sem estouro lateral** em nenhuma tela; **todos os campos** têm rótulo ou `aria-label`; **uma** `h1` por tela; **todos os campos de formulário têm 16 px**, então o iOS não dá zoom ao focar.
- **Espaço vertical:** a área de conteúdo começa entre 260 e 515 px (32% a 63% da altura do celular). Compõem: faixa de demo/teste (50–60) + topo (59) + cabeçalho roxo (78–189) + abas + chips + avisos.
- **Alvos de toque:** abas e chips têm 36–38 px; "Ver agenda" 36; estrelas de avaliação 30; botões do topo 40. O guia da Apple recomenda 44 px; o do Android, 48 dp.
- **Texto pequeno:** rótulos de 10–11,8 px (etiqueta "VYLLORRI BEAUTY", itens da barra inferior 11,2, atalhos 11,8, dias da semana 11,2). Para quem tem 40+ anos ou usa o celular sob luz forte, isso cansa.
- **Contraste:** 3,6 a 3,84 :1 em etiquetas pequenas ("agendamento online", "Atende hoje"); 4,37 :1 em "Pagar". O mínimo é 4,5 :1 para texto até 18 px.
- **Alcance com uma mão:** o botão principal de criar fica no canto superior direito. A barra inferior é boa, mas as ações de maior frequência ("+ Novo") ficam longe do polegar.
- **Teclado e salto de layout:** o cadastro e o passo a passo em conversa reservam altura e não pulam. O formulário completo de agendamento e o de venda não foram testados com teclado real.
- **Modais:** folhas que sobem de baixo, com cantos arredondados e rolagem interna. Funcionam; o modal de venda tem ~9 campos e exige rolagem.
- **Carregamento:** texto "Carregando…" com roda. Sem esqueleto de tela. Cada troca de rota apaga a página.
- **Estados vazios:** existem, com texto e botão ("Nenhum atendimento marcado para hoje. Agendar"). Bons; faltam explicar o benefício.
- **Desempenho:** 24 arquivos JS/CSS na primeira carga, ~432 KB descompactados. O `app.css` tem 133 KB num arquivo só, com ~280 linhas de landing antiga. Os módulos são carregados sob demanda em sequência. O servidor roda em `iad1` (EUA) com banco Turso distante, ~0,35 s de ida e volta (medição registrada anteriormente).

---

## 5. Auditoria visual (Fase 5)

- **Tipografia:** serifada (Playfair) para marca e títulos, sans (Plus Jakarta) no resto. Combinação coerente. Problema é a escala: há muitos tamanhos entre 10 e 12 px e poucos entre 13 e 15.
- **Cor:** roxo escuro, lilás e rosa. O roxo em gradiente aparece no cabeçalho de **toda** página, nos KPIs principais, nos botões primários e na barra lateral. Quando tudo é roxo intenso, nada se destaca. O verde (Receber/OK) e o laranja (alertas) funcionam como acentos.
- **Hierarquia:** o cabeçalho roxo grande de cada página repete título + subtítulo + botão, ocupa de 78 a 189 px e compete com o conteúdo. A informação mais útil (números, lista) vem depois.
- **Consistência:** cinco larguras e estilos de abas e chips; botões primários em cores diferentes por contexto; raios de borda variados.
- **Cartões:** bons separadores, boa legibilidade; excesso de cartões com borda + sombra + fundo colorido ao mesmo tempo.
- **Ícones:** coerentes (traço fino). Alguns tiles do "+" e do "Mais" usam ícones iguais para coisas diferentes (`sparkle` para Equipe e Cadastrar profissional).
- **Desktop:** a barra lateral tem 14 itens + usuário e, em 800 px de altura, o bloco do usuário fica cortado. O pill "Beta · Opinar" é rosa claro sobre lilás claro, quase invisível.
- **Genérico:** a estrutura de painel (cartão de KPI, lista, botão roxo) é a de qualquer SaaS. O que dá identidade hoje é o Vyllo, a tipografia serifada e o lilás. O resto é intercambiável.
- **Faixa de demonstração:** laranja saturado de duas linhas no topo, a coisa mais chamativa da tela.

---

## 6. Fluxos principais (Fase 6)

Contagem em toques, celular, dono com equipe, partindo do Início.

| Fluxo | Passos hoje | Toques | Dificuldades | Oportunidade |
|---|---|---|---|---|
| Novo agendamento (cliente existente) | Novo agendamento → digitar nome + tocar → serviço + Continuar → com quem → dia/horário → Agendar | 8–9 | Cliente por digitação; "com quem" repete em contas de 1 profissional (já oculto em "sozinha") | Sugerir últimas clientes; horário mais cedo em destaque; "repetir último serviço" |
| Novo agendamento a partir de um horário livre da Agenda | tocar "Livre" → mesmo fluxo | 6–7 | Já chega com dia, hora e profissional | Ir direto ao passo de serviço |
| Receber depois do atendimento | tocar cartão → Receber → forma de pagamento → Finalizar | 3–4 | O modal de venda tem muitos campos para quem só quer registrar o valor do serviço | Modo "Receber rápido": só valor e forma de pagamento |
| Venda avulsa | + → Registrar venda → ~9 campos → Salvar | 3 + preenchimento | Formulário longo: cliente, itens, quem vendeu, desconto, data, pagamento | Dividir em "valor e forma" e "mais opções" |
| Cadastrar cliente | + → Cadastrar cliente → nome + telefone → Salvar | 4 | OK | — |
| Lançar despesa | + → Lançar despesa → formulário | 3 + preenchimento | OK | Despesas fixas já existem; sugerir recorrência |
| Confirmar agendamento online | Início (aviso) → Agenda → cartão → Confirmar | 3–4 | Aviso leva à Agenda inteira | Confirmar no próprio aviso ou card do Início |
| Copiar o link de agendamento | Mais → Configurações → aba Agendamento online → Copiar | 4 | Escondido | Card no Início com "Copiar" e "Enviar" |
| Ver quanto faturou no mês | Financeiro (barra inferior) → Resumo (já em "Mês") | 1 | OK | — |
| Fechar o caixa do dia | Financeiro → rolar abas → Fechar caixa | 3 + descoberta | Aba escondida | Aba visível ou card no Início no fim do dia |
| Ligar o sinal por Pix | Mais → Configurações → Sinal online (Pix) → chave + % | 4 + formulário | Longe de onde nasce o problema (faltas) | Sugestão no Início depois de uma falta |
| Conferir comprovante de sinal | Início (aviso) → Agenda ?sinais → cartão → ficha → aprovar | 4–5 | Aviso fala "comprovante", destino é a Agenda | Atalho direto à ficha |
| Ativar notificações | Início → "Ativar" → permissão | 2 | Cartão grande fixo no Início | Faixa fina e descartável |
| Cadastro e primeiro acesso | `#/criar` (5 perguntas) → `#/comecar` (7 perguntas) → painel | ~14 | Longo, porém guiado e com barra de progresso | Manter |

---

## 7. Acessibilidade e inclusão (Fase 7)

| Item | Situação | Evidência |
|---|---|---|
| Contraste | Falha em etiquetas pequenas e no "Beta · Opinar" no desktop | 3,6–3,84 :1 em 11,5 px |
| Tamanho de fonte | Muitos textos 10–11,8 px | 10 a 13 elementos por tela |
| Alvos de toque | 36–38 px em abas e chips; 30 px em estrelas | medição |
| Rótulos de campo | Bom | 0 campos sem rótulo em 14 telas |
| Nome de botões/links | Bom | 0 controles sem nome |
| Foco visível | Frágil | `:focus-visible` aparece 6 vezes no CSS e `outline: none` 6 vezes; sem estilo global de foco |
| Modais | `role="dialog"` e `aria-modal` presentes; **sem** `aria-labelledby`, **sem** armadilha de foco, **sem** devolver foco ao botão que abriu | `modal()` em `core.js` |
| Teclado | Esc fecha modais; cartões da agenda têm `role="button" tabindex="0"`. Abas com rolagem não anunciam o estado | código |
| Leitor de tela | `aria-live` nos avisos e na conversa; sem anúncio de mudança de rota | código |
| Mensagens de erro | Claras e em português; na maioria vão para "toast" que some sozinho | `toast()` |
| Movimento | `prefers-reduced-motion` tratado em 2 lugares; animações novas respeitam | CSS |
| Idioma | `lang="pt-BR"` | `index.html` |

---

## 8. Pensamento de produto (Fase 8)

**Redução de esforço**
- Para quem atende sozinha, o app já tirou "Chegou" e "Iniciar". Falta o fechamento do dia: "N atendimentos de hoje para receber" como lista de um toque, para registrar tudo à noite.
- Marcar sozinha como atendido: o atendimento passa a "atendido" quando o horário termina, e a dona só confirma o valor se mudou.
- Repetir o último agendamento de uma cliente (clientes de beleza repetem o mesmo serviço a cada 15–30 dias).
- Lembrete automático para clientes "Sumidas +60 dias" já existe como filtro; falta o botão "chamar no WhatsApp" em lote ou individual no próprio filtro.

**Pontos de abandono prováveis**
1. Fim do período de teste: a barra "Teste grátis: faltam N dias · Assinar" fica fixa no topo de todas as telas e ocupa ~60 px.
2. Cartão de notificações grande no Início para uma conta nova: parece obrigatório.
3. Primeira semana sem nenhum agendamento: o painel mostra zeros e "Nenhum atendimento"; o link de divulgação não está à vista.
4. Configurar sinal por Pix e domicílio sem ajuda no momento da necessidade.

**Não adicionar**
- Mais telas de relatório, gráficos ou metas.
- Mais abas: todo o ganho vem de agrupar o que existe.

---

## 9. Relatório priorizado (Fase 9)

Complexidade: Baixa (horas), Média (1–2 dias), Alta (vários dias).

### A. Problemas críticos

**A1. Abas com rolagem lateral escondem destinos inteiros**
- **Tela:** Financeiro, Estoque, Comissões, Relatórios, Clientes (filtros), Configurações (já em grade).
- **Problema atual:** "Entradas e saídas" e "Fechar caixa" (Financeiro) ficam fora da tela; "Movimentações" (Estoque), "Histórico de pagamentos" (Comissões), "Despesas" (Relatórios) e o filtro "Aniversariantes" (Clientes) aparecem cortados. Não há seta, degradê nem contador.
- **Por que é problema:** a pessoa não sabe que existem. Funções de rotina (caixa do dia) viram "não existe no app".
- **Solução:** (1) abas em grade de 2 linhas quando passam de 3 (como já é em Configurações) ou (2) seletor único com nome da aba atual ("Financeiro: Resumo ⌄"), ou (3) no mínimo degradê e seta nas bordas. Preferência: (1) para até 6 abas; (2) acima disso.
- **Benefício:** descoberta de Fechar caixa, Despesas e Movimentações sem treinamento.
- **Complexidade:** Baixa. **Prioridade:** Crítica.

**A2. Mistura de arquivos velhos e novos após cada publicação**
- **Tela:** app inteiro (já ocorreu hoje: `Importing binding name 'nextStep' is not found`).
- **Problema atual:** os módulos JS são importados por nomes fixos. Com cache do navegador/CDN, um arquivo velho convive com um novo e a tela quebra. Corrigido hoje com cabeçalho `must-revalidate` e auto-reparo em `boot.js`.
- **Por que é problema:** a falha é intermitente, afeta justamente quem usa o app no dia da publicação, e o usuário vê um erro técnico em inglês.
- **Solução:** manter o auto-reparo; acrescentar uma versão de publicação (hash) nos endereços dos módulos ou num mapa de importação; e a lista `FILES` do `boot.js` gerada automaticamente no build.
- **Benefício:** publicar sem derrubar ninguém.
- **Complexidade:** Média. **Prioridade:** Crítica (risco mitigado, não eliminado).

**A3. O cromo da tela consome 32–63% da altura do celular antes do conteúdo**
- **Tela:** todas.
- **Problema atual:** faixa de teste/demo (50–60) + topo (59) + cabeçalho roxo (78–189) + abas + chips de período + cartão de aviso. Conteúdo começa entre 260 e 515 px. Em Agenda, 440; em Estoque, 515.
- **Por que é problema:** a pessoa só vê o conteúdo útil depois de rolar, em todas as telas, o dia inteiro. Em tela pequena, é a causa nº 1 de "painel pesado".
- **Solução:** (1) cabeçalho de página compacto de uma linha (título + 1 ação) com altura fixa de ~56 px; (2) mover o título para o topo fixo; (3) período como um único controle (menu) no lugar de 4 chips; (4) faixa de teste só no Início e no menu "Plano", ou fina (28 px) e descartável; (5) avisos e cartões informativos viram faixas finas.
- **Benefício:** ganha ~150–250 px de conteúdo útil por tela; menos rolagem.
- **Complexidade:** Média. **Prioridade:** Crítica.

### B. Alta prioridade

**B1. Link de agendamento online enterrado**
- **Tela:** Início; Configurações → Agendamento online.
- **Problema atual:** 4 toques para copiar o link. Não aparece no Início depois do cadastro.
- **Por que:** é o motor de captação do produto e a razão de pagar a assinatura. Sem divulgar, a conta não gera valor.
- **Solução:** cartão fixo no Início, "Seu link de agendamento" com Copiar, Enviar no WhatsApp e Abrir. Some depois do 3º agendamento online. O mesmo link no menu "+".
- **Benefício:** mais contas ativadas na primeira semana.
- **Complexidade:** Baixa. **Prioridade:** Alta.

**B2. Barra inferior do dono com equipe**
- **Tela:** navegação inferior.
- **Problema atual:** Início · Agenda · Equipe · Financeiro · Mais. "Clientes" (uso diário) está em "Mais"; "Equipe" (cadastro) ocupa o lugar.
- **Por que:** a barra deve servir ao uso diário. Contas sozinha e com equipe têm lógicas diferentes sem motivo.
- **Solução:** Início · Agenda · **+** · Clientes · Caixa (ou Mais). Equipe vai para "Mais" e para dentro de Catálogo/Equipe.
- **Benefício:** menos toques nas tarefas diárias.
- **Complexidade:** Baixa. **Prioridade:** Alta.

**B3. Início: ordem do conteúdo**
- **Tela:** Início.
- **Problema atual:** hero → cartão de notificação grande → "Atendimentos hoje" → Recebido → Vendido no mês → Próximos atendimentos → Atenção → Atalhos. Para conta nova, a agenda do dia aparece abaixo da dobra.
- **Por que:** o Início deve responder "o que eu faço agora?" antes de "como estou no mês?".
- **Solução:** hero compacto → **próximo atendimento** (ação em 1 toque) → agenda de hoje em lista → "Dinheiro de hoje" em uma faixa de 3 números → link de agendamento (B1) → atenção (máx. 3) → notificação como faixa fina de 40 px. Retirar "Atalhos" (duplicam o "+").
- **Benefício:** utilidade imediata ao abrir; menos rolagem.
- **Complexidade:** Média. **Prioridade:** Alta.

**B4. Fusão de áreas de dinheiro**
- **Tela:** Vendas, Financeiro, Comissões, Relatórios.
- **Problema atual:** 4 destinos com abas próprias e períodos repetidos, e "A receber" existe em Vendas e em Financeiro.
- **Por que:** a dona pergunta "como está meu dinheiro?" e precisa decidir em qual dos quatro olhar.
- **Solução:** uma área **Caixa** com abas Hoje · Vendas · Contas a pagar/receber · Relatórios; Comissões vai para Equipe (com equipe). Um só seletor de período. Sem remover nenhuma função.
- **Benefício:** menos menus e menos confusão.
- **Complexidade:** Alta. **Prioridade:** Alta.

**B5. Contraste e tamanho mínimo de texto**
- **Tela:** etiquetas (tags), rótulos da barra inferior, atalhos, "Beta · Opinar", marca do topo.
- **Problema atual:** textos de 10–11,8 px; 3,6–3,84 :1 em etiquetas; "Pagar" 4,37 :1.
- **Por que:** ilegível ao sol ou com vista cansada; reprova WCAG AA.
- **Solução:** mínimo 12 px para etiquetas e 13 px para rótulos; escurecer etiquetas até ≥4,5 :1; "Beta · Opinar" com contraste real.
- **Benefício:** leitura mais confortável para todos.
- **Complexidade:** Baixa. **Prioridade:** Alta.

**B6. Alvos de toque abaixo de 44 px**
- **Tela:** chips, abas, "Ver agenda", estrelas, botões de ícone.
- **Problema atual:** 36–38 px (chips e abas), 30 px (estrelas).
- **Por que:** erro de toque, principalmente com unhas grandes e uma mão só.
- **Solução:** altura mínima 44 px nos controles tocáveis; área de toque maior sem aumentar o visual (padding invisível).
- **Benefício:** menos toques errados.
- **Complexidade:** Baixa. **Prioridade:** Alta.

**B7. Modais sem gestão de foco e sem nome acessível**
- **Tela:** todos os modais (`modal()` em `core.js`).
- **Problema atual:** sem `aria-labelledby`, sem armadilha de foco, foco não volta ao botão que abriu, rolagem do fundo bloqueada só por classe.
- **Por que:** usuário de teclado e de leitor de tela perde o contexto.
- **Solução:** ligar título ao diálogo, prender e devolver o foco, `inert` no fundo.
- **Benefício:** acessibilidade e menos erro.
- **Complexidade:** Baixa a Média. **Prioridade:** Alta.

**B8. Fechamento do dia para quem atende sozinha**
- **Tela:** Início, Agenda.
- **Problema atual:** sem Chegou/Iniciar, o recebimento fica só dentro da ficha. Falta um jeito de fechar o dia de uma vez.
- **Por que:** sem registro, o financeiro fica vazio e a dona perde o controle.
- **Solução:** cartão "Hoje faltam receber N atendimentos" com lista e um toque por item (valor e forma de pagamento sugeridos).
- **Benefício:** financeiro certo sem apertar nada durante o atendimento.
- **Complexidade:** Média. **Prioridade:** Alta.

**B9. Vocabulário que assume salão e mulher**
- **Tela:** Configurações ("Perfil do salão", "Pagamentos no salão", "Trabalho sozinha"), Estoque, avisos.
- **Problema atual:** o produto serve manicure, maquiador, lash, estética e salão, e o texto fala só de "salão" e no feminino.
- **Por que:** quem atende em casa ou sozinho se sente fora do público.
- **Solução:** "negócio" no lugar de "salão" nos textos do app; "Trabalho sozinha/o" ou "Só eu atendo" (já usado no cadastro e na página de vendas). A decisão de manter o feminino no app foi do dono; sugerir só os pontos onde "salão" é incorreto.
- **Benefício:** mais pertencimento e menos ruído.
- **Complexidade:** Baixa. **Prioridade:** Alta (mas depende do dono).

### C. Média prioridade

**C1. Configurações em seções, não em 8 abas**
- **Tela:** Configurações.
- **Problema atual:** 8 abas, três delas sobre agendamento online. "Salão" tem 2,9 telas.
- **Por que:** a dona procura por tarefa ("quero cobrar sinal"), não por categoria técnica.
- **Solução:** 4 seções (ver 3.3) e busca dentro de Configurações.
- **Benefício:** menos tentativa e erro.
- **Complexidade:** Média. **Prioridade:** Média.

**C2. "Mais" agrupado**
- **Tela:** menu "Mais".
- **Problema:** 11 tiles sem grupos.
- **Solução:** grupos Negócio, Dinheiro, Conta, como no menu do computador.
- **Complexidade:** Baixa. **Prioridade:** Média.

**C3. Registro de venda em duas camadas**
- **Tela:** Registrar venda.
- **Problema:** ~9 campos no primeiro nível.
- **Solução:** primeiro nível com valor, forma de pagamento e cliente; "Mais opções" abre desconto, produto, quem vendeu, data.
- **Benefício:** venda em 3 toques.
- **Complexidade:** Média. **Prioridade:** Média.

**C4. Cabeçalhos de página uniformes**
- **Tela:** todas.
- **Problema:** 6 alturas de cabeçalho e 4 estilos de botão primário.
- **Solução:** um único componente de cabeçalho e um único botão primário.
- **Complexidade:** Média. **Prioridade:** Média.

**C5. Estados de carregamento e de erro**
- **Tela:** troca de rota.
- **Problema:** página apagada com "Carregando…"; erro genérico com "Tentar novamente".
- **Solução:** esqueleto de tela (blocos cinza), manter a tela anterior até a nova chegar, mensagens de erro em português com o que fazer.
- **Complexidade:** Média. **Prioridade:** Média.

**C6. Remover duplicidades de entrada**
- **Tela:** Início (Atalhos), "+", telas de cadastro.
- **Problema:** 5 portas para novo agendamento; atalhos repetidos.
- **Solução:** manter 1 botão principal por tela, o "+" central e remover o cartão "Atalhos".
- **Complexidade:** Baixa. **Prioridade:** Média.

**C7. Peso do app**
- **Problema:** 133 KB de CSS com ~280 linhas mortas da landing antiga; 24 requisições; `landing.js` sem uso.
- **Solução:** apagar o que não é usado; dividir o CSS em núcleo e por tela; pré-carregar só o essencial.
- **Benefício:** abertura mais rápida em 4G.
- **Complexidade:** Média. **Prioridade:** Média.

**C8. Faixas permanentes (teste grátis e demo)**
- **Problema:** 50–60 px fixos em todas as telas.
- **Solução:** teste: faixa fina só no Início e no menu "Plano"; demo: etiqueta pequena no topo.
- **Complexidade:** Baixa. **Prioridade:** Média.

**C9. Cartão "Ative as notificações"**
- **Problema:** ocupa ~170 px do Início como se fosse obrigatório.
- **Solução:** faixa fina com "Ativar" e "Depois", e guia do passo a passo só ao tocar.
- **Complexidade:** Baixa. **Prioridade:** Média.

**C10. Foco visível padrão**
- **Problema:** foco removido em 6 regras sem substituto global.
- **Solução:** estilo `:focus-visible` único (anel lilás 3 px).
- **Complexidade:** Baixa. **Prioridade:** Média.

### D. Opcionais

- **D1.** Pesquisa global (`gsearch`) também no celular como tela cheia (hoje há botão).
- **D2.** "Repetir último agendamento" na ficha da cliente.
- **D3.** Modo escuro do painel (hoje só a página da cliente é escura).
- **D4.** Sugerir sinal por Pix no Início depois de uma falta.
- **D5.** Instalação como app com tela de abertura e ícone adaptável (já há manifesto).
- **D6.** Desktop: reduzir a barra lateral a 8 itens (ver 3.2) e fixar o bloco do usuário.

---

## 10. Estrutura ideal proposta (Fase 10)

### 10.1 Menu e navegação

```
COMPUTADOR (barra lateral)            CELULAR (barra inferior)
─────────────────────────             ───────────────────────────────
 + Novo                                Início  Agenda  [ + ]  Clientes  Caixa/Mais
 Início
 Agenda
 Clientes
 Caixa   ─ Hoje · Vendas · Contas · Relatórios
 Catálogo ─ Serviços · Produtos
 Equipe  ─ Profissionais · Comissões   (só com equipe)
 Configurações
 Ajuda
```

### 10.2 Hierarquia do Início (celular)

```
┌─────────────────────────────┐
│ Studio Bella      🔍  🔔     │  topo fixo (marca + 2 ícones)
├─────────────────────────────┤
│ Boa tarde, Bella!    ▢Vyllo │  hero de uma linha
├─────────────────────────────┤
│ PRÓXIMO  14:00 · Ana        │  1 cartão, 1 ação
│ Spa dos pés   [Confirmar]   │  (sozinha: Confirmar; equipe: Chegou)
├─────────────────────────────┤
│ Hoje: 5 atend. · R$ 480     │  faixa de números
├─────────────────────────────┤
│ Seu link: …/agendar/studio  │  Copiar · WhatsApp · Abrir
├─────────────────────────────┤
│ Atenção (3) ›               │  agrupada
├─────────────────────────────┤
│ 🔔 Ativar avisos     [Ativar]│  faixa fina
└─────────────────────────────┘
 Início  Agenda  [+]  Clientes  Caixa
```

### 10.3 Posição das ações
- **Ação de criar:** botão central "+" na barra inferior (alcance do polegar), com Novo agendamento em primeiro lugar.
- **Ação da tela:** 1 botão primário por tela, sempre na mesma posição (canto direito do cabeçalho compacto).
- **Ações do cartão:** no próprio cartão, no máximo 1 por status.

### 10.4 Exemplo de simplificação concreta
Hoje, para ver o caixa: Financeiro → rolar abas → Fechar caixa (descoberta incerta). Depois: Caixa → aba "Hoje" com "Fechar caixa" como botão no fim do dia.

---

## 11. Avaliação final do produto (Fase 11)

### 11.1 Avaliação geral
O produto cobre o ciclo completo de agenda, cliente, venda e financeiro, com cadastro e primeiro acesso em conversa bem resolvidos e uma página de agendamento pública. A distância entre "tem a função" e "a dona acha a função" é o principal problema. A interface é correta e consistente em padrões de SaaS, mas pesada no celular, com muito cromo antes do conteúdo e com menu e abas demais para quem trabalha sozinha ou com 1–3 profissionais. Não há problemas graves de funcionamento nas telas medidas; há problemas de descoberta, densidade, acessibilidade e manutenção de versões.

### 11.2 As 10 melhorias mais importantes
1. Abas visíveis (A1).
2. Cabeçalho compacto e período único (A3).
3. Card do link de agendamento no Início (B1).
4. Barra inferior com "+" central e Clientes (B2).
5. Início reordenado: próximo atendimento primeiro (B3).
6. Contraste e texto mínimo (B5) e alvos de 44 px (B6).
7. Fechamento do dia para quem atende sozinha (B8).
8. Versão nos módulos e auto-reparo automático (A2).
9. Caixa unificado (B4).
10. Configurações em 4 seções (C1).

### 11.3 Maiores problemas de usabilidade
- Funções de rotina escondidas em abas fora da tela.
- O conteúdo começa tarde em todas as telas.
- Muitos destinos, e dois jeitos de organizar dinheiro.
- O recurso mais valioso para divulgar está a 4 toques.

### 11.4 O que NÃO deve ser mudado
- **Cadastro e primeiro acesso em conversa com o Vyllo:** medido com validações, "editar" e barra de progresso; mexer quebra o ganho de ativação.
- **Filtro de menu por perfil e modo "sozinha":** esconde Equipe e Comissões de quem não usa.
- **Campos com 16 px** e rótulos em todos os campos: evitam zoom no iOS e erros de leitor de tela.
- **Folhas de baixo (bottom sheet) para ações rápidas** e os estados vazios com botão.
- **Identidade lilás/roxo, tipografia serifada e Vyllo:** são o diferencial visual.
- **Novo agendamento em passos** e **"Prefiro o formulário completo"** como saída.
- **Auto-reparo do `boot.js`** e cabeçalho `must-revalidate` para JS/CSS.

### 11.5 O que simplificar
Início (ordem e quantidade de cartões), cabeçalhos de página, controles duplos de abas + período, formulário de venda, faixas fixas de teste/demonstração.

### 11.6 O que reorganizar
Barra inferior, "Mais", Configurações em seções, áreas de dinheiro em Caixa, Comissões dentro de Equipe.

### 11.7 O que remover só se for realmente redundante
- `landing.js` e o CSS `.ld*`, `.lx*`, `.au-*` depois de confirmar que a rota `#/` só redireciona para `/vendas/`.
- Cartão "Atalhos" do Início, se o "+" central entrar.
- Preço dos planos dentro de Configurações (manter só em Assinatura).
Nada mais deve sair.

### 11.8 Ordem de implementação recomendada

| Etapa | Itens | Esforço | Risco |
|---|---|---|---|
| 1. Correções rápidas e seguras | A1, B5, B6, C10, C8, C9, B9 (textos) | 1–2 dias | Baixo |
| 2. Descoberta e acesso | B1, B2, C2, C6 | 1–2 dias | Baixo a médio (muda hábito de quem já usa) |
| 3. Conteúdo no topo | A3, C4, B3 | 3–4 dias | Médio (toca em todas as telas) |
| 4. Fluxos | B8, C3, B7 | 3–4 dias | Médio |
| 5. Estrutura | B4, C1 | 5+ dias | Alto (mexe em rotas e menus; exige teste com contas reais) |
| 6. Robustez e peso | A2 (versão nos módulos), C7, C5 | 2–3 dias | Médio |

### 11.9 Complexidade e risco geral
- **Complexidade total:** Média a Alta, concentrada na etapa 5.
- **Risco principal:** mudar nomes e posições de menu para quem já usa. Mitigar: manter os mesmos endereços (`#/vendas`, `#/financeiro`) funcionando como atalhos para as novas abas.
- **Risco técnico:** regressões visuais nas ~14 telas que compartilham o cabeçalho e as abas; mitigar com as capturas e a medição automática desta auditoria como linha de base.

---

## Apêndice A — Evidência
- Capturas: celular (22 telas) e computador (4 telas) geradas durante a auditoria. Medidas por script no navegador: alvos de toque, texto, contraste aproximado (só onde o fundo é cor lisa), rótulos, rolagem.
- Dados de peso: 24 arquivos JS/CSS, ~432 KB descompactados; maiores: `css/app.css` 133 KB, `pages/settings.js` 35 KB, `pages/visits.js` 32 KB, `pages/finance.js` 22 KB.

## Apêndice B — Lacunas para a próxima rodada
- Teste com 3 pessoas reais (manicure, maquiadora e dona de salão) fazendo 5 tarefas: marcar, receber, divulgar o link, fechar o caixa, ligar o sinal.
- Teste no iPhone e em Android baratos.
- Rodar a mesma medição com os perfis recepção e profissional.
