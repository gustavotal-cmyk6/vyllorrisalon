// Comparação dos planos (landing e tela de Assinatura usam a mesma tabela).
import { ic, money } from './core.js';

export const PLAN_ROWS = [
  ['Profissionais na agenda', '1 (você)', 'Até 5 inclusas'],
  ['Profissional extra', '—', '+ R$ 9,90/mês cada'],
  ['Acessos ao painel', 'Só você', 'Recepção, gerente e cada profissional'],
  ['Agenda separada por profissional', false, true],
  ['Comissões calculadas sozinhas', false, true],
  ['Relatórios por profissional', false, true],
  ['Página do salão com sua logo, fotos e cores', true, true],
  ['Agendamento online 24h', true, true],
  ['Sinal por Pix e atendimento a domicílio', true, true],
  ['Clientes, vendas, financeiro e estoque', true, true],
  ['Avisos no celular', true, true],
];

const cell = (v) => (v === true ? `<span class="pc-yes" aria-label="Incluso">${ic('check', 16)}</span>` : v === false ? '<span class="pc-no" aria-label="Não incluso">—</span>' : v);

/** Tabela "Individual × Com equipe". current: 'solo' | 'team' destaca a coluna do plano atual. */
export function planTable(plans, current = '') {
  return `<div class="pc-wrap"><table class="pc">
    <thead><tr><th></th>
      <th class="${current === 'solo' ? 'cur' : ''}">Individual<small>${money(plans.solo.price_cents)}/mês</small></th>
      <th class="${current === 'team' ? 'cur' : ''}">Com equipe<small>${money(plans.team.price_cents)}/mês</small></th></tr></thead>
    <tbody>${PLAN_ROWS.map(([label, a, b]) => `<tr><td>${label}</td><td class="${current === 'solo' ? 'cur' : ''}">${cell(a)}</td><td class="${current === 'team' ? 'cur' : ''}">${cell(b)}</td></tr>`).join('')}</tbody>
  </table></div>`;
}
