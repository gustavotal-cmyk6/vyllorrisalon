import { state, GET, POST, PUT, DEL, esc, money, moneyIn, toCents, modal, toast, fail, confirmBox, submitting, empty, fmtDate, todayStr, periodPicker, mountPeriod, rangeLabel, bars, ic, avatar, pageHead } from '../core.js';
import { openSale, receive } from './checkout.js';
import { refresh } from '../app.js';

const CATS = ['Aluguel', 'Energia', 'Água', 'Internet / telefone', 'Produtos', 'Materiais', 'Salários', 'Impostos', 'Marketing', 'Manutenção', 'Taxas de cartão', 'Outros'];
const ui = { tab: 'summary', period: 'month', cashDate: null };
const TABS = [['summary', 'Resumo'], ['bills', 'Contas a pagar'], ['receivable', 'A receber'], ['cash', 'Entradas e saídas'], ['close', 'Fechar caixa']];

export default async function finance(root, { query }) {
  root.innerHTML = `${pageHead('Financeiro', 'Quanto entrou, quanto saiu e quanto sobrou', `<button class="btn primary" data-new>${ic('plus', 18)} Lançar despesa</button>`)}
    <div class="tabs">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${ui.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${['summary', 'bills', 'cash'].includes(ui.tab) ? periodPicker('per', ui.period) : ''}<div data-body><div class="loading">Carregando…</div></div>`;
  root.querySelector('[data-new]').onclick = () => editExpense();
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => ((ui.tab = b.dataset.tab), refresh())));
  root.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => (ui.period = b.dataset.p)));
  if (query.nova && !ui.opened) (ui.opened = true), editExpense();
  const body = root.querySelector('[data-body]');
  if (ui.tab === 'receivable') return receivable(body);
  if (ui.tab === 'close') return closeCash(body);
  if (ui.tab === 'rec') ui.tab = 'bills';
  mountPeriod(root, 'per', (range) => (ui.tab === 'summary' ? summary(body, range) : ui.tab === 'bills' ? bills(body, range) : cash(body, range)), ui.period === 'custom' ? 'month' : ui.period);
}

async function summary(body, range) {
  const [s, c] = await Promise.all([GET(`/api/finance/summary?from=${range.from}&to=${range.to}`), GET(`/api/finance/cashflow?from=${range.from}&to=${range.to}`)]);
  const balance = c.total_in - c.total_out;
  body.innerHTML = `
  <div class="kpis">
    <div class="kpi"><span>Recebido</span><b class="ok-t">${money(c.total_in)}</b><span class="explain">Dinheiro que entrou de clientes.</span></div>
    <div class="kpi"><span>Despesas pagas</span><b class="err-t">${money(c.total_out)}</b><span class="explain">Contas e comissões que você pagou.</span></div>
    <div class="kpi"><span>Saldo</span><b>${money(balance)}</b><span class="explain">Recebido menos despesas pagas.</span></div>
    <div class="kpi hl"><span>Lucro estimado</span><b>${money(s.profit)}</b><span class="explain">O que sobra das vendas depois de todos os custos.</span></div>
  </div>
  ${s.receivable_total || s.payable_overdue ? `<div class="card"><h2>Pendências</h2>
    ${s.receivable_total ? `<a class="alert warn" href="#" data-goto="receivable"><span class="a-ic">${ic('coin', 18)}</span><span>Clientes ainda vão pagar</span><b>${money(s.receivable_total)}</b></a>` : ''}
    ${s.payable_overdue ? `<a class="alert err" href="#" data-goto="bills"><span class="a-ic">${ic('wallet', 18)}</span><span>${s.payable_overdue_count} conta(s) vencida(s)</span><b>${money(s.payable_overdue)}</b></a>` : ''}</div>` : ''}
  <div class="card"><details class="more" style="margin:0"><summary>${ic('chevDown', 16)} Como o lucro estimado é calculado</summary>
    <table class="t" style="margin-top:10px"><tbody>
      <tr><td>Vendido no período <span class="muted small">(serviços ${money(s.revenue_services)} + produtos ${money(s.revenue_products)})</span></td><td class="num"><b>${money(s.revenue)}</b></td></tr>
      <tr><td>− Custo dos produtos vendidos</td><td class="num err-t">${money(s.product_cost)}</td></tr>
      <tr><td>− Comissões das profissionais</td><td class="num err-t">${money(s.commissions)}</td></tr>
      <tr><td>− Despesas do período</td><td class="num err-t">${money(s.expenses)}</td></tr>
      <tr><td><b>= Lucro estimado</b></td><td class="num"><b class="${s.profit < 0 ? 'err-t' : 'ok-t'}">${money(s.profit)}</b></td></tr></tbody></table>
    <p class="legend">O que foi vendido conta no lucro mesmo que a cliente ainda não tenha pago; no saldo, só entra o que foi recebido.</p></details></div>
  <p class="legend">Gráficos e despesas por categoria em <a href="#/relatorios">Relatórios</a>.</p>`;
  body.querySelectorAll('[data-goto]').forEach((a) => (a.onclick = (e) => (e.preventDefault(), (ui.tab = a.dataset.goto), refresh())));
}

async function bills(body, range) {
  const rows = await GET(`/api/expenses?from=${range.from}&to=${range.to}`);
  const t = todayStr();
  const open = rows.filter((e) => !e.paid_at).reduce((a, e) => a + e.amount_cents, 0);
  body.innerHTML = `<div class="actions" style="justify-content:flex-start;margin:0 0 12px"><button class="btn sm soft" data-fixed>${ic('refresh', 16)} Despesas fixas (todo mês)</button></div>
    <div class="sum-strip" style="margin-bottom:14px"><div><span>Em aberto</span><b class="warn-t">${money(open)}</b></div><div><span>Pagas</span><b class="ok-t">${money(rows.filter((e) => e.paid_at).reduce((a, e) => a + e.amount_cents, 0))}</b></div>
    <div><span>Vencidas</span><b class="err-t">${rows.filter((e) => !e.paid_at && e.due_date < t).length}</b></div></div>
    <div class="card" style="padding:6px 14px">${rows.length ? `<ul class="list">${rows.map((e) => {
    const late = !e.paid_at && e.due_date < t;
    return `<li><span class="avatar sm" style="background:${e.paid_at ? 'var(--ok-soft)' : late ? 'var(--err-soft)' : 'var(--lav-100)'};color:${e.paid_at ? 'var(--ok)' : late ? 'var(--err)' : 'var(--brand)'}">${ic(e.paid_at ? 'check' : 'wallet', 16)}</span>
      <div class="grow"><div class="title">${esc(e.description)} ${e.recurring_id ? '<span class="tag">fixa</span>' : ''} ${late ? '<span class="tag err">vencida</span>' : ''}</div>
      <div class="meta">${esc(e.category || 'Sem categoria')} · vence ${fmtDate(e.due_date)}${e.paid_at ? ` · paga em ${fmtDate(e.paid_at)}${e.method ? ' (' + esc(e.method) + ')' : ''}` : ''}</div></div>
      <b>${money(e.amount_cents)}</b><div class="row-actions">${e.paid_at ? `<button class="btn xs ghost" data-undo="${e.id}">Desfazer</button>` : `<button class="btn xs ok" data-pay="${e.id}">${ic('check', 14)} Pagar</button>`}
      <button class="icon-btn" data-edit="${e.id}" aria-label="Editar ${esc(e.description)}">${ic('edit', 18)}</button></div></li>`;
  }).join('')}</ul>` : empty('Nenhuma conta no período.', `<button class="btn primary sm" data-new2>${ic('plus', 16)} Lançar despesa</button>`, 'wallet')}</div>`;
  body.querySelector('[data-new2]')?.addEventListener('click', () => editExpense());
  body.querySelector('[data-fixed]').onclick = () => modal({ title: 'Despesas fixas', wide: true, body: '<div data-rec></div>', onMount: (el) => recurring(el.querySelector('[data-rec]')) });
  body.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => editExpense(rows.find((r) => r.id === Number(b.dataset.edit)))));
  body.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => payExpense(rows.find((r) => r.id === Number(b.dataset.pay)))));
  body.querySelectorAll('[data-undo]').forEach((b) => (b.onclick = async () => {
    if (await confirmBox('Marcar esta conta como não paga?', { ok: 'Desfazer' })) await POST(`/api/expenses/${b.dataset.undo}/pay`, { undo: true }).then(refresh).catch(fail);
  }));
}

async function receivable(body) {
  const rows = await GET('/api/sales?pending=1');
  const total = rows.reduce((s, r) => s + r.pending_cents, 0);
  body.innerHTML = `<div class="kpis"><div class="kpi hl"><span class="k-ic">${ic('coin', 20)}</span><span>Contas a receber</span><b>${money(total)}</b><small>${rows.length} venda(s) com pagamento pendente</small></div></div>
    <div class="card" style="padding:6px 14px">${rows.length ? `<ul class="list">${rows.map((s) => `<li>${avatar(s.client_name || '?', null, 'sm')}<div class="grow click" data-sale="${s.id}"><div class="title">${esc(s.client_name || '—')}</div>
      <div class="meta">${fmtDate(s.created_at)} · total ${money(s.total_cents)}, pago ${money(s.paid_cents)}</div></div><b class="warn-t">${money(s.pending_cents)}</b>
      <button class="btn xs ok" data-rec="${s.id}">${ic('check', 14)} Receber</button></li>`).join('')}</ul>` : empty('Nenhum valor a receber.', '', 'checkCircle')}</div>`;
  body.querySelectorAll('[data-sale]').forEach((li) => (li.onclick = () => openSale(Number(li.dataset.sale), refresh)));
  body.querySelectorAll('[data-rec]').forEach((b) => (b.onclick = () => receive(rows.find((r) => r.id === Number(b.dataset.rec)), refresh)));
}

/** Fechamento de caixa: confere o dinheiro da gaveta com o que o sistema espera. */
async function closeCash(body) {
  const date = ui.cashDate || todayStr();
  const [d, hist] = await Promise.all([GET(`/api/finance/cash?date=${date}`), GET('/api/finance/cash/history')]);
  body.innerHTML = `<div class="grid g2">
    <div class="card"><div class="card-head"><h2>Caixa do dia</h2><input type="date" value="${date}" max="${todayStr()}" data-date style="width:auto;min-height:40px" aria-label="Dia do caixa"></div>
      ${d.closing ? `<div class="alert ok" style="background:var(--ok-soft);border:0"><span class="a-ic" style="background:#fff;color:var(--ok)">${ic('checkCircle', 18)}</span><span>Caixa fechado por ${esc(d.closing.user_name || '—')} · contado ${money(d.closing.counted_cash_cents)}
        ${d.closing.counted_cash_cents !== d.closing.expected_cash_cents ? ` · <b class="${d.closing.counted_cash_cents < d.closing.expected_cash_cents ? 'err-t' : 'ok-t'}">diferença ${money(d.closing.counted_cash_cents - d.closing.expected_cash_cents)}</b>` : ' · sem diferença'}</span></div>` : ''}
      <h3 style="margin:8px 0">Recebido por forma de pagamento</h3>
      ${d.by_method.length ? `<ul class="list">${d.by_method.map((m) => `<li><span class="avatar sm" style="background:var(--lav-100);color:var(--brand)">${ic(/dinheiro/i.test(m.method) ? 'coin' : /pix/i.test(m.method) ? 'zap' : 'card', 16)}</span><div class="grow"><div class="title">${esc(m.method)}</div><div class="meta">${m.n} pagamento(s)</div></div><b>${money(m.total)}</b></li>`).join('')}</ul>` : empty('Nenhum recebimento neste dia.', '', 'coin')}
      <div class="total-box"><div class="line"><span>Total recebido no dia</span><b>${money(d.total_in)}</b></div>
        <div class="line"><span>Dinheiro recebido</span><span>${money(d.cash_in)}</span></div><div class="line"><span>− Despesas pagas em dinheiro</span><span>${money(d.cash_out)}</span></div>
        <div class="line big"><span>Esperado na gaveta</span><span>${money(d.expected_cash)}</span></div></div>
      <form data-cashform novalidate><label class="field"><span>Dinheiro contado na gaveta (R$)</span><input name="counted" inputmode="decimal" value="${d.closing ? moneyIn(d.closing.counted_cash_cents) : ''}" placeholder="${moneyIn(d.expected_cash)}"></label>
        <label class="field"><span>Observação</span><input name="notes" maxlength="300" value="${esc(d.closing?.notes || '')}" placeholder="Ex.: troco inicial de R$ 100 não incluso"></label>
        <button class="btn primary block">${ic('lock', 18)} ${d.closing ? 'Atualizar fechamento' : 'Fechar caixa do dia'}</button></form></div>
    <div class="card"><h2>Fechamentos anteriores</h2>${hist.length ? `<ul class="list">${hist.map((h) => `<li><span class="avatar sm" style="background:var(--lav-100);color:var(--brand)">${ic('lock', 16)}</span><div class="grow"><div class="title">${fmtDate(h.date)}</div>
      <div class="meta">recebido ${money(h.total_in_cents)} · ${esc(h.user_name || '')}</div></div><div class="right"><b>${money(h.counted_cash_cents)}</b>
      <div class="tiny ${h.counted_cash_cents === h.expected_cash_cents ? 'muted' : h.counted_cash_cents < h.expected_cash_cents ? 'err-t' : 'ok-t'}">${h.counted_cash_cents === h.expected_cash_cents ? 'sem diferença' : `dif. ${money(h.counted_cash_cents - h.expected_cash_cents)}`}</div></div></li>`).join('')}</ul>` : empty('Nenhum caixa fechado ainda.', '', 'lock')}</div></div>`;
  body.querySelector('[data-date]').onchange = (e) => ((ui.cashDate = e.target.value), refresh());
  body.querySelector('[data-cashform]').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    await submitting(f.querySelector('button'), async () => {
      const counted = toCents(f.counted.value);
      if (counted == null || Number.isNaN(counted)) throw new Error('Informe quanto há na gaveta');
      await POST('/api/finance/cash', { date, counted_cash_cents: counted, notes: f.notes.value });
      toast('Caixa fechado');
      refresh();
    }).catch(() => {});
  };
}

function payExpense(e) {
  modal({
    title: `Pagar ${e.description}`,
    body: `<form novalidate><div class="total-box"><div class="line big"><span>Valor</span><span>${money(e.amount_cents)}</span></div></div>
      <div class="row"><label class="field"><span>Pago em</span><input type="date" name="paid_at" value="${todayStr()}"></label>
      <label class="field"><span>Forma</span><select name="method">${state.methods.map((m) => `<option>${esc(m.name)}</option>`).join('')}<option>Boleto</option><option>Transferência</option></select></label></div>
      <div class="actions stretch"><button type="button" class="btn ghost" data-close>Voltar</button><button class="btn ok" type="submit">${ic('check', 18)} Confirmar pagamento</button></div></form>`,
    onMount(el, close) {
      const f = el.querySelector('form');
      f.onsubmit = async (ev) => {
        ev.preventDefault();
        await submitting(f.querySelector('[type=submit]'), async () => {
          await POST(`/api/expenses/${e.id}/pay`, { paid_at: f.paid_at.value, method: f.method.value });
          close();
          toast('Conta paga');
          refresh();
        }).catch(() => {});
      };
    },
  });
}

function editExpense(e = null) {
  modal({
    title: e ? 'Editar despesa' : 'Lançar despesa',
    body: `<form novalidate>
      <label class="field"><span>Descrição *</span><input name="description" maxlength="120" value="${esc(e?.description || '')}" autofocus placeholder="Ex.: Aluguel, conta de luz, fornecedor…"></label>
      <div class="row"><label class="field"><span>Valor (R$) *</span><input name="amount" inputmode="decimal" value="${moneyIn(e?.amount_cents)}"></label>
        <label class="field"><span>Vencimento *</span><input type="date" name="due_date" value="${e?.due_date || todayStr()}"></label></div>
      <label class="field"><span>Categoria</span><input name="category" list="ecats" maxlength="40" value="${esc(e?.category || '')}"><datalist id="ecats">${CATS.map((c) => `<option>${c}</option>`).join('')}</datalist></label>
      ${e ? '' : `<label class="check"><span class="switch"><input type="checkbox" name="paid"><i></i></span> Já está paga</label><label class="field hidden" data-m><span>Forma</span><select name="method">${state.methods.map((m) => `<option>${esc(m.name)}</option>`).join('')}<option>Boleto</option><option>Transferência</option></select></label>
        <label class="check"><span class="switch"><input type="checkbox" name="recurring"><i></i></span> Repetir todo mês (despesa fixa)</label>`}
      <div class="actions stretch">${e && !e.recurring_id ? `<button type="button" class="btn ghost" data-del>${ic('trash', 16)} Excluir</button>` : ''}<button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`,
    onMount(el, close) {
      const f = el.querySelector('form');
      if (f.paid) f.paid.onchange = () => el.querySelector('[data-m]').classList.toggle('hidden', !f.paid.checked);
      el.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!(await confirmBox(`Excluir “${e.description}”?`, { ok: 'Excluir', danger: true }))) return;
        await DEL(`/api/expenses/${e.id}`).then(() => (close(), toast('Despesa excluída'), refresh())).catch(fail);
      });
      f.onsubmit = async (ev) => {
        ev.preventDefault();
        await submitting(f.querySelector('[type=submit]'), async () => {
          const amount = toCents(f.amount.value);
          if (!(amount > 0)) throw new Error('Informe o valor');
          const body = { description: f.description.value, amount_cents: amount, due_date: f.due_date.value, category: f.category.value };
          if (e) await PUT(`/api/expenses/${e.id}`, body);
          else if (f.recurring.checked) {
            await POST('/api/recurring-expenses', { ...body, day_of_month: Number(f.due_date.value.slice(8)) });
            if (f.paid.checked) {
              const list = await GET(`/api/expenses?from=${f.due_date.value}&to=${f.due_date.value}`);
              const gen = list.find((x) => x.recurring_id && x.description === body.description.trim() && !x.paid_at);
              if (gen) await POST(`/api/expenses/${gen.id}/pay`, { method: f.method.value });
            }
          } else await POST('/api/expenses', { ...body, paid: f.paid.checked, method: f.method.value });
          close();
          toast('Despesa salva');
          refresh();
        }).catch(() => {});
      };
    },
  });
}

async function cash(body, range) {
  const c = await GET(`/api/finance/cashflow?from=${range.from}&to=${range.to}`);
  body.innerHTML = `<div class="kpis"><div class="kpi"><span class="k-ic">${ic('trendUp', 20)}</span><span>Entradas</span><b class="ok-t">${money(c.total_in)}</b></div>
    <div class="kpi"><span class="k-ic">${ic('trendDown', 20)}</span><span>Saídas</span><b class="err-t">${money(c.total_out)}</b></div>
    <div class="kpi hl"><span class="k-ic">${ic('wallet', 20)}</span><span>Saldo do período</span><b>${money(c.total_in - c.total_out)}</b></div></div>
    <div class="grid g2"><div class="card"><h2>Por dia</h2>${c.daily.length ? `<div class="scroll-x"><table class="t"><thead><tr><th>Dia</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo acumulado</th></tr></thead><tbody>
      ${c.daily.map((d) => `<tr><td>${fmtDate(d.date)}</td><td class="num ok-t">${money(d.in)}</td><td class="num err-t">${money(d.out)}</td><td class="num"><b>${money(d.balance)}</b></td></tr>`).join('')}</tbody></table></div>` : empty('Sem movimentações.', '', 'wallet')}</div>
    <div class="card"><h2>Histórico de movimentações</h2>${c.moves.length ? `<ul class="list">${c.moves.map((m) => `<li><span class="avatar sm" style="background:${m.dir === 'in' ? 'var(--ok-soft)' : 'var(--err-soft)'};color:${m.dir === 'in' ? 'var(--ok)' : 'var(--err)'}">${ic(m.dir === 'in' ? 'trendUp' : 'trendDown', 16)}</span>
      <div class="grow"><div class="title">${esc(m.description)}</div><div class="meta">${fmtDate(m.date)}${m.method ? ' · ' + esc(m.method) : ''}</div></div>
      <b class="${m.dir === 'in' ? 'ok-t' : 'err-t'}">${m.dir === 'in' ? '+' : '−'} ${money(m.amount)}</b></li>`).join('')}</ul>` : empty('Sem movimentações.', '', 'wallet')}</div></div>
    <p class="legend">${ic('info', 14)} O fluxo de caixa mostra o dinheiro que efetivamente entrou e saiu. Vendas pendentes só entram quando recebidas.</p>`;
}

async function recurring(body) {
  const rows = await GET('/api/recurring-expenses');
  body.innerHTML = `<div class="card"><div class="card-head"><h2>Despesas fixas</h2><button class="btn sm primary" data-new-rec>${ic('plus', 16)} Nova</button></div>${rows.length ? `<ul class="list">${rows.map((r) => `<li>
    <span class="avatar sm" style="background:var(--lav-100);color:var(--brand)">${ic('refresh', 16)}</span>
    <div class="grow"><div class="title">${esc(r.description)} ${r.active ? '' : '<span class="tag">desativada</span>'}</div><div class="meta">${esc(r.category || 'Sem categoria')} · todo dia ${r.day_of_month}</div></div>
    <b>${money(r.amount_cents)}</b><button class="icon-btn" data-edit-rec="${r.id}" aria-label="Editar ${esc(r.description)}">${ic('edit', 18)}</button></li>`).join('')}</ul>`
    : empty('Cadastre aluguel, internet, sistema… e elas aparecem sozinhas em contas a pagar todo mês.', '', 'refresh')}</div>`;
  body.querySelector('[data-new-rec]').onclick = () => editRec();
  body.querySelectorAll('[data-edit-rec]').forEach((b) => (b.onclick = () => editRec(rows.find((r) => r.id === Number(b.dataset.editRec)))));
}

function editRec(r = null) {
  modal({
    title: r ? 'Editar despesa fixa' : 'Nova despesa fixa',
    body: `<form novalidate><label class="field"><span>Descrição *</span><input name="description" maxlength="120" value="${esc(r?.description || '')}" autofocus></label>
      <div class="row"><label class="field"><span>Valor (R$) *</span><input name="amount" inputmode="decimal" value="${moneyIn(r?.amount_cents)}"></label>
      <label class="field"><span>Dia do vencimento</span><input name="day" inputmode="numeric" value="${r?.day_of_month || 10}"></label></div>
      <label class="field"><span>Categoria</span><input name="category" list="ecats2" maxlength="40" value="${esc(r?.category || '')}"><datalist id="ecats2">${CATS.map((c) => `<option>${c}</option>`).join('')}</datalist></label>
      ${r ? `<label class="check"><span class="switch"><input type="checkbox" name="active" ${r.active ? 'checked' : ''}><i></i></span> Ativa (gera a conta todo mês)</label>` : ''}
      <p class="small muted">Alterações valem para os meses que ainda não foram gerados.</p>
      <div class="actions stretch"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`,
    onMount(el, close) {
      const f = el.querySelector('form');
      f.onsubmit = async (ev) => {
        ev.preventDefault();
        await submitting(f.querySelector('[type=submit]'), async () => {
          const body = { description: f.description.value, amount_cents: toCents(f.amount.value), day_of_month: Number(f.day.value), category: f.category.value, active: r ? f.active.checked : true };
          if (!(body.amount_cents > 0)) throw new Error('Informe o valor');
          if (r) await PUT(`/api/recurring-expenses/${r.id}`, body);
          else await POST('/api/recurring-expenses', body);
          close();
          toast('Despesa fixa salva');
          refresh();
        }).catch(() => {});
      };
    },
  });
}
