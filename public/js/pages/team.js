import { state, GET, POST, PUT, esc, money, moneyIn, toCents, modal, toast, submitting, can, empty, todayStr, loadRefs, ic, avatar, pageHead, photoField, ROLE_LABEL, fmtPhone, rangeFor } from '../core.js';
import { refresh } from '../app.js';

const SPECIALTIES = ['Cabeleireira', 'Colorista', 'Manicure', 'Pedicure', 'Manicure e pedicure', 'Nail designer', 'Maquiadora', 'Designer de sobrancelhas', 'Lash designer', 'Esteticista', 'Terapeuta capilar', 'Depiladora'];
const COLORS = ['#7a2fd0', '#d63d92', '#2a5bb5', '#138a5a', '#c47a14', '#c0304a', '#4e1590', '#9d5ce8'];
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const ruleText = (p) => (p.commission_type === 'fixed' ? `${money(p.commission_value)} por atendimento` : `${String(p.commission_value).replace('.', ',')}% dos serviços`) + (p.product_commission_pct ? ` · ${String(p.product_commission_pct).replace('.', ',')}% em produtos` : '');
const daysText = (p) => p.work_days.split(',').filter(Boolean).map((d) => DAYS[d]).join(', ') || 'sem dias definidos';

export default async function team(root, { query }) {
  const t = todayStr();
  const [agenda, users] = await Promise.all([GET(`/api/agenda?from=${t}&to=${t}&hide_cancelled=1`), can.owner() ? GET('/api/users') : Promise.resolve(null)]);
  const pros = state.pros;
  const todayCount = (id) => agenda.visits.filter((v) => v.items.some((i) => i.professional_id === id)).length;
  const loginOf = (id) => users?.find((u) => u.professional_id === id && u.role === 'pro');
  const active = pros.filter((p) => p.active);

  const extra = Math.max(0, active.length - 5);
  root.innerHTML = `${pageHead('Equipe', `${active.length} profissional(is) ativa(s)`, `<button class="btn primary" data-new>${ic('plus', 18)} Cadastrar profissional</button>`)}
    ${can.owner() && state.user.billing?.status !== 'comp' ? `<p class="plan-note">${ic('info', 16)}<span>Seu plano inclui <b>5 profissionais ativas</b>${extra ? `. Você tem ${active.length}: ${extra} a mais, por ${money(extra * 990)}/mês. <a href="#/assinatura">Ver assinatura</a>` : '. Acima disso, cada uma custa R$ 9,90/mês.'}</span></p>` : ''}
    ${pros.length ? `<div class="grid g3">${pros.map((p) => {
      const svc = state.services.filter((s) => s.pros.some((l) => l.professional_id === p.id)).length;
      const worksToday = p.work_days.split(',').includes(String(new Date().getDay()));
      return `<div class="card pro-card" data-open="${p.id}" role="button" tabindex="0" aria-label="Abrir perfil de ${esc(p.name)}" style="${p.active ? '' : 'opacity:.6'}">
        ${avatar(p.name, p.photo_url, 'lg')}
        <div><b style="font-size:1.02rem">${esc(p.name)}</b><div class="small muted">${esc(p.specialty || 'Profissional')} · ${svc} serviço(s)</div></div>
        <div class="small">${!p.active ? '<span class="tag">Inativa</span>' : worksToday ? `<span class="tag ok">Atende hoje</span> <span class="muted">${p.start_time}–${p.end_time}</span>` : '<span class="tag">Folga hoje</span>'}
          ${p.active && todayCount(p.id) ? ` · <b>${todayCount(p.id)}</b> agend.` : ''}</div>
      </div>`;
    }).join('')}</div>`
      : `<div class="card">${empty('Nenhuma profissional cadastrada. Cadastre cabeleireiras, manicures, maquiadoras… para começar a agendar.', `<button class="btn primary" data-first>${ic('plus', 18)} Cadastrar a primeira</button>`, 'users')}</div>`}`;
  root.querySelector('[data-new]').onclick = () => editPro();
  root.querySelector('[data-first]')?.addEventListener('click', () => editPro());
  root.querySelectorAll('[data-open]').forEach((c) => {
    const open = () => profile(pros.find((p) => p.id === Number(c.dataset.open)), loginOf(Number(c.dataset.open)), todayCount(Number(c.dataset.open)));
    c.onclick = open;
    c.onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open());
  });
  if (query.nova && !team.opened) (team.opened = true), editPro();
}

/** Perfil da profissional: dados, serviços, horários, desempenho no mês e acesso. */
async function profile(p, login, today) {
  const m = rangeFor('month');
  const [rep, com] = await Promise.all([GET(`/api/reports/sales?from=${m.from}&to=${m.to}&professional_id=${p.id}`), GET(`/api/commissions?from=${m.from}&to=${m.to}`)]);
  const mine = com.find((c) => c.id === p.id) || {};
  const services = state.services.filter((s) => s.pros.some((l) => l.professional_id === p.id));
  modal({
    title: 'Perfil da profissional',
    wide: true,
    body: `<div style="display:flex;gap:16px;align-items:center;margin-bottom:16px">${avatar(p.name, p.photo_url, 'xl')}
        <div style="flex:1;min-width:0"><h2 style="font-size:1.3rem">${esc(p.name)}</h2><div class="muted">${esc(p.specialty || 'Profissional')}${p.phone ? ` · ${fmtPhone(p.phone)}` : ''}</div>
        <div class="chips" style="margin-top:8px"><span class="tag ${p.active ? 'ok' : ''}">${p.active ? 'Ativa' : 'Inativa'}</span><span class="tag"><span class="dot" style="background:${esc(p.color)}"></span>cor na agenda</span>
          ${login !== undefined ? `<span class="tag ${login ? 'brand' : ''}">${login ? `Acesso: ${esc(login.email)}` : 'Sem acesso ao sistema'}</span>` : ''}</div></div></div>
      <h3 style="margin-bottom:8px">Desempenho no mês</h3>
      <div class="sum-strip" style="margin-bottom:16px">
        <div><span>Produção</span><b>${money(rep.summary.revenue)}</b><small>serviços + produtos</small></div>
        <div><span>Atendimentos</span><b>${rep.summary.services_count}</b><small>${rep.summary.clients_served} cliente(s)</small></div>
        <div><span>Ticket médio</span><b>${money(rep.summary.ticket_avg)}</b></div>
        ${can.admin() ? `<div><span>Comissão gerada</span><b>${money(mine.commission || 0)}</b><small>a pagar (total) ${money(mine.pending || 0)}</small></div>` : ''}
        <div><span>Hoje</span><b>${today}</b><small>agendamento(s)</small></div></div>
      <div class="grid g2" style="margin-bottom:8px">
        <div class="card flat" style="margin:0"><h3>Horários de trabalho</h3><p class="small" style="margin-top:6px">${esc(daysText(p))}<br>${p.start_time} às ${p.end_time}${p.break_start ? ` · intervalo ${p.break_start}–${p.break_end}` : ''}</p>
          <h3 style="margin-top:12px">Regra de comissão</h3><p class="small" style="margin-top:6px">${ruleText(p)}</p></div>
        <div class="card flat" style="margin:0"><h3>Serviços que realiza (${services.length})</h3>
          <div class="chips" style="margin-top:8px">${services.map((s) => `<span class="tag brand">${esc(s.name)}</span>`).join('') || '<span class="small muted">Nenhum serviço habilitado. Habilite em Serviços.</span>'}</div>
          ${rep.services.length ? `<h3 style="margin-top:12px">Mais realizados no mês</h3><p class="small muted" style="margin-top:6px">${rep.services.slice(0, 4).map((s) => `${esc(s.name)} (${s.qty})`).join(' · ')}</p>` : ''}</div>
      </div>
      <div class="actions"><a class="btn" href="#/agenda" data-close data-pro-agenda>${ic('calendar', 18)} Ver agenda</a>
        ${can.owner() ? `<a class="btn" href="#/config" data-close>${ic('lock', 18)} ${login ? 'Gerenciar acesso' : 'Criar acesso'}</a>` : ''}
        <button class="btn primary" data-edit>${ic('edit', 18)} Editar</button></div>`,
    onMount(el, close) {
      el.querySelector('[data-edit]').onclick = () => (close(), editPro(p));
    },
  });
}

export function editPro(p = null) {
  const days = (p?.work_days ?? '1,2,3,4,5,6').split(',');
  modal({
    title: p ? `Editar ${p.name}` : 'Cadastrar profissional',
    wide: true,
    body: `<form novalidate>
      <div data-photo style="margin-bottom:14px"></div>
      <div class="row"><label class="field"><span>Nome *</span><input name="name" maxlength="60" value="${esc(p?.name || '')}" autofocus></label>
        <label class="field"><span>Especialidade</span><input name="specialty" list="specs" maxlength="60" value="${esc(p?.specialty || '')}" placeholder="Cabeleireira, manicure…"><datalist id="specs">${SPECIALTIES.map((s) => `<option>${s}</option>`).join('')}</datalist></label></div>
      <div class="row"><label class="field"><span>WhatsApp</span><input name="phone" inputmode="tel" maxlength="20" value="${esc(p?.phone ? fmtPhone(p.phone) : '')}"></label>
        <div class="field"><span>Cor na agenda</span><div class="chips">${COLORS.map((c) => `<label style="cursor:pointer" title="${c}"><input type="radio" name="color" value="${c}" ${c === (p?.color || COLORS[0]) ? 'checked' : ''} class="sr"><span class="dot" style="background:${c};width:28px;height:28px;margin:0"></span></label>`).join('')}</div></div></div>
      <h3 style="margin:8px 0">Horários</h3>
      <div class="field"><span>Dias de trabalho</span><div class="chips days">${DAYS.map((d, i) => `<label class="chip ${days.includes(String(i)) ? 'on' : ''}"><input type="checkbox" data-multi name="work_days" value="${i}" ${days.includes(String(i)) ? 'checked' : ''} class="sr">${d}</label>`).join('')}</div></div>
      <div class="row"><label class="field"><span>Entrada</span><input type="time" name="start_time" value="${p?.start_time || '09:00'}"></label><label class="field"><span>Saída</span><input type="time" name="end_time" value="${p?.end_time || '19:00'}"></label></div>
      <div class="row"><label class="field"><span>Intervalo (início)</span><input type="time" name="break_start" value="${p?.break_start || ''}"></label><label class="field"><span>Intervalo (fim)</span><input type="time" name="break_end" value="${p?.break_end || ''}"></label></div>
      <h3 style="margin:8px 0">Comissão padrão</h3>
      <div class="row"><label class="field"><span>Tipo</span><select name="commission_type"><option value="pct" ${p?.commission_type !== 'fixed' ? 'selected' : ''}>% sobre o serviço</option><option value="fixed" ${p?.commission_type === 'fixed' ? 'selected' : ''}>Valor fixo por atendimento</option></select></label>
        <label class="field"><span data-cv-label>Valor</span><input name="commission_value" inputmode="decimal" value="${p ? (p.commission_type === 'fixed' ? moneyIn(p.commission_value) : String(p.commission_value).replace('.', ',')) : '40'}"></label></div>
      <label class="field"><span>Comissão sobre produtos vendidos (%)</span><input name="product_commission_pct" inputmode="decimal" value="${String(p?.product_commission_pct ?? 0).replace('.', ',')}"><small>Regras específicas por serviço ficam em Serviços.</small></label>
      ${p ? `<label class="check"><span class="switch"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}><i></i></span> Ativa (aparece na agenda e no agendamento online)</label>` : ''}
      <div class="actions stretch"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`,
    onMount(el, close) {
      const f = el.querySelector('form');
      const photo = photoField(el.querySelector('[data-photo]'), { current: p?.photo_url, label: 'Foto da profissional', round: true, max: 500 });
      el.querySelectorAll('.chips.days .chip').forEach((c) => c.querySelector('input').addEventListener('change', (e) => c.classList.toggle('on', e.target.checked)));
      const dots = () => el.querySelectorAll('[name=color]').forEach((r) => (r.nextElementSibling.style.boxShadow = r.checked ? '0 0 0 3px #fff, 0 0 0 5px var(--ink)' : 'none'));
      el.querySelectorAll('[name=color]').forEach((r) => r.addEventListener('change', dots));
      dots();
      const lbl = () => (el.querySelector('[data-cv-label]').textContent = f.commission_type.value === 'fixed' ? 'Valor por atendimento (R$)' : 'Percentual (%)');
      f.commission_type.onchange = lbl;
      lbl();
      f.onsubmit = async (e) => {
        e.preventDefault();
        await submitting(f.querySelector('[type=submit]'), async () => {
          const num = (v) => Number(String(v).replace(',', '.'));
          const body = {
            name: f.name.value, specialty: f.specialty.value, phone: f.phone.value, color: f.color.value, photo: photo.get(),
            work_days: [...f.querySelectorAll('[name=work_days]:checked')].map((x) => x.value).join(','),
            start_time: f.start_time.value, end_time: f.end_time.value, break_start: f.break_start.value || null, break_end: f.break_end.value || null,
            commission_type: f.commission_type.value,
            commission_value: f.commission_type.value === 'fixed' ? toCents(f.commission_value.value) : num(f.commission_value.value || 0),
            product_commission_pct: num(f.product_commission_pct.value || 0), active: p ? f.active.checked : true,
          };
          if (!body.work_days) throw new Error('Marque ao menos um dia de trabalho');
          if (p) await PUT(`/api/professionals/${p.id}`, body);
          else await POST('/api/professionals', body);
          await loadRefs(true);
          close();
          toast(p ? 'Profissional atualizada' : 'Profissional cadastrada — habilite os serviços que ela faz');
          refresh();
        }).catch(() => {});
      };
    },
  });
}
