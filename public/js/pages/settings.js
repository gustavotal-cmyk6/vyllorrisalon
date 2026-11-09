import { state, GET, POST, PUT, esc, modal, toast, fail, submitting, can, empty, loadRefs, ic, avatar, pageHead, photoField, pickImage, fmtPhone, ROLE_LABEL, soloPro, money, toCents } from '../core.js';
import { refresh } from '../app.js';
import { pushState, enablePush, disablePush } from '../push.js';
import { editPro } from './team.js';

/** Cores prontas para a página pública das clientes. */
const PAGE_COLORS = [['#ec3f87', 'Rosa'], ['#8b5cf6', 'Roxo'], ['#c0264d', 'Vinho'], ['#d4a24c', 'Dourado'], ['#c9967a', 'Nude'], ['#3b82f6', 'Azul'], ['#10b981', 'Verde'], ['#f97316', 'Coral']];

const ROLE_HELP = {
  owner: 'Acesso total, inclusive configurações do salão e acessos da equipe.',
  manager: 'Tudo da proprietária (agenda, vendas, financeiro, comissões, equipe, relatórios), exceto configurações e acessos.',
  reception: 'Agenda, clientes, vendas, recebimentos, estoque e fechamento de caixa. Não vê financeiro, comissões nem relatórios.',
  pro: 'Só a própria agenda, as clientes (sem valores gastos) e as próprias comissões.',
};
const ui = { tab: 'salon' };

export default async function settings(root) {
  const owner = can.owner();
  const TABS = owner ? [['salon', 'Salão'], ['booking', 'Agendamento online'], ['deposit', 'Sinal online (Pix)'], ['home', 'Domicílio'], ['payments', 'Pagamentos no salão'], ['users', 'Acessos da equipe'], ['me', 'Minha conta']] : [['me', 'Minha conta']];
  if (!TABS.some(([k]) => k === ui.tab)) ui.tab = TABS[0][0];
  root.innerHTML = `${pageHead('Configurações', `${esc(state.user.name)} · ${ROLE_LABEL[state.user.role]}`)}
    ${TABS.length > 1 ? `<div class="tabs wrap">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${ui.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
    <div data-body><div class="loading">Carregando…</div></div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => ((ui.tab = b.dataset.tab), refresh())));
  const body = root.querySelector('[data-body]');
  if (ui.tab === 'salon') return salonTab(body);
  if (ui.tab === 'booking') return bookingTab(body);
  if (ui.tab === 'payments') return paymentsTab(body);
  if (ui.tab === 'users') return usersTab(body);
  if (ui.tab === 'deposit') return depositTab(body);
  if (ui.tab === 'home') return homeTab(body);
  meTab(body);
}

async function salonTab(body) {
  const s = await GET('/api/salon');
  let gallery = s.gallery.map((id, i) => ({ id, url: s.gallery_urls[i] }));
  const solo = s.team_mode === 'solo';
  body.innerHTML = `<div class="card"><div class="card-head"><h2>Como você trabalha?</h2></div>
    <div class="mode-pick" style="max-width:520px">
      <label><input type="radio" name="mode" value="solo" class="sr" ${solo ? 'checked' : ''}><span>${ic('user', 22)}<b>Trabalho sozinha</b><small>Sem telas de equipe e comissões</small></span></label>
      <label><input type="radio" name="mode" value="team" class="sr" ${solo ? '' : 'checked'}><span>${ic('users', 22)}<b>Tenho equipe</b><small>Várias profissionais na agenda</small></span></label>
    </div>
    <p class="small muted" style="margin-top:10px">${solo ? 'Você é a única profissional da agenda. Se contratar alguém, troque para “Tenho equipe”: nada é apagado.' : 'Para trabalhar sozinha, deixe só uma profissional ativa na Equipe.'}</p>
    ${solo ? `<button class="btn soft sm" data-hours style="margin-top:10px">${ic('clock', 16)} Editar meus dias e horários</button>` : ''}</div>
  <form class="card" novalidate data-form>
    <h2 style="margin-bottom:6px">Perfil do salão</h2>
    <p class="small muted" style="margin-bottom:14px">Estas informações aparecem na página de agendamento das clientes.</p>
    <div class="grid g2" style="margin-bottom:6px"><div data-logo></div><div data-cover></div></div>
    <label class="field"><span>Nome do salão *</span><input name="name" value="${esc(s.name)}" maxlength="80"></label>
    <label class="field"><span>Frase de destaque da página</span><input name="headline" maxlength="90" value="${esc(s.headline || '')}" placeholder="Cuide da sua *beleza* com quem entende!"><small>Aparece grande na capa. A palavra entre *asteriscos* fica destacada na cor da página.</small></label>
    <div class="field"><span>Cor da página de agendamento</span>
      <div class="swatches" data-colors>${PAGE_COLORS.map(([hex, nome]) => `<button type="button" class="swatch ${(s.page_color || PAGE_COLORS[0][0]) === hex ? 'on' : ''}" data-color="${hex}" style="--c:${hex}" title="${nome}" aria-label="${nome}"></button>`).join('')}
        <label class="swatch custom ${s.page_color && !PAGE_COLORS.some(([h]) => h === s.page_color) ? 'on' : ''}" title="Outra cor" style="--c:${esc(s.page_color || '#ec3f87')}"><input type="color" name="page_color" value="${esc(s.page_color || PAGE_COLORS[0][0])}" aria-label="Escolher outra cor"></label></div>
      <small>Muda botões, destaques e o fundo da página que as clientes veem. Toque no último círculo para escolher qualquer cor.</small></div>
    <label class="field"><span>Apresentação</span><textarea name="description" maxlength="600" placeholder="Ex.: Salão especializado em coloração e cuidados com os cabelos, no coração da Vila Mariana.">${esc(s.description || '')}</textarea></label>
    <label class="field"><span>Endereço</span><input name="address" maxlength="200" value="${esc(s.address || '')}" placeholder="Rua, número, bairro, cidade"></label>
    <div class="row"><label class="field"><span>WhatsApp do salão</span><input name="phone" inputmode="tel" maxlength="20" value="${esc(fmtPhone(s.phone))}"></label>
      <label class="field"><span>Instagram</span><input name="instagram" maxlength="60" value="${esc(s.instagram ? '@' + s.instagram : '')}" placeholder="@seusalao"></label></div>
    <label class="field"><span>Horário de funcionamento do salão</span><textarea name="opening_hours" maxlength="200" rows="2" placeholder="Ter a sex: 9h às 19h&#10;Sáb: 8h às 14h">${esc(s.opening_hours || '')}</textarea><small>Uma linha por faixa de dias. Os horários do atendimento a domicílio aparecem separados, conforme a aba Domicílio.</small></label>
    <div class="field"><span>Fotos do espaço e dos trabalhos <small>(até 8)</small></span><div class="gallery-pick" data-gallery></div></div>
    <div class="actions"><button class="btn primary">${ic('check', 18)} Salvar perfil</button></div></form>`;
  body.querySelectorAll('[name=mode]').forEach((r) => (r.onchange = async () => {
    try {
      const res = await PUT('/api/salon/mode', { mode: r.value });
      state.user.team_mode = res.team_mode;
      const me = await GET('/api/me');
      state.user = me.user;
      await loadRefs(true);
      toast(res.team_mode === 'solo' ? 'Pronto: modo “Trabalho sozinha” ativado' : 'Pronto: modo “Tenho equipe” ativado');
      document.getElementById('app').innerHTML = '';
      refresh();
    } catch (e) {
      fail(e);
      body.querySelector(`[name=mode][value=${s.team_mode}]`).checked = true;
    }
  }));
  body.querySelector('[data-hours]')?.addEventListener('click', () => soloPro() && editPro(soloPro()));
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
  const colors = body.querySelector('[data-colors]');
  const pick = (hex, el) => {
    colors.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === el));
    colors.querySelector('[name=page_color]').value = hex;
  };
  colors.querySelectorAll('[data-color]').forEach((b) => (b.onclick = () => pick(b.dataset.color, b)));
  colors.querySelector('[name=page_color]').oninput = (e) => {
    const lab = e.target.closest('.swatch');
    lab.style.setProperty('--c', e.target.value);
    pick(e.target.value, lab);
  };
    });
  };
  drawGallery();
  body.querySelector('[data-form]').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    await submitting(f.querySelector('.actions .btn'), async () => {
      const r = await PUT('/api/salon/profile', {
        name: f.name.value, headline: f.headline.value, page_color: f.page_color.value, description: f.description.value, address: f.address.value, phone: f.phone.value, instagram: f.instagram.value,
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
  body.innerHTML = `<div class="card"><h2>Pagamentos no salão</h2>
    <p class="small muted" style="margin:6px 0 10px">Formas que aparecem ao fechar a conta no salão (dinheiro, Pix na maquininha ou na sua chave, cartão…). O sinal cobrado no agendamento online é configurado em “Sinal online (Pix)”.</p>
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
    <div class="card" data-push></div>
    <div class="card soft"><p class="small muted">${ic('lock', 16)} Os dados de cada salão ficam separados e só pessoas com acesso autorizado conseguem vê-los.</p></div>`;
  pushCard(body.querySelector('[data-push]'));
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

// ---------- Sinal antecipado com Pix do próprio salão ----------
const KEY_TYPES = [['cpf', 'CPF'], ['cnpj', 'CNPJ'], ['email', 'E-mail'], ['phone', 'Celular'], ['random', 'Chave aleatória']];
const moneyBR = (c) => ((c || 0) / 100).toFixed(2).replace('.', ',');

async function depositTab(body) {
  const c = await GET('/api/salon/deposit');
  body.innerHTML = `<form novalidate data-dep>
    <div class="card"><h2 style="margin-bottom:6px">Sua chave Pix</h2>
      <p class="small muted" style="margin-bottom:12px">O sistema gera o QR Code e o Pix Copia e Cola com o valor exato do sinal. O dinheiro cai direto na sua conta; você confere no seu banco e confirma no agendamento.</p>
      <div class="row"><label class="field"><span>Tipo da chave</span><select name="pix_key_type">${KEY_TYPES.map(([k, l]) => `<option value="${k}" ${c.pix_key_type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Chave Pix</span><input name="pix_key" maxlength="80" value="${esc(c.pix_key || '')}" autocomplete="off"></label></div>
      <div class="row"><label class="field"><span>Nome do beneficiário</span><input name="pix_name" maxlength="60" value="${esc(c.pix_name || '')}" placeholder="Como aparece no seu banco"></label>
        <label class="field"><span>Cidade do beneficiário</span><input name="pix_city" maxlength="40" value="${esc(c.pix_city || '')}"></label></div>
      <button type="button" class="btn sm soft" data-preview>${ic('zap', 16)} Testar minha chave</button><div data-preview-box></div></div>
    <div class="card"><h2 style="margin-bottom:10px">Cobrança do sinal</h2>
      <label class="check"><span class="switch"><input type="checkbox" name="enabled" ${c.deposit_enabled ? 'checked' : ''}><i></i></span> Exigir sinal no agendamento online</label>
      <div class="row"><label class="field"><span>Porcentagem do sinal (%)</span><input name="pct" inputmode="decimal" value="${String(c.deposit_pct).replace('.', ',')}"><small data-pct-example></small></label>
        <label class="field"><span>Prazo para pagar (minutos)</span><input name="expire_min" inputmode="numeric" value="${c.deposit_expire_min}"><small>Sem comprovante nesse prazo, o horário é liberado.</small></label></div>
      <label class="check"><input type="checkbox" name="include_travel" ${c.deposit_include_travel ? 'checked' : ''}> Calcular o sinal também sobre a taxa de deslocamento (domicílio)</label>
      <div class="field"><span>Quais serviços exigem sinal?</span><div class="seg"><button type="button" data-scope="all" class="${c.deposit_scope === 'all' ? 'on' : ''}">Todos</button><button type="button" data-scope="selected" class="${c.deposit_scope === 'selected' ? 'on' : ''}">Só os que eu escolher</button></div></div>
      <div data-svcs class="${c.deposit_scope === 'selected' ? '' : 'hidden'}" style="display:grid;gap:4px;margin-bottom:12px">${c.services.map((s) => `<label class="check" style="margin:0"><input type="checkbox" data-svc="${s.id}" ${s.requires_deposit ? 'checked' : ''}> ${esc(s.name)} <span class="muted small">${money(s.price_cents)}</span></label>`).join('') || '<p class="small muted">Nenhum serviço cadastrado.</p>'}</div>
      <label class="field"><span>Se a cliente cancelar dentro do prazo (até ${c.cancel_hours}h antes)</span><select name="refund"><option value="refund" ${c.deposit_refund === 'refund' ? 'selected' : ''}>Devolvo o sinal</option><option value="keep" ${c.deposit_refund === 'keep' ? 'selected' : ''}>O sinal não é devolvido</option></select>
        <small>Em faltas, você decide no agendamento se devolve ou retém. O restante é pago no atendimento.</small></label>
    </div>
    <div class="actions" style="justify-content:flex-start"><button class="btn primary">${ic('check', 18)} Salvar</button></div></form>`;
  const f = body.querySelector('[data-dep]');
  let scope = c.deposit_scope;
  f.querySelectorAll('[data-scope]').forEach((b) => (b.onclick = () => {
    scope = b.dataset.scope;
    f.querySelectorAll('[data-scope]').forEach((x) => x.classList.toggle('on', x === b));
    f.querySelector('[data-svcs]').classList.toggle('hidden', scope !== 'selected');
  }));
  const example = () => {
    const p = Number(f.pct.value.replace(',', '.')) || 0;
    const svc = c.services[0];
    const base = svc ? svc.price_cents : 10000;
    f.querySelector('[data-pct-example]').innerHTML = `${svc ? esc(svc.name) : 'Serviço'} de ${money(base)} → sinal de <b>${money(Math.round((base * p) / 100))}</b>${p > 0 && p < 10 ? ' · <span class="warn-t">sinal muito baixo para garantir o horário?</span>' : ''}`;
  };
  f.pct.addEventListener('input', example);
  example();
  const pix = () => ({ pix_key_type: f.pix_key_type.value, pix_key: f.pix_key.value, pix_name: f.pix_name.value, pix_city: f.pix_city.value });
  f.querySelector('[data-preview]').onclick = async (e) => {
    await submitting(e.currentTarget, async () => {
      const r = await POST('/api/salon/deposit/preview', pix());
      f.querySelector('[data-preview-box]').innerHTML = `<div style="display:flex;gap:14px;align-items:center;margin-top:12px;flex-wrap:wrap"><div style="width:150px">${r.svg}</div>
        <p class="small" style="flex:1;min-width:200px">Pix de teste de <b>R$ 1,00</b>. Abra o app do seu banco, leia o QR Code e confira se aparecem <b>seu nome e sua chave</b>. Não é preciso pagar.</p></div>`;
    }).catch(() => {});
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    await submitting(f.querySelector('.actions .btn'), async () => {
      await PUT('/api/salon/deposit', { ...pix(), enabled: f.enabled.checked, pct: Number(f.pct.value.replace(',', '.')), expire_min: Number(f.expire_min.value), include_travel: f.include_travel.checked,
        scope, refund: f.refund.value, service_ids: [...f.querySelectorAll('[data-svc]:checked')].map((x) => Number(x.dataset.svc)) });
      toast(f.enabled.checked ? 'Sinal ativado no agendamento online' : 'Configuração salva');
      refresh();
    }).catch(() => {});
  };
}

// ---------- Atendimento a domicílio ----------
async function homeTab(body) {
  const h = await GET('/api/salon/home');
  const areas = h.areas.map((a) => ({ ...a }));
  body.innerHTML = `<form novalidate data-home>
    <div class="card"><label class="check"><span class="switch"><input type="checkbox" name="enabled" ${h.enabled ? 'checked' : ''}><i></i></span> <b>Oferecer atendimento a domicílio</b></label>
      <p class="small muted">Na página de agendamento, a cliente escolhe entre o salão e a casa dela.</p></div>
    <div class="card"><h2 style="margin-bottom:10px">1. Quem atende e quais serviços</h2>
      <div class="grid g2"><div><h3 class="small muted" style="margin-bottom:6px">Profissionais que vão até a cliente</h3>${h.pros.map((p) => `<label class="check" style="margin:0 0 4px"><input type="checkbox" data-pro="${p.id}" ${p.home_service ? 'checked' : ''}> ${esc(p.name)}</label>`).join('') || '<p class="small muted">Nenhuma profissional ativa.</p>'}</div>
        <div><h3 class="small muted" style="margin-bottom:6px">Serviços que podem ser feitos em casa</h3>${h.services.map((s) => `<label class="check" style="margin:0 0 4px"><input type="checkbox" data-svc="${s.id}" ${s.home_allowed ? 'checked' : ''}> ${esc(s.name)}</label>`).join('') || '<p class="small muted">Nenhum serviço cadastrado.</p>'}</div></div></div>
    <div class="card"><h2 style="margin-bottom:10px">2. Bairros e taxas</h2>
      <div class="seg" style="margin-bottom:12px"><button type="button" data-mode="fixed" class="${h.fee_mode === 'fixed' ? 'on' : ''}">Mesma taxa para todos</button><button type="button" data-mode="by_area" class="${h.fee_mode === 'by_area' ? 'on' : ''}">Taxa por bairro</button></div>
      <label class="field" data-fixed style="max-width:240px"><span>Taxa (R$)</span><input name="fee" inputmode="decimal" value="${moneyBR(h.fee_cents)}"></label>
      <div class="field"><span>Bairros ou regiões atendidas <small>(vazio = atende qualquer bairro)</small></span><div data-areas></div>
        <button type="button" class="btn sm soft" data-add-area style="margin-top:6px;width:fit-content">${ic('plus', 16)} Adicionar bairro</button></div></div>
    <div class="card"><h2 style="margin-bottom:10px">3. Horários e tempo de deslocamento</h2>
      <div class="row3"><label class="field"><span>A partir de</span><input type="time" name="start" value="${h.start}"></label><label class="field"><span>Até</span><input type="time" name="end" value="${h.end}"></label>
        <label class="field"><span>Deslocamento (min)</span><input name="buffer" inputmode="numeric" value="${h.buffer_min}"></label></div>
      <p class="small muted">A agenda da profissional fica bloqueada esse tempo antes e depois de cada atendimento em casa, para não haver conflito com o salão.</p></div>
    <div class="actions" style="justify-content:flex-start"><button class="btn primary">${ic('check', 18)} Salvar</button></div></form>`;
  const f = body.querySelector('[data-home]');
  let mode = h.fee_mode;
  const box = f.querySelector('[data-areas]');
  const drawAreas = () => {
    box.innerHTML = areas.map((a, i) => `<div style="display:grid;grid-template-columns:1fr ${mode === 'by_area' ? '110px ' : ''}40px;gap:6px;margin-bottom:6px">
      <input data-an="${i}" value="${esc(a.name)}" placeholder="Bairro ou região" aria-label="Bairro">${mode === 'by_area' ? `<input data-af="${i}" inputmode="decimal" value="${moneyBR(a.fee_cents)}" placeholder="Taxa" aria-label="Taxa do bairro">` : ''}
      <button type="button" class="icon-btn" data-ar="${i}" aria-label="Remover bairro">${ic('trash', 18)}</button></div>`).join('');
    box.querySelectorAll('[data-an]').forEach((x) => (x.oninput = () => (areas[x.dataset.an].name = x.value)));
    box.querySelectorAll('[data-af]').forEach((x) => (x.oninput = () => (areas[x.dataset.af].fee_cents = toCents(x.value) || 0)));
    box.querySelectorAll('[data-ar]').forEach((x) => (x.onclick = () => (areas.splice(Number(x.dataset.ar), 1), drawAreas())));
    f.querySelector('[data-fixed]').classList.toggle('hidden', mode !== 'fixed');
  };
  drawAreas();
  f.querySelector('[data-add-area]').onclick = () => (areas.push({ name: '', fee_cents: 0 }), drawAreas());
  f.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => {
    mode = b.dataset.mode;
    f.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
    drawAreas();
  }));
  f.onsubmit = async (e) => {
    e.preventDefault();
    await submitting(f.querySelector('.actions .btn'), async () => {
      await PUT('/api/salon/home', { enabled: f.enabled.checked, fee_mode: mode, fee_cents: toCents(f.fee.value) || 0, areas: areas.filter((a) => a.name.trim()),
        buffer_min: Number(f.buffer.value), start: f.start.value, end: f.end.value,
        pro_ids: [...f.querySelectorAll('[data-pro]:checked')].map((x) => Number(x.dataset.pro)), service_ids: [...f.querySelectorAll('[data-svc]:checked')].map((x) => Number(x.dataset.svc)) });
      toast('Atendimento a domicílio salvo');
      refresh();
    }).catch(() => {});
  };
}

// ---------- Notificações do app neste aparelho ----------
async function pushCard(box) {
  const draw = (s) => {
    box.innerHTML = `<div class="card-head"><h2>Notificações no aparelho</h2>${s.on ? '<span class="tag ok">ativas</span>' : ''}</div>
      <p class="small muted" style="margin-bottom:12px">Receba avisos de novos agendamentos online, comprovantes de sinal e cancelamentos, mesmo com o app fechado.</p>
      ${!s.supported ? `<p class="small warn-t">${esc(s.reason)}</p>`
        : s.denied ? '<p class="small warn-t">As notificações estão bloqueadas neste navegador. Libere nas configurações do navegador e volte aqui.</p>'
        : s.on ? `<div class="chips"><button class="btn sm soft" data-test>${ic('bell', 16)} Enviar teste</button><button class="btn sm ghost" data-off>Desativar neste aparelho</button></div>`
        : `<button class="btn sm primary" data-on>${ic('bell', 16)} Ativar notificações</button>`}`;
    box.querySelector('[data-on]')?.addEventListener('click', async (e) => {
      await submitting(e.currentTarget, async () => {
        draw(await enablePush());
        toast('Notificações ativadas neste aparelho');
      }).catch(() => {});
    });
    box.querySelector('[data-off]')?.addEventListener('click', async () => draw(await disablePush()));
    box.querySelector('[data-test]')?.addEventListener('click', async (e) => {
      await submitting(e.currentTarget, () => POST('/api/push/test')).then(() => toast('Teste enviado')).catch(() => {});
    });
  };
  draw(await pushState());
}
