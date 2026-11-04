import { state, GET, POST, PUT, esc, money, moneyIn, toCents, modal, toast, confirmBox, submitting, can, empty, fmtDate, periodPicker, mountPeriod, rangeLabel, loadRefs, todayStr } from '../core.js';
import { refresh } from '../app.js';

const SPECIALTIES = ['Cabeleireira', 'Colorista', 'Manicure', 'Pedicure', 'Manicure e pedicure', 'Nail designer', 'Maquiadora', 'Designer de sobrancelhas', 'Esteticista', 'Terapeuta capilar', 'Depiladora', 'Recepcionista'];
const COLORS = ['#b4548c', '#7a5cc4', '#2f8fb3', '#2f9e74', '#d08a2a', '#d0533f', '#6b7a8f', '#c4479c'];
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const ruleText = (p) => (p.commission_type === 'fixed' ? `${money(p.commission_value)} por atendimento` : `${String(p.commission_value).replace('.', ',')}% dos serviços`) + (p.product_commission_pct ? ` · ${p.product_commission_pct}% produtos` : '');

export default async function team(root) {
  root.innerHTML = `<div class="page-head"><div><h1>${can.pro() ? 'Minhas comissões' : 'Equipe e comissões'}</h1><div class="sub">Produção, comissões geradas, pagas e a pagar</div></div>
    ${can.owner() ? '<button class="btn primary" data-new>＋ Nova profissional</button>' : ''}</div>
    ${periodPicker('per')}<div data-body>${'<div class="loading">Carregando…</div>'}</div>`;
  root.querySelector('[data-new]')?.addEventListener('click', () => editPro());
  mountPeriod(root, 'per', async (range) => {
    const body = root.querySelector('[data-body]');
    const rows = await GET(`/api/commissions?from=${range.from}&to=${range.to}`);
    const pros = state.pros;
    if (!pros.length) return (body.innerHTML = empty('Nenhuma profissional cadastrada.', can.owner() ? '<button class="btn primary" data-first>Cadastrar a primeira</button>' : ''), body.querySelector('[data-first]')?.addEventListener('click', () => editPro()));
    const tot = rows.reduce((a, r) => ({ produced: a.produced + r.produced, commission: a.commission + r.commission, pending: a.pending + r.pending, paid: a.paid + r.paid_in_period }), { produced: 0, commission: 0, pending: 0, paid: 0 });
    body.innerHTML = `<div class="kpis">
        <div class="kpi hl"><span>Produção no período</span><b>${money(tot.produced)}</b><small>${rangeLabel(range)}</small></div>
        <div class="kpi"><span>Comissões geradas</span><b>${money(tot.commission)}</b><small>no período</small></div>
        <div class="kpi"><span>Comissões pagas</span><b>${money(tot.paid)}</b><small>no período</small></div>
        <div class="kpi"><span>A pagar (total)</span><b>${money(tot.pending)}</b><small>todas as pendentes</small></div></div>
      <div class="card"><ul class="list">${rows.map((r) => {
        const p = pros.find((x) => x.id === r.id) || r;
        return `<li><span class="avatar" style="background:${esc(p.color)}22;color:${esc(p.color)}">${esc(p.name[0])}</span>
          <div class="grow"><div class="title">${esc(p.name)} ${p.active ? '' : '<span class="tag">inativa</span>'}</div>
            <div class="meta">${esc(p.specialty || '')}${p.commission_type ? ' · ' + ruleText(p) : ''}</div>
            <div class="meta">Produziu <b>${money(r.produced)}</b> (${r.services_count} atend.) · comissão ${money(r.commission)} · <span class="${r.pending ? 'warn-t' : ''}">a pagar ${money(r.pending)}</span></div></div>
          <div class="row-actions"><button class="btn sm" data-detail="${r.id}">Detalhes</button>
            ${can.owner() && r.pending ? `<button class="btn sm ok" data-pay="${r.id}">Pagar</button>` : ''}
            ${can.owner() ? `<button class="btn sm ghost" data-edit="${r.id}">Editar</button>` : ''}</div></li>`;
      }).join('')}</ul></div>
      <p class="legend">Comissão é gerada quando o atendimento é concluído (venda registrada), sobre o valor já com desconto. Vendas estornadas não geram comissão.
      Regra aplicada: 1) preço/comissão específico da profissional no serviço, 2) comissão do serviço, 3) padrão da profissional.</p>`;
    body.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => editPro(pros.find((p) => p.id === Number(b.dataset.edit)))));
    body.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => payCommission(rows.find((r) => r.id === Number(b.dataset.pay)))));
    body.querySelectorAll('[data-detail]').forEach((b) => (b.onclick = () => detail(rows.find((r) => r.id === Number(b.dataset.detail)), range)));
  });
}

function editPro(p = null) {
  const days = (p?.work_days ?? '1,2,3,4,5,6').split(',');
  modal({
    title: p ? `Editar ${p.name}` : 'Nova profissional',
    wide: true,
    body: `<form novalidate>
      <div class="row"><label class="field"><span>Nome *</span><input name="name" maxlength="60" value="${esc(p?.name || '')}" autofocus></label>
        <label class="field"><span>Especialidade</span><input name="specialty" list="specs" maxlength="60" value="${esc(p?.specialty || '')}" placeholder="Cabeleireira, manicure…"><datalist id="specs">${SPECIALTIES.map((s) => `<option>${s}</option>`).join('')}</datalist></label></div>
      <div class="row"><label class="field"><span>Telefone</span><input name="phone" inputmode="tel" maxlength="20" value="${esc(p?.phone || '')}"></label>
        <div class="field"><span>Cor na agenda</span><div class="chips">${COLORS.map((c) => `<label style="cursor:pointer"><input type="radio" name="color" value="${c}" ${c === (p?.color || COLORS[0]) ? 'checked' : ''} style="display:none"><span class="dot" style="background:${c};width:26px;height:26px;outline-offset:2px"></span></label>`).join('')}</div></div></div>
      <div class="field"><span>Dias de trabalho</span><div class="chips days">${DAYS.map((d, i) => `<label class="chip ${days.includes(String(i)) ? 'on' : ''}"><input type="checkbox" data-multi name="work_days" value="${i}" ${days.includes(String(i)) ? 'checked' : ''} style="display:none">${d}</label>`).join('')}</div></div>
      <div class="row"><label class="field"><span>Entrada</span><input type="time" name="start_time" value="${p?.start_time || '09:00'}"></label><label class="field"><span>Saída</span><input type="time" name="end_time" value="${p?.end_time || '19:00'}"></label></div>
      <div class="row"><label class="field"><span>Intervalo — início</span><input type="time" name="break_start" value="${p?.break_start || ''}"></label><label class="field"><span>Intervalo — fim</span><input type="time" name="break_end" value="${p?.break_end || ''}"></label></div>
      <h3 style="margin:6px 0 8px">Comissão padrão</h3>
      <div class="row"><label class="field"><span>Tipo</span><select name="commission_type"><option value="pct" ${p?.commission_type !== 'fixed' ? 'selected' : ''}>% sobre o serviço</option><option value="fixed" ${p?.commission_type === 'fixed' ? 'selected' : ''}>Valor fixo por atendimento</option></select></label>
        <label class="field"><span data-cv-label>Valor</span><input name="commission_value" inputmode="decimal" value="${p ? (p.commission_type === 'fixed' ? moneyIn(p.commission_value) : String(p.commission_value).replace('.', ',')) : '40'}"></label></div>
      <label class="field"><span>Comissão sobre produtos vendidos (%)</span><input name="product_commission_pct" inputmode="decimal" value="${String(p?.product_commission_pct ?? 0).replace('.', ',')}"><small>Serviços podem ter regras próprias em “Serviços e preços”.</small></label>
      ${p ? `<label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Ativa (aparece na agenda)</label>` : ''}
      <div class="actions stretch"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`,
    onMount(el, close) {
      const f = el.querySelector('form');
      el.querySelectorAll('.chips.days .chip').forEach((c) => c.querySelector('input').addEventListener('change', (e) => c.classList.toggle('on', e.target.checked)));
      const dots = () => el.querySelectorAll('[name=color]').forEach((r) => (r.nextElementSibling.style.outline = r.checked ? '3px solid var(--ink)' : 'none'));
      el.querySelectorAll('[name=color]').forEach((r) => r.addEventListener('change', dots));
      dots();
      const lbl = () => (el.querySelector('[data-cv-label]').textContent = f.commission_type.value === 'fixed' ? 'Valor por atendimento (R$)' : 'Percentual (%)');
      f.commission_type.onchange = lbl;
      lbl();
      f.onsubmit = async (e) => {
        e.preventDefault();
        await submitting(f.querySelector('[type=submit]'), async () => {
          const num = (v) => Number(String(v).replace(',', '.'));
          const body = {
            name: f.name.value, specialty: f.specialty.value, phone: f.phone.value, color: f.color.value,
            work_days: [...f.querySelectorAll('[name=work_days]:checked')].map((x) => x.value).join(','),
            start_time: f.start_time.value, end_time: f.end_time.value, break_start: f.break_start.value || null, break_end: f.break_end.value || null,
            commission_type: f.commission_type.value,
            commission_value: f.commission_type.value === 'fixed' ? toCents(f.commission_value.value) : num(f.commission_value.value || 0),
            product_commission_pct: num(f.product_commission_pct.value || 0), active: p ? f.active.checked : true,
          };
          if (!body.work_days) throw new Error('Marque ao menos um dia de trabalho');
          if (p) await PUT(`/api/professionals/${p.id}`, body);
          else await POST('/api/professionals', body);
          await loadRefs(true);
          close();
          toast(p ? 'Profissional atualizada' : 'Profissional cadastrada ✓ — habilite-a nos serviços que ela faz');
          refresh();
        }).catch(() => {});
      };
    },
  });
}

function payCommission(r) {
  modal({
    title: `Pagar comissões · ${r.name}`,
    body: `<form novalidate><p>Total pendente: <b>${money(r.pending)}</b></p>
      <label class="field"><span>Pagar comissões geradas até</span><input type="date" name="until" value="${todayStr()}" max="${todayStr()}"></label>
      <label class="field"><span>Observação</span><input name="note" maxlength="200" placeholder="Ex.: pago via Pix"></label>
      <p class="small muted">Cada comissão só pode ser paga uma vez. O pagamento entra como saída no fluxo de caixa.</p>
      <div class="actions stretch"><button type="button" class="btn ghost" data-close>Voltar</button><button class="btn ok" type="submit">Registrar pagamento</button></div></form>`,
    onMount(el, close) {
      const f = el.querySelector('form');
      f.onsubmit = async (e) => {
        e.preventDefault();
        await submitting(f.querySelector('[type=submit]'), async () => {
          const res = await POST('/api/commissions/pay', { professional_id: r.id, until: f.until.value, note: f.note.value });
          close();
          toast(`Pago ${money(res.amount_cents)} (${res.items} itens) ✓`);
          refresh();
        }).catch(() => {});
      };
    },
  });
}

async function detail(r, range) {
  const [pending, items, pays] = await Promise.all([
    GET(`/api/commissions/${r.id}/items?status=pending`), GET(`/api/commissions/${r.id}/items?from=${range.from}&to=${range.to}`), GET(`/api/commissions/payments?professional_id=${r.id}`),
  ]);
  const rowsHtml = (list) => (list.length ? `<div class="scroll-x"><table class="t"><thead><tr><th>Data</th><th>Item</th><th class="num">Valor</th><th class="num">Comissão</th></tr></thead><tbody>
    ${list.map((i) => `<tr><td class="nowrap">${fmtDate(i.created_at)}</td><td>${esc(i.name)}<br><small class="muted">${esc(i.client_name || '')} · ${esc(i.commission_note || '')}</small></td>
      <td class="num">${money(i.net_cents)}</td><td class="num">${money(i.commission_cents)}${i.commission_payment_id ? '<br><small class="ok-t">paga</small>' : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('Nada por aqui.'));
  modal({
    title: r.name,
    wide: true,
    body: `<div class="tabs"><button class="on" data-t="p">A pagar (${pending.length})</button><button data-t="i">No período</button><button data-t="h">Pagamentos</button></div>
      <div data-tab="p">${rowsHtml(pending)}</div><div data-tab="i" class="hidden">${rowsHtml(items)}</div>
      <div data-tab="h" class="hidden">${pays.length ? `<ul class="list">${pays.map((p) => `<li><div class="grow"><div class="title">${money(p.amount_cents)}</div><div class="meta">${fmtDate(p.created_at)} · ${p.items} item(ns) · ${esc(p.note || '')}</div></div></li>`).join('')}</ul>` : empty('Nenhum pagamento registrado.')}</div>`,
    onMount(el) {
      el.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => {
        el.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b));
        el.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('hidden', x.dataset.tab !== b.dataset.t));
      }));
    },
  });
}
