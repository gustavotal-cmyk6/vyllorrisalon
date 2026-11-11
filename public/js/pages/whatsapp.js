// Plano Pro: WhatsApp automático (conectar por QR ou código, atendente, confirmação e lembrete).
import { GET, POST, esc, money, ic, pageHead, toast, fail, submitting } from '../core.js';

let poll = null;
const fmtPhone = (d) => (d && d.length >= 12 ? `(${d.slice(2, 4)}) ${d.slice(4, -4)}-${d.slice(-4)}` : d || '');

export default async function whatsapp(root) {
  clearInterval(poll);
  const w = await GET('/api/wa');
  if (!w.pro) {
    const b = await GET('/api/billing').catch(() => null);
    root.innerHTML = `${pageHead('WhatsApp automático', 'Plano Pro')}
      <div class="card">
        <span class="tag">Pro · + ${money(b?.pro_cents ?? 2000)}/mês</span>
        <h2 style="margin-top:10px">Seu WhatsApp atendendo sozinho, 24h</h2>
        <ul class="plan-list" style="margin-top:10px">${['Atendente com IA responde suas clientes no WhatsApp do salão', 'Ela vê os horários livres da sua agenda e marca na hora', 'Confirmação e lembrete enviados sozinhos para a cliente', 'Quando você responde uma conversa, a atendente sai daquela conversa'].map((t) => `<li>${ic('check', 16)} ${t}</li>`).join('')}</ul>
        <p class="small muted" style="margin-top:10px">O Pro não tem dias grátis: ele é liberado na hora, no primeiro pagamento com o Pro.</p>
        <a class="btn primary block" href="#/assinatura" style="margin-top:14px">${ic('star', 16)} Ativar o Pro</a>
      </div>`;
    return;
  }
  const connected = w.status === 'open';
  root.innerHTML = `${pageHead('WhatsApp automático', connected ? `Conectado${w.phone ? ' · ' + esc(fmtPhone(w.phone)) : ''}` : 'Plano Pro')}
    ${!w.configured ? `<div class="alert warn"><span class="a-ic">${ic('info', 18)}</span><span>O WhatsApp automático ainda não foi ativado no servidor. Fale com o suporte do Vyllorri.</span></div>` : ''}
    ${w.configured && !connected ? `<div class="card" data-connect></div>` : ''}
    <div class="card">
      <div class="card-head"><h2>O que acontece sozinho</h2></div>
      <form data-prefs>
        <label class="check"><span class="switch"><input type="checkbox" name="ai" ${w.ai_enabled ? 'checked' : ''} ${connected ? '' : 'disabled'}><i></i></span> <span><b>Atendente com IA</b><br><small class="muted">Responde as clientes, mostra os horários livres e marca na sua agenda.</small></span></label>
        <label class="check"><span class="switch"><input type="checkbox" name="confirmations" ${w.confirmations ? 'checked' : ''} ${connected ? '' : 'disabled'}><i></i></span> <span><b>Confirmação automática</b><br><small class="muted">Quando você confirma o horário, a cliente recebe a confirmação.</small></span></label>
        <label class="check"><span class="switch"><input type="checkbox" name="reminders" ${w.reminders ? 'checked' : ''} ${connected ? '' : 'disabled'}><i></i></span> <span><b>Lembrete automático</b><br><small class="muted">A cliente recebe um lembrete na véspera do horário.</small></span></label>
      </form>
      <p class="small muted" style="margin-top:10px"><b>Quando você responde, a atendente sai:</b> se alguém do salão escrever numa conversa pelo celular, a atendente fica 12 horas sem responder aquela cliente. As outras continuam sendo atendidas.</p>
      <p class="small muted" style="margin-top:6px">Respostas da atendente este mês: <b>${w.usage_count}</b> de ${w.limit}${w.extra_credits ? ` + ${w.extra_credits} extras` : ''}.</p>
    </div>
    <div class="card">
      <div class="card-head"><h2>Números que a atendente nunca responde</h2></div>
      <form data-ignore>
        <label class="field"><span>Família, sócia, fornecedor… Um número por linha, com DDD.</span><textarea name="numbers" rows="3" placeholder="(86) 99999-0000" ${connected ? '' : 'disabled'}>${esc((w.ignore || []).map(fmtPhone).join('\n'))}</textarea></label>
        <button class="btn sm soft" ${connected ? '' : 'disabled'}>Salvar lista</button>
      </form>
    </div>
    <div class="card" data-test>
      <div class="card-head"><h2>Testar a atendente</h2></div>
      <p class="small muted">Usa sua agenda de verdade, mas nada é marcado nem cancelado.</p>
      <div class="wa-chat" data-msgs style="height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:14px;background:var(--lav-100);margin:10px 0"></div>
      <form class="row" data-send><input name="text" maxlength="1000" placeholder="Escreva como cliente…" aria-label="Mensagem de teste" style="flex:1"><button class="btn primary">Enviar</button></form>
    </div>
    <p class="small muted">💡 <b>Dica:</b> use o <b>WhatsApp Business</b> com o número do salão. A maioria dos celulares aceita o WhatsApp pessoal e o Business ao mesmo tempo (dois chips ou chip + eSIM), e assim suas conversas pessoais ficam separadas.</p>
    ${connected ? `<p style="margin-top:10px"><button class="btn sm ghost" data-off>${ic('x', 14)} Desconectar o WhatsApp</button></p>` : ''}`;

  const box = root.querySelector('[data-connect]');
  if (box) drawConnect(box, root);

  root.querySelector('[data-prefs]').onchange = async (e) => {
    const f = e.currentTarget;
    try { await POST('/api/wa/prefs', { ai: f.ai.checked, confirmations: f.confirmations.checked, reminders: f.reminders.checked }); toast('Salvo.'); } catch (err) { fail(err); }
  };
  root.querySelector('[data-ignore]').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.currentTarget.querySelector('button');
    await submitting(btn, async () => { await POST('/api/wa/ignore', { numbers: e.currentTarget.numbers.value }); toast('Lista salva.'); }).catch(() => {});
  };
  root.querySelector('[data-off]')?.addEventListener('click', async (e) => {
    if (!confirm('Desconectar o WhatsApp? A atendente e os envios automáticos param.')) return;
    await submitting(e.currentTarget, async () => { await POST('/api/wa/disconnect'); whatsapp(root); }).catch(() => {});
  });

  // chat de teste
  const msgs = root.querySelector('[data-msgs]');
  let history = [];
  const add = (t, me) => {
    const p = document.createElement('p');
    p.textContent = t;
    p.style.cssText = `max-width:85%;white-space:pre-wrap;padding:8px 12px;border-radius:14px;margin:0;font-size:14px;${me ? 'align-self:flex-end;background:var(--brand);color:#fff' : 'align-self:flex-start;background:#fff'}`;
    msgs.append(p);
    msgs.scrollTop = msgs.scrollHeight;
  };
  add('Teste a atendente como se fosse uma cliente. Ex.: "tem horário amanhã à tarde?"');
  root.querySelector('[data-send]').onsubmit = async (e) => {
    e.preventDefault();
    const input = e.currentTarget.text;
    const t = input.value.trim();
    if (!t) return;
    input.value = '';
    add(t, true);
    const btn = e.currentTarget.querySelector('button');
    await submitting(btn, async () => {
      try { const r = await POST('/api/wa/test', { text: t, history }); history = r.history; add(r.reply); }
      catch (err) { add(`⚠ ${err.message || 'Falha de conexão.'}`); }
    }).catch(() => {});
  };
}

/** Aviso mostrado antes de conectar: a conexão não é a oficial do WhatsApp. */
const RISK = `<div class="alert warn" role="note" style="margin-bottom:12px"><span class="a-ic">${ic('alert', 18)}</span><span><b>Antes de conectar, saiba:</b>
  <ul style="margin:6px 0 0;padding-left:18px;line-height:1.5">
    <li>Esta conexão <b>não é a oficial do WhatsApp</b> (funciona como o WhatsApp Web). Por isso existe um <b>pequeno risco de o número ser bloqueado</b>, e ninguém pode garantir que isso nunca aconteça.</li>
    <li>Recomendamos conectar um <b>número separado, no WhatsApp Business</b>, e <b>não o seu número pessoal</b>.</li>
    <li>Para reduzir o risco: não use o número para mandar propaganda em massa nem para falar com quem nunca falou com o salão.</li>
  </ul></span></div>`;

function drawConnect(box, root, mode = 'menu', data = null) {
  clearInterval(poll);
  if (mode === 'menu') {
    box.innerHTML = `<div class="card-head"><h2>Conectar o WhatsApp do salão</h2></div>${RISK}
      <div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn primary" data-qr>${ic('grid', 16)} Conectar com QR code</button><button class="btn soft" data-code>${ic('phone', 16)} Conectar com código</button></div>
      <p class="small muted" style="margin-top:8px">QR code: escaneie com outro aparelho. Código: ideal se você só tem um celular (digita o código no próprio WhatsApp).</p>`;
    box.querySelector('[data-qr]').onclick = (e) => submitting(e.currentTarget, async () => drawConnect(box, root, 'qr', await POST('/api/wa/connect', {}))).catch(() => {});
    box.querySelector('[data-code]').onclick = () => drawConnect(box, root, 'number');
    return;
  }
  if (mode === 'number') {
    box.innerHTML = `<div class="card-head"><h2>Conectar com código</h2></div>${RISK}
      <form data-num><label class="field"><span>Número do WhatsApp do salão (com DDD)</span><input name="n" type="tel" inputmode="tel" placeholder="(86) 99999-8888" required></label>
      <div class="row" style="gap:8px"><button class="btn primary">Gerar código</button><button type="button" class="btn ghost" data-back>Usar QR code</button></div></form>`;
    box.querySelector('[data-back]').onclick = () => drawConnect(box, root);
    box.querySelector('[data-num]').onsubmit = (e) => {
      e.preventDefault();
      const n = e.currentTarget.n.value;
      submitting(e.currentTarget.querySelector('button'), async () => drawConnect(box, root, 'code', { ...(await POST('/api/wa/connect', { number: n })), number: n })).catch(() => {});
    };
    return;
  }
  if (mode === 'qr') {
    box.innerHTML = `<div class="card-head"><h2>Escaneie o QR code</h2></div>
      ${data?.qr ? `<div class="pix-qr"><img src="${esc(data.qr)}" alt="QR code para conectar o WhatsApp"></div>` : ''}
      <p class="small muted" style="text-align:center">No celular do salão: WhatsApp → <b>Aparelhos conectados</b> → <b>Conectar aparelho</b> → aponte para o QR. Ele muda a cada ~40 s.</p>
      <p style="text-align:center;margin-top:8px"><button class="btn sm soft" data-again>Gerar outro QR</button></p>`;
    box.querySelector('[data-again]').onclick = (e) => submitting(e.currentTarget, async () => drawConnect(box, root, 'qr', await POST('/api/wa/connect', {}))).catch(() => {});
  }
  if (mode === 'code') {
    box.innerHTML = `<div class="card-head"><h2>Seu código</h2></div>
      <p style="text-align:center;font-size:30px;font-weight:800;letter-spacing:.2em;user-select:all">${esc(data?.code || '')}</p>
      <ol class="small" style="margin:10px auto 0;max-width:420px;padding-left:20px;line-height:1.6">
        <li>Abra o <b>WhatsApp do salão</b> (pode ser neste mesmo celular).</li>
        <li>Toque em <b>⋮</b> ou <b>Configurações</b> → <b>Aparelhos conectados</b> → <b>Conectar aparelho</b>.</li>
        <li>Toque em <b>Conectar com número de telefone</b> e digite o código acima.</li></ol>
      <p style="text-align:center;margin-top:8px"><button class="btn sm soft" data-again>Gerar outro código</button></p>`;
    box.querySelector('[data-again]').onclick = (e) => submitting(e.currentTarget, async () => drawConnect(box, root, 'code', { ...(await POST('/api/wa/connect', { number: data.number })), number: data.number })).catch(() => {});
  }
  // espera conectar (a cada 3 s, por até 5 min)
  const started = Date.now();
  poll = setInterval(async () => {
    if (!document.body.contains(box) || Date.now() - started > 5 * 60e3) return clearInterval(poll);
    try {
      const s = await GET('/api/wa/status');
      if (s.state === 'open') { clearInterval(poll); toast('WhatsApp conectado! 💜'); whatsapp(root); }
    } catch {}
  }, 3000);
}
