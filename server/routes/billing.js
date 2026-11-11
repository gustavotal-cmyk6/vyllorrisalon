// Assinatura do Vyllorri: situação, gerar Pix da mensalidade e aviso de pagamento do Mercado Pago.
import { route, OWNER, ALL } from '../http.js';
import { salonBilling, createPix, handleWebhook, setWantPro, PLANS, PRO_ADDON_CENTS, TRIAL_DAYS } from '../billing.js';

route('GET', '/api/billing', ALL, async ({ sid }) => ({ ...(await salonBilling(sid)), plans: PLANS, pro_cents: PRO_ADDON_CENTS, trial_days: TRIAL_DAYS }));
// plano Pro (WhatsApp automático): liga/desliga para a próxima mensalidade
route('POST', '/api/billing/pro', OWNER, async ({ sid, body }) => ({ ...(await setWantPro(sid, !!body.want)), plans: PLANS, pro_cents: PRO_ADDON_CENTS, trial_days: TRIAL_DAYS }));
route('POST', '/api/billing/pix', OWNER, async ({ sid, user, req }) => createPix(sid, user, req));
// planos e preços para a página de apresentação (sem login)
route('GET', '/api/plans', null, async () => ({ plans: PLANS, pro_cents: PRO_ADDON_CENTS, trial_days: TRIAL_DAYS }));
route('POST', '/api/billing/webhook', null, async ({ query, body }) => handleWebhook(query, body));
