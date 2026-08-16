import "dotenv/config";
import { prisma } from "./db.js";
import { hashPassword } from "./auth.js";

async function main() {
  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      name: "Finance Admin",
      role: "ADMIN",
    },
  });

  const categories = [
    { name: "Travel", spendingLimitPerExpense: 2000 },
    { name: "Meals & Entertainment", spendingLimitPerExpense: 200 },
    { name: "Office Supplies", spendingLimitPerExpense: 500 },
    { name: "Software & Subscriptions", spendingLimitPerExpense: 1000 },
    { name: "Accommodation", spendingLimitPerExpense: 1500 },
    { name: "Other", spendingLimitPerExpense: null },
  ];
  for (const c of categories) {
    await prisma.expenseCategory.upsert({
      where: { name: c.name },
      update: {},
      create: c,
    });
  }

  console.log(`Seeded. Admin login: ${adminEmail} / ${adminPassword}`);
  console.log(`Admin user id: ${admin.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
