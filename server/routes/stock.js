import { route, HttpError, OWNER, STAFF, ALL } from '../http.js';
import { V } from '../validate.js';
import { all, get, run, tx } from '../db.js';
import { nowStr } from '../util.js';

// 'retail' = vendido às clientes; 'internal' = material usado nos procedimentos (nunca entra em vendas)
route('GET', '/api/products', ALL, ({ query, sid }) => {
  const where = ['salon_id=?'];
  const p = [sid];
  if (!query.all) where.push('active=1');
  if (query.kind) (where.push('kind=?'), p.push(V.oneOf(query.kind, ['retail', 'internal'], 'Tipo')));
  if (query.low) where.push('stock<=min_stock');
  return all(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY active DESC, name`, ...p);
});

function fields(b) {
  return {
    name: V.str(b.name, 'Nome', { req: true, max: 80 }),
    kind: V.oneOf(b.kind, ['retail', 'internal'], 'Tipo', { req: true }),
    unit: V.str(b.unit, 'Unidade', { max: 10 }) || 'un',
    price: V.cents(b.price_cents ?? 0, 'Preço de venda') || 0,
    cost: V.cents(b.cost_cents ?? 0, 'Custo') || 0,
    min: V.num(b.min_stock ?? 0, 'Estoque mínimo', { min: 0 }) || 0,
    cpct: V.num(b.commission_pct, 'Comissão (%)', { min: 0, max: 100 }),
  };
}
route('POST', '/api/products', OWNER, ({ body, sid, user }) =>
  tx(() => {
    const f = fields(body);
    const stock = V.num(body.stock ?? 0, 'Estoque inicial', { min: 0 }) || 0;
    const id = run('INSERT INTO products(salon_id,name,kind,unit,price_cents,cost_cents,stock,min_stock,commission_pct) VALUES(?,?,?,?,?,?,?,?,?)',
      sid, f.name, f.kind, f.unit, f.price, f.cost, stock, f.min, f.cpct).id;
    if (stock) run('INSERT INTO stock_moves(salon_id,product_id,type,qty,note,created_by,created_at) VALUES(?,?,?,?,?,?,?)', sid, id, 'in', stock, 'Estoque inicial', user.id, nowStr());
    return { id };
  }));
route('PUT', '/api/products/:id', OWNER, ({ params, body, sid }) => {
  if (!get('SELECT 1 x FROM products WHERE id=? AND salon_id=?', params.id, sid)) throw new HttpError(404, 'Produto não encontrado.');
  const f = fields(body);
  run('UPDATE products SET name=?,kind=?,unit=?,price_cents=?,cost_cents=?,min_stock=?,commission_pct=?,active=? WHERE id=?',
    f.name, f.kind, f.unit, f.price, f.cost, f.min, f.cpct, V.bool(body.active ?? 1), params.id);
  return { ok: true };
});

/** Movimentação manual: entrada (compra), saída (perda/quebra), uso interno, ou ajuste para contagem. */
route('POST', '/api/products/:id/moves', STAFF, ({ params, body, sid, user }) =>
  tx(() => {
    const p = get('SELECT * FROM products WHERE id=? AND salon_id=?', params.id, sid);
    if (!p) throw new HttpError(404, 'Produto não encontrado.');
    const type = V.oneOf(body.type, ['in', 'out', 'use', 'adjust'], 'Tipo', { req: true });
    const q = V.num(body.qty, type === 'adjust' ? 'Quantidade contada' : 'Quantidade', { req: true, min: type === 'adjust' ? 0 : 0.01, max: 100000 });
    const delta = type === 'adjust' ? q - p.stock : type === 'in' ? q : -q;
    if (p.stock + delta < 0) throw new HttpError(409, `Estoque insuficiente (atual: ${p.stock} ${p.unit}).`);
    if (!delta) throw new HttpError(400, 'O estoque já está nessa quantidade.');
    run('UPDATE products SET stock=stock+? WHERE id=?', delta, p.id);
    run('INSERT INTO stock_moves(salon_id,product_id,type,qty,note,created_by,created_at) VALUES(?,?,?,?,?,?,?)',
      sid, p.id, type, delta, V.str(body.note, 'Observação', { max: 200 }), user.id, nowStr());
    if (type === 'in' && body.expense_cents) {
      // compra registrada já como despesa paga, para o financeiro ficar correto
      const amount = V.cents(body.expense_cents, 'Valor pago', { min: 1 });
      run('INSERT INTO expenses(salon_id,description,category,amount_cents,due_date,paid_at,method,created_at) VALUES(?,?,?,?,?,?,?,?)',
        sid, `Compra: ${p.name}`, 'Produtos', amount, nowStr().slice(0, 10), nowStr().slice(0, 10), V.str(body.method, 'Forma', { max: 30 }), nowStr());
    }
    return get('SELECT * FROM products WHERE id=?', p.id);
  }));

route('GET', '/api/stock/moves', STAFF, ({ query, sid }) => {
  const where = ['m.salon_id=?'];
  const p = [sid];
  if (query.product_id) (where.push('m.product_id=?'), p.push(V.int(query.product_id, 'Produto')));
  return all(`SELECT m.*, pr.name AS product_name, pr.unit, u.name AS user_name FROM stock_moves m JOIN products pr ON pr.id=m.product_id
               LEFT JOIN users u ON u.id=m.created_by WHERE ${where.join(' AND ')} ORDER BY m.id DESC LIMIT 300`, ...p);
});
