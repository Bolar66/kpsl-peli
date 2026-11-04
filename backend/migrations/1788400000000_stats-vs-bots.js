exports.shorthands = undefined;

// Tilastot erotellaan sen mukaan, pelattiinko kavereita vai pelkkiä botteja vastaan.
// Vanhat rivit jäävät kavereita vastaan pelatuiksi (vs_bots = false), koska tietoa ei ole tallessa.
exports.up = (pgm) => {
  pgm.addColumns('stats', {
    vs_bots: { type: 'boolean', notNull: true, default: false },
  });
  pgm.dropConstraint('stats', 'unique_user_mode_symbol');
  pgm.addConstraint('stats', 'unique_user_mode_symbol_opponent', {
    unique: ['user_id', 'mode', 'symbol', 'vs_bots'],
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('stats', 'unique_user_mode_symbol_opponent');
  pgm.sql('DELETE FROM stats WHERE vs_bots = true');
  pgm.dropColumns('stats', ['vs_bots']);
  pgm.addConstraint('stats', 'unique_user_mode_symbol', { unique: ['user_id', 'mode', 'symbol'] });
};
