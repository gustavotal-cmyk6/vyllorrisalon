import { GET, esc, money, pct, periodPicker, mountPeriod, rangeLabel, fmtDate, fmtPhone, waLink, empty } from '../core.js';

/** Respostas diretas às perguntas do dia a dia da gestão. */
export default async function reports(root) {
  root.innerHTML = `<div class="page-head"><div><h1>Relatórios</h1><div class="sub">As respostas que a dona do salão precisa, sem planilha</div></div></div>
    ${periodPicker('per')}<div data-body><div class="loading">Carregando…</div></div>`;
  mountPeriod(root, 'per', async (range) => {
    const body = root.querySelector('[data-body]');
    const r = await GET(`/api/reports/management?from=${range.from}&to=${range.to}`);
    const s = r.sales, f = r.finance;
    const ch = (v) => (v == null ? '<small>sem base de comparação</small>' : `<small class="${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${pct(v)} vs. ${rangeLabel(r.previous)}</small>`);
    const Q = (q, a, sub = '') => `<div class="q"><span>${q}</span><b>${a}</b>${sub}</div>`;
    body.innerHTML = `<div class="qa">
      ${Q('Qual foi o faturamento?', money(s.revenue), ch(r.change.revenue))}
      ${Q('Qual serviço mais vendeu?', r.top_service ? esc(r.top_service.name) : '—', r.top_service ? `<small>${r.top_service.qty} atendimento(s) · ${money(r.top_service.total)}</small>` : '')}
      ${Q('Qual produto mais vendeu?', r.top_product ? esc(r.top_product.name) : '—', r.top_product ? `<small>${String(r.top_product.qty).replace('.', ',')} un. · ${money(r.top_product.total)}</small>` : '')}
      ${Q('Qual profissional gerou mais receita?', r.top_pro ? esc(r.top_pro.name) : '—', r.top_pro ? `<small>${money(r.top_pro.total)}</small>` : '')}
      ${Q('Quanto paguei de comissão?', money(f.commissions_paid), `<small>geradas no período: ${money(f.commissions)}</small>`)}
      ${Q('Quanto gastei?', money(f.expenses), `${ch(r.change.expenses)}<br><small>pagas ${money(f.expenses_paid)} · em aberto ${money(f.expenses_open)}</small>`)}
      ${Q('Qual foi meu lucro estimado?', `<span class="${f.profit < 0 ? 'err-t' : 'ok-t'}">${money(f.profit)}</span>`, ch(r.change.profit))}
      ${Q('Qual foi meu ticket médio?', money(s.ticket_avg), ch(r.change.ticket))}
      ${Q('Quantas clientes novas chegaram?', r.new_clients, '<small>cadastradas no período</small>')}
      ${Q(`Quantas clientes não retornaram?`, r.lost_clients, `<small>sem visita há mais de ${r.inactive_days} dias</small>`)}
      ${Q('Quanto recebi de fato?', money(f.received), `<small>a receber hoje: ${money(f.receivable_total)}</small>`)}
      ${Q('Cancelamentos e faltas', `${r.visits.cancelled} · ${r.visits.no_show}`, `<small>de ${r.visits.total} agendamento(s)</small>`)}
    </div>
    <div class="card"><h2>Como o lucro estimado é calculado</h2><table class="t"><tbody>
      <tr><td>Faturamento (serviços ${money(f.revenue_services)} + produtos ${money(f.revenue_products)})</td><td class="num">${money(f.revenue)}</td></tr>
      <tr><td>− Custo dos produtos vendidos</td><td class="num err-t">${money(f.product_cost)}</td></tr>
      <tr><td>− Comissões geradas</td><td class="num err-t">${money(f.commissions)}</td></tr>
      <tr><td>− Despesas com vencimento no período</td><td class="num err-t">${money(f.expenses)}</td></tr>
      <tr><td><b>= Lucro estimado</b></td><td class="num"><b>${money(f.profit)}</b></td></tr></tbody></table>
      <p class="legend">Estimativa por competência. Faturamento não é lucro, e recebimento não é faturamento: vendas pendentes contam no faturamento, mas só entram no caixa quando pagas.</p></div>
    <div class="card"><h2>Clientes para reconquistar <small class="muted">sem visita há +${r.inactive_days} dias, por valor gasto</small></h2>
      ${r.lost_list.length ? `<ul class="list">${r.lost_list.map((c) => `<li><a class="grow" href="#/clientes/${c.id}" style="color:inherit"><div class="title">${esc(c.name)}</div>
        <div class="meta">última visita ${fmtDate(c.last_visit)} · ${c.visits} visita(s) · ${money(c.spent)}</div></a>
        ${waLink(c.phone) ? `<a class="btn sm" target="_blank" rel="noopener" href="${waLink(c.phone, `Olá, ${c.name.split(' ')[0]}! Sentimos sua falta por aqui 💕 Que tal agendar um horário?`)}">💬 Chamar</a>` : `<span class="muted small">${fmtPhone(c.phone)}</span>`}</li>`).join('')}</ul>` : empty('Nenhuma cliente sumida. 👏')}</div>`;
  });
}
