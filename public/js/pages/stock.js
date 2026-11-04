import { state, GET, POST, PUT, esc, money, moneyIn, toCents, modal, toast, submitting, can, empty, fmtDate } from '../core.js';
import { refresh } from '../app.js';

const MOVE = { in: 'Entrada', out: 'Saída / perda', use: 'Uso interno', adjust: 'Ajuste de contagem', sale: 'Venda', void: 'Estorno' };
const ui = { tab: 'retail' };

export default async function stock(root) {
  const [products, moves] = await Promise.all([GET('/api/products?all=1'), GET('/api/stock/moves')]);
  const low = products.filter((p) => p.active && p.min_stock > 0 && p.stock <= p.min_stock);
  const list = products.filter((p) => p.kind === ui.tab);
  const value = products.filter((p) => p.active).reduce((s, p) => s + Math.max(0, p.stock) * p.cost_cents, 0);
  root.innerHTML = `<div class="page-head"><div><h1>Estoque</h1><div class="sub">Produtos para venda e materiais de uso interno ficam separados</div></div>
    ${can.owner() ? '<button class="btn primary" data-new>＋ Novo produto</button>' : ''}</div>
    <div class="kpis"><div class="kpi"><span>Produtos para venda</span><b>${products.filter((p) => p.kind === 'retail' && p.active).length}</b></div>
      <div class="kpi"><span>Materiais internos</span><b>${products.filter((p) => p.kind === 'internal' && p.active).length}</b></div>
      <div class="kpi ${low.length ? 'hl' : ''}"><span>Estoque baixo</span><b>${low.length}</b><small>${low.map((l) => esc(l.name)).slice(0, 3).join(', ')}</small></div>
      ${can.owner() ? `<div class="kpi"><span>Valor em estoque (custo)</span><b>${money(value)}</b></div>` : ''}</div>
    <div class="tabs"><button data-tab="retail" class="${ui.tab === 'retail' ? 'on' : ''}">🛍 Vendidos às clientes</button><button data-tab="internal" class="${ui.tab === 'internal' ? 'on' : ''}">🧪 Uso interno</button><button data-tab="moves" class="${ui.tab === 'moves' ? 'on' : ''}">Movimentações</button></div>
    <div class="card">${ui.tab === 'moves' ? movesTable(moves) : list.length ? `<ul class="list">${list.map((p) => `<li>
      <div class="grow"><div class="title">${esc(p.name)} ${p.active ? '' : '<span class="tag">inativo</span>'} ${p.min_stock > 0 && p.stock <= p.min_stock ? '<span class="tag err">estoque baixo</span>' : ''}</div>
      <div class="meta"><b>${fmtQty(p.stock)} ${esc(p.unit)}</b> em estoque · mínimo ${fmtQty(p.min_stock)}${p.kind === 'retail' ? ` · venda ${money(p.price_cents)}` : ''}${can.owner() && p.cost_cents ? ` · custo ${money(p.cost_cents)}` : ''}</div></div>
      <div class="row-actions"><button class="btn sm" data-move="${p.id}" data-type="in">＋ Entrada</button><button class="btn sm" data-move="${p.id}" data-type="${p.kind === 'internal' ? 'use' : 'out'}">− ${p.kind === 'internal' ? 'Uso' : 'Saída'}</button>
        <button class="btn sm ghost" data-move="${p.id}" data-type="adjust">Contagem</button>${can.owner() ? `<button class="btn sm ghost" data-edit="${p.id}">Editar</button>` : ''}</div></li>`).join('')}</ul>`
      : empty(ui.tab === 'retail' ? 'Nenhum produto para venda (shampoos, máscaras, finalizadores…).' : 'Nenhum material de uso interno (tinturas, luvas, algodão…).')}</div>
    <p class="legend">Vendas baixam o estoque automaticamente. “Uso interno” registra consumo nos procedimentos e nunca entra no faturamento.</p>`;
  root.querySelector('[data-new]')?.addEventListener('click', () => edit({ kind: ui.tab === 'internal' ? 'internal' : 'retail' }));
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => ((ui.tab = b.dataset.tab), refresh())));
  root.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => edit(products.find((p) => p.id === Number(b.dataset.edit)))));
  root.querySelectorAll('[data-move]').forEach((b) => (b.onclick = () => move(products.find((p) => p.id === Number(b.dataset.move)), b.dataset.type)));
}
const fmtQty = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

function movesTable(moves) {
  if (!moves.length) return empty('Nenhuma movimentação ainda.');
  return `<div class="scroll-x"><table class="t"><thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th class="num">Qtd.</th><th>Por</th></tr></thead><tbody>
    ${moves.map((m) => `<tr><td class="nowrap">${fmtDate(m.created_at)} ${m.created_at.slice(11, 16)}</td><td>${esc(m.product_name)}${m.note ? `<br><small class="muted">${esc(m.note)}</small>` : ''}</td>
      <td>${MOVE[m.type]}</td><td class="num ${m.qty < 0 ? 'err-t' : 'ok-t'}">${m.qty > 0 ? '+' : ''}${fmtQty(m.qty)} ${esc(m.unit)}</td><td>${esc(m.user_name || '')}</td></tr>`).join('')}</tbody></table></div>`;
}

function edit(p) {
  const isNew = !p.id;
  modal({
    title: isNew ? 'Novo produto' : `Editar ${p.name}`,
    body: `<form novalidate>
      <label class="field"><span>Nome *</span><input name="name" maxlength="80" value="${esc(p.name || '')}" autofocus></label>
      <div class="field"><span>Tipo</span><div class="seg"><button type="button" data-k="retail" class="${p.kind === 'retail' ? 'on' : ''}">Vendido às clientes</button><button type="button" data-k="internal" class="${p.kind === 'internal' ? 'on' : ''}">Uso interno</button></div></div>
      <div class="row"><label class="field" data-only="retail"><span>Preço de venda (R$)</span><input name="price" inputmode="decimal" value="${moneyIn(p.price_cents)}"></label>
        <label class="field"><span>Custo unitário (R$)</span><input name="cost" inputmode="decimal" value="${moneyIn(p.cost_cents)}"></label></div>
      <div class="row3">${isNew ? '<label class="field"><span>Estoque inicial</span><input name="stock" inputmode="decimal" value="0"></label>' : ''}
        <label class="field"><span>Estoque mínimo</span><input name="min_stock" inputmode="decimal" value="${fmtQty(p.min_stock || 0)}"></label>
        <label class="field"><span>Unidade</span><input name="unit" maxlength="10" value="${esc(p.unit || 'un')}" list="units"><datalist id="units"><option>un</option><option>ml</option><option>g</option><option>cx</option><option>par</option></datalist></label></div>
      <label class="field" data-only="retail"><span>Comissão de venda (%) <small>— vazio usa a comissão de produtos da profissional</small></span><input name="commission_pct" inputmode="decimal" value="${p.commission_pct ?? ''}"></label>
      ${!isNew ? `<label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Ativo</label>` : ''}
      <div class="actions stretch"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`,
    onMount(el, close) {
      const f = el.querySelector('form');
      let kind = p.kind;
      const sync = () => el.querySelectorAll('[data-only]').forEach((x) => x.classList.toggle('hidden', x.dataset.only !== kind));
      el.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => {
        kind = b.dataset.k;
        el.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('on', x === b));
        sync();
      }));
      sync();
      const num = (v) => (v === '' ? null : Number(String(v).replace(',', '.')));
      f.onsubmit = async (e) => {
        e.preventDefault();
        await submitting(f.querySelector('[type=submit]'), async () => {
          const body = { name: f.name.value, kind, unit: f.unit.value, price_cents: kind === 'retail' ? toCents(f.price.value) ?? 0 : 0, cost_cents: toCents(f.cost.value) ?? 0,
            min_stock: num(f.min_stock.value) ?? 0, commission_pct: kind === 'retail' ? num(f.commission_pct.value) : null, stock: isNew ? num(f.stock.value) ?? 0 : undefined, active: isNew ? true : f.active.checked };
          if ([body.price_cents, body.cost_cents].some(Number.isNaN)) throw new Error('Confira os valores');
          if (isNew) await POST('/api/products', body);
          else await PUT(`/api/products/${p.id}`, body);
          close();
          toast('Produto salvo ✓');
          refresh();
        }).catch(() => {});
      };
    },
  });
}

function move(p, type) {
  modal({
    title: `${MOVE[type]} · ${p.name}`,
    body: `<form novalidate><p class="small muted">Estoque atual: <b>${fmtQty(p.stock)} ${esc(p.unit)}</b></p>
      <label class="field"><span>${type === 'adjust' ? 'Quantidade contada na prateleira' : 'Quantidade'}</span><input name="qty" inputmode="decimal" autofocus></label>
      ${type === 'in' && can.owner() ? `<label class="field"><span>Valor pago na compra (R$) <small>— opcional, lança como despesa paga</small></span><input name="expense" inputmode="decimal"></label>
        <label class="field"><span>Forma de pagamento</span><select name="method">${state.methods.map((m) => `<option>${esc(m.name)}</option>`).join('')}</select></label>` : ''}
      <label class="field"><span>Observação</span><input name="note" maxlength="200" placeholder="${type === 'in' ? 'Fornecedor, nota…' : type === 'use' ? 'Procedimento, profissional…' : 'Motivo'}"></label>
      <div class="actions stretch"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" type="submit">Registrar</button></div></form>`,
    onMount(el, close) {
      const f = el.querySelector('form');
      f.onsubmit = async (e) => {
        e.preventDefault();
        await submitting(f.querySelector('[type=submit]'), async () => {
          const qty = Number(f.qty.value.replace(',', '.'));
          if (!Number.isFinite(qty) || f.qty.value === '') throw new Error('Informe a quantidade');
          const expense = f.expense ? toCents(f.expense.value) : null;
          if (Number.isNaN(expense)) throw new Error('Valor pago inválido');
          await POST(`/api/products/${p.id}/moves`, { type, qty, note: f.note.value, expense_cents: expense || undefined, method: f.method?.value });
          close();
          toast('Estoque atualizado ✓');
          refresh();
        }).catch(() => {});
      };
    },
  });
}
