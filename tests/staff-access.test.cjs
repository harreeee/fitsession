const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

let db;
const ids = {
  admin: crypto.randomUUID(),
  trainer: crypto.randomUUID(),
  nutrition: crypto.randomUUID(),
};

async function root() {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',false)");
}

async function actor(id) {
  await root();
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
}

before(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync('tests/base-schema.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20260907202306_core_booking_repair.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20260908003000_staff_feature_access.sql', 'utf8'));
  await db.query(
    "insert into profiles(id,role,full_name) values($1,'admin','Admin'),($2,'trainer','Trainer'),($3,'nutrition_coach','Nutrition')",
    [ids.admin, ids.trainer, ids.nutrition],
  );
});

after(async () => {
  await db.close();
});

test('granular staff permissions default to false', async () => {
  await root();
  const { rows } = await db.query(
    'select can_view_revenue, can_view_clients, can_view_booked_calendar from profiles where id=$1',
    [ids.trainer],
  );
  assert.deepEqual(rows[0], {
    can_view_revenue: false,
    can_view_clients: false,
    can_view_booked_calendar: false,
  });
});

test('trainer cannot self-enable granular permissions', async () => {
  await actor(ids.trainer);
  await assert.rejects(
    db.query('update profiles set can_view_revenue=true where id=$1', [ids.trainer]),
    /Access fields can only be changed by an administrator/,
  );
});

test('nutrition coach cannot self-enable granular permissions', async () => {
  await actor(ids.nutrition);
  await assert.rejects(
    db.query('update profiles set can_view_clients=true where id=$1', [ids.nutrition]),
    /Access fields can only be changed by an administrator/,
  );
});

test('service backend can grant granular permissions', async () => {
  await root();
  const { rows } = await db.query(
    'update profiles set can_view_revenue=true, can_view_clients=true, can_view_booked_calendar=true where id=$1 returning can_view_revenue, can_view_clients, can_view_booked_calendar',
    [ids.trainer],
  );
  assert.equal(rows[0].can_view_revenue, true);
  assert.equal(rows[0].can_view_clients, true);
  assert.equal(rows[0].can_view_booked_calendar, true);
});

test('trainer still cannot change protected role or manager access', async () => {
  await actor(ids.trainer);
  await assert.rejects(
    db.query("update profiles set role='admin' where id=$1", [ids.trainer]),
    /Access fields can only be changed by an administrator/,
  );
});
