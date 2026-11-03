exports.shorthands = undefined;

exports.up = (pgm) => {
  // Profiilikuva: emoji + taustaväri, tai oma kuva (pieni data-URL)
  pgm.addColumns('users', {
    avatar_emoji: { type: 'varchar(16)' },
    avatar_color: { type: 'varchar(16)' },
    avatar_image: { type: 'text' },
  });

  // Pelin voittaja talteen, jotta profiilin voittotilasto on tarkka myös luovutusvoitoissa
  pgm.addColumns('games', {
    winner_user_id: { type: 'integer', references: 'users', onDelete: 'set null' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('games', ['winner_user_id']);
  pgm.dropColumns('users', ['avatar_emoji', 'avatar_color', 'avatar_image']);
};
