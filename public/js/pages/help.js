// Ajuda e sugestões: enviar feedback, ver respostas e (equipe Vyllorri) responder.
import { state, GET, POST, PUT, esc, ic, pageHead, toast, submitting, empty, fmtDate } from '../core.js';
import { openTutorial } from '../tutorial.js';

const ui = { tab: 'send', adminStatus: 'new' };
const KIND = {
  suggestion: ['sparkle', 'Sugestão', 'Uma ideia para melhorar o app'],
  problem: ['alert', 'Problema', 'Algo não funcionou como esperado'],
  question: ['message', 'Dúvida', 'Não sei como fazer algo'],
  praise: ['heart', 'Elogio', 'Algo que você gostou'],
};
const STATUS = { new: ['Recebido', 'info'], answered: ['Respondido', 'ok'], done: ['Resolvido', 'ok'] };
const FAQ = [
  ['Como as clientes agendam sozinhas?', 'Em Configurações → Agendamento online, ative a página e copie o seu link. Coloque na bio do Instagram e no WhatsApp.'],
  ['Como mudo as cores e a logo da minha página?', 'Em Configurações → Salão: envie a logo, a foto de capa e escolha a cor da página.'],
  ['Como cobro sinal por Pix?', 'Em Configurações → Sinal online (Pix), cadastre sua chave Pix e escolha a porcentagem do sinal.'],
  ['Trabalho sozinha. Preciso cadastrar equipe?', 'Não. Em Configurações → Salão escolha "Trabalho sozinha": as telas de equipe e comissões somem.'],
  ['Como ativo as notificações no celular?', 'No Início aparece o aviso "Ative as notificações" com o passo a passo para o seu celular.'],
];

/** Lê uma imagem do aparelho e reduz para caber no envio (até ~1200px, JPG). */
function readImage() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => reject(new Error('Não foi possível ler esta imagem.'));
      img.src = URL.createObjectURL(file);
    };
    input.click();
  });
}

export default async function help(root) {
  const tabs = [['send', 'Enviar'], ['mine', 'Meus envios'], ...(state.user.is_admin ? [['admin', 'Caixa de entrada']] : [])];
  if (!tabs.some(([k]) => k === ui.tab)) ui.tab = 'send';
  root.innerHTML = `${pageHead('Ajuda e sugestões', 'O app está em fase de testes: sua opinião decide o que melhora primeiro')}
    <div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${ui.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div data-body></div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => ((ui.tab = b.dataset.tab), help(root))));
  const body = root.querySelector('[data-body]');
  if (ui.tab === 'mine') return mine(body);
  if (ui.tab === 'admin') return inbox(body);
  send(body, root);
}

function send(body, root) {
  let kind = 'suggestion', rating = 0, image = null;
  body.innerHTML = `<div class="grid g-main">
    <form class="card" novalidate data-form>
      <h2>Fale com a gente</h2>
      <p class="small muted" style="margin:4px 0 14px">Respondemos aqui mesmo, na aba "Meus envios".</p>
      <div class="fb-kinds">${Object.entries(KIND).map(([k, [icon, label, sub]]) => `<button type="button" class="fb-kind ${k === kind ? 'on' : ''}" data-kind="${k}">${ic(icon, 20)}<b>${label}</b><small>${sub}</small></button>`).join('')}</div>
      <label class="field" style="margin-top:14px"><span>Sua mensagem *</span><textarea name="message" rows="5" maxlength="2000" placeholder="Conte com detalhes. Se for um problema: o que você fez, o que esperava e o que aconteceu."></textarea></label>
      <div class="field"><span>De 1 a 5, o quanto o app está te ajudando? <small>(opcional)</small></span><div class="fb-stars" data-stars>${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" aria-label="${n} estrela(s)">${ic('star', 26)}</button>`).join('')}</div></div>
      <div class="field"><span>Print da tela <small>(opcional, ajuda muito em problemas)</small></span><div data-img><button type="button" class="btn soft sm" data-pick>${ic('camera', 16)} Anexar imagem</button></div></div>
      <div class="actions"><button class="btn primary">${ic('check', 18)} Enviar</button></div>
    </form>
    <div><button class="tut-card" data-tut><span class="tc-ic">${ic('play', 22)}</span><span class="grow"><b>Assistir: primeiros passos</b><small>Tutorial de 2 minutos com as telas do app</small></span>${ic('chevRight', 20)}</button>
    <div class="card"><h2>Dúvidas comuns</h2><div class="fb-faq">${FAQ.map(([q, a]) => `<details><summary>${q}${ic('chevDown', 16)}</summary><p>${a}</p></details>`).join('')}</div></div></div>
  </div>`;
  body.querySelector('[data-tut]').onclick = openTutorial;
  const f = body.querySelector('[data-form]');
  body.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => {
    kind = b.dataset.kind;
    body.querySelectorAll('[data-kind]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  const stars = body.querySelectorAll('[data-star]');
  stars.forEach((b) => (b.onclick = () => {
    rating = Number(b.dataset.star) === rating ? 0 : Number(b.dataset.star);
    stars.forEach((s) => s.classList.toggle('on', Number(s.dataset.star) <= rating));
  }));
  const imgBox = body.querySelector('[data-img]');
  const drawImg = () => {
    imgBox.innerHTML = image
      ? `<div class="fb-thumb"><img src="${image}" alt="Imagem anexada"><button type="button" class="btn ghost sm" data-rm>${ic('x', 16)} Remover</button></div>`
      : `<button type="button" class="btn soft sm" data-pick>${ic('camera', 16)} Anexar imagem</button>`;
    imgBox.querySelector('[data-pick]')?.addEventListener('click', async () => {
      try {
        image = (await readImage()) || image;
        drawImg();
      } catch (e) {
        toast(e.message, 'err');
      }
    });
    imgBox.querySelector('[data-rm]')?.addEventListener('click', () => ((image = null), drawImg()));
  };
  drawImg();
  f.onsubmit = async (e) => {
    e.preventDefault();
    await submitting(f.querySelector('.actions .btn'), async () => {
      await POST('/api/feedback', { kind, message: f.message.value, rating: rating || undefined, image: image || undefined, page: document.referrer ? undefined : 'app' });
      toast('Recebemos! Obrigada por ajudar a melhorar o Vyllorri 💜');
      ui.tab = 'mine';
      help(root);
    }).catch(() => {});
  };
}

async function mine(body) {
  const list = await GET('/api/feedback/mine');
  body.innerHTML = `<div class="card">${list.length ? `<ul class="fb-list">${list.map((f) => item(f)).join('')}</ul>` : empty('Você ainda não enviou nada. Conte o que achou do app!', '', 'message')}</div>`;
}

const item = (f, adminView = false) => {
  const [icon, label] = KIND[f.kind] || KIND.suggestion;
  const [st, tone] = STATUS[f.status] || STATUS.new;
  return `<li class="fb-item" data-id="${f.id}">
    <div class="fb-head"><span class="fb-ic">${ic(icon, 18)}</span><b>${label}</b>${f.rating ? `<span class="fb-rate">${'★'.repeat(f.rating)}</span>` : ''}<span class="tag ${tone}">${st}</span><small class="muted">${fmtDate(f.created_at)}</small></div>
    ${adminView ? `<p class="small muted" style="margin:2px 0 6px">${esc(f.salon_name)} · ${esc(f.user_name)} · ${esc(f.user_email)}</p>` : ''}
    <p class="fb-msg">${esc(f.message)}</p>
    ${f.image_url ? `<a href="${esc(f.image_url)}" target="_blank" rel="noopener"><img class="fb-shot" src="${esc(f.image_url)}" alt="Imagem enviada"></a>` : ''}
    ${f.reply ? `<div class="fb-reply"><b>${ic('message', 14)} Resposta da equipe Vyllorri</b><p>${esc(f.reply)}</p></div>` : ''}
    ${adminView ? `<form class="fb-answer" data-answer="${f.id}"><textarea name="reply" rows="2" maxlength="2000" placeholder="Escreva a resposta (a pessoa vê em Meus envios)">${esc(f.reply || '')}</textarea>
      <div class="chips"><button class="btn sm primary">Responder</button><button type="button" class="btn sm ghost" data-done="${f.id}">Marcar como resolvido</button></div></form>` : ''}
  </li>`;
};

async function inbox(body) {
  const r = await GET(`/api/admin/feedback?status=${ui.adminStatus}`);
  const c = r.counts || {};
  body.innerHTML = `<div class="chips scroll" style="margin-bottom:12px">${[['new', 'Novos'], ['answered', 'Respondidos'], ['done', 'Resolvidos'], ['', 'Todos']]
    .map(([k, l]) => `<button class="chip ${ui.adminStatus === k ? 'on' : ''}" data-st="${k}">${l}${k && c[k] ? ` (${c[k]})` : ''}</button>`).join('')}</div>
    <div class="card">${r.items.length ? `<ul class="fb-list">${r.items.map((f) => item(f, true)).join('')}</ul>` : empty('Nada por aqui.', '', 'checkCircle')}</div>`;
  body.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => ((ui.adminStatus = b.dataset.st), inbox(body))));
  body.querySelectorAll('[data-answer]').forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault();
    await submitting(f.querySelector('.primary'), async () => {
      await PUT(`/api/admin/feedback/${f.dataset.answer}`, { reply: f.reply.value, status: 'answered' });
      toast('Resposta enviada');
      inbox(body);
    }).catch(() => {});
  }));
  body.querySelectorAll('[data-done]').forEach((b) => (b.onclick = async () => {
    await PUT(`/api/admin/feedback/${b.dataset.done}`, { status: 'done' }).catch((e) => toast(e.message, 'err'));
    inbox(body);
  }));
}
