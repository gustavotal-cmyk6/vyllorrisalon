// Assinatura do Vyllorri: situação, gerar Pix da mensalidade e aviso de pagamento do Mercado Pago.
import { route, OWNER, ALL } from '../http.js';
import { salonBilling, createPix, handleWebhook, PLANS, TRIAL_DAYS } from '../billing.js';

route('GET', '/api/billing', ALL, async ({ sid }) => ({ ...(await salonBilling(sid)), plans: PLANS, trial_days: TRIAL_DAYS }));
route('POST', '/api/billing/pix', OWNER, async ({ sid, user, req }) => createPix(sid, user, req));
// planos e preços para a página de apresentação (sem login)
route('GET', '/api/plans', null, async () => ({ plans: PLANS, trial_days: TRIAL_DAYS }));
route('POST', '/api/billing/webhook', null, async ({ query, body }) => handleWebhook(query, body));
