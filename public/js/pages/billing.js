// Assinatura do Vyllorri: situação, plano e pagamento da mensalidade por Pix (QR Code).
import { state, GET, POST, esc, money, fmtDate, ic, pageHead, toast, fail, submitting, can } from '../core.js';

let poll = null;

export default async function billing(root) {
  clearInterval(poll);
  const b = await GET('/api/billing');
  const owner = can.owner();
  const head = {
    comp: 'Acesso liberado',
    trial: `Teste grátis · ${b.days_left === 1 ? 'último dia' : `faltam ${b.days_left} dias`}`,
    active: b.overdue ? 'Mensalidade vencida' : `Ativa · paga até ${fmtDate(b.paid_until)}`,
    blocked: b.reason === 'overdue' ? 'Mensalidade em atraso' : 'Seu teste grátis terminou',
  }[b.status];
  const other = b.plan.key === 'solo' ? b.plans.team : b.plans.solo;
  root.innerHTML = `${pageHead('Assinatura', head)}
    ${b.blocked ? `<div class="alert warn"><span class="a-ic">${ic('lock', 18)}</span><span><b>O acesso está pausado e a página de agendamento das clientes também.</b> Seus dados estão guardados: nada foi apagado. ${owner ? 'Pague a mensalidade com Pix e tudo volta na hora.' : 'Peça para a proprietária do salão renovar a assinatura.'}</span></div>` : ''}
    ${b.status === 'comp' ? `<div class="card">${ic('checkCircle', 22, 'ok-t')} <b>Este salão tem acesso liberado.</b><p class="small muted" style="margin-top:6px">Não há mensalidade a pagar.</p></div>` : `
    <div class="grid g2">
      <div class="card plan-card">
        <span class="tag">Seu plano</span>
        <h2 style="margin-top:10px">${esc(b.plan.name)}</h2>
        <p class="plan-price"><b>${money(b.plan.price_cents)}</b><span>/mês</span></p>
        <ul class="plan-list">${['Agenda e agendamento online 24h', 'Clientes, vendas e comissões', 'Financeiro e relatórios', 'Sinal por Pix e atendimento a domicílio', 'Notificações no celular'].map((t) => `<li>${ic('check', 16)} ${t}</li>`).join('')}</ul>
        <p class="tiny muted" style="margin-top:12px">O plano segue o modo de trabalho (Configurações → Salão). ${b.plan.key === 'solo' ? `Com equipe: ${money(other.price_cents)}/mês.` : `Trabalhando sozinha: ${money(other.price_cents)}/mês.`}</p>
      </div>
      <div class="card" data-pay></div>
    </div>
    ${b.last_paid ? `<p class="legend">Último pagamento: ${money(b.last_paid.amount_cents)} em ${fmtDate(b.last_paid.paid_at)}.</p>` : ''}`}`;
  const box = root.querySelector('[data-pay]');
  if (box) drawPay(box, b, owner);
}

function drawPay(box, b, owner) {
  clearInterval(poll);
  if (!owner) {
    box.innerHTML = `<h2>Pagamento</h2><p class="small muted" style="margin-top:8px">Só a proprietária do salão pode pagar a mensalidade.</p>`;
    return;
  }
  if (b.pix) {
    box.innerHTML = `<h2>Pague com Pix</h2>
      <p class="small muted" style="margin:6px 0 12px">Abra o app do seu banco, escolha <b>Pix → Ler QR Code</b> e aponte para o código. Ou use o <b>copia e cola</b>.</p>
      <div class="pix-qr"><img src="data:image/png;base64,${esc(b.pix.qr_base64)}" alt="QR Code Pix de ${money(b.pix.amount_cents)}"></div>
      <p class="pix-amount">${money(b.pix.amount_cents)}</p>
      <div class="pix-copy"><input readonly value="${esc(b.pix.qr_code)}" aria-label="Pix copia e cola"><button class="btn soft" data-copy>${ic('copy', 16)} Copiar</button></div>
      <p class="pix-wait"><span class="spin"></span> Aguardando o pagamento… a confirmação é automática.</p>
      <p class="tiny muted" style="text-align:center;margin-top:6px">O código vale até ${fmtDate(b.pix.expires_at)} às ${b.pix.expires_at.slice(11, 16)}.</p>`;
    box.querySelector('[data-copy]').onclick = async (e) => {
      try {
        await navigator.clipboard.writeText(b.pix.qr_code);
      } catch {
        box.querySelector('.pix-copy input').select();
        document.execCommand('copy');
      }
      e.currentTarget.innerHTML = `${ic('check', 16)} Copiado`;
      toast('Código Pix copiado. Cole no app do banco.');
    };
    const started = Date.now();
    poll = setInterval(async () => {
      if (!document.body.contains(box) || Date.now() - started > 30 * 60e3) return clearInterval(poll);
      try {
        const n = await GET('/api/billing');
        if (!n.pix || n.pix.id !== b.pix.id) {
          clearInterval(poll);
          if (n.paid_until && n.paid_until !== b.paid_until) {
            state.user.billing = n;
            toast('Pagamento confirmado! Obrigada 💜');
            location.hash = '#/';
            location.reload();
          } else drawPay(box, n, owner);
        }
      } catch {}
    }, 5000);
    return;
  }
  const label = b.status === 'trial' ? 'Assinar agora' : b.status === 'active' && !b.overdue && !b.due_soon ? 'Adiantar a próxima mensalidade' : 'Pagar mensalidade';
  box.innerHTML = `<h2>Pagamento</h2>
    <div class="pix-how">
      <div>${ic('zap', 18)}<span><b>Pix na hora</b><small>Gere o QR Code e pague pelo app do banco.</small></span></div>
      <div>${ic('checkCircle', 18)}<span><b>Liberação automática</b><small>Confirmamos o pagamento sozinhos, sem enviar comprovante.</small></span></div>
      <div>${ic('bell', 18)}<span><b>Lembrete antes de vencer</b><small>Avisamos aqui no app ${b.status === 'trial' ? 'antes do teste acabar' : '5 dias antes do vencimento'}.</small></span></div>
    </div>
    ${b.status === 'trial' ? `<p class="small muted" style="margin:12px 0">Assinando agora você não perde os dias grátis: a mensalidade começa a contar depois de ${fmtDate(b.trial_ends_at)}.</p>` : ''}
    ${b.online ? `<button class="btn primary block" data-pix style="height:52px;margin-top:12px">${ic('zap', 18)} ${label} · ${money(b.plan.price_cents)} no Pix</button>`
      : `<p class="small warn-t" style="margin-top:12px">O pagamento por Pix está sendo configurado. Volte em breve ou fale com o suporte do Vyllorri.</p>`}`;
  box.querySelector('[data-pix]')?.addEventListener('click', async (e) => {
    await submitting(e.currentTarget, async () => {
      const pix = await POST('/api/billing/pix');
      drawPay(box, { ...b, pix }, owner);
    }).catch(() => {});
  });
}
