import { state, GET, POST, esc, money, modal, toast, submitting, can, empty, fmtDate, periodPicker, mountPeriod, rangeLabel, todayStr, ic, avatar, pageHead } from '../core.js';
import { ruleText } from './team.js';
import { refresh } from '../app.js';

const ui = { tab: 'summary' };

export default async function commissions(root) {
  const mine = can.pro();
  root.innerHTML = `${pageHead(mine ? 'Minhas comissões' : 'Comissões', 'Quanto cada profissional produziu, quanto ganhou e quanto falta pagar')}
    <div class="tabs">${[['summary', 'Resumo'], ['rules', 'Regras'], ['history', 'Pagamentos feitos']].filter(([k]) => !mine || k !== 'rules').map(([k, l]) => `<button data-tab="${k}" class="${ui.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div data-tabbody></div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => ((ui.tab = b.dataset.tab), refresh())));
  const body = root.querySelector('[data-tabbody]');
  if (ui.tab === 'rules') return rules(body);
  if (ui.tab === 'history') return history(body);
  body.innerHTML = `${periodPicker('per')}<div data-body><div class="loading">Carregando…</div></div>`;
  mountPeriod(body, 'per', async (range) => {
    const box = body.querySelector('[data-body]');
    const rows = await GET(`/api/commissions?from=${range.from}&to=${range.to}`);
    if (!rows.length) return (box.innerHTML = `<div class="card">${empty('Nenhuma profissional cadastrada.', '', 'users')}</div>`);
    const tot = rows.reduce((a, r) => ({ produced: a.produced + r.produced, commission: a.commission + r.commission, pending: a.pending + r.pending, paid: a.paid + r.paid_in_period }), { produced: 0, commission: 0, pending: 0, paid: 0 });
    box.innerHTML = `<div class="kpis">
        <div class="kpi hl"><span class="k-ic">${ic('percent', 20)}</span><span>Comissões geradas</span><b>${money(tot.commission)}</b><small>${rangeLabel(range)}</small></div>
        <div class="kpi"><span class="k-ic">${ic('sparkle', 20)}</span><span>Produção da equipe</span><b>${money(tot.produced)}</b><small>base de cálculo</small></div>
        <div class="kpi"><span class="k-ic">${ic('checkCircle', 20)}</span><span>Pagas no período</span><b>${money(tot.paid)}</b></div>
        <div class="kpi"><span class="k-ic">${ic('hourglass', 20)}</span><span>A pagar (total)</span><b class="${tot.pending ? 'warn-t' : ''}">${money(tot.pending)}</b><small>todas as pendentes</small></div></div>
      <div class="card" style="padding:6px 14px"><ul class="list">${rows.map((r) => {
        const p = state.pros.find((x) => x.id === r.id) || r;
        return `<li>${avatar(p.name, p.photo_url)}
          <div class="grow"><div class="title">${esc(p.name)} ${p.active ? '' : '<span class="tag">inativa</span>'}</div>
            <div class="meta">Produziu ${money(r.produced)} · ${r.services_count} atend. · comissão ${money(r.commission)}</div>
            <div class="meta">${p.commission_type ? esc(ruleText(p)) : ''}</div></div>
          <div class="right"><b class="${r.pending ? 'warn-t' : 'ok-t'}">${money(r.pending)}</b><div class="tiny muted">a pagar</div></div>
          <div class="row-actions"><button class="btn xs soft" data-detail="${r.id}">Detalhes</button>${can.admin() && r.pending ? `<button class="btn xs ok" data-pay="${r.id}">Pagar</button>` : ''}</div></li>`;
      }).join('')}</ul></div>
      <p class="legend">${ic('info', 14)} A comissão nasce quando o atendimento é concluído (venda registrada), sobre o valor já com desconto. Vendas estornadas não geram comissão, e cada comissão só pode ser paga uma vez.</p>`;
    box.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => pay(rows.find((r) => r.id === Number(b.dataset.pay)))));
    box.querySelectorAll('[data-detail]').forEach((b) => (b.onclick = () => detail(rows.find((r) => r.id === Number(b.dataset.detail)), range)));
  });
}

/** Regras configuradas: padrão de cada profissional e exceções por serviço. */
function rules(body) {
  const pros = state.pros;
  const svcRules = state.services.filter((s) => s.commission_type || s.pros.some((l) => l.commission_type));
  body.innerHTML = `<div class="card"><div class="card-head"><h2>Regra padrão de cada profissional</h2><a class="btn xs soft" href="#/equipe">Editar na Equipe</a></div>
      <ul class="list">${pros.map((p) => `<li>${avatar(p.name, p.photo_url, 'sm')}<div class="grow"><div class="title">${esc(p.name)}</div><div class="meta">${esc(ruleText(p))}</div></div></li>`).join('') || '<li>Nenhuma profissional.</li>'}</ul></div>
    <div class="card"><div class="card-head"><h2>Regras específicas por serviço</h2><a class="btn xs soft" href="#/servicos">Editar em Serviços</a></div>
      ${svcRules.length ? `<ul class="list">${svcRules.map((s) => `<li><span class="avatar sm" style="background:var(--lav-100);color:var(--brand)">${ic('scissors', 16)}</span><div class="grow"><div class="title">${esc(s.name)}</div>
        <div class="meta">${s.commission_type ? `Serviço: ${s.commission_type === 'fixed' ? money(s.commission_value) + ' fixo' : s.commission_value + '%'}` : 'Usa o padrão de cada profissional'}
        ${s.pros.filter((l) => l.commission_type).map((l) => ` · ${esc(state.pros.find((p) => p.id === l.professional_id)?.name || '')}: ${l.commission_type === 'fixed' ? money(l.commission_value) + ' fixo' : l.commission_value + '%'}`).join('')}</div></div></li>`).join('')}</ul>`
        : empty('Nenhuma exceção: todos os serviços usam a regra padrão de cada profissional.', '', 'percent')}</div>
    <div class="card soft"><h3>Ordem de prioridade</h3><p class="small" style="margin-top:6px;line-height:1.6">1. Regra da profissional naquele serviço · 2. Regra do serviço · 3. Padrão da profissional. Produtos usam a % do produto ou a % de produtos da profissional.</p></div>`;
}

async function history(body) {
  const pays = await GET('/api/commissions/payments');
  body.innerHTML = `<div class="card">${pays.length ? `<ul class="list">${pays.map((p) => `<li>${avatar(p.pro_name, state.pros.find((x) => x.id === p.professional_id)?.photo_url, 'sm')}
    <div class="grow"><div class="title">${esc(p.pro_name)}</div><div class="meta">${fmtDate(p.created_at)} · ${p.items} item(ns) · ${esc(p.note || '')}</div></div><b class="ok-t">${money(p.amount_cents)}</b></li>`).join('')}</ul>`
    : empty('Nenhum pagamento de comissão registrado ainda.', '', 'wallet')}</div>`;
}

function pay(r) {
  modal({
    title: `Pagar comissões · ${r.name}`,
    body: `<form novalidate><div class="total-box"><div class="line big"><span>Pendente</span><span>${money(r.pending)}</span></div></div>
      <label class="field"><span>Pagar comissões geradas até</span><input type="date" name="until" value="${todayStr()}" max="${todayStr()}"></label>
      <label class="field"><span>Observação</span><input name="note" maxlength="200" placeholder="Ex.: pago via Pix"></label>
      <p class="small muted">O pagamento entra como saída no fluxo de caixa.</p>
      <div class="actions stretch"><button type="button" class="btn ghost" data-close>Voltar</button><button class="btn ok" type="submit">${ic('check', 18)} Registrar pagamento</button></div></form>`,
    onMount(el, close) {
      const f = el.querySelector('form');
      f.onsubmit = async (e) => {
        e.preventDefault();
        await submitting(f.querySelector('[type=submit]'), async () => {
          const res = await POST('/api/commissions/pay', { professional_id: r.id, until: f.until.value, note: f.note.value });
          close();
          toast(`Pago ${money(res.amount_cents)} (${res.items} itens)`);
          refresh();
        }).catch(() => {});
      };
    },
  });
}

async function detail(r, range) {
  const [pending, items] = await Promise.all([GET(`/api/commissions/${r.id}/items?status=pending`), GET(`/api/commissions/${r.id}/items?from=${range.from}&to=${range.to}`)]);
  const rowsHtml = (list) => (list.length ? `<div class="scroll-x"><table class="t"><thead><tr><th>Data</th><th>Item</th><th class="num">Valor</th><th class="num">Comissão</th></tr></thead><tbody>
    ${list.map((i) => `<tr><td class="nowrap">${fmtDate(i.created_at)}</td><td>${esc(i.name)}<br><small class="muted">${esc(i.client_name || '')} · ${esc(i.commission_note || '')}</small></td>
      <td class="num">${money(i.net_cents)}</td><td class="num">${money(i.commission_cents)}${i.commission_payment_id ? '<br><small class="ok-t">paga</small>' : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('Nada por aqui.', '', 'percent'));
  modal({
    title: r.name,
    wide: true,
    body: `<div class="tabs"><button class="on" data-t="p">A pagar (${pending.length})</button><button data-t="i">No período</button></div>
      <div data-tab="p">${rowsHtml(pending)}</div><div data-tab="i" class="hidden">${rowsHtml(items)}</div>`,
    onMount(el) {
      el.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => {
        el.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b));
        el.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('hidden', x.dataset.tab !== b.dataset.t));
      }));
    },
  });
}
