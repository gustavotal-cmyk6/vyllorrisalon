// Entrar, criar conta e recuperar senha: mesma ideia do Vyllorri Barber (Vyllo guiando, cadastro em conversa).
import { POST, toast, esc, ic } from './core.js';
import { chatFlow, textAnswer, choiceAnswer } from './chat.js';

const WHATSAPP = `https://wa.me/558681393559?text=${encodeURIComponent('Olá! Preciso de ajuda para entrar no Vyllorri Beauty.')}`;
const first = (n) => String(n).trim().split(/\s+/)[0];
const EMAIL_OK = /^\S+@\S+\.\S{2,}$/;

/** Moldura das telas de entrada: marca no topo, conteúdo e ajuda no rodapé. */
export function shell(inner) {
  window.scrollTo(0, 0);
  document.getElementById('app').innerHTML = `<div class="vx-auth"><div class="vx-wrap">
    <a class="vx-brand" href="/vendas/" aria-label="Vyllorri Beauty — página inicial"><img src="/brand/vyllorri-v-transparente-256.png" alt=""><span><b>Vyllorri</b><small>Beauty</small></span></a>
    ${inner}
    <p class="vx-help">Travou em algum passo? <a href="${WHATSAPP}" target="_blank" rel="noopener">Fale com a gente no WhatsApp</a></p>
  </div></div>`;
}
/** Vyllo (robô) + balão curto. Só uma vez por tela. */
export const vyllo = (html) => `<div class="vx-vyllo"><img src="/vendas/vyllo.webp" alt="Vyllo, o seu ajudante" width="60" height="124">
  <div><span class="vx-tag"><i></i>Vyllo · seu ajudante</span><div class="vx-bub v">${html}</div></div></div>`;
const showBtn = () => '<button type="button" class="vx-show" aria-pressed="false">Mostrar</button>';
function wireShow(form) {
  const b = form.querySelector('.vx-show'), p = form.querySelector('[name=password]');
  if (!b || !p) return;
  b.onclick = () => {
    const on = p.type === 'password';
    p.type = on ? 'text' : 'password';
    b.textContent = on ? 'Esconder' : 'Mostrar';
    b.setAttribute('aria-pressed', String(on));
  };
}
const alertBox = (form) => form.querySelector('.vx-alert');
function setAlert(form, html) {
  const el = alertBox(form);
  el.innerHTML = html; el.hidden = !html;
}

export function authScreen(mode, { boot }) {
  return mode === 'signup' ? signup(boot) : login(boot);
}

// ---------------- entrar ----------------
function login(boot) {
  shell(`<h1 class="sr">Entrar</h1>${vyllo('Oi! Que bom te ver por aqui. Entre com o seu e-mail e a sua senha para ver a sua agenda.')}
    <form class="vx-card vx-form" novalidate>
      <label class="vx-lab"><span>E-mail</span><input name="email" type="email" required autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" placeholder="voce@email.com" autofocus></label>
      <label class="vx-lab"><span>Senha</span><div class="vx-pw"><input name="password" type="password" required autocomplete="current-password" placeholder="Sua senha">${showBtn()}</div></label>
      <label class="vx-lab" data-code hidden><span>Código de verificação</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="11" placeholder="6 números do app autenticador">
        <small>Abra o seu aplicativo autenticador (Google Authenticator, Microsoft Authenticator…). Sem o celular? Use um código de recuperação.</small></label>
      <div class="vx-alert" role="alert" hidden></div>
      <p class="vx-forgot"><a href="#/recuperar">Esqueci minha senha</a></p>
      <button class="btn primary block vx-go" type="submit">Entrar ${ic('arrowRight', 18)}</button>
      <p class="vx-safe">${ic('lock', 14)} Conexão segura · seus dados ficam protegidos</p>
    </form>
    <div class="vx-new"><p>Primeira vez por aqui?</p><a class="btn block vx-new-btn" href="#/criar">Criar minha conta</a><small>Eu te guio numa conversa rápida. Teste grátis, sem cartão.</small></div>`);
  const form = document.querySelector('.vx-form');
  wireShow(form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('.vx-go');
    const data = { email: form.email.value.trim(), password: form.password.value };
    if (form.code.value) data.code = form.code.value;
    if (!data.email || !data.password) return setAlert(form, 'Escreva o seu e-mail e a sua senha.');
    setAlert(form, '');
    btn.disabled = true;
    try {
      await POST('/api/auth/login', data);
      await boot();
    } catch (err) {
      if (err?.data?.code === '2fa') {
        // conta com verificação em 2 etapas: mostra o campo do código
        const box = form.querySelector('[data-code]');
        const firstTime = box.hidden;
        box.hidden = false;
        form.code.focus();
        if (!firstTime || form.code.value) setAlert(form, esc(err.message));
      } else {
        // o e-mail fica no campo; só a senha precisa ser corrigida
        const wrong = err?.status === 401 || /incorret/i.test(err?.message || '');
        setAlert(form, `${esc(err?.message || 'Algo deu errado. Tente de novo.')}${wrong ? ' Esqueceu a senha? <a href="#/recuperar">Recuperar agora</a>' : ''}`);
        if (wrong) { form.password.value = ''; form.password.focus(); }
      }
    } finally {
      btn.disabled = false;
    }
  };
}

// ---------------- criar conta (conversa) ----------------
function signup(boot) {
  shell(`<h1 class="sr">Criar conta</h1><div class="vx-chatbox"></div>
    <p class="vx-or">Já tem conta? <a href="#/entrar">Entrar</a></p>
    <p class="vx-terms">Ao criar a conta, você aceita os <a href="/termos.html" target="_blank" rel="noopener">Termos de Uso</a> e a <a href="/privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>.</p>`);
  const steps = [
    {
      id: 'name',
      say: () => ['Oi! Eu sou o Vyllo, o seu ajudante. Vou criar a sua conta com você. São só 5 perguntas rapidinhas.', 'Primeiro: como você se chama?'],
      input: ({ a, submit }) => textAnswer({ ic, placeholder: 'Escreva o seu nome', value: a.name, autocomplete: 'name',
        validate: (v) => (v.length < 2 ? 'Escreva o seu nome para continuar.' : null), onSend: (v) => submit(v, { name: v }) }),
    },
    {
      id: 'salon',
      say: (a) => [`Prazer, ${esc(first(a.name))}! Já fizemos a primeira. Qual é o nome do seu negócio?`, 'Pode ser o nome do salão, do studio ou o seu próprio nome.'],
      input: ({ a, submit }) => textAnswer({ ic, placeholder: 'Ex.: Studio Bella', value: a.salon_name, autocomplete: 'organization',
        validate: (v) => (v.length < 2 ? 'Escreva o nome do seu negócio.' : null), onSend: (v) => submit(v, { salon_name: v }) }),
    },
    {
      id: 'mode',
      say: () => ['Quase na metade! Você atende sozinha ou tem equipe?', 'Pode mudar depois, em Configurações.'],
      input: ({ submit }) => choiceAnswer([
        { label: 'Trabalho sozinha', sub: 'Só eu atendo · plano Individual', onPick: () => submit('Trabalho sozinha', { team_mode: 'solo' }) },
        { label: 'Tenho equipe', sub: 'Mais profissionais na agenda · plano Com equipe', onPick: () => submit('Tenho equipe', { team_mode: 'team' }) },
      ]),
    },
    {
      id: 'email',
      say: () => ['Mais da metade! Agora o seu e-mail. É com ele que você vai entrar. Confira se está certinho.'],
      input: ({ a, submit }) => textAnswer({ ic, placeholder: 'seu@email.com', type: 'email', inputmode: 'email', value: a.email, autocomplete: 'username',
        validate: (v) => (EMAIL_OK.test(v) ? null : 'Esse e-mail parece incompleto. Confira e tente de novo.'), onSend: (v) => submit(v, { email: v }) }),
    },
    {
      id: 'pass',
      say: () => ['Falta pouco! Última pergunta: crie uma senha com pelo menos 8 letras ou números. Toque em “Mostrar” para conferir o que digitou.'],
      input: ({ a, submit }) => textAnswer({ ic, placeholder: 'Crie uma senha', secret: true, value: a.password, autocomplete: 'new-password',
        validate: (v) => (v.length < 8 ? `Faltam ${8 - v.length} caracteres. Use pelo menos 8.` : null),
        onSend: (v) => submit('•'.repeat(Math.min(v.length, 12)), { password: v }) }),
    },
    {
      id: 'go', final: true,
      say: (a) => [`Prontinho, ${esc(first(a.name))}! Foi rapidinho, né? Toque no botão para criar a sua conta.`, 'Depois eu monto a sua agenda com você: serviços, horários e o link para as clientes marcarem.'],
      input: ({ a, goTo }) => {
        const f = document.createElement('form');
        f.className = 'vx-final';
        f.innerHTML = `<div class="vx-alert" role="alert" hidden></div><button class="btn primary block vx-go" type="submit">Criar minha conta ${ic('arrowRight', 18)}</button>`;
        f.onsubmit = async (e) => {
          e.preventDefault();
          const btn = f.querySelector('.vx-go');
          btn.disabled = true; setAlert(f, '');
          try {
            await POST('/api/auth/signup', { salon_name: a.salon_name, name: a.name, team_mode: a.team_mode || 'team', email: a.email, password: a.password });
            try { sessionStorage.setItem('vy_new', '1'); } catch {} // conta nova: segue para o passo a passo em conversa
            await boot();
          } catch (err) {
            const msg = err?.message || 'Algo deu errado. Tente de novo.';
            const fix = /e-mail/i.test(msg) ? ['email', 'Corrigir o e-mail'] : /senha/i.test(msg) ? ['pass', 'Corrigir a senha'] : null;
            setAlert(f, `<p>${esc(msg)}</p>${fix ? `<button type="button" data-fix="${fix[0]}">${fix[1]}</button>` : ''}`);
            f.querySelector('[data-fix]')?.addEventListener('click', (ev) => goTo(ev.currentTarget.dataset.fix));
            btn.disabled = false;
          }
        };
        return f;
      },
    },
  ];
  chatFlow(document.querySelector('.vx-chatbox'), steps, { name: '', salon_name: '', team_mode: '', email: '', password: '' });
}

// ---------------- recuperar / redefinir senha ----------------
export function recoverScreen(key, qs) {
  const reset = key === 'redefinir';
  const token = new URLSearchParams(qs || '').get('t') || '';
  shell(`<h1 class="sr">${reset ? 'Criar nova senha' : 'Esqueci minha senha'}</h1>
    ${vyllo(reset ? 'Escolha uma senha nova, com pelo menos 8 letras ou números.' : 'Sem problema! Escreva o seu e-mail e eu envio um link para você criar uma senha nova.')}
    <form class="vx-card vx-form" novalidate>
      ${reset ? `<label class="vx-lab"><span>Nova senha</span><div class="vx-pw"><input name="password" type="password" required autocomplete="new-password" placeholder="Crie uma senha" autofocus>${showBtn()}</div></label>`
        : '<label class="vx-lab"><span>E-mail</span><input name="email" type="email" required autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" placeholder="voce@email.com" autofocus></label>'}
      <div class="vx-alert" role="alert" hidden></div>
      <button class="btn primary block vx-go" type="submit">${reset ? 'Salvar senha' : 'Enviar link'}</button>
    </form>
    <p class="vx-or"><a href="#/entrar">Voltar para entrar</a></p>`);
  const form = document.querySelector('.vx-form');
  wireShow(form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('.vx-go');
    setAlert(form, '');
    try {
      btn.disabled = true;
      if (reset) {
        await POST('/api/auth/reset', { token, password: form.password.value });
        toast('Senha nova salva. Agora é só entrar.');
        location.hash = '#/entrar';
      } else {
        await POST('/api/auth/forgot', { email: form.email.value.trim() });
        setAlert(form, 'Se esse e-mail tem conta, o link foi enviado. Veja também a caixa de spam.');
        form.querySelector('.vx-alert').classList.add('ok');
      }
    } catch (err) {
      form.querySelector('.vx-alert').classList.remove('ok');
      setAlert(form, esc(err?.message || 'Algo deu errado. Tente de novo.'));
    } finally {
      btn.disabled = false;
    }
  };
}
