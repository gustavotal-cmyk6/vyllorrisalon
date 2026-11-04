import { state, GET, POST, PUT, esc, modal, toast, fail, submitting, can, empty, loadRefs, ic, avatar, pageHead, photoField, pickImage, fmtPhone, ROLE_LABEL } from '../core.js';
import { refresh } from '../app.js';

const ROLE_HELP = {
  owner: 'Acesso total, inclusive configurações do salão e acessos da equipe.',
  manager: 'Tudo da proprietária (agenda, vendas, financeiro, comissões, equipe, relatórios), exceto configurações e acessos.',
  reception: 'Agenda, clientes, vendas, recebimentos, estoque e fechamento de caixa. Não vê financeiro, comissões nem relatórios.',
  pro: 'Só a própria agenda, as clientes (sem valores gastos) e as próprias comissões.',
};
const ui = { tab: 'salon' };

export default async function settings(root) {
  const owner = can.owner();
  const TABS = owner ? [['salon', 'Perfil do salão'], ['booking', 'Agendamento online'], ['payments', 'Pagamentos'], ['users', 'Acessos'], ['me', 'Minha conta']] : [['me', 'Minha conta']];
  if (!TABS.some(([k]) => k === ui.tab)) ui.tab = TABS[0][0];
  root.innerHTML = `${pageHead('Configurações', `${esc(state.user.name)} · ${ROLE_LABEL[state.user.role]}`)}
    ${TABS.length > 1 ? `<div class="tabs">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${ui.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
    <div data-body><div class="loading">Carregando…</div></div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => ((ui.tab = b.dataset.tab), refresh())));
  const body = root.querySelector('[data-body]');
  if (ui.tab === 'salon') return salonTab(body);
  if (ui.tab === 'booking') return bookingTab(body);
  if (ui.tab === 'payments') return paymentsTab(body);
  if (ui.tab === 'users') return usersTab(body);
  meTab(body);
}

async function salonTab(body) {
  const s = await GET('/api/salon');
  let gallery = s.gallery.map((id, i) => ({ id, url: s.gallery_urls[i] }));
  body.innerHTML = `<form class="card" novalidate data-form>
    <p class="small muted" style="margin-bottom:14px">Estas informações aparecem na página de agendamento das clientes.</p>
    <div class="grid g2" style="margin-bottom:6px"><div data-logo></div><div data-cover></div></div>
    <label class="field"><span>Nome do salão *</span><input name="name" value="${esc(s.name)}" maxlength="80"></label>
    <label class="field"><span>Apresentação</span><textarea name="description" maxlength="600" placeholder="Ex.: Salão especializado em coloração e cuidados com os cabelos, no coração da Vila Mariana.">${esc(s.description || '')}</textarea></label>
    <label class="field"><span>Endereço</span><input name="address" maxlength="200" value="${esc(s.address || '')}" placeholder="Rua, número, bairro, cidade"></label>
    <div class="row"><label class="field"><span>WhatsApp do salão</span><input name="phone" inputmode="tel" maxlength="20" value="${esc(fmtPhone(s.phone))}"></label>
      <label class="field"><span>Instagram</span><input name="instagram" maxlength="60" value="${esc(s.instagram ? '@' + s.instagram : '')}" placeholder="@seusalao"></label></div>
    <label class="field"><span>Horário de funcionamento</span><input name="opening_hours" maxlength="200" value="${esc(s.opening_hours || '')}" placeholder="Ter a sáb, 9h às 19h"></label>
    <div class="field"><span>Fotos do espaço e dos trabalhos <small>(até 8)</small></span><div class="gallery-pick" data-gallery></div></div>
    <div class="actions"><button class="btn primary">${ic('check', 18)} Salvar perfil</button></div></form>`;
  const logo = photoField(body.querySelector('[data-logo]'), { current: s.logo_url, label: 'Logo', round: true, max: 400 });
  const cover = photoField(body.querySelector('[data-cover]'), { current: s.cover_url, label: 'Foto de capa', wide: true, max: 1400 });
  const gbox = body.querySelector('[data-gallery]');
  const drawGallery = () => {
    gbox.innerHTML = gallery.map((g, i) => `<div class="g"><img src="${esc(g.url)}" alt="Foto ${i + 1}"><button type="button" data-rm="${i}" aria-label="Remover foto">${ic('x', 16)}</button></div>`).join('') +
      (gallery.length < 8 ? `<button type="button" class="add" data-add>${ic('plus', 22)}<br>Adicionar</button>` : '');
    gbox.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => (gallery.splice(Number(b.dataset.rm), 1), drawGallery())));
    gbox.querySelector('[data-add]')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try {
        const r = await pickImage({ max: 1200 });
        if (r) gallery.push({ id: r.id, url: r.url });
      } catch (err) {
        fail(err);
      }
      drawGallery();
    });
  };
  drawGallery();
  body.querySelector('[data-form]').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    await submitting(f.querySelector('.actions .btn'), async () => {
      const r = await PUT('/api/salon/profile', {
        name: f.name.value, description: f.description.value, address: f.address.value, phone: f.phone.value, instagram: f.instagram.value,
        opening_hours: f.opening_hours.value, logo: logo.get(), cover_photo: cover.get(), gallery: gallery.map((g) => g.id), cancel_hours: s.cancel_hours,
      });
      state.user.salon_name = r.name;
      state.user.logo_url = r.logo_url;
      toast('Perfil do salão salvo');
      document.getElementById('app').innerHTML = '';
      refresh();
    }).catch(() => {});
  };
}

async function bookingTab(body) {
  const [s, services] = await Promise.all([GET('/api/salon'), GET('/api/services')]);
  const slugOf = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const online = services.filter((x) => x.online).length;
  const link = s.slug ? `${location.origin}/agendar/${s.slug}` : '';
  body.innerHTML = `<div class="card"><div class="card-head"><h2>Agendamento online</h2><span class="tag ${s.booking_enabled ? 'ok' : ''}">${s.booking_enabled ? 'Ativo' : 'Desligado'}</span></div>
    <p class="small muted" style="margin-bottom:14px">Suas clientes escolhem serviço, profissional e horário livre pelo link, sem cadastro nem senha. O pedido cai na agenda como “A confirmar”, com a etiqueta <b>online</b>.</p>
    ${s.booking_enabled && link ? `<div class="booking-link" style="margin-bottom:14px">${ic('link', 18, 'brand-t')}<span style="flex:1;min-width:180px">${esc(link)}</span>
      <button class="btn xs soft" data-copy>${ic('copy', 14)} Copiar</button><a class="btn xs soft" href="${esc(link)}" target="_blank" rel="noopener">${ic('external', 14)} Abrir</a>
      <a class="btn xs soft" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Agende seu horário online: ' + link)}">${ic('whatsapp', 14)} Enviar</a></div>` : ''}
    <form data-booking novalidate>
      <label class="check"><span class="switch"><input type="checkbox" name="enabled" ${s.booking_enabled ? 'checked' : ''}><i></i></span> Aceitar agendamentos online</label>
      <label class="field"><span>Endereço da sua página</span><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span class="muted small nowrap">${esc(location.host)}/agendar/</span><input name="slug" maxlength="40" value="${esc(s.slug || slugOf(state.user.salon_name))}" style="flex:1;min-width:160px"></div></label>
      <label class="field"><span>Cancelamento pela cliente</span><select name="cancel_hours">${[[0, 'A qualquer momento'], [2, 'Até 2 horas antes'], [6, 'Até 6 horas antes'], [12, 'Até 12 horas antes'], [24, 'Até 24 horas antes'], [48, 'Até 48 horas antes']].map(([v, l]) => `<option value="${v}" ${s.cancel_hours === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <small>Depois desse prazo, a cliente é orientada a falar com o salão pelo WhatsApp.</small></label>
      ${online ? `<p class="small ok-t" style="margin-bottom:10px">${ic('checkCircle', 16)} ${online} serviço(s) disponível(is) online.</p>` : `<p class="small warn-t" style="margin-bottom:10px">${ic('alert', 16)} Nenhum serviço marcado como “Disponível para agendamento online”. Marque em <a href="#/servicos">Serviços</a>.</p>`}
      <button class="btn primary">${ic('check', 18)} Salvar</button></form></div>
    <div class="card soft"><h3>Dica</h3><p class="small" style="margin-top:6px;line-height:1.6">Coloque o link na bio do Instagram e na mensagem automática do WhatsApp Business. Complete o <b>Perfil do salão</b> com logo, capa e fotos dos trabalhos para a página ficar com a cara do seu salão.</p></div>`;
  body.querySelector('[data-booking]').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    await submitting(f.querySelector('button'), async () => {
      await PUT('/api/salon/booking', { slug: f.slug.value, enabled: f.enabled.checked });
      const p = await GET('/api/salon');
      await PUT('/api/salon/profile', { ...p, gallery: p.gallery, cancel_hours: Number(f.cancel_hours.value) });
      toast(f.enabled.checked ? 'Agendamento online ativado' : 'Agendamento online desligado');
      refresh();
    }).catch(() => {});
  };
  body.querySelector('[data-copy]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copiado');
    } catch {
      toast(link);
    }
  });
}

async function paymentsTab(body) {
  const methods = await GET('/api/payment-methods');
  body.innerHTML = `<div class="card"><h2>Formas de pagamento</h2>
    <ul class="list">${methods.map((m) => `<li><span class="avatar sm" style="background:var(--lav-100);color:var(--brand)">${ic(/dinheiro/i.test(m.name) ? 'coin' : /pix/i.test(m.name) ? 'zap' : 'card', 16)}</span><div class="grow"><b>${esc(m.name)}</b></div>
      <label class="switch" aria-label="Ativar ${esc(m.name)}"><input type="checkbox" data-pm="${m.id}" ${m.active ? 'checked' : ''}><i></i></label></li>`).join('')}</ul>
    <form class="row" data-addpm style="margin-top:12px"><input name="name" placeholder="Ex.: Vale-presente, Link de pagamento" maxlength="30" aria-label="Nova forma de pagamento"><button class="btn primary">${ic('plus', 16)} Adicionar</button></form></div>`;
  body.querySelectorAll('[data-pm]').forEach((cb) => (cb.onchange = async () => {
    await PUT(`/api/payment-methods/${cb.dataset.pm}`, { active: cb.checked }).then(() => loadRefs(true)).then(() => toast('Atualizado')).catch(fail);
  }));
  body.querySelector('[data-addpm]').onsubmit = async (e) => {
    e.preventDefault();
    if (!e.target.name.value.trim()) return;
    await POST('/api/payment-methods', { name: e.target.name.value }).then(() => loadRefs(true)).then(refresh).catch(fail);
  };
}

async function usersTab(body) {
  const users = await GET('/api/users');
  body.innerHTML = `<div class="card"><div class="card-head"><h2>Acessos da equipe</h2><button class="btn sm primary" data-newuser>${ic('plus', 16)} Novo acesso</button></div>
    ${users.length ? `<ul class="list">${users.map((u) => `<li>${avatar(u.name, u.professional_id ? state.pros.find((p) => p.id === u.professional_id)?.photo_url : null, 'sm')}
      <div class="grow"><div class="title">${esc(u.name)} ${u.active ? '' : '<span class="tag err">bloqueado</span>'}</div>
      <div class="meta">${esc(u.email)} · ${ROLE_LABEL[u.role]}${u.professional_name ? ' · agenda de ' + esc(u.professional_name) : ''}</div></div>
      <button class="icon-btn" data-user="${u.id}" aria-label="Editar acesso de ${esc(u.name)}">${ic('edit', 18)}</button></li>`).join('')}</ul>` : empty('Nenhum acesso.', '', 'lock')}</div>
    <div class="card soft"><h3>O que cada perfil pode fazer</h3><div style="display:grid;gap:8px;margin-top:10px">${Object.entries(ROLE_HELP).map(([k, v]) => `<div class="small"><b>${ROLE_LABEL[k]}:</b> ${v}</div>`).join('')}</div></div>`;
  body.querySelector('[data-newuser]').onclick = () => editUser();
  body.querySelectorAll('[data-user]').forEach((b) => (b.onclick = () => editUser(users.find((u) => u.id === Number(b.dataset.user)))));
}

function meTab(body) {
  body.innerHTML = `<div class="card"><div style="display:flex;gap:14px;align-items:center;margin-bottom:16px">${avatar(state.user.name, null, 'lg')}<div><b style="font-size:1.1rem">${esc(state.user.name)}</b>
      <div class="small muted">${esc(state.user.email)} · ${ROLE_LABEL[state.user.role]} · ${esc(state.user.salon_name)}</div></div></div>
    <h2 style="margin-bottom:10px">Trocar senha</h2><form data-pw novalidate>
    <div class="row"><label class="field"><span>Senha atual</span><input type="password" name="current" autocomplete="current-password"></label>
    <label class="field"><span>Nova senha</span><input type="password" name="password" minlength="8" autocomplete="new-password"><small>Mínimo de 8 caracteres</small></label></div>
    <button class="btn primary">${ic('lock', 18)} Alterar senha</button></form></div>
    <div class="card soft"><p class="small muted">${ic('lock', 16)} Os dados de cada salão ficam separados e só pessoas com acesso autorizado conseguem vê-los.</p></div>`;
  body.querySelector('[data-pw]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    await submitting(f.querySelector('button'), async () => {
      await POST('/api/me/password', { current: f.current.value, password: f.password.value });
      f.reset();
      toast('Senha alterada');
    }).catch(() => {});
  });
}

function editUser(u = null) {
  const pros = state.pros.filter((p) => p.active);
  modal({
    title: u ? `Acesso de ${u.name}` : 'Novo acesso',
    body: `<form novalidate>
      <label class="field"><span>Nome *</span><input name="name" maxlength="80" value="${esc(u?.name || '')}" autofocus></label>
      ${u ? `<p class="small muted" style="margin-bottom:10px">${esc(u.email)}</p>` : '<label class="field"><span>E-mail de login *</span><input name="email" type="email" autocomplete="off"></label>'}
      <label class="field"><span>Perfil</span><select name="role">${Object.entries(ROLE_LABEL).map(([k, v]) => `<option value="${k}" ${u?.role === k || (!u && k === 'reception') ? 'selected' : ''}>${v}</option>`).join('')}</select><small data-help></small></label>
      <label class="field" data-pro><span>Agenda de qual profissional?</span><select name="professional_id"><option value="">Escolha…</option>${pros.map((p) => `<option value="${p.id}" ${p.id === u?.professional_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="field"><span>${u ? 'Nova senha (deixe vazio para manter)' : 'Senha inicial *'}</span><input name="password" type="password" minlength="8" autocomplete="new-password"><small>Mínimo de 8 caracteres. Peça para a pessoa trocar depois.</small></label>
      ${u ? `<label class="check"><span class="switch"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}><i></i></span> Acesso liberado</label>` : ''}
      <div class="actions stretch"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`,
    onMount(el, close) {
      const f = el.querySelector('form');
      const sync = () => {
        el.querySelector('[data-pro]').classList.toggle('hidden', f.role.value !== 'pro');
        el.querySelector('[data-help]').textContent = ROLE_HELP[f.role.value];
      };
      f.role.onchange = sync;
      sync();
      f.onsubmit = async (e) => {
        e.preventDefault();
        await submitting(f.querySelector('[type=submit]'), async () => {
          const body = { name: f.name.value, role: f.role.value, professional_id: f.professional_id.value || null, password: f.password.value || undefined };
          if (u) await PUT(`/api/users/${u.id}`, { ...body, active: f.active.checked });
          else await POST('/api/users', { ...body, email: f.email.value });
          close();
          toast('Acesso salvo');
          refresh();
        }).catch(() => {});
      };
    },
  });
}
