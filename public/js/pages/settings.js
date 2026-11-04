import { state, GET, POST, PUT, esc, modal, toast, fail, submitting, can, empty, loadRefs } from '../core.js';
import { refresh } from '../app.js';

const ROLES = { owner: 'Proprietária', reception: 'Recepção', pro: 'Profissional' };
const ROLE_HELP = {
  owner: 'Acesso total: financeiro, relatórios, comissões, equipe e configurações.',
  reception: 'Agenda, clientes, vendas, recebimentos e estoque. Não vê financeiro, comissões nem relatórios de gestão.',
  pro: 'Só a própria agenda, as clientes (sem valores gastos) e as próprias comissões.',
};

export default async function settings(root) {
  const owner = can.owner();
  const [methods, users, salon, services] = owner
    ? await Promise.all([GET('/api/payment-methods'), GET('/api/users'), GET('/api/salon'), GET('/api/services')])
    : [[], [], null, []];
  const slugOf = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const onlineCount = services.filter((s) => s.online).length;
  const link = salon?.slug ? `${location.origin}/agendar/${salon.slug}` : '';
  const bookingCard = owner ? `<div class="card"><h2>Agendamento online ${salon.booking_enabled ? '<span class="tag ok">ativo</span>' : '<span class="tag">desligado</span>'}</h2>
    <p class="small muted" style="margin-top:0">Suas clientes escolhem serviço, profissional e horário livre por um link. O pedido cai direto na agenda como “Agendado”, marcado como <b>online</b>.</p>
    <form data-booking novalidate>
      <label class="field"><span>Endereço da sua página</span><div style="display:flex;align-items:center;gap:6px"><span class="muted small nowrap">${esc(location.host)}/agendar/</span><input name="slug" maxlength="40" value="${esc(salon.slug || slugOf(state.user.salon_name))}"></div></label>
      <label class="check"><input type="checkbox" name="enabled" ${salon.booking_enabled ? 'checked' : ''}> Aceitar agendamentos online</label>
      ${onlineCount ? `<p class="small ok-t">${onlineCount} serviço(s) disponível(is) online.</p>` : '<p class="small warn-t">Nenhum serviço está marcado como “Disponível para agendamento online”. Marque em <a href="#/servicos">Serviços e preços</a>.</p>'}
      <button class="btn primary">Salvar</button></form>
    ${salon.booking_enabled && link ? `<div class="booking-link" style="margin-top:12px"><span style="flex:1">${esc(link)}</span><button class="btn sm" data-copy>Copiar</button>
      <a class="btn sm" href="${esc(link)}" target="_blank" rel="noopener">Abrir</a>
      <a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Agende seu horário online: ' + link)}" aria-label="Enviar por WhatsApp">💬</a></div>
      <p class="legend">Coloque o link na bio do Instagram e no WhatsApp Business.</p>` : ''}</div>` : '';
  root.innerHTML = `<div class="page-head"><div><h1>Configurações</h1><div class="sub">${esc(state.user.name)} · ${ROLES[state.user.role]}</div></div></div>
  ${owner ? `<div class="card"><h2>Salão</h2><form class="row" data-salon><input name="name" value="${esc(state.user.salon_name)}" maxlength="80"><button class="btn primary">Salvar nome</button></form></div>
  ${bookingCard}
  <div class="card"><h2>Formas de pagamento</h2>
    <ul class="list">${methods.map((m) => `<li><div class="grow">${esc(m.name)}</div><label class="check" style="margin:0"><input type="checkbox" data-pm="${m.id}" ${m.active ? 'checked' : ''}> Ativa</label></li>`).join('')}</ul>
    <form class="row" data-addpm style="margin-top:8px"><input name="name" placeholder="Ex.: Vale-presente, Link de pagamento" maxlength="30"><button class="btn">Adicionar</button></form></div>
  <div class="card"><h2>Acessos da equipe <button class="btn sm primary" data-newuser>＋ Novo acesso</button></h2>
    <ul class="list">${users.map((u) => `<li><div class="grow"><div class="title">${esc(u.name)} ${u.active ? '' : '<span class="tag">bloqueado</span>'}</div>
      <div class="meta">${esc(u.email)} · ${ROLES[u.role]}${u.professional_name ? ' · agenda de ' + esc(u.professional_name) : ''}</div></div>
      <button class="btn sm ghost" data-user="${u.id}">Editar</button></li>`).join('')}</ul>
    <p class="legend">${Object.entries(ROLE_HELP).map(([k, v]) => `<b>${ROLES[k]}:</b> ${v}`).join('<br>')}</p></div>` : ''}
  <div class="card"><h2>Minha senha</h2><form data-pw novalidate>
    <div class="row"><label class="field"><span>Senha atual</span><input type="password" name="current" autocomplete="current-password"></label>
    <label class="field"><span>Nova senha</span><input type="password" name="password" minlength="8" autocomplete="new-password"></label></div>
    <button class="btn">Alterar senha</button></form></div>
  <div class="card"><h2>Sobre</h2><p class="small muted">Vyllorri Beauty — gestão para salões de beleza. Os dados do seu salão ficam separados dos demais e só usuárias autorizadas têm acesso.</p></div>`;

  root.querySelector('[data-salon]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitting(e.target.querySelector('button'), async () => {
      await PUT('/api/salon', { name: e.target.name.value });
      state.user.salon_name = e.target.name.value.trim();
      document.querySelectorAll('.brand small').forEach((s) => (s.textContent = state.user.salon_name));
      toast('Nome atualizado');
    }).catch(() => {});
  });
  root.querySelector('[data-booking]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    await submitting(f.querySelector('button'), async () => {
      await PUT('/api/salon/booking', { slug: f.slug.value, enabled: f.enabled.checked });
      toast(f.enabled.checked ? 'Agendamento online ativado ✓' : 'Agendamento online desligado');
      refresh();
    }).catch(() => {});
  });
  root.querySelector('[data-copy]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copiado');
    } catch {
      toast(link);
    }
  });
  root.querySelectorAll('[data-pm]').forEach((cb) => (cb.onchange = async () => {
    await PUT(`/api/payment-methods/${cb.dataset.pm}`, { active: cb.checked }).then(() => loadRefs(true)).then(() => toast('Atualizado')).catch(fail);
  }));
  root.querySelector('[data-addpm]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!e.target.name.value.trim()) return;
    await POST('/api/payment-methods', { name: e.target.name.value }).then(() => loadRefs(true)).then(refresh).catch(fail);
  });
  root.querySelector('[data-newuser]')?.addEventListener('click', () => editUser());
  root.querySelectorAll('[data-user]').forEach((b) => (b.onclick = () => editUser(users.find((u) => u.id === Number(b.dataset.user)))));
  root.querySelector('[data-pw]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    await submitting(f.querySelector('button'), async () => {
      await POST('/api/me/password', { current: f.current.value, password: f.password.value });
      f.reset();
      toast('Senha alterada ✓');
    }).catch(() => {});
  });
}

function editUser(u = null) {
  const pros = state.pros.filter((p) => p.active);
  modal({
    title: u ? `Acesso de ${u.name}` : 'Novo acesso',
    body: `<form novalidate>
      <label class="field"><span>Nome *</span><input name="name" maxlength="80" value="${esc(u?.name || '')}" autofocus></label>
      ${u ? `<p class="small muted">${esc(u.email)}</p>` : '<label class="field"><span>E-mail de login *</span><input name="email" type="email" autocomplete="off"></label>'}
      <label class="field"><span>Perfil</span><select name="role">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${u?.role === k || (!u && k === 'reception') ? 'selected' : ''}>${v}</option>`).join('')}</select><small data-help></small></label>
      <label class="field" data-pro><span>Agenda de qual profissional?</span><select name="professional_id"><option value="">Escolha…</option>${pros.map((p) => `<option value="${p.id}" ${p.id === u?.professional_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="field"><span>${u ? 'Nova senha (deixe vazio para manter)' : 'Senha inicial *'}</span><input name="password" type="password" minlength="8" autocomplete="new-password"><small>Mínimo 8 caracteres. Passe para a pessoa trocar depois.</small></label>
      ${u ? `<label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Acesso liberado</label>` : ''}
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
          toast('Acesso salvo ✓');
          refresh();
        }).catch(() => {});
      };
    },
  });
}
