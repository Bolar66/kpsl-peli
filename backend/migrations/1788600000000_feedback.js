exports.shorthands = undefined;

// Pelaajien palaute (bugit, ideat). Tunnuksen poisto jättää palautteen, mutta irrottaa sen käyttäjästä.
exports.up = (pgm) => {
  pgm.createTable('feedback', {
    id: 'id',
    user_id: { type: 'integer', references: 'users', onDelete: 'set null' },
    category: { type: 'varchar(10)', notNull: true },
    message: { type: 'text', notNull: true },
    // Laite ja sivu auttavat bugien selvittämisessä
    page: { type: 'varchar(200)' },
    user_agent: { type: 'varchar(300)' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('feedback');
};
