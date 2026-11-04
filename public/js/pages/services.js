import { state, GET, POST, PUT, DEL, esc, money, moneyIn, toCents, modal, toast, fail, confirmBox, submitting, empty, loadRefs } from '../core.js';
import { refresh } from '../app.js';

// Sugestões para cadastrar rápido os serviços mais comuns de salão
const SUGGESTIONS = [
  ['Cabelo', 'Corte feminino', 60, 8000], ['Cabelo', 'Escova', 45, 6000], ['Cabelo', 'Coloração', 120, 18000], ['Cabelo', 'Hidratação', 45, 7000],
  ['Cabelo', 'Progressiva', 180, 30000], ['Cabelo', 'Mechas / luzes', 180, 35000], ['Unhas', 'Manicure', 45, 3500], ['Unhas', 'Pedicure', 50, 4000],
  ['Unhas', 'Pé e mão', 90, 7000], ['Unhas', 'Alongamento em gel', 120, 15000], ['Sobrancelhas', 'Design de sobrancelha', 30, 4500],
  ['Sobrancelhas', 'Design com henna', 45, 6000], ['Maquiagem', 'Maquiagem social', 60, 15000], ['Estética', 'Limpeza de pele', 60, 12000],
];

export default async function services(root) {
  const list = await GET('/api/services?all=1');
  const groups = {};
  for (const s of list) (groups[s.category_name || 'Sem categoria'] ||= []).push(s);
  root.innerHTML = `<div class="page-head"><div><h1>Serviços e preços</h1><div class="sub">${list.filter((s) => s.active).length} serviço(s) ativo(s)</div></div>
    <div class="actions" style="margin:0"><button class="btn" data-cats>Categorias</button><button class="btn primary" data-new>＋ Novo serviço</button></div></div>
    ${!state.pros.length ? '<div class="alert warn">Cadastre primeiro sua equipe em <a href="#/equipe">&nbsp;Equipe</a>: cada serviço precisa de profissionais habilitadas.</div>' : ''}
    ${list.length ? Object.entries(groups).map(([g, items]) => `<div class="card"><h2>${esc(g)}</h2><ul class="list">${items.map((s) => `<li class="click" data-edit="${s.id}">
      <div class="grow"><div class="title">${esc(s.name)} ${s.active ? '' : '<span class="tag">inativo</span>'} ${s.online ? '<span class="tag ok">online</span>' : ''}</div>
      <div class="meta">${s.duration_min} min · ${s.pros.map((l) => esc(state.pros.find((p) => p.id === l.professional_id)?.name || '?') + (l.price_cents != null ? ` (${money(l.price_cents)})` : '')).join(', ') || '<span class="err-t">nenhuma profissional</span>'}
      ${s.commission_type ? ` · comissão ${s.commission_type === 'fixed' ? money(s.commission_value) : s.commission_value + '%'}` : ''}</div></div><b>${money(s.price_cents)}</b></li>`).join('')}</ul></div>`).join('')
      : `<div class="card">${empty('Nenhum serviço cadastrado.')}<h3>Comece rápido com sugestões (você ajusta preço e duração):</h3>
        <div class="chips" style="margin-top:8px">${SUGGESTIONS.map((s, i) => `<button class="chip" data-sug="${i}">${s[1]}</button>`).join('')}</div></div>`}`;
  root.querySelector('[data-new]').onclick = () => edit();
  root.querySelector('[data-cats]').onclick = categories;
  root.querySelectorAll('[data-edit]').forEach((li) => (li.onclick = () => edit(list.find((s) => s.id === Number(li.dataset.edit)))));
  root.querySelectorAll('[data-sug]').forEach((b) => (b.onclick = () => {
    const [cat, name, dur, price] = SUGGESTIONS[b.dataset.sug];
    edit({ name, duration_min: dur, price_cents: price, category_id: state.categories.find((c) => c.name === cat)?.id, pros: [], active: 1, _new: true });
  }));
}

function edit(s = null) {
  const isNew = !s || s._new;
  const pros = state.pros.filter((p) => p.active || s?.pros?.some((l) => l.professional_id === p.id));
  const link = (pid) => s?.pros?.find((l) => l.professional_id === pid);
  modal({
    title: isNew ? 'Novo serviço' : `Editar ${s.name}`,
    wide: true,
    body: `<form novalidate>
      <div class="row"><label class="field"><span>Nome *</span><input name="name" maxlength="80" value="${esc(s?.name || '')}" autofocus></label>
        <label class="field"><span>Categoria</span><select name="category_id"><option value="">Sem categoria</option>${state.categories.map((c) => `<option value="${c.id}" ${c.id === s?.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
      <div class="row"><label class="field"><span>Preço (R$) *</span><input name="price" inputmode="decimal" value="${moneyIn(s?.price_cents)}"></label>
        <label class="field"><span>Duração (min) *</span><input name="duration_min" inputmode="numeric" value="${s?.duration_min || 60}"></label></div>
      <label class="field"><span>Descrição</span><input name="description" maxlength="300" value="${esc(s?.description || '')}"></label>
      <div class="row"><label class="field"><span>Comissão do serviço</span><select name="ctype"><option value="">Usar padrão de cada profissional</option>
        <option value="pct" ${s?.commission_type === 'pct' ? 'selected' : ''}>% sobre o valor</option><option value="fixed" ${s?.commission_type === 'fixed' ? 'selected' : ''}>Valor fixo (R$)</option></select></label>
        <label class="field"><span>Valor da comissão</span><input name="cvalue" inputmode="decimal" value="${s?.commission_type === 'fixed' ? moneyIn(s.commission_value) : s?.commission_value ?? ''}"></label></div>
      <h3 style="margin:6px 0 4px">Profissionais que fazem este serviço *</h3>
      <p class="small muted" style="margin:0 0 8px">Preço e comissão próprios são opcionais (deixe em branco para usar o padrão).</p>
      ${pros.length ? pros.map((p) => { const l = link(p.id); return `<div class="svc-line" style="padding:8px 10px"><label class="check" style="margin:0"><input type="checkbox" data-pro="${p.id}" ${l || (isNew && pros.length === 1) ? 'checked' : ''}> <span class="dot" style="background:${esc(p.color)}"></span><b>${esc(p.name)}</b> <span class="muted small">${esc(p.specialty || '')}</span></label>
        <div class="row3" style="margin-top:6px"><input placeholder="Preço próprio" inputmode="decimal" data-pp="${p.id}" value="${moneyIn(l?.price_cents)}">
          <select data-pct="${p.id}"><option value="">Comissão padrão</option><option value="pct" ${l?.commission_type === 'pct' ? 'selected' : ''}>%</option><option value="fixed" ${l?.commission_type === 'fixed' ? 'selected' : ''}>R$ fixo</option></select>
          <input placeholder="Valor" inputmode="decimal" data-pcv="${p.id}" value="${l?.commission_type === 'fixed' ? moneyIn(l.commission_value) : l?.commission_value ?? ''}"></div></div>`; }).join('') : '<p class="err-t small">Cadastre profissionais primeiro.</p>'}
      <label class="check"><input type="checkbox" name="online" ${s?.online ? 'checked' : ''}> Disponível para agendamento online</label>
      ${!isNew ? `<label class="check"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> Ativo</label>` : ''}
      <div class="actions stretch"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`,
    onMount(el, close) {
      const f = el.querySelector('form');
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
          const pl = [...el.querySelectorAll('[data-pro]:checked')].map((cb) => {
            const id = cb.dataset.pro;
            const pp = el.querySelector(`[data-pp="${id}"]`).value.trim();
            const pc = commission(el.querySelector(`[data-pct="${id}"]`).value, el.querySelector(`[data-pcv="${id}"]`).value.trim(), 'comissão da profissional');
            const pcents = pp ? toCents(pp) : null;
            if (Number.isNaN(pcents)) throw new Error('Preço próprio inválido');
            return { professional_id: Number(id), price_cents: pcents, commission_type: pc.type, commission_value: pc.value };
          });
          const body = { name: f.name.value, category_id: f.category_id.value || null, price_cents: price, duration_min: Number(f.duration_min.value), description: f.description.value,
            commission_type: c.type, commission_value: c.value, online: f.online.checked, active: isNew ? true : f.active.checked, pros: pl };
          if (isNew) await POST('/api/services', body);
          else await PUT(`/api/services/${s.id}`, body);
          await loadRefs(true);
          close();
          toast('Serviço salvo ✓');
          refresh();
        }).catch(() => {});
      };
    },
  });
}

function categories() {
  const render = () => `<ul class="list">${state.categories.map((c) => `<li><div class="grow">${esc(c.name)}</div><button class="btn sm ghost" data-ren="${c.id}">Renomear</button><button class="btn sm ghost" data-del="${c.id}">Excluir</button></li>`).join('')}</ul>
    <form class="row" style="margin-top:10px" data-add><input name="name" placeholder="Nova categoria" maxlength="40"><button class="btn primary">Adicionar</button></form>`;
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
