# Vyllorri Beauty

Gestão simples e elegante para salões de beleza: agenda (dia, semana e mês), vendas, clientes, equipe com fotos, comissões, estoque, financeiro com fechamento de caixa, relatórios e página pública de agendamento online.

## Como rodar

Requer **Node.js 20+**. Rode `npm install` uma vez. Localmente o banco é um arquivo SQLite; em produção usa Turso (libSQL na nuvem).

```bash
npm start            # http://localhost:3000
npm test             # teste de integração da API (usa banco temporário)
npm run demo         # cria um salão de DEMONSTRAÇÃO (servidor precisa estar rodando)
```

Variáveis de ambiente:

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` | 3000 | Porta HTTP |
| `DATA_DIR` | `./data` | Pasta do banco SQLite local (`vyllorri.db`) |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | — | Banco em nuvem (obrigatório na Vercel) |
| `TZ` | `America/Sao_Paulo` | Fuso horário do salão |
| `SECURE_COOKIES` | — | `1` para forçar cookie `Secure` (atrás de HTTPS) |
| `ALLOW_SIGNUP` | — | `0` para bloquear o cadastro de novos salões |

## Agendamento online

Cada salão tem uma página pública em `/agendar/<endereço>`, com capa, logo, fotos do espaço, equipe, endereço e WhatsApp (configurados em **Configurações → Perfil do salão**). A cliente agenda em 6 passos sem cadastro e recebe um link para consultar ou cancelar a reserva (respeitando a antecedência mínima definida pelo salão). Ative em **Configurações → Agendamento online** e marque os serviços como “Disponível para agendamento online”. Os pedidos entram na agenda como *Agendado* (etiqueta **online**) e aparecem no painel para confirmação.

## Deploy na Vercel

1. Importe o repositório na Vercel (framework: *Other*).
2. Crie um banco Turso (Vercel → Storage → Turso, ou turso.tech) e defina `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` no projeto.
3. As tabelas são criadas automaticamente na primeira requisição.

## Estrutura

- `api/index.js` — entrada da função serverless da Vercel.
- `server/` — API HTTP (Node puro), `db.js` (esquema), `auth.js` (sessões, senhas scrypt), `routes/*` por área.
- `public/` — interface (SPA em JavaScript puro, mobile-first).
- `scripts/test.js` — 16 cenários ponta a ponta (conflitos, checkout, comissões, estorno, financeiro, permissões, isolamento entre salões).

## Regras de negócio importantes

- **Faturamento** = vendas concluídas e não estornadas (valor líquido, com desconto). Agendamentos cancelados/faltas nunca entram.
- **Recebido** = pagamentos efetivos (aceita pagamento dividido e valor pendente para receber depois).
- **Lucro estimado** = faturamento − custo dos produtos vendidos − comissões geradas − despesas do período.
- **Desconto** é rateado entre os itens, separando corretamente receita de serviços e de produtos.
- **Comissão**: regra da profissional no serviço → regra do serviço → padrão da profissional (% ou valor fixo); produtos têm % própria. Cada comissão só pode ser paga uma vez; vendas com comissão paga não podem ser estornadas.
- **Estoque**: produtos de venda e materiais de uso interno são separados; materiais internos não podem ser vendidos.
- **Perfis**: proprietária (tudo), gerente (tudo exceto configurações e acessos), recepção (sem financeiro/comissões/relatórios), profissional (só a própria agenda e comissões).
- **Fotos** ficam no banco (tabela `images`), reduzidas no aparelho antes do envio, e são servidas por identificador aleatório.
- **Fechamento de caixa**: compara o dinheiro esperado na gaveta (recebido em dinheiro − despesas pagas em dinheiro) com o valor contado.
