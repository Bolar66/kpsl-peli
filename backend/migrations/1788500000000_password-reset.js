exports.shorthands = undefined;

// Salasanan palautus: valinnainen sähköposti tunnukseen ja kertakäyttöiset palautuslinkit
exports.up = (pgm) => {
  pgm.addColumns('users', {
    email: { type: 'varchar(254)' },
  });
  // Sama sähköposti vain yhdelle tunnukselle (kirjainkoosta riippumatta)
  pgm.createIndex('users', 'LOWER(email)', { name: 'users_email_lower_unique', unique: true, where: 'email IS NOT NULL' });

  pgm.createTable('password_resets', {
    id: 'id',
    user_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'cascade' },
    // Tietokantaan tallennetaan vain linkin tunnisteen tiiviste, ei itse tunnistetta
    token_hash: { type: 'varchar(64)', notNull: true, unique: true },
    expires_at: { type: 'timestamptz', notNull: true },
    used_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('password_resets');
  pgm.dropIndex('users', 'LOWER(email)', { name: 'users_email_lower_unique' });
  pgm.dropColumns('users', ['email']);
};
