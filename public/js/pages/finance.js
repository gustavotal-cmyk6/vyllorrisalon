import { state, GET, POST, PUT, DEL, esc, money, moneyIn, toCents, modal, toast, fail, confirmBox, submitting, empty, fmtDate, todayStr, periodPicker, mountPeriod, rangeLabel, bars } from '../core.js';
import { refresh } from '../app.js';

const CATS = ['Aluguel', 'Energia', 'Água', 'Internet / telefone', 'Produtos', 'Materiais', 'Salários', 'Impostos', 'Marketing', 'Manutenção', 'Taxas de cartão', 'Outros'];
const ui = { tab: 'bills', period: 'month' };

export default async function finance(root, { query }) {
  root.innerHTML = `<div class="page-head"><div><h1>Financeiro</h1><div class="sub">Faturamento, recebimentos, despesas e lucro estimado — cada um no seu lugar</div></div>
    <button class="btn primary" data-new>＋ Lançar despesa</button></div>
    ${periodPicker('per', ui.period)}<div data-sum></div>
    <div class="tabs"><button data-tab="bills" class="${ui.tab === 'bills' ? 'on' : ''}">Contas a pagar</button><button data-tab="cash" class="${ui.tab === 'cash' ? 'on' : ''}">Fluxo de caixa</button><button data-tab="rec" class="${ui.tab === 'rec' ? 'on' : ''}">Despesas fixas (recorrentes)</button></div>
    <div data-body></div>`;
  root.querySelector('[data-new]').onclick = () => editExpense();
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => ((ui.tab = b.dataset.tab), refresh())));
  root.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => (ui.period = b.dataset.p)));
  if (query.nova && !ui.opened) (ui.opened = true), editExpense();
  mountPeriod(root, 'per', async (range) => {
    const [s, body] = [await GET(`/api/finance/summary?from=${range.from}&to=${range.to}`), root.querySelector('[data-body]')];
    root.querySelector('[data-sum]').innerHTML = summary(s, range);
    if (ui.tab === 'bills') bills(body, range);
    if (ui.tab === 'cash') cash(body, range);
    if (ui.tab === 'rec') recurring(body);
  }, ui.period === 'custom' ? 'month' : ui.period);
}

function summary(s, range) {
  return `<div class="kpis">
    <div class="kpi"><span>Faturamento</span><b>${money(s.revenue)}</b><small>serviços ${money(s.revenue_services)} · produtos ${money(s.revenue_products)}</small></div>
    <div class="kpi"><span>Recebido (entrou no caixa)</span><b>${money(s.received)}</b><small>pagamentos no período</small></div>
    <div class="kpi"><span>Despesas do período</span><b>${money(s.expenses)}</b><small>pagas ${money(s.expenses_paid)} · em aberto ${money(s.expenses_open)}</small></div>
    <div class="kpi"><span>Comissões geradas</span><b>${money(s.commissions)}</b><small>pagas no período ${money(s.commissions_paid)}</small></div>
    <div class="kpi"><span>Custo dos produtos vendidos</span><b>${money(s.product_cost)}</b></div>
    <div class="kpi hl"><span>Lucro estimado</span><b>${money(s.profit)}</b><small>faturamento − custos − comissões − despesas</small></div>
    <div class="kpi"><span>A receber de clientes</span><b>${money(s.receivable_total)}</b><small><a href="#/vendas?pendentes=1">ver pendências</a></small></div>
    <div class="kpi"><span>Contas vencidas</span><b class="${s.payable_overdue ? 'err-t' : ''}">${money(s.payable_overdue)}</b><small>${s.payable_overdue_count} conta(s)</small></div>
  </div>
  ${s.expenses_by_category.length ? `<div class="card"><h2>Despesas por categoria <small class="muted">${rangeLabel(range)}</small></h2>${bars(s.expenses_by_category, { label: (x) => x.category })}</div>` : ''}`;
}

async function bills(body, range) {
  const rows = await GET(`/api/expenses?from=${range.from}&to=${range.to}`);
  const t = todayStr();
  body.innerHTML = `<div class="card">${rows.length ? `<ul class="list">${rows.map((e) => {
    const late = !e.paid_at && e.due_date < t;
    return `<li><div class="grow"><div class="title">${esc(e.description)} ${e.recurring_id ? '<span class="tag">fixa</span>' : ''} ${e.paid_at ? '<span class="tag ok">paga</span>' : late ? '<span class="tag err">vencida</span>' : ''}</div>
      <div class="meta">${esc(e.category || 'Sem categoria')} · vence ${fmtDate(e.due_date)}${e.paid_at ? ` · paga em ${fmtDate(e.paid_at)}${e.method ? ' (' + esc(e.method) + ')' : ''}` : ''}</div></div>
      <b>${money(e.amount_cents)}</b><div class="row-actions">${e.paid_at ? `<button class="btn sm ghost" data-undo="${e.id}">Desfazer</button>` : `<button class="btn sm ok" data-pay="${e.id}">Pagar</button>`}
      <button class="btn sm ghost" data-edit="${e.id}">Editar</button></div></li>`;
  }).join('')}</ul>` : empty('Nenhuma despesa no período.')}</div>`;
  body.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => editExpense(rows.find((r) => r.id === Number(b.dataset.edit)))));
  body.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => payExpense(rows.find((r) => r.id === Number(b.dataset.pay)))));
  body.querySelectorAll('[data-undo]').forEach((b) => (b.onclick = async () => {
    if (await confirmBox('Marcar esta conta como não paga?', { ok: 'Desfazer' })) await POST(`/api/expenses/${b.dataset.undo}/pay`, { undo: true }).then(refresh).catch(fail);
  }));
}

function payExpense(e) {
  modal({
    title: `Pagar ${e.description}`,
    body: `<form novalidate><p>Valor: <b>${money(e.amount_cents)}</b></p>
      <div class="row"><label class="field"><span>Pago em</span><input type="date" name="paid_at" value="${todayStr()}"></label>
      <label class="field"><span>Forma</span><select name="method">${state.methods.map((m) => `<option>${esc(m.name)}</option>`).join('')}<option>Boleto</option><option>Transferência</option></select></label></div>
      <div class="actions stretch"><button type="button" class="btn ghost" data-close>Voltar</button><button class="btn ok" type="submit">Confirmar pagamento</button></div></form>`,
    onMount(el, close) {
      const f = el.querySelector('form');
      f.onsubmit = async (ev) => {
        ev.preventDefault();
        await submitting(f.querySelector('[type=submit]'), async () => {
          await POST(`/api/expenses/${e.id}/pay`, { paid_at: f.paid_at.value, method: f.method.value });
          close();
          toast('Conta paga ✓');
          refresh();
        }).catch(() => {});
      };
    },
  });
}

function editExpense(e = null) {
  modal({
    title: e ? 'Editar despesa' : 'Nova despesa',
    body: `<form novalidate>
      <label class="field"><span>Descrição *</span><input name="description" maxlength="120" value="${esc(e?.description || '')}" autofocus></label>
      <div class="row"><label class="field"><span>Valor (R$) *</span><input name="amount" inputmode="decimal" value="${moneyIn(e?.amount_cents)}"></label>
        <label class="field"><span>Vencimento *</span><input type="date" name="due_date" value="${e?.due_date || todayStr()}"></label></div>
      <label class="field"><span>Categoria</span><input name="category" list="ecats" maxlength="40" value="${esc(e?.category || '')}"><datalist id="ecats">${CATS.map((c) => `<option>${c}</option>`).join('')}</datalist></label>
      ${e ? '' : `<label class="check"><input type="checkbox" name="paid"> Já está paga</label><label class="field hidden" data-m><span>Forma</span><select name="method">${state.methods.map((m) => `<option>${esc(m.name)}</option>`).join('')}<option>Boleto</option><option>Transferência</option></select></label>
        <label class="check"><input type="checkbox" name="recurring"> Repetir todo mês (despesa fixa)</label>`}
      <div class="actions stretch">${e && !e.recurring_id ? '<button type="button" class="btn ghost" data-del>Excluir</button>' : ''}<button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`,
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
          toast('Despesa salva ✓');
          refresh();
        }).catch(() => {});
      };
    },
  });
}

async function cash(body, range) {
  const c = await GET(`/api/finance/cashflow?from=${range.from}&to=${range.to}`);
  body.innerHTML = `<div class="kpis"><div class="kpi"><span>Entradas</span><b class="ok-t">${money(c.total_in)}</b></div><div class="kpi"><span>Saídas</span><b class="err-t">${money(c.total_out)}</b></div>
    <div class="kpi hl"><span>Saldo do período</span><b>${money(c.total_in - c.total_out)}</b></div></div>
    <div class="grid g2"><div class="card"><h2>Por dia</h2>${c.daily.length ? `<div class="scroll-x"><table class="t"><thead><tr><th>Dia</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo acumulado</th></tr></thead><tbody>
      ${c.daily.map((d) => `<tr><td>${fmtDate(d.date)}</td><td class="num ok-t">${money(d.in)}</td><td class="num err-t">${money(d.out)}</td><td class="num"><b>${money(d.balance)}</b></td></tr>`).join('')}</tbody></table></div>` : empty('Sem movimentações.')}</div>
    <div class="card"><h2>Entradas por forma de pagamento</h2>${bars(c.by_method, { label: (x) => x.method })}</div></div>
    <div class="card"><h2>Histórico de movimentações</h2>${c.moves.length ? `<ul class="list">${c.moves.map((m) => `<li><div class="grow"><div class="title">${esc(m.description)}</div><div class="meta">${fmtDate(m.date)}${m.method ? ' · ' + esc(m.method) : ''}</div></div>
      <b class="${m.dir === 'in' ? 'ok-t' : 'err-t'}">${m.dir === 'in' ? '+' : '−'} ${money(m.amount)}</b></li>`).join('')}</ul>` : empty('Sem movimentações.')}</div>
    <p class="legend">Fluxo de caixa mostra o dinheiro que efetivamente entrou e saiu (regime de caixa). Vendas pendentes só entram quando recebidas.</p>`;
}

async function recurring(body) {
  const rows = await GET('/api/recurring-expenses');
  body.innerHTML = `<div class="card"><h2>Despesas fixas <button class="btn sm primary" data-new-rec>＋ Nova</button></h2>${rows.length ? `<ul class="list">${rows.map((r) => `<li>
    <div class="grow"><div class="title">${esc(r.description)} ${r.active ? '' : '<span class="tag">desativada</span>'}</div><div class="meta">${esc(r.category || 'Sem categoria')} · todo dia ${r.day_of_month}</div></div>
    <b>${money(r.amount_cents)}</b><button class="btn sm ghost" data-edit-rec="${r.id}">Editar</button></li>`).join('')}</ul>` : empty('Cadastre aluguel, internet, sistema… e elas aparecem automaticamente em contas a pagar todo mês.')}</div>`;
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
      ${r ? `<label class="check"><input type="checkbox" name="active" ${r.active ? 'checked' : ''}> Ativa (gera a conta todo mês)</label>` : ''}
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
          toast('Despesa fixa salva ✓');
          refresh();
        }).catch(() => {});
      };
    },
  });
}
