/**
 * Creates (or promotes) an ADMIN account.
 * Usage:  npm run create-admin -- admin@example.com "StrongPass123" "Admin Name"
 */
const { connectDB, disconnectDB } = require('../src/config/db');
const { User } = require('../src/models');
const { hashPassword } = require('../src/utils/password');

async function main() {
  const [email, password, name = 'Administrator'] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: npm run create-admin -- <email> <password> [name]');
    process.exit(1);
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    console.error('Password must be at least 8 characters and contain a letter and a number.');
    process.exit(1);
  }

  await connectDB();
  const normalized = email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalized });
  if (existing) {
    existing.role = 'ADMIN';
    existing.isActive = true;
    existing.password = await hashPassword(password);
    await existing.save();
    console.log(`Existing user ${normalized} promoted to ADMIN and password updated.`);
  } else {
    await User.create({ name, email: normalized, password: await hashPassword(password), role: 'ADMIN' });
    console.log(`Admin ${normalized} created.`);
  }
  await disconnectDB();
}

main().catch(async (err) => {
  console.error('Failed:', err.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
