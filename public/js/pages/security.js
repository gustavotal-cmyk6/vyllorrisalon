// Configurações → Segurança: 2 etapas, aparelhos conectados, atividades e backup.
import { state, GET, POST, esc, ic, modal, toast, submitting, empty, fmtDate, can } from '../core.js';

export default async function securityTab(body) {
  const [sec, sessions] = await Promise.all([GET('/api/me/security'), GET('/api/me/sessions')]);
  body.innerHTML = `
    <div class="card"><div class="card-head"><h2>Verificação em 2 etapas</h2>${sec.totp_enabled ? '<span class="tag ok">ativa</span>' : '<span class="tag warn">desativada</span>'}</div>
      <p class="small muted" style="margin-bottom:12px">Mesmo que alguém descubra a sua senha, não consegue entrar sem o código que só aparece no seu celular. ${can.owner() ? '<b>Recomendado para a proprietária.</b>' : ''}</p>
      ${sec.totp_enabled
        ? `<p class="small" style="margin-bottom:12px">${ic('checkCircle', 16, 'ok-t')} Protegida. Códigos de recuperação restantes: <b>${sec.recovery_left}</b>.</p><button class="btn sm ghost" data-off>Desativar</button>`
        : `<button class="btn primary" data-on>${ic('lock', 18)} Ativar verificação em 2 etapas</button>`}
    </div>
    <div class="card"><div class="card-head"><h2>Aparelhos conectados</h2></div>
      <ul class="list">${sessions.map((s) => `<li>${ic(/iPhone|Android/.test(s.device) ? 'phone' : 'grid', 18, 'brand-t')}<div class="grow"><div class="title">${esc(s.device)}${s.current ? ' <span class="tag ok">este aparelho</span>' : ''}</div>
        <div class="meta">${s.created_at ? `entrou em ${new Date(s.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : 'sessão antiga'}</div></div></li>`).join('')}</ul>
      ${sessions.length > 1 ? `<button class="btn sm soft" data-others style="margin-top:12px">${ic('logout', 16)} Sair de todos os outros aparelhos</button>` : ''}
      <p class="tiny muted" style="margin-top:10px">Não reconhece algum? Saia dos outros aparelhos e troque a sua senha em Minha conta.</p></div>
    ${can.owner() ? '<div class="card" data-audit><div class="loading">Carregando…</div></div>' : ''}
    ${state.user.is_admin ? `<div class="card"><div class="card-head"><h2>Backup completo (equipe Vyllorri)</h2></div>
      <p class="small muted" style="margin-bottom:12px">Baixa uma cópia de todos os dados de todos os salões. Guarde em lugar seguro (pendrive ou nuvem com senha). ${sec.totp_enabled ? '' : '<b>Exige a verificação em 2 etapas ativa.</b>'}</p>
      <a class="btn soft" href="/api/admin/backup" download data-backup>${ic('download', 18)} Baixar backup agora</a></div>` : ''}`;

  body.querySelector('[data-on]')?.addEventListener('click', () => enable(body));
  body.querySelector('[data-off]')?.addEventListener('click', () => disable(body));
  body.querySelector('[data-others]')?.addEventListener('click', async (e) => {
    await submitting(e.currentTarget, async () => {
      const r = await POST('/api/me/sessions/logout-others');
      toast(`${r.removed} aparelho(s) desconectado(s)`);
      securityTab(body);
    }).catch(() => {});
  });
  const auditBox = body.querySelector('[data-audit]');
  if (auditBox) {
    const items = await GET('/api/audit').catch(() => []);
    auditBox.innerHTML = `<div class="card-head"><h2>Registro de atividades</h2><span class="tiny muted">últimas 200</span></div>
      <p class="small muted" style="margin-bottom:10px">Ações importantes de todas as pessoas com acesso ao salão: entradas, tentativas erradas, estornos, exclusões e mudanças de configuração.</p>
      ${items.length ? `<ul class="list audit">${items.slice(0, 60).map((a) => `<li>${ic(a.action === 'login_failed' ? 'alert' : a.action === 'login' ? 'user' : 'info', 16, a.action === 'login_failed' ? 'err-t' : 'brand-t')}
        <div class="grow"><div class="title small">${esc(a.label)}${a.detail ? ` <span class="muted">· ${esc(a.detail)}</span>` : ''}</div>
        <div class="meta">${esc(a.user_name || '—')} · ${fmtDate(a.created_at)} ${a.created_at.slice(11, 16)}${a.ip ? ` · IP ${esc(a.ip)}` : ''}</div></div></li>`).join('')}</ul>`
        : empty('Nenhuma atividade registrada ainda.', '', 'checkCircle')}`;
  }
}

function enable(body) {
  modal({
    title: 'Ativar verificação em 2 etapas',
    body: '<div data-step><div class="loading">Gerando…</div></div>',
    async onMount(el, close) {
      const box = el.querySelector('[data-step]');
      let s;
      try {
        s = await POST('/api/me/2fa/setup');
      } catch (e) {
        box.innerHTML = `<p class="err-t">${esc(e.message)}</p>`;
        return;
      }
      box.innerHTML = `<ol class="guide">
          <li><span>1</span><div>Instale um aplicativo autenticador no celular: <b>Google Authenticator</b> ou <b>Microsoft Authenticator</b> (grátis).</div></li>
          <li><span>2</span><div>No aplicativo, toque em <b>+</b> e <b>leia este QR Code</b>:</div></li></ol>
        <div class="tfa-qr">${s.qr_svg}</div>
        <p class="tiny muted" style="text-align:center">Não consegue ler? Digite a chave: <code class="tfa-key">${esc(s.secret.replace(/(.{4})/g, '$1 ').trim())}</code></p>
        <ol class="guide" start="3"><li><span>3</span><div>Digite o código de 6 números que aparece no aplicativo:</div></li></ol>
        <form data-confirm novalidate><label class="field"><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" class="tfa-input" autofocus></label>
          <div class="actions stretch"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Confirmar</button></div></form>`;
      box.querySelector('[data-confirm]').onsubmit = async (e) => {
        e.preventDefault();
        await submitting(e.target.querySelector('.primary'), async () => {
          const r = await POST('/api/me/2fa/enable', { code: e.target.code.value });
          box.innerHTML = `<p style="margin-bottom:10px">${ic('checkCircle', 18, 'ok-t')} <b>Pronto, a sua conta está protegida.</b></p>
            <p class="small" style="margin-bottom:10px"><b>Guarde estes códigos de recuperação</b> (anote ou tire print e guarde em lugar seguro). Cada um funciona <b>uma única vez</b>, caso você perca o celular. Eles não aparecem de novo.</p>
            <div class="tfa-codes">${r.recovery_codes.map((c) => `<code>${c}</code>`).join('')}</div>
            <div class="actions stretch" style="margin-top:14px"><button class="btn soft" data-copy>${ic('copy', 16)} Copiar códigos</button><button class="btn primary" data-close>Já guardei</button></div>`;
          box.querySelector('[data-copy]').onclick = () => navigator.clipboard?.writeText(r.recovery_codes.join('\n')).then(() => toast('Códigos copiados'));
          securityTab(body);
        }).catch(() => {});
      };
      el.addEventListener('click', (e) => e.target.closest('[data-close]') && close());
    },
  });
}

function disable(body) {
  modal({
    title: 'Desativar verificação em 2 etapas',
    body: `<form novalidate><p class="small muted" style="margin-bottom:12px">Sua conta fica protegida só pela senha. Para confirmar, informe a senha e um código do aplicativo.</p>
      <label class="field"><span>Senha</span><input type="password" name="password" autocomplete="current-password"></label>
      <label class="field"><span>Código do aplicativo (ou de recuperação)</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="11"></label>
      <div class="actions stretch"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn danger">Desativar</button></div></form>`,
    onMount(el, close) {
      const f = el.querySelector('form');
      f.onsubmit = async (e) => {
        e.preventDefault();
        await submitting(f.querySelector('.danger'), async () => {
          await POST('/api/me/2fa/disable', { password: f.password.value, code: f.code.value });
          close();
          toast('Verificação em 2 etapas desativada');
          securityTab(body);
        }).catch(() => {});
      };
    },
  });
}
