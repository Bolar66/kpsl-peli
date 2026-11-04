exports.shorthands = undefined;

// Lippuvisa: pelatut pelit ja pelaajien tulokset (tilastot, ennätykset, keskinäiset ottelut)
exports.up = (pgm) => {
  pgm.createTable('flag_games', {
    id: 'id',
    room_code: { type: 'varchar(4)', notNull: true },
    level: { type: 'varchar(20)', notNull: true }, // tourist | backpacker | globetrotter | lottery
    question_count: { type: 'integer', notNull: true },
    solo: { type: 'boolean', notNull: true, default: false },
    winner_user_id: { type: 'integer', references: 'users', onDelete: 'set null' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('flag_games', 'room_code');

  pgm.createTable('flag_game_players', {
    id: 'id',
    game_id: { type: 'integer', notNull: true, references: 'flag_games', onDelete: 'cascade' },
    user_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'cascade' },
    score: { type: 'integer', notNull: true, default: 0 },
    correct: { type: 'integer', notNull: true, default: 0 },
    half: { type: 'integer', notNull: true, default: 0 },
    answered: { type: 'integer', notNull: true, default: 0 },
    // Oikeiden vastausten yhteenlaskettu vastausaika (keskimääräistä vastausaikaa varten)
    answer_ms: { type: 'bigint', notNull: true, default: 0 },
    placement: { type: 'integer', notNull: true, default: 1 },
  });
  pgm.addConstraint('flag_game_players', 'flag_game_players_unique', { unique: ['game_id', 'user_id'] });
  pgm.createIndex('flag_game_players', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropTable('flag_game_players');
  pgm.dropTable('flag_games');
};
