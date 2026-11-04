import { state, GET, POST, PUT, DEL, esc, money, moneyIn, toCents, modal, toast, fail, confirmBox, submitting, empty, loadRefs, ic, avatar, pageHead, photoField, can, soloPro } from '../core.js';
import { refresh } from '../app.js';

// Sugestões para cadastrar rápido os serviços mais comuns de salão
const SUGGESTIONS = [
  ['Cabelo', 'Corte feminino', 60, 8000], ['Cabelo', 'Escova', 45, 6000], ['Cabelo', 'Coloração', 120, 18000], ['Cabelo', 'Hidratação', 45, 7000],
  ['Cabelo', 'Progressiva', 180, 30000], ['Cabelo', 'Mechas / luzes', 180, 35000], ['Unhas', 'Manicure', 45, 3500], ['Unhas', 'Pedicure', 50, 4000],
  ['Unhas', 'Pé e mão', 90, 7000], ['Unhas', 'Alongamento em gel', 120, 15000], ['Sobrancelhas', 'Design de sobrancelha', 30, 4500],
  ['Sobrancelhas', 'Design com henna', 45, 6000], ['Maquiagem', 'Maquiagem social', 60, 15000], ['Estética', 'Limpeza de pele', 60, 12000],
];
const ui = { cat: '', q: '' };

export default async function services(root, { query }) {
  const list = await GET('/api/services?all=1');
  const cats = [...new Set(list.map((s) => s.category_name || 'Sem categoria'))];
  if (ui.cat && !cats.includes(ui.cat)) ui.cat = '';
  root.innerHTML = `${pageHead('Serviços', `${list.filter((s) => s.active).length} serviço(s) ativo(s) · ${list.filter((s) => s.active && s.online).length} no agendamento online`,
    `<button class="btn" data-cats>${ic('layers', 18)} Categorias</button><button class="btn primary" data-new>${ic('plus', 18)} Adicionar serviço</button>`)}
    ${!state.pros.length ? `<div class="alert warn"><span class="a-ic">${ic('alert', 18)}</span><span>Cadastre primeiro sua equipe em <a href="#/equipe?nova=1">Equipe</a>: cada serviço precisa de profissionais habilitadas.</span></div>` : ''}
    ${list.length ? `<div class="searchbox" style="margin-bottom:12px">${ic('search', 18)}<input type="search" placeholder="Buscar serviço" value="${esc(ui.q)}" data-q aria-label="Buscar serviço"></div>
      <div class="chips scroll" style="margin-bottom:14px"><button class="chip ${ui.cat ? '' : 'on'}" data-cat="">Todos</button>${cats.map((c) => `<button class="chip ${ui.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="svc-grid" data-grid></div>`
      : `<div class="card">${empty('Nenhum serviço cadastrado ainda.', '', 'scissors')}<h3 style="text-align:center">Comece rápido com sugestões (você ajusta preço e duração):</h3>
        <div class="chips" style="margin-top:12px;justify-content:center">${SUGGESTIONS.map((s, i) => `<button class="chip" data-sug="${i}">${ic('plus', 14)} ${s[1]}</button>`).join('')}</div></div>`}`;
  const grid = root.querySelector('[data-grid]');
  const draw = () => {
    if (!grid) return;
    const q = ui.q.toLowerCase();
    const rows = list.filter((s) => (!ui.cat || (s.category_name || 'Sem categoria') === ui.cat) && (!q || s.name.toLowerCase().includes(q)));
    grid.innerHTML = rows.length ? rows.map((s) => `<div class="svc-card" data-edit="${s.id}" role="button" tabindex="0" style="${s.active ? '' : 'opacity:.55'}">
      <div class="thumb">${s.photo_url ? `<img src="${esc(s.photo_url)}" alt="" loading="lazy">` : ic('scissors', 26)}</div>
      <div class="grow"><b>${esc(s.name)}</b>
        <div class="small muted">${s.duration_min} min${!s.pros.length && !can.solo() ? ' · <span class="err-t">sem profissional</span>' : ''}</div>
        <div style="margin-top:4px">${s.active ? (s.online ? `<span class="tag pink">${ic('globe', 12)} agendamento online</span>` : '<span class="tag">só no salão</span>') : '<span class="tag">inativo</span>'}</div></div>
      <div class="price">${money(s.price_cents)}</div></div>`).join('') : `<div class="card" style="grid-column:1/-1">${empty('Nenhum serviço encontrado.', '', 'search')}</div>`;
    grid.querySelectorAll('[data-edit]').forEach((c) => {
      const open = () => edit(list.find((s) => s.id === Number(c.dataset.edit)));
      c.onclick = open;
      c.onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open());
    });
  };
  draw();
  root.querySelector('[data-q]')?.addEventListener('input', (e) => ((ui.q = e.target.value), draw()));
  root.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => {
    ui.cat = b.dataset.cat;
    root.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === b));
    draw();
  }));
  root.querySelector('[data-new]').onclick = () => edit();
  root.querySelector('[data-cats]').onclick = categories;
  root.querySelectorAll('[data-sug]').forEach((b) => (b.onclick = () => {
    const [cat, name, dur, price] = SUGGESTIONS[b.dataset.sug];
    edit({ name, duration_min: dur, price_cents: price, category_id: state.categories.find((c) => c.name === cat)?.id, pros: [], active: 1, online: 1, _new: true });
  }));
  if (query.novo && !services.opened) (services.opened = true), edit();
}

function edit(s = null) {
  const isNew = !s || s._new;
  const pros = state.pros.filter((p) => p.active || s?.pros?.some((l) => l.professional_id === p.id));
  const link = (pid) => s?.pros?.find((l) => l.professional_id === pid);
  modal({
    title: isNew ? 'Adicionar serviço' : `Editar ${s.name}`,
    wide: true,
    body: `<form novalidate>
      <div data-photo style="margin-bottom:14px"></div>
      <div class="row"><label class="field"><span>Nome *</span><input name="name" maxlength="80" value="${esc(s?.name || '')}" autofocus></label>
        <label class="field"><span>Categoria</span><select name="category_id"><option value="">Sem categoria</option>${state.categories.map((c) => `<option value="${c.id}" ${c.id === s?.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
      <div class="row"><label class="field"><span>Preço (R$) *</span><input name="price" inputmode="decimal" value="${moneyIn(s?.price_cents)}"></label>
        <label class="field"><span>Duração (min) *</span><input name="duration_min" inputmode="numeric" value="${s?.duration_min || 60}"></label></div>
      <label class="field"><span>Descrição <small>— aparece para a cliente no agendamento online</small></span><input name="description" maxlength="300" value="${esc(s?.description || '')}" placeholder="Ex.: inclui lavagem e finalização"></label>
      <label class="check"><span class="switch"><input type="checkbox" name="online" ${s?.online ? 'checked' : ''}><i></i></span> Disponível para agendamento online</label>
      ${!isNew ? `<label class="check"><span class="switch"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}><i></i></span> Serviço ativo</label>` : ''}
      <div ${can.solo() ? 'hidden' : ''}><h3 style="margin:12px 0 4px">Profissionais que fazem este serviço *</h3>
      <p class="small muted" style="margin:0 0 8px">Preço e comissão próprios são opcionais — deixe em branco para usar o padrão.</p>
      ${pros.length ? pros.map((p) => { const l = link(p.id); return `<div class="svc-line" style="padding:10px"><label class="check" style="margin:0">${avatar(p.name, p.photo_url, 'sm')}<input type="checkbox" data-pro="${p.id}" ${l || (isNew && pros.length === 1) ? 'checked' : ''}> <b>${esc(p.name)}</b> <span class="muted small">${esc(p.specialty || '')}</span></label>
        <div class="row3" style="margin-top:8px"><input placeholder="Preço próprio" inputmode="decimal" data-pp="${p.id}" value="${moneyIn(l?.price_cents)}" aria-label="Preço próprio de ${esc(p.name)}">
          <select data-pct="${p.id}" aria-label="Tipo de comissão"><option value="">Comissão padrão</option><option value="pct" ${l?.commission_type === 'pct' ? 'selected' : ''}>%</option><option value="fixed" ${l?.commission_type === 'fixed' ? 'selected' : ''}>R$ fixo</option></select>
          <input placeholder="Valor" inputmode="decimal" data-pcv="${p.id}" value="${l?.commission_type === 'fixed' ? moneyIn(l.commission_value) : l?.commission_value ?? ''}" aria-label="Valor da comissão"></div></div>`; }).join('') : '<p class="err-t small">Cadastre profissionais primeiro.</p>'}
      <details style="margin-top:8px"><summary class="small" style="cursor:pointer;font-weight:700;color:var(--brand)">Comissão deste serviço (opcional)</summary>
        <div class="row" style="margin-top:10px"><label class="field"><span>Tipo</span><select name="ctype"><option value="">Usar padrão de cada profissional</option>
          <option value="pct" ${s?.commission_type === 'pct' ? 'selected' : ''}>% sobre o valor</option><option value="fixed" ${s?.commission_type === 'fixed' ? 'selected' : ''}>Valor fixo (R$)</option></select></label>
          <label class="field"><span>Valor</span><input name="cvalue" inputmode="decimal" value="${s?.commission_type === 'fixed' ? moneyIn(s.commission_value) : s?.commission_value ?? ''}"></label></div></details></div>
      <div class="actions stretch"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`,
    onMount(el, close) {
      const f = el.querySelector('form');
      const photo = photoField(el.querySelector('[data-photo]'), { current: s?.photo_url, label: 'Foto do serviço (aparece para a cliente)', max: 900 });
      const commission = (type, raw, label) => {
        if (!type) return { type: null, value: null };
        if (raw === '' || raw == null) throw new Error(`Informe o valor da ${label}`);
        const v = type === 'fixed' ? toCents(raw) : Number(String(raw).replace(',', '.'));
        if (!Number.isFinite(v)) throw new Error(`Valor inválido na ${label}`);
        return { type, value: v };
      };
      f.onsubmit = async (e) => {
        e.preventDefault();
        await submitting(f.querySelector('[type=submit]'), async () => {
          const price = toCents(f.price.value);
          if (price == null || Number.isNaN(price)) throw new Error('Informe o preço');
          const c = commission(f.ctype.value, f.cvalue.value, 'comissão do serviço');
          const solo = can.solo() && soloPro();
          if (solo) el.querySelectorAll('[data-pro]').forEach((cb) => (cb.checked = Number(cb.dataset.pro) === solo.id));
          const pl = [...el.querySelectorAll('[data-pro]:checked')].map((cb) => {
            const id = cb.dataset.pro;
            const pp = el.querySelector(`[data-pp="${id}"]`).value.trim();
            const pc = commission(el.querySelector(`[data-pct="${id}"]`).value, el.querySelector(`[data-pcv="${id}"]`).value.trim(), 'comissão da profissional');
            const pcents = pp ? toCents(pp) : null;
            if (Number.isNaN(pcents)) throw new Error('Preço próprio inválido');
            return { professional_id: Number(id), price_cents: pcents, commission_type: pc.type, commission_value: pc.value };
          });
          const body = { name: f.name.value, category_id: f.category_id.value || null, price_cents: price, duration_min: Number(f.duration_min.value), description: f.description.value,
            commission_type: c.type, commission_value: c.value, online: f.online.checked, active: isNew ? true : f.active.checked, pros: pl, photo: photo.get() };
          if (isNew) await POST('/api/services', body);
          else await PUT(`/api/services/${s.id}`, body);
          await loadRefs(true);
          close();
          toast('Serviço salvo');
          refresh();
        }).catch(() => {});
      };
    },
  });
}

function categories() {
  const render = () => `<ul class="list">${state.categories.map((c) => `<li><span class="avatar sm" style="background:var(--lav-100);color:var(--brand)">${ic('layers', 16)}</span><div class="grow"><b>${esc(c.name)}</b></div>
      <button class="btn xs soft" data-ren="${c.id}">Renomear</button><button class="icon-btn" data-del="${c.id}" aria-label="Excluir ${esc(c.name)}">${ic('trash', 18)}</button></li>`).join('')}</ul>
    <form class="row" style="margin-top:12px" data-add><input name="name" placeholder="Nova categoria (ex.: Cílios)" maxlength="40" aria-label="Nova categoria"><button class="btn primary">${ic('plus', 16)} Adicionar</button></form>`;
  modal({
    title: 'Categorias de serviço',
    body: '<div data-c></div>',
    onMount(el) {
      const box = el.querySelector('[data-c]');
      const draw = () => {
        box.innerHTML = render();
        box.querySelector('[data-add]').onsubmit = async (e) => {
          e.preventDefault();
          const name = e.target.name.value.trim();
          if (!name) return;
          await POST('/api/categories', { name }).then(after).catch(fail);
        };
        box.querySelectorAll('[data-ren]').forEach((b) => (b.onclick = async () => {
          const name = await confirmBox('Novo nome da categoria', { ok: 'Salvar', input: 'Nome' });
          if (name) await PUT(`/api/categories/${b.dataset.ren}`, { name }).then(after).catch(fail);
        }));
        box.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
          if (await confirmBox('Excluir esta categoria?', { ok: 'Excluir', danger: true })) await DEL(`/api/categories/${b.dataset.del}`).then(after).catch(fail);
        }));
      };
      const after = async () => {
        await loadRefs(true);
        draw();
        refresh();
      };
      draw();
    },
  });
}
