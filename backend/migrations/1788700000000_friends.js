exports.shorthands = undefined;

// Kaverit: kaverikoodi, julkinen profiili (bio ja taustakuva), kaverisuhteet, push-tilaukset
// sekä kierrosvalintojen lopputulos aikavälikohtaisia tilastoja varten.
exports.up = (pgm) => {
  pgm.addColumns('users', {
    // Kuusi merkkiä ilman väliviivaa (näytetään muodossa K7M-4QX). Annetaan tunnukselle ensimmäisellä tarpeella.
    friend_code: { type: 'varchar(6)', unique: true },
    bio: { type: 'varchar(80)' },
    banner_image: { type: 'text' },
  });

  pgm.createTable('friendships', {
    id: 'id',
    requester_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'cascade' },
    addressee_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'cascade' },
    status: { type: 'varchar(10)', notNull: true, default: 'pending' }, // 'pending' | 'accepted'
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    accepted_at: { type: 'timestamptz' },
  });
  // Sama pari vain kerran, kumpaan suuntaan tahansa
  pgm.createIndex('friendships', ['LEAST(requester_id, addressee_id)', 'GREATEST(requester_id, addressee_id)'], {
    name: 'friendships_pair_unique', unique: true,
  });
  pgm.createIndex('friendships', 'addressee_id');

  pgm.createTable('push_subscriptions', {
    id: 'id',
    user_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'cascade' },
    endpoint: { type: 'text', notNull: true, unique: true },
    p256dh: { type: 'text', notNull: true },
    auth: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('push_subscriptions', 'user_id');

  // 'win' | 'loss' | 'draw'; vanhoilla riveillä tyhjä
  pgm.addColumns('round_picks', { outcome: { type: 'varchar(4)' } });
};

exports.down = (pgm) => {
  pgm.dropColumns('round_picks', ['outcome']);
  pgm.dropTable('push_subscriptions');
  pgm.dropTable('friendships');
  pgm.dropColumns('users', ['friend_code', 'bio', 'banner_image']);
};
