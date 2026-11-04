import { state, GET, POST, PUT, esc, money, moneyIn, toCents, modal, toast, submitting, can, empty, fmtDate, ic, pageHead } from '../core.js';
import { refresh } from '../app.js';

const MOVE = { in: 'Entrada', out: 'Saída / perda', use: 'Uso interno', adjust: 'Ajuste de contagem', sale: 'Venda', void: 'Estorno' };
const MOVE_IC = { in: 'download', out: 'trendDown', use: 'scissors', adjust: 'refresh', sale: 'cart', void: 'arrowLeft' };
const ui = { tab: 'retail', q: '', cat: '', low: false };
const fmtQty = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

export default async function stock(root) {
  const [products, moves] = await Promise.all([GET('/api/products?all=1'), GET('/api/stock/moves')]);
  const low = products.filter((p) => p.active && p.min_stock > 0 && p.stock <= p.min_stock);
  const value = products.filter((p) => p.active).reduce((s, p) => s + Math.max(0, p.stock) * p.cost_cents, 0);
  const cats = [...new Set(products.filter((p) => p.kind === ui.tab).map((p) => p.category || 'Sem categoria'))];
  root.innerHTML = `${pageHead('Estoque', 'Produtos de venda e materiais de uso interno ficam separados', can.admin() ? `<button class="btn primary" data-new>${ic('plus', 18)} Cadastrar produto</button>` : '')}
    <div class="kpis">
      <div class="kpi"><span class="k-ic">${ic('cart', 20)}</span><span>Para venda</span><b>${products.filter((p) => p.kind === 'retail' && p.active).length}</b><small>produtos ativos</small></div>
      <div class="kpi"><span class="k-ic">${ic('scissors', 20)}</span><span>Uso interno</span><b>${products.filter((p) => p.kind === 'internal' && p.active).length}</b><small>materiais</small></div>
      <div class="kpi ${low.length ? 'hl' : ''}"><span class="k-ic">${ic('alert', 20)}</span><span>Repor agora</span><b>${low.length}</b><small>${low.length ? low.map((l) => esc(l.name)).slice(0, 2).join(', ') : 'nada abaixo do mínimo'}</small></div>
      ${can.admin() ? `<div class="kpi"><span class="k-ic">${ic('coin', 20)}</span><span>Valor em estoque</span><b>${money(value)}</b><small>pelo custo</small></div>` : `<div class="kpi"><span class="k-ic">${ic('refresh', 20)}</span><span>Movimentações</span><b>${moves.length}</b><small>recentes</small></div>`}
    </div>
    ${low.length ? `<div class="alert warn"><span class="a-ic">${ic('alert', 18)}</span><span><b>${low.length} produto(s) com estoque baixo:</b> ${low.map((l) => `${esc(l.name)} (${fmtQty(l.stock)} ${esc(l.unit)})`).join(', ')}</span></div>` : ''}
    <div class="tabs"><button data-tab="retail" class="${ui.tab === 'retail' ? 'on' : ''}">Vendidos às clientes</button><button data-tab="internal" class="${ui.tab === 'internal' ? 'on' : ''}">Uso interno</button><button data-tab="moves" class="${ui.tab === 'moves' ? 'on' : ''}">Movimentações</button></div>
    ${ui.tab === 'moves' ? `<div class="card">${movesTable(moves)}</div>` : `
      <div class="searchbox" style="margin-bottom:12px">${ic('search', 18)}<input type="search" placeholder="Buscar produto" value="${esc(ui.q)}" data-q aria-label="Buscar produto"></div>
      <div class="chips scroll" style="margin-bottom:14px"><button class="chip ${ui.cat || ui.low ? '' : 'on'}" data-cat="">Todos</button><button class="chip ${ui.low ? 'on' : ''}" data-low>${ic('alert', 14)} Estoque baixo</button>
        ${cats.map((c) => `<button class="chip ${ui.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="card" style="padding:6px 14px"><ul class="list" data-list></ul></div>`}
    <p class="legend">${ic('info', 14)} Vendas baixam o estoque automaticamente. “Uso interno” registra o consumo nos procedimentos e nunca entra no faturamento.</p>`;
  const listEl = root.querySelector('[data-list]');
  const draw = () => {
    if (!listEl) return;
    const q = ui.q.toLowerCase();
    const rows = products.filter((p) => p.kind === ui.tab && (!q || p.name.toLowerCase().includes(q)) && (!ui.cat || (p.category || 'Sem categoria') === ui.cat) && (!ui.low || (p.min_stock > 0 && p.stock <= p.min_stock)));
    listEl.innerHTML = rows.length ? rows.map((p) => {
      const isLow = p.min_stock > 0 && p.stock <= p.min_stock;
      return `<li style="${p.active ? '' : 'opacity:.55'}"><span class="avatar" style="background:${isLow ? 'var(--warn-soft)' : 'var(--lav-100)'};color:${isLow ? 'var(--warn)' : 'var(--brand)'}">${ic('box', 20)}</span>
        <div class="grow"><div class="title">${esc(p.name)}</div>
          <div class="meta">${esc(p.category || 'Sem categoria')}${p.kind === 'retail' ? ` · venda ${money(p.price_cents)}` : ''}${can.admin() && p.cost_cents ? ` · custo ${money(p.cost_cents)}` : ''} · mín. ${fmtQty(p.min_stock)}</div></div>
        <div class="right"><b class="${isLow ? 'err-t' : ''}" style="font-size:1.1rem">${fmtQty(p.stock)}</b><div class="tiny muted">${esc(p.unit)}</div></div>
        <div class="row-actions"><button class="btn xs soft" data-move="${p.id}" data-type="in">${ic('plus', 14)} Entrada</button>
          <button class="btn xs soft" data-move="${p.id}" data-type="${p.kind === 'internal' ? 'use' : 'out'}">${ic('trendDown', 14)} ${p.kind === 'internal' ? 'Uso' : 'Saída'}</button>
          <button class="icon-btn" data-move="${p.id}" data-type="adjust" aria-label="Ajustar contagem de ${esc(p.name)}">${ic('refresh', 18)}</button>
          ${can.admin() ? `<button class="icon-btn" data-edit="${p.id}" aria-label="Editar ${esc(p.name)}">${ic('edit', 18)}</button>` : ''}</div></li>`;
    }).join('') : `<li style="display:block">${empty(ui.tab === 'retail' ? 'Nenhum produto para venda (shampoos, máscaras, finalizadores…).' : 'Nenhum material de uso interno (tinturas, luvas, algodão…).', '', 'box')}</li>`;
    listEl.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => edit(products.find((p) => p.id === Number(b.dataset.edit)))));
    listEl.querySelectorAll('[data-move]').forEach((b) => (b.onclick = () => move(products.find((p) => p.id === Number(b.dataset.move)), b.dataset.type)));
  };
  draw();
  root.querySelector('[data-q]')?.addEventListener('input', (e) => ((ui.q = e.target.value), draw()));
  root.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => ((ui.cat = b.dataset.cat), (ui.low = false), refresh())));
  root.querySelector('[data-low]')?.addEventListener('click', () => ((ui.low = !ui.low), (ui.cat = ''), refresh()));
  root.querySelector('[data-new]')?.addEventListener('click', () => edit({ kind: ui.tab === 'internal' ? 'internal' : 'retail' }));
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => ((ui.tab = b.dataset.tab), (ui.cat = ''), (ui.low = false), refresh())));
}

function movesTable(moves) {
  if (!moves.length) return empty('Nenhuma movimentação ainda.', '', 'refresh');
  return `<ul class="list">${moves.map((m) => `<li><span class="avatar sm" style="background:${m.qty < 0 ? 'var(--err-soft)' : 'var(--ok-soft)'};color:${m.qty < 0 ? 'var(--err)' : 'var(--ok)'}">${ic(MOVE_IC[m.type], 16)}</span>
    <div class="grow"><div class="title">${esc(m.product_name)}</div><div class="meta">${MOVE[m.type]} · ${fmtDate(m.created_at)} ${m.created_at.slice(11, 16)}${m.user_name ? ' · ' + esc(m.user_name) : ''}${m.note ? ' · ' + esc(m.note) : ''}</div></div>
    <b class="${m.qty < 0 ? 'err-t' : 'ok-t'}">${m.qty > 0 ? '+' : ''}${fmtQty(m.qty)} ${esc(m.unit)}</b></li>`).join('')}</ul>`;
}

function edit(p) {
  const isNew = !p.id;
  modal({
    title: isNew ? 'Cadastrar produto' : `Editar ${p.name}`,
    body: `<form novalidate>
      <label class="field"><span>Nome *</span><input name="name" maxlength="80" value="${esc(p.name || '')}" autofocus></label>
      <div class="field"><span>Tipo</span><div class="seg"><button type="button" data-k="retail" class="${p.kind === 'retail' ? 'on' : ''}">Vendido às clientes</button><button type="button" data-k="internal" class="${p.kind === 'internal' ? 'on' : ''}">Uso interno</button></div></div>
      <label class="field"><span>Categoria</span><input name="category" maxlength="40" value="${esc(p.category || '')}" list="pcats" placeholder="Shampoos, máscaras, coloração…"><datalist id="pcats">${['Shampoos', 'Condicionadores', 'Máscaras', 'Finalizadores', 'Coloração', 'Esmaltes', 'Descartáveis', 'Maquiagem', 'Skincare'].map((c) => `<option>${c}</option>`).join('')}</datalist></label>
      <div class="row"><label class="field" data-only="retail"><span>Preço de venda (R$)</span><input name="price" inputmode="decimal" value="${moneyIn(p.price_cents)}"></label>
        <label class="field"><span>Custo unitário (R$)</span><input name="cost" inputmode="decimal" value="${moneyIn(p.cost_cents)}"></label></div>
      <div class="row3">${isNew ? '<label class="field"><span>Estoque inicial</span><input name="stock" inputmode="decimal" value="0"></label>' : ''}
        <label class="field"><span>Estoque mínimo</span><input name="min_stock" inputmode="decimal" value="${fmtQty(p.min_stock || 0)}"></label>
        <label class="field"><span>Unidade</span><input name="unit" maxlength="10" value="${esc(p.unit || 'un')}" list="units"><datalist id="units"><option>un</option><option>ml</option><option>g</option><option>cx</option><option>par</option></datalist></label></div>
      <label class="field" data-only="retail"><span>Comissão de venda (%) <small>— vazio usa a comissão de produtos da profissional</small></span><input name="commission_pct" inputmode="decimal" value="${p.commission_pct ?? ''}"></label>
      ${!isNew ? `<label class="check"><span class="switch"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}><i></i></span> Produto ativo</label>` : ''}
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
          const body = { name: f.name.value, kind, unit: f.unit.value, category: f.category.value, price_cents: kind === 'retail' ? toCents(f.price.value) ?? 0 : 0, cost_cents: toCents(f.cost.value) ?? 0,
            min_stock: num(f.min_stock.value) ?? 0, commission_pct: kind === 'retail' ? num(f.commission_pct.value) : null, stock: isNew ? num(f.stock.value) ?? 0 : undefined, active: isNew ? true : f.active.checked };
          if ([body.price_cents, body.cost_cents].some(Number.isNaN)) throw new Error('Confira os valores');
          if (isNew) await POST('/api/products', body);
          else await PUT(`/api/products/${p.id}`, body);
          close();
          toast('Produto salvo');
          refresh();
        }).catch(() => {});
      };
    },
  });
}

function move(p, type) {
  modal({
    title: `${MOVE[type]} · ${p.name}`,
    body: `<form novalidate><div class="total-box"><div class="line"><span>Estoque atual</span><b>${fmtQty(p.stock)} ${esc(p.unit)}</b></div></div>
      <label class="field"><span>${type === 'adjust' ? 'Quantidade contada na prateleira' : 'Quantidade'}</span><input name="qty" inputmode="decimal" autofocus></label>
      ${type === 'in' && can.admin() ? `<label class="field"><span>Valor pago na compra (R$) <small>— opcional, lança como despesa paga</small></span><input name="expense" inputmode="decimal"></label>
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
          toast('Estoque atualizado');
          refresh();
        }).catch(() => {});
      };
    },
  });
}
