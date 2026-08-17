-- CreateTable
CREATE TABLE "ExchangeRate" (
    "currency" TEXT NOT NULL PRIMARY KEY,
    "rateToSgd" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
