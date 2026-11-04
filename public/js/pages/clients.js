import { state, GET, POST, PUT, DEL, esc, money, fmtDate, fmtPhone, waLink, modal, toast, fail, confirmBox, formData, submitting, can, empty, badge, fmtDayLong, ApiError, ic, avatar, pageHead } from '../core.js';
import { newVisit, openVisit } from './visits.js';
import { openCheckout, openSale } from './checkout.js';
import { refresh } from '../app.js';

const FILTERS = [['', 'Todas'], ['inactive', 'Sumidas +60 dias'], ['birthday', 'Aniversariantes do mês'], ['new', 'Sem atendimento']];
const ui = { q: '', filter: '', tab: 'history' };

export default async function clients(root, { id, query }) {
  if (id) return detail(root, Number(id));
  if (query.filtro === 'aniversario' && !ui.linked) (ui.filter = 'birthday'), (ui.linked = true);
  root.innerHTML = `${pageHead('Clientes', 'Encontre, cadastre e acompanhe cada cliente', `<button class="btn primary" data-new>${ic('userPlus', 18)} Nova cliente</button>`)}
    <div class="card soft" style="display:flex;gap:14px;align-items:center">
      <span class="avatar lg" style="background:var(--hero)">${ic('users', 30)}</span>
      <div style="flex:1"><span class="small muted" style="font-weight:600">Clientes nesta lista</span><div style="font-size:1.8rem;font-weight:800;line-height:1.1" data-count>—</div><span class="tiny muted" data-sub></span></div>
    </div>
    <div class="searchbox" style="margin-bottom:12px">${ic('search', 18)}<input type="search" placeholder="Buscar por nome ou telefone" value="${esc(ui.q)}" data-q aria-label="Buscar cliente"></div>
    <div class="chips scroll" style="margin-bottom:14px">${FILTERS.map(([k, l]) => `<button class="chip ${ui.filter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
    <div class="card" style="padding:6px 14px"><ul class="list" data-list><li class="muted">Carregando…</li></ul></div>`;
  const list = root.querySelector('[data-list]');
  let seq = 0;
  async function load() {
    const my = ++seq;
    const rows = await GET(`/api/clients?q=${encodeURIComponent(ui.q)}&filter=${ui.filter}`).catch((e) => (fail(e), []));
    if (my !== seq) return;
    root.querySelector('[data-count]').textContent = rows.length;
    root.querySelector('[data-sub]').textContent = rows.length === 500 ? 'mostrando as 500 primeiras — use a busca' : `${rows.filter((r) => r.visits_count).length} já atendida(s)`;
    list.innerHTML = rows.length ? rows.map((c) => {
      const wa = waLink(c.phone);
      return `<li>${avatar(c.name)}
        <a class="grow" href="#/clientes/${c.id}" style="color:inherit"><div class="title">${esc(c.name)}</div>
        <div class="meta">${fmtPhone(c.phone) || 'sem telefone'}${c.last_visit ? ` · última visita ${fmtDate(c.last_visit)}` : ''}</div></a>
        <div class="row-actions">${wa ? `<a class="icon-btn" href="${wa}" target="_blank" rel="noopener" aria-label="WhatsApp de ${esc(c.name)}">${ic('whatsapp', 20)}</a>` : ''}
        <button class="icon-btn" data-book="${c.id}" aria-label="Agendar para ${esc(c.name)}">${ic('calendar', 20)}</button>
        <a class="icon-btn" href="#/clientes/${c.id}" aria-label="Abrir ficha">${ic('chevRight', 20)}</a></div></li>`;
    }).join('') : `<li style="display:block">${empty(ui.q ? 'Nenhuma cliente encontrada com essa busca.' : 'Nenhuma cliente aqui ainda.', `<button class="btn primary" data-new2>${ic('userPlus', 18)} Cadastrar cliente</button>`, 'users')}</li>`;
    list.querySelectorAll('[data-book]').forEach((b) => (b.onclick = () => {
      const c = rows.find((r) => r.id === Number(b.dataset.book));
      newVisit({ client: { id: c.id, name: c.name, phone: c.phone, preferred_pro_id: c.preferred_pro_id }, onSaved: () => toast('Agendado') });
    }));
    list.querySelector('[data-new2]')?.addEventListener('click', newClient);
  }
  const newClient = () => quickClient({ onSaved: (id) => (location.hash = `#/clientes/${id}`) });
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
  root.querySelector('[data-new]').onclick = newClient;
  await load();
}

/** Cadastro rápido: só o nome é obrigatório. */
export function quickClient({ client = null, onSaved } = {}) {
  modal({
    title: client ? 'Editar cliente' : 'Nova cliente',
    body: `<form novalidate>
      <label class="field"><span>Nome *</span><input name="name" required maxlength="80" value="${esc(client?.name || '')}" autofocus autocomplete="off"></label>
      <div class="row"><label class="field"><span>WhatsApp</span><input name="phone" inputmode="tel" maxlength="20" placeholder="(11) 99999-9999" value="${esc(fmtPhone(client?.phone))}"></label>
        <label class="field"><span>Aniversário</span><input name="birthday" placeholder="dd/mm" maxlength="10" value="${client?.birthday ? client.birthday.slice(-2) + '/' + client.birthday.slice(-5, -3) : ''}"></label></div>
      <label class="field" ${can.solo() ? 'hidden' : ''}><span>Profissional preferida</span><select name="preferred_pro_id"><option value="">Sem preferência</option>
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
              toast('Cliente cadastrada');
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
  const money_ = c.spent_cents != null;
  const pending = d.history.reduce((s, h) => s + Math.max(0, (h.total_cents || 0) - (h.paid_cents || 0)), 0);
  const TABS = [['history', 'Histórico'], ['services', 'Serviços'], ...(money_ ? [['payments', 'Pagamentos']] : []), ['upcoming', `Agendamentos (${d.upcoming.length})`]];
  if (!TABS.some(([k]) => k === ui.tab)) ui.tab = 'history';

  root.innerHTML = `
  <div class="page-head"><div style="position:relative;z-index:1;display:flex;gap:14px;align-items:center;min-width:0">
      ${avatar(c.name, null, 'xl')}
      <div style="min-width:0"><a class="back" href="#/clientes">${ic('arrowLeft', 16)} Clientes</a><h1>${esc(c.name)}</h1>
      <div class="sub">${fmtPhone(c.phone) || 'sem telefone'}${c.birthday ? ` · aniversário ${c.birthday.slice(-2)}/${c.birthday.slice(-5, -3)}` : ''} · cliente desde ${fmtDate(c.created_at)}</div></div></div>
    <div class="actions"><button class="btn primary" data-act="book">${ic('calendar', 18)} Agendar</button>
      ${wa ? `<a class="btn" href="${wa}" target="_blank" rel="noopener">${ic('whatsapp', 18)} WhatsApp</a>` : ''}
      ${c.phone ? `<a class="btn" href="tel:${esc(c.phone)}">${ic('phone', 18)} Ligar</a>` : ''}</div></div>
  ${c.notes ? `<div class="note-box" style="margin-bottom:14px;display:flex;gap:8px">${ic('alert', 18)}<span><b>Observações:</b> ${esc(c.notes)}</span></div>` : ''}
  <div class="kpis">
    <div class="kpi"><span class="k-ic">${ic('clock', 20)}</span><span>Última visita</span><b>${c.last_visit ? fmtDate(c.last_visit) : '—'}</b><small>${daysSince != null ? `há ${daysSince} dia(s)` : 'ainda não atendida'}</small></div>
    <div class="kpi"><span class="k-ic">${ic('heart', 20)}</span><span>Visitas</span><b>${c.visits_count}</b><small>${d.avg_interval_days ? `volta a cada ~${d.avg_interval_days} dias` : 'frequência ainda sem dados'}${d.no_shows ? ` · ${d.no_shows} falta(s)` : ''}</small></div>
    ${money_ ? `<div class="kpi"><span class="k-ic">${ic('coin', 20)}</span><span>Total gasto</span><b>${money(c.spent_cents)}</b><small>${pending ? `<span class="warn-t">${money(pending)} pendente</span>` : c.visits_count ? `média ${money(Math.round(c.spent_cents / c.visits_count))}` : ''}</small></div>` : ''}
    <div class="kpi"><span class="k-ic">${ic('sparkle', 20)}</span><span>Costuma ser atendida por</span><b style="font-size:1.1rem">${esc(d.usual_pro || c.preferred_pro_name || '—')}</b><small>${c.preferred_pro_name ? `preferida: ${esc(c.preferred_pro_name)}` : ''}</small></div>
  </div>
  <div class="actions" style="justify-content:flex-start;margin:0 0 14px">
    ${can.staff() ? `<button class="btn sm soft" data-act="sale">${ic('cart', 16)} Registrar venda</button>` : ''}
    <button class="btn sm soft" data-act="edit">${ic('edit', 16)} Editar dados e observações</button>
    ${can.staff() ? `<button class="btn sm ghost" data-act="archive">${ic('trash', 16)} Arquivar</button>` : ''}
  </div>
  <div class="tabs">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${ui.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div class="card" data-panel></div>`;

  const panels = {
    history: () => (d.history.length ? d.history.map((h) => `<div class="history-item ${can.staff() ? 'click' : ''}" ${can.staff() ? `data-sale="${h.id}" style="cursor:pointer"` : ''}>
        <div style="display:flex;justify-content:space-between;gap:8px"><b>${fmtDate(h.date)}</b>${h.total_cents != null ? `<b>${money(h.total_cents)}</b>` : ''}</div>
        ${h.items.map((i) => `<div class="small">${ic(i.kind === 'product' ? 'box' : 'scissors', 14, 'brand-t')} ${esc(i.name)}${i.qty !== 1 ? ` × ${i.qty}` : ''} <span class="muted">${i.pro_name ? '· ' + esc(i.pro_name) : ''}</span></div>`).join('')}</div>`).join('')
      : empty('Sem atendimentos ainda.', '', 'clock')),
    services: () => (d.last_by_service.length ? `<ul class="list">${d.last_by_service.map((s) => `<li><span class="avatar sm" style="background:var(--lav-100);color:var(--brand)">${ic('scissors', 16)}</span>
        <div class="grow"><div class="title">${esc(s.name)}</div><div class="meta">${s.times}× no total</div></div><div class="right"><b>${fmtDate(s.last_date)}</b><div class="meta">última vez</div></div></li>`).join('')}</ul>`
      : empty('Nenhum serviço realizado ainda.', '', 'scissors')),
    payments: () => (d.history.length ? `<div class="scroll-x"><table class="t"><thead><tr><th>Data</th><th>Formas</th><th class="num">Total</th><th class="num">Pago</th><th class="num">Pendente</th></tr></thead><tbody>
        ${d.history.map((h) => `<tr class="click" data-sale="${h.id}" style="cursor:pointer"><td>${fmtDate(h.date)}</td><td>${esc(h.methods || '—')}</td><td class="num">${money(h.total_cents)}</td><td class="num">${money(h.paid_cents)}</td>
          <td class="num ${h.total_cents > h.paid_cents ? 'warn-t' : ''}">${money(Math.max(0, h.total_cents - h.paid_cents))}</td></tr>`).join('')}</tbody></table></div>`
      : empty('Nenhum pagamento ainda.', '', 'wallet')),
    upcoming: () => (d.upcoming.length ? `<ul class="list">${d.upcoming.map((v) => `<li class="click" data-visit="${v.id}"><span class="avatar sm" style="background:var(--lav-100);color:var(--brand)">${ic('calendar', 16)}</span>
        <div class="grow"><div class="title">${fmtDayLong(v.date)} · ${v.start_at.slice(11)}</div><div class="meta">${esc(v.services)}</div></div>${badge(v.status)}</li>`).join('')}</ul>`
      : empty('Nada agendado.', `<button class="btn sm primary" data-act="book">${ic('calendar', 16)} Agendar agora</button>`, 'calendar')),
  };
  const panel = root.querySelector('[data-panel]');
  const draw = () => (panel.innerHTML = panels[ui.tab]());
  draw();
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => {
    ui.tab = b.dataset.tab;
    root.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
    draw();
  }));
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
