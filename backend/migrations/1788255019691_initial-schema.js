exports.shorthands = undefined;

exports.up = (pgm) => {
  // Käyttäjät
  pgm.createTable('users', {
    id: 'id',
    username: { type: 'varchar(50)', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Pelihuoneet
  pgm.createTable('games', {
    id: 'id',
    room_code: { type: 'varchar(4)', notNull: true, unique: true },
    mode: { type: 'varchar(20)', notNull: true }, // 'classic' | 'extended'
    status: { type: 'varchar(20)', notNull: true, default: 'lobby' }, // 'lobby' | 'playing' | 'finished'
    wins_required: { type: 'integer', notNull: true, default: 3 },
    host_user_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'cascade' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Pelaajat pelissä
  pgm.createTable('game_players', {
    id: 'id',
    game_id: { type: 'integer', notNull: true, references: 'games', onDelete: 'cascade' },
    user_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'cascade' },
    joined_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    is_connected: { type: 'boolean', notNull: true, default: true },
    wins: { type: 'integer', notNull: true, default: 0 },
  });
  pgm.addConstraint('game_players', 'unique_game_user', {
    unique: ['game_id', 'user_id'],
  });

  // Kierrokset
  pgm.createTable('rounds', {
    id: 'id',
    game_id: { type: 'integer', notNull: true, references: 'games', onDelete: 'cascade' },
    round_number: { type: 'integer', notNull: true },
    resolved_at: { type: 'timestamptz' },
  });

  // Kierroksen valinnat
  pgm.createTable('round_picks', {
    id: 'id',
    round_id: { type: 'integer', notNull: true, references: 'rounds', onDelete: 'cascade' },
    user_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'cascade' },
    symbol: { type: 'varchar(20)', notNull: true }, // 'rock' | 'paper' | 'scissors' | 'lizard' | 'spock'
    is_bot_pick: { type: 'boolean', notNull: true, default: false },
    submitted_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Tilastot per käyttäjä ja per merkki
  pgm.createTable('stats', {
    id: 'id',
    user_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'cascade' },
    mode: { type: 'varchar(20)', notNull: true },
    symbol: { type: 'varchar(20)', notNull: true },
    count: { type: 'integer', notNull: true, default: 0 },
    wins: { type: 'integer', notNull: true, default: 0 },
    losses: { type: 'integer', notNull: true, default: 0 },
    draws: { type: 'integer', notNull: true, default: 0 },
  });
  pgm.addConstraint('stats', 'unique_user_mode_symbol', {
    unique: ['user_id', 'mode', 'symbol'],
  });
};

exports.down = (pgm) => {
  pgm.dropTable('stats');
  pgm.dropTable('round_picks');
  pgm.dropTable('rounds');
  pgm.dropTable('game_players');
  pgm.dropTable('games');
  pgm.dropTable('users');
};