import { state, GET, POST, PUT, DEL, esc, money, fmtDate, fmtPhone, waLink, modal, toast, fail, confirmBox, formData, submitting, can, empty, initials, badge, fmtDayLong, ApiError } from '../core.js';
import { newVisit, openVisit } from './visits.js';
import { openCheckout, openSale } from './checkout.js';
import { refresh } from '../app.js';

const FILTERS = [['', 'Todas'], ['inactive', 'Sumidas (+60 dias)'], ['birthday', 'Aniversariantes do mês'], ['new', 'Ainda sem atendimento']];
const ui = { q: '', filter: '' };

export default async function clients(root, { id, query }) {
  if (id) return detail(root, Number(id));
  if (query.filtro === 'aniversario') ui.filter = 'birthday';
  root.innerHTML = `<div class="page-head"><div><h1>Clientes</h1><div class="sub" data-count></div></div><button class="btn primary" data-new>＋ Nova cliente</button></div>
    <input type="search" placeholder="Buscar por nome ou telefone" value="${esc(ui.q)}" data-q style="margin-bottom:10px">
    <div class="chips" style="margin-bottom:12px">${FILTERS.map(([k, l]) => `<button class="chip ${ui.filter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
    <div class="card"><ul class="list" data-list><li class="muted">Carregando…</li></ul></div>`;
  const list = root.querySelector('[data-list]');
  let seq = 0;
  async function load() {
    const my = ++seq;
    const rows = await GET(`/api/clients?q=${encodeURIComponent(ui.q)}&filter=${ui.filter}`).catch((e) => (fail(e), []));
    if (my !== seq) return;
    root.querySelector('[data-count]').textContent = `${rows.length} cliente(s)${rows.length === 500 ? ' (mostrando as 500 primeiras — use a busca)' : ''}`;
    list.innerHTML = rows.length ? rows.map((c) => {
      const wa = waLink(c.phone);
      return `<li><a class="avatar" href="#/clientes/${c.id}">${esc(initials(c.name))}</a>
        <a class="grow" href="#/clientes/${c.id}" style="color:inherit"><div class="title">${esc(c.name)}</div>
        <div class="meta">${fmtPhone(c.phone) || 'sem telefone'} · ${c.last_visit ? `última visita ${fmtDate(c.last_visit)}` : 'sem visitas'}${c.visits_count ? ` · ${c.visits_count} visita(s)` : ''}${c.spent_cents != null && c.spent_cents ? ` · ${money(c.spent_cents)}` : ''}</div></a>
        <div class="row-actions">${wa ? `<a class="btn sm" href="${wa}" target="_blank" rel="noopener" aria-label="WhatsApp">💬</a>` : ''}<button class="btn sm" data-book="${c.id}">Agendar</button></div></li>`;
    }).join('') : `<li>${empty(ui.q ? 'Nenhuma cliente encontrada.' : 'Nenhuma cliente aqui ainda.')}</li>`;
    list.querySelectorAll('[data-book]').forEach((b) => (b.onclick = () => {
      const c = rows.find((r) => r.id === Number(b.dataset.book));
      newVisit({ client: { id: c.id, name: c.name, phone: c.phone, preferred_pro_id: c.preferred_pro_id }, onSaved: () => toast('Agendado') });
    }));
  }
  let t;
  root.querySelector('[data-q]').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => ((ui.q = e.target.value.trim()), load()), 220);
  });
  root.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => {
    ui.filter = b.dataset.f;
    root.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === b));
    load();
  }));
  root.querySelector('[data-new]').onclick = () => quickClient({ onSaved: (id) => (location.hash = `#/clientes/${id}`) });
  await load();
}

/** Cadastro rápido: só o nome é obrigatório. */
export function quickClient({ client = null, onSaved } = {}) {
  modal({
    title: client ? 'Editar cliente' : 'Nova cliente',
    body: `<form novalidate>
      <label class="field"><span>Nome *</span><input name="name" required maxlength="80" value="${esc(client?.name || '')}" autofocus autocomplete="off"></label>
      <div class="row"><label class="field"><span>Telefone / WhatsApp</span><input name="phone" inputmode="tel" maxlength="20" value="${esc(fmtPhone(client?.phone))}"></label>
        <label class="field"><span>Aniversário</span><input name="birthday" placeholder="dd/mm" maxlength="10" value="${client?.birthday ? client.birthday.slice(-2) + '/' + client.birthday.slice(-5, -3) : ''}"></label></div>
      <label class="field"><span>Profissional preferida</span><select name="preferred_pro_id"><option value="">—</option>
        ${state.pros.filter((p) => p.active).map((p) => `<option value="${p.id}" ${p.id === client?.preferred_pro_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Observações importantes</span><textarea name="notes" maxlength="2000" placeholder="Alergias, preferências, fórmula da coloração, tipo de cabelo…">${esc(client?.notes || '')}</textarea></label>
      <div class="actions stretch"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`,
    onMount(el, close) {
      const f = el.querySelector('form');
      f.onsubmit = async (e) => {
        e.preventDefault();
        await submitting(f.querySelector('[type=submit]'), async () => {
          const d = formData(f);
          const b = d.birthday.trim();
          if (b) {
            const m = b.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
            if (!m) throw new Error('Aniversário: use dd/mm');
            d.birthday = `${m[3] ? m[3] + '-' : ''}${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
          } else d.birthday = null;
          d.preferred_pro_id = d.preferred_pro_id || null;
          try {
            if (client) {
              await PUT(`/api/clients/${client.id}`, d);
              close();
              toast('Cliente atualizada');
              onSaved?.(client.id);
            } else {
              const r = await POST('/api/clients', d);
              close();
              toast('Cliente cadastrada ✓');
              onSaved?.(r.id);
            }
          } catch (err) {
            if (err instanceof ApiError && err.data.code === 'duplicate') {
              const go = await confirmBox(`${err.message} Abrir a ficha dela?`, { ok: 'Abrir ficha' });
              if (go) return close(), (location.hash = `#/clientes/${err.data.client_id}`);
              throw Object.assign(new Error(''), { silent: true });
            }
            throw err;
          }
        }).catch(() => {});
      };
    },
  });
}

async function detail(root, id) {
  const d = await GET(`/api/clients/${id}`);
  const c = d.client;
  const wa = waLink(c.phone, `Olá, ${c.name.split(' ')[0]}!`);
  const daysSince = c.last_visit ? Math.round((Date.now() - new Date(c.last_visit + 'T12:00:00')) / 864e5) : null;
  root.innerHTML = `
  <div class="page-head"><div style="display:flex;gap:12px;align-items:center"><div class="avatar" style="width:52px;height:52px;font-size:1.1rem">${esc(initials(c.name))}</div>
    <div><h1>${esc(c.name)}</h1><div class="sub">${fmtPhone(c.phone) || 'sem telefone'}${c.birthday ? ` · 🎂 ${c.birthday.slice(-2)}/${c.birthday.slice(-5, -3)}` : ''} · cliente desde ${fmtDate(c.created_at)}</div></div></div>
    <a class="btn ghost" href="#/clientes">← Clientes</a></div>
  <div class="actions" style="justify-content:flex-start;margin:0 0 14px">
    <button class="btn primary" data-act="book">📅 Agendar</button>
    ${can.staff() ? '<button class="btn" data-act="sale">🧾 Registrar venda</button>' : ''}
    ${wa ? `<a class="btn" href="${wa}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
    <button class="btn" data-act="edit">✏️ Editar</button>
    ${can.staff() ? '<button class="btn ghost" data-act="archive">Arquivar</button>' : ''}
  </div>
  ${c.notes ? `<div class="note-box" style="margin-bottom:14px">⚠ <b>Observações:</b> ${esc(c.notes)}</div>` : ''}
  <div class="kpis">
    <div class="kpi"><span>Última visita</span><b>${c.last_visit ? fmtDate(c.last_visit) : '—'}</b><small>${daysSince != null ? `há ${daysSince} dia(s)` : 'ainda não atendida'}</small></div>
    <div class="kpi"><span>Visitas</span><b>${c.visits_count}</b><small>${d.avg_interval_days ? `volta a cada ~${d.avg_interval_days} dias` : ''}${d.no_shows ? ` · ${d.no_shows} falta(s)` : ''}</small></div>
    ${c.spent_cents != null ? `<div class="kpi"><span>Total gasto</span><b>${money(c.spent_cents)}</b><small>${c.visits_count ? `média ${money(Math.round(c.spent_cents / c.visits_count))}` : ''}</small></div>` : ''}
    <div class="kpi"><span>Quem costuma atender</span><b>${esc(d.usual_pro || c.preferred_pro_name || '—')}</b><small>${c.preferred_pro_name ? `preferida: ${esc(c.preferred_pro_name)}` : ''}</small></div>
  </div>
  <div class="grid g2">
    <div class="card"><h2>Serviços que ela faz</h2>
      ${d.last_by_service.length ? `<ul class="list">${d.last_by_service.map((s) => `<li><div class="grow"><div class="title">${esc(s.name)}</div><div class="meta">${s.times}× no total</div></div>
        <div class="right"><b>${fmtDate(s.last_date)}</b><div class="meta">última vez</div></div></li>`).join('')}</ul>` : empty('Nenhum serviço realizado ainda.')}</div>
    <div class="card"><h2>Próximos agendamentos</h2>
      ${d.upcoming.length ? `<ul class="list">${d.upcoming.map((v) => `<li class="click" data-visit="${v.id}"><div class="grow"><div class="title">${fmtDayLong(v.date)} · ${v.start_at.slice(11)}</div><div class="meta">${esc(v.services)}</div></div>${badge(v.status)}</li>`).join('')}</ul>` : empty('Nada agendado.')}</div>
  </div>
  <div class="card"><h2>Histórico de atendimentos</h2>
    ${d.history.length ? d.history.map((h) => `<div class="history-item ${can.staff() ? 'click' : ''}" ${can.staff() ? `data-sale="${h.id}" style="cursor:pointer"` : ''}>
      <div style="display:flex;justify-content:space-between"><b>${fmtDate(h.date)}</b>${h.total_cents != null ? `<b>${money(h.total_cents)}</b>` : ''}</div>
      ${h.items.map((i) => `<div class="small">${i.kind === 'product' ? '🧴' : '✂️'} ${esc(i.name)}${i.qty !== 1 ? ` × ${i.qty}` : ''} <span class="muted">${i.pro_name ? '· ' + esc(i.pro_name) : ''}</span></div>`).join('')}</div>`).join('') : empty('Sem histórico ainda.')}
  </div>`;
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act],[data-visit],[data-sale]');
    if (!b) return;
    const pick = { id: c.id, name: c.name, phone: c.phone, preferred_pro_id: c.preferred_pro_id, notes: c.notes };
    if (b.dataset.visit) return openVisit(Number(b.dataset.visit), refresh);
    if (b.dataset.sale) return openSale(Number(b.dataset.sale), refresh);
    const a = b.dataset.act;
    if (a === 'book') newVisit({ client: pick, onSaved: refresh });
    if (a === 'sale') openCheckout({ onDone: refresh, client: pick });
    if (a === 'edit') quickClient({ client: c, onSaved: refresh });
    if (a === 'archive' && (await confirmBox(`Arquivar ${c.name}? O histórico financeiro é mantido, mas ela sai das listas e buscas.`, { ok: 'Arquivar', danger: true })))
      await DEL(`/api/clients/${c.id}`).then(() => (toast('Cliente arquivada'), (location.hash = '#/clientes'))).catch(fail);
  });
}
