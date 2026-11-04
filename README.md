# Vyllorri Beauty

Gestão simples para salões de beleza: agenda, vendas, clientes, equipe e comissões, estoque e financeiro.

## Como rodar

Requer **Node.js 22.13+** (usa o SQLite embutido do Node — não há dependências para instalar).

```bash
npm start            # http://localhost:3000
npm test             # teste de integração da API (usa banco temporário)
npm run demo         # cria um salão de DEMONSTRAÇÃO (servidor precisa estar rodando)
```

Variáveis de ambiente:

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` | 3000 | Porta HTTP |
| `DATA_DIR` | `./data` | Pasta do banco SQLite (`vyllorri.db`) — faça backup dela |
| `TZ` | `America/Sao_Paulo` | Fuso horário do salão |
| `SECURE_COOKIES` | — | `1` para forçar cookie `Secure` (atrás de HTTPS) |
| `ALLOW_SIGNUP` | — | `0` para bloquear o cadastro de novos salões |

## Estrutura

- `server/` — API HTTP (Node puro), `db.js` (esquema), `auth.js` (sessões, senhas scrypt), `routes/*` por área.
- `public/` — interface (SPA em JavaScript puro, mobile-first).
- `scripts/test.js` — 13 cenários ponta a ponta (conflitos, checkout, comissões, estorno, financeiro, permissões, isolamento entre salões).

## Regras de negócio importantes

- **Faturamento** = vendas concluídas e não estornadas (valor líquido, com desconto). Agendamentos cancelados/faltas nunca entram.
- **Recebido** = pagamentos efetivos (aceita pagamento dividido e valor pendente para receber depois).
- **Lucro estimado** = faturamento − custo dos produtos vendidos − comissões geradas − despesas do período.
- **Desconto** é rateado entre os itens, separando corretamente receita de serviços e de produtos.
- **Comissão**: regra da profissional no serviço → regra do serviço → padrão da profissional (% ou valor fixo); produtos têm % própria. Cada comissão só pode ser paga uma vez; vendas com comissão paga não podem ser estornadas.
- **Estoque**: produtos de venda e materiais de uso interno são separados; materiais internos não podem ser vendidos.
- **Perfis**: proprietária (tudo), recepção (sem financeiro/comissões/relatórios), profissional (só a própria agenda e comissões).
