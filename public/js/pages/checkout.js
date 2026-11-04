// Fechar conta: serviços da visita + produtos + desconto + pagamento (inclusive dividido) em uma única tela.
import { state, GET, POST, esc, money, moneyIn, toCents, modal, toast, fail, confirmBox, submitting, can, fmtDate, todayStr , ic, soloPro } from '../core.js';
import { clientPicker } from './visits.js';

export async function openCheckout({ visit = null, client = null, onDone = () => {} } = {}) {
  let products = [];
  try {
    products = can.pro() ? [] : await GET('/api/products?kind=retail');
  } catch (e) {
    return fail(e);
  }
  const lines = visit
    ? visit.items.map((i) => ({ kind: 'service', visit_item_id: i.id, name: i.service_name, professional_id: i.professional_id, pro_name: i.pro_name, price: i.price_cents, qty: 1 }))
    : [];
  let discountMode = 'value';
  let payments = [{ method: state.methods.find((m) => m.name === 'Pix')?.name || state.methods[0]?.name, amount: null }];
  const myPro = can.pro() ? state.user.professional_id : null;

  modal({
    title: visit ? `Fechar conta · ${visit.client_name}` : 'Registrar venda',
    wide: true,
    body: `<form novalidate>
      ${visit ? '' : '<div class="field"><span>Cliente <small>(opcional para venda à vista)</small></span><div data-client></div></div>'}
      <h3 style="margin:4px 0 8px">Itens</h3>
      <ul class="list" data-lines></ul>
      <div class="row" style="margin-top:8px">
        <label class="field"><span>${ic('plus', 16)}  Serviço</span><select data-add-svc><option value="">Adicionar serviço…</option>
          ${state.services.map((s) => `<option value="${s.id}">${esc(s.name)} · ${money(s.price_cents)}</option>`).join('')}</select></label>
        ${products.length ? `<label class="field"><span>${ic('plus', 16)}  Produto</span><select data-add-prd><option value="">Adicionar produto…</option>
          ${products.map((p) => `<option value="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>${esc(p.name)} · ${money(p.price_cents)} (${p.stock} ${esc(p.unit)})</option>`).join('')}</select></label>` : '<div></div>'}
      </div>
      ${products.length && !myPro && !can.solo() ? `<label class="field"><span>Quem vendeu os produtos <small>(para comissão)</small></span><select name="seller"><option value="">Ninguém / recepção</option>
        ${state.pros.filter((p) => p.active).map((p) => `<option value="${p.id}" ${visit?.items[0]?.professional_id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : ''}
      <div class="row"><label class="field"><span>Desconto</span><div style="display:flex;gap:6px"><input inputmode="decimal" name="discount" placeholder="0,00">
        <div class="seg"><button type="button" data-dm="value" class="on">R$</button><button type="button" data-dm="pct">%</button></div></div></label>
        ${can.staff() ? `<label class="field"><span>Data da venda</span><input type="date" name="date" value="${todayStr()}" max="${todayStr()}"></label>` : '<div></div>'}</div>
      <div class="total-box" data-total></div>
      <h3 style="margin:8px 0">Pagamento</h3>
      <div data-pays></div>
      <div class="actions" style="justify-content:space-between;margin-top:4px"><button type="button" class="btn sm" data-split>${ic('plus', 16)}  Dividir em outra forma</button><button type="button" class="btn sm ghost" data-later>Cliente paga depois</button></div>
      <div data-rest class="small" style="margin-top:6px"></div>
      <div class="actions stretch"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="submit" class="btn ok">${ic('check', 16)}  Concluir</button></div>
    </form>`,
    onMount(el, close) {
      const form = el.querySelector('form');
      const picker = visit ? null : clientPicker(el.querySelector('[data-client]'), { required: false, initial: client });
      const linesBox = el.querySelector('[data-lines]');

      const subtotal = () => lines.reduce((s, l) => s + Math.round((l.price || 0) * l.qty), 0);
      const discount = () => {
        const raw = form.discount.value.trim();
        if (!raw) return 0;
        if (discountMode === 'pct') {
          const p = Number(raw.replace(',', '.'));
          return Number.isFinite(p) ? Math.round((subtotal() * Math.min(100, Math.max(0, p))) / 100) : NaN;
        }
        return toCents(raw);
      };
      const total = () => subtotal() - (discount() || 0);

      function renderLines() {
        linesBox.innerHTML = lines.length ? lines.map((l, i) => `<li>
          <div class="grow"><div class="title">${l.kind === 'product' ? ic('box', 18) + ' ' : ic('scissors', 18) + ' '}${esc(l.name)}</div>
            <div class="meta">${l.kind === 'service'
              ? (l.visit_item_id ? esc(l.pro_name) : `<select data-pro="${i}" style="min-height:34px;padding:4px 8px">${state.pros.filter((p) => p.active && state.services.find((s) => s.id === l.service_id)?.pros.some((x) => x.professional_id === p.id)).map((p) => `<option value="${p.id}" ${p.id === l.professional_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`)
              : `Qtd. <input data-qty="${i}" value="${l.qty}" inputmode="decimal" style="width:60px;min-height:32px;padding:4px 6px">`}</div></div>
          <input data-price="${i}" value="${moneyIn(l.price)}" inputmode="decimal" style="width:96px;text-align:right" aria-label="Preço">
          ${l.visit_item_id ? '' : `<button type="button" class="icon-btn" data-rm="${i}" aria-label="Remover">${ic('x', 16)} </button>`}</li>`).join('')
          : '<li class="muted small">Adicione serviços ou produtos.</li>';
        linesBox.querySelectorAll('[data-price]').forEach((inp) => inp.addEventListener('input', () => ((lines[inp.dataset.price].price = toCents(inp.value)), renderTotal())));
        linesBox.querySelectorAll('[data-qty]').forEach((inp) => inp.addEventListener('input', () => ((lines[inp.dataset.qty].qty = Number(inp.value.replace(',', '.')) || 0), renderTotal())));
        linesBox.querySelectorAll('[data-pro]').forEach((s) => s.addEventListener('change', () => (lines[s.dataset.pro].professional_id = Number(s.value))));
        linesBox.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => (lines.splice(b.dataset.rm, 1), renderLines())));
        renderTotal();
      }
      function renderTotal() {
        const d = discount();
        const svc = lines.filter((l) => l.kind === 'service').reduce((s, l) => s + (l.price || 0), 0);
        const prd = lines.filter((l) => l.kind === 'product').reduce((s, l) => s + Math.round((l.price || 0) * l.qty), 0);
        el.querySelector('[data-total]').innerHTML = `
          <div class="line"><span>Serviços</span><span>${money(svc)}</span></div>
          ${prd ? `<div class="line"><span>Produtos</span><span>${money(prd)}</span></div>` : ''}
          ${d ? `<div class="line"><span>Desconto</span><span class="err-t">− ${Number.isNaN(d) ? '?' : money(d)}</span></div>` : ''}
          <div class="line big"><span>Total</span><span>${money(total())}</span></div>`;
        // forma única acompanha o total automaticamente
        if (payments.length === 1 && !payments[0].touched) payments[0].amount = total();
        renderPays();
      }
      function renderPays() {
        const box = el.querySelector('[data-pays]');
        box.innerHTML = payments.map((p, i) => `<div class="pay-line">
          <select data-m="${i}">${state.methods.map((m) => `<option ${m.name === p.method ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
          <input data-v="${i}" inputmode="decimal" value="${moneyIn(p.amount)}" aria-label="Valor">
          ${payments.length > 1 ? `<button type="button" class="icon-btn" data-x="${i}">${ic('x', 16)} </button>` : '<span></span>'}</div>`).join('');
        box.querySelectorAll('[data-m]').forEach((s) => (s.onchange = () => (payments[s.dataset.m].method = s.value)));
        box.querySelectorAll('[data-v]').forEach((inp) => inp.addEventListener('input', () => {
          Object.assign(payments[inp.dataset.v], { amount: toCents(inp.value), touched: true });
          renderRest();
        }));
        box.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => (payments.splice(b.dataset.x, 1), renderPays())));
        renderRest();
      }
      function renderRest() {
        const paid = payments.reduce((s, p) => s + (p.amount || 0), 0);
        const rest = total() - paid;
        el.querySelector('[data-rest]').innerHTML = rest > 0 ? `<span class="warn-t">Fica pendente: <b>${money(rest)}</b> (a receber da cliente)</span>`
          : rest < 0 ? `<span class="err-t">Pagamentos passam do total em ${money(-rest)}. Troco: informe só o valor da conta.</span>` : `<span class="ok-t">${ic('check', 16)} Pagamento completo</span>`;
      }

      el.querySelector('[data-add-svc]').onchange = (e) => {
        const s = state.services.find((x) => x.id === Number(e.target.value));
        e.target.value = '';
        if (!s) return;
        const pro = myPro && s.pros.some((x) => x.professional_id === myPro) ? myPro : s.pros[0]?.professional_id;
        if (!pro) return toast('Nenhuma profissional habilitada para este serviço', 'err');
        lines.push({ kind: 'service', service_id: s.id, name: s.name, professional_id: pro, price: s.pros.find((x) => x.professional_id === pro)?.price_cents ?? s.price_cents, qty: 1 });
        renderLines();
      };
      el.querySelector('[data-add-prd]')?.addEventListener('change', (e) => {
        const p = products.find((x) => x.id === Number(e.target.value));
        e.target.value = '';
        if (!p) return;
        const ex = lines.find((l) => l.product_id === p.id);
        if (ex) ex.qty += 1;
        else lines.push({ kind: 'product', product_id: p.id, name: p.name, price: p.price_cents, qty: 1 });
        renderLines();
      });
      el.querySelectorAll('[data-dm]').forEach((b) => (b.onclick = () => {
        discountMode = b.dataset.dm;
        el.querySelectorAll('[data-dm]').forEach((x) => x.classList.toggle('on', x === b));
        renderTotal();
      }));
      form.discount.addEventListener('input', renderTotal);
      el.querySelector('[data-split]').onclick = () => {
        const paid = payments.reduce((s, p) => s + (p.amount || 0), 0);
        payments.forEach((p) => (p.touched = true));
        payments.push({ method: state.methods.find((m) => !payments.some((p) => p.method === m.name))?.name || state.methods[0].name, amount: Math.max(0, total() - paid), touched: true });
        renderPays();
      };
      el.querySelector('[data-later]').onclick = () => {
        payments = [{ method: payments[0].method, amount: 0, touched: true }];
        renderPays();
      };
      renderLines();

      form.onsubmit = async (e) => {
        e.preventDefault();
        await submitting(form.querySelector('[type=submit]'), async () => {
          if (!lines.length) throw new Error('Adicione ao menos um item');
          if (lines.some((l) => l.price == null || Number.isNaN(l.price))) throw new Error('Confira os preços dos itens');
          if (lines.some((l) => !(l.qty > 0))) throw new Error('Confira as quantidades');
          const d = discount();
          if (Number.isNaN(d) || d < 0) throw new Error('Desconto inválido');
          if (payments.some((p) => Number.isNaN(p.amount))) throw new Error('Confira os valores do pagamento');
          const paid = payments.reduce((s, p) => s + (p.amount || 0), 0);
          const client = picker?.get();
          if (paid < total() && !visit && !client) throw new Error('Para deixar valor pendente, identifique a cliente');
          if (paid < total() && !(await confirmBox(`Ficará pendente ${money(total() - paid)} para receber depois. Confirmar?`, { ok: 'Sim, concluir' }))) return;
          const sale = await POST('/api/sales', {
            visit_id: visit?.id, ...(picker ? picker.payload() : {}),
            professional_id: form.seller?.value || myPro || (can.solo() ? soloPro()?.id : undefined),
            date: form.date?.value || undefined,
            discount_cents: d,
            items: lines.map((l) => ({ kind: l.kind, visit_item_id: l.visit_item_id, service_id: l.service_id, product_id: l.product_id, professional_id: l.professional_id, qty: l.qty, price_cents: l.price })),
            payments: payments.map((p) => ({ method: p.method, amount_cents: p.amount || 0 })),
          });
          close();
          toast(sale.pending_cents ? `Venda registrada · pendente ${money(sale.pending_cents)}` : `Venda de ${money(sale.total_cents)} registrada`);
          onDone(sale);
        }).catch(() => {});
      };
    },
  });
}

/** Detalhe da venda: itens, comissões, pagamentos, receber pendente, estornar. */
export async function openSale(id, onChange = () => {}) {
  let s;
  try {
    s = await GET(`/api/sales/${id}`);
  } catch (e) {
    return fail(e);
  }
  modal({
    title: `Venda #${s.id}`,
    wide: true,
    body: `<p class="muted small">${fmtDate(s.created_at)} ${s.created_at.slice(11, 16)} · ${esc(s.client_name || 'Sem cliente identificada')}
      ${s.status === 'void' ? ` · <span class="tag err">ESTORNADA: ${esc(s.void_reason)}</span>` : s.pending_cents ? ` · <span class="tag warn">pendente ${money(s.pending_cents)}</span>` : ' · <span class="tag ok">quitada</span>'}</p>
      <div class="scroll-x"><table class="t"><thead><tr><th>Item</th><th>Profissional</th><th class="num">Valor</th>${can.owner() ? '<th class="num">Comissão</th>' : ''}</tr></thead><tbody>
      ${s.items.map((i) => `<tr><td>${esc(i.name)}${i.qty !== 1 ? ` × ${i.qty}` : ''}<br><small class="muted">${i.kind === 'service' ? 'Serviço' : 'Produto'}${i.net_cents !== i.gross_cents ? ` · bruto ${money(i.gross_cents)}` : ''}</small></td>
        <td>${esc(i.pro_name || '—')}</td><td class="num">${money(i.net_cents)}</td>
        ${can.owner() ? `<td class="num">${money(i.commission_cents)}<br><small class="muted" title="${esc(i.commission_note)}">${i.commission_payment_id ? 'paga' : 'pendente'}</small></td>` : ''}</tr>`).join('')}
      </tbody></table></div>
      <div class="total-box"><div class="line"><span>Subtotal</span><span>${money(s.subtotal_cents)}</span></div>
        ${s.discount_cents ? `<div class="line"><span>Desconto</span><span>− ${money(s.discount_cents)}</span></div>` : ''}
        <div class="line big"><span>Total</span><span>${money(s.total_cents)}</span></div></div>
      <h3>Pagamentos</h3>
      <ul class="list">${s.payments.map((p) => `<li><div class="grow">${esc(p.method)}<div class="meta">${fmtDate(p.created_at)} ${p.created_at.slice(11, 16)}</div></div><b>${money(p.amount_cents)}</b></li>`).join('') || '<li class="muted small">Nenhum pagamento ainda.</li>'}</ul>
      ${can.owner() ? '<p class="legend">Comissões calculadas sobre o valor com desconto. Passe o mouse para ver a regra aplicada.</p>' : ''}
      <div class="actions">
        ${s.status === 'active' && s.pending_cents && can.staff() ? `<button class="btn primary" data-receive>${ic('coin', 16)}  Receber pendente</button>` : ''}
        ${s.status === 'active' && can.owner() ? '<button class="btn danger" data-void>Estornar venda</button>' : ''}
      </div>`,
    onMount(el, close) {
      el.querySelector('[data-receive]')?.addEventListener('click', () => (close(), receive(s, onChange)));
      el.querySelector('[data-void]')?.addEventListener('click', async () => {
        const reason = await confirmBox('O estorno retira esta venda do faturamento e das comissões, devolve os produtos ao estoque e reabre o atendimento.', { ok: 'Estornar', danger: true, input: 'Motivo do estorno' });
        if (!reason) return;
        try {
          await POST(`/api/sales/${s.id}/void`, { reason });
          toast('Venda estornada');
          close();
          onChange();
        } catch (e) {
          fail(e);
        }
      });
    },
  });
}

export function receive(s, onChange = () => {}) {
  modal({
    title: `Receber de ${s.client_name || 'cliente'}`,
    body: `<form novalidate><p>Pendente: <b>${money(s.pending_cents)}</b></p>
      <div class="pay-line" style="grid-template-columns:1fr 130px"><select name="method">${state.methods.map((m) => `<option>${esc(m.name)}</option>`).join('')}</select>
      <input name="amount" inputmode="decimal" value="${moneyIn(s.pending_cents)}"></div>
      <div class="actions stretch"><button type="button" class="btn ghost" data-close>Voltar</button><button class="btn ok" type="submit">Confirmar recebimento</button></div></form>`,
    onMount(el, close) {
      const f = el.querySelector('form');
      f.onsubmit = async (e) => {
        e.preventDefault();
        await submitting(f.querySelector('[type=submit]'), async () => {
          const amount = toCents(f.amount.value);
          if (!(amount > 0)) throw new Error('Valor inválido');
          await POST(`/api/sales/${s.id}/payments`, { payments: [{ method: f.method.value, amount_cents: amount }] });
          close();
          toast('Recebimento registrado');
          onChange();
        }).catch(() => {});
      };
    },
  });
}
